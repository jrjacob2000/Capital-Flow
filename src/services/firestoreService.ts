import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  Unsubscribe,
} from 'firebase/firestore';
import {
  db,
  auth,
  OperationType,
  handleFirestoreError,
} from './firebase';
import {
  YearBudgetData,
  SavingsLedgerData,
  BudgetTemplateData,
  EntryFrequency,
  APP_VERSION,
} from '../types/finance';

// Blueprint Validation Synchronicity Constants (from firebase-blueprint.json)
export const OWNER_ID_MAX_LENGTH = 128;
export const OWNER_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
export const FREQUENCY_MAX_LENGTH = 20;
export const CURRENCY_MAX_LENGTH = 10;
export const VERSION_MAX_LENGTH = 32;
export const TIMESTAMP_STR_MAX_LENGTH = 64;
export const KNOWN_YEARS_MAX_SIZE = 20;

const knownExistingWorkspaces = new Set<string>();
const knownExistingBudgetDocs = new Set<string>();

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}
const workspaceMemoryCache = new Map<string, CacheEntry<FirestoreWorkspaceRecord | null>>();
const budgetMemoryCache = new Map<string, CacheEntry<YearBudgetData | null>>();
const inFlightWorkspaceFetches = new Map<string, Promise<FirestoreWorkspaceRecord | null>>();
const inFlightBudgetFetches = new Map<string, Promise<YearBudgetData | null>>();
const CACHE_TTL_MS = 30000; // 30-second hot in-memory cache window

let writeQueue: Promise<void> = Promise.resolve();

function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(task, task);
  writeQueue = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

/**
 * Recursively strips `undefined` properties and sanitizes non-finite numbers (`NaN` / `Infinity`)
 * from objects and arrays so Firestore native maps/lists never throw on imported JSON fields.
 */
export function stripUndefinedDeep<T>(value: T): T {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === 'number') {
    return (Number.isFinite(value) ? value : 0) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (typeof value === 'object' && !(value instanceof Date)) {
    const result: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        result[k] = stripUndefinedDeep(v);
      }
    }
    return result as T;
  }
  return value;
}

export function validateOwnerId(uid: string): string {
  const clean = (uid || '').trim().slice(0, OWNER_ID_MAX_LENGTH);
  if (!clean || !OWNER_ID_PATTERN.test(clean)) {
    throw new Error('Invalid ownerId format for Firestore security rules.');
  }
  return clean;
}

export interface FirestoreWorkspaceRecord {
  ownerId: string;
  activeYear: number;
  frequency: EntryFrequency;
  currency: string;
  knownYears: number[];
  templateData: BudgetTemplateData;
  ledgerData: SavingsLedgerData;
  lastDriveBackupAt?: string;
  updatedAtIso?: string;
}

type WriteStatusListener = (status: { isSyncing: boolean; lastSyncedAt?: string }) => void;
let writeStatusListener: WriteStatusListener | null = null;

function notifyWriteStatus(isSyncing: boolean) {
  if (!writeStatusListener) return;
  writeStatusListener({
    isSyncing,
    lastSyncedAt: isSyncing ? undefined : new Date().toLocaleTimeString(),
  });
}

export class FirestoreSyncService {
  static setWriteStatusListener(listener: WriteStatusListener | null): void {
    writeStatusListener = listener;
  }

  static isAvailable(): boolean {
    return Boolean(db && auth?.currentUser);
  }

  /**
   * Fetches the user's primary workspace document from `/workspaces/{userId}`
   * Employs hot in-memory caching and in-flight request deduplication for high-performance reads.
   */
  static async fetchWorkspace(userId: string, options?: { forceRefresh?: boolean }): Promise<FirestoreWorkspaceRecord | null> {
    if (!db) return null;
    const validUid = validateOwnerId(userId);

    // 1. Hot in-memory cache check
    if (!options?.forceRefresh) {
      const cached = workspaceMemoryCache.get(validUid);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // 2. In-flight fetch deduplication to prevent parallel duplicate network calls
    const inFlight = inFlightWorkspaceFetches.get(validUid);
    if (inFlight && !options?.forceRefresh) {
      return inFlight;
    }

    const path = `workspaces/${validUid}`;
    const fetchPromise = (async () => {
      try {
        const snap = await getDoc(doc(db, 'workspaces', validUid));
        if (!snap.exists()) {
          knownExistingWorkspaces.delete(validUid);
          workspaceMemoryCache.set(validUid, { data: null, timestamp: Date.now() });
          return null;
        }
        knownExistingWorkspaces.add(validUid);
        const data = snap.data();
        const updatedAtIso =
          data.updatedAt && typeof data.updatedAt.toDate === 'function'
            ? data.updatedAt.toDate().toISOString()
            : undefined;
        const record: FirestoreWorkspaceRecord = {
          ownerId: data.ownerId,
          activeYear: typeof data.activeYear === 'number' ? data.activeYear : 2026,
          frequency: data.frequency === 'bi-weekly' ? 'bi-weekly' : 'monthly',
          currency: typeof data.currency === 'string' ? data.currency : '₱',
          knownYears: Array.isArray(data.knownYears) ? data.knownYears : [2026],
          templateData: data.templateData as BudgetTemplateData,
          ledgerData: data.ledgerData as SavingsLedgerData,
          lastDriveBackupAt: data.lastDriveBackupAt,
          updatedAtIso,
        };
        workspaceMemoryCache.set(validUid, { data: record, timestamp: Date.now() });
        return record;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      } finally {
        inFlightWorkspaceFetches.delete(validUid);
      }
    })();

    inFlightWorkspaceFetches.set(validUid, fetchPromise);
    return fetchPromise;
  }

  /**
   * Internal unqueued implementation for writing `/workspaces/{userId}`
   */
  private static async saveWorkspaceInternal(
    userId: string,
    payload: {
      activeYear?: number;
      frequency?: EntryFrequency;
      currency?: string;
      knownYears?: number[];
      templateData?: BudgetTemplateData;
      ledgerData?: SavingsLedgerData;
      lastDriveBackupAt?: string;
    }
  ): Promise<void> {
    if (!db) return;
    const validUid = validateOwnerId(userId);
    const path = `workspaces/${validUid}`;
    const docRef = doc(db, 'workspaces', validUid);

    const safeYear = Math.min(2100, Math.max(2000, Math.round(Number(payload.activeYear) || 2026)));
    const safeFreq: EntryFrequency =
      payload.frequency === 'bi-weekly' ? 'bi-weekly' : 'monthly';
    const safeCurrency = String(payload.currency || '₱').slice(0, CURRENCY_MAX_LENGTH) || '₱';
    const rawYears = Array.isArray(payload.knownYears) && payload.knownYears.length > 0
      ? payload.knownYears
      : [safeYear];
    const safeKnownYears = Array.from(
      new Set(
        rawYears
          .map((y) => Math.min(2100, Math.max(2000, Math.round(Number(y) || safeYear))))
          .filter((y) => Number.isInteger(y))
      )
    ).slice(0, KNOWN_YEARS_MAX_SIZE);
    if (safeKnownYears.length === 0) safeKnownYears.push(safeYear);

    const safeTemplateData = payload.templateData !== undefined ? stripUndefinedDeep(payload.templateData) : undefined;
    const safeLedgerData = payload.ledgerData !== undefined ? stripUndefinedDeep(payload.ledgerData) : undefined;
    const safeDriveBackupAt = payload.lastDriveBackupAt
      ? String(payload.lastDriveBackupAt).slice(0, TIMESTAMP_STR_MAX_LENGTH)
      : undefined;

    notifyWriteStatus(true);
    try {
      let exists = knownExistingWorkspaces.has(validUid);
      if (!exists) {
        try {
          const snap = await getDoc(docRef);
          exists = snap.exists();
          if (exists) knownExistingWorkspaces.add(validUid);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      }

      if (!exists) {
        try {
          const createDocPayload: Record<string, any> = {
            ownerId: validUid,
            activeYear: safeYear,
            frequency: safeFreq,
            currency: safeCurrency,
            knownYears: safeKnownYears,
            templateData: safeTemplateData || {
              version: '1.0.0',
              lastUpdated: new Date().toISOString(),
              isPersonalizedTemplate: false,
              customCategories: { expense: [], income: [], saving: [] },
              itemTemplates: [],
            },
            ledgerData: safeLedgerData || {
              version: '1.0',
              lastUpdated: new Date().toISOString(),
              currency: safeCurrency,
              initialCapital: 0,
              currentTotalCapital: 0,
              accounts: [],
              transactions: [],
              loans: [],
            },
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          };
          if (safeDriveBackupAt) {
            createDocPayload.lastDriveBackupAt = safeDriveBackupAt;
          }
          await setDoc(docRef, createDocPayload);
          knownExistingWorkspaces.add(validUid);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        try {
          const updateDocPayload: Record<string, any> = {
            updatedAt: serverTimestamp(),
          };
          if (payload.activeYear !== undefined) updateDocPayload.activeYear = safeYear;
          if (payload.frequency !== undefined) updateDocPayload.frequency = safeFreq;
          if (payload.currency !== undefined) updateDocPayload.currency = safeCurrency;
          if (payload.knownYears !== undefined) updateDocPayload.knownYears = safeKnownYears;
          if (safeTemplateData !== undefined) updateDocPayload.templateData = safeTemplateData;
          if (safeLedgerData !== undefined) updateDocPayload.ledgerData = safeLedgerData;
          if (safeDriveBackupAt) {
            updateDocPayload.lastDriveBackupAt = safeDriveBackupAt;
          }
          await updateDoc(docRef, updateDocPayload);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    } finally {
      notifyWriteStatus(false);
    }
  }

  /**
   * Saves or updates the user's primary workspace document in `/workspaces/{userId}`.
   * Serialized through the FIFO write queue to prevent concurrent create/update race conditions.
   */
  static async saveWorkspace(
    userId: string,
    payload: {
      activeYear?: number;
      frequency?: EntryFrequency;
      currency?: string;
      knownYears?: number[];
      templateData?: BudgetTemplateData;
      ledgerData?: SavingsLedgerData;
      lastDriveBackupAt?: string;
    }
  ): Promise<void> {
    return enqueueWrite(() => FirestoreSyncService.saveWorkspaceInternal(userId, payload));
  }

  /**
   * Fetches a specific year's budget document from `/workspaces/{userId}/budgets/{yearId}`
   * Employs hot in-memory caching and in-flight request deduplication for high-performance reads.
   */
  static async fetchAnnualBudget(userId: string, year: number, options?: { forceRefresh?: boolean }): Promise<YearBudgetData | null> {
    if (!db) return null;
    const validUid = validateOwnerId(userId);
    const yearStr = String(Math.min(2100, Math.max(2000, Math.round(Number(year) || 2026))));
    const cacheKey = `${validUid}_${yearStr}`;

    // 1. Hot in-memory cache check
    if (!options?.forceRefresh) {
      const cached = budgetMemoryCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return cached.data;
      }
    }

    // 2. In-flight fetch deduplication to prevent parallel duplicate network calls
    const inFlight = inFlightBudgetFetches.get(cacheKey);
    if (inFlight && !options?.forceRefresh) {
      return inFlight;
    }

    const path = `workspaces/${validUid}/budgets/${yearStr}`;
    const fetchPromise = (async () => {
      try {
        const snap = await getDoc(doc(db, 'workspaces', validUid, 'budgets', yearStr));
        if (!snap.exists()) {
          knownExistingBudgetDocs.delete(cacheKey);
          budgetMemoryCache.set(cacheKey, { data: null, timestamp: Date.now() });
          return null;
        }
        knownExistingBudgetDocs.add(cacheKey);
        const data = snap.data();
        const payload = (data.budgetPayload || {}) as Partial<YearBudgetData>;
        const record: YearBudgetData = {
          year: typeof data.year === 'number' ? data.year : year,
          version: typeof data.version === 'string' ? data.version : APP_VERSION,
          lastUpdated:
            typeof data.lastUpdated === 'string' ? data.lastUpdated : new Date().toISOString(),
          entryMode: data.entryMode === 'bi-weekly' ? 'bi-weekly' : 'monthly',
          currency: typeof data.currency === 'string' ? data.currency : '₱',
          entries: Array.isArray(payload.entries) ? payload.entries : [],
          budgets: Array.isArray(payload.budgets) ? payload.budgets : [],
          customCategories: payload.customCategories,
          itemTemplates: Array.isArray(payload.itemTemplates) ? payload.itemTemplates : [],
          excludedPeriodItems: payload.excludedPeriodItems || {},
          isPersonalizedTemplate: Boolean(payload.isPersonalizedTemplate),
          isDefaultStarterData: Boolean(payload.isDefaultStarterData),
          notes: payload.notes,
        };
        budgetMemoryCache.set(cacheKey, { data: record, timestamp: Date.now() });
        return record;
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, path);
      } finally {
        inFlightBudgetFetches.delete(cacheKey);
      }
    })();

    inFlightBudgetFetches.set(cacheKey, fetchPromise);
    return fetchPromise;
  }

  /**
   * Lists all annual budget years stored in `/workspaces/{userId}/budgets`
   * Uses cached workspace knownYears for instantaneous response when available.
   */
  static async listBudgetYears(userId: string): Promise<number[]> {
    if (!db) return [];
    const validUid = validateOwnerId(userId);

    // Fast-path: Check cached workspace knownYears to avoid costly full-collection scan
    const cachedWs = workspaceMemoryCache.get(validUid)?.data;
    if (cachedWs && Array.isArray(cachedWs.knownYears) && cachedWs.knownYears.length > 0) {
      return [...cachedWs.knownYears].sort((a, b) => b - a);
    }

    const path = `workspaces/${validUid}/budgets`;
    try {
      const q = query(
        collection(db, 'workspaces', validUid, 'budgets'),
        where('ownerId', '==', validUid)
      );
      const snap = await getDocs(q);
      const years: number[] = [];
      snap.forEach((docSnap) => {
        const yr = Number(docSnap.data().year || docSnap.id);
        if (Number.isInteger(yr) && yr >= 2000 && yr <= 2100) {
          knownExistingBudgetDocs.add(`${validUid}_${yr}`);
          years.push(yr);
        }
      });
      return years.sort((a, b) => b - a);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, path);
    }
  }

  /**
   * Internal unqueued implementation for writing `/workspaces/{userId}/budgets/{yearId}`.
   * Automatically ensures the parent `/workspaces/{userId}` document exists first so
   * `isParentWorkspaceOwner(userId)` in `firestore.rules` is always satisfied.
   */
  private static async saveAnnualBudgetInternal(userId: string, budget: YearBudgetData): Promise<void> {
    if (!db) return;
    const validUid = validateOwnerId(userId);
    const safeYear = Math.min(2100, Math.max(2000, Math.round(Number(budget.year) || 2026)));
    const yearStr = String(safeYear);
    const cacheKey = `${validUid}_${yearStr}`;
    const path = `workspaces/${validUid}/budgets/${yearStr}`;
    const docRef = doc(db, 'workspaces', validUid, 'budgets', yearStr);

    // Ensure parent workspace document exists before creating/updating subcollection budget document
    if (!knownExistingWorkspaces.has(validUid)) {
      await FirestoreSyncService.saveWorkspaceInternal(validUid, {
        activeYear: safeYear,
        knownYears: [safeYear],
      });
    }

    const safeVersion = String(budget.version || APP_VERSION).slice(0, VERSION_MAX_LENGTH) || '1.0.0';
    const safeLastUpdated =
      String(budget.lastUpdated || new Date().toISOString()).slice(0, TIMESTAMP_STR_MAX_LENGTH) ||
      new Date().toISOString();
    const safeEntryMode: EntryFrequency =
      budget.entryMode === 'bi-weekly' ? 'bi-weekly' : 'monthly';
    const safeCurrency = String(budget.currency || '₱').slice(0, CURRENCY_MAX_LENGTH) || '₱';

    const budgetPayload = stripUndefinedDeep({
      entries: budget.entries || [],
      budgets: budget.budgets || [],
      customCategories: budget.customCategories || { income: [], expense: [], saving: [] },
      itemTemplates: budget.itemTemplates || [],
      excludedPeriodItems: budget.excludedPeriodItems || {},
      isPersonalizedTemplate: Boolean(budget.isPersonalizedTemplate),
      isDefaultStarterData: Boolean(budget.isDefaultStarterData),
      notes: budget.notes || '',
    });

    notifyWriteStatus(true);
    try {
      let exists = knownExistingBudgetDocs.has(cacheKey);
      if (!exists) {
        try {
          const snap = await getDoc(docRef);
          exists = snap.exists();
          if (exists) knownExistingBudgetDocs.add(cacheKey);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, path);
        }
      }

      if (!exists) {
        try {
          await setDoc(docRef, {
            ownerId: validUid,
            year: safeYear,
            version: safeVersion,
            lastUpdated: safeLastUpdated,
            entryMode: safeEntryMode,
            currency: safeCurrency,
            budgetPayload,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
          knownExistingBudgetDocs.add(cacheKey);
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, path);
        }
      } else {
        try {
          await updateDoc(docRef, {
            version: safeVersion,
            lastUpdated: safeLastUpdated,
            entryMode: safeEntryMode,
            currency: safeCurrency,
            budgetPayload,
            updatedAt: serverTimestamp(),
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, path);
        }
      }
    } finally {
      notifyWriteStatus(false);
    }
  }

  /**
   * Saves or updates a specific year's budget document in `/workspaces/{userId}/budgets/{yearId}`.
   * Serialized through the FIFO write queue.
   */
  static async saveAnnualBudget(userId: string, budget: YearBudgetData): Promise<void> {
    return enqueueWrite(() => FirestoreSyncService.saveAnnualBudgetInternal(userId, budget));
  }

  /**
   * Synchronizes the complete user state (Workspace + Active Year Budget) to Firebase Firestore
   * in the required relational order (Parent Workspace first, then AnnualBudgetDoc subcollection).
   */
  static async syncCompleteState(
    userId: string,
    params: {
      activeYear: number;
      frequency: EntryFrequency;
      knownYears: number[];
      budget: YearBudgetData;
      templateData: BudgetTemplateData;
      ledgerData: SavingsLedgerData;
      lastDriveBackupAt?: string;
    }
  ): Promise<void> {
    if (!db) return;
    return enqueueWrite(async () => {
      await FirestoreSyncService.saveWorkspaceInternal(userId, {
        activeYear: params.activeYear,
        frequency: params.frequency,
        currency: params.budget.currency || params.ledgerData.currency || '₱',
        knownYears: params.knownYears,
        templateData: params.templateData,
        ledgerData: params.ledgerData,
        lastDriveBackupAt: params.lastDriveBackupAt,
      });
      await FirestoreSyncService.saveAnnualBudgetInternal(userId, params.budget);
    });
  }

  /**
   * Subscribes to real-time updates on the user's primary workspace document (`/workspaces/{userId}`)
   */
  static subscribeWorkspace(
    userId: string,
    onUpdate: (workspace: FirestoreWorkspaceRecord) => void
  ): Unsubscribe | null {
    if (!db) return null;
    const validUid = validateOwnerId(userId);
    const path = `workspaces/${validUid}`;
    return onSnapshot(
      doc(db, 'workspaces', validUid),
      (snap) => {
        if (!snap.exists()) return;
        knownExistingWorkspaces.add(validUid);
        const data = snap.data();
        const updatedAtIso =
          data.updatedAt && typeof data.updatedAt.toDate === 'function'
            ? data.updatedAt.toDate().toISOString()
            : undefined;
        const record: FirestoreWorkspaceRecord = {
          ownerId: data.ownerId,
          activeYear: typeof data.activeYear === 'number' ? data.activeYear : 2026,
          frequency: data.frequency === 'bi-weekly' ? 'bi-weekly' : 'monthly',
          currency: typeof data.currency === 'string' ? data.currency : '₱',
          knownYears: Array.isArray(data.knownYears) ? data.knownYears : [2026],
          templateData: data.templateData as BudgetTemplateData,
          ledgerData: data.ledgerData as SavingsLedgerData,
          lastDriveBackupAt: data.lastDriveBackupAt,
          updatedAtIso,
        };
        workspaceMemoryCache.set(validUid, { data: record, timestamp: Date.now() });
        onUpdate(record);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  /**
   * Subscribes to real-time updates on a specific year's annual budget document (`/workspaces/{userId}/budgets/{yearId}`)
   */
  static subscribeAnnualBudget(
    userId: string,
    year: number,
    onUpdate: (budget: YearBudgetData) => void
  ): Unsubscribe | null {
    if (!db) return null;
    const validUid = validateOwnerId(userId);
    const yearStr = String(Math.min(2100, Math.max(2000, Math.round(year))));
    const cacheKey = `${validUid}_${yearStr}`;
    const path = `workspaces/${validUid}/budgets/${yearStr}`;
    return onSnapshot(
      doc(db, 'workspaces', validUid, 'budgets', yearStr),
      (snap) => {
        if (!snap.exists()) return;
        knownExistingBudgetDocs.add(cacheKey);
        const data = snap.data();
        const payload = (data.budgetPayload || {}) as Partial<YearBudgetData>;
        const record: YearBudgetData = {
          year: typeof data.year === 'number' ? data.year : year,
          version: typeof data.version === 'string' ? data.version : APP_VERSION,
          lastUpdated:
            typeof data.lastUpdated === 'string' ? data.lastUpdated : new Date().toISOString(),
          entryMode: data.entryMode === 'bi-weekly' ? 'bi-weekly' : 'monthly',
          currency: typeof data.currency === 'string' ? data.currency : '₱',
          entries: Array.isArray(payload.entries) ? payload.entries : [],
          budgets: Array.isArray(payload.budgets) ? payload.budgets : [],
          customCategories: payload.customCategories,
          itemTemplates: Array.isArray(payload.itemTemplates) ? payload.itemTemplates : [],
          excludedPeriodItems: payload.excludedPeriodItems || {},
          isPersonalizedTemplate: Boolean(payload.isPersonalizedTemplate),
          isDefaultStarterData: Boolean(payload.isDefaultStarterData),
          notes: payload.notes,
        };
        budgetMemoryCache.set(cacheKey, { data: record, timestamp: Date.now() });
        onUpdate(record);
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, path);
      }
    );
  }

  /**
   * Clears all in-memory hot caches (e.g. upon user sign-out).
   */
  static clearMemoryCache(): void {
    workspaceMemoryCache.clear();
    budgetMemoryCache.clear();
    inFlightWorkspaceFetches.clear();
    inFlightBudgetFetches.clear();
  }
}
