import {
  YearBudgetData,
  SavingsLedgerData,
  BudgetTemplateData,
  BudgetEntry,
  SavingsTransaction,
  SavingsAccount,
  EntryType,
  EntryFrequency,
  DriveFileInfo,
  BudgetItemTemplate,
  LoanRecord,
  LoanPayment,
} from '../types/finance';
import {
  getBudgetFileName,
  SAVINGS_LEDGER_FILE_NAME,
  BUDGET_TEMPLATE_FILE_NAME,
  findDriveFile,
  downloadJsonFile,
  saveJsonToDrive,
  listCapitalFlowFiles,
  findCapitalFlowFolder,
  ensureCapitalFlowFolder,
  organizeCapitalFlowFilesInFolder,
  clearDriveFolderCache,
} from './driveService';
import {
  generateInitial2026Budget,
  generateInitialSavingsLedger,
  createEmptyYearBudget,
  MONTH_NAMES,
  BIWEEKLY_PERIODS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVING_CATEGORIES,
  OCT_2026_MIGRATED_ACTUAL_ENTRIES,
  OCT_2026_CUSTOM_EXPENSE_CATEGORIES,
  MIGRATED_2026_ITEM_TEMPLATES,
  normalizeCategoryWording,
  isDefaultStarterTemplateItem,
  stripDefaultStarterTemplates,
  deriveCategoryBudgetsFromTemplates,
  resolveCanonicalSinkingFundName,
  normalizeSavingCategoryGroup,
  DEFAULT_STARTER_EPOCH,
  isDefaultStarterBudget,
  isDefaultStarterTemplateData,
  isDefaultStarterLedger,
} from './sampleData';
import { getPeriodItemExclusionKeys, shouldTemplateDisplayInBudget } from '../utils/budgetCalculations';
import { auth } from './firebase';
import { FirestoreSyncService } from './firestoreService';

const LOCAL_STORAGE_KEY_PREFIX = 'capitalflow_local_budget_';
const LOCAL_STORAGE_KEY_LEDGER = 'capitalflow_local_savings_ledger';
const LOCAL_STORAGE_KEY_YEARS = 'capitalflow_known_years';
const LOCAL_STORAGE_KEY_USER_TEMPLATE = 'capitalflow_user_template_profile';
const LIVE_CLEAN_STORAGE_KEY = 'capitalflow_live_clean_v1';
const OCT_2026_MIGRATION_KEY = 'capitalflow_oct_2026_migrated_v3';
const OCT_2026_TEMPLATE_MIGRATION_KEY = 'capitalflow_oct_2026_template_migrated_v3';

export interface UserTemplateProfile {
  version?: string;
  lastUpdated?: string;
  customCategories: {
    income: string[];
    expense: string[];
    saving: string[];
  };
  itemTemplates: BudgetItemTemplate[];
  isPersonalizedTemplate: boolean;
  isDefaultStarterData?: boolean;
}

export class FinanceStorageService {
  /**
   * When signed into Firebase Firestore, Firestore (with its native IndexedDB persistentLocalCache)
   * is the single source of truth. We keep an in-memory runtime mirror for synchronous reads
   * and purge redundant custom localStorage cache keys to prevent stale data or quota overhead.
   */
  private static cloudMemoryActive: boolean = false;
  private static cloudMemoryBudgets: Map<number, YearBudgetData> = new Map();
  private static cloudMemoryLedger: SavingsLedgerData | null = null;
  private static cloudMemoryTemplateProfile: UserTemplateProfile | null = null;
  private static cloudMemoryKnownYears: number[] = [2026];

  static setCloudSessionActive(active: boolean): void {
    FinanceStorageService.cloudMemoryActive = active;
    if (active) {
      FinanceStorageService.clearRedundantLocalCache();
    }
  }

  static isCloudSessionActive(): boolean {
    return FinanceStorageService.cloudMemoryActive;
  }

  /**
   * Removes redundant custom localStorage cache keys once Firebase Firestore is active,
   * relying on Firestore's built-in IndexedDB persistentLocalCache + real-time listeners instead.
   */
  static clearRedundantLocalCache(): void {
    try {
      if (typeof localStorage === 'undefined') return;
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (
          key &&
          (key.startsWith(LOCAL_STORAGE_KEY_PREFIX) ||
            key === LOCAL_STORAGE_KEY_LEDGER ||
            key === LOCAL_STORAGE_KEY_USER_TEMPLATE ||
            key === LOCAL_STORAGE_KEY_YEARS ||
            key === 'capitalflow_drive_folder_id')
        ) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
    } catch (e) {
      console.warn('Could not clear redundant localStorage cache:', e);
    }
  }

  /**
   * Loads the user's saved personalized template profile from in-memory cloud runtime or localStorage fallback
   */
  static loadUserTemplateProfile(): UserTemplateProfile | null {
    try {
      if (FinanceStorageService.cloudMemoryActive && FinanceStorageService.cloudMemoryTemplateProfile) {
        return JSON.parse(JSON.stringify(FinanceStorageService.cloudMemoryTemplateProfile)) as UserTemplateProfile;
      }
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_USER_TEMPLATE);
      if (!raw) {
        if (FinanceStorageService.cloudMemoryTemplateProfile) {
          return JSON.parse(JSON.stringify(FinanceStorageService.cloudMemoryTemplateProfile)) as UserTemplateProfile;
        }
        return null;
      }
      const parsed = JSON.parse(raw) as UserTemplateProfile;
      if (parsed && Array.isArray(parsed.itemTemplates)) {
        let didUpdateCategories = false;
        const cleanedTemplates: BudgetItemTemplate[] = [];
        stripDefaultStarterTemplates(parsed.itemTemplates).forEach((t) => {
          if (t.type === 'saving') {
            const canonItem = resolveCanonicalSinkingFundName(t.item, t.category);
            const normCat = normalizeSavingCategoryGroup(canonItem, t.category);
            if (canonItem !== t.item || normCat !== t.category) didUpdateCategories = true;
            const existingIdx = cleanedTemplates.findIndex(
              (c) => c.type === 'saving' && c.item.trim().toLowerCase() === canonItem.toLowerCase()
            );
            if (existingIdx >= 0) {
              didUpdateCategories = true;
              if ((t.defaultEstimatedCost || 0) > (cleanedTemplates[existingIdx].defaultEstimatedCost || 0)) {
                cleanedTemplates[existingIdx].defaultEstimatedCost = t.defaultEstimatedCost;
              }
            } else {
              cleanedTemplates.push({ ...t, item: canonItem, category: normCat });
            }
          } else {
            const normCat = normalizeCategoryWording(t.category);
            if (normCat !== t.category) didUpdateCategories = true;
            cleanedTemplates.push({ ...t, category: normCat });
          }
        });
        const hadDefaultItems = cleanedTemplates.length !== parsed.itemTemplates.length;

        const rawExpenseCats =
          Array.isArray(parsed.customCategories?.expense) && parsed.customCategories.expense.length > 1
            ? parsed.customCategories.expense
            : Array.from(new Set([...(parsed.customCategories?.expense || []), ...EXPENSE_CATEGORIES]));
        const normalizedExpenseCats: string[] = [];
        rawExpenseCats.forEach((c) => {
          const norm = normalizeCategoryWording(c);
          if (norm !== c) didUpdateCategories = true;
          if (norm && !normalizedExpenseCats.includes(norm)) {
            normalizedExpenseCats.push(norm);
          }
        });

        const rawIncomeCats =
          Array.isArray(parsed.customCategories?.income) && parsed.customCategories.income.length > 1
            ? parsed.customCategories.income
            : Array.from(new Set([...(parsed.customCategories?.income || []), ...INCOME_CATEGORIES]));
        const normalizedIncomeCats = Array.from(new Set(rawIncomeCats.filter(Boolean)));

        const rawSavingCats = parsed.customCategories?.saving || SAVING_CATEGORIES;
        const normalizedSavingCats: string[] = [...SAVING_CATEGORIES];
        rawSavingCats.forEach((c) => {
          const norm = normalizeSavingCategoryGroup(c, c);
          if (norm !== c) didUpdateCategories = true;
          if (norm && !normalizedSavingCats.includes(norm)) {
            normalizedSavingCats.push(norm);
          }
        });

        const isStarterTpl = isDefaultStarterTemplateData({
          itemTemplates: cleanedTemplates,
          isDefaultStarterData: parsed.isDefaultStarterData,
        });
        const normalizedProfile: UserTemplateProfile = {
          ...parsed,
          lastUpdated: isStarterTpl ? DEFAULT_STARTER_EPOCH : parsed.lastUpdated,
          customCategories: {
            expense: normalizedExpenseCats,
            income: normalizedIncomeCats,
            saving: normalizedSavingCats,
          },
          itemTemplates: cleanedTemplates,
          isPersonalizedTemplate: Boolean(parsed.isPersonalizedTemplate && cleanedTemplates.length > 0),
          isDefaultStarterData: isStarterTpl,
        };
        FinanceStorageService.cloudMemoryTemplateProfile = JSON.parse(JSON.stringify(normalizedProfile));
        if ((hadDefaultItems || didUpdateCategories) && !FinanceStorageService.cloudMemoryActive) {
          localStorage.setItem(LOCAL_STORAGE_KEY_USER_TEMPLATE, JSON.stringify(normalizedProfile));
        }
        return normalizedProfile;
      }
    } catch (e) {
      console.warn('Could not load user template profile:', e);
    }
    return null;
  }

  /**
   * Saves the user's personalized template profile and directly persists to Firebase Firestore when signed in
   */
  static saveUserTemplateProfile(
    profile: UserTemplateProfile,
    options?: { skipFirestoreWrite?: boolean }
  ): BudgetTemplateData {
    const cleanedTemplates: BudgetItemTemplate[] = [];
    stripDefaultStarterTemplates(profile.itemTemplates).forEach((t) => {
      if (t.type === 'saving') {
        const canonItem = resolveCanonicalSinkingFundName(t.item, t.category);
        const normCat = normalizeSavingCategoryGroup(canonItem, t.category);
        const existingIdx = cleanedTemplates.findIndex(
          (c) => c.type === 'saving' && c.item.trim().toLowerCase() === canonItem.toLowerCase()
        );
        if (existingIdx >= 0) {
          if ((t.defaultEstimatedCost || 0) > (cleanedTemplates[existingIdx].defaultEstimatedCost || 0)) {
            cleanedTemplates[existingIdx].defaultEstimatedCost = t.defaultEstimatedCost;
          }
        } else {
          cleanedTemplates.push({ ...t, item: canonItem, category: normCat });
        }
      } else {
        cleanedTemplates.push({ ...t, category: normalizeCategoryWording(t.category) });
      }
    });
    const baseExpenseSource =
      Array.isArray(profile.customCategories?.expense) && profile.customCategories.expense.length > 1
        ? profile.customCategories.expense
        : Array.from(new Set([...(profile.customCategories?.expense || []), ...EXPENSE_CATEGORIES]));
    const normalizedExpenseCats = baseExpenseSource
      .map(normalizeCategoryWording)
      .filter((cat, idx, arr) => Boolean(cat) && arr.indexOf(cat) === idx);
    const normalizedIncomeCats = Array.from(
      new Set(
        (Array.isArray(profile.customCategories?.income) && profile.customCategories.income.length > 1
          ? profile.customCategories.income
          : [...(profile.customCategories?.income || []), ...INCOME_CATEGORIES]
        ).filter(Boolean)
      )
    );
    const normalizedSavingCats = Array.from(
      new Set([
        ...SAVING_CATEGORIES,
        ...(profile.customCategories?.saving || SAVING_CATEGORIES).map((c) =>
          normalizeSavingCategoryGroup(c, c)
        ),
      ])
    ).filter(Boolean);
    const isStarterTpl = isDefaultStarterTemplateData({
      itemTemplates: cleanedTemplates,
      isDefaultStarterData: profile.isDefaultStarterData,
    });
    const fullData: BudgetTemplateData = {
      version: profile.version || '1.0.0',
      lastUpdated: isStarterTpl ? DEFAULT_STARTER_EPOCH : profile.lastUpdated || new Date().toISOString(),
      isPersonalizedTemplate: Boolean(profile.isPersonalizedTemplate && cleanedTemplates.length > 0),
      isDefaultStarterData: isStarterTpl,
      customCategories: {
        expense: normalizedExpenseCats,
        income: normalizedIncomeCats,
        saving: normalizedSavingCats,
      },
      itemTemplates: cleanedTemplates,
    };

    FinanceStorageService.cloudMemoryTemplateProfile = JSON.parse(JSON.stringify(fullData));

    if (!FinanceStorageService.cloudMemoryActive) {
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY_USER_TEMPLATE, JSON.stringify(fullData));
      } catch (e) {
        console.warn('Could not save user template profile:', e);
      }
    }

    if (auth?.currentUser && !options?.skipFirestoreWrite) {
      const uid = auth.currentUser.uid;
      void FirestoreSyncService.saveWorkspace(uid, {
        templateData: fullData,
      }).catch((err) => console.warn('Direct Firestore template CRUD write note:', err));
    }

    return fullData;
  }

  /**
   * Loads the standalone BudgetTemplateData object (used for capitalflow_budget_template.json)
   */
  static loadLocalTemplateData(fallbackBudget?: YearBudgetData): BudgetTemplateData {
    const saved = FinanceStorageService.loadUserTemplateProfile();
    if (saved) {
      const isStarter = isDefaultStarterTemplateData(saved);
      return {
        version: saved.version || '1.0.0',
        lastUpdated: isStarter
          ? DEFAULT_STARTER_EPOCH
          : saved.lastUpdated || fallbackBudget?.lastUpdated || new Date().toISOString(),
        isPersonalizedTemplate: Boolean(saved.isPersonalizedTemplate && saved.itemTemplates.length > 0),
        isDefaultStarterData: isStarter,
        customCategories: {
          expense: [...(saved.customCategories?.expense || EXPENSE_CATEGORIES)],
          income: [...(saved.customCategories?.income || INCOME_CATEGORIES)],
          saving: [...(saved.customCategories?.saving || SAVING_CATEGORIES)],
        },
        itemTemplates: saved.itemTemplates.map((t) => ({ ...t })),
      };
    }

    if (fallbackBudget && Array.isArray(fallbackBudget.itemTemplates) && fallbackBudget.customCategories) {
      const cleanedFallback = stripDefaultStarterTemplates(fallbackBudget.itemTemplates).map((t) => ({ ...t }));
      const isStarter = isDefaultStarterTemplateData({
        itemTemplates: cleanedFallback,
        isDefaultStarterData: fallbackBudget.isDefaultStarterData,
      });
      return {
        version: '1.0.0',
        lastUpdated: isStarter ? DEFAULT_STARTER_EPOCH : fallbackBudget.lastUpdated || new Date().toISOString(),
        isPersonalizedTemplate: Boolean(fallbackBudget.isPersonalizedTemplate && cleanedFallback.length > 0),
        isDefaultStarterData: isStarter,
        customCategories: {
          expense: [...fallbackBudget.customCategories.expense],
          income: [...fallbackBudget.customCategories.income],
          saving: [...fallbackBudget.customCategories.saving],
        },
        itemTemplates: cleanedFallback,
      };
    }

    return {
      version: '1.0.0',
      lastUpdated: DEFAULT_STARTER_EPOCH,
      isPersonalizedTemplate: false,
      isDefaultStarterData: true,
      customCategories: {
        expense: [...EXPENSE_CATEGORIES],
        income: [...INCOME_CATEGORIES],
        saving: [...SAVING_CATEGORIES],
      },
      itemTemplates: [],
    };
  }

  /**
   * Applies a standalone BudgetTemplateData object to profile storage and the active year budget
   */
  static applyTemplateDataToBudget(
    templateData: BudgetTemplateData,
    currentBudget: YearBudgetData,
    options?: { skipFirestoreWrite?: boolean }
  ): YearBudgetData {
    const normalizedCategories = {
      expense: [...(templateData.customCategories?.expense || EXPENSE_CATEGORIES)],
      income: [...(templateData.customCategories?.income || INCOME_CATEGORIES)],
      saving: [...(templateData.customCategories?.saving || SAVING_CATEGORIES)],
    };

    // Preserve any categories referenced by existing recorded entries in currentBudget
    (currentBudget.entries || []).forEach((entry) => {
      if (!entry.category) return;
      const list =
        entry.type === 'income'
          ? normalizedCategories.income
          : entry.type === 'saving'
          ? normalizedCategories.saving
          : normalizedCategories.expense;
      if (!list.includes(entry.category)) {
        list.push(entry.category);
      }
    });

    const normalizedTemplates = stripDefaultStarterTemplates(templateData.itemTemplates).map((t) => ({
      ...t,
    }));
    const hasPersonalized = Boolean((templateData.isPersonalizedTemplate ?? true) && normalizedTemplates.length > 0);

    FinanceStorageService.saveUserTemplateProfile(
      {
        version: templateData.version || '1.0.0',
        lastUpdated: templateData.lastUpdated || new Date().toISOString(),
        customCategories: normalizedCategories,
        itemTemplates: normalizedTemplates,
        isPersonalizedTemplate: hasPersonalized,
        isDefaultStarterData: false,
      },
      { skipFirestoreWrite: true }
    );

    const updatedBudget: YearBudgetData = {
      ...currentBudget,
      customCategories: normalizedCategories,
      itemTemplates: normalizedTemplates,
      isPersonalizedTemplate: hasPersonalized,
      isDefaultStarterData: false,
      budgets: deriveCategoryBudgetsFromTemplates(normalizedTemplates),
      lastUpdated: templateData.lastUpdated || new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget, {
      preserveTimestamp: Boolean(templateData.lastUpdated),
      skipFirestoreWrite: options?.skipFirestoreWrite,
    });
    return updatedBudget;
  }

  /**
   * Ensures a YearBudgetData object only contains the user's personalized templates & categories,
   * stripping out any default starter templates so they never mix on the grid.
   */
  static normalizeBudgetTemplates(budget: YearBudgetData): { budget: YearBudgetData; didMigrate: boolean } {
    let didMigrate = false;
    const savedProfile = FinanceStorageService.loadUserTemplateProfile();

    const hadDefaultItems =
      Array.isArray(budget.itemTemplates) && budget.itemTemplates.some((t) => isDefaultStarterTemplateItem(t));
    const hasMissingTemplates = !Array.isArray(budget.itemTemplates);

    const cleanedBudgetTemplates = stripDefaultStarterTemplates(budget.itemTemplates);

    if (hadDefaultItems || hasMissingTemplates) {
      didMigrate = true;
      const baseTemplates =
        cleanedBudgetTemplates.length > 0
          ? cleanedBudgetTemplates.map((t) => ({ ...t }))
          : savedProfile && savedProfile.itemTemplates.length > 0
          ? savedProfile.itemTemplates.map((t) => ({ ...t }))
          : [];

      const baseCategories = budget.customCategories
        ? {
            expense: [...budget.customCategories.expense],
            income: [...budget.customCategories.income],
            saving: [...budget.customCategories.saving],
          }
        : savedProfile?.customCategories
        ? {
            expense: [...savedProfile.customCategories.expense],
            income: [...savedProfile.customCategories.income],
            saving: [...savedProfile.customCategories.saving],
          }
        : {
            expense: [...EXPENSE_CATEGORIES],
            income: [...INCOME_CATEGORIES],
            saving: [...SAVING_CATEGORIES],
          };

      // Preserve any categories referenced by existing recorded entries
      (budget.entries || []).forEach((entry) => {
        if (!entry.category) return;
        const list =
          entry.type === 'income'
            ? baseCategories.income
            : entry.type === 'saving'
            ? baseCategories.saving
            : baseCategories.expense;
        if (!list.includes(entry.category)) {
          list.push(entry.category);
        }
      });

      budget.itemTemplates = baseTemplates;
      budget.customCategories = baseCategories;
      budget.isPersonalizedTemplate = Boolean(baseTemplates.length > 0);
    } else if (!budget.customCategories) {
      didMigrate = true;
      budget.customCategories = {
        expense: [...EXPENSE_CATEGORIES],
        income: [...INCOME_CATEGORIES],
        saving: [...SAVING_CATEGORIES],
      };
    }

    if (Array.isArray(budget.itemTemplates) && budget.itemTemplates.length === 0 && budget.isPersonalizedTemplate) {
      budget.isPersonalizedTemplate = false;
      didMigrate = true;
    }

    // Upgrade any legacy/misspelled category wordings & group Sinking Funds across entries, templates, and customCategories
    if (Array.isArray(budget.itemTemplates)) {
      const deduplicatedTemplates: BudgetItemTemplate[] = [];
      const seenSavingFunds = new Map<string, number>();

      budget.itemTemplates.forEach((t) => {
        if (t.type === 'saving') {
          const normItem = resolveCanonicalSinkingFundName(t.item, t.category);
          const normCat = normalizeSavingCategoryGroup(normItem, t.category);
          if (normItem !== t.item || normCat !== t.category) {
            didMigrate = true;
          }
          const fundKey = normItem.toLowerCase();
          if (seenSavingFunds.has(fundKey)) {
            didMigrate = true;
            const existingIdx = seenSavingFunds.get(fundKey)!;
            if ((t.defaultEstimatedCost || 0) > (deduplicatedTemplates[existingIdx].defaultEstimatedCost || 0)) {
              deduplicatedTemplates[existingIdx].defaultEstimatedCost = t.defaultEstimatedCost;
            }
          } else {
            seenSavingFunds.set(fundKey, deduplicatedTemplates.length);
            deduplicatedTemplates.push({
              ...t,
              item: normItem,
              category: normCat,
            });
          }
        } else {
          const normCat = normalizeCategoryWording(t.category);
          if (normCat !== t.category) didMigrate = true;
          deduplicatedTemplates.push({ ...t, category: normCat });
        }
      });

      budget.itemTemplates = deduplicatedTemplates;
    }

    if (Array.isArray(budget.entries)) {
      budget.entries = budget.entries.map((e) => {
        if (e.type === 'saving') {
          const normItem = resolveCanonicalSinkingFundName(e.item || e.description, e.category);
          const normCat = normalizeSavingCategoryGroup(normItem, e.category);
          if (normItem !== e.item || normCat !== e.category) {
            didMigrate = true;
          }
          return {
            ...e,
            item: normItem,
            description: e.description && e.description.toLowerCase() === 'savings' ? normItem : e.description,
            category: normCat,
          };
        }
        const normCat = normalizeCategoryWording(e.category);
        if (normCat !== e.category) didMigrate = true;
        return { ...e, category: normCat };
      });
    }

    if (budget.customCategories) {
      if (Array.isArray(budget.customCategories.expense)) {
        const rawExp =
          budget.customCategories.expense.length > 1
            ? budget.customCategories.expense
            : Array.from(new Set([...budget.customCategories.expense, ...EXPENSE_CATEGORIES]));
        const normalizedExpense: string[] = [];
        rawExp.forEach((c) => {
          const norm = normalizeCategoryWording(c);
          if (norm !== c) didMigrate = true;
          if (norm && !normalizedExpense.includes(norm)) {
            normalizedExpense.push(norm);
          }
        });
        if (normalizedExpense.length !== budget.customCategories.expense.length) {
          didMigrate = true;
        }
        budget.customCategories.expense = normalizedExpense;
      }

      if (Array.isArray(budget.customCategories.income)) {
        const rawInc =
          budget.customCategories.income.length > 1
            ? budget.customCategories.income
            : Array.from(new Set([...budget.customCategories.income, ...INCOME_CATEGORIES]));
        const normalizedIncome = Array.from(new Set(rawInc.filter(Boolean)));
        if (normalizedIncome.length !== budget.customCategories.income.length) {
          didMigrate = true;
        }
        budget.customCategories.income = normalizedIncome;
      }

      if (Array.isArray(budget.customCategories.saving)) {
        const normalizedSaving: string[] = [...SAVING_CATEGORIES];
        budget.customCategories.saving.forEach((c) => {
          const norm = normalizeSavingCategoryGroup(c, c);
          if (norm !== c) didMigrate = true;
          if (norm && norm !== 'Unallocated Cash Pool' && !normalizedSaving.includes(norm)) {
            normalizedSaving.push(norm);
          }
        });
        if (
          normalizedSaving.length !== budget.customCategories.saving.length ||
          normalizedSaving.some((v, idx) => budget.customCategories!.saving[idx] !== v)
        ) {
          didMigrate = true;
          budget.customCategories.saving = normalizedSaving;
        }
      }
    }

    if (didMigrate && budget.customCategories && Array.isArray(budget.itemTemplates)) {
      FinanceStorageService.saveUserTemplateProfile(
        {
          customCategories: budget.customCategories,
          itemTemplates: budget.itemTemplates,
          isPersonalizedTemplate: Boolean(budget.isPersonalizedTemplate && budget.itemTemplates.length > 0),
          isDefaultStarterData: Boolean(budget.isDefaultStarterData),
        },
        { skipFirestoreWrite: true }
      );
    }

    budget.budgets = deriveCategoryBudgetsFromTemplates(budget.itemTemplates || []);
    return { budget, didMigrate };
  }

  /**
   * Automatically clears legacy demo/sample data once on first load for Go Live
   */
  static checkAndPerformAutoClean(): void {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(LIVE_CLEAN_STORAGE_KEY) !== 'true') {
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('capitalflow_')) {
            keysToRemove.push(key);
          }
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(LIVE_CLEAN_STORAGE_KEY, 'true');
      }
    } catch (e) {
      console.warn('Auto clean check encountered an error:', e);
    }
  }

  /**
   * Complete reset: deletes all local data stored in localStorage and resets in-memory runtime state
   * to provide a completely clean state with 0 entries, 0 templates, and ₱0 balances
   * while preserving starter-data flags so Google Drive backups remain protected.
   */
  static resetAllDataForGoLive(): { budget: YearBudgetData; ledger: SavingsLedgerData } {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('capitalflow_')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      localStorage.removeItem(LOCAL_STORAGE_KEY_USER_TEMPLATE);
      localStorage.removeItem(LOCAL_STORAGE_KEY_LEDGER);
      localStorage.removeItem(LOCAL_STORAGE_KEY_YEARS);
    } catch (e) {
      console.warn('Error clearing localStorage during reset:', e);
    }

    FinanceStorageService.cloudMemoryBudgets.clear();
    FinanceStorageService.cloudMemoryLedger = null;
    FinanceStorageService.cloudMemoryTemplateProfile = null;
    FinanceStorageService.cloudMemoryKnownYears = [2026];

    const cleanBudget: YearBudgetData = {
      ...createEmptyYearBudget(2026),
      entries: [],
      customCategories: {
        expense: [...EXPENSE_CATEGORIES],
        income: [...INCOME_CATEGORIES],
        saving: [...SAVING_CATEGORIES],
      },
      itemTemplates: [],
      isPersonalizedTemplate: false,
      isDefaultStarterData: true,
      budgets: [],
    };

    localStorage.setItem(LIVE_CLEAN_STORAGE_KEY, 'true');
    localStorage.setItem(OCT_2026_MIGRATION_KEY, 'true');
    localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');

    FinanceStorageService.saveLocalBudget(cleanBudget, { isDefaultStarter: true });

    const cleanLedger = generateInitialSavingsLedger(cleanBudget);
    FinanceStorageService.saveLocalSavingsLedger(cleanLedger, { isDefaultStarter: true });

    if (!FinanceStorageService.cloudMemoryActive) {
      localStorage.setItem(LOCAL_STORAGE_KEY_YEARS, JSON.stringify([2026]));
    }

    return { budget: cleanBudget, ledger: cleanLedger };
  }

  /**
   * Initializes a completely blank workspace (0 entries, 0 sample templates) for new users
   * who want to start their own budget from scratch or import their own Excel sheet without sample data.
   */
  static startFreshBlankWorkspace(year: number = 2026): {
    budget: YearBudgetData;
    ledger: SavingsLedgerData;
    templateData: BudgetTemplateData;
  } {
    const blankCategories = {
      expense: [...EXPENSE_CATEGORIES],
      income: [...INCOME_CATEGORIES],
      saving: [...SAVING_CATEGORIES],
    };
    const nowIso = new Date().toISOString();

    const blankBudget: YearBudgetData = {
      year,
      version: '1.0',
      lastUpdated: nowIso,
      entryMode: 'monthly',
      currency: '₱',
      entries: [],
      customCategories: blankCategories,
      itemTemplates: [],
      isPersonalizedTemplate: false,
      isDefaultStarterData: false,
      budgets: [],
    };

    const blankLedger: SavingsLedgerData = {
      ...generateInitialSavingsLedger(blankBudget),
      lastUpdated: nowIso,
      isDefaultStarterData: false,
    };

    try {
      localStorage.setItem(LIVE_CLEAN_STORAGE_KEY, 'true');
      localStorage.setItem(OCT_2026_MIGRATION_KEY, 'true');
      localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');
    } catch {
      // Ignore storage errors
    }

    FinanceStorageService.saveLocalBudget(blankBudget, { isDefaultStarter: false });
    FinanceStorageService.saveLocalSavingsLedger(blankLedger, { isDefaultStarter: false });
    const templateData = FinanceStorageService.loadLocalTemplateData(blankBudget);

    return { budget: blankBudget, ledger: blankLedger, templateData };
  }

  /**
   * Load budget for a specific year.
   * Priority: In-memory Cloud Store (when Firebase active) -> LocalStorage fallback -> User's Personalized Template Profile -> Default Common Estimate Budget.
   */
  static loadLocalBudget(year: number): YearBudgetData {
    FinanceStorageService.checkAndPerformAutoClean();

    if (FinanceStorageService.cloudMemoryActive && FinanceStorageService.cloudMemoryBudgets.has(year)) {
      const memBudget = FinanceStorageService.cloudMemoryBudgets.get(year)!;
      return JSON.parse(JSON.stringify(memBudget)) as YearBudgetData;
    }

    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${year}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as YearBudgetData;
        const { budget: normalized, didMigrate } = FinanceStorageService.normalizeBudgetTemplates(parsed);
        let shouldSave = didMigrate;
        const isStarter = isDefaultStarterBudget(normalized);

        // ONLY update starter sample entries if this budget is STILL untouched default starter data!
        // Never overwrite a user's real or Drive-restored budget!
        if (year === 2026 && isStarter && localStorage.getItem(OCT_2026_MIGRATION_KEY) !== 'true') {
          normalized.entries = OCT_2026_MIGRATED_ACTUAL_ENTRIES.map((e) => ({ ...e }));
          if (!normalized.customCategories) {
            normalized.customCategories = {
              expense: [...EXPENSE_CATEGORIES],
              income: [...INCOME_CATEGORIES],
              saving: [...SAVING_CATEGORIES],
            };
          }
          OCT_2026_CUSTOM_EXPENSE_CATEGORIES.forEach((cat) => {
            if (!normalized.customCategories!.expense.includes(cat)) {
              normalized.customCategories!.expense.push(cat);
            }
          });
          localStorage.setItem(OCT_2026_MIGRATION_KEY, 'true');
          shouldSave = true;
        } else if (year === 2026 && !isStarter) {
          localStorage.setItem(OCT_2026_MIGRATION_KEY, 'true');
        }

        if (year === 2026 && isStarter && localStorage.getItem(OCT_2026_TEMPLATE_MIGRATION_KEY) !== 'true') {
          normalized.itemTemplates = MIGRATED_2026_ITEM_TEMPLATES.map((t) => ({ ...t }));
          normalized.isPersonalizedTemplate = true;
          normalized.isDefaultStarterData = true;
          normalized.budgets = deriveCategoryBudgetsFromTemplates(normalized.itemTemplates);
          if (!normalized.customCategories) {
            normalized.customCategories = {
              expense: [...EXPENSE_CATEGORIES],
              income: [...INCOME_CATEGORIES],
              saving: [...SAVING_CATEGORIES],
            };
          }
          OCT_2026_CUSTOM_EXPENSE_CATEGORIES.forEach((cat) => {
            if (!normalized.customCategories!.expense.includes(cat)) {
              normalized.customCategories!.expense.push(cat);
            }
          });
          FinanceStorageService.saveUserTemplateProfile(
            {
              lastUpdated: DEFAULT_STARTER_EPOCH,
              customCategories: normalized.customCategories,
              itemTemplates: normalized.itemTemplates,
              isPersonalizedTemplate: true,
              isDefaultStarterData: true,
            },
            { skipFirestoreWrite: true }
          );
          localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');
          shouldSave = true;
        } else if (year === 2026 && !isStarter) {
          localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');
        }

        if (isStarter) {
          if (!normalized.isDefaultStarterData || normalized.lastUpdated !== DEFAULT_STARTER_EPOCH) {
            normalized.isDefaultStarterData = true;
            normalized.lastUpdated = DEFAULT_STARTER_EPOCH;
            shouldSave = true;
          }
        }

        FinanceStorageService.cloudMemoryBudgets.set(year, JSON.parse(JSON.stringify(normalized)));
        if (shouldSave && !FinanceStorageService.cloudMemoryActive) {
          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${year}`, JSON.stringify(normalized));
        }
        return normalized;
      } catch (e) {
        console.error('Failed to parse cached budget for year', year, e);
      }
    }

    if (FinanceStorageService.cloudMemoryBudgets.has(year)) {
      return JSON.parse(JSON.stringify(FinanceStorageService.cloudMemoryBudgets.get(year)!)) as YearBudgetData;
    }

    const savedProfile = FinanceStorageService.loadUserTemplateProfile();
    const cleanBudget = createEmptyYearBudget(year, savedProfile || undefined);
    if (year === 2026) {
      localStorage.setItem(OCT_2026_MIGRATION_KEY, 'true');
      localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');
    }
    FinanceStorageService.saveLocalBudget(cleanBudget, {
      isDefaultStarter: isDefaultStarterBudget(cleanBudget),
      skipFirestoreWrite: true,
    });
    FinanceStorageService.registerKnownYear(year, { skipFirestoreWrite: true });
    return cleanBudget;
  }

  /**
   * Saves the annual budget and directly persists the CRUD update to Firebase Firestore when signed in.
   */
  static saveLocalBudget(
    budget: YearBudgetData,
    options?: {
      isDefaultStarter?: boolean;
      preserveTimestamp?: boolean;
      skipTemplateProfileUpdate?: boolean;
      skipFirestoreWrite?: boolean;
    }
  ): void {
    const isStarter = Boolean(options?.isDefaultStarter);
    budget.isDefaultStarterData = isStarter;
    budget.lastUpdated = isStarter
      ? DEFAULT_STARTER_EPOCH
      : options?.preserveTimestamp && budget.lastUpdated && budget.lastUpdated !== DEFAULT_STARTER_EPOCH
      ? budget.lastUpdated
      : new Date().toISOString();
    budget.budgets = deriveCategoryBudgetsFromTemplates(budget.itemTemplates || []);
    if (!options?.skipTemplateProfileUpdate && budget.customCategories && Array.isArray(budget.itemTemplates)) {
      FinanceStorageService.saveUserTemplateProfile(
        {
          lastUpdated: budget.lastUpdated,
          customCategories: budget.customCategories,
          itemTemplates: budget.itemTemplates,
          isPersonalizedTemplate: Boolean(budget.isPersonalizedTemplate && budget.itemTemplates.length > 0),
          isDefaultStarterData: isStarter,
        },
        { skipFirestoreWrite: true }
      );
    }

    FinanceStorageService.cloudMemoryBudgets.set(budget.year, JSON.parse(JSON.stringify(budget)));
    FinanceStorageService.registerKnownYear(budget.year, { skipFirestoreWrite: true });

    if (!FinanceStorageService.cloudMemoryActive) {
      localStorage.setItem(LIVE_CLEAN_STORAGE_KEY, 'true');
      localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${budget.year}`, JSON.stringify(budget));
    }

    if (auth?.currentUser && !options?.skipFirestoreWrite) {
      const uid = auth.currentUser.uid;
      const latestTemplate = FinanceStorageService.loadLocalTemplateData(budget);
      const knownYears = FinanceStorageService.getKnownYears();
      void FirestoreSyncService.saveWorkspace(uid, {
        activeYear: budget.year,
        knownYears,
        templateData: latestTemplate,
      })
        .then(() => FirestoreSyncService.saveAnnualBudget(uid, budget))
        .catch((err) => console.warn('Direct Firestore budget CRUD write note:', err));
    }
  }

  static registerKnownYear(year: number, options?: { skipFirestoreWrite?: boolean }): void {
    const years = FinanceStorageService.getKnownYears();
    if (!years.includes(year)) {
      years.push(year);
      years.sort((a, b) => b - a); // descending
      FinanceStorageService.cloudMemoryKnownYears = [...years];
      if (!FinanceStorageService.cloudMemoryActive) {
        localStorage.setItem(LOCAL_STORAGE_KEY_YEARS, JSON.stringify(years));
      }
      if (auth?.currentUser && !options?.skipFirestoreWrite) {
        const uid = auth.currentUser.uid;
        void FirestoreSyncService.saveWorkspace(uid, { knownYears: years }).catch((err) =>
          console.warn('Direct Firestore knownYears CRUD write note:', err)
        );
      }
    }
  }

  static getKnownYears(): number[] {
    if (FinanceStorageService.cloudMemoryActive && FinanceStorageService.cloudMemoryKnownYears.length > 0) {
      return [...FinanceStorageService.cloudMemoryKnownYears];
    }
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_YEARS);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as number[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          FinanceStorageService.cloudMemoryKnownYears = [...parsed];
          return parsed;
        }
      } catch (e) {
        console.error('Failed to parse known years', e);
      }
    }
    return [...FinanceStorageService.cloudMemoryKnownYears];
  }

  /**
   * Load savings ledger from in-memory cloud runtime or localStorage fallback.
   */
  static loadLocalSavingsLedger(): SavingsLedgerData {
    FinanceStorageService.checkAndPerformAutoClean();

    if (FinanceStorageService.cloudMemoryActive && FinanceStorageService.cloudMemoryLedger) {
      return JSON.parse(JSON.stringify(FinanceStorageService.cloudMemoryLedger)) as SavingsLedgerData;
    }

    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_LEDGER);
    if (raw) {
      try {
        const parsed: SavingsLedgerData = JSON.parse(raw);
        let ledgerMigrated = false;
        if (!Array.isArray(parsed.loans)) {
          parsed.loans = [];
        }
        if (Array.isArray(parsed.transactions)) {
          parsed.transactions = parsed.transactions.map((tx) => {
            const updated = { ...tx };
            if (
              updated.category &&
              updated.category.trim().toLowerCase() !== 'general reserves / starting capital' &&
              updated.source !== 'transfer'
            ) {
              const canonCat = resolveCanonicalSinkingFundName(updated.category, updated.category);
              if (canonCat !== updated.category) {
                updated.category = canonCat;
                ledgerMigrated = true;
              }
            }
            if (
              updated.toCategory &&
              updated.toCategory.trim().toLowerCase() !== 'general reserves / starting capital'
            ) {
              const canonTo = resolveCanonicalSinkingFundName(updated.toCategory, updated.toCategory);
              if (canonTo !== updated.toCategory) {
                updated.toCategory = canonTo;
                ledgerMigrated = true;
              }
            }
            return updated;
          });
        }
        const isStarter = isDefaultStarterLedger(parsed);
        if (isStarter) {
          if (!parsed.isDefaultStarterData || parsed.lastUpdated !== DEFAULT_STARTER_EPOCH) {
            parsed.isDefaultStarterData = true;
            parsed.lastUpdated = DEFAULT_STARTER_EPOCH;
            ledgerMigrated = true;
          }
        }
        FinanceStorageService.cloudMemoryLedger = JSON.parse(JSON.stringify(parsed));
        if (ledgerMigrated) {
          FinanceStorageService.saveLocalSavingsLedger(parsed, {
            isDefaultStarter: isStarter,
            skipFirestoreWrite: true,
          });
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse cached savings ledger', e);
      }
    }

    if (FinanceStorageService.cloudMemoryLedger) {
      return JSON.parse(JSON.stringify(FinanceStorageService.cloudMemoryLedger)) as SavingsLedgerData;
    }

    const budget2026 = FinanceStorageService.loadLocalBudget(2026);
    const initialLedger = generateInitialSavingsLedger(budget2026);
    initialLedger.loans = [];
    FinanceStorageService.saveLocalSavingsLedger(initialLedger, {
      isDefaultStarter: true,
      skipFirestoreWrite: true,
    });
    return initialLedger;
  }

  /**
   * Sanitizes parsed JSON objects against prototype pollution (__proto__, constructor, prototype)
   */
  static sanitizeImportedJson<T>(input: any): T {
    if (input === null || typeof input !== 'object') {
      return input;
    }
    if (Array.isArray(input)) {
      return input.map((item) => FinanceStorageService.sanitizeImportedJson(item)) as unknown as T;
    }
    const clean: Record<string, any> = {};
    for (const key of Object.keys(input)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }
      clean[key] = FinanceStorageService.sanitizeImportedJson(input[key]);
    }
    return clean as T;
  }

  /**
   * Saves the savings & loans ledger and directly persists the CRUD update to Firebase Firestore when signed in.
   */
  static saveLocalSavingsLedger(
    ledger: SavingsLedgerData,
    options?: { isDefaultStarter?: boolean; preserveTimestamp?: boolean; skipFirestoreWrite?: boolean }
  ): void {
    const isStarter = Boolean(options?.isDefaultStarter);
    ledger.isDefaultStarterData = isStarter;
    ledger.lastUpdated = isStarter
      ? DEFAULT_STARTER_EPOCH
      : options?.preserveTimestamp && ledger.lastUpdated && ledger.lastUpdated !== DEFAULT_STARTER_EPOCH
      ? ledger.lastUpdated
      : new Date().toISOString();
    if (!Array.isArray(ledger.loans)) {
      ledger.loans = [];
    }
    // Recompute running totals chronologically
    let running = ledger.initialCapital || 0;
    const sorted = [...ledger.transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    sorted.forEach((tx) => {
      if (tx.source === 'withdrawal') {
        running = Math.max(0, running - tx.amount);
      } else if (tx.source === 'transfer' || tx.source === 'reallocation') {
        // Transfers between savings accounts or virtual category reallocations do not change total overall capital
      } else {
        running += tx.amount;
      }
      tx.runningTotalCapital = running;
    });
    ledger.transactions = sorted;

    FinanceStorageService.cloudMemoryLedger = JSON.parse(JSON.stringify(ledger));

    if (!FinanceStorageService.cloudMemoryActive) {
      localStorage.setItem(LIVE_CLEAN_STORAGE_KEY, 'true');
      localStorage.setItem(LOCAL_STORAGE_KEY_LEDGER, JSON.stringify(ledger));
    }

    if (auth?.currentUser && !options?.skipFirestoreWrite) {
      const uid = auth.currentUser.uid;
      void FirestoreSyncService.saveWorkspace(uid, {
        ledgerData: ledger,
      }).catch((err) => console.warn('Direct Firestore ledger CRUD write note:', err));
    }
  }

  /**
   * Syncs a budget entry (expense under Loans or linked via loanId/item name, or income for lent loan repayment)
   * with the Loans list inside SavingsLedgerData.
   */
  static syncBudgetLoanPaymentToLedger(
    entry: BudgetEntry,
    isDelete: boolean = false
  ): { ledger: SavingsLedgerData; matchedLoan: LoanRecord | null } {
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = ledger.loans || [];
    if (loans.length === 0) {
      return { ledger, matchedLoan: null };
    }

    const effectiveAmount = entry.actualCost ?? entry.amount ?? 0;
    const isPaidOrRecorded =
      !isDelete &&
      entry.type !== 'saving' &&
      effectiveAmount !== 0 &&
      entry.status !== 'Pending';

    // 1. Check if any loan already has a payment linked to this budgetEntryId
    let existingLoan: LoanRecord | undefined = loans.find((ln) =>
      (ln.payments || []).some((p) => p.budgetEntryId === entry.id)
    );

    // 2. Find target loan by explicit loanId or by matching name when category is Loans / matching direction
    const itemNameLower = (entry.item || entry.description || '').trim().toLowerCase();
    const catLower = (entry.category || '').trim().toLowerCase();

    let targetLoan: LoanRecord | undefined =
      entry.type !== 'saving' && entry.loanId
        ? loans.find(
            (ln) =>
              ln.id === entry.loanId &&
              ((entry.type === 'expense' && ln.direction === 'borrowed') ||
                (entry.type === 'income' && ln.direction === 'lent'))
          )
        : undefined;

    if (!targetLoan && itemNameLower) {
      if (entry.type === 'expense') {
        targetLoan = loans.find(
          (ln) =>
            ln.direction === 'borrowed' &&
            (ln.name.trim().toLowerCase() === itemNameLower ||
              (catLower.includes('loan') &&
                (itemNameLower.includes(ln.name.trim().toLowerCase()) ||
                  ln.name.trim().toLowerCase().includes(itemNameLower))))
        );
      } else if (entry.type === 'income') {
        targetLoan = loans.find(
          (ln) =>
            ln.direction === 'lent' &&
            (ln.name.trim().toLowerCase() === itemNameLower ||
              ((catLower.includes('loan') || catLower.includes('receivable')) &&
                (itemNameLower.includes(ln.name.trim().toLowerCase()) ||
                  ln.name.trim().toLowerCase().includes(itemNameLower))))
        );
      }
    }

    const recalculateLoanStatus = (ln: LoanRecord) => {
      const paidViaPayments = (ln.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalPaid = (ln.initialPaidAmount || 0) + paidViaPayments;
      ln.status = ln.totalContractAmount > 0 && totalPaid + 0.005 >= ln.totalContractAmount ? 'completed' : 'active';
      ln.updatedAt = new Date().toISOString();
    };

    const recalculateRunningCapital = () => {
      let runningTotal = ledger.initialCapital || 0;
      const sorted = [...ledger.transactions].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      sorted.forEach((tx) => {
        if (tx.source === 'withdrawal') {
          runningTotal = Math.max(0, runningTotal - tx.amount);
        } else if (tx.source !== 'transfer' && tx.source !== 'reallocation') {
          runningTotal = Math.max(0, runningTotal + tx.amount);
        }
        tx.runningTotalCapital = runningTotal;
      });
      ledger.transactions = sorted;
    };

    let ledgerModified = false;
    let txModified = false;

    // If the entry was previously linked to a different loan, unlinked, or is now deleted/pending/zero, remove from old loan
    if (existingLoan && (!isPaidOrRecorded || !targetLoan || targetLoan.id !== existingLoan.id)) {
      const removedPayments = (existingLoan.payments || []).filter((p) => p.budgetEntryId === entry.id);
      removedPayments.forEach((remPay) => {
        if (remPay.ledgerTransactionId) {
          const linkedTxIdx = ledger.transactions.findIndex((t) => t.id === remPay.ledgerTransactionId);
          if (linkedTxIdx >= 0) {
            const removedTx = ledger.transactions.splice(linkedTxIdx, 1)[0];
            const acc = ledger.accounts.find((a) => a.id === removedTx.accountId);
            if (acc) {
              acc.balance = Math.max(0, acc.balance - removedTx.amount);
            }
            txModified = true;
          } else if (remPay.accountId) {
            const acc = ledger.accounts.find((a) => a.id === remPay.accountId);
            if (acc) {
              acc.balance = Math.max(0, acc.balance - remPay.amount);
            }
          }
        }
      });
      existingLoan.payments = (existingLoan.payments || []).filter((p) => p.budgetEntryId !== entry.id);
      recalculateLoanStatus(existingLoan);
      ledgerModified = true;
    }

    const activeLoan = isPaidOrRecorded && targetLoan ? targetLoan : null;

    if (activeLoan && isPaidOrRecorded) {
      if (!Array.isArray(activeLoan.payments)) {
        activeLoan.payments = [];
      }
      const existingPaymentIdx = activeLoan.payments.findIndex((p) => p.budgetEntryId === entry.id);
      const prevPayment = existingPaymentIdx >= 0 ? activeLoan.payments[existingPaymentIdx] : undefined;
      const paymentPayload: LoanPayment = {
        id: prevPayment ? prevPayment.id : `lpay-${entry.id}`,
        loanId: activeLoan.id,
        date: entry.date,
        year: entry.year,
        period: entry.period,
        amount: effectiveAmount,
        source: 'budget_sync',
        budgetEntryId: entry.id,
        accountId: prevPayment?.accountId,
        ledgerTransactionId: prevPayment?.ledgerTransactionId,
        note: `${entry.period} ${entry.year} Budget (${entry.item || entry.description || activeLoan.name})`,
      };

      // If this payment also had a linked savings ledger deposit transaction, keep its amount and date synchronized
      if (prevPayment?.ledgerTransactionId) {
        const linkedTx = ledger.transactions.find((t) => t.id === prevPayment.ledgerTransactionId);
        if (linkedTx) {
          const delta = effectiveAmount - linkedTx.amount;
          linkedTx.amount = effectiveAmount;
          linkedTx.date = entry.date;
          linkedTx.year = entry.year;
          linkedTx.period = entry.period;
          const acc = ledger.accounts.find((a) => a.id === linkedTx.accountId);
          if (acc && delta !== 0) {
            acc.balance = Math.max(0, acc.balance + delta);
          }
          txModified = true;
        }
      }

      if (existingPaymentIdx >= 0) {
        activeLoan.payments[existingPaymentIdx] = paymentPayload;
      } else {
        activeLoan.payments.push(paymentPayload);
      }
      recalculateLoanStatus(activeLoan);
      ledgerModified = true;
    }

    if (txModified) {
      recalculateRunningCapital();
    }

    if (ledgerModified) {
      FinanceStorageService.saveLocalSavingsLedger(ledger);
    }

    return { ledger, matchedLoan: activeLoan || existingLoan || null };
  }

  /**
   * Sync saving entry from budget into the separate savings ledger
   */
  static accumulateBudgetSavingToLedger(
    entry: BudgetEntry,
    isDelete: boolean = false
  ): SavingsLedgerData {
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    const effectiveAmount = entry.actualCost ?? entry.amount ?? 0;

    const existingIndex = ledger.transactions.findIndex(
      (tx) => tx.budgetEntryId === entry.id
    );

    if (isDelete || entry.type !== 'saving' || entry.status === 'Pending' || effectiveAmount === 0) {
      if (existingIndex >= 0) {
        const removed = ledger.transactions.splice(existingIndex, 1)[0];
        // update account balance
        const acc = ledger.accounts.find((a) => a.id === removed.accountId);
        if (acc) {
          acc.balance = Math.max(0, acc.balance - removed.amount);
        }
      }
    } else {
      const accountId = entry.savingAccountId || ledger.accounts[0]?.id || 'acc-hysa';
      const targetAccount = ledger.accounts.find((a) => a.id === accountId) || ledger.accounts[0];
      const safeAccId = targetAccount ? targetAccount.id : accountId;
      const safeAccName = targetAccount ? targetAccount.name : (entry.savingAccountName || 'Savings Account');
      const canonicalFund = resolveCanonicalSinkingFundName(
        entry.item || entry.description,
        entry.category
      );
      const entryNote = canonicalFund || entry.category || 'General Savings';

      if (existingIndex >= 0) {
        // Update existing transaction
        const prev = ledger.transactions[existingIndex];
        const prevAccountId = prev.accountId;
        const prevAmount = prev.amount;

        prev.amount = effectiveAmount;
        prev.date = entry.date;
        prev.year = entry.year;
        prev.period = entry.period;
        prev.note = entryNote;
        prev.category = canonicalFund;
        prev.accountId = safeAccId;
        prev.accountName = safeAccName;

        if (prevAccountId !== safeAccId) {
          const oldAcc = ledger.accounts.find((a) => a.id === prevAccountId);
          if (oldAcc) {
            oldAcc.balance = Math.max(0, oldAcc.balance - prevAmount);
          }
          if (targetAccount) {
            targetAccount.balance = Math.max(0, targetAccount.balance + effectiveAmount);
          }
        } else if (targetAccount) {
          const diff = effectiveAmount - prevAmount;
          targetAccount.balance = Math.max(0, targetAccount.balance + diff);
        }
      } else {
        // Append new accumulated saving transaction
        const newTx: SavingsTransaction = {
          id: `tx-${entry.id}`,
          date: entry.date,
          year: entry.year,
          period: entry.period,
          amount: effectiveAmount,
          accountId: safeAccId,
          accountName: safeAccName,
          source: 'budget_sync',
          budgetEntryId: entry.id,
          category: canonicalFund,
          note: entryNote,
        };
        ledger.transactions.push(newTx);
        if (targetAccount) {
          targetAccount.balance = Math.max(0, targetAccount.balance + effectiveAmount);
        }
      }
    }

    // Recalculate runningTotalCapital chronologically across all transactions
    let runningTotal = ledger.initialCapital || 0;
    const sorted = [...ledger.transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    sorted.forEach((tx) => {
      if (tx.source === 'withdrawal') {
        runningTotal = Math.max(0, runningTotal - tx.amount);
      } else if (tx.source !== 'transfer' && tx.source !== 'reallocation') {
        runningTotal += tx.amount;
      }
      tx.runningTotalCapital = runningTotal;
    });
    ledger.transactions = sorted;

    FinanceStorageService.saveLocalSavingsLedger(ledger);
    return ledger;
  }

  /**
   * Reverses or applies a SavingsTransaction's balance effect on accounts
   */
  static applyTxBalanceEffect(
    accounts: SavingsAccount[],
    tx: SavingsTransaction,
    reverse: boolean
  ): void {
    const sign = reverse ? -1 : 1;
    if (tx.source === 'withdrawal') {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) acc.balance = Math.max(0, acc.balance - sign * tx.amount);
    } else if (tx.source === 'transfer') {
      const fromAcc = accounts.find((a) => a.id === tx.accountId);
      const toAcc = accounts.find((a) => a.id === tx.toAccountId);
      if (fromAcc) fromAcc.balance = Math.max(0, fromAcc.balance - sign * tx.amount);
      if (toAcc) toAcc.balance = Math.max(0, toAcc.balance + sign * tx.amount);
    } else if (tx.source === 'reallocation') {
      // Category reallocation only shifts virtual envelope allocations; physical account balances remain unchanged
      return;
    } else {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) acc.balance = Math.max(0, acc.balance + sign * tx.amount);
    }
  }

  /**
   * Adds a direct transaction (yield, deposit, withdrawal, transfer, reallocation) to the Funds ledger
   */
  static addLedgerTransaction(
    txData: Omit<SavingsTransaction, 'id' | 'runningTotalCapital'>
  ): { ledger: SavingsLedgerData; newTx: SavingsTransaction } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const newTx: SavingsTransaction = {
      ...txData,
      id: `tx-manual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    currentLedger.transactions.push(newTx);
    FinanceStorageService.applyTxBalanceEffect(currentLedger.accounts, newTx, false);
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return { ledger: currentLedger, newTx };
  }

  /**
   * Updates an existing transaction in the Funds ledger and synchronizes any linked Budget Sheet entry or Loan Payment
   */
  static updateLedgerTransaction(
    txId: string,
    updated: Partial<SavingsTransaction>,
    activeYear: number = 2026
  ): { ledger: SavingsLedgerData; updatedBudget?: YearBudgetData } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const txIndex = currentLedger.transactions.findIndex((t) => t.id === txId);
    if (txIndex === -1) return { ledger: currentLedger };

    const oldTx = currentLedger.transactions[txIndex];
    FinanceStorageService.applyTxBalanceEffect(currentLedger.accounts, oldTx, true);

    const newTx: SavingsTransaction = {
      ...oldTx,
      ...updated,
    };
    currentLedger.transactions[txIndex] = newTx;
    FinanceStorageService.applyTxBalanceEffect(currentLedger.accounts, newTx, false);

    // If this transaction is linked to a loan payment (e.g. receivable collection deposit), keep accountId/amount/date in sync
    if (Array.isArray(currentLedger.loans)) {
      currentLedger.loans.forEach((ln) => {
        (ln.payments || []).forEach((p) => {
          if (p.ledgerTransactionId === txId) {
            p.accountId = newTx.accountId;
            p.amount = newTx.amount;
            p.date = newTx.date;
          }
        });
      });
    }

    let updatedBudget: YearBudgetData | undefined;
    if (newTx.budgetEntryId) {
      const targetYear = newTx.year || activeYear;
      const targetBudget = FinanceStorageService.loadLocalBudget(targetYear);
      let budgetChanged = false;
      targetBudget.entries = targetBudget.entries.map((e) => {
        if (e.id === newTx.budgetEntryId) {
          budgetChanged = true;
          const est = e.estimatedCost || 0;
          const updatedFundItem =
            newTx.category && newTx.category.trim() && newTx.category !== oldTx.category
              ? newTx.category.trim()
              : e.item;
          return {
            ...e,
            item: updatedFundItem,
            description: updatedFundItem || e.description,
            category:
              newTx.category && newTx.category.trim() && newTx.category !== oldTx.category
                ? normalizeSavingCategoryGroup(newTx.category.trim(), e.category)
                : e.category,
            amount: newTx.amount,
            actualCost: newTx.amount,
            difference: est - newTx.amount,
            date: newTx.date,
            savingAccountId: newTx.accountId,
            savingAccountName: newTx.accountName,
          };
        }
        return e;
      });
      if (budgetChanged) {
        FinanceStorageService.saveLocalBudget(targetBudget, {
          skipTemplateProfileUpdate: targetYear !== activeYear,
        });
        updatedBudget = targetBudget;
      }
    }

    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return { ledger: currentLedger, updatedBudget };
  }

  /**
   * Deletes a transaction from the Funds ledger, reversing its account balance effect and unlinking/removing linked records
   */
  static deleteLedgerTransaction(
    txId: string,
    activeYear: number = 2026
  ): { ledger: SavingsLedgerData; updatedBudget?: YearBudgetData } {
    const latestLedger = FinanceStorageService.loadLocalSavingsLedger();
    const targetTx = latestLedger.transactions.find((t) => t.id === txId);
    if (!targetTx) return { ledger: latestLedger };

    FinanceStorageService.applyTxBalanceEffect(latestLedger.accounts, targetTx, true);
    latestLedger.transactions = latestLedger.transactions.filter((t) => t.id !== txId);

    if (Array.isArray(latestLedger.loans)) {
      latestLedger.loans.forEach((ln) => {
        (ln.payments || []).forEach((p) => {
          if (p.ledgerTransactionId === txId) {
            delete p.ledgerTransactionId;
            delete p.accountId;
          }
        });
      });
    }

    let updatedBudget: YearBudgetData | undefined;
    if (targetTx.budgetEntryId) {
      const targetYear = targetTx.year || activeYear;
      const targetBudget = FinanceStorageService.loadLocalBudget(targetYear);
      const filteredEntries = targetBudget.entries.filter((e) => e.id !== targetTx.budgetEntryId);
      if (filteredEntries.length !== targetBudget.entries.length) {
        updatedBudget = {
          ...targetBudget,
          entries: filteredEntries,
        };
        FinanceStorageService.saveLocalBudget(updatedBudget, {
          skipTemplateProfileUpdate: targetYear !== activeYear,
        });
      }
    }

    FinanceStorageService.saveLocalSavingsLedger(latestLedger);
    return { ledger: latestLedger, updatedBudget };
  }

  /**
   * Adds a new savings account to the Funds ledger
   */
  static addSavingsAccount(
    accountData: Omit<SavingsAccount, 'id'>
  ): { ledger: SavingsLedgerData; newAccount: SavingsAccount } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const newAccount: SavingsAccount = {
      ...accountData,
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    currentLedger.accounts.push(newAccount);
    if (newAccount.balance > 0) {
      currentLedger.initialCapital = Math.max(
        0,
        (currentLedger.initialCapital || 0) + newAccount.balance
      );
    }
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return { ledger: currentLedger, newAccount };
  }

  /**
   * Updates/renames a savings account and propagates changes to ledger transactions and budget entries
   */
  static updateSavingsAccount(
    accountId: string,
    updates: Partial<SavingsAccount>,
    activeYear: number = 2026
  ): { ledger: SavingsLedgerData; updatedBudget?: YearBudgetData; newName?: string } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const accIndex = currentLedger.accounts.findIndex((a) => a.id === accountId);
    if (accIndex === -1) return { ledger: currentLedger };

    const oldName = currentLedger.accounts[accIndex].name;
    const oldBalance = currentLedger.accounts[accIndex].balance || 0;
    const newName = updates.name?.trim() || oldName;

    currentLedger.accounts[accIndex] = {
      ...currentLedger.accounts[accIndex],
      ...updates,
      name: newName,
    };

    if (updates.balance !== undefined && updates.balance !== oldBalance) {
      const balanceDelta = updates.balance - oldBalance;
      currentLedger.initialCapital = Math.max(
        0,
        (currentLedger.initialCapital || 0) + balanceDelta
      );
    }

    let updatedBudget: YearBudgetData | undefined;
    if (updates.name && updates.name.trim() !== oldName) {
      currentLedger.transactions.forEach((tx) => {
        if (tx.accountId === accountId) {
          tx.accountName = newName;
        }
        if (tx.toAccountId === accountId) {
          tx.toAccountName = newName;
        }
      });

      const currentBudget = FinanceStorageService.loadLocalBudget(activeYear);
      let budgetUpdated = false;
      currentBudget.entries.forEach((e) => {
        if (e.savingAccountId === accountId) {
          e.savingAccountName = newName;
          budgetUpdated = true;
        }
      });
      if (budgetUpdated) {
        FinanceStorageService.saveLocalBudget(currentBudget);
        updatedBudget = currentBudget;
      }
    }

    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return { ledger: currentLedger, updatedBudget, newName };
  }

  /**
   * Deletes a savings account (preventing deletion of the last account) and reassigns balances, transactions, loan payments, and budget entries/templates
   */
  static deleteSavingsAccount(
    accountId: string,
    reassignToAccountId?: string,
    activeYear: number = 2026
  ): {
    deleted: boolean;
    ledger: SavingsLedgerData;
    updatedBudget?: YearBudgetData;
    deletedAccountName?: string;
    targetAccountName?: string;
  } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    if (currentLedger.accounts.length <= 1) {
      return { deleted: false, ledger: currentLedger };
    }

    const deletingAcc = currentLedger.accounts.find((a) => a.id === accountId);
    if (!deletingAcc) {
      return { deleted: false, ledger: currentLedger };
    }

    const targetAcc = reassignToAccountId
      ? currentLedger.accounts.find((a) => a.id === reassignToAccountId)
      : currentLedger.accounts.find((a) => a.id !== accountId);

    if (targetAcc) {
      currentLedger.transactions.forEach((tx) => {
        if (tx.accountId === accountId) {
          tx.accountId = targetAcc.id;
          tx.accountName = targetAcc.name;
        }
        if (tx.toAccountId === accountId) {
          tx.toAccountId = targetAcc.id;
          tx.toAccountName = targetAcc.name;
        }
      });
      if (Array.isArray(currentLedger.loans)) {
        currentLedger.loans.forEach((ln) => {
          (ln.payments || []).forEach((p) => {
            if (p.accountId === accountId) {
              p.accountId = targetAcc.id;
            }
          });
        });
      }
      targetAcc.balance += deletingAcc.balance;
    }

    let updatedBudget: YearBudgetData | undefined;
    const currentBudget = FinanceStorageService.loadLocalBudget(activeYear);
    let budgetUpdated = false;
    currentBudget.entries.forEach((e) => {
      if (e.savingAccountId === accountId) {
        if (targetAcc) {
          e.savingAccountId = targetAcc.id;
          e.savingAccountName = targetAcc.name;
        } else {
          delete e.savingAccountId;
          delete e.savingAccountName;
        }
        budgetUpdated = true;
      }
    });
    if (currentBudget.itemTemplates) {
      currentBudget.itemTemplates = currentBudget.itemTemplates.map((t) => {
        if (t.defaultSavingAccountId === accountId) {
          budgetUpdated = true;
          return {
            ...t,
            defaultSavingAccountId: targetAcc ? targetAcc.id : undefined,
          };
        }
        return t;
      });
    }
    if (budgetUpdated) {
      FinanceStorageService.saveLocalBudget(currentBudget);
      updatedBudget = currentBudget;
    }

    currentLedger.accounts = currentLedger.accounts.filter((a) => a.id !== accountId);
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return {
      deleted: true,
      ledger: currentLedger,
      updatedBudget,
      deletedAccountName: deletingAcc.name,
      targetAccountName: targetAcc?.name,
    };
  }

  /**
   * Renames, merges, or updates a Sinking Fund across ledger transactions, budget entries, and templates
   */
  static renameOrMergeSinkingFund(
    budget: YearBudgetData,
    oldFundName: string,
    newFundName: string,
    newMonthlyTarget?: number,
    newSavingCategory?: string
  ): { budget: YearBudgetData; ledger: SavingsLedgerData; ledgerChanged: boolean } {
    const oldClean = oldFundName.trim();
    const newClean = newFundName.trim();
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    if (!oldClean || !newClean) {
      return { budget, ledger: currentLedger, ledgerChanged: false };
    }
    const oldLower = oldClean.toLowerCase();
    const newLower = newClean.toLowerCase();
    const resolvedCategory = normalizeSavingCategoryGroup(newClean, newSavingCategory);

    let ledgerChanged = false;
    currentLedger.transactions = currentLedger.transactions
      .map((tx) => {
        const updated = { ...tx };
        if ((tx.category || '').trim().toLowerCase() === oldLower) {
          updated.category = newClean;
          ledgerChanged = true;
        }
        if ((tx.toCategory || '').trim().toLowerCase() === oldLower) {
          updated.toCategory = newClean;
          ledgerChanged = true;
        }
        const cleanNote = (tx.note || '')
          .replace(/^(Budget Sync|Manual Deposit|Direct Deposit|Withdrawal|Yield):\s*/i, '')
          .trim();
        if (cleanNote.toLowerCase() === oldLower) {
          updated.note = tx.note.replace(
            new RegExp(oldClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'),
            newClean
          );
          ledgerChanged = true;
        }
        return updated;
      })
      .filter((tx) => {
        if (
          tx.source === 'reallocation' &&
          (tx.category || '').trim().toLowerCase() === (tx.toCategory || '').trim().toLowerCase()
        ) {
          ledgerChanged = true;
          return false;
        }
        return true;
      });

    if (ledgerChanged) {
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    }

    const currentTemplates = [...(budget.itemTemplates || [])];
    let matchedSavingTemplate = false;
    const deduplicatedTemplates: BudgetItemTemplate[] = [];

    currentTemplates.forEach((tpl) => {
      if (
        tpl.type === 'saving' &&
        (tpl.item.trim().toLowerCase() === oldLower || tpl.item.trim().toLowerCase() === newLower)
      ) {
        if (!matchedSavingTemplate) {
          matchedSavingTemplate = true;
          const isBiweeklyBoth =
            tpl.frequency === 'bi-weekly' && (!tpl.biweeklyPeriod || tpl.biweeklyPeriod === 'both');
          deduplicatedTemplates.push({
            ...tpl,
            item: newClean,
            category: newSavingCategory
              ? resolvedCategory
              : normalizeSavingCategoryGroup(newClean, tpl.category),
            defaultEstimatedCost:
              newMonthlyTarget !== undefined
                ? isBiweeklyBoth
                  ? newMonthlyTarget / 2
                  : newMonthlyTarget
                : tpl.defaultEstimatedCost,
          });
        } else if (newMonthlyTarget === undefined && tpl.defaultEstimatedCost > 0) {
          const existingIdx = deduplicatedTemplates.findIndex(
            (d) => d.type === 'saving' && d.item.trim().toLowerCase() === newLower
          );
          if (existingIdx >= 0 && deduplicatedTemplates[existingIdx].defaultEstimatedCost === 0) {
            deduplicatedTemplates[existingIdx].defaultEstimatedCost = tpl.defaultEstimatedCost;
          }
        }
      } else {
        deduplicatedTemplates.push(tpl);
      }
    });

    if (
      !matchedSavingTemplate &&
      ((newMonthlyTarget !== undefined && newMonthlyTarget > 0) || newSavingCategory)
    ) {
      deduplicatedTemplates.push({
        id: `tpl-sav-${Date.now()}`,
        type: 'saving',
        category: resolvedCategory,
        item: newClean,
        defaultEstimatedCost: newMonthlyTarget || 0,
        frequency: 'monthly',
        biweeklyPeriod: 'both',
        defaultPaymentMethod: 'Bank Transfer',
      });
    }

    const updatedEntries = budget.entries.map((e) => {
      if (
        e.type === 'saving' &&
        ((e.item || '').trim().toLowerCase() === oldLower ||
          (e.description || '').trim().toLowerCase() === oldLower)
      ) {
        return {
          ...e,
          item: newClean,
          description: newClean,
          category: newSavingCategory ? resolvedCategory : e.category,
        };
      }
      return e;
    });

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
      itemTemplates: deduplicatedTemplates,
      isPersonalizedTemplate: deduplicatedTemplates.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);
    return { budget: updatedBudget, ledger: currentLedger, ledgerChanged };
  }

  /**
   * Deletes a Sinking Fund and reassigns its balance/transactions to another fund or General Reserves
   */
  static deleteSinkingFund(
    budget: YearBudgetData,
    fundName: string,
    reassignToFund?: string
  ): { budget: YearBudgetData; ledger: SavingsLedgerData; destination: string } {
    const targetLower = fundName.trim().toLowerCase();
    const destination = (reassignToFund || 'General Reserves / Starting Capital').trim();
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    if (!targetLower) {
      return { budget, ledger: currentLedger, destination };
    }

    let ledgerChanged = false;
    currentLedger.transactions = currentLedger.transactions
      .map((tx) => {
        const catLower = (tx.category || '').trim().toLowerCase();
        const toCatLower = (tx.toCategory || '').trim().toLowerCase();
        if (catLower === targetLower || toCatLower === targetLower) {
          ledgerChanged = true;
          const updated = { ...tx };
          if (catLower === targetLower) {
            updated.category = destination;
          }
          if (toCatLower === targetLower) {
            updated.toCategory = destination;
          }
          return updated;
        }
        return tx;
      })
      .filter((tx) => {
        if (
          tx.source === 'reallocation' &&
          (tx.category || '').trim().toLowerCase() === (tx.toCategory || '').trim().toLowerCase()
        ) {
          ledgerChanged = true;
          return false;
        }
        return true;
      });

    if (ledgerChanged) {
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    }

    const filteredTemplates = (budget.itemTemplates || []).filter(
      (tpl) => !(tpl.type === 'saving' && tpl.item.trim().toLowerCase() === targetLower)
    );

    const updatedEntries = budget.entries.map((e) => {
      if (
        e.type === 'saving' &&
        ((e.item || '').trim().toLowerCase() === targetLower ||
          (e.description || '').trim().toLowerCase() === targetLower)
      ) {
        return { ...e, item: destination, description: destination };
      }
      return e;
    });

    const updatedSavingCats = (budget.customCategories?.saving || []).filter(
      (c) => c.trim().toLowerCase() !== targetLower
    );

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
      itemTemplates: filteredTemplates,
      customCategories: budget.customCategories
        ? {
            ...budget.customCategories,
            saving: updatedSavingCats,
          }
        : undefined,
      isPersonalizedTemplate: filteredTemplates.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);
    return { budget: updatedBudget, ledger: currentLedger, destination };
  }

  /**
   * Batch adds or replaces a period's budget entries (e.g. Auto-Fill or Excel Import) and synchronizes Savings & Loans in the Ledger
   */
  static addMultipleBudgetEntries(
    budget: YearBudgetData,
    entriesData: Omit<BudgetEntry, 'id' | 'createdAt'>[],
    options?: { replacePeriod?: string; customExpenseCategories?: string[] }
  ): {
    budget: YearBudgetData;
    ledger: SavingsLedgerData;
    newEntries: BudgetEntry[];
  } {
    let updatedLedger = FinanceStorageService.loadLocalSavingsLedger();
    const defaultAcc = updatedLedger.accounts[0];
    const newEntries: BudgetEntry[] = entriesData.map((e, idx) => ({
      ...e,
      savingAccountId:
        e.type === 'saving' ? e.savingAccountId || defaultAcc?.id : e.savingAccountId,
      savingAccountName:
        e.type === 'saving' ? e.savingAccountName || defaultAcc?.name : e.savingAccountName,
      id: `entry-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    }));

    const removedPeriodEntries = options?.replacePeriod
      ? budget.entries.filter((e) => e.period === options.replacePeriod)
      : [];
    const removedPeriodSavings = removedPeriodEntries.filter((e) => e.type === 'saving');

    const baseEntries = options?.replacePeriod
      ? budget.entries.filter((e) => e.period !== options.replacePeriod)
      : budget.entries;

    const currentCustomCats = {
      expense:
        budget.customCategories?.expense && budget.customCategories.expense.length > 0
          ? [...budget.customCategories.expense]
          : [...EXPENSE_CATEGORIES],
      income:
        budget.customCategories?.income && budget.customCategories.income.length > 0
          ? [...budget.customCategories.income]
          : [...INCOME_CATEGORIES],
      saving:
        budget.customCategories?.saving && budget.customCategories.saving.length > 0
          ? [...budget.customCategories.saving]
          : [...SAVING_CATEGORIES],
    };
    const mergedExpenseCats = options?.customExpenseCategories?.length
      ? Array.from(new Set([...currentCustomCats.expense, ...options.customExpenseCategories]))
      : currentCustomCats.expense;

    const updatedExcluded: Record<string, string[]> = { ...(budget.excludedPeriodItems || {}) };
    if (options?.replacePeriod && updatedExcluded[options.replacePeriod]) {
      delete updatedExcluded[options.replacePeriod];
    } else {
      newEntries.forEach((entry) => {
        const p = entry.period;
        if (updatedExcluded[p] && updatedExcluded[p].length > 0) {
          const cleanItemLower = (entry.item || entry.description || '').trim().toLowerCase();
          const matchedTpl = (budget.itemTemplates || []).find(
            (t) =>
              t.type === entry.type &&
              ((entry.loanId && t.loanId === entry.loanId) ||
                t.item.trim().toLowerCase() === cleanItemLower)
          );
          const keysToUnexclude = getPeriodItemExclusionKeys({
            templateId: matchedTpl?.id,
            type: entry.type,
            item: matchedTpl?.item || entry.item || entry.description,
            loanId: entry.loanId || matchedTpl?.loanId,
          });
          updatedExcluded[p] = updatedExcluded[p].filter((k) => !keysToUnexclude.includes(k));
          if (updatedExcluded[p].length === 0) {
            delete updatedExcluded[p];
          }
        }
      });
    }

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: [...newEntries, ...baseEntries],
      excludedPeriodItems: updatedExcluded,
      customCategories: {
        ...currentCustomCats,
        expense: mergedExpenseCats,
      },
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);

    removedPeriodSavings.forEach((oldSaving) => {
      updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(oldSaving, true);
    });
    removedPeriodEntries.forEach((oldEntry) => {
      if (oldEntry.type !== 'saving') {
        const res = FinanceStorageService.syncBudgetLoanPaymentToLedger(oldEntry, true);
        updatedLedger = res.ledger;
      }
    });
    newEntries.forEach((entry) => {
      if (
        entry.type === 'saving' &&
        entry.status !== 'Pending' &&
        (entry.actualCost ?? entry.amount ?? 0) !== 0
      ) {
        updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(entry, false);
      } else if (entry.type !== 'saving') {
        const res = FinanceStorageService.syncBudgetLoanPaymentToLedger(entry, false);
        updatedLedger = res.ledger;
      }
    });

    return { budget: updatedBudget, ledger: updatedLedger, newEntries };
  }

  /**
   * Deletes an entire budget item from a specific period:
   * - Removes any recorded BudgetEntry rows matching the item in that period (and rolls back linked Funds ledger / Loan payments)
   * - Marks any matching template item as excluded for that period so it does not reappear as a virtual estimate row in that period
   */
  static deleteBudgetPeriodItem(
    budget: YearBudgetData,
    period: string,
    target: {
      entryId?: string;
      templateId?: string;
      type: EntryType;
      item: string;
      loanId?: string;
    }
  ): {
    budget: YearBudgetData;
    ledger: SavingsLedgerData;
    removedEntries: BudgetEntry[];
    excludedTemplate: boolean;
  } {
    const cleanItemLower = (target.item || '').trim().toLowerCase();
    const matchedTemplate = (budget.itemTemplates || []).find(
      (t) =>
        (target.templateId && t.id === target.templateId) ||
        (t.type === target.type &&
          ((target.loanId && t.loanId === target.loanId) ||
            t.item.trim().toLowerCase() === cleanItemLower))
    );

    const effectiveTemplateId = target.templateId || matchedTemplate?.id;
    const effectiveLoanId = target.loanId || matchedTemplate?.loanId;

    const removedEntries: BudgetEntry[] = [];
    const remainingEntries: BudgetEntry[] = [];

    (budget.entries || []).forEach((e) => {
      const isDirectIdMatch = Boolean(target.entryId && e.id === target.entryId);
      const isSamePeriodAndItemMatch =
        e.period === period &&
        e.type === target.type &&
        (Boolean(effectiveLoanId && e.loanId === effectiveLoanId) ||
          (cleanItemLower.length > 0 &&
            (e.item || e.description || '').trim().toLowerCase() === cleanItemLower));

      if (isDirectIdMatch || isSamePeriodAndItemMatch) {
        removedEntries.push(e);
      } else {
        remainingEntries.push(e);
      }
    });

    const updatedExcluded: Record<string, string[]> = { ...(budget.excludedPeriodItems || {}) };
    let excludedTemplate = false;
    const isDisplayedTemplate = matchedTemplate
      ? shouldTemplateDisplayInBudget(matchedTemplate, true)
      : Boolean(effectiveTemplateId);
    if ((effectiveTemplateId || matchedTemplate) && isDisplayedTemplate) {
      excludedTemplate = true;
      const keysToExclude = getPeriodItemExclusionKeys({
        templateId: effectiveTemplateId,
        type: target.type,
        item: matchedTemplate?.item || target.item,
        loanId: effectiveLoanId,
      });
      const existingList = updatedExcluded[period] || [];
      updatedExcluded[period] = Array.from(new Set([...existingList, ...keysToExclude]));
    }

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: remainingEntries,
      excludedPeriodItems: updatedExcluded,
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);

    let updatedLedger = FinanceStorageService.loadLocalSavingsLedger();
    removedEntries.forEach((removed) => {
      if (removed.type === 'saving') {
        updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(removed, true);
      } else {
        const loanSync = FinanceStorageService.syncBudgetLoanPaymentToLedger(removed, true);
        updatedLedger = loanSync.ledger;
      }
    });

    return {
      budget: updatedBudget,
      ledger: updatedLedger,
      removedEntries,
      excludedTemplate,
    };
  }

  /**
   * Restores excluded template items for a specific period (either all excluded items in that period, or specific keys).
   */
  static restoreExcludedPeriodItems(
    budget: YearBudgetData,
    period: string,
    keysToRemove?: string[]
  ): YearBudgetData {
    const updatedExcluded: Record<string, string[]> = { ...(budget.excludedPeriodItems || {}) };
    if (!updatedExcluded[period] || updatedExcluded[period].length === 0) {
      return budget;
    }

    if (!keysToRemove || keysToRemove.length === 0) {
      delete updatedExcluded[period];
    } else {
      updatedExcluded[period] = updatedExcluded[period].filter((k) => !keysToRemove.includes(k));
      if (updatedExcluded[period].length === 0) {
        delete updatedExcluded[period];
      }
    }

    const updatedBudget: YearBudgetData = {
      ...budget,
      excludedPeriodItems: updatedExcluded,
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);
    return updatedBudget;
  }

  /**
   * Synchronizes a LoanRecord to a recurring BudgetItemTemplate in YearBudgetData
   */
  static syncLoanToBudgetTemplate(
    loan: LoanRecord,
    currentBudget: YearBudgetData
  ): { updatedBudget: YearBudgetData; templateId: string } {
    const templates = [...(currentBudget.itemTemplates || [])];
    const targetType: EntryType = loan.direction === 'borrowed' ? 'expense' : 'income';
    const targetCat = loan.direction === 'borrowed' ? 'Loans' : 'Other Income';

    const existingIdx = templates.findIndex(
      (t) =>
        (loan.linkedTemplateId && t.id === loan.linkedTemplateId) ||
        (t.loanId && t.loanId === loan.id) ||
        (t.type === targetType && t.item.trim().toLowerCase() === loan.name.trim().toLowerCase())
    );

    const templateId = existingIdx >= 0 ? templates[existingIdx].id : `tpl-loan-${loan.id}`;
    const tplPayload: BudgetItemTemplate = {
      id: templateId,
      type: targetType,
      category: existingIdx >= 0 ? templates[existingIdx].category : targetCat,
      item: loan.name,
      defaultEstimatedCost: loan.installmentAmount,
      frequency: loan.frequency,
      biweeklyPeriod: loan.biweeklyPeriod || 'both',
      defaultPaymentMethod:
        existingIdx >= 0 ? templates[existingIdx].defaultPaymentMethod : 'Bank Transfer',
      loanId: loan.id,
    };

    if (existingIdx >= 0) {
      templates[existingIdx] = tplPayload;
    } else {
      templates.push(tplPayload);
    }

    const customCats = currentBudget.customCategories
      ? {
          expense:
            currentBudget.customCategories.expense.length > 1
              ? [...currentBudget.customCategories.expense]
              : Array.from(new Set([...currentBudget.customCategories.expense, ...EXPENSE_CATEGORIES])),
          income:
            currentBudget.customCategories.income.length > 1
              ? [...currentBudget.customCategories.income]
              : Array.from(new Set([...currentBudget.customCategories.income, ...INCOME_CATEGORIES])),
          saving:
            currentBudget.customCategories.saving.length > 0
              ? [...currentBudget.customCategories.saving]
              : [...SAVING_CATEGORIES],
        }
      : {
          expense: [...EXPENSE_CATEGORIES, 'Loans'],
          income: [...INCOME_CATEGORIES],
          saving: [...SAVING_CATEGORIES],
        };

    if (targetType === 'expense' && !customCats.expense.includes('Loans')) {
      customCats.expense.push('Loans');
    }

    const updatedBudget: YearBudgetData = {
      ...currentBudget,
      itemTemplates: templates,
      customCategories: customCats,
      isPersonalizedTemplate: templates.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);
    return { updatedBudget, templateId };
  }

  /**
   * Creates or updates a LoanRecord, synchronizes templates/renamed entries, and optionally disburses principal for lent receivables
   */
  static saveLoanContract(
    loan: LoanRecord,
    currentBudget: YearBudgetData,
    frequency: EntryFrequency,
    options?: {
      syncToTemplate?: boolean;
      disburseFromAccountId?: string;
    }
  ): {
    ledger: SavingsLedgerData;
    budget: YearBudgetData;
    isUpdate: boolean;
    disbursedAccountName?: string;
    disbursedAmount: number;
  } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = [...(currentLedger.loans || [])];
    const existingIdx = loans.findIndex((l) => l.id === loan.id);

    const updatedLoan = { ...loan };
    const hasMatchingTemplateInBudget = (currentBudget.itemTemplates || []).some(
      (t) =>
        t.loanId === updatedLoan.id ||
        (updatedLoan.linkedTemplateId && t.id === updatedLoan.linkedTemplateId)
    );
    const shouldSyncTemplate =
      options?.syncToTemplate !== undefined
        ? options.syncToTemplate
        : Boolean(updatedLoan.linkedTemplateId || hasMatchingTemplateInBudget);

    let workingBudget = currentBudget;
    if (existingIdx >= 0 && loans[existingIdx].name.trim() !== updatedLoan.name.trim()) {
      const oldLoanNameLower = loans[existingIdx].name.trim().toLowerCase();
      let entriesChanged = false;
      const updatedEntries = workingBudget.entries.map((entry) => {
        if (
          entry.loanId === updatedLoan.id ||
          ((entry.category === 'Loans' || entry.category === 'Other Income') &&
            (entry.item || '').trim().toLowerCase() === oldLoanNameLower)
        ) {
          entriesChanged = true;
          return {
            ...entry,
            item: updatedLoan.name,
            description: updatedLoan.name,
            loanId: updatedLoan.id,
          };
        }
        return entry;
      });
      if (entriesChanged) {
        workingBudget = {
          ...workingBudget,
          entries: updatedEntries,
          lastUpdated: new Date().toISOString(),
        };
        FinanceStorageService.saveLocalBudget(workingBudget);
      }
    }

    if (shouldSyncTemplate) {
      const { updatedBudget, templateId } = FinanceStorageService.syncLoanToBudgetTemplate(
        updatedLoan,
        workingBudget
      );
      updatedLoan.linkedTemplateId = templateId;
      workingBudget = updatedBudget;
    } else if (
      options?.syncToTemplate === false &&
      (updatedLoan.linkedTemplateId || hasMatchingTemplateInBudget)
    ) {
      const filteredTemplates = (workingBudget.itemTemplates || []).filter(
        (t) =>
          t.loanId !== updatedLoan.id &&
          (!updatedLoan.linkedTemplateId || t.id !== updatedLoan.linkedTemplateId)
      );
      updatedLoan.linkedTemplateId = undefined;
      workingBudget = {
        ...workingBudget,
        itemTemplates: filteredTemplates,
        isPersonalizedTemplate: filteredTemplates.length > 0,
        lastUpdated: new Date().toISOString(),
      };
      FinanceStorageService.saveLocalBudget(workingBudget);
    }

    if (existingIdx >= 0) {
      loans[existingIdx] = updatedLoan;
    } else {
      loans.unshift(updatedLoan);
    }

    let disbursedAccountName: string | undefined;
    let disbursedAmount = 0;
    if (existingIdx === -1 && options?.disburseFromAccountId && updatedLoan.direction === 'lent') {
      const targetAcc = currentLedger.accounts.find((a) => a.id === options.disburseFromAccountId);
      disbursedAmount = updatedLoan.principalAmount || updatedLoan.totalContractAmount;
      if (targetAcc && disbursedAmount > 0) {
        targetAcc.balance = Math.max(0, targetAcc.balance - disbursedAmount);
        disbursedAccountName = targetAcc.name;

        const dateParts = (updatedLoan.startDate || '').split('-').map((n) => parseInt(n, 10));
        const parsedYear =
          dateParts.length === 3 && !isNaN(dateParts[0]) ? dateParts[0] : workingBudget.year;
        const parsedMonthIdx =
          dateParts.length === 3 && !isNaN(dateParts[1])
            ? Math.max(0, Math.min(11, dateParts[1] - 1))
            : new Date().getMonth();
        const monthName = MONTH_NAMES[parsedMonthIdx] || 'Jan';
        const dayOfMonth =
          dateParts.length === 3 && !isNaN(dateParts[2]) ? dateParts[2] : new Date().getDate();
        const resolvedPeriod =
          frequency === 'bi-weekly'
            ? `${monthName}-${dayOfMonth <= 15 ? 'P1' : 'P2'}`
            : monthName;

        currentLedger.transactions.push({
          id: `tx-disburse-${Date.now()}`,
          date: updatedLoan.startDate || new Date().toISOString().split('T')[0],
          year: parsedYear,
          period: resolvedPeriod,
          amount: disbursedAmount,
          accountId: targetAcc.id,
          accountName: targetAcc.name,
          source: 'withdrawal',
          category: 'General Reserves / Starting Capital',
          note: `Disbursed Lent Loan: ${updatedLoan.name}${
            updatedLoan.counterparty ? ` to ${updatedLoan.counterparty}` : ''
          }`,
        });
      }
    }

    currentLedger.loans = loans;
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return {
      ledger: currentLedger,
      budget: workingBudget,
      isUpdate: existingIdx >= 0,
      disbursedAccountName,
      disbursedAmount,
    };
  }

  /**
   * Deletes a LoanRecord from the ledger, removes its linked template, and clears dangling loanId references on budget entries
   */
  static deleteLoanContract(
    loanId: string,
    currentBudget: YearBudgetData
  ): { ledger: SavingsLedgerData; budget: YearBudgetData; deletedLoan?: LoanRecord } {
    const latestLedger = FinanceStorageService.loadLocalSavingsLedger();
    const target = (latestLedger.loans || []).find((l) => l.id === loanId);
    latestLedger.loans = (latestLedger.loans || []).filter((l) => l.id !== loanId);
    FinanceStorageService.saveLocalSavingsLedger(latestLedger);

    let updatedBudget = currentBudget;
    const currentTemplates = currentBudget.itemTemplates || [];
    const filteredTemplates = currentTemplates.filter(
      (t) => t.loanId !== loanId && (!target?.linkedTemplateId || t.id !== target.linkedTemplateId)
    );
    let entriesUnlinked = false;
    const cleanedEntries = currentBudget.entries.map((e) => {
      if (e.loanId === loanId) {
        entriesUnlinked = true;
        return { ...e, loanId: undefined };
      }
      return e;
    });
    if (filteredTemplates.length !== currentTemplates.length || entriesUnlinked) {
      updatedBudget = {
        ...currentBudget,
        entries: cleanedEntries,
        itemTemplates: filteredTemplates,
        isPersonalizedTemplate: filteredTemplates.length > 0,
        lastUpdated: new Date().toISOString(),
      };
      FinanceStorageService.saveLocalBudget(updatedBudget);
    }

    return { ledger: latestLedger, budget: updatedBudget, deletedLoan: target };
  }

  /**
   * Records a loan payment/collection and optionally logs it in the Budget Sheet and/or deposits it into a Savings Account
   */
  static recordLoanPayment(
    loanId: string,
    paymentData: {
      amount: number;
      date: string;
      note: string;
      recordInBudget?: boolean;
      depositToAccountId?: string;
    },
    currentBudget: YearBudgetData,
    frequency: EntryFrequency
  ): {
    ledger: SavingsLedgerData;
    updatedActiveBudget?: YearBudgetData;
    loan?: LoanRecord;
    linkedBudgetEntryId?: string;
    resolvedPeriod?: string;
  } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = [...(currentLedger.loans || [])];
    const loanIdx = loans.findIndex((l) => l.id === loanId);
    if (loanIdx === -1) return { ledger: currentLedger };

    const loan = { ...loans[loanIdx], payments: [...(loans[loanIdx].payments || [])] };
    const dateParts = (paymentData.date || '').split('-').map((n) => parseInt(n, 10));
    const parsedYear =
      dateParts.length === 3 && !isNaN(dateParts[0]) ? dateParts[0] : currentBudget.year;
    const parsedMonthIdx =
      dateParts.length === 3 && !isNaN(dateParts[1])
        ? Math.max(0, Math.min(11, dateParts[1] - 1))
        : new Date().getMonth();
    const dayOfMonth =
      dateParts.length === 3 && !isNaN(dateParts[2]) ? dateParts[2] : new Date().getDate();
    const monthName = MONTH_NAMES[parsedMonthIdx] || 'Oct';
    const resolvedPeriod =
      frequency === 'bi-weekly'
        ? `${monthName}-${dayOfMonth <= 15 ? 'P1' : 'P2'}`
        : monthName;
    const resolvedPeriodIdx =
      frequency === 'bi-weekly'
        ? Math.max(0, BIWEEKLY_PERIODS.findIndex((p) => p.id === resolvedPeriod))
        : parsedMonthIdx;

    let linkedBudgetEntryId: string | undefined;
    let updatedActiveBudget: YearBudgetData | undefined;

    if (paymentData.recordInBudget) {
      const targetBudget =
        parsedYear === currentBudget.year
          ? currentBudget
          : FinanceStorageService.loadLocalBudget(parsedYear);
      const targetType: EntryType = loan.direction === 'borrowed' ? 'expense' : 'income';
      const estAmt = loan.installmentAmount || paymentData.amount;
      const diffAmt =
        loan.direction === 'borrowed' ? estAmt - paymentData.amount : paymentData.amount - estAmt;
      const loanNameLower = loan.name.trim().toLowerCase();

      const existingPlaceholder = targetBudget.entries.find(
        (e) =>
          e.period === resolvedPeriod &&
          e.type === targetType &&
          (e.loanId === loan.id ||
            (e.item || e.description || '').trim().toLowerCase() === loanNameLower) &&
          (e.status === 'Pending' || (e.actualCost ?? e.amount ?? 0) === 0)
      );

      let updatedEntries: BudgetEntry[];
      if (existingPlaceholder) {
        linkedBudgetEntryId = existingPlaceholder.id;
        updatedEntries = targetBudget.entries.map((e) =>
          e.id === existingPlaceholder.id
            ? {
                ...e,
                date: paymentData.date,
                item: loan.name,
                description: paymentData.note || loan.name,
                amount: paymentData.amount,
                estimatedCost: e.estimatedCost && e.estimatedCost > 0 ? e.estimatedCost : estAmt,
                actualCost: paymentData.amount,
                difference:
                  loan.direction === 'borrowed'
                    ? (e.estimatedCost && e.estimatedCost > 0 ? e.estimatedCost : estAmt) -
                      paymentData.amount
                    : paymentData.amount -
                      (e.estimatedCost && e.estimatedCost > 0 ? e.estimatedCost : estAmt),
                status: 'Paid',
                loanId: loan.id,
              }
            : e
        );
      } else {
        const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        linkedBudgetEntryId = entryId;
        const newBudgetEntry: BudgetEntry = {
          id: entryId,
          year: parsedYear,
          period: resolvedPeriod,
          periodIndex: resolvedPeriodIdx,
          date: paymentData.date,
          type: targetType,
          category: loan.direction === 'borrowed' ? 'Loans' : 'Other Income',
          item: loan.name,
          description: paymentData.note || loan.name,
          amount: paymentData.amount,
          estimatedCost: estAmt,
          actualCost: paymentData.amount,
          difference: diffAmt,
          status: 'Paid',
          paymentMethod: 'Bank Transfer',
          loanId: loan.id,
          createdAt: new Date().toISOString(),
        };
        updatedEntries = [newBudgetEntry, ...targetBudget.entries];
      }

      const updatedExcluded: Record<string, string[]> = { ...(targetBudget.excludedPeriodItems || {}) };
      if (updatedExcluded[resolvedPeriod] && updatedExcluded[resolvedPeriod].length > 0) {
        const matchingTemplate = (targetBudget.itemTemplates || []).find(
          (t) =>
            t.loanId === loan.id ||
            (loan.linkedTemplateId && t.id === loan.linkedTemplateId) ||
            (t.type === targetType && t.item.trim().toLowerCase() === loanNameLower)
        );
        const keysToUnexclude = getPeriodItemExclusionKeys({
          templateId: matchingTemplate?.id || loan.linkedTemplateId,
          type: targetType,
          item: matchingTemplate?.item || loan.name,
          loanId: loan.id,
        });
        updatedExcluded[resolvedPeriod] = updatedExcluded[resolvedPeriod].filter(
          (k) => !keysToUnexclude.includes(k)
        );
        if (updatedExcluded[resolvedPeriod].length === 0) {
          delete updatedExcluded[resolvedPeriod];
        }
      }

      const updatedBudget: YearBudgetData = {
        ...targetBudget,
        entries: updatedEntries,
        excludedPeriodItems: updatedExcluded,
        lastUpdated: new Date().toISOString(),
      };
      FinanceStorageService.saveLocalBudget(updatedBudget, {
        skipTemplateProfileUpdate: parsedYear !== currentBudget.year,
      });
      if (parsedYear === currentBudget.year) {
        updatedActiveBudget = updatedBudget;
      }
    }

    let linkedLedgerTxId: string | undefined;
    if (paymentData.depositToAccountId) {
      const targetAcc = currentLedger.accounts.find((a) => a.id === paymentData.depositToAccountId);
      if (targetAcc) {
        linkedLedgerTxId = `tx-loan-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        targetAcc.balance += paymentData.amount;
        currentLedger.transactions.push({
          id: linkedLedgerTxId,
          date: paymentData.date,
          year: parsedYear,
          period: resolvedPeriod,
          amount: paymentData.amount,
          accountId: targetAcc.id,
          accountName: targetAcc.name,
          source: 'manual_deposit',
          category: 'General Reserves / Starting Capital',
          note: `Loan Repayment Collected: ${loan.name}`,
        });
      }
    }

    const newPayment: LoanPayment = {
      id: `lpay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      loanId: loan.id,
      date: paymentData.date,
      year: parsedYear,
      period: resolvedPeriod,
      amount: paymentData.amount,
      source: linkedBudgetEntryId ? 'budget_sync' : 'manual_payment',
      budgetEntryId: linkedBudgetEntryId,
      accountId: paymentData.depositToAccountId,
      ledgerTransactionId: linkedLedgerTxId,
      note: paymentData.note,
    };

    loan.payments.push(newPayment);
    const totalPaid =
      (loan.initialPaidAmount || 0) + loan.payments.reduce((s, p) => s + (p.amount || 0), 0);
    loan.status =
      loan.totalContractAmount > 0 && totalPaid + 0.005 >= loan.totalContractAmount
        ? 'completed'
        : 'active';
    loan.updatedAt = new Date().toISOString();

    loans[loanIdx] = loan;
    currentLedger.loans = loans;
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return {
      ledger: currentLedger,
      updatedActiveBudget,
      loan,
      linkedBudgetEntryId,
      resolvedPeriod,
    };
  }

  /**
   * Deletes a loan payment, reversing any linked Savings Account deposit and removing any linked Budget Sheet entry
   */
  static deleteLoanPayment(
    loanId: string,
    paymentId: string,
    currentBudget: YearBudgetData
  ): {
    ledger: SavingsLedgerData;
    updatedActiveBudget?: YearBudgetData;
    loan?: LoanRecord;
    removedPayment?: LoanPayment;
  } {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = [...(currentLedger.loans || [])];
    const loanIdx = loans.findIndex((l) => l.id === loanId);
    if (loanIdx === -1) return { ledger: currentLedger };

    const loan = { ...loans[loanIdx], payments: [...(loans[loanIdx].payments || [])] };
    const targetPay = loan.payments.find((p) => p.id === paymentId);
    if (!targetPay) return { ledger: currentLedger };

    if (targetPay.ledgerTransactionId) {
      const linkedTx = currentLedger.transactions.find(
        (t) => t.id === targetPay.ledgerTransactionId
      );
      if (linkedTx) {
        FinanceStorageService.applyTxBalanceEffect(currentLedger.accounts, linkedTx, true);
        currentLedger.transactions = currentLedger.transactions.filter(
          (t) => t.id !== targetPay.ledgerTransactionId
        );
      } else if (targetPay.accountId) {
        const acc = currentLedger.accounts.find((a) => a.id === targetPay.accountId);
        if (acc) {
          acc.balance = Math.max(0, acc.balance - targetPay.amount);
        }
      }
    } else if (targetPay.accountId) {
      const acc = currentLedger.accounts.find((a) => a.id === targetPay.accountId);
      if (acc) {
        acc.balance = Math.max(0, acc.balance - targetPay.amount);
      }
    }

    let updatedActiveBudget: YearBudgetData | undefined;
    if (targetPay.budgetEntryId) {
      const targetYear = targetPay.year || currentBudget.year;
      const targetBudget =
        targetYear === currentBudget.year
          ? currentBudget
          : FinanceStorageService.loadLocalBudget(targetYear);
      const updatedEntries = targetBudget.entries.filter((e) => e.id !== targetPay.budgetEntryId);
      if (updatedEntries.length !== targetBudget.entries.length) {
        const updatedBudget: YearBudgetData = {
          ...targetBudget,
          entries: updatedEntries,
        };
        FinanceStorageService.saveLocalBudget(updatedBudget, {
          skipTemplateProfileUpdate: targetYear !== currentBudget.year,
        });
        if (targetYear === currentBudget.year) {
          updatedActiveBudget = updatedBudget;
        }
      }
    }

    loan.payments = loan.payments.filter((p) => p.id !== paymentId);
    const totalPaid =
      (loan.initialPaidAmount || 0) + loan.payments.reduce((s, p) => s + (p.amount || 0), 0);
    loan.status =
      loan.totalContractAmount > 0 && totalPaid + 0.005 >= loan.totalContractAmount
        ? 'completed'
        : 'active';
    loan.updatedAt = new Date().toISOString();

    loans[loanIdx] = loan;
    currentLedger.loans = loans;
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    return {
      ledger: currentLedger,
      updatedActiveBudget,
      loan,
      removedPayment: targetPay,
    };
  }

  // --- GOOGLE DRIVE SYNC METHODS ---

  /**
   * Syncs budget to Drive inside the dedicated folder and returns updated file metadata
   */
  static async syncBudgetToDrive(
    accessToken: string,
    budget: YearBudgetData,
    fileId?: string | null
  ): Promise<{ fileId: string; modifiedTime: string; folderId: string }> {
    const fileName = getBudgetFileName(budget.year);
    const result = await saveJsonToDrive(accessToken, fileName, budget, fileId);
    return { fileId: result.id, modifiedTime: result.modifiedTime, folderId: result.folderId };
  }

  /**
   * Fetches budget for year from Google Drive without automatically overwriting localStorage.
   * If does not exist in Drive, returns null.
   */
  static async fetchBudgetFromDrive(
    accessToken: string,
    year: number
  ): Promise<{ budget: YearBudgetData; file: DriveFileInfo } | null> {
    const fileName = getBudgetFileName(year);
    const file = await findDriveFile(accessToken, fileName);
    if (!file) return null;

    const rawData = await downloadJsonFile<YearBudgetData>(accessToken, file.id);
    const { budget: data } = FinanceStorageService.normalizeBudgetTemplates(rawData);
    return { budget: data, file };
  }

  /**
   * Pulls budget for year from Google Drive and saves to local storage.
   */
  static async pullBudgetFromDrive(
    accessToken: string,
    year: number
  ): Promise<{ budget: YearBudgetData; file: DriveFileInfo } | null> {
    const result = await FinanceStorageService.fetchBudgetFromDrive(accessToken, year);
    if (!result) return null;
    if (
      Array.isArray(result.budget.itemTemplates) &&
      result.budget.customCategories
    ) {
      const cleaned = stripDefaultStarterTemplates(result.budget.itemTemplates);
      FinanceStorageService.saveUserTemplateProfile({
        customCategories: result.budget.customCategories,
        itemTemplates: cleaned,
        isPersonalizedTemplate: Boolean((result.budget.isPersonalizedTemplate ?? true) && cleaned.length > 0),
        isDefaultStarterData: Boolean(result.budget.isDefaultStarterData),
      });
    }
    FinanceStorageService.saveLocalBudget(result.budget);
    return result;
  }

  /**
   * Syncs savings ledger to Google Drive inside the dedicated folder
   */
  static async syncLedgerToDrive(
    accessToken: string,
    ledger: SavingsLedgerData,
    fileId?: string | null
  ): Promise<{ fileId: string; modifiedTime: string; folderId: string }> {
    const result = await saveJsonToDrive(accessToken, SAVINGS_LEDGER_FILE_NAME, ledger, fileId);
    return { fileId: result.id, modifiedTime: result.modifiedTime, folderId: result.folderId };
  }

  /**
   * Fetches savings ledger from Google Drive without automatically overwriting localStorage.
   */
  static async fetchLedgerFromDrive(
    accessToken: string
  ): Promise<{ ledger: SavingsLedgerData; file: DriveFileInfo } | null> {
    const file = await findDriveFile(accessToken, SAVINGS_LEDGER_FILE_NAME);
    if (!file) return null;

    const data = await downloadJsonFile<SavingsLedgerData>(accessToken, file.id);
    return { ledger: data, file };
  }

  /**
   * Pulls savings ledger from Google Drive and saves to local storage.
   */
  static async pullLedgerFromDrive(
    accessToken: string
  ): Promise<{ ledger: SavingsLedgerData; file: DriveFileInfo } | null> {
    const result = await FinanceStorageService.fetchLedgerFromDrive(accessToken);
    if (!result) return null;
    FinanceStorageService.saveLocalSavingsLedger(result.ledger);
    return result;
  }

  /**
   * Syncs standalone Estimate Budget & Categories Template (capitalflow_budget_template.json) to Google Drive
   */
  static async syncTemplateToDrive(
    accessToken: string,
    templateData: BudgetTemplateData,
    fileId?: string | null
  ): Promise<{ fileId: string; modifiedTime: string; folderId: string }> {
    const cleanedTemplates = stripDefaultStarterTemplates(templateData.itemTemplates);
    const payload: BudgetTemplateData = {
      ...templateData,
      itemTemplates: cleanedTemplates,
      isPersonalizedTemplate: Boolean(templateData.isPersonalizedTemplate && cleanedTemplates.length > 0),
      version: templateData.version || '1.0.0',
      lastUpdated: templateData.lastUpdated || new Date().toISOString(),
    };
    const result = await saveJsonToDrive(accessToken, BUDGET_TEMPLATE_FILE_NAME, payload, fileId);
    return { fileId: result.id, modifiedTime: result.modifiedTime, folderId: result.folderId };
  }

  /**
   * Fetches standalone Estimate Budget & Categories Template from Google Drive without overwriting local storage
   */
  static async fetchTemplateFromDrive(
    accessToken: string
  ): Promise<{ template: BudgetTemplateData; file: DriveFileInfo } | null> {
    const file = await findDriveFile(accessToken, BUDGET_TEMPLATE_FILE_NAME);
    if (!file) return null;

    const raw = await downloadJsonFile<BudgetTemplateData>(accessToken, file.id);
    const cleanedTemplates = stripDefaultStarterTemplates(raw.itemTemplates);
    const normalized: BudgetTemplateData = {
      version: raw.version || '1.0.0',
      lastUpdated: raw.lastUpdated || file.modifiedTime || new Date().toISOString(),
      isPersonalizedTemplate: Boolean((raw.isPersonalizedTemplate ?? true) && cleanedTemplates.length > 0),
      isDefaultStarterData: Boolean(raw.isDefaultStarterData),
      customCategories: {
        expense: Array.isArray(raw.customCategories?.expense)
          ? raw.customCategories.expense
          : [...EXPENSE_CATEGORIES],
        income: Array.isArray(raw.customCategories?.income)
          ? raw.customCategories.income
          : [...INCOME_CATEGORIES],
        saving: Array.isArray(raw.customCategories?.saving)
          ? raw.customCategories.saving
          : [...SAVING_CATEGORIES],
      },
      itemTemplates: cleanedTemplates,
    };

    return { template: normalized, file };
  }

  /**
   * Pulls standalone Estimate Budget & Categories Template from Google Drive and applies it locally
   */
  static async pullTemplateFromDrive(
    accessToken: string,
    currentBudget: YearBudgetData
  ): Promise<{ template: BudgetTemplateData; updatedBudget: YearBudgetData; file: DriveFileInfo } | null> {
    const result = await FinanceStorageService.fetchTemplateFromDrive(accessToken);
    if (!result) return null;
    const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(result.template, currentBudget);
    return { template: result.template, updatedBudget, file: result.file };
  }

  /**
   * Compares local vs drive timestamps with tolerance
   */
  static compareTimestamps(
    localIso?: string,
    driveIso?: string
  ): 'local_newer' | 'drive_newer' | 'same' {
    if (!localIso && !driveIso) return 'same';
    if (localIso && !driveIso) return 'local_newer';
    if (!localIso && driveIso) return 'drive_newer';

    const localMs = new Date(localIso!).getTime();
    const driveMs = new Date(driveIso!).getTime();

    if (isNaN(localMs) || isNaN(driveMs)) return 'same';

    // 2-second tolerance for sync / save clock differences
    if (Math.abs(localMs - driveMs) <= 2000) {
      return 'same';
    }

    return localMs > driveMs ? 'local_newer' : 'drive_newer';
  }

  /**
   * Discovers all annual files in Google Drive
   */
  static async fetchDriveFiles(accessToken: string): Promise<DriveFileInfo[]> {
    const files = await listCapitalFlowFiles(accessToken);
    files.forEach((file) => {
      const match = file.name.match(/capitalflow_budget_(\d{4})\.json/);
      if (match && match[1]) {
        FinanceStorageService.registerKnownYear(parseInt(match[1], 10), {
          skipFirestoreWrite: true,
        });
      }
    });
    return files;
  }

  /**
   * Finds or creates the dedicated CapitalFlow folder in Google Drive
   */
  static async getOrCreateDriveFolder(accessToken: string, createIfMissing: boolean = false): Promise<DriveFileInfo | null> {
    if (createIfMissing) {
      return ensureCapitalFlowFolder(accessToken);
    }
    return findCapitalFlowFolder(accessToken);
  }

  /**
   * Ensures the dedicated folder exists, cleans duplicate folders, and moves any existing CapitalFlow JSON files into it
   */
  static async organizeFilesIntoFolder(accessToken: string): Promise<{
    folder: DriveFileInfo;
    movedCount: number;
    files: DriveFileInfo[];
    cleanedDuplicatesCount: number;
  }> {
    const res = await organizeCapitalFlowFilesInFolder(accessToken);
    res.files.forEach((file) => {
      const match = file.name.match(/capitalflow_budget_(\d{4})\.json/);
      if (match && match[1]) {
        FinanceStorageService.registerKnownYear(parseInt(match[1], 10), {
          skipFirestoreWrite: true,
        });
      }
    });
    return res;
  }

  /**
   * Clears the in-memory and local storage Drive folder cache
   */
  static clearDriveFolderCache(): void {
    clearDriveFolderCache();
  }
}

