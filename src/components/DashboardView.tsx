import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  Wallet,
  Receipt,
  PiggyBank,
  Percent,
  PlusCircle,
  Cloud,
  ArrowUpRight,
  ArrowDownRight,
  ShieldCheck,
  Calendar,
  Sparkles,
  FileSpreadsheet,
  Landmark,
  Target,
  Layers,
  ArrowLeftRight,
  CheckCircle2,
} from 'lucide-react';
import { YearBudgetData, SavingsLedgerData, EntryFrequency, EntryType } from '../types/finance';
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
  onNavigateToBudget: () => void;
  onNavigateToDrive: () => void;
  currencySymbol?: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  budget,
  ledger,
  frequency,
  onNavigateToSavings,
  onNavigateToBudget,
  onNavigateToDrive,
  currencySymbol = '$',
}) => {
  const [donutType, setDonutType] = useState<EntryType>('expense');

  const isBiWeeklyPeriod = (p: string) => p.includes('-P1') || p.includes('-P2');
  const modeEntries = budget.entries.filter((e) =>
    frequency === 'bi-weekly' ? isBiWeeklyPeriod(e.period) : !isBiWeeklyPeriod(e.period)
  );
  const activeEntries = modeEntries.length > 0 ? modeEntries : budget.entries;

  // Compute KPI metrics
  const totalIncome = activeEntries
    .filter((e) => e.type === 'income')
    .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);

  const totalExpenses = activeEntries
    .filter((e) => e.type === 'expense')
    .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);

  const totalSavings = activeEntries
    .filter((e) => e.type === 'saving')
    .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);

  const activeIncomePeriods = Math.max(
    1,
    new Set(activeEntries.filter((e) => e.type === 'income' && (e.actualCost ?? e.amount ?? 0) > 0).map((e) => e.period)).size
  );

  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0;

  // Average monthly living expense (normalized by calendar month even in bi-weekly mode)
  const activeExpenseMonths = Math.max(
    1,
    new Set(
      activeEntries
        .filter((e) => e.type === 'expense' && (e.actualCost ?? e.amount ?? 0) > 0)
        .map((e) => e.period.replace(/-P[12]$/i, ''))
    ).size
  );
  const avgMonthlyExpense = totalExpenses > 0
    ? totalExpenses / activeExpenseMonths
    : budget.itemTemplates
    ? budget.itemTemplates.filter((t) => t.type === 'expense').reduce((sum, t) => sum + (t.defaultEstimatedCost || 0), 0)
    : 0;

  // Latest capital from ledger (prioritize actual sum of physical accounts)
  const accountsBalanceSum = ledger.accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const currentTotalCapital =
    accountsBalanceSum > 0
      ? accountsBalanceSum
      : ledger.transactions.length > 0
      ? ledger.transactions[ledger.transactions.length - 1].runningTotalCapital ?? 0
      : ledger.initialCapital || 0;

  // Total liquid reserves
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
  const liquidCapital = ledger.accounts
    .filter((a) => !a.type || liquidAccountTypes.has(a.type))
    .reduce((sum, a) => sum + (a.balance || 0), 0) || accountsBalanceSum;

  const runwayMonths = avgMonthlyExpense > 0 ? liquidCapital / avgMonthlyExpense : 0;
  const runwayStatus =
    runwayMonths >= 6
      ? { label: 'Strong Cushion', color: 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800' }
      : runwayMonths >= 3
      ? { label: 'Healthy (3-6 mo)', color: 'text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border-indigo-200 dark:border-indigo-800' }
      : runwayMonths >= 1
      ? { label: 'Building (1-3 mo)', color: 'text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800' }
      : { label: 'Priority Cushion', color: 'text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800' };

  const startingCapital = ledger.initialCapital || 0;
  const capitalGrowth = currentTotalCapital - startingCapital;
  const capitalGrowthPct = startingCapital > 0 ? (capitalGrowth / startingCapital) * 100 : 0;

  // Calculate Category Funds / Cushion Reserves
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
          fund.plannedAnnualTarget = Math.max(fund.plannedAnnualTarget || 0, (tpl.defaultEstimatedCost || 0) * 12);
        });
    }

    if (budget?.entries) {
      budget.entries
        .filter((e) => e.type === 'saving')
        .forEach((entry) => {
          const fundName = resolveCanonicalSinkingFundName(
            entry.item || entry.description,
            entry.category,
            knownCanonicalPool
          );
          getOrCreateFund(fundName, entry.category || 'General Savings');
        });
    }

    ledger.transactions.forEach((tx) => {
      const amt = tx.amount || 0;

      // Physical bank-to-bank transfers do not alter category fund balances
      if (tx.source === 'transfer') {
        return;
      }

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
        fundName = resolveCanonicalSinkingFundName(
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
          fundName = resolveCanonicalSinkingFundName(
            linkedEntry.item || linkedEntry.description,
            linkedEntry.category,
            knownCanonicalPool
          );
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

    const result: { id: string; name: string; category: string; color: string; currentBalance: number; plannedAnnualTarget?: number }[] = [];
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

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  return (
    <div className="space-y-6">
      
      {/* Welcome & Top Action Bar */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute right-40 top-0 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-700/60 text-indigo-200 text-xs font-semibold mb-3 border border-indigo-500/30">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span>{budget.year} Financial Overview &amp; Capital Ledger</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Annual Financial Performance
            </h1>
            <p className="mt-1 text-sm text-indigo-200 max-w-xl">
              Track your liquid physical accounts, open-ended cushion reserves, and automated accumulation into your Google Drive capital growth ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={onNavigateToBudget}
              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>View Budget Sheet</span>
            </button>
            <button
              onClick={onNavigateToSavings}
              className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-xl backdrop-blur-xs border border-white/15 transition-all flex items-center gap-2 cursor-pointer"
            >
              <PiggyBank className="w-4 h-4 text-emerald-300" />
              <span>Manage Funds &amp; Accounts</span>
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Row (5 Recommended Metrics) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        
        {/* 1. Total Assets / Capital */}
        <div
          onClick={onNavigateToSavings}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Assets &amp; Capital
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {currencySymbol}{formatNumber(currentTotalCapital)}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" />
            <span>+{currencySymbol}{formatNumber(capitalGrowth)} ({capitalGrowthPct.toFixed(1)}%)</span>
          </div>
        </div>

        {/* 2. Emergency Fund Runway */}
        <div
          onClick={onNavigateToSavings}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-300 dark:hover:border-emerald-700 transition-all cursor-pointer group"
          title={`Liquid Reserves: ${currencySymbol}${formatNumber(liquidCapital)} / Avg Expense: ${currencySymbol}${formatNumber(avgMonthlyExpense)}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Emergency Runway
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {runwayMonths > 0 ? runwayMonths.toFixed(1) : '—'}
            </span>
            <span className="text-xs font-semibold text-slate-500">months</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${runwayStatus.color}`}
            >
              {runwayStatus.label}
            </span>
          </div>
        </div>

        {/* 3. Category Funds & Sinking Reserves */}
        <div
          onClick={onNavigateToSavings}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Allocated Category Funds
            </span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Target className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {currencySymbol}{formatNumber(totalAllocatedCategoryReserves)}
            </span>
          </div>
          <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
            <span>{categoryFunds.length} active envelope pools</span>
          </div>
        </div>

        {/* 4. Unallocated Cash Reserve */}
        <div
          onClick={onNavigateToSavings}
          className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-300 dark:hover:border-amber-700 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Unallocated Cash
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
              {currencySymbol}{formatNumber(unallocatedCashReserve)}
            </span>
          </div>
          <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
            <span>Ready to assign to goals</span>
          </div>
        </div>

        {/* 5. Savings Rate */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {budget.year} Savings Rate
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Percent className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
              {savingsRate.toFixed(1)}%
            </span>
            <span className="text-xs font-mono text-slate-500">
              ({currencySymbol}{formatNumber(totalSavings)})
            </span>
          </div>
          <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
            <span>{savingsRate >= 20 ? 'Target ≥20% Met!' : 'Accumulating to Ledger'}</span>
          </div>
        </div>

      </div>

      {/* Physical Bank Accounts At-A-Glance Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Landmark className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Physical Money Locations &amp; Accounts ({ledger.accounts.length})
            </h3>
          </div>
          <button
            type="button"
            onClick={onNavigateToSavings}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
          >
            Manage Accounts &rarr;
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {ledger.accounts.map((acc) => {
            const share = currentTotalCapital > 0 ? (acc.balance / currentTotalCapital) * 100 : 0;
            return (
              <div
                key={acc.id}
                onClick={onNavigateToSavings}
                className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 hover:border-emerald-500/50 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-1.5 mb-1 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: acc.color || '#10b981' }}
                  />
                  <span className="font-semibold text-xs text-slate-800 dark:text-slate-200 truncate" title={acc.name}>
                    {acc.name}
                  </span>
                </div>
                <div className="text-base font-bold font-mono text-slate-900 dark:text-white">
                  {currencySymbol}{formatNumber(acc.balance)}
                </div>
                <div className="text-[10px] text-slate-400 mt-0.5 flex items-center justify-between">
                  <span>{acc.type ? acc.type.split(' ')[0] : 'Account'}</span>
                  <span className="font-semibold text-slate-600 dark:text-slate-300">{share.toFixed(0)}%</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Active Cushion Reserves & Category Funds Summary Widget */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Active Category Cushion Reserves &amp; Sinking Funds
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Current available reserve balances allocated across your virtual category envelopes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onNavigateToSavings}
              className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 text-xs font-semibold rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              <span>Reallocate Funds</span>
            </button>
            <button
              type="button"
              onClick={onNavigateToSavings}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              View All Envelopes &rarr;
            </button>
          </div>
        </div>

        {categoryFunds.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {categoryFunds.slice(0, 6).map((fund) => {
              const isOpenEnded = !fund.plannedAnnualTarget || fund.plannedAnnualTarget === 0;
              return (
                <div
                  key={fund.id}
                  onClick={onNavigateToSavings}
                  className="p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-indigo-500/50 transition-all cursor-pointer flex flex-col justify-between space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: fund.color }}
                      />
                      <span className="font-bold text-xs text-slate-900 dark:text-white truncate" title={fund.name}>
                        {fund.name}
                      </span>
                    </div>
                    {isOpenEnded ? (
                      <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/80 px-2 py-0.5 rounded-md shrink-0">
                        <ShieldCheck className="w-3 h-3" />
                        <span>Cushion</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-md shrink-0">
                        {((fund.currentBalance / (fund.plannedAnnualTarget || 1)) * 100).toFixed(0)}%
                      </span>
                    )}
                  </div>

                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                      {currencySymbol}{formatNumber(fund.currentBalance)}
                    </span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {isOpenEnded ? 'Continuous Pool' : `Goal: ${currencySymbol}${formatNumber(fund.plannedAnnualTarget || 0)}`}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200/60 dark:border-slate-800">
            No active category funds created yet. Add savings items in your budget sheet or record deposits in the Funds tab.
          </div>
        )}
      </div>

      {/* Main Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left: Monthly/Bi-Weekly Cashflow Performance Chart */}
        <div className="lg:col-span-8">
          <CashflowChart
            entries={budget.entries}
            frequency={frequency}
            currencySymbol={currencySymbol}
          />
        </div>

        {/* Right: Category Distribution Donut */}
        <div className="lg:col-span-4 flex flex-col">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Category Breakdown
            </span>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg text-xs">
              <button
                onClick={() => setDonutType('expense')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  donutType === 'expense'
                    ? 'bg-white dark:bg-slate-900 text-rose-600 font-semibold shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Expense
              </button>
              <button
                onClick={() => setDonutType('saving')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  donutType === 'saving'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 font-semibold shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Funds
              </button>
              <button
                onClick={() => setDonutType('income')}
                className={`px-2 py-0.5 rounded-md transition-colors ${
                  donutType === 'income'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 font-semibold shadow-2xs'
                    : 'text-slate-500'
                }`}
              >
                Income
              </button>
            </div>
          </div>

          <div className="flex-1">
            <CategoryDonutChart
              entries={activeEntries}
              type={donutType}
              currencySymbol={currencySymbol}
            />
          </div>
        </div>

      </div>

      {/* Bottom Chart: Capital Growth & Savings Ledger Accumulation */}
      <div>
        <CapitalGrowthChart ledger={ledger} currencySymbol={currencySymbol} />
      </div>

      {/* Quick Summary / Google Drive Integration Banner */}
      <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3 min-w-0">
          <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Cloud className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              Google Drive Cloud Database (/CapitalFlow Financial Database/)
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed break-words">
              Data is organized in 3 separate JSON files: <code className="font-mono text-indigo-600 dark:text-indigo-400">capitalflow_budget_{budget.year}.json</code> (annual budget), <code className="font-mono text-amber-600 dark:text-amber-400">capitalflow_budget_template.json</code> (personalized estimate template), and <code className="font-mono text-emerald-600 dark:text-emerald-400">capitalflow_savings_ledger.json</code> (multi-year funds).
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToDrive}
          className="w-full sm:w-auto justify-center px-4 py-2.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
        >
          <span>Manage Google Drive Files</span>
        </button>
      </div>

    </div>
  );
};
