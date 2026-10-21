import { YearBudgetData, SavingsLedgerData, BudgetEntry, SavingsAccount, SavingsTransaction, BudgetItemTemplate, EntryFrequency } from '../types/finance';

export const DEFAULT_SAVINGS_ACCOUNTS: SavingsAccount[] = [
  {
    id: 'acc-hysa',
    name: 'Maya Savings (Digital Bank 5.0% APY)',
    type: 'Digital Bank (High-Yield)',
    institution: 'Maya Bank',
    balance: 0,
    color: '#10b981', // emerald-500
    apy: 5.0,
  },
  {
    id: 'acc-brokerage',
    name: 'Pag-IBIG MP2 (Tax-Free Gov Dividend)',
    type: 'Pag-IBIG MP2 & Gov\'t Savings',
    institution: 'Pag-IBIG Fund',
    balance: 0,
    color: '#3b82f6', // blue-500
    apy: 7.05,
  },
  {
    id: 'acc-roth',
    name: 'BPI Express Teller / Checking',
    type: 'Traditional Bank (Savings / Checking)',
    institution: 'Bank of the Philippine Islands (BPI)',
    balance: 0,
    color: '#8b5cf6', // purple-500
    apy: 0.25,
  },
  {
    id: 'acc-emergency',
    name: 'Primary Emergency Buffer (SeaBank)',
    type: 'Emergency Fund',
    institution: 'SeaBank Philippines',
    balance: 0,
    color: '#f59e0b', // amber-500
    apy: 4.5,
  },
  {
    id: 'acc-gcash',
    name: 'GCash GSave / Wallet',
    type: 'E-Wallet',
    institution: 'GCash (Mynt)',
    balance: 0,
    color: '#06b6d4', // cyan-500
    apy: 2.6,
  },
];

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export const isTemplateValidForPeriod = (
  tpl: BudgetItemTemplate,
  frequency: EntryFrequency,
  period: string
): boolean => {
  const tFreq = tpl.frequency || 'monthly';
  const tBi = tpl.biweeklyPeriod || 'both';

  if (frequency === 'monthly') {
    return tFreq === 'monthly' || tFreq === 'both';
  } else {
    if (tFreq !== 'bi-weekly' && tFreq !== 'both') return false;
    if (tBi === 'both') return true;
    const isP1 = period.endsWith('-P1') || period.includes('P1');
    const isP2 = period.endsWith('-P2') || period.includes('P2');
    if (tBi === 'P1' && isP1) return true;
    if (tBi === 'P2' && isP2) return true;
    return false;
  }
};

export const BIWEEKLY_PERIODS = MONTH_NAMES.flatMap((m, monthIdx) => [
  {
    id: `${m}-P1`,
    label: `${m}-P1`,
    index: monthIdx * 2,
    approxMonth: m,
  },
  {
    id: `${m}-P2`,
    label: `${m}-P2`,
    index: monthIdx * 2 + 1,
    approxMonth: m,
  },
]);

export const EXPENSE_CATEGORIES = [
  'Housing & Rent',
  'Utilities & Bills',
  'Food & Groceries',
  'Transportation',
  'Household & Family',
  'Healthcare & Wellness',
  'Debt & Insurance',
  'Dining & Entertainment',
  'Personal & Shopping',
  'Giving & Charity',
  'Miscellaneous',
];

export const PAYMENT_METHODS = [
  'Cash',
  'Credit Card',
  'GCash Transfer',
  'Kath Account',
  'Checking Account',
  'Bank Transfer',
] as const;

export const INCOME_CATEGORIES = [
  'Salary & Wages',
  'Side Hustle / Freelance',
  'Business / Rental Income',
  '13th Month & Bonuses',
  'Other Income',
];

export const SAVING_CATEGORIES = [
  'Emergency Fund',
  'General Savings',
  'Digital Bank (High-Yield)',
  'Pag-IBIG MP2',
  'Traditional Bank Savings',
  'Time Deposit',
  'Investment / Stocks',
  'Mutual Funds / UITF',
  'Crypto & Digital Assets',
  'Retirement Fund (PERA)',
];

/**
 * Default Starter Estimate Budget for new users who do not have an existing personalized template yet.
 * Uses clean, universal common categories and items.
 */
export const DEFAULT_ITEM_TEMPLATES: BudgetItemTemplate[] = [
  // Common Income Sources
  {
    id: 'tpl-default-salary',
    type: 'income',
    category: 'Salary & Wages',
    item: 'Primary Salary / Paycheck',
    defaultEstimatedCost: 50000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-side-income',
    type: 'income',
    category: 'Side Hustle / Freelance',
    item: 'Extra / Side Income',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },

  // Common Living Expenses
  {
    id: 'tpl-default-housing',
    type: 'expense',
    category: 'Housing & Rent',
    item: 'Rent / Mortgage Payment',
    defaultEstimatedCost: 15000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-electricity',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Electricity Bill',
    defaultEstimatedCost: 3500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-water',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Water Bill',
    defaultEstimatedCost: 600,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-default-internet',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Internet & Wi-Fi',
    defaultEstimatedCost: 1500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-default-mobile',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Mobile Plan / Load',
    defaultEstimatedCost: 600,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-default-groceries',
    type: 'expense',
    category: 'Food & Groceries',
    item: 'Groceries & Supermarket',
    defaultEstimatedCost: 8000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-default-daily-meals',
    type: 'expense',
    category: 'Food & Groceries',
    item: 'Daily Allowance & Meals',
    defaultEstimatedCost: 5000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-default-transport',
    type: 'expense',
    category: 'Transportation',
    item: 'Fuel / Commute & Transit',
    defaultEstimatedCost: 3000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-default-household',
    type: 'expense',
    category: 'Household & Family',
    item: 'Family & Household Support',
    defaultEstimatedCost: 4000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-health',
    type: 'expense',
    category: 'Healthcare & Wellness',
    item: 'Medicine & Vitamins',
    defaultEstimatedCost: 1500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-default-insurance-debt',
    type: 'expense',
    category: 'Debt & Insurance',
    item: 'Insurance / Credit Card Bill',
    defaultEstimatedCost: 3000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-default-dining-sub',
    type: 'expense',
    category: 'Dining & Entertainment',
    item: 'Dining Out & Subscriptions',
    defaultEstimatedCost: 2500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-default-charity',
    type: 'expense',
    category: 'Giving & Charity',
    item: 'Tithes / Charity & Giving',
    defaultEstimatedCost: 2000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-misc',
    type: 'expense',
    category: 'Miscellaneous',
    item: 'Home Maintenance / Buffer',
    defaultEstimatedCost: 1800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },

  // Common Planned Funds / Savings
  {
    id: 'tpl-default-emergency-fund',
    type: 'saving',
    category: 'Emergency Fund',
    item: 'Emergency Fund Allocation',
    defaultEstimatedCost: 4000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-general-savings',
    type: 'saving',
    category: 'General Savings',
    item: 'Long-Term Savings / Investment',
    defaultEstimatedCost: 4000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
];

const DEFAULT_TEMPLATE_IDS = new Set(DEFAULT_ITEM_TEMPLATES.map((t) => t.id));

/**
 * Checks if a template item belongs to the default starter helper template
 */
export function isDefaultStarterTemplateItem(tpl?: BudgetItemTemplate): boolean {
  if (!tpl || !tpl.id) return false;
  return tpl.id.startsWith('tpl-default-') || DEFAULT_TEMPLATE_IDS.has(tpl.id);
}

/**
 * Strips out any default starter template items so they never mix with personalized templates or show on the grid
 */
export function stripDefaultStarterTemplates(templates?: BudgetItemTemplate[]): BudgetItemTemplate[] {
  if (!Array.isArray(templates)) return [];
  return templates.filter((t) => !isDefaultStarterTemplateItem(t));
}

/**
 * Checks if a template list only contains default starter items
 */
export function isLegacyHardcodedTemplate(templates?: BudgetItemTemplate[]): boolean {
  if (!templates || templates.length === 0) return false;
  return templates.every((t) => isDefaultStarterTemplateItem(t));
}

/**
 * Derives category-level planned budgets dynamically from the user's itemTemplates
 */
export function deriveCategoryBudgetsFromTemplates(templates: BudgetItemTemplate[]) {
  const map = new Map<string, { category: string; type: 'income' | 'expense' | 'saving'; plannedAmount: number }>();
  stripDefaultStarterTemplates(templates).forEach((tpl) => {
    const key = `${tpl.type}:${tpl.category}`;
    const existing = map.get(key);
    const amount = tpl.defaultEstimatedCost || 0;
    if (existing) {
      existing.plannedAmount += amount;
    } else if (amount > 0) {
      map.set(key, {
        category: tpl.category,
        type: tpl.type,
        plannedAmount: amount,
      });
    }
  });
  return Array.from(map.values());
}

export function createEmptyYearBudget(
  year: number,
  userProfile?: {
    customCategories?: { income: string[]; expense: string[]; saving: string[] };
    itemTemplates?: BudgetItemTemplate[];
    isPersonalizedTemplate?: boolean;
  }
): YearBudgetData {
  const cleanedUserTemplates = stripDefaultStarterTemplates(userProfile?.itemTemplates).map((t) => ({ ...t }));
  const hasPersonalized = Boolean(userProfile?.isPersonalizedTemplate && cleanedUserTemplates.length > 0);
  const activeTemplates = hasPersonalized ? cleanedUserTemplates : [];

  const activeCategories = userProfile?.customCategories
    ? {
        expense: [...userProfile.customCategories.expense],
        income: [...userProfile.customCategories.income],
        saving: [...userProfile.customCategories.saving],
      }
    : {
        expense: [...EXPENSE_CATEGORIES],
        income: [...INCOME_CATEGORIES],
        saving: [...SAVING_CATEGORIES],
      };

  return {
    year,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    entryMode: 'monthly',
    currency: '₱',
    entries: [],
    customCategories: activeCategories,
    itemTemplates: activeTemplates,
    isPersonalizedTemplate: hasPersonalized,
    budgets: deriveCategoryBudgetsFromTemplates(activeTemplates),
  };
}

export function generateInitial2026Budget(): YearBudgetData {
  return createEmptyYearBudget(2026);
}

export function generateInitialSavingsLedger(_initial2026Budget?: YearBudgetData): SavingsLedgerData {
  return {
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    currency: '₱',
    initialCapital: 0,
    accounts: DEFAULT_SAVINGS_ACCOUNTS.map((acc) => ({
      ...acc,
      balance: 0,
    })),
    transactions: [],
  };
}
