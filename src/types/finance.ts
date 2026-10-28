export const APP_VERSION = '1.14.0';

export type EntryType = 'income' | 'expense' | 'saving';

export type EntryFrequency = 'monthly' | 'bi-weekly';

export type PaymentMethod =
  | 'Cash'
  | 'Credit Card'
  | 'GCash Transfer'
  | 'Kath Account'
  | 'Checking Account'
  | 'Bank Transfer'
  | 'Other';

export interface BudgetEntry {
  id: string;
  year: number;
  period: string; // e.g. "Jan", "May 14", "P01"
  periodIndex: number; // 0-11 for monthly, 0-25 for bi-weekly
  date: string; // YYYY-MM-DD
  type: EntryType;
  category: string;
  item?: string; // Specific line item name (e.g. Meralco, Kath allowance)
  amount: number; // Actual amount (or estimated if pending)
  estimatedCost?: number;
  actualCost?: number;
  paymentMethod?: PaymentMethod;
  paymentBreakdown?: {
    cash?: number;
    creditCard?: number;
    gcashTransfer?: number;
    kathAccount?: number;
    checkAccount?: number;
    bankTransfer?: number;
  };
  difference?: number; // estimated - actual
  status?: 'Paid' | 'Pending' | 'Scheduled';
  reference?: string; // memo, receipt, notes
  toBeWithdrawn?: boolean; // included in ATM cash withdrawal list
  description: string;
  // If saving entry:
  savingAccountId?: string;
  savingAccountName?: string;
  // If linked to a loan record:
  loanId?: string;
  createdAt: string;
}

export interface WithdrawalAdjustment {
  id: string;
  item: string;
  amount: number; // positive for addition, negative for deduction (e.g. utang)
  note?: string;
}

export interface PeriodSheetSummary {
  period: string;
  totalIncomeEstimated: number;
  totalIncomeActual: number;
  totalExpenseEstimated: number;
  totalExpenseActual: number;
  differenceExpense: number;
  remainingSalaryEstimated: number;
  remainingSalaryActual: number;
  paymentMethodTotals: {
    cash: number;
    creditCard: number;
    gcashTransfer: number;
    kathAccount: number;
    checkAccount: number;
    bankTransfer: number;
  };
  totalToBeWithdrawn: number;
}

export interface CategoryBudget {
  category: string;
  type: EntryType;
  plannedAmount: number; // monthly target
}

export interface BudgetItemTemplate {
  id: string;
  type: EntryType;
  category: string;
  item: string;
  defaultEstimatedCost: number;
  frequency?: 'monthly' | 'bi-weekly' | 'both';
  biweeklyPeriod?: 'P1' | 'P2' | 'both';
  defaultPaymentMethod?: PaymentMethod;
  defaultSavingAccountId?: string;
  toBeWithdrawn?: boolean;
  loanId?: string;
}

export type LoanDirection = 'borrowed' | 'lent';

export type LoanStatus = 'active' | 'completed';

export interface LoanPayment {
  id: string;
  loanId: string;
  date: string;
  year?: number;
  period?: string;
  amount: number;
  source: 'budget_sync' | 'manual_payment';
  budgetEntryId?: string;
  accountId?: string;
  accountName?: string;
  ledgerTransactionId?: string;
  note?: string;
}

export interface LoanRecord {
  id: string;
  name: string;
  direction: LoanDirection; // 'borrowed' (I owe) | 'lent' (Owed to me)
  category: string;
  counterparty?: string; // Lender or Borrower name
  principalAmount: number;
  totalContractAmount: number; // Total fixed payable/receivable amount
  installmentAmount: number; // Fixed periodic installment
  totalInstallments: number; // Total number of fixed installments
  frequency: 'monthly' | 'bi-weekly';
  biweeklyPeriod?: 'P1' | 'P2' | 'both';
  initialPaidAmount: number; // Amount already paid/collected prior to tracking
  initialInstallmentsPaid: number; // Terms already paid prior to tracking
  startDate: string;
  dueDay?: string;
  status: LoanStatus;
  linkedTemplateId?: string;
  payments: LoanPayment[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface YearBudgetData {
  year: number;
  version: string;
  lastUpdated: string;
  entryMode: EntryFrequency;
  currency: string;
  entries: BudgetEntry[];
  budgets: CategoryBudget[];
  customCategories?: {
    income: string[];
    expense: string[];
    saving: string[];
  };
  itemTemplates?: BudgetItemTemplate[];
  isPersonalizedTemplate?: boolean;
  isDefaultStarterData?: boolean;
  notes?: string;
}

export type PhilippineAccountCategory =
  | 'Digital Bank (High-Yield)'
  | 'Traditional Bank (Savings / Checking)'
  | 'E-Wallet'
  | 'Pag-IBIG MP2 & Gov\'t Savings'
  | 'Emergency Fund'
  | 'Time Deposit'
  | 'Stocks & Equities (PSE / Global)'
  | 'Mutual Funds & UITF'
  | 'Crypto & Digital Assets'
  | 'Cash on Hand';

export type SavingsAccountCategory =
  | PhilippineAccountCategory
  | 'High-Yield Savings'
  | 'Brokerage & Stocks'
  | 'Retirement (401k/IRA)'
  | 'Cash / Checking'
  | 'Crypto & Alternative'
  | string;

export interface SavingsAccount {
  id: string;
  name: string;
  type: SavingsAccountCategory;
  institution?: string;
  balance: number;
  color: string;
  apy?: number;
}

export interface SavingsTransaction {
  id: string;
  date: string;
  year: number;
  period: string;
  amount: number;
  accountId: string;
  accountName: string;
  source: 'budget_sync' | 'manual_deposit' | 'interest_yield' | 'withdrawal' | 'transfer' | 'reallocation';
  toAccountId?: string;
  toAccountName?: string;
  toCategory?: string;
  budgetEntryId?: string;
  note: string;
  category?: string;
  runningTotalCapital?: number;
}

export interface SavingsLedgerData {
  version: string;
  lastUpdated: string;
  currency: string;
  initialCapital: number;
  accounts: SavingsAccount[];
  transactions: SavingsTransaction[];
  loans?: LoanRecord[];
  isDefaultStarterData?: boolean;
}

export interface BudgetTemplateData {
  version: string;
  lastUpdated: string;
  isPersonalizedTemplate: boolean;
  isDefaultStarterData?: boolean;
  customCategories: {
    income: string[];
    expense: string[];
    saving: string[];
  };
  itemTemplates: BudgetItemTemplate[];
}

export interface DriveFileInfo {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
  parents?: string[];
  webViewLink?: string;
}

export interface DriveSyncStatus {
  isConfigured: boolean;
  isSignedIn: boolean;
  userEmail: string | null;
  userName: string | null;
  userPhoto: string | null;
  lastSyncedAt: string | null;
  isSyncing: boolean;
  syncMessage?: string | null;
  error: string | null;
  budgetFileId: string | null;
  savingsFileId: string | null;
  templateFileId?: string | null;
  folderId?: string | null;
  folderName?: string;
  isSessionExpired?: boolean;
}



