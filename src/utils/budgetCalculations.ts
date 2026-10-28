import {
  BudgetEntry,
  BudgetItemTemplate,
  EntryFrequency,
  EntryType,
  LoanRecord,
} from '../types/finance';
import {
  BIWEEKLY_PERIODS,
  DEFAULT_SINKING_FUND_NAMES,
  MONTH_NAMES,
  resolveCanonicalSinkingFundName,
} from '../services/sampleData';

/**
 * Determines whether an income item/category represents regular Salary/Paycheck.
 * Irregular income sources (Extra Income, 13th Month, Bonus, Rental, Apartment, Freelance, Side Hustle)
 * return false so they are only displayed on the sheet when actual income (> 0) is recorded.
 */
export function isRegularSalaryIncome(itemName?: string, categoryName?: string): boolean {
  const itemLower = (itemName || '').toLowerCase().trim();
  const catLower = (categoryName || '').toLowerCase().trim();
  if (
    itemLower.includes('extra income') ||
    itemLower.includes('13th month') ||
    itemLower.includes('bonus') ||
    itemLower.includes('rental') ||
    itemLower.includes('apartment') ||
    itemLower.includes('freelance') ||
    itemLower.includes('side hustle') ||
    itemLower.includes('side income')
  ) {
    return false;
  }
  return (
    itemLower === 'salary' ||
    itemLower.includes('salary') ||
    itemLower.includes('paycheck') ||
    catLower === 'salary' ||
    catLower === 'salary & wages'
  );
}

/**
 * Aggregates settled (non-Pending) cashflow metrics by period for CashflowChart.
 */
export function aggregateCashflowByPeriod(
  entries: BudgetEntry[],
  frequency: EntryFrequency
): Array<{
  label: string;
  idx: number;
  income: number;
  expense: number;
  saving: number;
  net: number;
  savingsRate: number;
}> {
  const periodLabels =
    frequency === 'monthly' ? MONTH_NAMES : BIWEEKLY_PERIODS.map((p) => p.id);

  return periodLabels.map((label, idx) => {
    let income = 0;
    let expense = 0;
    let saving = 0;

    entries.forEach((entry) => {
      if (entry.period === label && entry.status !== 'Pending') {
        const amt = entry.actualCost ?? entry.amount ?? 0;
        if (entry.type === 'income') income += amt;
        if (entry.type === 'expense') expense += amt;
        if (entry.type === 'saving') saving += amt;
      }
    });

    const net = income - expense;
    const savingsRate = income > 0 ? (saving / income) * 100 : 0;

    return {
      label,
      idx,
      income,
      expense,
      saving,
      net,
      savingsRate,
    };
  });
}

/**
 * Aggregates settled (non-Pending) entries by category for CategoryDonutChart.
 * Prioritizes actualCost ?? amount ?? 0 and filters out zero/negative categories.
 */
export function aggregateCategoryDistribution(
  entries: BudgetEntry[],
  type: EntryType = 'expense'
): {
  categories: Array<{ category: string; amount: number; percentage: number }>;
  totalAmount: number;
} {
  const filteredEntries = entries.filter((e) => e.type === type && e.status !== 'Pending');
  const categoryTotals: Record<string, number> = {};

  filteredEntries.forEach((e) => {
    const amt = e.actualCost ?? e.amount ?? 0;
    if (amt > 0) {
      categoryTotals[e.category] = (categoryTotals[e.category] || 0) + amt;
    }
  });

  const sorted = Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount }))
    .filter((item) => item.amount > 0)
    .sort((a, b) => b.amount - a.amount);

  const totalAmount = sorted.reduce((sum, item) => sum + item.amount, 0);

  const categories = sorted.map((item) => ({
    category: item.category,
    amount: item.amount,
    percentage: totalAmount > 0 ? (item.amount / totalAmount) * 100 : 0,
  }));

  return { categories, totalAmount };
}

/**
 * Computes the exported CSV actual amount and variance for a sheet row,
 * ensuring only settled ('Paid') rows with an actual cost contribute to exported actuals.
 */
export function computeCsvRowExportValues(row: {
  type: EntryType;
  estimatedCost?: number;
  actualCost?: number;
  hasActualCost: boolean;
  status?: 'Paid' | 'Pending' | 'Scheduled';
}): { est: number; act: number; diff: number } {
  const est = row.estimatedCost || 0;
  const act = row.hasActualCost && row.status === 'Paid' ? (row.actualCost ?? 0) : 0;
  const diff = row.type === 'income' ? act - est : est - act;
  return { est, act, diff };
}

/**
 * Computes how much was saved this year for each canonical Sinking Fund from budget entries.
 * Uses `entry.actualCost ?? entry.amount ?? 0` and excludes `Pending` entries.
 */
export function computeSinkingFundSavedThisYear(
  entries: BudgetEntry[],
  knownCanonicalPool: string[] = [...DEFAULT_SINKING_FUND_NAMES]
): Map<string, number> {
  const savedByFundKey = new Map<string, number>();

  entries
    .filter((e) => e.type === 'saving')
    .forEach((entry) => {
      const rawItem = (entry.item || entry.description || '').trim();
      if (rawItem.toLowerCase() === 'general reserves / starting capital') {
        return;
      }
      const fundName = resolveCanonicalSinkingFundName(rawItem, entry.category, knownCanonicalPool);
      const trimmed = fundName.trim();
      if (trimmed.toLowerCase() === 'general reserves / starting capital') {
        return;
      }
      const key = trimmed.toLowerCase();
      if (entry.status !== 'Pending') {
        const amt = entry.actualCost ?? entry.amount ?? 0;
        savedByFundKey.set(key, (savedByFundKey.get(key) || 0) + amt);
      }
    });

  return savedByFundKey;
}

/**
 * Normalizes a user-edited monthly target into a template's per-period `defaultEstimatedCost`.
 * Bi-weekly templates occurring in both P1 & P2 divide the monthly target by 2.
 */
export function normalizeMonthlyTargetToTemplateCost(
  monthlyTarget: number,
  frequency?: 'monthly' | 'bi-weekly' | 'both',
  biweeklyPeriod?: 'P1' | 'P2' | 'both'
): number {
  const isBiweeklyBoth =
    frequency === 'bi-weekly' && (!biweeklyPeriod || biweeklyPeriod === 'both');
  return isBiweeklyBoth ? monthlyTarget / 2 : monthlyTarget;
}

/**
 * Computes the annual planned target from a saving template's `defaultEstimatedCost`.
 */
export function computeAnnualTargetFromTemplate(
  defaultEstimatedCost: number,
  frequency?: 'monthly' | 'bi-weekly' | 'both',
  biweeklyPeriod?: 'P1' | 'P2' | 'both'
): number {
  const annualMultiplier =
    frequency === 'bi-weekly' && (!biweeklyPeriod || biweeklyPeriod === 'both') ? 24 : 12;
  return (defaultEstimatedCost || 0) * annualMultiplier;
}

/**
 * Computes derived loan metrics including remaining balance, completion status,
 * installment progress, and normalized monthly commitment.
 */
export function computeLoanMetrics(
  loan: LoanRecord,
  itemTemplates: BudgetItemTemplate[] = []
) {
  const paymentsSum = (loan.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
  const totalPaid = (loan.initialPaidAmount || 0) + paymentsSum;
  const totalContract = loan.totalContractAmount || 0;
  const remainingBalance = Math.max(0, totalContract - totalPaid);
  const progressPct = totalContract > 0 ? Math.min(100, (totalPaid / totalContract) * 100) : 0;

  const recordedPaymentsCount = (loan.payments || []).length;
  const initialTerms = loan.initialInstallmentsPaid || 0;
  const estimatedTermsPaid =
    loan.installmentAmount > 0
      ? Math.min(
          loan.totalInstallments || 0,
          Math.floor((totalPaid + 0.01) / loan.installmentAmount)
        )
      : initialTerms + recordedPaymentsCount;
  const termsPaid = Math.max(initialTerms + recordedPaymentsCount, estimatedTermsPaid);
  const totalTerms = loan.totalInstallments || 0;
  const remainingTerms = totalTerms > 0 ? Math.max(0, totalTerms - termsPaid) : 0;
  const isCompleted =
    loan.status === 'completed' || (totalContract > 0 && remainingBalance <= 0.005);

  const monthlyCommitment = isCompleted
    ? 0
    : loan.frequency === 'bi-weekly'
    ? loan.biweeklyPeriod === 'both'
      ? (loan.installmentAmount || 0) * 2
      : loan.installmentAmount || 0
    : loan.installmentAmount || 0;

  const targetTplType = loan.direction === 'borrowed' ? 'expense' : 'income';
  const hasLinkedTemplate = Boolean(
    itemTemplates.some(
      (t) =>
        (loan.linkedTemplateId && t.id === loan.linkedTemplateId) ||
        (t.loanId && t.loanId === loan.id) ||
        (t.type === targetTplType && t.item.trim().toLowerCase() === loan.name.trim().toLowerCase())
    )
  );

  return {
    paymentsSum,
    totalPaid,
    totalContract,
    remainingBalance,
    progressPct,
    termsPaid,
    totalTerms,
    remainingTerms,
    isCompleted,
    monthlyCommitment,
    hasLinkedTemplate,
  };
}

/**
 * Parses a YYYY-MM-DD payment/transaction date string into year, period, and periodIndex
 * without UTC-midnight timezone shift.
 */
export function parseDateToYearAndPeriod(
  dateStr: string,
  fallbackYear: number,
  frequency: EntryFrequency
): {
  year: number;
  monthIdx: number;
  dayOfMonth: number;
  period: string;
  periodIndex: number;
} {
  const dateParts = (dateStr || '').split('-').map((n) => parseInt(n, 10));
  const now = new Date();
  const year =
    dateParts.length === 3 && !isNaN(dateParts[0]) ? dateParts[0] : fallbackYear;
  const monthIdx =
    dateParts.length === 3 && !isNaN(dateParts[1])
      ? Math.max(0, Math.min(11, dateParts[1] - 1))
      : now.getMonth();
  const dayOfMonth =
    dateParts.length === 3 && !isNaN(dateParts[2]) ? dateParts[2] : now.getDate();
  const monthName = MONTH_NAMES[monthIdx] || 'Jan';
  const period =
    frequency === 'bi-weekly'
      ? `${monthName}-${dayOfMonth <= 15 ? 'P1' : 'P2'}`
      : monthName;
  const periodIndex =
    frequency === 'bi-weekly'
      ? Math.max(0, BIWEEKLY_PERIODS.findIndex((p) => p.id === period))
      : monthIdx;

  return {
    year,
    monthIdx,
    dayOfMonth,
    period,
    periodIndex,
  };
}
