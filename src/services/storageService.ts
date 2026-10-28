import {
  YearBudgetData,
  SavingsLedgerData,
  BudgetTemplateData,
  BudgetEntry,
  SavingsTransaction,
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
} from './sampleData';

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

        const rawExpenseCats = parsed.customCategories?.expense || EXPENSE_CATEGORIES;
        const normalizedExpenseCats: string[] = [];
        rawExpenseCats.forEach((c) => {
          const norm = normalizeCategoryWording(c);
          if (norm !== c) didUpdateCategories = true;
          if (norm && !normalizedExpenseCats.includes(norm)) {
            normalizedExpenseCats.push(norm);
          }
        });

        const rawSavingCats = parsed.customCategories?.saving || SAVING_CATEGORIES;
        const normalizedSavingCats: string[] = [...SAVING_CATEGORIES];
        rawSavingCats.forEach((c) => {
          const norm = normalizeSavingCategoryGroup(c, c);
          if (norm !== c) didUpdateCategories = true;
          if (norm && !normalizedSavingCats.includes(norm)) {
            normalizedSavingCats.push(norm);
          }
        });

        const normalizedProfile: UserTemplateProfile = {
          ...parsed,
          customCategories: {
            expense: normalizedExpenseCats,
            income: [...(parsed.customCategories?.income || INCOME_CATEGORIES)],
            saving: normalizedSavingCats,
          },
          itemTemplates: cleanedTemplates,
          isPersonalizedTemplate: Boolean(parsed.isPersonalizedTemplate && cleanedTemplates.length > 0),
        };
        if (hadDefaultItems || didUpdateCategories) {
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
    const normalizedExpenseCats = (profile.customCategories?.expense || EXPENSE_CATEGORIES)
      .map(normalizeCategoryWording)
      .filter((cat, idx, arr) => Boolean(cat) && arr.indexOf(cat) === idx);
    const normalizedSavingCats = Array.from(
      new Set([
        ...SAVING_CATEGORIES,
        ...(profile.customCategories?.saving || SAVING_CATEGORIES).map((c) =>
          normalizeSavingCategoryGroup(c, c)
        ),
      ])
    ).filter(Boolean);
    const fullData: BudgetTemplateData = {
      version: profile.version || '1.0.0',
      lastUpdated: profile.lastUpdated || new Date().toISOString(),
      isPersonalizedTemplate: Boolean(profile.isPersonalizedTemplate && cleanedTemplates.length > 0),
      customCategories: {
        expense: normalizedExpenseCats,
        income: [...(profile.customCategories?.income || INCOME_CATEGORIES)],
        saving: normalizedSavingCats,
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
        const normalizedExpense: string[] = [];
        budget.customCategories.expense.forEach((c) => {
          const norm = normalizeCategoryWording(c);
          if (norm !== c) didMigrate = true;
          if (norm && !normalizedExpense.includes(norm)) {
            normalizedExpense.push(norm);
          }
        });
        budget.customCategories.expense = normalizedExpense;
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
      FinanceStorageService.saveUserTemplateProfile({
        customCategories: budget.customCategories,
        itemTemplates: budget.itemTemplates,
        isPersonalizedTemplate: Boolean(budget.isPersonalizedTemplate && budget.itemTemplates.length > 0),
      });
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
        let shouldSave = didMigrate;

        if (year === 2026 && localStorage.getItem(OCT_2026_MIGRATION_KEY) !== 'true') {
          const octEntryIds = new Set(OCT_2026_MIGRATED_ACTUAL_ENTRIES.map((e) => e.id));
          const otherEntries = (normalized.entries || []).filter(
            (e) => e.period !== 'Oct' && !octEntryIds.has(e.id)
          );
          normalized.entries = [
            ...OCT_2026_MIGRATED_ACTUAL_ENTRIES.map((e) => ({ ...e })),
            ...otherEntries,
          ];
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
        }

        if (year === 2026 && localStorage.getItem(OCT_2026_TEMPLATE_MIGRATION_KEY) !== 'true') {
          normalized.itemTemplates = MIGRATED_2026_ITEM_TEMPLATES.map((t) => ({ ...t }));
          normalized.isPersonalizedTemplate = true;
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
          FinanceStorageService.saveUserTemplateProfile({
            lastUpdated: new Date().toISOString(),
            customCategories: normalized.customCategories,
            itemTemplates: normalized.itemTemplates,
            isPersonalizedTemplate: true,
          });
          localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');
          shouldSave = true;
        }

        if (shouldSave) {
          localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${year}`, JSON.stringify(normalized));
        }
        return normalized;
      } catch (e) {
        console.error('Failed to parse cached budget for year', year, e);
      }
    }

    const savedProfile = FinanceStorageService.loadUserTemplateProfile();
    const cleanBudget = createEmptyYearBudget(year, savedProfile || undefined);
    if (year === 2026) {
      localStorage.setItem(OCT_2026_MIGRATION_KEY, 'true');
      localStorage.setItem(OCT_2026_TEMPLATE_MIGRATION_KEY, 'true');
    }
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
        if (ledgerMigrated) {
          FinanceStorageService.saveLocalSavingsLedger(parsed);
        }
        return parsed;
      } catch (e) {
        console.error('Failed to parse cached savings ledger', e);
      }
    }

    const budget2026 = FinanceStorageService.loadLocalBudget(2026);
    const initialLedger = generateInitialSavingsLedger(budget2026);
    initialLedger.loans = [];
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
    localStorage.setItem(LOCAL_STORAGE_KEY_LEDGER, JSON.stringify(ledger));
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
      effectiveAmount > 0 &&
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
        ? loans.find((ln) => ln.id === entry.loanId)
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

    let ledgerModified = false;

    // If the entry was previously linked to a different loan, unlinked, or is now deleted/pending/zero, remove from old loan
    if (existingLoan && (!isPaidOrRecorded || !targetLoan || targetLoan.id !== existingLoan.id)) {
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
      const paymentPayload: LoanPayment = {
        id: existingPaymentIdx >= 0 ? activeLoan.payments[existingPaymentIdx].id : `lpay-${entry.id}`,
        loanId: activeLoan.id,
        date: entry.date,
        year: entry.year,
        period: entry.period,
        amount: effectiveAmount,
        source: 'budget_sync',
        budgetEntryId: entry.id,
        note: `${entry.period} ${entry.year} Budget (${entry.item || entry.description || activeLoan.name})`,
      };

      if (existingPaymentIdx >= 0) {
        activeLoan.payments[existingPaymentIdx] = paymentPayload;
      } else {
        activeLoan.payments.push(paymentPayload);
      }
      recalculateLoanStatus(activeLoan);
      ledgerModified = true;
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

    if (isDelete || entry.type !== 'saving' || entry.status === 'Pending' || effectiveAmount <= 0) {
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
          targetAccount.balance += effectiveAmount;
        }
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
        FinanceStorageService.registerKnownYear(parseInt(match[1], 10));
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

