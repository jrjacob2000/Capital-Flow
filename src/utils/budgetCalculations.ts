import {
  BudgetEntry,
  BudgetItemTemplate,
  EntryFrequency,
  EntryType,
  LoanRecord,
  TemplateBudgetVisibility,
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
 * Resolves the effective budget display mode of a template item:
 * - 'displayed': Automatically appears on the budget list every matching period
 * - 'optional': Appears on the budget list marked as Optional (can be toggled on/off on the budget sheet)
 * - 'hidden': Does not automatically display on the budget sheet (available via "From Template" when adding manually)
 */
export function resolveTemplateBudgetVisibility(
  tpl: BudgetItemTemplate
): TemplateBudgetVisibility {
  if (tpl.showInBudget === false) {
    return 'hidden';
  }
  if (tpl.isOptional === true) {
    return 'optional';
  }
  if (tpl.showInBudget === true) {
    return 'displayed';
  }
  // Default fallback when neither showInBudget nor isOptional is explicitly set:
  if (tpl.type === 'income' && !isRegularSalaryIncome(tpl.item, tpl.category)) {
    return 'hidden';
  }
  return 'displayed';
}

/**
 * Applies a TemplateBudgetVisibility mode ('displayed' | 'optional' | 'hidden') to a template item.
 */
export function applyTemplateBudgetVisibility(
  tpl: BudgetItemTemplate,
  mode: TemplateBudgetVisibility
): BudgetItemTemplate {
  if (mode === 'hidden') {
    return {
      ...tpl,
      showInBudget: false,
      isOptional: false,
    };
  }
  if (mode === 'optional') {
    return {
      ...tpl,
      showInBudget: true,
      isOptional: true,
    };
  }
  return {
    ...tpl,
    showInBudget: true,
    isOptional: false,
  };
}

/**
 * Determines whether a template item should automatically display on the budget sheet
 * given whether optional items are currently enabled on the sheet.
 */
export function shouldTemplateDisplayInBudget(
  tpl: BudgetItemTemplate,
  includeOptional: boolean = true
): boolean {
  const mode = resolveTemplateBudgetVisibility(tpl);
  if (mode === 'hidden') return false;
  if (mode === 'optional') return includeOptional;
  return true;
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

  const isBiWeeklyPeriod = (p: string) => p.includes('-P1') || p.includes('-P2');
  const hasMonthlyEntries = entries.some((e) => !isBiWeeklyPeriod(e.period) && e.status !== 'Pending');
  const hasBiWeeklyEntries = entries.some((e) => isBiWeeklyPeriod(e.period) && e.status !== 'Pending');

  return periodLabels.map((label, idx) => {
    let income = 0;
    let expense = 0;
    let saving = 0;

    entries.forEach((entry) => {
      if (entry.status === 'Pending') return;
      const matchesDirectly = entry.period === label;
      const matchesMonthlyRollup =
        frequency === 'monthly' &&
        !hasMonthlyEntries &&
        hasBiWeeklyEntries &&
        entry.period.replace(/-P[12]$/i, '') === label;

      if (matchesDirectly || matchesMonthlyRollup) {
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

/**
 * Builds canonical exclusion keys for a budget item/template within a period so that
 * deleting a row from a specific period hides both its templateId and its normalized type:item key.
 */
export function getPeriodItemExclusionKeys(input: {
  templateId?: string;
  type: EntryType;
  item: string;
  loanId?: string;
}): string[] {
  const keys: string[] = [];
  if (input.templateId && input.templateId.trim()) {
    keys.push(input.templateId.trim());
  }
  if (input.loanId && input.loanId.trim()) {
    keys.push(`loan:${input.loanId.trim()}`);
  }
  const cleanItem = (input.item || '').trim().toLowerCase();
  if (cleanItem) {
    keys.push(`${input.type}:${cleanItem}`);
  }
  return Array.from(new Set(keys));
}

/**
 * Checks whether a template item has been explicitly deleted/excluded for a specific period.
 */
export function isTemplateExcludedInPeriod(
  tpl: BudgetItemTemplate,
  period: string,
  excludedPeriodItems?: Record<string, string[]>
): boolean {
  const list = excludedPeriodItems?.[period];
  if (!Array.isArray(list) || list.length === 0) return false;
  const tplKeys = getPeriodItemExclusionKeys({
    templateId: tpl.id,
    type: tpl.type,
    item: tpl.item,
    loanId: tpl.loanId,
  });
  return tplKeys.some((k) => list.includes(k));
}

/**
 * Generates Pending placeholder budget entries for a target period from all valid recurring
 * templates that have not yet been recorded or deleted in that period.
 */
export function buildAutoFillPeriodEntries(
  itemTemplates: BudgetItemTemplate[],
  existingEntries: BudgetEntry[],
  year: number,
  selectedPeriod: string,
  frequency: EntryFrequency,
  accounts: Array<{ id: string; name: string }>,
  isTemplateValidFn: (
    tpl: BudgetItemTemplate,
    freq: EntryFrequency,
    period: string
  ) => boolean,
  options?: {
    includeOptional?: boolean;
    excludedPeriodItems?: Record<string, string[]>;
  }
): {
  validTemplatesCount: number;
  newEntries: Omit<BudgetEntry, 'id' | 'createdAt'>[];
} {
  const includeOptional = options?.includeOptional ?? true;
  const validTemplates = itemTemplates.filter(
    (t) =>
      isTemplateValidFn(t, frequency, selectedPeriod) &&
      shouldTemplateDisplayInBudget(t, includeOptional) &&
      !isTemplateExcludedInPeriod(t, selectedPeriod, options?.excludedPeriodItems)
  );

  if (validTemplates.length === 0) {
    return { validTemplatesCount: 0, newEntries: [] };
  }

  const existingInPeriod = existingEntries.filter((e) => e.period === selectedPeriod);
  const unpopulated = validTemplates.filter((t) => {
    return !existingInPeriod.some(
      (e) =>
        e.type === t.type &&
        (Boolean(t.loanId && e.loanId === t.loanId) ||
          (e.item || e.description || '').toLowerCase().trim() === t.item.toLowerCase().trim())
    );
  });

  if (unpopulated.length === 0) {
    return { validTemplatesCount: validTemplates.length, newEntries: [] };
  }

  let periodIndex = 0;
  let periodDate = `${year}-01-01`;
  if (frequency === 'monthly') {
    periodIndex = Math.max(0, MONTH_NAMES.indexOf(selectedPeriod));
    periodDate = `${year}-${String(periodIndex + 1).padStart(2, '0')}-01`;
  } else {
    const bwIdx = BIWEEKLY_PERIODS.findIndex((p) => p.id === selectedPeriod);
    periodIndex = bwIdx >= 0 ? bwIdx : 0;
    const bw = BIWEEKLY_PERIODS[periodIndex];
    const mIdx = Math.max(0, MONTH_NAMES.indexOf(bw?.approxMonth || 'Jan'));
    const isP2 = bw?.id.endsWith('-P2');
    periodDate = `${year}-${String(mIdx + 1).padStart(2, '0')}-${isP2 ? '16' : '01'}`;
  }

  const defaultAcc = accounts[0];
  const newEntries: Omit<BudgetEntry, 'id' | 'createdAt'>[] = unpopulated.map((t) => {
    const targetAcc = t.defaultSavingAccountId
      ? accounts.find((a) => a.id === t.defaultSavingAccountId) || defaultAcc
      : defaultAcc;
    const estCost = t.defaultEstimatedCost || 0;

    return {
      year,
      period: selectedPeriod,
      periodIndex,
      date: periodDate,
      type: t.type,
      category: t.category,
      item: t.item,
      estimatedCost: estCost,
      actualCost: 0,
      amount: 0,
      paymentMethod: t.defaultPaymentMethod || 'Bank Transfer',
      difference: t.type === 'income' ? -estCost : estCost,
      status: 'Pending',
      reference: 'Auto-filled from template',
      toBeWithdrawn: Boolean(t.toBeWithdrawn),
      isOptional: Boolean(t.isOptional),
      description: t.item || t.category,
      savingAccountId: t.type === 'saving' ? targetAcc?.id : undefined,
      savingAccountName: t.type === 'saving' ? targetAcc?.name : undefined,
      loanId: t.loanId,
    };
  });

  return { validTemplatesCount: validTemplates.length, newEntries };
}

