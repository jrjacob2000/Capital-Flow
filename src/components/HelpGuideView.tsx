import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  LayoutDashboard,
  FileSpreadsheet,
  PiggyBank,
  HandCoins,
  HardDrive,
  CheckCircle2,
  Clock,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Calculator,
  Calendar,
  ShieldCheck,
  RefreshCw,
  HelpCircle,
  Layers,
  X,
} from 'lucide-react';
import { EntryFrequency, APP_VERSION } from '../types/finance';
import {
  CAPITALFLOW_DRIVE_FOLDER_NAME,
  getBudgetFileName,
  BUDGET_TEMPLATE_FILE_NAME,
  SAVINGS_LEDGER_FILE_NAME,
} from '../services/driveService';

export type AppTab = 'dashboard' | 'budget' | 'savings' | 'loans' | 'drive' | 'help';

interface HelpGuideViewProps {
  onNavigateTab: (tab: AppTab) => void;
  currentYear: number;
  frequency: EntryFrequency;
  onChangeFrequency: (freq: EntryFrequency) => void;
  currencySymbol?: string;
}

type GuideSectionId =
  | 'all'
  | 'quickstart'
  | 'dashboard'
  | 'budget'
  | 'funds'
  | 'loans'
  | 'drive'
  | 'faq';

interface FaqItem {
  id: string;
  category: Exclude<GuideSectionId, 'all'>;
  categoryLabel: string;
  question: string;
  answer: string;
  formulaOrExample?: string;
  actionLabel?: string;
  actionTab?: AppTab;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'faq-earmarked',
    category: 'funds',
    categoryLabel: 'Funds & Ledger',
    question: 'What does "Earmarked in Funds" mean on my Savings & Accounts view?',
    answer:
      'Earmarked represents the portion of your actual bank or wallet money that is already reserved (allocated) for specific Sinking Funds or savings goals (such as Emergency Fund, Travel Fund, or Car Maintenance). Your Unallocated / Available Balance is your Total Account Balance minus Earmarked Funds—showing how much cash is genuinely free without dipping into your dedicated goals.',
    formulaOrExample:
      'Total Account Balance (₱150,000) − Earmarked in Funds (₱95,000) = Unallocated Cash (₱55,000)',
    actionLabel: 'Open Funds & Accounts',
    actionTab: 'savings',
  },
  {
    id: 'faq-cashflow-summary',
    category: 'dashboard',
    categoryLabel: 'Dashboard & Cashflow',
    question: 'How does the "Cashflow Summary (Monthly)" on the Dashboard work? Is it my total annual accumulation?',
    answer:
      'The Cashflow Summary (Monthly) lets you inspect a single selected month (e.g., January or February) at a time using the month selector dropdown, while the Annual Settled summary cards and 12-month bar chart show your full-year accumulation across all 12 months. Only entries marked as "Paid" (Settled) are counted in settled cashflow totals so pending estimates do not inflate your real balance.',
    formulaOrExample:
      'Monthly Net Cashflow = Settled Monthly Income − (Settled Expenses + Settled Bills + Settled Savings)',
    actionLabel: 'View Dashboard',
    actionTab: 'dashboard',
  },
  {
    id: 'faq-pending-vs-paid',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'Why is an expense or income entry I added not showing up in Dashboard charts or Sinking Funds?',
    answer:
      'New budget entries start as "Pending" (Planned) until you mark them as "Paid" (Settled). CapitalFlow separates planned projections from settled reality: Dashboard settled metrics, Category Distribution charts, and automatic Sinking Fund deposits only count entries whose status is toggled to Paid.',
    formulaOrExample:
      'Status: Pending → Counted in Planned Budget only  |  Status: Paid → Counted in Settled Actuals & Ledger',
    actionLabel: 'Go to Budget & Entries',
    actionTab: 'budget',
  },
  {
    id: 'faq-actual-vs-planned',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'How do "Planned Estimate" and "Actual Paid" amounts work when calculating budget variance?',
    answer:
      'Every budget entry has a Planned Estimate (your target budget) and an optional Actual Paid amount. When you mark an entry as Paid, if you entered an Actual Paid value (even ₱0 for a waived fee), CapitalFlow uses that exact number. If Actual Paid is left blank, it defaults to your Planned Estimate. Positive variance on outflows means you spent less than planned.',
    formulaOrExample:
      'Outflow Variance = Planned Estimate (₱5,000) − Actual Paid (₱4,650) = +₱350 Saved',
    actionLabel: 'Open Budget Spreadsheet',
    actionTab: 'budget',
  },
  {
    id: 'faq-biweekly-cutoffs',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'How do Monthly vs. Bi-Weekly (P1 & P2) cutoff modes work with Estimate Templates?',
    answer:
      'In Monthly mode, the year is organized into 12 months (Jan–Dec). In Bi-Weekly mode, each month is split into two payroll cutoffs: P1 (1st–15th) and P2 (16th–End of Month), giving 24 periods. When you configure an Estimate Item Template with schedule "Both (P1 & P2)", its monthly category budget automatically doubles (2 × template amount) and auto-populates into both P1 and P2 cutoffs.',
    formulaOrExample:
      'Template ₱2,500 × Schedule "Both (P1 & P2)" = ₱5,000 Monthly Category Budget (₱2,500 in P1 + ₱2,500 in P2)',
    actionLabel: 'Manage Budget Templates',
    actionTab: 'budget',
  },
  {
    id: 'faq-savings-auto-sync',
    category: 'funds',
    categoryLabel: 'Funds & Ledger',
    question: 'How does marking a Savings entry as "Paid" in the Budget update my Funds Ledger?',
    answer:
      'When you create a Budget entry with Type = "Savings", select a Category (which acts as the Sinking Fund name, e.g., "Emergency Fund"), and choose a Destination Account, marking that entry as "Paid" automatically creates a linked Deposit transaction in your Funds Ledger. Unmarking it back to "Pending" or deleting the entry cleanly removes the auto-generated ledger transaction.',
    actionLabel: 'Inspect Funds Ledger',
    actionTab: 'savings',
  },
  {
    id: 'faq-loan-linking',
    category: 'loans',
    categoryLabel: 'Loans & Debt',
    question: 'How do I link a Loan or Receivable to my recurring Budget templates?',
    answer:
      'In the Loans tab, click "Link to Budget" on any active loan (or link it inside the Estimate Template editor). Once linked, whenever you mark that recurring bill/loan entry as "Paid" in the Budget tab, CapitalFlow automatically logs an installment payment against the loan and reduces its remaining balance.',
    actionLabel: 'Open Loans & Receivables',
    actionTab: 'loans',
  },
  {
    id: 'faq-drive-starter-protection',
    category: 'drive',
    categoryLabel: 'Google Drive Sync',
    question: 'Why does the app prevent me from saving over Google Drive when "Starter Sample Data" is active?',
    answer:
      'When you open CapitalFlow on a brand-new browser or after clearing local cache, it loads sample demonstration data first. To protect your real cloud backups in Google Drive from being accidentally overwritten by sample data, CapitalFlow blocks automatic cloud overwrites and prompts you to click "Load My Saved Data from Drive" or "Reset Data for Go-Live" first.',
    actionLabel: 'Open Drive Storage',
    actionTab: 'drive',
  },
  {
    id: 'faq-new-year-rollover',
    category: 'drive',
    categoryLabel: 'Google Drive Sync',
    question: 'How do multi-year budgets work when moving to a new year (e.g., 2026 to 2027)?',
    answer:
      'Each year is stored in its own dedicated file (e.g., capitalflow_budget_2026.json), while your Estimate Budget Template (categories & recurring items) and your Funds & Loans Ledger carry across all years. When you add a new year from the top header or Drive tab, you can copy your personalized categories and templates into the new year with a clean slate of entries.',
    actionLabel: 'Manage Annual Files',
    actionTab: 'drive',
  },
];

export const HelpGuideView: React.FC<HelpGuideViewProps> = ({
  onNavigateTab,
  currentYear,
  frequency,
  onChangeFrequency,
  currencySymbol = '₱',
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSection, setActiveSection] = useState<GuideSectionId>('all');
  const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({
    'faq-earmarked': true,
    'faq-cashflow-summary': true,
    'faq-pending-vs-paid': true,
  });

  const toggleFaq = (id: string) => {
    setExpandedFaqs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredFaqs = useMemo(() => {
    return FAQ_ITEMS.filter((item) => {
      const matchesCategory = activeSection === 'all' || activeSection === 'faq' || item.category === activeSection;
      if (!matchesCategory) return false;
      if (!normalizedQuery) return true;
      return (
        item.question.toLowerCase().includes(normalizedQuery) ||
        item.answer.toLowerCase().includes(normalizedQuery) ||
        item.categoryLabel.toLowerCase().includes(normalizedQuery) ||
        (item.formulaOrExample && item.formulaOrExample.toLowerCase().includes(normalizedQuery))
      );
    });
  }, [activeSection, normalizedQuery]);

  const showSection = (sectionId: Exclude<GuideSectionId, 'all' | 'faq'>, keywords: string) => {
    if (activeSection !== 'all' && activeSection !== sectionId) return false;
    if (!normalizedQuery) return true;
    return keywords.toLowerCase().includes(normalizedQuery);
  };

  const sectionTabs: { id: GuideSectionId; label: string }[] = [
    { id: 'all', label: 'All Topics' },
    { id: 'quickstart', label: 'Quick Start' },
    { id: 'dashboard', label: 'Dashboard & Cashflow' },
    { id: 'budget', label: 'Budget & Cutoffs' },
    { id: 'funds', label: 'Funds & Earmarked' },
    { id: 'loans', label: 'Loans & Debt' },
    { id: 'drive', label: 'Google Drive Sync' },
    { id: 'faq', label: `FAQs (${FAQ_ITEMS.length})` },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Top Hero & Search Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>CapitalFlow User Guide &amp; Reference &middot; v{APP_VERSION}</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              How CapitalFlow Works
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Complete guide to managing your {currentYear} budget, switching between Monthly and Bi-Weekly (P1/P2)
              payroll cutoffs, understanding Earmarked Sinking Funds, tracking Loans, and syncing safely with Google Drive.
            </p>
          </div>

          {/* Interactive Search Input */}
          <div className="w-full lg:w-80 shrink-0">
            <label htmlFor="guide-search" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Search topics, formulas &amp; FAQs
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="guide-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. earmarked, cashflow, P1/P2, paid..."
                className="w-full pl-9 pr-9 py-2.5 text-sm bg-slate-50 dark:bg-slate-800/90 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Section Filter Bar */}
        <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-1.5 overflow-x-auto pb-1">
          {sectionTabs.map((tab) => {
            const isActive = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* 1. QUICK START WORKFLOW */}
      {showSection(
        'quickstart',
        'quick start workflow setup getting started templates categories entries paid pending funds loans google drive sync'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Step-by-Step Workflow
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                4 Steps to Run Your Personal Finance System
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Active Year: {currentYear} &middot; Mode: {frequency === 'monthly' ? 'Monthly (12 Periods)' : 'Bi-Weekly (24 Cutoffs)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Step 1 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">STEP 01</span>
                  <span>Estimate Template</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Configure Categories &amp; Recurring Items
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Define your standard income sources, monthly bills, savings goals, and cutoff schedules (P1, P2, or Both).
                  Your category budgets automatically calculate from these templates.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('budget')}
                className="mt-4 w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Open Budget &amp; Templates</span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </button>
            </div>

            {/* Step 2 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">STEP 02</span>
                  <span>Log &amp; Settle</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Populate Cutoffs &amp; Mark Entries Paid
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Auto-populate a month or cutoff from your template, enter the Actual Paid amount when settled, and toggle
                  status from <span className="font-semibold text-amber-600 dark:text-amber-400">Pending</span> to{' '}
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">Paid</span>.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('budget')}
                className="mt-4 w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Go to Budget &amp; Entries</span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </button>
            </div>

            {/* Step 3 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">STEP 03</span>
                  <span>Funds &amp; Loans</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Track Bank Accounts, Earmarks &amp; Debt
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Paid Savings entries automatically deposit into your linked bank account and earmark funds for that
                  goal. Paid Loan entries automatically reduce your remaining loan balance.
                </p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onNavigateTab('savings')}
                  className="py-2 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Open Funds</span>
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateTab('loans')}
                  className="py-2 px-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Open Loans</span>
                </button>
              </div>
            </div>

            {/* Step 4 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-semibold text-slate-500 dark:text-slate-400">
                  <span className="font-mono text-indigo-600 dark:text-indigo-400 font-bold">STEP 04</span>
                  <span>Cloud Backup</span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                  Sync Safely to Google Drive
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Sign in with Google to save your annual budget, recurring template, and master ledger directly into your
                  personal <span className="font-mono text-[11px]">/{CAPITALFLOW_DRIVE_FOLDER_NAME}/</span> folder.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('drive')}
                className="mt-4 w-full py-2 px-3 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Open Drive Storage</span>
                <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* 2. DASHBOARD & CASHFLOW SUMMARY EXPLAINED */}
      {showSection(
        'dashboard',
        'dashboard cashflow summary monthly annual accumulation income outflows expenses bills savings net cashflow savings rate settled paid pending'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <LayoutDashboard className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Dashboard &amp; Cashflow Summary Explained
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  How Monthly Cashflow vs. Annual Settled Totals are calculated
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('dashboard')}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Monthly Snapshot vs. Full-Year Accumulation
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                The Dashboard separates your <strong>Single-Month Cashflow</strong> from your <strong>Full-Year Accumulation</strong> so you always know both how the current month is performing and where your year stands:
              </p>
              <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <div className="p-3.5 bg-slate-50/60 dark:bg-slate-800/30">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                    <span>1. Cashflow Summary (Monthly)</span>
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">Selected Month Only</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Shows settled Income, Living Expenses, Bills &amp; Subscriptions, Savings &amp; Investments, and Net Remaining Cashflow for the <strong>single month selected in the month dropdown</strong> (e.g., March {currentYear}). In Bi-Weekly mode, it combines both P1 and P2 of that month.
                  </p>
                </div>
                <div className="p-3.5 bg-slate-50/60 dark:bg-slate-800/30">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-900 dark:text-white">
                    <span>2. Annual Settled Summary &amp; 12-Month Chart</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">Jan–Dec Accumulation</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed">
                    Aggregates all settled (<span className="font-semibold">Paid</span>) entries across the entire {currentYear} calendar year (all 12 months / 24 cutoffs) so you can track total annual income, annual savings rate, and month-over-month trends.
                  </p>
                </div>
              </div>
            </div>

            {/* Formula Reference Table */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Calculator className="w-4 h-4 text-indigo-500" />
                  <span>Core Cashflow Formulas</span>
                </h4>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  Only Status = Paid
                </span>
              </div>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 px-3.5">Metric</th>
                      <th className="py-2.5 px-3.5">Calculation Formula</th>
                      <th className="py-2.5 px-3.5 text-right">Example</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    <tr>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800 dark:text-slate-200">Effective Amount</td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                        <code className="font-mono text-[11px]">Actual Paid ?? Planned Estimate</code>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {currencySymbol}45,000
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800 dark:text-slate-200">Total Outflows</td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                        <code className="font-mono text-[11px]">Expenses + Bills + Savings</code>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-slate-800 dark:text-slate-200">
                        {currencySymbol}38,500
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800 dark:text-slate-200">Net Cashflow</td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                        <code className="font-mono text-[11px]">Settled Income − Total Outflows</code>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                        +{currencySymbol}6,500
                      </td>
                    </tr>
                    <tr>
                      <td className="py-2.5 px-3.5 font-semibold text-slate-800 dark:text-slate-200">Savings Rate</td>
                      <td className="py-2.5 px-3.5 text-slate-600 dark:text-slate-400">
                        <code className="font-mono text-[11px]">(Settled Savings ÷ Income) × 100</code>
                      </td>
                      <td className="py-2.5 px-3.5 text-right font-mono tabular-nums text-indigo-600 dark:text-indigo-400 font-semibold">
                        20.0%
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <strong>Tip:</strong> If an entry was waived or cost nothing when settled, enter <code className="font-mono">0</code> in <strong>Actual Paid</strong> and mark it <strong>Paid</strong>—CapitalFlow treats <code className="font-mono">0</code> as a valid settled zero rather than falling back to the Planned Estimate.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 3. BUDGET, TEMPLATES & BI-WEEKLY CUTOFFS */}
      {showSection(
        'budget',
        'budget entries spreadsheet monthly bi-weekly biweekly p1 p2 both cutoffs payroll planned estimate actual paid variance templates auto populate categories'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Budget Spreadsheet, Cutoffs (P1/P2) &amp; Estimate Templates
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Managing Planned vs. Actual amounts across Monthly (12) or Bi-Weekly (24) periods
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onChangeFrequency(frequency === 'monthly' ? 'bi-weekly' : 'monthly')}
                className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200/80 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                <span>Switch to {frequency === 'monthly' ? 'Bi-Weekly' : 'Monthly'} View</span>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab('budget')}
                className="px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <span>Open Budget</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Card 1: Pending vs Paid */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Pending vs. Paid Status</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Every entry starts as <strong>Pending</strong> so you can plan your entire month or year ahead of time. Once money actually leaves or enters your account, click the status button to mark it <strong>Paid</strong>.
              </p>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-1">
                <div className="flex items-center justify-between">
                  <span>Pending:</span>
                  <span>Forecast / Planned Table</span>
                </div>
                <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                  <span>Paid:</span>
                  <span>Dashboard + Funds + Loans</span>
                </div>
              </div>
            </div>

            {/* Card 2: Bi-Weekly Cutoffs (P1 & P2) */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Clock className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Bi-Weekly Payroll Cutoffs (P1 &amp; P2)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                If you receive salary twice a month, switch to <strong>Bi-Weekly</strong> mode in the header. Each month is divided into two cutoffs so you can match bills to the exact paycheck that covers them:
              </p>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300 space-y-1 tabular-nums">
                <div className="flex items-center justify-between">
                  <span>Cutoff P1:</span>
                  <span>1st – 15th of the Month</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Cutoff P2:</span>
                  <span>16th – End of the Month</span>
                </div>
                <div className="flex items-center justify-between text-indigo-600 dark:text-indigo-400 font-semibold">
                  <span>Both (P1 &amp; P2):</span>
                  <span>2× Per Month (e.g., Groceries)</span>
                </div>
              </div>
            </div>

            {/* Card 3: Estimate Templates */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                <span>Recurring Estimate Templates</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Instead of typing the same items every month, add them to your <strong>Estimate Budget Template</strong>. Category monthly budgets are automatically derived from the sum of templates in each category.
              </p>
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] font-mono text-slate-500 dark:text-slate-400 space-y-1 tabular-nums">
                <div className="flex items-center justify-between">
                  <span>Schedule P1 or P2:</span>
                  <span>1 × Template Amount / mo</span>
                </div>
                <div className="flex items-center justify-between text-amber-600 dark:text-amber-400 font-semibold">
                  <span>Schedule Both:</span>
                  <span>2 × Template Amount / mo</span>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. FUNDS, ACCOUNTS & "EARMARKED" EXPLAINED */}
      {showSection(
        'funds',
        'funds savings accounts earmarked allocated unallocated available balance sinking funds goals emergency fund ledger deposit withdrawal transfer'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-100 dark:border-amber-900 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
                <PiggyBank className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Funds, Bank Accounts &amp; What &ldquo;Earmarked&rdquo; Means
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  How physical Bank/Wallet Accounts connect to purpose-driven Sinking Funds
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('savings')}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Open Funds &amp; Ledger</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-7 space-y-4">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Where Your Money Lives vs. What Your Money Is For
              </h4>
              <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                A common challenge in personal finance is having one or two high-interest savings accounts that hold money for multiple goals at once. CapitalFlow solves this by tracking two dimensions simultaneously:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    1. Total Account Balance
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-1">
                    {currencySymbol}150,000
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    The total cash sitting across your physical bank accounts, digital banks, or e-wallets.
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                    2. Earmarked in Funds
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400 mt-1">
                    {currencySymbol}95,000
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    Money inside your accounts that is already <strong>reserved for specific Sinking Funds</strong> (e.g., Emergency Fund, Tuition, Travel).
                  </p>
                </div>

                <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-3.5 bg-slate-50/50 dark:bg-slate-800/30">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                    3. Available / Unallocated
                  </div>
                  <div className="text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                    {currencySymbol}55,000
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5 leading-relaxed">
                    <code className="font-mono text-[11px]">Total − Earmarked</code>. Free cash in your accounts not yet assigned to any specific fund.
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/60 dark:bg-slate-800/30 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Automatic Budget-to-Fund Sync
              </h4>
              <ol className="space-y-2.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed list-decimal list-inside">
                <li>
                  In <strong>Budget &amp; Entries</strong>, add an entry with Type = <strong>Savings</strong> and select a Category (e.g., <em>Emergency Fund</em>) and a Destination Bank Account.
                </li>
                <li>
                  When you mark that entry as <strong>Paid</strong>, CapitalFlow automatically logs a deposit into that Bank Account and increases the <strong>Earmarked</strong> balance of your <em>Emergency Fund</em>.
                </li>
                <li>
                  You can also record direct deposits, withdrawals, interest earned, or account-to-account transfers directly inside the <strong>Funds</strong> tab.
                </li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* 5. LOANS PAYABLE & RECEIVABLES */}
      {showSection(
        'loans',
        'loans debt receivables i owe owed to me installments principal contract amount payment history link to budget'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-100 dark:border-rose-900 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0">
                <HandCoins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Loans Payable (I Owe) &amp; Receivables (Owed to Me)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Amortization tracking, installment counters, and automatic budget payment syncing
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('loans')}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Open Loans View</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Loans Payable (I Owe)</span>
                <span className="text-xs font-mono text-rose-600 dark:text-rose-400 font-semibold">Liabilities &amp; Installments</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Track mortgages, auto loans, credit card installments, or personal loans. Specify the <strong>Principal</strong>, <strong>Total Contract Amount</strong> (principal + interest), and total installment count. Link a loan to a recurring Budget Template so marking your monthly bill as <strong>Paid</strong> automatically records the loan payment.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-900 dark:text-white">Receivables (Owed to Me)</span>
                <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Money Lent / Reimbursements</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Track money lent to friends, family, or business advances. Log repayments as they arrive (or link them to an Income template in your budget) to see exact remaining balances and repayment progress percentages.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 6. GOOGLE DRIVE STORAGE & CONFLICT PROTECTION */}
      {showSection(
        'drive',
        'google drive storage cloud sync backup json csv conflict protection starter sample data go live reset multi-year'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-100 dark:border-sky-900 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  Google Drive Cloud Sync &amp; Data Protection
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Private client-side storage in your own Google Drive folder: <span className="font-mono">/{CAPITALFLOW_DRIVE_FOLDER_NAME}/</span>
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('drive')}
              className="self-start sm:self-auto px-3.5 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <span>Open Drive Storage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {getBudgetFileName(currentYear)}
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Annual Budget File (Per Year)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Stores all monthly and bi-weekly entries, planned estimates, actual paid amounts, and settlement statuses for {currentYear}. Each year has its own isolated JSON file.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {BUDGET_TEMPLATE_FILE_NAME}
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Estimate Budget Template (Shared)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Stores your personalized Categories and Recurring Item Templates (P1, P2, Both) so you can reuse them across months and roll them forward into future years.
              </p>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                {SAVINGS_LEDGER_FILE_NAME}
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Master Funds &amp; Loans Ledger (Shared)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Stores your continuous Bank Accounts, Sinking Fund earmarks, Ledger transaction history, and Loan records across all years so balances never reset on Jan 1.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Starter Data Overwrite Protection
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  If your browser is currently holding default starter sample data, CapitalFlow blocks automatic uploads to Google Drive so you never overwrite your real cloud backups on a new device.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Timestamp Conflict Detection
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Before syncing, CapitalFlow compares local and Google Drive modification timestamps. If Drive has newer edits from another device, a conflict modal lets you choose whether to Pull from Drive or Push Local.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 7. INTERACTIVE FAQ ACCORDION */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Frequently Asked Questions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Answers to common questions about calculations, earmarked funds, and cloud syncing
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const allOpen: Record<string, boolean> = {};
                filteredFaqs.forEach((f) => {
                  allOpen[f.id] = true;
                });
                setExpandedFaqs(allOpen);
              }}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Expand All
            </button>
            <span className="text-slate-300 dark:text-slate-700">&middot;</span>
            <button
              type="button"
              onClick={() => setExpandedFaqs({})}
              className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Collapse All
            </button>
          </div>
        </div>

        {filteredFaqs.length === 0 ? (
          <div className="py-12 text-center space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No guide topics or FAQs matched &ldquo;{searchQuery}&rdquo;
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Try searching for terms like <span className="font-mono">earmarked</span>, <span className="font-mono">cashflow</span>, <span className="font-mono">P1</span>, <span className="font-mono">paid</span>, or <span className="font-mono">drive</span>.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveSection('all');
              }}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors cursor-pointer"
            >
              Reset Search &amp; Filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {filteredFaqs.map((faq) => {
              const isExpanded = Boolean(expandedFaqs[faq.id]) || normalizedQuery.length > 0;
              return (
                <div key={faq.id} className="bg-white dark:bg-slate-900">
                  <button
                    type="button"
                    onClick={() => toggleFaq(faq.id)}
                    className="w-full text-left px-4 sm:px-5 py-4 flex items-start justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        {faq.categoryLabel}
                      </div>
                      <div className="text-sm font-bold text-slate-900 dark:text-white">
                        {faq.question}
                      </div>
                    </div>
                    <span className="mt-1 text-slate-400 shrink-0">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="px-4 sm:px-5 pb-4 pt-1 space-y-3 bg-slate-50/40 dark:bg-slate-800/20">
                      <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                        {faq.answer}
                      </p>
                      {faq.formulaOrExample && (
                        <div className="p-3 rounded-lg bg-slate-100/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 font-mono text-xs text-slate-800 dark:text-slate-200 tabular-nums">
                          {faq.formulaOrExample}
                        </div>
                      )}
                      {faq.actionTab && faq.actionLabel && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => onNavigateTab(faq.actionTab!)}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 cursor-pointer"
                          >
                            <span>{faq.actionLabel}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
