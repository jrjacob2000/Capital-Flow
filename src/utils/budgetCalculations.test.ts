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
  buildAutoFillPeriodEntries,
  resolveTemplateBudgetVisibility,
  applyTemplateBudgetVisibility,
  shouldTemplateDisplayInBudget,
  getPeriodItemExclusionKeys,
  isTemplateExcludedInPeriod,
  getChannelAmountForRow,
  getPendingAmountToPay,
  computePaymentChannelSubtotals,
  computeFilteredExpenseSubtotals,
  resolveSyncedEntryAndTemplateAmounts,
  computeCarryOverSurplus,
  computePeriodProjectedSurplus,
} from './budgetCalculations';
import {
  isTemplateValidForPeriod,
  resolveCanonicalSinkingFundName,
  findClosestSinkingFundMatch,
  normalizeSavingCategoryGroup,
  normalizeCategoryWording,
  deriveCategoryBudgetsFromTemplates,
  stripDefaultStarterTemplates,
  isDefaultStarterBudget,
} from '../services/sampleData';
import { FinanceStorageService } from '../services/storageService';
import {
  analyzeAndParseWorksheet,
  parseUniversalRowsToEntries,
  detectUniversalColumnMapping,
  parseCurrencyNumber,
  buildSampleTemplateRows,
  buildSampleTemplateWorkbook,
} from './excelImportParser';
import {
  getBrowserEnvironmentInfo,
  isMissingInitialStateOrStorageError,
  resolveAuthDomain,
  handleFirestoreError,
  OperationType,
  isDevelopmentEnvironment,
  resolveFirebaseEnvironmentConfig,
  sanitizeErrorForLog,
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

  it('rolls up bi-weekly P1 & P2 settled entries into monthly bars when viewing a bi-weekly-only budget in Monthly mode', () => {
    const entries: BudgetEntry[] = [
      makeEntry({ id: 'bw-1', period: 'Mar-P1', type: 'income', actualCost: 20000, amount: 20000, status: 'Paid' }),
      makeEntry({ id: 'bw-2', period: 'Mar-P2', type: 'income', actualCost: 22000, amount: 22000, status: 'Paid' }),
      makeEntry({ id: 'bw-3', period: 'Mar-P1', type: 'expense', actualCost: 8500, amount: 8500, status: 'Paid' }),
      makeEntry({ id: 'bw-4', period: 'Mar-P2', type: 'expense', actualCost: 9500, amount: 9500, status: 'Paid' }),
    ];

    const monthlyRollup = aggregateCashflowByPeriod(entries, 'monthly');
    const mar = monthlyRollup.find((m) => m.label === 'Mar')!;
    assert.equal(mar.income, 42000);
    assert.equal(mar.expense, 18000);
    assert.equal(mar.net, 24000);
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

  it('generates a single-sheet Sample Excel Template with period-matched dates and round-trips cleanly', () => {
    const wb = buildSampleTemplateWorkbook(2026, 'Mar-P2');
    // Must have ONLY 1 worksheet tab so new users are never confused by multiple formats
    assert.equal(wb.SheetNames.length, 1);
    assert.equal(wb.SheetNames[0], 'Mar-P2_2026');

    const rows = buildSampleTemplateRows(2026, 'Mar-P2');
    const parsed = analyzeAndParseWorksheet(rows, 2026, 'Mar-P2');
    assert.equal(parsed.detectedMode, 'universal');
    assert.equal(parsed.entries.length, 5);
    assert.equal(parsed.entries[0].type, 'income');
    assert.equal(parsed.entries[0].date, '2026-03-16');
    assert.equal(parsed.entries[1].type, 'expense');
    assert.equal(parsed.entries[4].type, 'saving');
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

describe('14. Template Auto-Fill & Batch Period Replacement Process (buildAutoFillPeriodEntries & addMultipleBudgetEntries)', () => {
  it('auto-fills a period with Pending entries for unrecorded templates without prematurely inflating savings account balances', () => {
    memoryStorage.clear();
    const { budget, ledger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    const initialAccBalance = ledger.accounts[0].balance;

    const templates: BudgetItemTemplate[] = [
      {
        id: 'tpl-sal',
        type: 'income',
        category: 'Salary & Wages',
        item: 'Monthly Salary',
        defaultEstimatedCost: 50000,
        frequency: 'monthly',
      },
      {
        id: 'tpl-bonus',
        type: 'income',
        category: '13th Month & Bonuses',
        item: 'Performance Bonus',
        defaultEstimatedCost: 20000,
        frequency: 'monthly',
      },
      {
        id: 'tpl-rent',
        type: 'expense',
        category: 'Housing & Mortgage',
        item: 'Condo Rent',
        defaultEstimatedCost: 15000,
        frequency: 'monthly',
      },
      {
        id: 'tpl-ef',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        defaultEstimatedCost: 5000,
        frequency: 'monthly',
        defaultSavingAccountId: ledger.accounts[0].id,
      },
    ];

    const autoFillRes = buildAutoFillPeriodEntries(
      templates,
      budget.entries,
      2026,
      'Nov',
      'monthly',
      ledger.accounts,
      isTemplateValidForPeriod
    );

    // Performance Bonus (irregular income) is excluded; Salary, Condo Rent, and Emergency Fund are included (3 items)
    assert.equal(autoFillRes.validTemplatesCount, 3);
    assert.equal(autoFillRes.newEntries.length, 3);
    assert.equal(
      autoFillRes.newEntries.every((e) => e.status === 'Pending' && e.actualCost === 0 && e.amount === 0),
      true
    );

    // Batch-insert auto-filled entries -> since all are Pending (0 actual), Savings Ledger balance must remain untouched
    const batchRes = FinanceStorageService.addMultipleBudgetEntries(budget, autoFillRes.newEntries);
    assert.equal(batchRes.budget.entries.length, 3);
    assert.equal(batchRes.ledger.accounts[0].balance, initialAccBalance);
    assert.equal(batchRes.ledger.transactions.length, 0);

    // Re-running auto-fill on Nov when all 3 templates are already in Nov should return 0 new entries
    const secondRun = buildAutoFillPeriodEntries(
      templates,
      batchRes.budget.entries,
      2026,
      'Nov',
      'monthly',
      ledger.accounts,
      isTemplateValidForPeriod
    );
    assert.equal(secondRun.validTemplatesCount, 3);
    assert.equal(secondRun.newEntries.length, 0);
  });

  it('rolls back existing period savings and loan payments when replacing a period via addMultipleBudgetEntries', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    ledger.initialCapital = 10000;
    ledger.accounts[0].balance = 10000;
    ledger.loans = [
      {
        id: 'loan-car',
        name: 'Auto Loan',
        direction: 'borrowed',
        category: 'Auto / Vehicle Loan',
        principalAmount: 50000,
        totalContractAmount: 50000,
        installmentAmount: 5000,
        totalInstallments: 10,
        initialPaidAmount: 45000,
        initialInstallmentsPaid: 9,
        frequency: 'monthly',
        startDate: '2026-01-01',
        status: 'active',
        payments: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    const budget = FinanceStorageService.loadLocalBudget(2026);

    // 1. Add initial Oct entries (a Paid saving of 4,000 and a Paid loan expense of 5,000 that completes the loan)
    const octInitial = FinanceStorageService.addMultipleBudgetEntries(budget, [
      {
        year: 2026,
        period: 'Oct',
        periodIndex: 9,
        date: '2026-10-05',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        estimatedCost: 4000,
        actualCost: 4000,
        amount: 4000,
        status: 'Paid',
        description: 'Emergency Fund',
      },
      {
        year: 2026,
        period: 'Oct',
        periodIndex: 9,
        date: '2026-10-10',
        type: 'expense',
        category: 'Loans',
        item: 'Auto Loan',
        estimatedCost: 5000,
        actualCost: 5000,
        amount: 5000,
        status: 'Paid',
        loanId: 'loan-car',
        description: 'Auto Loan',
      },
    ]);

    assert.equal(octInitial.ledger.accounts[0].balance, 14000);
    assert.equal(octInitial.ledger.loans?.[0].payments.length, 1);
    assert.equal(octInitial.ledger.loans?.[0].status, 'completed');

    // 2. Replace Oct period with a fresh Excel import containing only a 1,500 saving entry (and no loan payment)
    const octReplaced = FinanceStorageService.addMultipleBudgetEntries(
      octInitial.budget,
      [
        {
          year: 2026,
          period: 'Oct',
          periodIndex: 9,
          date: '2026-10-15',
          type: 'saving',
          category: 'Emergency & Safety Net',
          item: 'Emergency Fund',
          estimatedCost: 1500,
          actualCost: 1500,
          amount: 1500,
          status: 'Paid',
          description: 'Emergency Fund',
        },
      ],
      { replacePeriod: 'Oct', customExpenseCategories: ['Custom Imported Category'] }
    );

    // Old 4,000 saving rolled back and replaced with 1,500 -> balance is 11,500
    assert.equal(octReplaced.ledger.accounts[0].balance, 11500);
    assert.equal(octReplaced.ledger.transactions.length, 1);
    assert.equal(octReplaced.ledger.transactions[0].amount, 1500);
    // Old 5,000 loan payment rolled back -> loan has 0 payments and reverts to 'active'
    assert.equal(octReplaced.ledger.loans?.[0].payments.length, 0);
    assert.equal(octReplaced.ledger.loans?.[0].status, 'active');
    assert.equal(
      octReplaced.budget.customCategories?.expense.includes('Custom Imported Category'),
      true
    );
  });
});

describe('15. Direct Funds Ledger Transactions, Account Management & Sinking Fund Rename/Merge/Delete Process', () => {
  it('executes deposits, yields, withdrawals, account transfers, and virtual reallocations with accurate runningTotalCapital', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    ledger.initialCapital = 20000;
    ledger.accounts = [
      { id: 'acc-main', name: 'BPI Savings', type: 'Traditional Bank', balance: 15000, color: '#3b82f6' },
      { id: 'acc-hysa', name: 'Maya HYSA', type: 'Digital Bank (High-Yield)', balance: 5000, color: '#10b981' },
    ];
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    // 1. Direct deposit (+5,000 to BPI)
    const dep = FinanceStorageService.addLedgerTransaction({
      date: '2026-10-01',
      year: 2026,
      period: 'Oct',
      amount: 5000,
      accountId: 'acc-main',
      accountName: 'BPI Savings',
      source: 'manual_deposit',
      category: 'Emergency Fund',
      note: 'Top up Emergency Fund',
    });
    assert.equal(dep.ledger.accounts[0].balance, 20000);
    assert.equal(dep.ledger.transactions[0].runningTotalCapital, 25000);

    // 2. Account-to-account transfer (3,000 from BPI to Maya HYSA) -> net capital stays 25,000
    const trf = FinanceStorageService.addLedgerTransaction({
      date: '2026-10-05',
      year: 2026,
      period: 'Oct',
      amount: 3000,
      accountId: 'acc-main',
      accountName: 'BPI Savings',
      toAccountId: 'acc-hysa',
      toAccountName: 'Maya HYSA',
      source: 'transfer',
      note: 'Move to high yield',
    });
    assert.equal(trf.ledger.accounts[0].balance, 17000);
    assert.equal(trf.ledger.accounts[1].balance, 8000);
    assert.equal(trf.ledger.transactions[1].runningTotalCapital, 25000);

    // 3. Virtual Sinking Fund reallocation (1,000 from Emergency Fund to Travel Fund) -> physical balances & net capital unchanged
    const realloc = FinanceStorageService.addLedgerTransaction({
      date: '2026-10-08',
      year: 2026,
      period: 'Oct',
      amount: 1000,
      accountId: 'acc-main',
      accountName: 'BPI Savings',
      source: 'reallocation',
      category: 'Emergency Fund',
      toCategory: 'Travel & Vacation Fund',
      note: 'Reallocate to Travel',
    });
    assert.equal(realloc.ledger.accounts[0].balance, 17000);
    assert.equal(realloc.ledger.accounts[1].balance, 8000);
    assert.equal(realloc.ledger.transactions[2].runningTotalCapital, 25000);

    // 4. Update the deposit transaction from 5,000 to 7,000 -> BPI balance increases by 2,000 to 19,000, runningTotalCapital becomes 27,000
    const upd = FinanceStorageService.updateLedgerTransaction(dep.newTx.id, { amount: 7000 }, 2026);
    assert.equal(upd.ledger.accounts[0].balance, 19000);
    assert.equal(upd.ledger.transactions[2].runningTotalCapital, 27000);

    // 5. Delete the transfer transaction -> reverses 3,000 transfer (BPI back to 22,000, Maya back to 5,000)
    const del = FinanceStorageService.deleteLedgerTransaction(trf.newTx.id, 2026);
    assert.equal(del.ledger.accounts[0].balance, 22000);
    assert.equal(del.ledger.accounts[1].balance, 5000);
    assert.equal(del.ledger.transactions.length, 2);
  });

  it('adds, updates, and deletes savings accounts while reassigning balances, transactions, loans, and budget references', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    ledger.initialCapital = 10000;
    ledger.accounts = [
      { id: 'acc-1', name: 'Primary Bank', type: 'Traditional Bank', balance: 10000, color: '#3b82f6' },
    ];
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    // Guard: Cannot delete the last remaining savings account
    const blockedDelete = FinanceStorageService.deleteSavingsAccount('acc-1', undefined, 2026);
    assert.equal(blockedDelete.deleted, false);
    assert.equal(blockedDelete.ledger.accounts.length, 1);

    // 1. Add a second account with 5,000 initial balance -> initialCapital increases to 15,000
    const added = FinanceStorageService.addSavingsAccount({
      name: 'Digital Vault',
      type: 'Digital Bank (High-Yield)',
      balance: 5000,
      color: '#10b981',
    });
    const acc2Id = added.newAccount.id;
    assert.equal(added.ledger.accounts.length, 2);
    assert.equal(added.ledger.initialCapital, 15000);

    // Record a budget saving entry tied to acc2Id
    const budget = FinanceStorageService.loadLocalBudget(2026);
    budget.itemTemplates = [
      {
        id: 'tpl-sav-1',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        defaultEstimatedCost: 2000,
        defaultSavingAccountId: acc2Id,
      },
    ];
    const withEntry = FinanceStorageService.addMultipleBudgetEntries(budget, [
      {
        year: 2026,
        period: 'Oct',
        periodIndex: 9,
        date: '2026-10-05',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        estimatedCost: 2000,
        actualCost: 2000,
        amount: 2000,
        status: 'Paid',
        savingAccountId: acc2Id,
        savingAccountName: 'Digital Vault',
        description: 'Emergency Fund',
      },
    ]);
    assert.equal(withEntry.ledger.accounts.find((a) => a.id === acc2Id)?.balance, 7000);

    // 2. Rename acc2Id to 'Seabank High-Yield' and adjust balance from 7,000 to 8,000
    const renamed = FinanceStorageService.updateSavingsAccount(
      acc2Id,
      { name: 'Seabank High-Yield', balance: 8000 },
      2026
    );
    assert.equal(renamed.ledger.initialCapital, 16000);
    assert.equal(renamed.ledger.transactions[0].accountName, 'Seabank High-Yield');
    assert.equal(renamed.updatedBudget?.entries[0].savingAccountName, 'Seabank High-Yield');

    // 3. Delete acc2Id and reassign to 'acc-1' -> balance (8,000), transactions, budget entries, and templates transfer to 'acc-1'
    const deleted = FinanceStorageService.deleteSavingsAccount(acc2Id, 'acc-1', 2026);
    assert.equal(deleted.deleted, true);
    assert.equal(deleted.ledger.accounts.length, 1);
    assert.equal(deleted.ledger.accounts[0].id, 'acc-1');
    assert.equal(deleted.ledger.accounts[0].balance, 18000);
    assert.equal(deleted.ledger.transactions[0].accountId, 'acc-1');
    assert.equal(deleted.updatedBudget?.entries[0].savingAccountId, 'acc-1');
    assert.equal(deleted.updatedBudget?.itemTemplates?.[0].defaultSavingAccountId, 'acc-1');
  });

  it('renames, merges, and deletes Sinking Funds while cleaning self-reallocations and normalizing bi-weekly targets', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    const ledger = FinanceStorageService.loadLocalSavingsLedger();
    ledger.transactions = [
      {
        id: 'tx-1',
        date: '2026-10-01',
        year: 2026,
        period: 'Oct',
        amount: 3000,
        accountId: ledger.accounts[0].id,
        accountName: ledger.accounts[0].name,
        source: 'budget_sync',
        category: 'Old Vacation Fund',
        note: 'Old Vacation Fund',
      },
      {
        id: 'tx-self-realloc',
        date: '2026-10-02',
        year: 2026,
        period: 'Oct',
        amount: 1000,
        accountId: ledger.accounts[0].id,
        accountName: ledger.accounts[0].name,
        source: 'reallocation',
        category: 'Old Vacation Fund',
        toCategory: 'Japan Trip Fund',
        note: 'Move to Japan Trip',
      },
    ];
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    const budget = FinanceStorageService.loadLocalBudget(2026);
    budget.itemTemplates = [
      {
        id: 'tpl-vac',
        type: 'saving',
        category: 'Lifestyle & Planned Goals',
        item: 'Old Vacation Fund',
        defaultEstimatedCost: 2000,
        frequency: 'bi-weekly',
        biweeklyPeriod: 'both',
      },
    ];
    budget.entries = [
      makeEntry({
        id: 'e-vac',
        type: 'saving',
        category: 'Lifestyle & Planned Goals',
        item: 'Old Vacation Fund',
        description: 'Old Vacation Fund',
        actualCost: 3000,
        amount: 3000,
      }),
    ];
    FinanceStorageService.saveLocalBudget(budget);

    // 1. Merge 'Old Vacation Fund' into 'Japan Trip Fund' with a new monthly target of 6,000
    const merged = FinanceStorageService.renameOrMergeSinkingFund(
      budget,
      'Old Vacation Fund',
      'Japan Trip Fund',
      6000,
      'Lifestyle & Planned Goals'
    );
    // Self-reallocation (Japan Trip Fund -> Japan Trip Fund) is automatically removed!
    assert.equal(merged.ledger.transactions.length, 1);
    assert.equal(merged.ledger.transactions[0].category, 'Japan Trip Fund');
    // Bi-weekly ('both') template stores 6,000 / 2 = 3,000 per period
    assert.equal(merged.budget.itemTemplates?.[0].item, 'Japan Trip Fund');
    assert.equal(merged.budget.itemTemplates?.[0].defaultEstimatedCost, 3000);
    assert.equal(merged.budget.entries[0].item, 'Japan Trip Fund');

    // 2. Delete 'Japan Trip Fund' (returns balance to General Reserves / Starting Capital)
    const afterDelete = FinanceStorageService.deleteSinkingFund(merged.budget, 'Japan Trip Fund');
    assert.equal(
      afterDelete.ledger.transactions[0].category,
      'General Reserves / Starting Capital'
    );
    assert.equal(afterDelete.budget.itemTemplates?.length, 0);
    assert.equal(
      afterDelete.budget.entries[0].item,
      'General Reserves / Starting Capital'
    );
  });
});

describe('16. Full Loans & Receivables End-to-End Lifecycle Process', () => {
  it('manages the complete lifecycle of a Lent Receivable (principal disbursement, template sync, collection with budget + deposit sync, payment deletion rollback, and loan deletion)', () => {
    memoryStorage.clear();
    const { budget, ledger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    const accId = ledger.accounts[0].id;
    ledger.initialCapital = 50000;
    ledger.accounts[0].balance = 50000;
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    // 1. Create a Lent Receivable of 10,000 disbursed from accId, synced to recurring templates
    const newLoan: LoanRecord = {
      id: 'loan-receivable-1',
      name: 'Bridge Loan - Marco',
      direction: 'lent',
      counterparty: 'Marco',
      category: 'Personal Receivable',
      principalAmount: 10000,
      totalContractAmount: 10000,
      installmentAmount: 5000,
      totalInstallments: 2,
      initialPaidAmount: 0,
      initialInstallmentsPaid: 0,
      frequency: 'monthly',
      startDate: '2026-10-01',
      status: 'active',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const created = FinanceStorageService.saveLoanContract(newLoan, budget, 'monthly', {
      syncToTemplate: true,
      disburseFromAccountId: accId,
    });

    // Principal of 10,000 is deducted from savings account (50,000 -> 40,000) and withdrawal tx is recorded
    assert.equal(created.isUpdate, false);
    assert.equal(created.disbursedAmount, 10000);
    assert.equal(created.ledger.accounts[0].balance, 40000);
    assert.equal(created.ledger.transactions.length, 1);
    assert.equal(created.ledger.transactions[0].source, 'withdrawal');
    assert.equal(created.ledger.transactions[0].runningTotalCapital, 40000);
    // Recurring income template is created and linked
    assert.equal(created.budget.itemTemplates?.length, 1);
    assert.equal(created.budget.itemTemplates?.[0].loanId, 'loan-receivable-1');
    assert.equal(created.budget.itemTemplates?.[0].type, 'income');

    // 2. Record first collection of 5,000 (logged in Oct Budget Sheet + deposited back into accId)
    const pay1 = FinanceStorageService.recordLoanPayment(
      'loan-receivable-1',
      {
        amount: 5000,
        date: '2026-10-15',
        note: 'First installment',
        recordInBudget: true,
        depositToAccountId: accId,
      },
      created.budget,
      'monthly'
    );
    assert.equal(pay1.loan?.payments.length, 1);
    assert.equal(pay1.loan?.status, 'active');
    assert.equal(pay1.ledger.accounts[0].balance, 45000);
    assert.equal(pay1.updatedActiveBudget?.entries.length, 1);
    assert.equal(pay1.updatedActiveBudget?.entries[0].actualCost, 5000);

    // 3. Record second collection of 5,000 -> auto-marks loan as 'completed' and restores account balance to 50,000
    const pay2 = FinanceStorageService.recordLoanPayment(
      'loan-receivable-1',
      {
        amount: 5000,
        date: '2026-11-15',
        note: 'Final installment',
        recordInBudget: true,
        depositToAccountId: accId,
      },
      pay1.updatedActiveBudget!,
      'monthly'
    );
    assert.equal(pay2.loan?.payments.length, 2);
    assert.equal(pay2.loan?.status, 'completed');
    assert.equal(pay2.ledger.accounts[0].balance, 50000);
    assert.equal(pay2.updatedActiveBudget?.entries.length, 2);

    // 4. Delete the second payment -> reverts loan to 'active', reverses 5,000 deposit (balance -> 45,000), and removes Nov budget entry
    const payment2Id = pay2.loan!.payments[1].id;
    const afterDelPay = FinanceStorageService.deleteLoanPayment(
      'loan-receivable-1',
      payment2Id,
      pay2.updatedActiveBudget!
    );
    assert.equal(afterDelPay.loan?.payments.length, 1);
    assert.equal(afterDelPay.loan?.status, 'active');
    assert.equal(afterDelPay.ledger.accounts[0].balance, 45000);
    assert.equal(afterDelPay.updatedActiveBudget?.entries.length, 1);

    // 5. Delete the loan contract -> removes loan and linked template, and unlinks loanId from remaining Oct budget entry
    const afterDelLoan = FinanceStorageService.deleteLoanContract(
      'loan-receivable-1',
      afterDelPay.updatedActiveBudget!
    );
    assert.equal(afterDelLoan.ledger.loans?.length, 0);
    assert.equal(afterDelLoan.budget.itemTemplates?.length, 0);
    assert.equal(afterDelLoan.budget.entries.length, 1);
    assert.equal(afterDelLoan.budget.entries[0].loanId, undefined);
  });
});

describe('17. Cloud Sync Timestamp Comparison & Complete Go-Live Reset Process', () => {
  it('compares local and Google Drive timestamps with 2-second clock-skew tolerance', () => {
    assert.equal(FinanceStorageService.compareTimestamps(undefined, undefined), 'same');
    assert.equal(
      FinanceStorageService.compareTimestamps('2026-10-01T12:00:00.000Z', undefined),
      'local_newer'
    );
    assert.equal(
      FinanceStorageService.compareTimestamps(undefined, '2026-10-01T12:00:00.000Z'),
      'drive_newer'
    );
    // Within 2000ms tolerance -> 'same'
    assert.equal(
      FinanceStorageService.compareTimestamps(
        '2026-10-01T12:00:00.000Z',
        '2026-10-01T12:00:01.500Z'
      ),
      'same'
    );
    // Beyond 2000ms tolerance -> 'drive_newer' or 'local_newer'
    assert.equal(
      FinanceStorageService.compareTimestamps(
        '2026-10-01T12:00:00.000Z',
        '2026-10-01T12:00:05.000Z'
      ),
      'drive_newer'
    );
    assert.equal(
      FinanceStorageService.compareTimestamps(
        '2026-10-01T12:00:10.000Z',
        '2026-10-01T12:00:00.000Z'
      ),
      'local_newer'
    );
  });

  it('resets all multi-year budgets, templates, and ledger balances via resetAllDataForGoLive', () => {
    memoryStorage.clear();
    FinanceStorageService.startFreshBlankWorkspace(2026);
    FinanceStorageService.registerKnownYear(2027);
    const { budget, ledger } = FinanceStorageService.resetAllDataForGoLive();
    assert.equal(budget.year, 2026);
    assert.equal(budget.entries.length, 0);
    assert.equal(ledger.transactions.length, 0);
    assert.deepEqual(FinanceStorageService.getKnownYears(), [2026]);
  });
});

describe('18. Projected Net, Sorting Tie-Breakers & Category Deduplication', () => {
  it('preserves alphabetical item tie-breaker when sorting templates descending by category, type, and frequency', () => {
    const list: BudgetItemTemplate[] = [
      { id: '1', type: 'expense', category: 'Utilities', item: 'Zebra Bill', defaultEstimatedCost: 100 },
      { id: '2', type: 'expense', category: 'Utilities', item: 'Alpha Electric', defaultEstimatedCost: 200 },
      { id: '3', type: 'expense', category: 'Food', item: 'Dining Out', defaultEstimatedCost: 300 },
    ];

    // Descending category sort comparator:
    const sortedDesc = [...list].sort((a, b) => {
      const catCmp = a.category.localeCompare(b.category);
      if (catCmp !== 0) return -catCmp;
      return a.item.localeCompare(b.item);
    });

    assert.equal(sortedDesc[0].category, 'Utilities');
    assert.equal(sortedDesc[0].item, 'Alpha Electric'); // Tie-breaker alphabetically A before Z!
    assert.equal(sortedDesc[1].category, 'Utilities');
    assert.equal(sortedDesc[1].item, 'Zebra Bill');
    assert.equal(sortedDesc[2].category, 'Food');
  });

  it('calculates projectedRemainingAll combining settled actuals and pending estimates', () => {
    // 1 income received (Paid 35,000), 1 irregular income unreceived (est 5,000)
    const incomeRows = [
      { estimatedCost: 30000, actualCost: 35000, hasActualCost: true, status: 'Paid' },
      { estimatedCost: 5000, actualCost: 0, hasActualCost: false, status: 'Pending' },
    ];
    // 1 expense paid (Paid 12,000, est 10,000), 1 expense pending (est 4,000)
    const expenseRows = [
      { estimatedCost: 10000, actualCost: 12000, hasActualCost: true, status: 'Paid' },
      { estimatedCost: 4000, actualCost: 0, hasActualCost: false, status: 'Pending' },
    ];

    const projectedIncomeTotal = incomeRows.reduce(
      (sum, r) => sum + (r.hasActualCost && r.status === 'Paid' ? r.actualCost : r.estimatedCost),
      0
    );
    const projectedExpenseTotal = expenseRows.reduce(
      (sum, r) => sum + (r.hasActualCost && r.status === 'Paid' ? r.actualCost : r.estimatedCost),
      0
    );
    const projectedRemainingAll = projectedIncomeTotal - projectedExpenseTotal;

    // Projected income = 35,000 (actual paid) + 5,000 (unreceived estimate) = 40,000
    // Projected expense = 12,000 (actual paid) + 4,000 (pending estimate) = 16,000
    // Projected net = 40,000 - 16,000 = 24,000
    assert.equal(projectedIncomeTotal, 40000);
    assert.equal(projectedExpenseTotal, 16000);
    assert.equal(projectedRemainingAll, 24000);
  });

  it('deduplicates category arrays when renaming or merging categories', () => {
    const existing = ['Groceries', 'Utilities', 'Dining'];
    const oldName = 'Dining';
    const newName = 'Groceries'; // User merges Dining into Groceries

    const deduplicated = Array.from(new Set(existing.map((c) => (c === oldName ? newName : c))));
    assert.deepEqual(deduplicated, ['Groceries', 'Utilities']);
  });
});

describe('19. Template Budget Display & Optionality (Displayed / Optional / Not Displayed)', () => {
  it('resolves and applies template visibility modes while preserving backward compatibility', () => {
    const regularExpense: BudgetItemTemplate = {
      id: 'tpl-exp',
      type: 'expense',
      category: 'Utilities',
      item: 'Meralco Bill',
      defaultEstimatedCost: 3500,
    };
    const irregularIncome: BudgetItemTemplate = {
      id: 'tpl-bonus',
      type: 'income',
      category: 'Bonus',
      item: '13th Month Bonus',
      defaultEstimatedCost: 40000,
    };

    // Default behavior when showInBudget & isOptional are undefined:
    assert.equal(resolveTemplateBudgetVisibility(regularExpense), 'displayed');
    assert.equal(shouldTemplateDisplayInBudget(regularExpense), true);
    assert.equal(resolveTemplateBudgetVisibility(irregularIncome), 'hidden');
    assert.equal(shouldTemplateDisplayInBudget(irregularIncome), false);

    // Explicitly marking an item as Optional:
    const optionalExpense = applyTemplateBudgetVisibility(regularExpense, 'optional');
    assert.equal(optionalExpense.showInBudget, true);
    assert.equal(optionalExpense.isOptional, true);
    assert.equal(resolveTemplateBudgetVisibility(optionalExpense), 'optional');
    assert.equal(shouldTemplateDisplayInBudget(optionalExpense, true), true);
    assert.equal(shouldTemplateDisplayInBudget(optionalExpense, false), false);

    // Explicitly marking an item as Hidden (Not Displayed):
    const hiddenExpense = applyTemplateBudgetVisibility(optionalExpense, 'hidden');
    assert.equal(hiddenExpense.showInBudget, false);
    assert.equal(hiddenExpense.isOptional, false);
    assert.equal(resolveTemplateBudgetVisibility(hiddenExpense), 'hidden');
    assert.equal(shouldTemplateDisplayInBudget(hiddenExpense, true), false);

    // Explicitly enabling an irregular income item to Display in budget:
    const displayedBonus = applyTemplateBudgetVisibility(irregularIncome, 'displayed');
    assert.equal(resolveTemplateBudgetVisibility(displayedBonus), 'displayed');
    assert.equal(shouldTemplateDisplayInBudget(displayedBonus, true), true);
  });

  it('excludes Not Displayed templates from auto-fill and category budget targets while tagging Optional items', () => {
    const templates: BudgetItemTemplate[] = [
      {
        id: 'tpl-1',
        type: 'expense',
        category: 'Utilities',
        item: 'Electricity',
        defaultEstimatedCost: 3000,
        frequency: 'monthly',
        showInBudget: true,
        isOptional: false,
      },
      {
        id: 'tpl-2',
        type: 'expense',
        category: 'Lifestyle',
        item: 'Weekend Dining Out',
        defaultEstimatedCost: 1500,
        frequency: 'monthly',
        showInBudget: true,
        isOptional: true,
      },
      {
        id: 'tpl-3',
        type: 'expense',
        category: 'Travel',
        item: 'Holiday Flight',
        defaultEstimatedCost: 12000,
        frequency: 'monthly',
        showInBudget: false,
        isOptional: false,
      },
    ];

    // 1. Auto-fill with includeOptional = true (default): includes Displayed + Optional, skips Hidden
    const autoFillWithOptional = buildAutoFillPeriodEntries(
      templates,
      [],
      2026,
      'Oct',
      'monthly',
      [],
      isTemplateValidForPeriod,
      { includeOptional: true }
    );
    assert.equal(autoFillWithOptional.validTemplatesCount, 2);
    assert.equal(autoFillWithOptional.newEntries.length, 2);
    assert.equal(autoFillWithOptional.newEntries[0].item, 'Electricity');
    assert.equal(autoFillWithOptional.newEntries[0].isOptional, false);
    assert.equal(autoFillWithOptional.newEntries[1].item, 'Weekend Dining Out');
    assert.equal(autoFillWithOptional.newEntries[1].isOptional, true);

    // 2. Auto-fill with includeOptional = false: includes only Displayed, skips Optional & Hidden
    const autoFillRequiredOnly = buildAutoFillPeriodEntries(
      templates,
      [],
      2026,
      'Oct',
      'monthly',
      [],
      isTemplateValidForPeriod,
      { includeOptional: false }
    );
    assert.equal(autoFillRequiredOnly.validTemplatesCount, 1);
    assert.equal(autoFillRequiredOnly.newEntries.length, 1);
    assert.equal(autoFillRequiredOnly.newEntries[0].item, 'Electricity');

    // 3. deriveCategoryBudgetsFromTemplates skips Hidden ('showInBudget: false') templates
    const catBudgets = deriveCategoryBudgetsFromTemplates(templates);
    assert.equal(catBudgets.find((c) => c.category === 'Utilities')?.plannedAmount, 3000);
    assert.equal(catBudgets.find((c) => c.category === 'Lifestyle')?.plannedAmount, 1500);
    assert.equal(catBudgets.find((c) => c.category === 'Travel'), undefined);
  });
});

describe('20. Per-Period Budget Item Deletion & Restoration (deleteBudgetPeriodItem & restoreExcludedPeriodItems)', () => {
  it('deletes an entire item (recorded entry + virtual template row) for a specific period while leaving other periods and master templates intact', () => {
    memoryStorage.clear();
    const { budget, ledger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    const accId = ledger.accounts[0].id;
    ledger.initialCapital = 10000;
    ledger.accounts[0].balance = 10000;
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    budget.itemTemplates = [
      {
        id: 'tpl-ef',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        defaultEstimatedCost: 4000,
        frequency: 'monthly',
        defaultSavingAccountId: accId,
      },
      {
        id: 'tpl-net',
        type: 'expense',
        category: 'Utilities',
        item: 'Home Fiber Internet',
        defaultEstimatedCost: 1899,
        frequency: 'monthly',
      },
    ];
    FinanceStorageService.saveLocalBudget(budget);

    // 1. Record a Paid saving entry in Oct for Emergency Fund (+4,000 to savings account)
    const octAdded = FinanceStorageService.addMultipleBudgetEntries(budget, [
      {
        year: 2026,
        period: 'Oct',
        periodIndex: 9,
        date: '2026-10-05',
        type: 'saving',
        category: 'Emergency & Safety Net',
        item: 'Emergency Fund',
        estimatedCost: 4000,
        actualCost: 4000,
        amount: 4000,
        status: 'Paid',
        savingAccountId: accId,
        savingAccountName: ledger.accounts[0].name,
        description: 'Emergency Fund',
      },
    ]);
    assert.equal(octAdded.ledger.accounts[0].balance, 14000);
    assert.equal(octAdded.budget.entries.length, 1);

    // 2. Delete 'Emergency Fund' in Oct via deleteBudgetPeriodItem:
    //    - Removes the recorded Oct entry
    //    - Rolls back the +4,000 savings ledger transaction (balance returns to 10,000)
    //    - Marks 'Emergency Fund' as excluded in Oct so its virtual template row also disappears in Oct
    const octEntryId = octAdded.budget.entries[0].id;
    const afterDeleteRecorded = FinanceStorageService.deleteBudgetPeriodItem(
      octAdded.budget,
      'Oct',
      {
        entryId: octEntryId,
        templateId: 'tpl-ef',
        type: 'saving',
        item: 'Emergency Fund',
      }
    );
    assert.equal(afterDeleteRecorded.budget.entries.length, 0);
    assert.equal(afterDeleteRecorded.ledger.accounts[0].balance, 10000);
    assert.equal(
      isTemplateExcludedInPeriod(
        budget.itemTemplates[0],
        'Oct',
        afterDeleteRecorded.budget.excludedPeriodItems
      ),
      true
    );
    // In Nov, 'Emergency Fund' is NOT excluded!
    assert.equal(
      isTemplateExcludedInPeriod(
        budget.itemTemplates[0],
        'Nov',
        afterDeleteRecorded.budget.excludedPeriodItems
      ),
      false
    );

    // 3. Delete unrecorded virtual template row 'Home Fiber Internet' in Oct
    const afterDeleteVirtual = FinanceStorageService.deleteBudgetPeriodItem(
      afterDeleteRecorded.budget,
      'Oct',
      {
        templateId: 'tpl-net',
        type: 'expense',
        item: 'Home Fiber Internet',
      }
    );
    assert.equal(
      isTemplateExcludedInPeriod(
        budget.itemTemplates[1],
        'Oct',
        afterDeleteVirtual.budget.excludedPeriodItems
      ),
      true
    );

    // 4. Auto-fill in Oct skips both excluded templates, while Auto-fill in Nov includes both!
    const autoFillOct = buildAutoFillPeriodEntries(
      budget.itemTemplates,
      afterDeleteVirtual.budget.entries,
      2026,
      'Oct',
      'monthly',
      [],
      isTemplateValidForPeriod,
      { excludedPeriodItems: afterDeleteVirtual.budget.excludedPeriodItems }
    );
    assert.equal(autoFillOct.validTemplatesCount, 0);
    assert.equal(autoFillOct.newEntries.length, 0);

    const autoFillNov = buildAutoFillPeriodEntries(
      budget.itemTemplates,
      afterDeleteVirtual.budget.entries,
      2026,
      'Nov',
      'monthly',
      [],
      isTemplateValidForPeriod,
      { excludedPeriodItems: afterDeleteVirtual.budget.excludedPeriodItems }
    );
    assert.equal(autoFillNov.validTemplatesCount, 2);
    assert.equal(autoFillNov.newEntries.length, 2);

    // 5. Restore excluded items in Oct -> both templates are active in Oct again
    const restoredOct = FinanceStorageService.restoreExcludedPeriodItems(
      afterDeleteVirtual.budget,
      'Oct'
    );
    assert.equal(
      isTemplateExcludedInPeriod(
        budget.itemTemplates[0],
        'Oct',
        restoredOct.excludedPeriodItems
      ),
      false
    );
    assert.equal(
      isTemplateExcludedInPeriod(
        budget.itemTemplates[1],
        'Oct',
        restoredOct.excludedPeriodItems
      ),
      false
    );
    assert.equal(
      getPeriodItemExclusionKeys({
        type: 'expense',
        item: 'Home Fiber Internet',
        templateId: 'tpl-net',
      }).length,
      2
    );
  });

  it('clears all template/loan exclusion keys when re-adding via addMultipleBudgetEntries or recordLoanPayment, and avoids stale exclusions for hidden templates', () => {
    memoryStorage.clear();
    const { budget } = FinanceStorageService.startFreshBlankWorkspace(2026);

    const loanRecord: LoanRecord = {
      id: 'loan-car-1',
      name: 'Auto Loan',
      direction: 'borrowed',
      counterparty: 'BPI Auto',
      category: 'Vehicle Loan',
      principalAmount: 100000,
      totalContractAmount: 120000,
      installmentAmount: 5000,
      totalInstallments: 24,
      initialPaidAmount: 0,
      initialInstallmentsPaid: 0,
      frequency: 'monthly',
      startDate: '2026-01-01',
      status: 'active',
      payments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const syncedLoan = FinanceStorageService.saveLoanContract(loanRecord, budget, 'monthly', {
      syncToTemplate: true,
    });
    const activeBudget = syncedLoan.budget;

    // Add a hidden irregular bonus template (13th Month & Bonuses with 0 default estimate -> hidden from sheet by default)
    const bonusTpl: BudgetItemTemplate = {
      id: 'tpl-bonus-hidden',
      type: 'income',
      category: '13th Month & Bonuses',
      item: '13th Month Bonus',
      defaultEstimatedCost: 0,
      frequency: 'monthly',
      biweeklyPeriod: 'both',
      showInBudget: false,
    };
    activeBudget.itemTemplates = [...(activeBudget.itemTemplates || []), bonusTpl];
    FinanceStorageService.saveLocalBudget(activeBudget);

    const autoLoanTpl = activeBudget.itemTemplates.find((t) => t.loanId === 'loan-car-1')!;
    assert.ok(autoLoanTpl);

    // 1. Delete 'Auto Loan' from Oct -> excluded in Oct
    const afterDeleteLoanInOct = FinanceStorageService.deleteBudgetPeriodItem(
      activeBudget,
      'Oct',
      {
        templateId: autoLoanTpl.id,
        type: 'expense',
        item: 'Auto Loan',
        loanId: 'loan-car-1',
      }
    );
    assert.equal(
      isTemplateExcludedInPeriod(
        autoLoanTpl,
        'Oct',
        afterDeleteLoanInOct.budget.excludedPeriodItems
      ),
      true
    );

    // Verify isDefaultStarterBudget detects excludedPeriodItems even if isDefaultStarterData is undefined
    assert.equal(
      isDefaultStarterBudget({
        ...afterDeleteLoanInOct.budget,
        isDefaultStarterData: undefined,
      }),
      false
    );

    // 2. Record a loan payment for 'Auto Loan' in Oct with recordInBudget: true -> automatically clears tpl:, item:, and loan: exclusions in Oct!
    const afterRecordLoan = FinanceStorageService.recordLoanPayment(
      'loan-car-1',
      {
        date: '2026-10-15',
        amount: 5000,
        note: 'Oct Auto Loan Payment',
        recordInBudget: true,
      },
      afterDeleteLoanInOct.budget,
      'monthly'
    );
    const budgetAfterLoanPay = afterRecordLoan.updatedActiveBudget!;
    assert.ok(budgetAfterLoanPay);
    assert.equal(
      isTemplateExcludedInPeriod(
        autoLoanTpl,
        'Oct',
        budgetAfterLoanPay.excludedPeriodItems
      ),
      false
    );

    // 3. Delete 'Auto Loan' from Nov, then re-add via addMultipleBudgetEntries (without explicit templateId) -> clears tpl: exclusion key too!
    const afterDeleteNov = FinanceStorageService.deleteBudgetPeriodItem(
      budgetAfterLoanPay,
      'Nov',
      {
        templateId: autoLoanTpl.id,
        type: 'expense',
        item: 'Auto Loan',
        loanId: 'loan-car-1',
      }
    );
    assert.equal(
      isTemplateExcludedInPeriod(autoLoanTpl, 'Nov', afterDeleteNov.budget.excludedPeriodItems),
      true
    );

    const afterBatchReAdd = FinanceStorageService.addMultipleBudgetEntries(afterDeleteNov.budget, [
      {
        year: 2026,
        period: 'Nov',
        periodIndex: 10,
        date: '2026-11-15',
        type: 'expense',
        category: 'Loans',
        item: 'Auto Loan',
        estimatedCost: 5000,
        actualCost: 5000,
        amount: 5000,
        status: 'Paid',
        description: 'Auto Loan',
      },
    ]);
    assert.equal(
      isTemplateExcludedInPeriod(autoLoanTpl, 'Nov', afterBatchReAdd.budget.excludedPeriodItems),
      false
    );

    // 4. Record a one-off entry for the hidden '13th Month Bonus' template in Dec, then delete it -> removes the entry without adding stale exclusion keys
    const afterAddBonus = FinanceStorageService.addMultipleBudgetEntries(afterBatchReAdd.budget, [
      {
        year: 2026,
        period: 'Dec',
        periodIndex: 11,
        date: '2026-12-10',
        type: 'income',
        category: '13th Month & Bonuses',
        item: '13th Month Bonus',
        estimatedCost: 25000,
        actualCost: 25000,
        amount: 25000,
        status: 'Paid',
        description: '13th Month Bonus',
      },
    ]);
    const bonusEntry = afterAddBonus.budget.entries.find((e) => e.period === 'Dec')!;
    const afterDeleteBonus = FinanceStorageService.deleteBudgetPeriodItem(
      afterAddBonus.budget,
      'Dec',
      {
        entryId: bonusEntry.id,
        type: 'income',
        item: '13th Month Bonus',
      }
    );
    assert.equal(
      afterDeleteBonus.budget.entries.some((e) => e.period === 'Dec'),
      false
    );
    assert.equal(afterDeleteBonus.excludedTemplate, false);
    assert.equal(afterDeleteBonus.budget.excludedPeriodItems?.['Dec'], undefined);
  });
});

describe('21. Sinking Fund Withdrawal Deduction & Reallocation Mechanics', () => {
  it('deducts withdrawal transactions from the specified sinking fund without altering unaffected funds', () => {
    memoryStorage.clear();
    const { ledger: initialLedger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    const bpiAcc = initialLedger.accounts[0];
    assert.ok(bpiAcc);

    // Initial deposit to Emergency Fund
    const depRes = FinanceStorageService.addLedgerTransaction({
      date: '2026-03-01',
      year: 2026,
      period: 'Mar',
      amount: 50000,
      accountId: bpiAcc.id,
      accountName: bpiAcc.name,
      source: 'manual_deposit',
      category: 'Emergency Fund',
      note: 'Emergency Fund Deposit',
    });

    const emFundBefore = depRes.ledger.transactions
      .filter((t) => t.category === 'Emergency Fund')
      .reduce((s, t) => s + (t.source === 'withdrawal' ? -t.amount : t.amount), 0);
    assert.equal(emFundBefore, 50000);

    // Record an unexpected withdrawal from Emergency Fund
    const withRes = FinanceStorageService.addLedgerTransaction({
      date: '2026-03-15',
      year: 2026,
      period: 'Mar',
      amount: 15000,
      accountId: bpiAcc.id,
      accountName: bpiAcc.name,
      source: 'withdrawal',
      category: 'Emergency Fund',
      note: 'Hospital ER Bill',
    });

    const emFundAfter = withRes.ledger.transactions
      .filter((t) => t.category === 'Emergency Fund')
      .reduce((s, t) => s + (t.source === 'withdrawal' ? -t.amount : t.amount), 0);
    assert.equal(emFundAfter, 35000);

    const updatedBpi = withRes.ledger.accounts.find((a) => a.id === bpiAcc.id);
    assert.equal(updatedBpi?.balance, bpiAcc.balance + 35000);
  });

  it('correctly executes virtual reallocation between goal funds when direction is swapped', () => {
    memoryStorage.clear();
    const { ledger: initialLedger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    const acc = initialLedger.accounts[0];
    assert.ok(acc);

    // Seed Travel Fund with 20,000
    FinanceStorageService.addLedgerTransaction({
      date: '2026-04-01',
      year: 2026,
      period: 'Apr',
      amount: 20000,
      accountId: acc.id,
      accountName: acc.name,
      source: 'manual_deposit',
      category: 'Travel Fund',
      note: 'Initial Travel Fund',
    });

    // Reallocate from Travel Fund (Source) to Emergency Fund (Target)
    const reallocRes = FinanceStorageService.addLedgerTransaction({
      date: '2026-04-10',
      year: 2026,
      period: 'Apr',
      amount: 8000,
      accountId: acc.id,
      accountName: acc.name,
      source: 'reallocation',
      category: 'Travel Fund',
      toCategory: 'Emergency Fund',
      note: 'Shifted from Travel to Emergency',
    });

    // Bank account balance is unchanged by virtual reallocation
    const updatedAcc = reallocRes.ledger.accounts.find((a) => a.id === acc.id);
    assert.equal(updatedAcc?.balance, acc.balance + 20000);

    // Reallocation audit trail exists
    const reallocTx = reallocRes.ledger.transactions.find((t) => t.source === 'reallocation');
    assert.ok(reallocTx);
    assert.equal(reallocTx.category, 'Travel Fund');
    assert.equal(reallocTx.toCategory, 'Emergency Fund');
    assert.equal(reallocTx.amount, 8000);
  });
});

describe('21. Firebase Direct CRUD & Redundant localStorage Cache Purge (setCloudSessionActive & clearRedundantLocalCache)', () => {
  it('purges redundant localStorage cache keys when Firebase cloud session is active while keeping in-memory CRUD reads/writes intact', () => {
    memoryStorage.clear();
    FinanceStorageService.setCloudSessionActive(false);

    // 1. Seed initial data in guest mode (populates localStorage)
    const { budget, ledger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    assert.ok(localStorage.getItem('capitalflow_local_budget_2026'));
    assert.ok(localStorage.getItem('capitalflow_local_savings_ledger'));

    // 2. Activate Firebase Cloud Session -> purges redundant localStorage cache keys
    FinanceStorageService.setCloudSessionActive(true);
    assert.equal(FinanceStorageService.isCloudSessionActive(), true);
    assert.equal(localStorage.getItem('capitalflow_local_budget_2026'), null);
    assert.equal(localStorage.getItem('capitalflow_local_savings_ledger'), null);
    assert.equal(localStorage.getItem('capitalflow_user_template_profile'), null);
    assert.equal(localStorage.getItem('capitalflow_known_years'), null);

    // 3. Perform CRUD while cloud session is active -> updates in-memory runtime without re-writing localStorage cache
    const updatedBudget = {
      ...budget,
      entries: [
        {
          id: 'cloud-entry-1',
          year: 2026,
          period: 'Nov',
          periodIndex: 10,
          date: '2026-11-01',
          type: 'income' as const,
          category: 'Salary & Wages',
          item: 'Direct Firestore Salary',
          description: 'Direct Firestore Salary',
          amount: 85000,
          actualCost: 85000,
          status: 'Paid' as const,
          frequency: 'monthly' as const,
          createdAt: '2026-11-01T00:00:00.000Z',
        },
      ],
    };
    FinanceStorageService.saveLocalBudget(updatedBudget, { skipFirestoreWrite: true });
    assert.equal(localStorage.getItem('capitalflow_local_budget_2026'), null);

    const loadedBudget = FinanceStorageService.loadLocalBudget(2026);
    assert.equal(loadedBudget.entries.length, 1);
    assert.equal(loadedBudget.entries[0].item, 'Direct Firestore Salary');
    assert.equal(loadedBudget.entries[0].amount, 85000);

    // Reset cloud session flag for any subsequent guest-mode tests
    FinanceStorageService.setCloudSessionActive(false);
    assert.equal(ledger.accounts.length > 0, true);
  });
});

describe('22. Security Sanitization, Atomic Multi-Year Backup Restore & Cloud-Safe Reset', () => {
  beforeEach(() => {
    memoryStorage.clear();
    FinanceStorageService.setCloudSessionActive(false);
  });

  it('does not leak user PII (email, userId, tenantId, providerData) in handleFirestoreError payloads', () => {
    let thrownMessage = '';
    try {
      handleFirestoreError(
        new Error('Missing or insufficient permissions.'),
        OperationType.WRITE,
        'users/secret-uid-123'
      );
    } catch (err: any) {
      thrownMessage = err?.message || '';
    }

    assert.ok(thrownMessage.length > 0);
    const parsed = JSON.parse(thrownMessage);
    assert.equal(parsed.error, 'Missing or insufficient permissions.');
    assert.equal(parsed.operationType, 'write');
    assert.equal(parsed.path, 'users/secret-uid-123');
    // Must not expose PII keys in authInfo
    assert.equal('userId' in parsed.authInfo, false);
    assert.equal('email' in parsed.authInfo, false);
    assert.equal('tenantId' in parsed.authInfo, false);
    assert.equal('providerInfo' in parsed.authInfo, false);
    assert.equal(typeof parsed.authInfo.isSignedIn, 'boolean');
  });

  it('atomically restores a multi-year full backup across different years without losing templates or entries', () => {
    // Start in 2026
    FinanceStorageService.startFreshBlankWorkspace(2026);

    // Simulate restoring a Full Backup where primary budget is 2025 and budgetsByYear also contains 2026
    const backup2025 = {
      ...FinanceStorageService.loadLocalBudget(2025),
      year: 2025,
      entries: [
        makeEntry({
          id: 'b-2025-1',
          year: 2025,
          period: 'Dec',
          type: 'income',
          category: 'Salary & Wages',
          item: '2025 Year-End Pay',
          actualCost: 60000,
          amount: 60000,
        }),
      ],
    };
    const backup2026 = {
      ...FinanceStorageService.loadLocalBudget(2026),
      year: 2026,
      entries: [
        makeEntry({
          id: 'b-2026-1',
          year: 2026,
          period: 'Jan',
          type: 'expense',
          category: 'Utilities & Bills',
          item: '2026 Jan Electric',
          actualCost: 3400,
          amount: 3400,
        }),
      ],
    };
    const backupTemplate = {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      isPersonalizedTemplate: true,
      customCategories: {
        income: ['Salary & Wages'],
        expense: ['Utilities & Bills'],
        saving: ['Emergency & Safety Net'],
      },
      itemTemplates: [
        {
          id: 'tpl-restored-1',
          type: 'expense' as const,
          category: 'Utilities & Bills',
          item: 'Restored Meralco Template',
          defaultEstimatedCost: 3500,
        },
      ],
    };

    // 1. Save additional years from budgetsByYear
    const { budget: norm2026 } = FinanceStorageService.normalizeBudgetTemplates({
      ...backup2026,
      isDefaultStarterData: false,
    });
    FinanceStorageService.registerKnownYear(2026, { skipFirestoreWrite: true });
    FinanceStorageService.saveLocalBudget(norm2026, {
      skipTemplateProfileUpdate: true,
      skipFirestoreWrite: true,
    });

    // 2. Save primary year (2025) and apply templateData onto 2025 (not stale 2026)
    const { budget: norm2025 } = FinanceStorageService.normalizeBudgetTemplates({
      ...backup2025,
      isDefaultStarterData: false,
    });
    FinanceStorageService.registerKnownYear(2025, { skipFirestoreWrite: true });
    const final2025 = FinanceStorageService.applyTemplateDataToBudget(backupTemplate, norm2025, {
      skipFirestoreWrite: true,
    });
    FinanceStorageService.saveLocalBudget(final2025, { skipFirestoreWrite: true });

    const reloaded2025 = FinanceStorageService.loadLocalBudget(2025);
    const reloaded2026 = FinanceStorageService.loadLocalBudget(2026);
    assert.equal(reloaded2025.entries.length, 1);
    assert.equal(reloaded2025.entries[0].item, '2025 Year-End Pay');
    assert.equal(reloaded2025.itemTemplates?.length, 1);
    assert.equal(reloaded2025.itemTemplates?.[0].item, 'Restored Meralco Template');
    assert.equal(reloaded2026.entries.length, 1);
    assert.equal(reloaded2026.entries[0].item, '2026 Jan Electric');
    assert.deepEqual(FinanceStorageService.getKnownYears(), [2026, 2025]);
  });

  it('produces a fresh non-epoch timestamp when resetting and starting a blank workspace so cloud listeners do not overwrite reset data', () => {
    FinanceStorageService.resetAllDataForGoLive();
    const { budget, ledger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    assert.equal(budget.isDefaultStarterData, false);
    assert.equal(ledger.isDefaultStarterData, false);
    assert.notEqual(budget.lastUpdated, '1970-01-01T00:00:00.000Z');
    assert.notEqual(ledger.lastUpdated, '1970-01-01T00:00:00.000Z');
    assert.equal(
      FinanceStorageService.compareTimestamps(budget.lastUpdated, '2025-01-01T00:00:00.000Z'),
      'local_newer'
    );
  });
});

describe('23. Payment Channel Subtotals (Projected vs Paid) & Filtered Selection Subtotals', () => {
  it('computes both Paid and Projected totals per payment channel including split payments and pending rows', () => {
    const rows = [
      // 1. Paid single-channel row (Bank Transfer: Est 3,500, Paid 3,200)
      {
        estimatedCost: 3500,
        actualCost: 3200,
        hasActualCost: true,
        status: 'Paid' as const,
        paymentMethod: 'Bank Transfer' as const,
      },
      // 2. Pending row (Credit Card: Est 5,000, Paid 0)
      {
        estimatedCost: 5000,
        actualCost: 0,
        hasActualCost: false,
        status: 'Pending' as const,
        paymentMethod: 'Credit Card' as const,
      },
      // 3. Paid split-channel row (Est 4,000, Paid 4,200: 1,200 Cash + 3,000 Credit Card)
      {
        estimatedCost: 4000,
        actualCost: 4200,
        hasActualCost: true,
        status: 'Paid' as const,
        paymentMethod: 'Credit Card' as const,
        paymentBreakdown: {
          cash: 1200,
          creditCard: 3000,
          gcashTransfer: 0,
          kathAccount: 0,
          checkAccount: 0,
          bankTransfer: 0,
        },
      },
    ];

    const { paidTotals, projectedTotals } = computePaymentChannelSubtotals(rows);

    // Paid totals only include settled amounts
    assert.equal(paidTotals['Bank Transfer'], 3200);
    assert.equal(paidTotals['Credit Card'], 3000);
    assert.equal(paidTotals.Cash, 1200);

    // Projected totals include settled actuals + pending estimates
    assert.equal(projectedTotals['Bank Transfer'], 3200);
    assert.equal(projectedTotals['Credit Card'], 8000); // 3,000 paid + 5,000 pending estimate
    assert.equal(projectedTotals.Cash, 1200);
  });

  it('computes Estimated, Paid, Projected, and Variance for filtered expense rows and respects channel filters on split rows', () => {
    const creditCardFilteredRows = [
      // Pending Credit Card bill (Est 5,000)
      {
        estimatedCost: 5000,
        actualCost: 0,
        hasActualCost: false,
        status: 'Pending' as const,
        paymentMethod: 'Credit Card' as const,
      },
      // Split Paid item where 3,000 was paid via Credit Card and 1,200 via Cash (Total Est 4,000, Total Paid 4,200)
      {
        estimatedCost: 4000,
        actualCost: 4200,
        hasActualCost: true,
        status: 'Paid' as const,
        paymentMethod: 'Credit Card' as const,
        paymentBreakdown: {
          cash: 1200,
          creditCard: 3000,
        },
      },
    ];

    // 1. Without a specific channel filter (e.g. search or status filter): uses full row actuals
    const generalSubtotals = computeFilteredExpenseSubtotals(creditCardFilteredRows, null);
    assert.equal(generalSubtotals.estimated, 9000);
    assert.equal(generalSubtotals.actual, 4200);
    assert.equal(generalSubtotals.projected, 9200); // 4,200 paid + 5,000 pending
    assert.equal(generalSubtotals.variance, -200); // 9,000 est - 9,200 proj = 200 over
    assert.equal(generalSubtotals.paidCount, 1);
    assert.equal(generalSubtotals.totalCount, 2);

    // 2. With 'Credit Card' channel filter active: uses the Credit Card slice (3,000) + pending Credit Card estimate (5,000) = 8,000 projected
    const channelSubtotals = computeFilteredExpenseSubtotals(creditCardFilteredRows, 'Credit Card');
    assert.equal(getChannelAmountForRow(creditCardFilteredRows[1], 'Credit Card'), 3000);
    assert.equal(channelSubtotals.actual, 3000);
    assert.equal(channelSubtotals.projected, 8000);
  });
});

describe('24. Sync-to-Template Amount Resolution & Sequential Category + Template + Entry Persistence', () => {
  beforeEach(() => {
    memoryStorage.clear();
    FinanceStorageService.setCloudSessionActive(false);
  });

  it('auto-populates Estimate from Actual when Sync to Template is checked and Estimate was left blank', () => {
    // 1. New unplanned item where user enters Actual = 2500, checks Sync to Template, leaves Estimated blank
    const syncedFromActual = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '',
      rawActual: '2500',
      saveToTemplate: true,
      type: 'expense',
      status: 'Paid',
      itemName: 'Gym Membership',
      categoryName: 'Health & Fitness',
    });
    assert.equal(syncedFromActual.estNum, 2500);
    assert.equal(syncedFromActual.actNum, 2500);
    assert.equal(syncedFromActual.diff, 0);

    // 2. User enters Estimated = 1800, leaves Actual blank on a Paid item
    const paidFromEstimate = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '1800',
      rawActual: '',
      saveToTemplate: true,
      type: 'expense',
      status: 'Paid',
      itemName: 'Water Bill',
      categoryName: 'Utilities & Bills',
    });
    assert.equal(paidFromEstimate.estNum, 1800);
    assert.equal(paidFromEstimate.actNum, 1800);
    assert.equal(paidFromEstimate.diff, 0);

    // 3. Explicit '0' in Actual is respected as 0 (e.g. waived bill)
    const waivedBill = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '1500',
      rawActual: '0',
      saveToTemplate: false,
      type: 'expense',
      status: 'Paid',
      itemName: 'Internet Bill',
      categoryName: 'Utilities & Bills',
    });
    assert.equal(waivedBill.estNum, 1500);
    assert.equal(waivedBill.actNum, 0);
    assert.equal(waivedBill.diff, 1500);
  });

  it('preserves custom categories, newly synced templates, and budget entries when saved sequentially in the same flow', () => {
    FinanceStorageService.startFreshBlankWorkspace(2026);

    // Step 1: Save custom category
    const b1 = FinanceStorageService.loadLocalBudget(2026);
    const updatedWithCat = {
      ...b1,
      customCategories: {
        ...b1.customCategories!,
        expense: [...b1.customCategories!.expense, 'Pet Care & Vet'],
      },
    };
    FinanceStorageService.saveLocalBudget(updatedWithCat, { skipFirestoreWrite: true });

    // Step 2: Immediately load latest budget and add synced template (simulating handleUpdateTemplates)
    const b2 = FinanceStorageService.loadLocalBudget(2026);
    const newTpl: BudgetItemTemplate = {
      id: 'tpl-pet-food',
      type: 'expense',
      category: 'Pet Care & Vet',
      item: 'Monthly Dog Food',
      defaultEstimatedCost: 2200,
      frequency: 'monthly',
      biweeklyPeriod: 'both',
      showInBudget: true,
    };
    const updatedWithTpl = {
      ...b2,
      itemTemplates: [...(b2.itemTemplates || []), newTpl],
      isPersonalizedTemplate: true,
    };
    FinanceStorageService.saveLocalBudget(updatedWithTpl, { skipFirestoreWrite: true });

    // Step 3: Immediately load latest budget and add the entry (simulating handleAddBudgetEntry)
    const b3 = FinanceStorageService.loadLocalBudget(2026);
    const newEntry = makeEntry({
      id: 'entry-pet-1',
      year: 2026,
      period: 'Nov',
      type: 'expense',
      category: 'Pet Care & Vet',
      item: 'Monthly Dog Food',
      estimatedCost: 2200,
      actualCost: 2200,
      amount: 2200,
      status: 'Paid',
    });
    const updatedWithEntry = {
      ...b3,
      entries: [newEntry, ...b3.entries],
    };
    FinanceStorageService.saveLocalBudget(updatedWithEntry, { skipFirestoreWrite: true });

    // Verify all 3 updates (custom category, template, and entry) are intact in storage and template profile
    const finalBudget = FinanceStorageService.loadLocalBudget(2026);
    const finalTemplateProfile = FinanceStorageService.loadLocalTemplateData(finalBudget);

    assert.equal(finalBudget.customCategories?.expense.includes('Pet Care & Vet'), true);
    assert.equal(finalBudget.itemTemplates?.length, 1);
    assert.equal(finalBudget.itemTemplates?.[0].item, 'Monthly Dog Food');
    assert.equal(finalBudget.itemTemplates?.[0].defaultEstimatedCost, 2200);
    assert.equal(finalBudget.entries.length, 1);
    assert.equal(finalBudget.entries[0].item, 'Monthly Dog Food');
    assert.equal(finalTemplateProfile.itemTemplates.length, 1);
    assert.equal(finalTemplateProfile.customCategories.expense.includes('Pet Care & Vet'), true);
  });
});

describe('25. Carry-Over Surplus Calculation & Duplicate Prevention (computeCarryOverSurplus)', () => {
  it('computes previous period settled surplus and detects when carry-over has already been recorded', () => {
    const periods = ['Jan', 'Feb', 'Mar'];
    const entries: BudgetEntry[] = [
      makeEntry({
        id: 'jan-inc-1',
        period: 'Jan',
        type: 'income',
        item: 'Salary',
        actualCost: 50000,
        amount: 50000,
        status: 'Paid',
      }),
      makeEntry({
        id: 'jan-exp-1',
        period: 'Jan',
        type: 'expense',
        item: 'Rent',
        actualCost: 18000,
        amount: 18000,
        status: 'Paid',
      }),
      makeEntry({
        id: 'jan-sav-1',
        period: 'Jan',
        type: 'saving',
        item: 'Emergency Fund',
        actualCost: 10000,
        amount: 10000,
        status: 'Paid',
      }),
      // Pending items in Jan should not reduce settled surplus
      makeEntry({
        id: 'jan-exp-pending',
        period: 'Jan',
        type: 'expense',
        item: 'Unpaid Utility',
        estimatedCost: 4000,
        actualCost: 0,
        amount: 0,
        status: 'Pending',
      }),
    ];

    // 1. First period ('Jan') has no previous period
    const janCheck = computeCarryOverSurplus(entries, periods, 'Jan');
    assert.equal(janCheck.surplus, 0);
    assert.equal(janCheck.hasBeenCarriedOver, true);

    // 2. Second period ('Feb') sees 50,000 - (18,000 + 10,000) = 22,000 surplus from 'Jan'
    const febBefore = computeCarryOverSurplus(entries, periods, 'Feb');
    assert.equal(febBefore.surplus, 22000);
    assert.equal(febBefore.prevPeriodName, 'Jan');
    assert.equal(febBefore.hasBeenCarriedOver, false);

    // 3. After recording Carry-over in 'Feb', hasBeenCarriedOver becomes true
    const entriesWithCarryOver: BudgetEntry[] = [
      ...entries,
      makeEntry({
        id: 'feb-carry-1',
        period: 'Feb',
        type: 'income',
        category: 'Other Income',
        item: 'Carry-over from Jan',
        description: 'Carry-over from Jan',
        actualCost: 22000,
        amount: 22000,
        status: 'Paid',
      }),
    ];
    const febAfter = computeCarryOverSurplus(entriesWithCarryOver, periods, 'Feb');
    assert.equal(febAfter.surplus, 22000);
    assert.equal(febAfter.hasBeenCarriedOver, true);
  });
});

describe('26. Negative Actual Values (Refunds, Cashback, Rebates & Reversals)', () => {
  it('preserves explicit negative Actual values across expense, income, and saving entries in resolveSyncedEntryAndTemplateAmounts', () => {
    // 1. Expense rebate / cashback with 0 estimate and -500 actual
    const cashbackExpense = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '0',
      rawActual: '-500',
      saveToTemplate: false,
      type: 'expense',
      status: 'Paid',
      itemName: 'Credit Card Cashback Rebate',
      categoryName: 'Utilities & Bills',
    });
    assert.equal(cashbackExpense.estNum, 0);
    assert.equal(cashbackExpense.actNum, -500);
    // For expenses: diff = estNum - actNum = 0 - (-500) = +500 favorable variance
    assert.equal(cashbackExpense.diff, 500);

    // 2. Irregular income reversal / deduction with positive estimate (1000) and explicit negative actual (-250)
    const incomeAdjustment = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '1000',
      rawActual: '-250',
      saveToTemplate: false,
      type: 'income',
      status: 'Paid',
      itemName: 'Payroll Tax Adjustment',
      categoryName: 'Other Income',
    });
    assert.equal(incomeAdjustment.estNum, 1000);
    assert.equal(incomeAdjustment.actNum, -250);
    // For income: diff = actNum - estNum = -250 - 1000 = -1250
    assert.equal(incomeAdjustment.diff, -1250);

    // 3. Sync to template with negative Actual and blank Estimate
    const syncedNegative = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '',
      rawActual: '-300',
      saveToTemplate: true,
      type: 'expense',
      status: 'Paid',
      itemName: 'Monthly Loyalty Rebate',
      categoryName: 'Shopping',
    });
    assert.equal(syncedNegative.estNum, -300);
    assert.equal(syncedNegative.actNum, -300);
    assert.equal(syncedNegative.diff, 0);
  });

  it('accurately nets negative Actuals (refunds/rebates) in Payment Channel Subtotals, Filtered Selection Subtotals, and CSV Export', () => {
    const rows = [
      {
        estimatedCost: 4000,
        actualCost: 4000,
        hasActualCost: true,
        status: 'Paid' as const,
        paymentMethod: 'Credit Card' as const,
      },
      // Credit card cashback / refund of -650
      {
        estimatedCost: 0,
        actualCost: -650,
        hasActualCost: true,
        status: 'Paid' as const,
        paymentMethod: 'Credit Card' as const,
      },
      // Pending Credit Card bill of 2,000
      {
        estimatedCost: 2000,
        actualCost: 0,
        hasActualCost: false,
        status: 'Pending' as const,
        paymentMethod: 'Credit Card' as const,
      },
    ];

    const { paidTotals, projectedTotals } = computePaymentChannelSubtotals(rows);
    // Paid Credit Card = 4,000 + (-650) = 3,350
    assert.equal(paidTotals['Credit Card'], 3350);
    // Projected Credit Card = 3,350 paid + 2,000 pending = 5,350
    assert.equal(projectedTotals['Credit Card'], 5350);

    // Filtered selection subtotals for Credit Card
    const subtotals = computeFilteredExpenseSubtotals(rows, 'Credit Card');
    assert.equal(subtotals.estimated, 6000);
    assert.equal(subtotals.actual, 3350);
    assert.equal(subtotals.projected, 5350);
    assert.equal(subtotals.variance, 650); // 6,000 est - 5,350 proj = +650 saved
    assert.equal(subtotals.paidCount, 2);
    assert.equal(subtotals.totalCount, 3);

    // CSV export of a settled negative actual row
    const csvVals = computeCsvRowExportValues({
      type: 'expense',
      estimatedCost: 0,
      actualCost: -650,
      hasActualCost: true,
      status: 'Paid',
    });
    assert.equal(csvVals.act, -650);
    assert.equal(csvVals.diff, 650);
  });

  it('synchronizes negative saving adjustments and negative loan payment reversals into SavingsLedgerData and cleanly rolls them back on deletion or zeroing', () => {
    memoryStorage.clear();
    const { ledger } = FinanceStorageService.startFreshBlankWorkspace(2026);
    const accId = ledger.accounts[0].id;
    ledger.initialCapital = 20000;
    ledger.accounts[0].balance = 20000;
    ledger.loans = [
      {
        id: 'loan-reg-1',
        name: 'Gadget Installment',
        direction: 'borrowed',
        category: 'Personal Loan',
        principalAmount: 12000,
        totalContractAmount: 12000,
        installmentAmount: 2000,
        totalInstallments: 6,
        initialPaidAmount: 10000,
        initialInstallmentsPaid: 5,
        frequency: 'monthly',
        startDate: '2026-05-01',
        status: 'active',
        payments: [
          {
            id: 'lpay-1',
            loanId: 'loan-reg-1',
            date: '2026-10-05',
            year: 2026,
            period: 'Oct',
            amount: 2000,
            source: 'budget_sync',
            budgetEntryId: 'entry-loan-1',
          },
        ],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    FinanceStorageService.saveLocalSavingsLedger(ledger);

    // 1. Negative saving entry (-1,500 drawdown from Emergency Fund via Budget Sheet) reduces account balance from 20,000 to 18,500
    const negSavingEntry = makeEntry({
      id: 'sav-neg-1',
      year: 2026,
      period: 'Nov',
      date: '2026-11-10',
      type: 'saving',
      category: 'Emergency & Safety Net',
      item: 'Emergency Fund',
      estimatedCost: 0,
      actualCost: -1500,
      amount: -1500,
      status: 'Paid',
      savingAccountId: accId,
      savingAccountName: ledger.accounts[0].name,
    });
    let afterSav = FinanceStorageService.accumulateBudgetSavingToLedger(negSavingEntry, false);
    assert.equal(afterSav.accounts[0].balance, 18500);
    assert.equal(afterSav.transactions.length, 1);
    assert.equal(afterSav.transactions[0].amount, -1500);
    assert.equal(afterSav.transactions[0].runningTotalCapital, 18500);

    // 2. Updating the negative saving entry to 0 removes the ledger transaction and restores balance to 20,000
    afterSav = FinanceStorageService.accumulateBudgetSavingToLedger(
      { ...negSavingEntry, actualCost: 0, amount: 0 },
      false
    );
    assert.equal(afterSav.accounts[0].balance, 20000);
    assert.equal(afterSav.transactions.length, 0);

    // 3. Recording a negative loan adjustment (-500 reversal) updates total paid (10,000 + 2,000 - 500 = 11,500 < 12,000 -> 'active')
    const loanReversalEntry = makeEntry({
      id: 'entry-loan-rev',
      year: 2026,
      period: 'Nov',
      date: '2026-11-12',
      type: 'expense',
      category: 'Loans',
      item: 'Gadget Installment',
      actualCost: -500,
      amount: -500,
      status: 'Paid',
      loanId: 'loan-reg-1',
    });
    const loanSync = FinanceStorageService.syncBudgetLoanPaymentToLedger(loanReversalEntry, false);
    assert.equal(loanSync.matchedLoan?.payments.length, 2);
    assert.equal(loanSync.matchedLoan?.status, 'active');
  });
});

describe('27. End-to-End Multi-Module Regression Suite (Cashflow, Rebates, Carry-Over & Template Sync)', () => {
  it('verifies end-to-end period lifecycle with regular salary, synced templates, split payments, negative expense rebates, and carry-over surplus', () => {
    memoryStorage.clear();
    const { budget } = FinanceStorageService.startFreshBlankWorkspace(2026);

    // 1. User creates a new expense item in Jan with only Actual = 3,200 and Sync to Template checked
    const janInternetAmounts = resolveSyncedEntryAndTemplateAmounts({
      rawEstimated: '',
      rawActual: '3200',
      saveToTemplate: true,
      type: 'expense',
      status: 'Paid',
      itemName: 'Fiber Internet Plan',
      categoryName: 'Utilities & Bills',
    });
    assert.equal(janInternetAmounts.estNum, 3200);
    assert.equal(janInternetAmounts.actNum, 3200);

    // 2. User records Jan entries: Salary (+50,000), Fiber Internet (3,200 Credit Card), Groceries (6,000 split: 4,000 Credit Card + 2,000 Cash), and Cashback Rebate (-400 Credit Card)
    const janEntries: BudgetEntry[] = [
      makeEntry({
        id: 'jan-sal',
        period: 'Jan',
        type: 'income',
        category: 'Salary & Wages',
        item: 'Monthly Salary',
        estimatedCost: 50000,
        actualCost: 50000,
        amount: 50000,
        status: 'Paid',
      }),
      makeEntry({
        id: 'jan-net',
        period: 'Jan',
        type: 'expense',
        category: 'Utilities & Bills',
        item: 'Fiber Internet Plan',
        estimatedCost: janInternetAmounts.estNum,
        actualCost: janInternetAmounts.actNum,
        amount: janInternetAmounts.actNum,
        paymentMethod: 'Credit Card',
        status: 'Paid',
      }),
      makeEntry({
        id: 'jan-groc',
        period: 'Jan',
        type: 'expense',
        category: 'Food & Groceries',
        item: 'Supermarket Run',
        estimatedCost: 6500,
        actualCost: 6000,
        amount: 6000,
        paymentMethod: 'Credit Card',
        paymentBreakdown: {
          creditCard: 4000,
          cash: 2000,
        },
        status: 'Paid',
      }),
      makeEntry({
        id: 'jan-rebate',
        period: 'Jan',
        type: 'expense',
        category: 'Utilities & Bills',
        item: 'Credit Card Bill Rebate',
        estimatedCost: 0,
        actualCost: -400,
        amount: -400,
        paymentMethod: 'Credit Card',
        status: 'Paid',
      }),
    ];

    const batchRes = FinanceStorageService.addMultipleBudgetEntries(budget, janEntries);
    assert.equal(batchRes.budget.entries.length, 4);

    // 3. Verify Payment Channel Subtotals & Filtered Selection Subtotals for Jan expenses
    const janExpenseRows = batchRes.budget.entries
      .filter((e) => e.type !== 'income')
      .map((e) => ({
        estimatedCost: e.estimatedCost || 0,
        actualCost: e.actualCost ?? e.amount ?? 0,
        hasActualCost: true,
        status: e.status || ('Paid' as const),
        paymentMethod: e.paymentMethod,
        paymentBreakdown: e.paymentBreakdown,
      }));

    const { paidTotals, projectedTotals } = computePaymentChannelSubtotals(janExpenseRows);
    // Credit Card = 3,200 (Internet) + 4,000 (Groceries split) - 400 (Rebate) = 6,800
    assert.equal(paidTotals['Credit Card'], 6800);
    assert.equal(projectedTotals['Credit Card'], 6800);
    // Cash = 2,000 (Groceries split)
    assert.equal(paidTotals.Cash, 2000);
    assert.equal(projectedTotals.Cash, 2000);

    const allJanSubtotals = computeFilteredExpenseSubtotals(janExpenseRows, null);
    // Total Est = 3,200 + 6,500 + 0 = 9,700; Total Actual/Projected = 3,200 + 6,000 - 400 = 8,800; Variance = +900 saved
    assert.equal(allJanSubtotals.estimated, 9700);
    assert.equal(allJanSubtotals.actual, 8800);
    assert.equal(allJanSubtotals.projected, 8800);
    assert.equal(allJanSubtotals.variance, 900);

    // 4. Verify Carry-Over Surplus into Feb includes the +400 rebate (50,000 - 8,800 = 41,200)
    const carryOver = computeCarryOverSurplus(
      batchRes.budget.entries,
      ['Jan', 'Feb', 'Mar'],
      'Feb'
    );
    assert.equal(carryOver.prevPeriodName, 'Jan');
    assert.equal(carryOver.surplus, 41200);
    assert.equal(carryOver.hasBeenCarriedOver, false);
  });
});

describe('28. Environment-Aware Firebase Database Resolution, Log Sanitization & Sign-Out Memory Purge', () => {
  it('detects development vs production hostnames accurately and isolates Dev DB from Prod DB', () => {
    // 1. Hostname detection
    assert.equal(isDevelopmentEnvironment('localhost'), true);
    assert.equal(isDevelopmentEnvironment('127.0.0.1'), true);
    assert.equal(isDevelopmentEnvironment('ais-dev-preview.us-west1.run.app'), true);
    assert.equal(isDevelopmentEnvironment('ais-pre-preview.us-west1.run.app'), true);
    assert.equal(isDevelopmentEnvironment('user.github.io'), false);

    // 2. When running in AI Studio preview (*.run.app) with both VITE_DEV_FIREBASE_* and VITE_FIREBASE_* configured,
    //    it strictly selects VITE_DEV_FIREBASE_* in development and VITE_FIREBASE_* on *.github.io
    const simulatedEnv = {
      VITE_DEV_FIREBASE_API_KEY: 'test-dev-key-001',
      VITE_DEV_FIREBASE_PROJECT_ID: 'capitalflow-dev-project',
      VITE_DEV_FIREBASE_DATABASE_ID: 'capitalflow-dev-db',
      VITE_FIREBASE_API_KEY: 'test-prod-key-002',
      VITE_FIREBASE_PROJECT_ID: 'capitalflow-prod-project',
      VITE_FIREBASE_DATABASE_ID: '(default)',
    };
    const devResolved = resolveFirebaseEnvironmentConfig({
      env: simulatedEnv,
      hostname: 'ais-pre-preview.us-west1.run.app',
    });
    assert.equal(devResolved.isDevEnvironment, true);
    assert.equal(devResolved.projectId, 'capitalflow-dev-project');
    assert.equal(devResolved.databaseId, 'capitalflow-dev-db');
    assert.equal(devResolved.configSource, 'dev_env');

    // 3. When running on production hostname (*.github.io) with the same env,
    //    it resolves to the production database (capitalflow-prod-project)
    const prodResolved = resolveFirebaseEnvironmentConfig({
      env: simulatedEnv,
      hostname: 'myuser.github.io',
    });
    assert.equal(prodResolved.isDevEnvironment, false);
    assert.equal(prodResolved.projectId, 'capitalflow-prod-project');
    assert.equal(prodResolved.databaseId, '(default)');
    assert.equal(prodResolved.configSource, 'prod_env');
  });

  it('redacts sensitive tokens, emails, and workspace UID paths in sanitizeErrorForLog and purges cloud memory on sign-out', () => {
    const rawError = new Error(
      'Failed on workspaces/uid_abc_999 for user@example.com with Bearer ya29.secret_token_123'
    );
    const sanitized = sanitizeErrorForLog(rawError);
    assert.equal(sanitized.includes('uid_abc_999'), false);
    assert.equal(sanitized.includes('user@example.com'), false);
    assert.equal(sanitized.includes('ya29.secret_token_123'), false);
    assert.equal(sanitized.includes('workspaces/[REDACTED_UID]'), true);
    assert.equal(sanitized.includes('[REDACTED_EMAIL]'), true);
    assert.equal(sanitized.includes('Bearer [REDACTED_TOKEN]'), true);

    // Verify clearCloudSessionMemory purges in-memory cloud session state
    memoryStorage.clear();
    FinanceStorageService.setCloudSessionActive(true);
    FinanceStorageService.saveLocalBudget(
      {
        year: 2026,
        version: '1.0.0',
        lastUpdated: new Date().toISOString(),
        entryMode: 'monthly',
        currency: '₱',
        entries: [makeEntry({ id: 'secret-entry-1', item: 'Confidential Bonus', amount: 99000 })],
        budgets: [],
      },
      { skipFirestoreWrite: true }
    );
    assert.equal(FinanceStorageService.loadLocalBudget(2026).entries.length, 1);

    FinanceStorageService.clearCloudSessionMemory();
    assert.equal(FinanceStorageService.isCloudSessionActive(), false);
    assert.equal(
      FinanceStorageService.loadLocalBudget(2026).entries.some((e) => e.id === 'secret-entry-1'),
      false
    );
  });
});

describe('29. Pending Item Actual Amount Display & To-Pay Subtotal Resolution (getPendingAmountToPay)', () => {
  it('resolves exact Actual amount to pay when a Pending item has a recorded actualCost and falls back to estimatedCost when actualCost is 0', () => {
    // 1. Pending item where user already entered the exact bill amount (Est 3,000, Actual 3,450)
    const pendingWithActual = {
      estimatedCost: 3000,
      actualCost: 3450,
      hasActualCost: true,
      status: 'Pending' as const,
      paymentMethod: 'GCash Transfer' as const,
    };
    assert.equal(getPendingAmountToPay(pendingWithActual), 3450);

    // 2. Pending item with no explicit actual yet (Est 1,800, Actual 0)
    const pendingEstimateOnly = {
      estimatedCost: 1800,
      actualCost: 0,
      hasActualCost: false,
      status: 'Pending' as const,
      paymentMethod: 'Bank Transfer' as const,
    };
    assert.equal(getPendingAmountToPay(pendingEstimateOnly), 1800);

    // 3. Paid item (Est 2,000, Actual 2,000)
    const paidRow = {
      estimatedCost: 2000,
      actualCost: 2000,
      hasActualCost: true,
      status: 'Paid' as const,
      paymentMethod: 'Credit Card' as const,
    };

    const rows = [pendingWithActual, pendingEstimateOnly, paidRow];
    const { paidTotals, projectedTotals } = computePaymentChannelSubtotals(rows);
    assert.equal(paidTotals['Credit Card'], 2000);
    assert.equal(paidTotals['GCash Transfer'], 0);
    // Projected GCash Transfer uses the Pending item's explicit Actual (3,450) instead of Est (3,000)
    assert.equal(projectedTotals['GCash Transfer'], 3450);
    assert.equal(projectedTotals['Bank Transfer'], 1800);

    const subtotals = computeFilteredExpenseSubtotals(rows, null);
    assert.equal(subtotals.estimated, 6800); // 3000 + 1800 + 2000
    assert.equal(subtotals.actual, 2000); // Paid so far
    assert.equal(subtotals.pendingToPay, 5250); // 3450 + 1800 remaining to pay
    assert.equal(subtotals.projected, 7250); // 2000 paid + 5250 to pay
    assert.equal(subtotals.variance, -450); // 6800 - 7250 = 450 over budget
  });
});

describe('30. Dashboard Current Period Projected Surplus Resolution (computePeriodProjectedSurplus)', () => {
  it('correctly calculates current period projected surplus with paid actuals and pending amount fallbacks', () => {
    const budget = {
      year: 2026,
      itemTemplates: [
        {
          id: 'tpl-salary',
          type: 'income' as const,
          category: 'Salary & Wages',
          item: 'Salary',
          defaultEstimatedCost: 50000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-rent',
          type: 'expense' as const,
          category: 'Housing & Rent',
          item: 'Apartment Rent',
          defaultEstimatedCost: 15000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-meralco',
          type: 'expense' as const,
          category: 'Utilities & Bills',
          item: 'Electricity',
          defaultEstimatedCost: 4000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-savings',
          type: 'saving' as const,
          category: 'Emergency Fund',
          item: 'Emergency Reserve',
          defaultEstimatedCost: 10000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
      ],
      entries: [
        // Income: Paid, Actual 52,000 (Est was 50,000)
        makeEntry({
          id: 'inc-1',
          period: 'Nov',
          type: 'income',
          item: 'Salary',
          category: 'Salary & Wages',
          amount: 52000,
          actualCost: 52000,
          estimatedCost: 50000,
          status: 'Paid',
        }),
        // Rent: Paid, Actual 15,000
        makeEntry({
          id: 'exp-1',
          period: 'Nov',
          type: 'expense',
          item: 'Apartment Rent',
          category: 'Housing & Rent',
          amount: 15000,
          actualCost: 15000,
          estimatedCost: 15000,
          status: 'Paid',
        }),
        // Electricity: Pending, but user entered exact bill Actual 4,350
        makeEntry({
          id: 'exp-2',
          period: 'Nov',
          type: 'expense',
          item: 'Electricity',
          category: 'Utilities & Bills',
          amount: 0,
          actualCost: 4350,
          estimatedCost: 4000,
          status: 'Pending',
        }),
        // Savings: Pending, not yet transferred (Est 10,000)
        makeEntry({
          id: 'save-1',
          period: 'Nov',
          type: 'saving',
          item: 'Emergency Reserve',
          category: 'Emergency Fund',
          amount: 0,
          actualCost: 0,
          estimatedCost: 10000,
          status: 'Pending',
        }),
      ],
    };

    const metrics = computePeriodProjectedSurplus(budget, 'Nov', 'monthly');
    // Projected Income: 52,000
    assert.equal(metrics.projectedIncome, 52000);
    // Projected Outflow: Rent 15,000 (Paid) + Electricity 4,350 (Pending with explicit Actual) + Savings 10,000 (Pending Est) = 29,350
    assert.equal(metrics.projectedExpense, 29350);
    // Projected Surplus: 52,000 - 29,350 = 22,650
    assert.equal(metrics.projectedSurplus, 22650);
    assert.equal(metrics.hasRecordedEntries, true);
    assert.equal(metrics.hasPaidEntries, true);
  });

  it('projects surplus purely from recurring templates before any entries are recorded in a new period', () => {
    const budget = {
      year: 2026,
      itemTemplates: [
        {
          id: 'tpl-salary',
          type: 'income' as const,
          category: 'Salary & Wages',
          item: 'Salary',
          defaultEstimatedCost: 60000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-food',
          type: 'expense' as const,
          category: 'Food & Groceries',
          item: 'Groceries',
          defaultEstimatedCost: 20000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-save',
          type: 'saving' as const,
          category: 'Investments',
          item: 'Index Fund',
          defaultEstimatedCost: 15000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
      ],
      entries: [],
    };

    const metrics = computePeriodProjectedSurplus(budget, 'Dec', 'monthly');
    assert.equal(metrics.projectedIncome, 60000);
    assert.equal(metrics.projectedExpense, 35000); // 20k + 15k
    assert.equal(metrics.projectedSurplus, 25000);
    assert.equal(metrics.hasRecordedEntries, false);
    assert.equal(metrics.hasPaidEntries, false);
  });

  it('respects excludedPeriodItems when projecting surplus for a period', () => {
    const budget = {
      year: 2026,
      itemTemplates: [
        {
          id: 'tpl-salary',
          type: 'income' as const,
          category: 'Salary & Wages',
          item: 'Salary',
          defaultEstimatedCost: 50000,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-gym',
          type: 'expense' as const,
          category: 'Health & Fitness',
          item: 'Gym Membership',
          defaultEstimatedCost: 2500,
          frequency: 'monthly' as const,
          showInBudget: true,
        },
      ],
      // User soft-deleted gym membership specifically in Nov
      excludedPeriodItems: {
        Nov: ['tpl-gym'],
      },
      entries: [],
    };

    const metricsNov = computePeriodProjectedSurplus(budget, 'Nov', 'monthly');
    // Gym is excluded in Nov, so expense is 0
    assert.equal(metricsNov.projectedIncome, 50000);
    assert.equal(metricsNov.projectedExpense, 0);
    assert.equal(metricsNov.projectedSurplus, 50000);

    // In Oct, Gym is NOT excluded, so expense is 2500
    const metricsOct = computePeriodProjectedSurplus(budget, 'Oct', 'monthly');
    assert.equal(metricsOct.projectedIncome, 50000);
    assert.equal(metricsOct.projectedExpense, 2500);
    assert.equal(metricsOct.projectedSurplus, 47500);
  });

  it('correctly resolves bi-weekly cutoff-specific templates (P1 vs P2) and negative rebates/cashback in projected surplus', () => {
    const budget = {
      year: 2026,
      itemTemplates: [
        {
          id: 'tpl-salary-p1',
          type: 'income' as const,
          category: 'Salary & Wages',
          item: '1st Cutoff Paycheck',
          defaultEstimatedCost: 30000,
          frequency: 'bi-weekly' as const,
          biweeklyPeriod: 'P1' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-salary-p2',
          type: 'income' as const,
          category: 'Salary & Wages',
          item: '2nd Cutoff Paycheck',
          defaultEstimatedCost: 30000,
          frequency: 'bi-weekly' as const,
          biweeklyPeriod: 'P2' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-rent-p1',
          type: 'expense' as const,
          category: 'Housing & Rent',
          item: 'Apartment Rent',
          defaultEstimatedCost: 15000,
          frequency: 'bi-weekly' as const,
          biweeklyPeriod: 'P1' as const,
          showInBudget: true,
        },
        {
          id: 'tpl-bills-p2',
          type: 'expense' as const,
          category: 'Utilities & Bills',
          item: 'Internet & Water',
          defaultEstimatedCost: 5000,
          frequency: 'bi-weekly' as const,
          biweeklyPeriod: 'P2' as const,
          showInBudget: true,
        },
      ],
      entries: [
        // P1 entries: Salary received (30k)
        makeEntry({
          id: 'inc-p1',
          period: 'Nov-P1',
          type: 'income',
          item: '1st Cutoff Paycheck',
          amount: 30000,
          actualCost: 30000,
          status: 'Paid',
        }),
        // Rent paid: 15k
        makeEntry({
          id: 'exp-rent-p1',
          period: 'Nov-P1',
          type: 'expense',
          item: 'Apartment Rent',
          amount: 15000,
          actualCost: 15000,
          status: 'Paid',
        }),
        // Rebate / Refund on credit card in P1: -2,000
        makeEntry({
          id: 'exp-rebate-p1',
          period: 'Nov-P1',
          type: 'expense',
          item: 'Card Cashback Rebate',
          amount: -2000,
          actualCost: -2000,
          status: 'Paid',
        }),
      ],
    };

    // Nov-P1:
    // Income = 30,000
    // Expenses = 15,000 + (-2,000 rebate) = 13,000
    // Projected Surplus = 30,000 - 13,000 = 17,000
    const metricsP1 = computePeriodProjectedSurplus(budget, 'Nov-P1', 'bi-weekly');
    assert.equal(metricsP1.projectedIncome, 30000);
    assert.equal(metricsP1.projectedExpense, 13000);
    assert.equal(metricsP1.projectedSurplus, 17000);

    // Nov-P2 (virtual templates only):
    // Income = 30,000 (2nd Cutoff Paycheck)
    // Expense = 5,000 (Internet & Water)
    // Projected Surplus = 25,000
    const metricsP2 = computePeriodProjectedSurplus(budget, 'Nov-P2', 'bi-weekly');
    assert.equal(metricsP2.projectedIncome, 30000);
    assert.equal(metricsP2.projectedExpense, 5000);
    assert.equal(metricsP2.projectedSurplus, 25000);
  });
});



