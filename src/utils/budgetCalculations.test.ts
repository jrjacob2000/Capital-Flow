import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  isRegularSalaryIncome,
  aggregateCashflowByPeriod,
  aggregateCategoryDistribution,
  computeCsvRowExportValues,
  computeSinkingFundSavedThisYear,
  normalizeMonthlyTargetToTemplateCost,
  computeAnnualTargetFromTemplate,
  computeLoanMetrics,
  parseDateToYearAndPeriod,
} from './budgetCalculations';
import {
  isTemplateValidForPeriod,
  resolveCanonicalSinkingFundName,
  findClosestSinkingFundMatch,
  normalizeSavingCategoryGroup,
  normalizeCategoryWording,
  deriveCategoryBudgetsFromTemplates,
  stripDefaultStarterTemplates,
} from '../services/sampleData';
import { FinanceStorageService } from '../services/storageService';
import {
  analyzeAndParseWorksheet,
  parseUniversalRowsToEntries,
  detectUniversalColumnMapping,
  parseCurrencyNumber,
} from './excelImportParser';
import {
  getBrowserEnvironmentInfo,
  isMissingInitialStateOrStorageError,
  resolveAuthDomain,
} from '../services/firebase';
import { BudgetEntry, BudgetItemTemplate, LoanRecord, SavingsLedgerData } from '../types/finance';

// Set up in-memory localStorage mock for FinanceStorageService unit tests
const memoryStorage = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (key: string) => (memoryStorage.has(key) ? memoryStorage.get(key)! : null),
  setItem: (key: string, value: string) => {
    memoryStorage.set(key, String(value));
  },
  removeItem: (key: string) => {
    memoryStorage.delete(key);
  },
  clear: () => {
    memoryStorage.clear();
  },
  key: (index: number) => Array.from(memoryStorage.keys())[index] ?? null,
  get length() {
    return memoryStorage.size;
  },
};

function makeEntry(overrides: Partial<BudgetEntry>): BudgetEntry {
  return {
    id: overrides.id || 'e-1',
    year: overrides.year ?? 2026,
    period: overrides.period || 'Oct',
    periodIndex: overrides.periodIndex ?? 9,
    date: overrides.date || '2026-10-01',
    type: overrides.type || 'expense',
    category: overrides.category || 'Utilities & Bills',
    item: overrides.item,
    amount: overrides.amount ?? 0,
    estimatedCost: overrides.estimatedCost,
    actualCost: overrides.actualCost,
    status: overrides.status ?? 'Paid',
    description: overrides.description ?? overrides.item ?? 'Entry',
    createdAt: overrides.createdAt || '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('1. Income Source Filtering (isRegularSalaryIncome)', () => {
  it('identifies regular Salary and Paycheck items as regular income', () => {
    assert.equal(isRegularSalaryIncome('Salary', 'Salary & Wages'), true);
    assert.equal(isRegularSalaryIncome('Primary Salary / Paycheck', 'Salary & Wages'), true);
    assert.equal(isRegularSalaryIncome('Monthly Paycheck', 'Other'), true);
  });

  it('excludes irregular income sources even if categorized under Salary & Wages', () => {
    assert.equal(isRegularSalaryIncome('Extra Income (apartment rent)', 'Business / Rental Income'), false);
    assert.equal(isRegularSalaryIncome('Extra Income (Car rental)', 'Business / Rental Income'), false);
    assert.equal(isRegularSalaryIncome('13th Month Pay', '13th Month & Bonuses'), false);
    assert.equal(isRegularSalaryIncome('Performance Bonus', 'Salary & Wages'), false);
    assert.equal(isRegularSalaryIncome('Freelance Project', 'Side Hustle / Freelance'), false);
    assert.equal(isRegularSalaryIncome('Extra / Side Income', 'Side Hustle / Freelance'), false);
  });
});

describe('2. Cashflow Chart Period Aggregation (aggregateCashflowByPeriod)', () => {
  it('excludes Pending entries and sums Paid/Settled entries accurately', () => {
    const entries: BudgetEntry[] = [
      makeEntry({ id: '1', period: 'Oct', type: 'income', actualCost: 35000, amount: 35000, status: 'Paid' }),
      makeEntry({ id: '2', period: 'Oct', type: 'income', actualCost: 5000, amount: 5000, status: 'Pending' }),
      makeEntry({ id: '3', period: 'Oct', type: 'expense', actualCost: 15000, amount: 15000, status: 'Paid' }),
      makeEntry({ id: '4', period: 'Oct', type: 'expense', actualCost: 4000, amount: 4000, status: 'Pending' }),
      makeEntry({ id: '5', period: 'Oct', type: 'saving', actualCost: 7000, amount: 7000, status: 'Paid' }),
      makeEntry({ id: '6', period: 'Oct', type: 'saving', actualCost: 3000, amount: 3000, status: 'Pending' }),
    ];

    const monthly = aggregateCashflowByPeriod(entries, 'monthly');
    assert.equal(monthly.length, 12);

    const oct = monthly.find((m) => m.label === 'Oct')!;
    assert.ok(oct);
    assert.equal(oct.income, 35000);
    assert.equal(oct.expense, 15000);
    assert.equal(oct.saving, 7000);
    assert.equal(oct.net, 20000);
    assert.equal(oct.savingsRate, 20);
  });

  it('prioritizes actualCost over amount when actualCost is 0', () => {
    const entries: BudgetEntry[] = [
      makeEntry({ id: '1', period: 'Jan-P1', type: 'expense', actualCost: 0, amount: 1500, status: 'Paid' }),
      makeEntry({ id: '2', period: 'Jan-P1', type: 'expense', actualCost: 800, amount: 1200, status: 'Paid' }),
    ];

    const biweekly = aggregateCashflowByPeriod(entries, 'bi-weekly');
    assert.equal(biweekly.length, 24);
    const janP1 = biweekly.find((p) => p.label === 'Jan-P1')!;
    assert.equal(janP1.expense, 800);
  });
});

describe('3. Category Donut Chart Distribution (aggregateCategoryDistribution)', () => {
  it('excludes Pending entries, prioritizes actualCost ?? amount, and filters out <= 0 categories', () => {
    const entries: BudgetEntry[] = [
      makeEntry({ id: '1', type: 'expense', category: 'Housing & Mortgage', actualCost: 6000, amount: 6000, status: 'Paid' }),
      makeEntry({ id: '2', type: 'expense', category: 'Utilities & Bills', actualCost: 4000, amount: 4000, status: 'Paid' }),
      makeEntry({ id: '3', type: 'expense', category: 'Pending Category', actualCost: 9000, amount: 9000, status: 'Pending' }),
      makeEntry({ id: '4', type: 'expense', category: 'Zero Actual Category', actualCost: 0, amount: 2500, status: 'Paid' }),
      makeEntry({ id: '5', type: 'saving', category: 'Emergency & Safety Net', actualCost: 5000, amount: 5000, status: 'Paid' }),
    ];

    const expDist = aggregateCategoryDistribution(entries, 'expense');
    assert.equal(expDist.totalAmount, 10000);
    assert.equal(expDist.categories.length, 2);
    assert.equal(expDist.categories[0].category, 'Housing & Mortgage');
    assert.equal(expDist.categories[0].amount, 6000);
    assert.equal(expDist.categories[0].percentage, 60);
    assert.equal(expDist.categories[1].category, 'Utilities & Bills');
    assert.equal(expDist.categories[1].amount, 4000);
    assert.equal(expDist.categories[1].percentage, 40);
  });
});

describe('4. CSV Export Row Actual & Variance Alignment (computeCsvRowExportValues)', () => {
  it('exports actualCost only when hasActualCost is true AND status is Paid', () => {
    const paidExpense = computeCsvRowExportValues({
      type: 'expense',
      estimatedCost: 2000,
      actualCost: 1750,
      hasActualCost: true,
      status: 'Paid',
    });
    assert.deepEqual(paidExpense, { est: 2000, act: 1750, diff: 250 });

    const pendingExpense = computeCsvRowExportValues({
      type: 'expense',
      estimatedCost: 2000,
      actualCost: 1750,
      hasActualCost: true,
      status: 'Pending',
    });
    assert.deepEqual(pendingExpense, { est: 2000, act: 0, diff: 2000 });

    const paidIncome = computeCsvRowExportValues({
      type: 'income',
      estimatedCost: 35000,
      actualCost: 37500,
      hasActualCost: true,
      status: 'Paid',
    });
    assert.deepEqual(paidIncome, { est: 35000, act: 37500, diff: 2500 });
  });
});

describe('5. Sinking Funds Calculations & Bi-Weekly Target Normalization', () => {
  it('calculates savedThisYear using actualCost ?? amount ?? 0 and ignores Pending entries', () => {
    const entries: BudgetEntry[] = [
      makeEntry({
        id: 's1',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        actualCost: 3000,
        amount: 3000,
        status: 'Paid',
      }),
      makeEntry({
        id: 's2',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        actualCost: 0,
        amount: 3000, // Legacy fallback should NOT override explicit actualCost = 0
        status: 'Paid',
      }),
      makeEntry({
        id: 's3',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        actualCost: 5000,
        amount: 5000,
        status: 'Pending',
      }),
    ];

    const savedMap = computeSinkingFundSavedThisYear(entries);
    assert.equal(savedMap.get('emergency fund'), 3000);
  });

  it('normalizes bi-weekly (both) monthly targets without 2x annual inflation', () => {
    // Monthly target of 4,000 on a bi-weekly ('both') template should store 2,000 per pay period
    const perPeriodCost = normalizeMonthlyTargetToTemplateCost(4000, 'bi-weekly', 'both');
    assert.equal(perPeriodCost, 2000);

    // Annual target from 2,000 bi-weekly ('both') is 2,000 * 24 = 48,000 (which equals 4,000 * 12)
    const annualTarget = computeAnnualTargetFromTemplate(perPeriodCost, 'bi-weekly', 'both');
    assert.equal(annualTarget, 48000);

    // Single bi-weekly period ('P1') or 'monthly' keeps full monthly amount
    const p1Cost = normalizeMonthlyTargetToTemplateCost(4000, 'bi-weekly', 'P1');
    assert.equal(p1Cost, 4000);
    assert.equal(computeAnnualTargetFromTemplate(p1Cost, 'bi-weekly', 'P1'), 48000);
  });

  it('resolves canonical Sinking Fund names with typo tolerance and category grouping', () => {
    assert.equal(resolveCanonicalSinkingFundName('Emergancy Fund', 'Emergency & Safety Net'), 'Emergency Fund');
    assert.equal(resolveCanonicalSinkingFundName('Saving', 'Pag-IBIG MP2'), 'Pag-IBIG MP2');
    assert.equal(findClosestSinkingFundMatch('House Maintenace Fund', ['House Maintenance Fund']), 'House Maintenance Fund');
    assert.equal(normalizeSavingCategoryGroup('Pag-IBIG MP2', 'General Savings'), 'Long-Term & Wealth Investments');
    assert.equal(normalizeCategoryWording('Thites-Charity'), 'Tithes & Charity');
  });
});

describe('6. Loans & Receivables Calculations and Date Year Parsing', () => {
  const sampleLoan: LoanRecord = {
    id: 'loan-1',
    name: 'Car Loan',
    direction: 'borrowed',
    category: 'Auto / Vehicle Loan',
    principalAmount: 100000,
    totalContractAmount: 120000,
    installmentAmount: 5000,
    totalInstallments: 24,
    frequency: 'bi-weekly',
    biweeklyPeriod: 'both',
    initialPaidAmount: 10000,
    initialInstallmentsPaid: 2,
    startDate: '2026-01-01',
    status: 'active',
    payments: [
      {
        id: 'p1',
        loanId: 'loan-1',
        date: '2026-02-01',
        year: 2026,
        period: 'Feb-P1',
        amount: 5000,
        source: 'manual_payment',
      },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };

  it('computes remaining balance, installment counts, and bi-weekly monthly commitment', () => {
    const metrics = computeLoanMetrics(sampleLoan);
    assert.equal(metrics.paymentsSum, 5000);
    assert.equal(metrics.totalPaid, 15000);
    assert.equal(metrics.remainingBalance, 105000);
    assert.equal(metrics.termsPaid, 3);
    assert.equal(metrics.remainingTerms, 21);
    assert.equal(metrics.isCompleted, false);
    // Bi-weekly 'both' doubles 5,000 installment to 10,000 monthly commitment
    assert.equal(metrics.monthlyCommitment, 10000);
  });

  it('auto-marks loan as completed when totalPaid reaches totalContractAmount', () => {
    const paidOffLoan: LoanRecord = {
      ...sampleLoan,
      initialPaidAmount: 115000,
    };
    const metrics = computeLoanMetrics(paidOffLoan);
    assert.equal(metrics.remainingBalance, 0);
    assert.equal(metrics.isCompleted, true);
    assert.equal(metrics.monthlyCommitment, 0);
  });

  it('parses payment date year and period accurately across different years', () => {
    const dec2025Monthly = parseDateToYearAndPeriod('2025-12-20', 2026, 'monthly');
    assert.equal(dec2025Monthly.year, 2025);
    assert.equal(dec2025Monthly.period, 'Dec');
    assert.equal(dec2025Monthly.periodIndex, 11);

    const may2027BiweeklyP2 = parseDateToYearAndPeriod('2027-05-18', 2026, 'bi-weekly');
    assert.equal(may2027BiweeklyP2.year, 2027);
    assert.equal(may2027BiweeklyP2.period, 'May-P2');

    const may2027BiweeklyP1 = parseDateToYearAndPeriod('2027-05-10', 2026, 'bi-weekly');
    assert.equal(may2027BiweeklyP1.year, 2027);
    assert.equal(may2027BiweeklyP1.period, 'May-P1');
  });
});

describe('7. Template Period Validation & Category Budget Derivation', () => {
  const templates: BudgetItemTemplate[] = [
    {
      id: 'user-tpl-1',
      type: 'expense',
      category: 'Utilities & Bills',
      item: 'Electricity',
      defaultEstimatedCost: 2500,
      frequency: 'monthly',
    },
    {
      id: 'user-tpl-2',
      type: 'expense',
      category: 'Food & Groceries',
      item: 'Groceries',
      defaultEstimatedCost: 3000,
      frequency: 'bi-weekly',
      biweeklyPeriod: 'both',
    },
    {
      id: 'user-tpl-3',
      type: 'expense',
      category: 'Housing & Mortgage',
      item: 'Association Dues',
      defaultEstimatedCost: 1200,
      frequency: 'bi-weekly',
      biweeklyPeriod: 'P1',
    },
    {
      id: 'tpl-default-housing',
      type: 'expense',
      category: 'Housing & Rent',
      item: 'Rent / Mortgage Payment',
      defaultEstimatedCost: 6000,
      frequency: 'monthly',
    },
  ];

  it('validates template eligibility for monthly and bi-weekly P1/P2 periods', () => {
    assert.equal(isTemplateValidForPeriod(templates[0], 'monthly', 'Oct'), true);
    assert.equal(isTemplateValidForPeriod(templates[0], 'bi-weekly', 'Oct-P1'), false);

    assert.equal(isTemplateValidForPeriod(templates[1], 'bi-weekly', 'Oct-P1'), true);
    assert.equal(isTemplateValidForPeriod(templates[1], 'bi-weekly', 'Oct-P2'), true);

    assert.equal(isTemplateValidForPeriod(templates[2], 'bi-weekly', 'Oct-P1'), true);
    assert.equal(isTemplateValidForPeriod(templates[2], 'bi-weekly', 'Oct-P2'), false);
  });

  it('strips default starter templates and doubles bi-weekly (both) costs in deriveCategoryBudgetsFromTemplates', () => {
    const stripped = stripDefaultStarterTemplates(templates);
    assert.equal(stripped.length, 3);

    const budgets = deriveCategoryBudgetsFromTemplates(templates);
    const foodBudget = budgets.find((b) => b.category === 'Food & Groceries')!;
    const housingBudget = budgets.find((b) => b.category === 'Housing & Mortgage')!;
    const defaultStarterBudget = budgets.find((b) => b.category === 'Housing & Rent');

    assert.equal(foodBudget.plannedAmount, 6000); // 3000 * 2
    assert.equal(housingBudget.plannedAmount, 1200); // P1 only -> 1200
    assert.equal(defaultStarterBudget, undefined);
  });
});

describe('8. Storage Service Security & Ledger Synchronization', () => {
  beforeEach(() => {
    memoryStorage.clear();
  });

  it('sanitizes imported JSON against prototype pollution keys', () => {
    const rawMalicious = JSON.parse(
      '{"year":2026,"__proto__":{"polluted":true},"constructor":{"prototype":{"bad":1}},"nested":{"ok":123}}'
    );
    const sanitized = FinanceStorageService.sanitizeImportedJson<any>(rawMalicious);
    assert.equal(sanitized.year, 2026);
    assert.equal(sanitized.nested.ok, 123);
    assert.equal( Object.prototype.hasOwnProperty.call(sanitized, '__proto__'), false);
    assert.equal( Object.prototype.hasOwnProperty.call(sanitized, 'constructor'), false);
    assert.equal(({} as any).polluted, undefined);
  });

  it('accumulates Paid saving entries to ledger and removes them when switched to Pending or deleted', () => {
    const initialLedger: SavingsLedgerData = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      currency: '₱',
      initialCapital: 10000,
      accounts: [
        {
          id: 'acc-1',
          name: 'Maya Savings',
          type: 'Digital Bank (High-Yield)',
          balance: 10000,
          color: '#10b981',
        },
      ],
      transactions: [],
      loans: [],
    };
    FinanceStorageService.saveLocalSavingsLedger(initialLedger);

    const savingEntry = makeEntry({
      id: 'sav-entry-1',
      type: 'saving',
      category: 'Emergency & Safety Net',
      item: 'Emergency Fund',
      actualCost: 2500,
      amount: 2500,
      status: 'Paid',
      savingAccountId: 'acc-1',
      savingAccountName: 'Maya Savings',
    });

    // 1. Sync Paid saving entry -> adds 2,500 to account and creates budget_sync transaction
    const afterPaid = FinanceStorageService.accumulateBudgetSavingToLedger(savingEntry, false);
    assert.equal(afterPaid.accounts[0].balance, 12500);
    assert.equal(afterPaid.transactions.length, 1);
    assert.equal(afterPaid.transactions[0].amount, 2500);
    assert.equal(afterPaid.transactions[0].runningTotalCapital, 12500);

    // 2. Switching entry to Pending -> rolls back transaction and account balance
    const pendingEntry: BudgetEntry = { ...savingEntry, status: 'Pending' };
    const afterPending = FinanceStorageService.accumulateBudgetSavingToLedger(pendingEntry, false);
    assert.equal(afterPending.accounts[0].balance, 10000);
    assert.equal(afterPending.transactions.length, 0);
  });

  it('syncs budget loan payment entries to loan records and updates completion status', () => {
    const ledgerWithLoan: SavingsLedgerData = {
      version: '1.0',
      lastUpdated: new Date().toISOString(),
      currency: '₱',
      initialCapital: 0,
      accounts: [],
      transactions: [],
      loans: [
        {
          id: 'ln-pagibig',
          name: 'Pag-IBIG MPL',
          direction: 'borrowed',
          category: 'Government Loan (SSS / Pag-IBIG)',
          principalAmount: 10000,
          totalContractAmount: 10000,
          installmentAmount: 2000,
          totalInstallments: 5,
          frequency: 'monthly',
          initialPaidAmount: 8000,
          initialInstallmentsPaid: 4,
          startDate: '2026-01-01',
          status: 'active',
          payments: [],
          createdAt: '2026-01-01T00:00:00.000Z',
          updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ],
    };
    FinanceStorageService.saveLocalSavingsLedger(ledgerWithLoan);

    const loanBudgetEntry = makeEntry({
      id: 'exp-loan-final',
      type: 'expense',
      category: 'Loans',
      item: 'Pag-IBIG MPL',
      actualCost: 2000,
      amount: 2000,
      status: 'Paid',
      loanId: 'ln-pagibig',
    });

    const { ledger: syncedLedger, matchedLoan } =
      FinanceStorageService.syncBudgetLoanPaymentToLedger(loanBudgetEntry, false);
    assert.ok(matchedLoan);
    assert.equal(matchedLoan.payments.length, 1);
    assert.equal(matchedLoan.payments[0].amount, 2000);
    assert.equal(matchedLoan.status, 'completed');
    assert.equal(syncedLedger.loans![0].status, 'completed');
  });
});

describe('9. Universal & Multi-Section Excel / CSV Importer (excelImportParser)', () => {
  it('auto-detects and parses the classic multi-section budget layout (Home_Buget_2026 style)', () => {
    const structuredRows = [
      ['', '', 'Income', 'Estimated', 'Actual'],
      ['', '', 'Monthly Salary', 40000, 42000],
      ['', '', 'Total Income', 40000, 42000],
      [],
      [
        '',
        'Category',
        'Item',
        'Estimated Cost',
        'Actual Cost',
        'Stay in ATM',
        'Cash',
        'Credit Card',
        'GCash Transfer',
        'Kath Account',
        'Check Account',
        'Bank Transfer',
        'Difference',
        'Status',
        'Reference',
      ],
      ['', 'Utilities', 'Meralco Bill', 3500, 3200, 0, 0, 0, 3200, 0, 0, 0, 300, 'Paid', 'Ref-101'],
      ['', 'Savings', 'Emergency Fund', 5000, 5000, 0, 0, 0, 0, 0, 0, 5000, 0, 'Paid', 'Monthly reserve'],
      ['', '', 'Expenses Total Summary', 8500, 8200],
    ];

    const res = analyzeAndParseWorksheet(structuredRows, 2026, 'Oct');
    assert.equal(res.detectedMode, 'structured');
    assert.equal(res.entries.length, 3);

    const income = res.entries.find((e) => e.type === 'income')!;
    assert.equal(income.item, 'Monthly Salary');
    assert.equal(income.actualCost, 42000);

    const expense = res.entries.find((e) => e.type === 'expense')!;
    assert.equal(expense.item, 'Meralco Bill');
    assert.equal(expense.paymentMethod, 'GCash Transfer');
    assert.equal(expense.actualCost, 3200);

    const saving = res.entries.find((e) => e.type === 'saving')!;
    assert.equal(saving.item, 'Emergency Fund');
    assert.equal(saving.actualCost, 5000);
  });

  it('auto-detects and parses any universal flat table starting in Column A', () => {
    const universalRows = [
      ['Date', 'Type', 'Category', 'Description', 'Amount', 'Payment Method', 'Notes'],
      ['2026-10-01', 'Income', 'Salary & Wages', 'Payroll Credit', '₱45,000.00', 'Bank Transfer', '15th'],
      ['2026-10-05', 'Expense', 'Utilities', 'Internet Bill', '1,699.00', 'Credit Card', 'Auto'],
      ['2026-10-10', 'Savings', 'Emergency Fund', 'Emergency Fund', '4,000', 'GCash', 'Save'],
      ['', '', 'Total', 'Total', '50,699.00', '', ''],
    ];

    const res = analyzeAndParseWorksheet(universalRows, 2026, 'Oct');
    assert.equal(res.detectedMode, 'universal');
    // Total row is automatically skipped
    assert.equal(res.entries.length, 3);
    assert.equal(res.entries[0].type, 'income');
    assert.equal(res.entries[0].actualCost, 45000);
    assert.equal(res.entries[1].type, 'expense');
    assert.equal(res.entries[1].item, 'Internet Bill');
    assert.equal(res.entries[1].paymentMethod, 'Credit Card');
    assert.equal(res.entries[2].type, 'saving');
    assert.equal(res.entries[2].paymentMethod, 'GCash Transfer');
  });

  it('supports custom column mapping for minimal 2-column or headerless spreadsheets', () => {
    const customRows = [
      ['Supermarket Groceries', '2,450.50'],
      ['Water Bill', '680.00'],
    ];

    const { mapping } = detectUniversalColumnMapping(customRows);
    const customMapping = {
      ...mapping,
      hasHeaderRow: false,
      itemCol: 0,
      actualCol: 1,
      defaultEntryType: 'expense' as const,
      defaultCategory: 'Budget',
    };

    const parsed = parseUniversalRowsToEntries(customRows, customMapping, 2026, 'Oct');
    assert.equal(parsed.entries.length, 2);
    assert.equal(parsed.entries[0].item, 'Supermarket Groceries');
    assert.equal(parsed.entries[0].actualCost, 2450.5);
    assert.equal(parsed.entries[0].category, 'Daily Living & Essentials');
  });

  it('correctly resolves bi-weekly period index and default date (Oct-P1 and Oct-P2) during Excel import', () => {
    const rows = [
      ['Description', 'Amount'],
      ['Bi-Weekly Payroll', '25,000'],
      ['Electricity Bill', '1,800'],
    ];

    const p1Res = analyzeAndParseWorksheet(rows, 2026, 'Oct-P1');
    assert.equal(p1Res.entries.length, 2);
    assert.equal(p1Res.entries[0].period, 'Oct-P1');
    assert.equal(p1Res.entries[0].periodIndex, 18); // Oct is month index 9 -> 9 * 2 = 18
    assert.equal(p1Res.entries[0].date, '2026-10-01');

    const p2Res = analyzeAndParseWorksheet(rows, 2026, 'Oct-P2');
    assert.equal(p2Res.entries.length, 2);
    assert.equal(p2Res.entries[0].period, 'Oct-P2');
    assert.equal(p2Res.entries[0].periodIndex, 19); // Oct-P2 is index 19
    assert.equal(p2Res.entries[0].date, '2026-10-16');
  });
});

describe('12. In-App Browser (Messenger / WebView) & New User Auth Protection', () => {
  it('detects Facebook Messenger iOS in-app browser and WKWebView environments', () => {
    const messengerIosUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/MessengerForiOS;FBAV/455.0.0.35.109;FBBV/576875421]';
    const info1 = getBrowserEnvironmentInfo(messengerIosUa, '');
    assert.equal(info1.isInAppBrowser, true);
    assert.equal(info1.browserName, 'Messenger');
    assert.equal(info1.isIOS, true);

    // Stripped iOS WKWebView inside Messenger (missing Safari/ token)
    const strippedIosWebViewUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
    const info2 = getBrowserEnvironmentInfo(strippedIosWebViewUa, 'https://l.messenger.com/');
    assert.equal(info2.isInAppBrowser, true);
    assert.equal(info2.browserName, 'Messenger');

    // Standard Mobile Safari on iOS should NOT be flagged as an in-app browser
    const realMobileSafariUa =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';
    const safariInfo = getBrowserEnvironmentInfo(realMobileSafariUa, '');
    assert.equal(safariInfo.isInAppBrowser, false);
  });

  it('detects Firebase missing initial state & partitioned sessionStorage errors and resolves same-origin authDomain', () => {
    const firebaseHandlerErr = new Error(
      'Unable to process request due to missing initial state. This may happen if browser sessionStorage is inaccessible or accidentally cleared. Some specific scenarios are - 1) Using IDP-Initiated SAML SSO. 2) Using signInWithRedirect in a storage-partitioned browser environment.'
    );
    assert.equal(isMissingInitialStateOrStorageError(firebaseHandlerErr), true);
    assert.equal(isMissingInitialStateOrStorageError({ code: 'auth/missing-initial-state' }), true);
    assert.equal(isMissingInitialStateOrStorageError({ code: 'auth/user-cancelled' }), false);

    // Same-origin authDomain on .web.app vs .firebaseapp.com
    assert.equal(
      resolveAuthDomain('capital-flow-37dfa.firebaseapp.com', 'capital-flow-37dfa', 'capital-flow-37dfa.web.app'),
      'capital-flow-37dfa.web.app'
    );
    assert.equal(
      resolveAuthDomain('capital-flow-37dfa.firebaseapp.com', 'capital-flow-37dfa', 'example.run.app'),
      'capital-flow-37dfa.firebaseapp.com'
    );
  });

  it('initializes a completely blank workspace for new users via startFreshBlankWorkspace and keeps it blank across reloads and new years', () => {
    memoryStorage.clear();
    const { budget, ledger, templateData } = FinanceStorageService.startFreshBlankWorkspace(2026);
    assert.equal(budget.entries.length, 0);
    assert.equal(budget.itemTemplates?.length, 0);
    assert.equal(budget.isDefaultStarterData, false);
    assert.equal(ledger.transactions.length, 0);
    assert.equal(templateData.itemTemplates.length, 0);

    // Reloading 2026 from local storage must remain blank
    const reloaded2026 = FinanceStorageService.loadLocalBudget(2026);
    assert.equal(reloaded2026.entries.length, 0);
    assert.equal(reloaded2026.itemTemplates?.length, 0);
    assert.equal(reloaded2026.isDefaultStarterData, false);

    // Creating a new year (2027) after starting blank must NOT re-populate sample Odiongan/Kath templates
    const budget2027 = FinanceStorageService.loadLocalBudget(2027);
    assert.equal(budget2027.entries.length, 0);
    assert.equal(budget2027.itemTemplates?.length, 0);
    assert.equal(budget2027.isDefaultStarterData, false);
    assert.equal(budget2027.customCategories?.expense.includes('Odiongan'), false);
  });

  it('preserves recorded budget entries when applying a template JSON onto the latest saved budget', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const budgetWithEntries = FinanceStorageService.loadLocalBudget(2026);
    budgetWithEntries.entries = [
      makeEntry({
        id: 'imported-1',
        year: 2026,
        period: 'Oct',
        type: 'expense',
        category: 'Utilities',
        item: 'Meralco',
        actualCost: 3100,
        amount: 3100,
      }),
    ];
    FinanceStorageService.saveLocalBudget(budgetWithEntries);

    const latestFromDisk = FinanceStorageService.loadLocalBudget(2026);
    const updated = FinanceStorageService.applyTemplateDataToBudget(
      {
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        isPersonalizedTemplate: true,
        customCategories: {
          income: ['Salary & Wages'],
          expense: ['Utilities', 'Subscriptions'],
          saving: ['Emergency Fund'],
        },
        itemTemplates: [
          {
            id: 'tpl-net',
            type: 'expense',
            category: 'Subscriptions',
            item: 'Fiber Internet',
            defaultEstimatedCost: 1699,
            defaultPaymentMethod: 'Credit Card',
          },
        ],
      },
      latestFromDisk
    );

    assert.equal(updated.entries.length, 1);
    assert.equal(updated.entries[0].item, 'Meralco');
    assert.equal(updated.itemTemplates?.length, 1);
    assert.equal(updated.itemTemplates?.[0].item, 'Fiber Internet');
  });

  it('parseCurrencyNumber handles currency-prefixed negative amounts and accounting parentheses', () => {
    assert.equal(parseCurrencyNumber('₱-1,250.50'), -1250.5);
    assert.equal(parseCurrencyNumber('₱ -500'), -500);
    assert.equal(parseCurrencyNumber('-₱3,400.00'), -3400);
    assert.equal(parseCurrencyNumber('(2,100.75)'), -2100.75);
    assert.equal(parseCurrencyNumber('₱4,500.00'), 4500);
  });
});

describe('13. Cross-Module Synchronization (Loans, Funds Ledger & Multi-Year Template Integrity)', () => {
  it('recalculates runningTotalCapital chronologically when out-of-order saving entries are added, updated, or deleted', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const initialLedger = FinanceStorageService.loadLocalSavingsLedger();
    initialLedger.initialCapital = 10000;
    initialLedger.accounts[0].balance = 10000;
    FinanceStorageService.saveLocalSavingsLedger(initialLedger);

    // 1. Add a later saving entry (Oct 15: +3,000)
    const octEntry = makeEntry({
      id: 'sav-oct',
      year: 2026,
      period: 'Oct',
      date: '2026-10-15',
      type: 'saving',
      category: 'Emergency Fund',
      item: 'Emergency Fund',
      actualCost: 3000,
      amount: 3000,
      status: 'Paid',
      savingAccountId: initialLedger.accounts[0].id,
      savingAccountName: initialLedger.accounts[0].name,
    });
    let ledger = FinanceStorageService.accumulateBudgetSavingToLedger(octEntry, false);
    assert.equal(ledger.transactions.length, 1);
    assert.equal(ledger.transactions[0].runningTotalCapital, 13000);

    // 2. Add an earlier saving entry out-of-order (Sep 10: +2,000)
    const sepEntry = makeEntry({
      id: 'sav-sep',
      year: 2026,
      period: 'Sep',
      date: '2026-09-10',
      type: 'saving',
      category: 'Emergency Fund',
      item: 'Emergency Fund',
      actualCost: 2000,
      amount: 2000,
      status: 'Paid',
      savingAccountId: initialLedger.accounts[0].id,
      savingAccountName: initialLedger.accounts[0].name,
    });
    ledger = FinanceStorageService.accumulateBudgetSavingToLedger(sepEntry, false);
    assert.equal(ledger.transactions.length, 2);
    // Chronological order: Sep 10 first (10000 + 2000 = 12000), Oct 15 second (12000 + 3000 = 15000)
    assert.equal(ledger.transactions[0].id, 'tx-sav-sep');
    assert.equal(ledger.transactions[0].runningTotalCapital, 12000);
    assert.equal(ledger.transactions[1].id, 'tx-sav-oct');
    assert.equal(ledger.transactions[1].runningTotalCapital, 15000);
    assert.equal(ledger.accounts[0].balance, 15000);

    // 3. Update the Sep 10 entry from 2,000 to 4,500
    ledger = FinanceStorageService.accumulateBudgetSavingToLedger(
      { ...sepEntry, actualCost: 4500, amount: 4500 },
      false
    );
    assert.equal(ledger.transactions[0].runningTotalCapital, 14500);
    assert.equal(ledger.transactions[1].runningTotalCapital, 17500);
    assert.equal(ledger.accounts[0].balance, 17500);

    // 4. Delete the Sep 10 entry
    ledger = FinanceStorageService.accumulateBudgetSavingToLedger(sepEntry, true);
    assert.equal(ledger.transactions.length, 1);
    assert.equal(ledger.transactions[0].id, 'tx-sav-oct');
    assert.equal(ledger.transactions[0].runningTotalCapital, 13000);
    assert.equal(ledger.accounts[0].balance, 13000);
  });

  it('preserves global user template profile when saving another year with skipTemplateProfileUpdate: true', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const budget2026 = FinanceStorageService.loadLocalBudget(2026);
    budget2026.itemTemplates = [
      {
        id: 'tpl-custom-1',
        type: 'expense',
        category: 'Utilities & Bills',
        item: 'Home Fiber 500Mbps',
        defaultEstimatedCost: 2499,
        defaultPaymentMethod: 'Credit Card',
      },
    ];
    budget2026.isPersonalizedTemplate = true;
    FinanceStorageService.saveLocalBudget(budget2026);

    // Initialize a blank 2027 year with skipTemplateProfileUpdate: true
    const blank2027 = FinanceStorageService.loadLocalBudget(2027);
    blank2027.itemTemplates = [];
    blank2027.isPersonalizedTemplate = false;
    FinanceStorageService.saveLocalBudget(blank2027, { skipTemplateProfileUpdate: true });

    // Global template profile must still contain Home Fiber 500Mbps
    const savedProfile = FinanceStorageService.loadUserTemplateProfile();
    assert.equal(savedProfile?.itemTemplates.length, 1);
    assert.equal(savedProfile?.itemTemplates[0].item, 'Home Fiber 500Mbps');
  });

  it('synchronizes loan payments, loan status, and linked savings account transactions across Budget Sheet edits and deletions', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    const accId = ledger.accounts[0].id;
    ledger.initialCapital = 20000;
    ledger.accounts[0].balance = 20000;

    // Create an active Lent Loan (Receivable) of 10,000 with 5,000 already collected
    ledger.loans = [
      {
        id: 'loan-lent-1',
        name: 'Personal Receivable - Alex',
        direction: 'lent',
        category: 'Personal Receivable',
        principalAmount: 10000,
        totalContractAmount: 10000,
        installmentAmount: 2500,
        totalInstallments: 4,
        initialPaidAmount: 5000,
        initialInstallmentsPaid: 2,
        frequency: 'monthly',
        startDate: '2026-08-01',
        status: 'active',
        payments: [
          {
            id: 'lpay-existing',
            loanId: 'loan-lent-1',
            date: '2026-10-05',
            year: 2026,
            period: 'Oct',
            amount: 2500,
            source: 'budget_sync',
            budgetEntryId: 'entry-loan-oct',
            accountId: accId,
            ledgerTransactionId: 'tx-loan-oct',
            note: 'Oct collection',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    ledger.transactions = [
      {
        id: 'tx-loan-oct',
        date: '2026-10-05',
        year: 2026,
        period: 'Oct',
        amount: 2500,
        accountId: accId,
        accountName: ledger.accounts[0].name,
        source: 'manual_deposit',
        category: 'General Reserves / Starting Capital',
        note: 'Loan Repayment Collected: Personal Receivable - Alex',
        runningTotalCapital: 22500,
      },
    ];
    ledger.accounts[0].balance = 22500;
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    // 1. User updates the Oct Budget Sheet entry from 2,500 to 5,000 (which settles the remaining 5,000 of the 10,000 contract!)
    const updatedOctEntry = makeEntry({
      id: 'entry-loan-oct',
      year: 2026,
      period: 'Oct',
      date: '2026-10-06',
      type: 'income',
      category: 'Other Income',
      item: 'Personal Receivable - Alex',
      actualCost: 5000,
      amount: 5000,
      status: 'Paid',
      loanId: 'loan-lent-1',
    });

    const syncRes1 = FinanceStorageService.syncBudgetLoanPaymentToLedger(updatedOctEntry, false);
    assert.ok(syncRes1.matchedLoan);
    assert.equal(syncRes1.matchedLoan?.status, 'completed');
    assert.equal(syncRes1.matchedLoan?.payments.length, 1);
    assert.equal(syncRes1.matchedLoan?.payments[0].amount, 5000);
    // Preserves accountId & ledgerTransactionId and updates the savings account balance (+2,500 delta -> 25,000)
    assert.equal(syncRes1.matchedLoan?.payments[0].accountId, accId);
    assert.equal(syncRes1.matchedLoan?.payments[0].ledgerTransactionId, 'tx-loan-oct');
    assert.equal(syncRes1.ledger.accounts[0].balance, 25000);
    assert.equal(syncRes1.ledger.transactions[0].amount, 5000);
    assert.equal(syncRes1.ledger.transactions[0].runningTotalCapital, 25000);

    // 2. User deletes the Oct Budget Sheet entry -> rolls back the loan payment, reverts loan to 'active', and reverses the 5,000 deposit from the savings account
    const syncRes2 = FinanceStorageService.syncBudgetLoanPaymentToLedger(updatedOctEntry, true);
    assert.ok(syncRes2.matchedLoan);
    assert.equal(syncRes2.matchedLoan?.status, 'active');
    assert.equal(syncRes2.matchedLoan?.payments.length, 0);
    assert.equal(syncRes2.ledger.transactions.length, 0);
    assert.equal(syncRes2.ledger.accounts[0].balance, 20000);
  });
});


