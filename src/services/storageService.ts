import {
  YearBudgetData,
  SavingsLedgerData,
  BudgetTemplateData,
  BudgetEntry,
  SavingsTransaction,
  DriveFileInfo,
  BudgetItemTemplate,
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
} from './driveService';
import {
  generateInitial2026Budget,
  generateInitialSavingsLedger,
  createEmptyYearBudget,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVING_CATEGORIES,
  isDefaultStarterTemplateItem,
  stripDefaultStarterTemplates,
  deriveCategoryBudgetsFromTemplates,
} from './sampleData';

const LOCAL_STORAGE_KEY_PREFIX = 'capitalflow_local_budget_';
const LOCAL_STORAGE_KEY_LEDGER = 'capitalflow_local_savings_ledger';
const LOCAL_STORAGE_KEY_YEARS = 'capitalflow_known_years';
const LOCAL_STORAGE_KEY_USER_TEMPLATE = 'capitalflow_user_template_profile';
const LIVE_CLEAN_STORAGE_KEY = 'capitalflow_live_clean_v1';

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
}

export class FinanceStorageService {
  /**
   * Loads the user's saved personalized template profile from localStorage if available
   */
  static loadUserTemplateProfile(): UserTemplateProfile | null {
    try {
      const raw = localStorage.getItem(LOCAL_STORAGE_KEY_USER_TEMPLATE);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as UserTemplateProfile;
      if (parsed && Array.isArray(parsed.itemTemplates)) {
        const cleanedTemplates = stripDefaultStarterTemplates(parsed.itemTemplates);
        const hadDefaultItems = cleanedTemplates.length !== parsed.itemTemplates.length;
        const normalizedProfile: UserTemplateProfile = {
          ...parsed,
          itemTemplates: cleanedTemplates,
          isPersonalizedTemplate: Boolean(parsed.isPersonalizedTemplate && cleanedTemplates.length > 0),
        };
        if (hadDefaultItems) {
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
   * Saves the user's personalized template profile to localStorage
   */
  static saveUserTemplateProfile(profile: UserTemplateProfile): BudgetTemplateData {
    const cleanedTemplates = stripDefaultStarterTemplates(profile.itemTemplates).map((t) => ({ ...t }));
    const fullData: BudgetTemplateData = {
      version: profile.version || '1.0.0',
      lastUpdated: profile.lastUpdated || new Date().toISOString(),
      isPersonalizedTemplate: Boolean(profile.isPersonalizedTemplate && cleanedTemplates.length > 0),
      customCategories: {
        expense: [...(profile.customCategories?.expense || EXPENSE_CATEGORIES)],
        income: [...(profile.customCategories?.income || INCOME_CATEGORIES)],
        saving: [...(profile.customCategories?.saving || SAVING_CATEGORIES)],
      },
      itemTemplates: cleanedTemplates,
    };
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY_USER_TEMPLATE, JSON.stringify(fullData));
    } catch (e) {
      console.warn('Could not save user template profile:', e);
    }
    return fullData;
  }

  /**
   * Loads the standalone BudgetTemplateData object (used for capitalflow_budget_template.json)
   */
  static loadLocalTemplateData(fallbackBudget?: YearBudgetData): BudgetTemplateData {
    const saved = FinanceStorageService.loadUserTemplateProfile();
    if (saved) {
      return {
        version: saved.version || '1.0.0',
        lastUpdated: saved.lastUpdated || fallbackBudget?.lastUpdated || new Date().toISOString(),
        isPersonalizedTemplate: Boolean(saved.isPersonalizedTemplate && saved.itemTemplates.length > 0),
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
      return {
        version: '1.0.0',
        lastUpdated: fallbackBudget.lastUpdated || new Date().toISOString(),
        isPersonalizedTemplate: Boolean(fallbackBudget.isPersonalizedTemplate && cleanedFallback.length > 0),
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
      lastUpdated: new Date().toISOString(),
      isPersonalizedTemplate: false,
      customCategories: {
        expense: [...EXPENSE_CATEGORIES],
        income: [...INCOME_CATEGORIES],
        saving: [...SAVING_CATEGORIES],
      },
      itemTemplates: [],
    };
  }

  /**
   * Applies a standalone BudgetTemplateData object to local profile storage and the active year budget
   */
  static applyTemplateDataToBudget(
    templateData: BudgetTemplateData,
    currentBudget: YearBudgetData
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

    FinanceStorageService.saveUserTemplateProfile({
      version: templateData.version || '1.0.0',
      lastUpdated: templateData.lastUpdated || new Date().toISOString(),
      customCategories: normalizedCategories,
      itemTemplates: normalizedTemplates,
      isPersonalizedTemplate: hasPersonalized,
    });

    const updatedBudget: YearBudgetData = {
      ...currentBudget,
      customCategories: normalizedCategories,
      itemTemplates: normalizedTemplates,
      isPersonalizedTemplate: hasPersonalized,
      budgets: deriveCategoryBudgetsFromTemplates(normalizedTemplates),
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);
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

    budget.budgets = deriveCategoryBudgetsFromTemplates(budget.itemTemplates || []);
    return { budget, didMigrate };
  }

  /**
   * Automatically clears legacy demo/sample data once on first load for Go Live
   */
  static checkAndPerformAutoClean(): void {
    try {
      if (typeof window !== 'undefined' && localStorage.getItem(LIVE_CLEAN_STORAGE_KEY) !== 'true') {
        FinanceStorageService.resetAllDataForGoLive();
      }
    } catch (e) {
      console.warn('Auto clean check encountered an error:', e);
    }
  }

  /**
   * Complete reset: deletes all local data stored in localStorage (all annual budgets,
   * personalized estimate budget templates, custom categories, and savings ledger records)
   * to provide a completely clean local state.
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

    const cleanBudget = createEmptyYearBudget(2026);
    FinanceStorageService.saveLocalBudget(cleanBudget);

    const cleanLedger = generateInitialSavingsLedger(cleanBudget);
    FinanceStorageService.saveLocalSavingsLedger(cleanLedger);

    localStorage.setItem(LOCAL_STORAGE_KEY_YEARS, JSON.stringify([2026]));
    localStorage.setItem(LIVE_CLEAN_STORAGE_KEY, 'true');

    return { budget: cleanBudget, ledger: cleanLedger };
  }

  /**
   * Load budget for a specific year.
   * Priority: LocalStorage -> User's Personalized Template Profile -> Default Common Estimate Budget.
   */
  static loadLocalBudget(year: number): YearBudgetData {
    FinanceStorageService.checkAndPerformAutoClean();
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${year}`);
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as YearBudgetData;
        const { budget: normalized, didMigrate } = FinanceStorageService.normalizeBudgetTemplates(parsed);
        if (didMigrate) {
          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${year}`, JSON.stringify(normalized));
        }
        return normalized;
      } catch (e) {
        console.error('Failed to parse cached budget for year', year, e);
      }
    }

    const savedProfile = FinanceStorageService.loadUserTemplateProfile();
    const cleanBudget = createEmptyYearBudget(year, savedProfile || undefined);
    FinanceStorageService.saveLocalBudget(cleanBudget);
    FinanceStorageService.registerKnownYear(year);
    return cleanBudget;
  }

  static saveLocalBudget(budget: YearBudgetData): void {
    budget.lastUpdated = new Date().toISOString();
    budget.budgets = deriveCategoryBudgetsFromTemplates(budget.itemTemplates || []);
    if (budget.customCategories && Array.isArray(budget.itemTemplates)) {
      FinanceStorageService.saveUserTemplateProfile({
        lastUpdated: budget.lastUpdated,
        customCategories: budget.customCategories,
        itemTemplates: budget.itemTemplates,
        isPersonalizedTemplate: Boolean(budget.isPersonalizedTemplate && budget.itemTemplates.length > 0),
      });
    }
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${budget.year}`, JSON.stringify(budget));
    FinanceStorageService.registerKnownYear(budget.year);
  }

  static registerKnownYear(year: number): void {
    const years = FinanceStorageService.getKnownYears();
    if (!years.includes(year)) {
      years.push(year);
      years.sort((a, b) => b - a); // descending
      localStorage.setItem(LOCAL_STORAGE_KEY_YEARS, JSON.stringify(years));
    }
  }

  static getKnownYears(): number[] {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_YEARS);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('Failed to parse known years', e);
      }
    }
    return [2026];
  }

  /**
   * Load savings ledger.
   */
  static loadLocalSavingsLedger(): SavingsLedgerData {
    FinanceStorageService.checkAndPerformAutoClean();
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY_LEDGER);
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        console.error('Failed to parse cached savings ledger', e);
      }
    }

    const budget2026 = FinanceStorageService.loadLocalBudget(2026);
    const initialLedger = generateInitialSavingsLedger(budget2026);
    FinanceStorageService.saveLocalSavingsLedger(initialLedger);
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

  static saveLocalSavingsLedger(ledger: SavingsLedgerData): void {
    ledger.lastUpdated = new Date().toISOString();
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
    localStorage.setItem(LOCAL_STORAGE_KEY_LEDGER, JSON.stringify(ledger));
  }

  /**
   * Sync saving entry from budget into the separate savings ledger
   */
  static accumulateBudgetSavingToLedger(
    entry: BudgetEntry,
    isDelete: boolean = false
  ): SavingsLedgerData {
    const ledger = FinanceStorageService.loadLocalSavingsLedger();

    const existingIndex = ledger.transactions.findIndex(
      (tx) => tx.budgetEntryId === entry.id
    );

    if (isDelete) {
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
      const entryNote = entry.item || entry.description || entry.category || 'Savings';

      if (existingIndex >= 0) {
        // Update existing transaction
        const prev = ledger.transactions[existingIndex];
        const prevAccountId = prev.accountId;
        const prevAmount = prev.amount;

        prev.amount = entry.amount;
        prev.date = entry.date;
        prev.period = entry.period;
        prev.note = entryNote;
        prev.category = entry.category;
        prev.accountId = targetAccount.id;
        prev.accountName = targetAccount.name;

        if (prevAccountId !== targetAccount.id) {
          const oldAcc = ledger.accounts.find((a) => a.id === prevAccountId);
          if (oldAcc) {
            oldAcc.balance = Math.max(0, oldAcc.balance - prevAmount);
          }
          if (targetAccount) {
            targetAccount.balance = Math.max(0, targetAccount.balance + entry.amount);
          }
        } else if (targetAccount) {
          const diff = entry.amount - prevAmount;
          targetAccount.balance = Math.max(0, targetAccount.balance + diff);
        }
      } else {
        // Append new accumulated saving transaction
        const newTx: SavingsTransaction = {
          id: `tx-${entry.id}`,
          date: entry.date,
          year: entry.year,
          period: entry.period,
          amount: entry.amount,
          accountId: targetAccount.id,
          accountName: targetAccount.name,
          source: 'budget_sync',
          budgetEntryId: entry.id,
          category: entry.category,
          note: entryNote,
        };
        ledger.transactions.push(newTx);
        targetAccount.balance += entry.amount;
      }
    }

    FinanceStorageService.saveLocalSavingsLedger(ledger);
    return ledger;
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
        FinanceStorageService.registerKnownYear(parseInt(match[1], 10));
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
   * Ensures the dedicated folder exists and moves any existing CapitalFlow JSON files into it
   */
  static async organizeFilesIntoFolder(accessToken: string): Promise<{
    folder: DriveFileInfo;
    movedCount: number;
    files: DriveFileInfo[];
  }> {
    const res = await organizeCapitalFlowFilesInFolder(accessToken);
    res.files.forEach((file) => {
      const match = file.name.match(/capitalflow_budget_(\d{4})\.json/);
      if (match && match[1]) {
        FinanceStorageService.registerKnownYear(parseInt(match[1], 10));
      }
    });
    return res;
  }
}

