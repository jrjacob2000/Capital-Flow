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
  'Emergency & Safety Net',
  'Short-Term & General Savings',
  'Home & Property Sinking Funds',
  'Vehicle & Maintenance Sinking Funds',
  'Family, Travel & Education Funds',
  'Long-Term & Wealth Investments',
];

export const DEFAULT_SINKING_FUNDS_BY_CATEGORY: Record<string, string[]> = {
  'Emergency & Safety Net': ['Emergency Fund', 'Medical & Health Buffer'],
  'Short-Term & General Savings': ['General Savings', 'Personal Buffer & Reserve'],
  'Home & Property Sinking Funds': ['House Maintenance Fund', 'Home Improvement & Appliance Fund'],
  'Vehicle & Maintenance Sinking Funds': ['Car Maintenance Fund', 'Vehicle Registration & Insurance'],
  'Family, Travel & Education Funds': ['Travel & Vacation Fund', 'Education & Tuition Fund', 'Holiday & Gift Fund'],
  'Long-Term & Wealth Investments': ['Pag-IBIG MP2', 'Retirement Fund (PERA)', 'Time Deposit & High-Yield', 'Stocks, UITF & Crypto'],
};

export const DEFAULT_SINKING_FUND_NAMES: string[] = Object.values(DEFAULT_SINKING_FUNDS_BY_CATEGORY).flat();

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
    defaultEstimatedCost: 25000,
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
    defaultEstimatedCost: 6000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-electricity',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Electricity Bill',
    defaultEstimatedCost: 1500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-water',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Water Bill',
    defaultEstimatedCost: 300,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-default-internet',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Internet & Wi-Fi',
    defaultEstimatedCost: 800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-default-mobile',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Mobile Plan / Load',
    defaultEstimatedCost: 300,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-default-groceries',
    type: 'expense',
    category: 'Food & Groceries',
    item: 'Groceries & Supermarket',
    defaultEstimatedCost: 3500,
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
    defaultEstimatedCost: 2000,
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
    defaultEstimatedCost: 1200,
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
    defaultEstimatedCost: 1500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-health',
    type: 'expense',
    category: 'Healthcare & Wellness',
    item: 'Medicine & Vitamins',
    defaultEstimatedCost: 600,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-default-insurance-debt',
    type: 'expense',
    category: 'Debt & Insurance',
    item: 'Insurance / Credit Card Bill',
    defaultEstimatedCost: 1200,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-default-dining-sub',
    type: 'expense',
    category: 'Dining & Entertainment',
    item: 'Dining Out & Subscriptions',
    defaultEstimatedCost: 1000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-default-charity',
    type: 'expense',
    category: 'Giving & Charity',
    item: 'Tithes / Charity & Giving',
    defaultEstimatedCost: 1000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-misc',
    type: 'expense',
    category: 'Miscellaneous',
    item: 'Home Maintenance / Buffer',
    defaultEstimatedCost: 800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },

  // Common Planned Funds / Savings
  {
    id: 'tpl-default-emergency-fund',
    type: 'saving',
    category: 'Emergency & Safety Net',
    item: 'Emergency Fund',
    defaultEstimatedCost: 1500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-default-general-savings',
    type: 'saving',
    category: 'Short-Term & General Savings',
    item: 'General Savings',
    defaultEstimatedCost: 1500,
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
    const rawAmount = tpl.defaultEstimatedCost || 0;
    const amount =
      tpl.frequency === 'bi-weekly' && (!tpl.biweeklyPeriod || tpl.biweeklyPeriod === 'both')
        ? rawAmount * 2
        : rawAmount;
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

export const IMPROVED_CATEGORY_MAP: Record<string, string> = {
  'Thites-Charity': 'Tithes & Charity',
  'thites-charity': 'Tithes & Charity',
  'Budget-Bills': 'Utilities & Bills',
  'budget-bills': 'Utilities & Bills',
  'Budget-Odiongan': 'Odiongan Household',
  'budget-odiongan': 'Odiongan Household',
  'Budget': 'Daily Living & Essentials',
  'budget': 'Daily Living & Essentials',
  'House': 'Housing & Mortgage',
  'house': 'Housing & Mortgage',
  'Liabilities': 'Debt, Dues & Insurance',
  'liabilities': 'Debt, Dues & Insurance',
  'Intertainment/Shopping/dine': 'Entertainment, Dining & Shopping',
  'intertainment/shopping/dine': 'Entertainment, Dining & Shopping',
  'House Maintenance': 'Home Maintenance',
  'house maintenance': 'Home Maintenance',
  'Car': 'Vehicle & Maintenance',
  'car': 'Vehicle & Maintenance',
  'other': 'Other & Miscellaneous',
  'Other': 'Other & Miscellaneous',
};

export function normalizeCategoryWording(category: string): string {
  if (!category) return category;
  const trimmed = category.trim();
  return IMPROVED_CATEGORY_MAP[trimmed] || IMPROVED_CATEGORY_MAP[trimmed.toLowerCase()] || trimmed;
}

export const OCT_2026_CUSTOM_EXPENSE_CATEGORIES = [
  'Tithes & Charity',
  'Utilities & Bills',
  'Odiongan Household',
  'Daily Living & Essentials',
  'Housing & Mortgage',
  'Debt, Dues & Insurance',
  'Entertainment, Dining & Shopping',
  'Home Maintenance',
  'Vehicle & Maintenance',
  'Other & Miscellaneous',
];

export const MIGRATED_2026_ITEM_TEMPLATES: BudgetItemTemplate[] = [
  // Income Estimates (Total: ₱35,000)
  {
    id: 'tpl-2026-inc-salary',
    type: 'income',
    category: 'Salary & Wages',
    item: 'Salary',
    defaultEstimatedCost: 35000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-inc-apt-rent',
    type: 'income',
    category: 'Business / Rental Income',
    item: 'Extra Income (apartment rent)',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-inc-13th-month',
    type: 'income',
    category: '13th Month & Bonuses',
    item: '13th Month',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-inc-car-rental',
    type: 'income',
    category: 'Business / Rental Income',
    item: 'Extra Income/car rental',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },

  // Monthly Expense & Fund Estimates (Total: ₱35,000)
  {
    id: 'tpl-2026-exp-thites',
    type: 'expense',
    category: 'Tithes & Charity',
    item: 'Thites',
    defaultEstimatedCost: 3500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-exp-meralco',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Meralco',
    defaultEstimatedCost: 1800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-exp-water',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Water',
    defaultEstimatedCost: 350,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-exp-internet',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Internet',
    defaultEstimatedCost: 500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-2026-exp-mobile-load',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Mobile load',
    defaultEstimatedCost: 300,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'GCash Transfer',
  },
  {
    id: 'tpl-2026-exp-groceries-odiongan',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Groceries/budget - odiongan',
    defaultEstimatedCost: 5500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-kath-allowance',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'kath allowance',
    defaultEstimatedCost: 2000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-zack-allowance',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Zack allowance',
    defaultEstimatedCost: 1500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-pamasahe',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Pamasahe',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-dental',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'dental adjustment',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-medicine',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Medicine',
    defaultEstimatedCost: 1000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-motorcycle-gas',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Motorcycle Maintenance/ Gas',
    defaultEstimatedCost: 700,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Kath Account',
    toBeWithdrawn: true,
  },
  {
    id: 'tpl-2026-exp-groceries-me',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Groceries - me',
    defaultEstimatedCost: 1000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-daily-budget',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Daily Budget',
    defaultEstimatedCost: 2500,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-rice',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Rice',
    defaultEstimatedCost: 800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-gasul',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Gasul',
    defaultEstimatedCost: 300,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-sunday-allowance',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Sunday allowance',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-mama-papa',
    type: 'expense',
    category: 'Tithes & Charity',
    item: 'Mama/Papa',
    defaultEstimatedCost: 2000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-pagibig-mortgage',
    type: 'expense',
    category: 'Housing & Mortgage',
    item: 'Pag-ibig Mortgage',
    defaultEstimatedCost: 4800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Checking Account',
  },
  {
    id: 'tpl-2026-exp-prulife',
    type: 'expense',
    category: 'Debt, Dues & Insurance',
    item: 'Credit Card - Prulife - 5k Monthly',
    defaultEstimatedCost: 1200,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-2026-exp-car-gas',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Credit Card -Car Gas',
    defaultEstimatedCost: 800,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-2026-exp-streaming',
    type: 'expense',
    category: 'Entertainment, Dining & Shopping',
    item: 'netflix/prime/Hbo',
    defaultEstimatedCost: 350,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-2026-exp-dine-shoppe',
    type: 'expense',
    category: 'Entertainment, Dining & Shopping',
    item: 'dine and shoppe',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Credit Card',
  },
  {
    id: 'tpl-2026-exp-misc-giving',
    type: 'expense',
    category: 'Tithes & Charity',
    item: 'Miscellanous/Giving/Solicition',
    defaultEstimatedCost: 400,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-house-maintenance',
    type: 'expense',
    category: 'Home Maintenance',
    item: 'House Maintenance',
    defaultEstimatedCost: 400,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-hoa-dues',
    type: 'expense',
    category: 'Debt, Dues & Insurance',
    item: 'HOA monthly dues',
    defaultEstimatedCost: 400,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-car-maintenance',
    type: 'expense',
    category: 'Vehicle & Maintenance',
    item: 'Car Maintenance',
    defaultEstimatedCost: 1000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-motorcycle-reg',
    type: 'expense',
    category: 'Vehicle & Maintenance',
    item: 'Motorcycle Registration',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-vios-reg',
    type: 'expense',
    category: 'Vehicle & Maintenance',
    item: 'Vios Registration',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-sav-savings',
    type: 'saving',
    category: 'Short-Term & General Savings',
    item: 'General Savings',
    defaultEstimatedCost: 2000,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
  {
    id: 'tpl-2026-exp-dog-food',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Dog food and others',
    defaultEstimatedCost: 400,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Cash',
  },
  {
    id: 'tpl-2026-exp-peaceland-meralco',
    type: 'expense',
    category: 'Other & Miscellaneous',
    item: 'peaceland meralco',
    defaultEstimatedCost: 0,
    frequency: 'monthly',
    biweeklyPeriod: 'both',
    defaultPaymentMethod: 'Bank Transfer',
  },
];


export const OCT_2026_MIGRATED_ACTUAL_ENTRIES: BudgetEntry[] = [
  {
    id: 'oct-2026-inc-salary',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'income',
    category: 'Salary & Wages',
    item: 'Salary',
    estimatedCost: 0,
    actualCost: 35000,
    amount: 35000,
    paymentMethod: 'Bank Transfer',
    difference: 35000,
    status: 'Paid',
    reference: '',
    description: 'Salary',
    createdAt: '2026-10-01T08:00:00.000Z',
  },
  {
    id: 'oct-2026-exp-thites',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Tithes & Charity',
    item: 'Thites',
    estimatedCost: 0,
    actualCost: 3500,
    amount: 3500,
    paymentMethod: 'Bank Transfer',
    difference: -3500,
    status: 'Paid',
    reference: '',
    description: 'Thites',
    createdAt: '2026-10-01T08:01:00.000Z',
  },
  {
    id: 'oct-2026-exp-mobile-load',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Utilities & Bills',
    item: 'Mobile load',
    estimatedCost: 0,
    actualCost: 300,
    amount: 300,
    paymentMethod: 'GCash Transfer',
    difference: -300,
    status: 'Paid',
    reference: '',
    description: 'Mobile load',
    createdAt: '2026-10-01T08:02:00.000Z',
  },
  {
    id: 'oct-2026-exp-groceries-odiongan',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Groceries/budget - odiongan',
    estimatedCost: 0,
    actualCost: 5500,
    amount: 5500,
    paymentMethod: 'Kath Account',
    difference: -5500,
    status: 'Paid',
    reference: 'plus uniform',
    toBeWithdrawn: true,
    description: 'Groceries/budget - odiongan',
    createdAt: '2026-10-01T08:03:00.000Z',
  },
  {
    id: 'oct-2026-exp-kath-allowance',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'kath allowance',
    estimatedCost: 0,
    actualCost: 2000,
    amount: 2000,
    paymentMethod: 'Kath Account',
    difference: -2000,
    status: 'Paid',
    reference: '',
    toBeWithdrawn: true,
    description: 'kath allowance',
    createdAt: '2026-10-01T08:04:00.000Z',
  },
  {
    id: 'oct-2026-exp-zack-allowance',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Zack allowance',
    estimatedCost: 0,
    actualCost: 1500,
    amount: 1500,
    paymentMethod: 'Kath Account',
    difference: -1500,
    status: 'Paid',
    reference: '',
    toBeWithdrawn: true,
    description: 'Zack allowance',
    createdAt: '2026-10-01T08:05:00.000Z',
  },
  {
    id: 'oct-2026-exp-medicine',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Medicine',
    estimatedCost: 0,
    actualCost: 1000,
    amount: 1000,
    paymentMethod: 'Kath Account',
    difference: -1000,
    status: 'Paid',
    reference: '',
    toBeWithdrawn: true,
    description: 'Medicine',
    createdAt: '2026-10-01T08:06:00.000Z',
  },
  {
    id: 'oct-2026-exp-motorcycle-gas',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Odiongan Household',
    item: 'Motorcycle Maintenance/ Gas',
    estimatedCost: 0,
    actualCost: 700,
    amount: 700,
    paymentMethod: 'Kath Account',
    difference: -700,
    status: 'Paid',
    reference: '',
    toBeWithdrawn: true,
    description: 'Motorcycle Maintenance/ Gas',
    createdAt: '2026-10-01T08:07:00.000Z',
  },
  {
    id: 'oct-2026-exp-groceries-me',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Groceries - me',
    estimatedCost: 0,
    actualCost: 1000,
    amount: 1000,
    paymentMethod: 'Cash',
    difference: -1000,
    status: 'Paid',
    reference: '',
    description: 'Groceries - me',
    createdAt: '2026-10-01T08:08:00.000Z',
  },
  {
    id: 'oct-2026-exp-daily-budget',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Daily Budget',
    estimatedCost: 0,
    actualCost: 2500,
    amount: 2500,
    paymentMethod: 'Cash',
    difference: -2500,
    status: 'Paid',
    reference: '',
    description: 'Daily Budget',
    createdAt: '2026-10-01T08:09:00.000Z',
  },
  {
    id: 'oct-2026-exp-mama-papa',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Tithes & Charity',
    item: 'Mama/Papa',
    estimatedCost: 0,
    actualCost: 2000,
    amount: 2000,
    paymentMethod: 'Cash',
    difference: -2000,
    status: 'Paid',
    reference: '',
    description: 'Mama/Papa',
    createdAt: '2026-10-01T08:10:00.000Z',
  },
  {
    id: 'oct-2026-exp-pagibig-mortgage',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Housing & Mortgage',
    item: 'Pag-ibig Mortgage',
    estimatedCost: 0,
    actualCost: 4800,
    amount: 4800,
    paymentMethod: 'Checking Account',
    difference: -4800,
    status: 'Paid',
    reference: '',
    description: 'Pag-ibig Mortgage',
    createdAt: '2026-10-01T08:11:00.000Z',
  },
  {
    id: 'oct-2026-exp-prulife',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Debt, Dues & Insurance',
    item: 'Credit Card - Prulife - 5k Monthly',
    estimatedCost: 0,
    actualCost: 1200,
    amount: 1200,
    paymentMethod: 'Credit Card',
    difference: -1200,
    status: 'Paid',
    reference: '',
    description: 'Credit Card - Prulife - 5k Monthly',
    createdAt: '2026-10-01T08:12:00.000Z',
  },
  {
    id: 'oct-2026-exp-car-gas',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Credit Card -Car Gas',
    estimatedCost: 0,
    actualCost: 800,
    amount: 800,
    paymentMethod: 'Credit Card',
    difference: -800,
    status: 'Paid',
    reference: '',
    description: 'Credit Card -Car Gas',
    createdAt: '2026-10-01T08:13:00.000Z',
  },
  {
    id: 'oct-2026-exp-streaming',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Entertainment, Dining & Shopping',
    item: 'netflix/prime/Hbo',
    estimatedCost: 0,
    actualCost: 300,
    amount: 300,
    paymentMethod: 'Credit Card',
    difference: -300,
    status: 'Paid',
    reference: '',
    description: 'netflix/prime/Hbo',
    createdAt: '2026-10-01T08:14:00.000Z',
  },
  {
    id: 'oct-2026-exp-dine-shoppe',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Entertainment, Dining & Shopping',
    item: 'dine and shoppe',
    estimatedCost: 0,
    actualCost: 1800,
    amount: 1800,
    paymentMethod: 'Credit Card',
    difference: -1800,
    status: 'Paid',
    reference: '',
    description: 'dine and shoppe',
    createdAt: '2026-10-01T08:15:00.000Z',
  },
  {
    id: 'oct-2026-exp-house-maintenance',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Home Maintenance',
    item: 'House Maintenance',
    estimatedCost: 0,
    actualCost: 400,
    amount: 400,
    paymentMethod: 'Cash',
    difference: -400,
    status: 'Paid',
    reference: '',
    description: 'House Maintenance',
    createdAt: '2026-10-01T08:16:00.000Z',
  },
  {
    id: 'oct-2026-exp-car-maintenance',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Vehicle & Maintenance',
    item: 'Car Maintenance',
    estimatedCost: 0,
    actualCost: 1000,
    amount: 1000,
    paymentMethod: 'Bank Transfer',
    paymentBreakdown: {
      cash: 300,
      bankTransfer: 700,
    },
    difference: -1000,
    status: 'Paid',
    reference: '',
    description: 'Car Maintenance',
    createdAt: '2026-10-01T08:17:00.000Z',
  },
  {
    id: 'oct-2026-exp-dog-food',
    year: 2026,
    period: 'Oct',
    periodIndex: 9,
    date: '2026-10-01',
    type: 'expense',
    category: 'Daily Living & Essentials',
    item: 'Dog food and others',
    estimatedCost: 0,
    actualCost: 400,
    amount: 400,
    paymentMethod: 'Cash',
    difference: -400,
    status: 'Paid',
    reference: '',
    description: 'Dog food and others',
    createdAt: '2026-10-01T08:18:00.000Z',
  },
];

export function createEmptyYearBudget(
  year: number,
  userProfile?: {
    customCategories?: { income: string[]; expense: string[]; saving: string[] };
    itemTemplates?: BudgetItemTemplate[];
    isPersonalizedTemplate?: boolean;
  }
): YearBudgetData {
  const cleanedUserTemplates = stripDefaultStarterTemplates(userProfile?.itemTemplates).map((t) => ({
    ...t,
    category: normalizeCategoryWording(t.category),
  }));
  const activeTemplates =
    cleanedUserTemplates.length > 0
      ? cleanedUserTemplates
      : MIGRATED_2026_ITEM_TEMPLATES.map((t) => ({ ...t }));
  const hasPersonalized = activeTemplates.length > 0;

  const baseExpenseCats = (
    userProfile?.customCategories?.expense
      ? userProfile.customCategories.expense.map(normalizeCategoryWording)
      : [...EXPENSE_CATEGORIES]
  ).filter((cat, idx, arr) => Boolean(cat) && arr.indexOf(cat) === idx);
  OCT_2026_CUSTOM_EXPENSE_CATEGORIES.forEach((cat) => {
    if (!baseExpenseCats.includes(cat)) {
      baseExpenseCats.push(cat);
    }
  });

  const activeCategories = userProfile?.customCategories
    ? {
        expense: baseExpenseCats,
        income: [...userProfile.customCategories.income],
        saving: [...userProfile.customCategories.saving],
      }
    : {
        expense: baseExpenseCats,
        income: [...INCOME_CATEGORIES],
        saving: [...SAVING_CATEGORIES],
      };

  return {
    year,
    version: '1.0',
    lastUpdated: new Date().toISOString(),
    entryMode: 'monthly',
    currency: '₱',
    entries: year === 2026 ? OCT_2026_MIGRATED_ACTUAL_ENTRIES.map((e) => ({ ...e })) : [],
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

/**
 * Computes Levenshtein edit distance between two lowercase strings for typo detection.
 */
function levenshteinDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

const GENERIC_SAVING_ALIASES = new Set([
  'saving',
  'savings',
  'general saving',
  'general savings',
  'savings fund',
  'saving fund',
  'fund',
  'funds',
  'monthly saving',
  'monthly savings',
]);

/**
 * Finds if a typed fund name is a close match (case-insensitive, singular/plural, or 1-2 char typo)
 * to one of the known Sinking Funds.
 */
export function findClosestSinkingFundMatch(
  inputName: string,
  knownFunds: string[]
): string | null {
  const trimmed = (inputName || '').trim();
  if (!trimmed) return null;
  const lower = trimmed.toLowerCase();

  if (GENERIC_SAVING_ALIASES.has(lower)) {
    const genMatch = knownFunds.find((f) => f.trim().toLowerCase() === 'general savings');
    return genMatch || 'General Savings';
  }

  // 1. Exact case-insensitive or singular/plural match
  const norm = (s: string) => s.trim().toLowerCase().replace(/s$/, '').replace(/[^a-z0-9]/g, '');
  const inputNorm = norm(trimmed);

  for (const candidate of knownFunds) {
    if (!candidate) continue;
    if (candidate.trim().toLowerCase() === lower) {
      return candidate.trim();
    }
    if (inputNorm.length >= 4 && norm(candidate) === inputNorm) {
      return candidate.trim();
    }
  }

  // 2. Typo tolerance (Levenshtein distance <= 2 for strings >= 5 chars)
  if (lower.length >= 5) {
    let bestMatch: string | null = null;
    let bestDist = 99;
    for (const candidate of knownFunds) {
      const candLower = (candidate || '').trim().toLowerCase();
      if (candLower.length < 4) continue;
      const dist = levenshteinDistance(lower, candLower);
      const maxAllowed = Math.min(2, Math.floor(Math.min(lower.length, candLower.length) / 4) + 1);
      if (dist <= maxAllowed && dist < bestDist) {
        bestDist = dist;
        bestMatch = candidate.trim();
      }
    }
    if (bestMatch) return bestMatch;
  }

  return null;
}

/**
 * Maps any Sinking Fund name or legacy saving category into one of the clean Fund Category Groups.
 */
export function normalizeSavingCategoryGroup(fundName?: string, rawCategory?: string): string {
  const fLower = (fundName || '').trim().toLowerCase();
  const cLower = (rawCategory || '').trim().toLowerCase();

  // If rawCategory is already one of the canonical SAVING_CATEGORIES, check if fundName strongly belongs elsewhere first
  const checkText = `${fLower} ${cLower}`;

  if (
    fLower === 'general reserves / starting capital' ||
    cLower === 'unallocated cash pool'
  ) {
    return 'Unallocated Cash Pool';
  }

  if (
    checkText.includes('emergency') ||
    checkText.includes('safety') ||
    checkText.includes('medical') ||
    checkText.includes('health buffer')
  ) {
    return 'Emergency & Safety Net';
  }

  if (
    checkText.includes('house') ||
    checkText.includes('home') ||
    checkText.includes('property') ||
    checkText.includes('appliance') ||
    checkText.includes('renovation')
  ) {
    return 'Home & Property Sinking Funds';
  }

  if (
    checkText.includes('car ') ||
    fLower === 'car' ||
    checkText.includes('vehicle') ||
    checkText.includes('vios') ||
    checkText.includes('motorcycle') ||
    checkText.includes('registration') ||
    checkText.includes('auto ')
  ) {
    return 'Vehicle & Maintenance Sinking Funds';
  }

  if (
    checkText.includes('travel') ||
    checkText.includes('vacation') ||
    checkText.includes('trip') ||
    checkText.includes('education') ||
    checkText.includes('tuition') ||
    checkText.includes('kids') ||
    checkText.includes('school') ||
    checkText.includes('family') ||
    checkText.includes('holiday') ||
    checkText.includes('gift')
  ) {
    return 'Family, Travel & Education Funds';
  }

  if (
    checkText.includes('mp2') ||
    checkText.includes('pag-ibig') ||
    checkText.includes('pagibig') ||
    checkText.includes('retirement') ||
    checkText.includes('pera') ||
    checkText.includes('stock') ||
    checkText.includes('invest') ||
    checkText.includes('uitf') ||
    checkText.includes('mutual') ||
    checkText.includes('crypto') ||
    checkText.includes('time deposit') ||
    checkText.includes('dividend') ||
    checkText.includes('yield')
  ) {
    return 'Long-Term & Wealth Investments';
  }

  const exactCanonicalCat = SAVING_CATEGORIES.find(
    (cat) => cat.toLowerCase() === cLower
  );
  if (exactCanonicalCat) {
    return exactCanonicalCat;
  }

  return 'Short-Term & General Savings';
}

/**
 * Resolves a saving entry or transaction's item/category into a canonical Sinking Fund name,
 * preventing duplicate funds caused by generic item names ("Saving") or minor typos.
 */
export function resolveCanonicalSinkingFundName(
  rawItemName?: string,
  rawCategory?: string,
  knownFunds: string[] = [...DEFAULT_SINKING_FUND_NAMES]
): string {
  const itemClean = (rawItemName || '')
    .replace(/^(Budget Sync|Manual Deposit|Direct Deposit|Withdrawal|Yield):\s*/i, '')
    .trim();
  const catClean = (rawCategory || '').trim();

  const pool = Array.from(
    new Set([
      ...DEFAULT_SINKING_FUND_NAMES,
      ...knownFunds.filter(
        (f) =>
          Boolean(f) &&
          f !== 'Savings / Envelope' &&
          !SAVING_CATEGORIES.some((sc) => sc.toLowerCase() === f.trim().toLowerCase())
      ),
    ])
  );

  // If itemClean is empty, a generic alias ("Saving"/"Savings"), or accidentally set to a broad category name
  if (
    !itemClean ||
    GENERIC_SAVING_ALIASES.has(itemClean.toLowerCase()) ||
    itemClean.toLowerCase() === 'short-term & general savings'
  ) {
    if (
      catClean &&
      catClean !== 'Savings / Envelope' &&
      !GENERIC_SAVING_ALIASES.has(catClean.toLowerCase()) &&
      !SAVING_CATEGORIES.some((sc) => sc.toLowerCase() === catClean.toLowerCase())
    ) {
      return findClosestSinkingFundMatch(catClean, pool) || catClean;
    }
    return 'General Savings';
  }

  if (itemClean.toLowerCase() === 'emergency & safety net') {
    return 'Emergency Fund';
  }

  // Check if itemClean matches or is a slight typo of an existing known fund
  const matchedFromPool = findClosestSinkingFundMatch(itemClean, pool);
  if (matchedFromPool) {
    return matchedFromPool;
  }

  return itemClean;
}



