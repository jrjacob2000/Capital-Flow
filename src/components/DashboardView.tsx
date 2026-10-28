import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Wallet,
  PiggyBank,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Landmark,
  Scale,
  ChevronRight,
  BarChart3,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
} from 'lucide-react';
import { YearBudgetData, SavingsLedgerData, EntryFrequency, EntryType, LoanRecord } from '../types/finance';
import {
  resolveCanonicalSinkingFundName,
  normalizeSavingCategoryGroup,
  DEFAULT_SINKING_FUND_NAMES,
} from '../services/sampleData';
import { CashflowChart } from './charts/CashflowChart';
import { CapitalGrowthChart } from './charts/CapitalGrowthChart';
import { CategoryDonutChart } from './charts/CategoryDonutChart';

interface DashboardViewProps {
  budget: YearBudgetData;
  ledger: SavingsLedgerData;
  frequency: EntryFrequency;
  onOpenAddEntry?: (type?: EntryType) => void;
  onNavigateToSavings: () => void;
  onNavigateToLoans?: () => void;
  onNavigateToBudget: () => void;
  onNavigateToDrive: () => void;
  currencySymbol?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  budget,
  ledger,
  frequency,
  onOpenAddEntry,
  onNavigateToSavings,
  onNavigateToLoans,
  onNavigateToBudget,
  currencySymbol = '$',
}) => {
  const [donutType, setDonutType] = useState<EntryType>('expense');
  const [activeChartTab, setActiveChartTab] = useState<'cashflow' | 'growth' | 'breakdown'>('cashflow');
  const [snapshotTab, setSnapshotTab] = useState<'funds' | 'accounts'>('funds');

  const isBiWeeklyPeriod = (p: string) => p.includes('-P1') || p.includes('-P2');
  const modeEntries = budget.entries.filter((e) =>
    frequency === 'bi-weekly' ? isBiWeeklyPeriod(e.period) : !isBiWeeklyPeriod(e.period)
  );
  const activeEntries = modeEntries.length > 0 ? modeEntries : budget.entries;

  // Core Cashflow Metrics (Settled / Paid entries)
  const totalIncome = activeEntries
    .filter((e) => e.type === 'income' && e.status !== 'Pending')
    .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);

  const totalExpenses = activeEntries
    .filter((e) => e.type === 'expense' && e.status !== 'Pending')
    .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);

  const totalSavings = activeEntries
    .filter((e) => e.type === 'saving' && e.status !== 'Pending')
    .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);

  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

  // Average monthly living expense
  const activeExpenseMonths = Math.max(
    1,
    new Set(
      activeEntries
        .filter((e) => e.type === 'expense' && (e.actualCost ?? e.amount ?? 0) > 0)
        .map((e) => e.period.replace(/-P[12]$/i, ''))
    ).size
  );
  const avgMonthlyExpense =
    totalExpenses > 0
      ? totalExpenses / activeExpenseMonths
      : budget.itemTemplates
      ? budget.itemTemplates
          .filter((t) => t.type === 'expense')
          .reduce(
            (sum, t) =>
              sum +
              (t.frequency === 'bi-weekly' && (!t.biweeklyPeriod || t.biweeklyPeriod === 'both')
                ? (t.defaultEstimatedCost || 0) * 2
                : t.defaultEstimatedCost || 0),
            0
          )
      : 0;

  // Total Capital from physical accounts
  const accountsBalanceSum = ledger.accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const currentTotalCapital =
    accountsBalanceSum > 0
      ? accountsBalanceSum
      : ledger.transactions.length > 0
      ? ledger.transactions[ledger.transactions.length - 1].runningTotalCapital ?? 0
      : ledger.initialCapital || 0;

  // Liquid Reserves & Emergency Runway
  const liquidAccountTypes = new Set([
    'Digital Bank (High-Yield)',
    'Traditional Bank (Savings / Checking)',
    'E-Wallet',
    'Emergency Fund',
    'Time Deposit',
    'Cash on Hand',
    'High-Yield Savings',
    'Cash / Checking',
  ]);
  const liquidCapital =
    ledger.accounts
      .filter((a) => !a.type || liquidAccountTypes.has(a.type))
      .reduce((sum, a) => sum + (a.balance || 0), 0) || accountsBalanceSum;

  const runwayMonths = avgMonthlyExpense > 0 ? liquidCapital / avgMonthlyExpense : 0;
  const runwayStatus =
    runwayMonths >= 6
      ? { label: 'Strong', color: 'text-emerald-600 dark:text-emerald-400' }
      : runwayMonths >= 3
      ? { label: 'Healthy', color: 'text-indigo-600 dark:text-indigo-400' }
      : runwayMonths >= 1
      ? { label: 'Building', color: 'text-amber-600 dark:text-amber-400' }
      : { label: 'Low Cushion', color: 'text-rose-600 dark:text-rose-400' };

  const startingCapital = ledger.initialCapital || 0;
  const capitalGrowth = currentTotalCapital - startingCapital;
  const capitalGrowthPct = startingCapital > 0 ? (capitalGrowth / startingCapital) * 100 : 0;

  // Canonical Sinking Funds Calculation
  const categoryFunds = useMemo(() => {
    const FUND_COLORS = [
      '#10b981', '#6366f1', '#f59e0b', '#06b6d4', '#ec4899',
      '#8b5cf6', '#3b82f6', '#14b8a6', '#f43f5e', '#64748b',
    ];

    const fundMap = new Map<
      string,
      {
        id: string;
        name: string;
        category: string;
        color: string;
        inflow: number;
        outflow: number;
        plannedAnnualTarget?: number;
      }
    >();

    const knownCanonicalPool = Array.from(
      new Set([
        ...DEFAULT_SINKING_FUND_NAMES,
        ...(budget?.itemTemplates || [])
          .filter((t) => t.type === 'saving')
          .map((t) => resolveCanonicalSinkingFundName(t.item, t.category, DEFAULT_SINKING_FUND_NAMES)),
      ])
    );

    const getOrCreateFund = (name: string, category: string = 'Short-Term & General Savings', customColor?: string) => {
      const canonical = resolveCanonicalSinkingFundName(name, category, knownCanonicalPool);
      const trimmed = canonical.trim();
      const key = trimmed.toLowerCase();
      if (!knownCanonicalPool.some((p) => p.toLowerCase() === key)) {
        knownCanonicalPool.push(trimmed);
      }
      const resolvedCat = normalizeSavingCategoryGroup(trimmed, category);
      if (!fundMap.has(key)) {
        const assignedColor = customColor || FUND_COLORS[fundMap.size % FUND_COLORS.length];
        fundMap.set(key, {
          id: `fund-${fundMap.size + 1}`,
          name: trimmed,
          category: resolvedCat,
          color: assignedColor,
          inflow: 0,
          outflow: 0,
        });
      }
      return fundMap.get(key)!;
    };

    if (budget?.itemTemplates) {
      budget.itemTemplates
        .filter((t) => t.type === 'saving')
        .forEach((tpl, idx) => {
          const fund = getOrCreateFund(tpl.item, tpl.category || 'General Savings', FUND_COLORS[idx % FUND_COLORS.length]);
          const annualMultiplier =
            tpl.frequency === 'bi-weekly' && (!tpl.biweeklyPeriod || tpl.biweeklyPeriod === 'both') ? 24 : 12;
          fund.plannedAnnualTarget = Math.max(
            fund.plannedAnnualTarget || 0,
            (tpl.defaultEstimatedCost || 0) * annualMultiplier
          );
        });
    }

    if (budget?.entries) {
      budget.entries
        .filter((e) => e.type === 'saving')
        .forEach((entry) => {
          const rawItem = (entry.item || entry.description || '').trim();
          if (rawItem.toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          const fundName = resolveCanonicalSinkingFundName(rawItem, entry.category, knownCanonicalPool);
          if (fundName.trim().toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          getOrCreateFund(fundName, entry.category || 'General Savings');
        });
    }

    ledger.transactions.forEach((tx) => {
      const amt = tx.amount || 0;
      if (tx.source === 'transfer') return;

      if (tx.source === 'reallocation') {
        const fromFundName = tx.category || 'General Reserves / Starting Capital';
        const toFundName = tx.toCategory || 'General Reserves / Starting Capital';
        const isFromUnallocated = fromFundName.trim().toLowerCase() === 'general reserves / starting capital';
        const isToUnallocated = toFundName.trim().toLowerCase() === 'general reserves / starting capital';

        if (!isFromUnallocated) {
          const fromFund = getOrCreateFund(fromFundName, fromFundName);
          fromFund.outflow += amt;
        }
        if (!isToUnallocated) {
          const toFund = getOrCreateFund(toFundName, toFundName);
          toFund.inflow += amt;
        }
        return;
      }

      let fundName = '';
      let category = tx.category || 'General Savings';

      if (tx.category && tx.category.trim().toLowerCase() === 'general reserves / starting capital') {
        return;
      }

      if (tx.source === 'interest_yield') {
        fundName = tx.category && tx.category.trim() ? tx.category.trim() : 'Compounding Yields & Dividend';
        category = tx.category && tx.category.trim() ? 'Savings / Yield' : 'Yield & Interest';
      } else if (tx.source === 'withdrawal') {
        fundName =
          resolveCanonicalSinkingFundName(
            tx.category || tx.note.replace(/^Withdrawal:\s*/i, '').trim(),
            tx.category,
            knownCanonicalPool
          ) || 'General Withdrawal';
        category = tx.category || 'Withdrawal';
      } else {
        const linkedEntry = tx.budgetEntryId
          ? budget?.entries?.find((e) => e.id === tx.budgetEntryId)
          : undefined;
        if (linkedEntry) {
          const rawLinkedItem = (linkedEntry.item || linkedEntry.description || '').trim();
          if (rawLinkedItem.toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          fundName = resolveCanonicalSinkingFundName(rawLinkedItem, linkedEntry.category, knownCanonicalPool);
          if (fundName.trim().toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          category = linkedEntry.category || category;
        } else if (tx.source === 'manual_deposit' && !tx.category) {
          const cleanNote = tx.note
            .replace(/^Budget Sync:\s*/i, '')
            .replace(/^Manual Deposit:\s*/i, '')
            .trim();
          const canonicalNote = resolveCanonicalSinkingFundName(cleanNote, undefined, knownCanonicalPool);
          if (cleanNote && fundMap.has(canonicalNote.toLowerCase())) {
            fundName = canonicalNote;
          } else {
            return;
          }
        } else {
          const cleanNote = tx.note
            .replace(/^Budget Sync:\s*/i, '')
            .replace(/^Manual Deposit:\s*/i, '')
            .trim();
          fundName = resolveCanonicalSinkingFundName(cleanNote, tx.category, knownCanonicalPool);
        }
      }

      const fund = getOrCreateFund(fundName, category);
      if (tx.source === 'withdrawal') {
        fund.outflow += amt;
      } else {
        fund.inflow += amt;
      }
    });

    const result: {
      id: string;
      name: string;
      category: string;
      color: string;
      currentBalance: number;
      plannedAnnualTarget?: number;
    }[] = [];
    fundMap.forEach((f) => {
      const net = Math.max(0, f.inflow - f.outflow);
      result.push({
        id: f.id,
        name: f.name,
        category: f.category,
        color: f.color,
        currentBalance: net,
        plannedAnnualTarget: f.plannedAnnualTarget,
      });
    });

    return result.sort((a, b) => b.currentBalance - a.currentBalance);
  }, [ledger.transactions, budget]);

  const totalAllocatedCategoryReserves = categoryFunds.reduce((sum, f) => sum + f.currentBalance, 0);
  const unallocatedCashReserve = Math.max(0, currentTotalCapital - totalAllocatedCategoryReserves);
  const unallocatedBudgetSurplus = totalIncome - totalExpenses - totalSavings;

  // Loans & Debt Summary
  const loanSummary = useMemo(() => {
    const loans: LoanRecord[] = ledger.loans || [];
    let borrowedRemaining = 0;
    let borrowedPaid = 0;
    let borrowedContract = 0;
    let borrowedMonthlyCommitment = 0;
    let activeBorrowedCount = 0;

    let lentRemaining = 0;
    let activeLentCount = 0;

    const activeLoanItems: {
      loan: LoanRecord;
      remainingBalance: number;
      progressPct: number;
      termsPaid: number;
      totalTerms: number;
      remainingTerms: number;
    }[] = [];

    loans.forEach((ln) => {
      const paymentsSum = (ln.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
      const totalPaid = (ln.initialPaidAmount || 0) + paymentsSum;
      const totalContract = ln.totalContractAmount || 0;
      const remainingBalance = Math.max(0, totalContract - totalPaid);
      const progressPct = totalContract > 0 ? Math.min(100, (totalPaid / totalContract) * 100) : 0;

      const recordedPaymentsCount = (ln.payments || []).length;
      const initialTerms = ln.initialInstallmentsPaid || 0;
      const estimatedTermsPaid =
        ln.installmentAmount > 0
          ? Math.min(ln.totalInstallments || 0, Math.floor((totalPaid + 0.01) / ln.installmentAmount))
          : initialTerms + recordedPaymentsCount;
      const termsPaid = Math.max(initialTerms + recordedPaymentsCount, estimatedTermsPaid);
      const totalTerms = ln.totalInstallments || 0;
      const remainingTerms = totalTerms > 0 ? Math.max(0, totalTerms - termsPaid) : 0;
      const isCompleted = ln.status === 'completed' || (totalContract > 0 && remainingBalance <= 0.005);

      const monthlyCommitment = isCompleted
        ? 0
        : ln.frequency === 'bi-weekly'
        ? ln.biweeklyPeriod === 'both'
          ? (ln.installmentAmount || 0) * 2
          : ln.installmentAmount || 0
        : ln.installmentAmount || 0;

      if (ln.direction === 'borrowed') {
        borrowedPaid += totalPaid;
        borrowedContract += totalContract;
        if (!isCompleted) {
          borrowedRemaining += remainingBalance;
          borrowedMonthlyCommitment += monthlyCommitment;
          activeBorrowedCount += 1;
        }
      } else {
        if (!isCompleted) {
          lentRemaining += remainingBalance;
          activeLentCount += 1;
        }
      }

      if (!isCompleted) {
        activeLoanItems.push({
          loan: ln,
          remainingBalance,
          progressPct,
          termsPaid,
          totalTerms,
          remainingTerms,
        });
      }
    });

    activeLoanItems.sort((a, b) => b.remainingBalance - a.remainingBalance);

    const netLoanPosition = lentRemaining - borrowedRemaining;
    const trueNetWorth = currentTotalCapital + netLoanPosition;

    return {
      borrowedRemaining,
      borrowedMonthlyCommitment,
      activeBorrowedCount,
      lentRemaining,
      activeLentCount,
      trueNetWorth,
      activeLoanItems,
    };
  }, [ledger.loans, currentTotalCapital]);

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  return (
    <div className="space-y-4 pb-6">
      {/* 1. Executive Capital & Net Worth Summary Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 text-indigo-300 text-xs font-medium">
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>Total Savings Across {ledger.accounts.length} Accounts</span>
              </div>
              <div className="mt-1 flex flex-wrap items-baseline gap-2.5">
                <span className="text-2xl sm:text-3xl font-bold font-mono tabular-nums tracking-tight">
                  {currencySymbol}{formatNumber(currentTotalCapital)}
                </span>
                <span
                  className={`inline-flex items-center gap-0.5 text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                    capitalGrowth >= 0
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'bg-rose-500/20 text-rose-300'
                  }`}
                >
                  {capitalGrowth >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  {capitalGrowth >= 0 ? '+' : ''}
                  {currencySymbol}{formatNumber(capitalGrowth)} ({capitalGrowthPct.toFixed(1)}%)
                </span>
              </div>
              {(loanSummary.borrowedRemaining > 0 || loanSummary.lentRemaining > 0) && (
                <div className="mt-1 text-xs text-slate-300 font-mono tabular-nums">
                  True Net Worth: <span className="font-semibold text-white">{currencySymbol}{formatNumber(loanSummary.trueNetWorth)}</span>
                  <span className="text-slate-400 font-sans ml-1.5">(after loans &amp; receivables)</span>
                </div>
              )}
            </div>

            {/* Quick Navigation Actions */}
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-1 sm:pt-0">
              {onOpenAddEntry && (
                <button
                  type="button"
                  onClick={() => onOpenAddEntry('expense')}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
                  <span>Add Entry</span>
                </button>
              )}
              <button
                type="button"
                onClick={onNavigateToBudget}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl text-xs border border-white/10 transition-colors cursor-pointer"
              >
                <span>Budget</span>
              </button>
              <button
                type="button"
                onClick={onNavigateToSavings}
                className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl text-xs border border-white/10 transition-colors cursor-pointer"
              >
                <span>Funds</span>
              </button>
              {onNavigateToLoans && (
                <button
                  type="button"
                  onClick={onNavigateToLoans}
                  className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/15 text-white font-semibold rounded-xl text-xs border border-white/10 transition-colors cursor-pointer"
                >
                  <span>Loans</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 4-Pillar Capital & Risk Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          <div
            onClick={onNavigateToSavings}
            className="p-3 sm:p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Assigned to Goal Funds</span>
              <PiggyBank className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
            </div>
            <div className="mt-1 text-sm sm:text-base font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 truncate">
              {currencySymbol}{formatNumber(totalAllocatedCategoryReserves)}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {categoryFunds.filter((f) => f.currentBalance > 0).length} active goal funds
            </div>
          </div>

          <div
            onClick={onNavigateToSavings}
            className="p-3 sm:p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Unassigned Cash</span>
              <Landmark className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            </div>
            <div className="mt-1 text-sm sm:text-base font-bold font-mono tabular-nums text-amber-600 dark:text-amber-400 truncate">
              {currencySymbol}{formatNumber(unallocatedCashReserve)}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              Available to assign to goals
            </div>
          </div>

          <div
            onClick={onNavigateToSavings}
            className="p-3 sm:p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Emergency Runway</span>
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {avgMonthlyExpense > 0 ? `${runwayMonths.toFixed(1)} mo` : 'N/A'}
              </span>
              <span className={`text-[10px] font-semibold ${runwayStatus.color}`}>
                {runwayStatus.label}
              </span>
            </div>
            <div className="text-[10px] text-slate-400 truncate font-mono tabular-nums">
              ~{currencySymbol}{formatNumber(avgMonthlyExpense)}/mo avg spend
            </div>
          </div>

          <div
            onClick={onNavigateToLoans}
            className="p-3 sm:p-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>
                {loanSummary.borrowedRemaining > 0.005
                  ? 'Remaining Debt'
                  : loanSummary.lentRemaining > 0.005
                  ? 'Receivables'
                  : 'Debt Balance'}
              </span>
              <Scale className="w-3.5 h-3.5 text-rose-500 shrink-0" />
            </div>
            <div
              className={`mt-1 text-sm sm:text-base font-bold font-mono tabular-nums truncate ${
                loanSummary.borrowedRemaining > 0.005
                  ? 'text-rose-600 dark:text-rose-400'
                  : loanSummary.lentRemaining > 0.005
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {loanSummary.borrowedRemaining > 0.005
                ? `${currencySymbol}${formatNumber(loanSummary.borrowedRemaining)}`
                : loanSummary.lentRemaining > 0.005
                ? `+${currencySymbol}${formatNumber(loanSummary.lentRemaining)}`
                : `${currencySymbol}0`}
            </div>
            <div className="text-[10px] text-slate-400 truncate font-mono tabular-nums">
              {loanSummary.borrowedMonthlyCommitment > 0
                ? `${currencySymbol}${formatNumber(loanSummary.borrowedMonthlyCommitment)}/mo commitment`
                : loanSummary.activeLentCount > 0
                ? `${loanSummary.activeLentCount} active receivable${loanSummary.activeLentCount > 1 ? 's' : ''}`
                : 'No active debt'}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Annual Budget Cashflow Pulse (Compact 4-Stat Strip) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex items-center justify-between gap-2 mb-2.5">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
              {budget.year} Full-Year Cashflow ({frequency === 'bi-weekly' ? 'Bi-Weekly Budget' : 'Monthly Budget'})
            </h3>
          </div>
          <button
            type="button"
            onClick={onNavigateToBudget}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
          >
            <span>Budget Sheet</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Year-to-Date Income</div>
            <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 truncate">
              {currencySymbol}{formatNumber(totalIncome)}
            </div>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Paid Expenses</div>
            <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 truncate">
              {currencySymbol}{formatNumber(totalExpenses)}
            </div>
          </div>

          <div className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800">
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Moved to Savings</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                {savingsRate.toFixed(0)}%
              </span>
            </div>
            <div className="mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 truncate">
              {currencySymbol}{formatNumber(totalSavings)}
            </div>
          </div>

          <div
            onClick={onNavigateToBudget}
            className="p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/60 dark:border-slate-800 cursor-pointer hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
          >
            <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
              <span>Remaining Cash</span>
              <span
                className={`text-[10px] font-semibold ${
                  unallocatedBudgetSurplus > 0.005
                    ? 'text-amber-600 dark:text-amber-400'
                    : unallocatedBudgetSurplus < -0.005
                    ? 'text-rose-600 dark:text-rose-400'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {unallocatedBudgetSurplus > 0.005
                  ? 'Leftover'
                  : unallocatedBudgetSurplus < -0.005
                  ? 'Over Budget'
                  : 'Balanced'}
              </span>
            </div>
            <div
              className={`mt-0.5 text-sm sm:text-base font-bold font-mono tabular-nums truncate ${
                unallocatedBudgetSurplus < -0.005
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {unallocatedBudgetSurplus < 0 ? '-' : ''}
              {currencySymbol}{formatNumber(Math.abs(unallocatedBudgetSurplus))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. At-A-Glance Priority Lists: Top Funds/Accounts & Active Loans */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: Compact Funds & Accounts Switcher */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setSnapshotTab('funds')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    snapshotTab === 'funds'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Top Funds ({categoryFunds.filter((f) => f.currentBalance > 0).length})
                </button>
                <button
                  type="button"
                  onClick={() => setSnapshotTab('accounts')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    snapshotTab === 'accounts'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Accounts ({ledger.accounts.length})
                </button>
              </div>

              <button
                type="button"
                onClick={onNavigateToSavings}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {snapshotTab === 'funds' ? (
              categoryFunds.filter((f) => f.currentBalance > 0).length > 0 ? (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {categoryFunds
                    .filter((f) => f.currentBalance > 0)
                    .slice(0, 5)
                    .map((fund) => {
                      const target = fund.plannedAnnualTarget || 0;
                      const pct = target > 0 ? Math.min(100, (fund.currentBalance / target) * 100) : null;
                      return (
                        <div
                          key={fund.id}
                          onClick={onNavigateToSavings}
                          className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-1.5 -mx-1.5 rounded-lg transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: fund.color }}
                            />
                            <div className="min-w-0">
                              <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                                {fund.name}
                              </div>
                              <div className="text-[10px] text-slate-400 truncate">
                                {pct !== null ? `Goal: ${currencySymbol}${formatNumber(target)} (${pct.toFixed(0)}%)` : fund.category}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                            {currencySymbol}{formatNumber(fund.currentBalance)}
                          </div>
                        </div>
                      );
                    })}
                </div>
              ) : (
                <div className="py-6 text-center text-xs text-slate-400">
                  No active category funds yet.
                </div>
              )
            ) : ledger.accounts.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {ledger.accounts.slice(0, 5).map((acc) => {
                  const share = currentTotalCapital > 0 ? (acc.balance / currentTotalCapital) * 100 : 0;
                  return (
                    <div
                      key={acc.id}
                      onClick={onNavigateToSavings}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-1.5 -mx-1.5 rounded-lg transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: acc.color || '#10b981' }}
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {acc.name}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {acc.type || 'Account'} • {share.toFixed(0)}% of capital
                          </div>
                        </div>
                      </div>
                      <div className="text-xs sm:text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white shrink-0">
                        {currencySymbol}{formatNumber(acc.balance)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No physical accounts configured.
              </div>
            )}
          </div>
        </div>

        {/* Right: Active Loans & Obligations Snapshot */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-1.5">
                <Scale className="w-4 h-4 text-rose-500 shrink-0" />
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                  Active Loans &amp; Receivables ({loanSummary.activeLoanItems.length})
                </h3>
              </div>
              {onNavigateToLoans && (
                <button
                  type="button"
                  onClick={onNavigateToLoans}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
                >
                  <span>Manage</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {loanSummary.activeLoanItems.length > 0 ? (
              <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                {loanSummary.activeLoanItems.slice(0, 4).map((item) => {
                  const { loan, remainingBalance, progressPct, remainingTerms, totalTerms } = item;
                  const isBorrowed = loan.direction === 'borrowed';
                  return (
                    <div
                      key={loan.id}
                      onClick={onNavigateToLoans}
                      className="py-2 first:pt-0 last:pb-0 flex items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/80 dark:hover:bg-slate-800/40 px-1.5 -mx-1.5 rounded-lg transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                              isBorrowed ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                          />
                          <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {loan.name}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">
                            ({progressPct.toFixed(0)}%)
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {loan.counterparty} • {currencySymbol}{formatNumber(loan.installmentAmount || 0)}/
                          {loan.frequency === 'bi-weekly' ? 'cutoff' : 'mo'}
                          {totalTerms > 0 ? ` • ${remainingTerms} left` : ''}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`text-xs sm:text-sm font-bold font-mono tabular-nums ${
                            isBorrowed ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isBorrowed ? '' : '+'}
                          {currencySymbol}{formatNumber(remainingBalance)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {isBorrowed ? 'I Owe' : 'Receivable'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-6 text-center text-xs text-slate-400">
                No active debt or receivables. Track loans in the Loans tab.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Unified Visual Analytics Card (Tabbed on Mobile/Desktop to prevent scroll fatigue) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveChartTab('cashflow')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                activeChartTab === 'cashflow'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Cashflow</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveChartTab('breakdown')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                activeChartTab === 'breakdown'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <PieChartIcon className="w-3.5 h-3.5" />
              <span>Categories</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveChartTab('growth')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                activeChartTab === 'growth'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <LineChartIcon className="w-3.5 h-3.5" />
              <span>Capital Growth</span>
            </button>
          </div>

          {activeChartTab === 'breakdown' && (
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setDonutType('expense')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  donutType === 'expense'
                    ? 'bg-white dark:bg-slate-900 text-rose-600 font-semibold shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setDonutType('saving')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  donutType === 'saving'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 font-semibold shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Funds
              </button>
              <button
                type="button"
                onClick={() => setDonutType('income')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  donutType === 'income'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 font-semibold shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Income
              </button>
            </div>
          )}
        </div>

        <div>
          {activeChartTab === 'cashflow' && (
            <CashflowChart
              entries={budget.entries}
              frequency={frequency}
              currencySymbol={currencySymbol}
            />
          )}
          {activeChartTab === 'breakdown' && (
            <CategoryDonutChart
              entries={activeEntries}
              type={donutType}
              currencySymbol={currencySymbol}
            />
          )}
          {activeChartTab === 'growth' && (
            <CapitalGrowthChart ledger={ledger} currencySymbol={currencySymbol} />
          )}
        </div>
      </div>
    </div>
  );
};
