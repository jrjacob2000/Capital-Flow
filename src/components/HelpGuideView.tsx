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
  Sparkles,
  Smartphone,
  Split,
  Upload,
  Compass,
  Cloud,
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
  isStarterSampleActive?: boolean;
  onStartBlankWorkspace?: () => void;
  onSignInWithGoogle?: () => void;
  isSignedIn?: boolean;
}

type GuideSectionId =
  | 'all'
  | 'quickstart'
  | 'glossary'
  | 'cards'
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
    id: 'faq-new-user-blank',
    category: 'quickstart',
    categoryLabel: 'New User Setup',
    question: 'I am a brand-new user. How do I remove the sample numbers and start from zero?',
    answer:
      'When you first open CapitalFlow, it shows sample demo numbers so you can see how the charts and tables look. Whenever you are ready to enter your own real finances, simply click the green "Start My Blank Budget" button on the top banner (or right here in the Quick Start section). That immediately clears all demo entries, categories, accounts, and loans so you start with a clean ₱0 slate.',
    formulaOrExample:
      'Click "Start My Blank Budget" → Sample data wiped → Ready for your own categories or Excel import',
    actionLabel: 'Go to Budget Tab',
    actionTab: 'budget',
  },
  {
    id: 'faq-excel-import',
    category: 'budget',
    categoryLabel: 'Excel & CSV Import',
    question: 'Can I import my own Excel or CSV spreadsheet even if it uses different column names?',
    answer:
      'Yes! The Universal Excel & CSV Importer works with any spreadsheet format—whether it is a simple 3-column table (Item, Category, Amount), a downloaded bank/e-wallet statement, or a multi-section budget sheet. If your column headers use custom names, the interactive Column Mapper lets you pick which column represents Item Name, Planned Estimate, Actual Paid, Category, Type, and Status. You can also choose whether to import into Monthly (Jan–Dec) or Bi-Weekly (Jan-P1 to Dec-P2) periods.',
    formulaOrExample:
      'Supported files: .xlsx, .xls, .csv  |  Target periods: Monthly (12) or Bi-Weekly Cutoffs (24)',
    actionLabel: 'Open Budget & Click Import Excel',
    actionTab: 'budget',
  },
  {
    id: 'faq-pending-vs-paid',
    category: 'glossary',
    categoryLabel: 'Core Rules',
    question: 'Why is an expense or income entry I added not showing up in Dashboard charts or Sinking Funds?',
    answer:
      'New budget entries start as "Pending" (Planned) until you mark them as "Paid" (Settled). CapitalFlow separates your planned budget from settled reality: Dashboard settled totals, Category Distribution charts, Loan installment deductions, and automatic Sinking Fund deposits only count entries whose status is toggled to "Paid".',
    formulaOrExample:
      'Status: Pending → Counted in Planned Budget only  |  Status: Paid → Counted in Settled Actuals & Ledger',
    actionLabel: 'Go to Budget & Entries',
    actionTab: 'budget',
  },
  {
    id: 'faq-actual-vs-planned',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'What is the difference between "Planned Estimate" and "Actual Paid"?',
    answer:
      'Think of "Planned Estimate" as your target budget before the bill arrives, and "Actual Paid" as the real receipt amount when you pay it. When you mark an entry as Paid, CapitalFlow uses your Actual Paid number (even if you type 0 for a waived bill). If you leave Actual Paid blank, it automatically uses your Planned Estimate. The difference between the two shows whether you saved money or overspent.',
    formulaOrExample:
      'Outflow Variance = Planned Estimate (₱5,000) − Actual Paid (₱4,650) = +₱350 Saved',
    actionLabel: 'Open Budget Spreadsheet',
    actionTab: 'budget',
  },
  {
    id: 'faq-split-payment',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'How do I split a single bill or expense across two payment methods (e.g., Cash + GCash)?',
    answer:
      'When adding or editing an entry in the Budget tab, click the "Split" toggle next to Payment Method. You can then type exact amounts across Cash, Credit Card, GCash Transfer, Kath Account, Checking Account, or Bank Transfer. CapitalFlow automatically sums those split parts into your Actual Paid total and updates the "To Be Withdrawn" breakdown so you know exactly how much money is needed in each account.',
    formulaOrExample:
      'Split Example: ₱1,500 Cash + ₱2,000 GCash Transfer = ₱3,500 Total Actual Paid',
    actionLabel: 'Go to Budget & Entries',
    actionTab: 'budget',
  },
  {
    id: 'faq-biweekly-cutoffs',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'How do Monthly vs. Bi-Weekly (P1 & P2) cutoff modes work?',
    answer:
      'In Monthly mode, your year has 12 periods (Jan–Dec). In Bi-Weekly mode—ideal if you get paid twice a month—each month is split into two payroll cutoffs: P1 (1st–15th) and P2 (16th–End of Month), giving 24 periods. When setting up Recurring Estimate Templates, setting an item schedule to "Both (P1 & P2)" automatically budgets it for both paydays (2 × template amount per month).',
    formulaOrExample:
      'Template ₱2,500 × Schedule "Both (P1 & P2)" = ₱5,000 Monthly Category Budget (₱2,500 in P1 + ₱2,500 in P2)',
    actionLabel: 'Manage Budget Templates',
    actionTab: 'budget',
  },
  {
    id: 'faq-earmarked',
    category: 'funds',
    categoryLabel: 'Funds & Ledger',
    question: 'What does "Earmarked in Funds" mean on my Savings & Accounts view?',
    answer:
      'Earmarked represents the portion of your real bank or e-wallet balance that is already reserved (set aside) for specific Sinking Funds or savings goals (such as Emergency Fund, Travel Fund, or Tuition). Your "Unallocated / Available Balance" is your Total Bank Balance minus Earmarked Funds—showing how much cash is genuinely free without touching your dedicated goals.',
    formulaOrExample:
      'Total Account Balance (₱150,000) − Earmarked in Funds (₱95,000) = Unallocated Cash (₱55,000)',
    actionLabel: 'Open Funds & Accounts',
    actionTab: 'savings',
  },
  {
    id: 'faq-savings-auto-sync',
    category: 'funds',
    categoryLabel: 'Funds & Ledger',
    question: 'How does marking a Savings entry as "Paid" in the Budget update my Funds Ledger?',
    answer:
      'When you create a Budget entry with Type = "Savings", select a Category (which acts as your Sinking Fund goal, e.g., "Emergency Fund"), and pick a Destination Bank Account, marking that entry as "Paid" automatically creates a linked deposit in your Funds Ledger. If you switch the entry back to "Pending" or delete it, CapitalFlow automatically removes that linked deposit so your balances never double-count.',
    actionLabel: 'Inspect Funds Ledger',
    actionTab: 'savings',
  },
  {
    id: 'faq-cashflow-summary',
    category: 'dashboard',
    categoryLabel: 'Dashboard & Cashflow',
    question: 'How does the "Cashflow Summary (Monthly)" on the Dashboard differ from the Annual totals?',
    answer:
      'The Cashflow Summary (Monthly) lets you inspect a single month (e.g., January or March) using the month dropdown, whereas the Annual Settled summary cards and 12-month bar chart combine all 12 months of the year. Only entries marked "Paid" are included in settled cashflow totals so unpaid estimates do not distort your real cash position.',
    formulaOrExample:
      'Monthly Net Cashflow = Settled Monthly Income − (Settled Expenses + Settled Bills + Settled Savings)',
    actionLabel: 'View Dashboard',
    actionTab: 'dashboard',
  },
  {
    id: 'faq-loan-linking',
    category: 'loans',
    categoryLabel: 'Loans & Debt',
    question: 'How do I link a Loan or Receivable so my monthly budget payments update the loan balance automatically?',
    answer:
      'In the Loans tab, add your loan (e.g., Car Loan or Credit Card Installment) and click "Link to Budget" (or select the loan inside your Recurring Estimate Template). Once linked, every time you mark that monthly bill as "Paid" in the Budget tab, CapitalFlow automatically records an installment payment on the loan and reduces its remaining balance.',
    actionLabel: 'Open Loans & Receivables',
    actionTab: 'loans',
  },
  {
    id: 'faq-messenger-browser',
    category: 'drive',
    categoryLabel: 'Google Drive Sync',
    question: 'Why do I see "Unable to process request due to missing initial state" when signing in from Messenger or Instagram?',
    answer:
      'Apps like Facebook Messenger, Instagram, Telegram, and TikTok open links inside a restricted built-in viewer (WebView) that blocks Google security popups and session storage. You can still use CapitalFlow locally inside Messenger, or tap the three dots (•••) in the top-right corner and choose "Open in External Browser" (Safari or Chrome) to sign in with Google Drive.',
    formulaOrExample:
      'In Messenger / Instagram: Tap ••• (top right) → Select "Open in External Browser" (Safari / Chrome)',
    actionLabel: 'Open Drive Storage',
    actionTab: 'drive',
  },
  {
    id: 'faq-drive-starter-protection',
    category: 'drive',
    categoryLabel: 'Google Drive Sync',
    question: 'Why does the app prevent saving over Google Drive when "Starter Sample Data" is active?',
    answer:
      'When you open CapitalFlow on a new phone or laptop, it shows sample demo data first. To protect your real cloud backups in Google Drive from being accidentally overwritten by demo data, CapitalFlow blocks cloud uploads until you either click "Load My Saved Data from Drive" or click "Start My Blank Budget".',
    actionLabel: 'Open Drive Storage',
    actionTab: 'drive',
  },
  {
    id: 'faq-new-year-rollover',
    category: 'drive',
    categoryLabel: 'Google Drive Sync',
    question: 'How do multi-year budgets work when moving to a new year (e.g., 2026 to 2027)?',
    answer:
      'Each year is saved in its own annual file (e.g., capitalflow_budget_2026.json), while your Estimate Budget Template (categories & recurring items) and your Funds & Loans Ledger carry across all years continuously. When you add a new year from the header or Drive tab, you can carry over your custom categories and recurring templates with one click.',
    actionLabel: 'Manage Annual Files',
    actionTab: 'drive',
  },
  {
    id: 'faq-delete-period-item',
    category: 'budget',
    categoryLabel: 'Budget & Cutoffs',
    question: 'What happens when I click the Delete (Trash) button on an item in the Budget sheet?',
    answer:
      'Deleting an item on the Budget sheet removes the entire item—both any recorded entry and its virtual template estimate row—for that specific period only (e.g., Oct or May-P1). If the deleted entry had a linked Sinking Fund deposit or Loan payment, that transaction is rolled back automatically. All other periods and your master Recurring Estimate Template remain untouched. If you change your mind, click the "Restore Deleted (X)" button in the filter bar to bring it back for that period.',
    formulaOrExample:
      'Delete on Budget Row → Removed for Selected Period Only  |  Click "Restore Deleted (X)" → Restored',
    actionLabel: 'Open Budget Sheet',
    actionTab: 'budget',
  },
  {
    id: 'faq-remaining-vs-projected',
    category: 'cards',
    categoryLabel: 'Card Explanations',
    question: 'On the "Remaining to Salary" card, what is the difference between the main number and "Projected net"?',
    answer:
      'The main number on the "Remaining to Salary" card shows your current settled cash position (Settled Income minus Settled Outflows so far in the period). "Projected net" looks ahead to the end of the period by combining already-settled actuals with the Planned Estimates of any items still marked Pending—showing how much money will be left once every remaining bill in the period is paid.',
    formulaOrExample:
      'Main Value = Settled Income − Settled Outflows  |  Projected Net = (Settled + Pending Income) − (Settled + Pending Outflows)',
    actionLabel: 'View Budget Summary Cards',
    actionTab: 'budget',
  },
];

export const HelpGuideView: React.FC<HelpGuideViewProps> = ({
  onNavigateTab,
  currentYear,
  frequency,
  onChangeFrequency,
  currencySymbol = '₱',
  isStarterSampleActive = false,
  onStartBlankWorkspace,
  onSignInWithGoogle,
  isSignedIn = false,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeSection, setActiveSection] = useState<GuideSectionId>('all');
  const [cardGuideScreen, setCardGuideScreen] = useState<'all' | 'dashboard' | 'budget' | 'funds' | 'loans'>('all');
  const [expandedFaqs, setExpandedFaqs] = useState<Record<string, boolean>>({
    'faq-new-user-blank': true,
    'faq-excel-import': true,
    'faq-pending-vs-paid': true,
    'faq-remaining-vs-projected': true,
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
    { id: 'quickstart', label: 'New User Start' },
    { id: 'glossary', label: '5 Golden Rules' },
    { id: 'cards', label: 'Card-by-Card Guide' },
    { id: 'budget', label: 'Budget, Excel & Split' },
    { id: 'dashboard', label: 'Dashboard & Cashflow' },
    { id: 'funds', label: 'Funds & Earmarked' },
    { id: 'loans', label: 'Loans & Debt' },
    { id: 'drive', label: 'Cloud Sync & Mobile' },
    { id: 'faq', label: `FAQs (${FAQ_ITEMS.length})` },
  ];

  return (
    <div className="space-y-8 pb-10">
      {/* Top Hero & Search Header */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
              <BookOpen className="w-4 h-4 shrink-0" />
              <span>CapitalFlow User Guide</span>
              <span aria-hidden="true">&middot;</span>
              <span className="font-mono tabular-nums">v{APP_VERSION}</span>
              <span aria-hidden="true">&middot;</span>
              <span>Beginner Friendly</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
              Welcome to CapitalFlow — How Everything Works
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              New here? Start with the <strong>3 Starting Paths</strong> and the <strong>5 Golden Rules</strong> below.
              In under two minutes, you will know how to start a clean {currentYear} budget, import any Excel or CSV sheet,
              track Monthly or Bi-Weekly (15th/30th) paydays, and sync safely with Google Drive.
            </p>
          </div>

          {/* Interactive Search Input */}
          <div className="w-full lg:w-80 shrink-0">
            <label htmlFor="guide-search" className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
              Search any feature, rule, or question
            </label>
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="guide-search"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. blank budget, excel, split, messenger..."
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

      {/* 1. NEW USER QUICK START: CHOOSE HOW YOU WANT TO BEGIN */}
      {showSection(
        'quickstart',
        'new user quick start blank budget wipe sample data import excel csv restore google drive step by step workflow getting started'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                01. First Time Here?
              </p>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white mt-0.5">
                Choose How You Want to Start (3 Easy Options)
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              Active Year: {currentYear} &middot; Mode: {frequency === 'monthly' ? 'Monthly (12 Periods)' : 'Bi-Weekly (24 Cutoffs)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Option A: Blank Slate */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">OPTION A &middot; FRESH SLATE</span>
                  <span>Most Popular</span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Start with a Clean {currencySymbol}0 Budget
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  By default, CapitalFlow displays sample numbers so you can explore the charts. Ready to enter your own finances? Click below to wipe all sample data and start from zero.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-200/70 dark:border-slate-700/60">
                {onStartBlankWorkspace && isStarterSampleActive ? (
                  <button
                    type="button"
                    onClick={onStartBlankWorkspace}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="w-4 h-4 shrink-0" />
                    <span>Start My Blank Budget Now</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('budget')}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-emerald-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Open My Budget Workspace</span>
                    <ArrowRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  </button>
                )}
              </div>
            </div>

            {/* Option B: Import Excel or CSV */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">OPTION B &middot; SPREADSHEET</span>
                  <span>.xlsx / .xls / .csv</span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Import Your Existing Excel or CSV
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Already tracking expenses in Excel, Google Sheets, or a bank CSV export? Open the <strong>Budget</strong> tab and click <strong>Import Excel</strong>. Our Universal Importer maps your columns automatically.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-200/70 dark:border-slate-700/60">
                <button
                  type="button"
                  onClick={() => onNavigateTab('budget')}
                  className="w-full py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <span>Go to Budget &rarr; Import Excel</span>
                  <Upload className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                </button>
              </div>
            </div>

            {/* Option C: Restore from Google Drive */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-5 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-800/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-mono font-bold text-sky-600 dark:text-sky-400">OPTION C &middot; CLOUD BACKUP</span>
                  <span>Multi-Device</span>
                </div>
                <h4 className="text-base font-bold text-slate-900 dark:text-white">
                  Sign In to Restore from Google Drive
                </h4>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Returning user or switching devices? Sign in with Google (using Safari or Chrome) to pull your saved annual budgets, recurring templates, and savings ledger from your personal Drive folder.
                </p>
              </div>
              <div className="mt-5 pt-3 border-t border-slate-200/70 dark:border-slate-700/60">
                {!isSignedIn && onSignInWithGoogle ? (
                  <button
                    type="button"
                    onClick={onSignInWithGoogle}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Cloud className="w-4 h-4 shrink-0" />
                    <span>Sign In with Google Drive</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onNavigateTab('drive')}
                    className="w-full py-2.5 px-3.5 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <span>Open Drive Cloud Storage</span>
                    <ArrowRight className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 4-Step Routine Strip */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-3">
              Your Monthly / Payday Routine in 4 Simple Steps:
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">01. Set Up Templates</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Add your categories and recurring bills once inside <strong>Budget &rarr; Manage Categories &amp; Items</strong>.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">02. Auto-Fill Period</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  At the start of a month or cutoff (P1/P2), click <strong>Populate from Template</strong> or <strong>Carry Over</strong>.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">03. Mark Paid as You Go</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  When a bill is paid or salary arrives, enter the <strong>Actual Paid</strong> cost and switch status to <strong>Paid</strong>.
                </p>
              </div>
              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                <div className="font-mono font-bold text-indigo-600 dark:text-indigo-400">04. Review &amp; Sync</div>
                <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                  Check your <strong>Dashboard</strong> cashflow, verify your <strong>Funds</strong> &amp; <strong>Loans</strong>, and click <strong>Sync Drive</strong>.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 2. THE 5 GOLDEN RULES (PLAIN-ENGLISH GLOSSARY FOR NEW USERS) */}
      {showSection(
        'glossary',
        'golden rules glossary plain english concepts pending vs paid planned estimate actual cost monthly biweekly p1 p2 split payment to be withdrawn earmarked funds'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Compass className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  02. The 5 Golden Rules of CapitalFlow (Plain-English Glossary)
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Understand these 5 core concepts and every number in the app will make instant sense
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Rule 1 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                RULE 01 &middot; STATUS
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Pending (Planned) vs. Paid (Settled)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                New entries start as <strong>Pending</strong> so you can plan future bills without messing up your current cash balance. Only entries marked <strong>Paid</strong> count toward Dashboard charts, Sinking Fund deposits, and Loan deductions.
              </p>
            </div>

            {/* Rule 2 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                RULE 02 &middot; AMOUNTS
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Planned Estimate vs. Actual Paid
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                <strong>Planned Estimate</strong> is what you expect a bill to cost (e.g., {currencySymbol}4,000 electricity). <strong>Actual Paid</strong> is what the receipt actually charged (e.g., {currencySymbol}3,750). If a fee was waived, type <code className="font-mono">0</code> in Actual Paid!
              </p>
            </div>

            {/* Rule 3 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                RULE 03 &middot; PAYDAYS
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Monthly (12) vs. Bi-Weekly P1/P2 (24)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Budget once a month (<code className="font-mono">Jan–Dec</code>) or switch to <strong>Bi-Weekly</strong> in the top bar to split every month into two paydays: <strong>P1</strong> (1st–15th) and <strong>P2</strong> (16th–End of Month).
              </p>
            </div>

            {/* Rule 4 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                RULE 04 &middot; PAYMENT CHANNELS
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                &ldquo;To Be Withdrawn&rdquo; &amp; Split Payments
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Assign each expense a channel (<em>Cash, Credit Card, GCash, Kath Account, Check, Bank Transfer</em>) or toggle <strong>Split</strong> to divide one bill across multiple accounts. The summary shows how much cash to prepare per channel.
              </p>
            </div>

            {/* Rule 5 */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-2 md:col-span-2 lg:col-span-2">
              <div className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                RULE 05 &middot; SAVINGS &amp; SINKING FUNDS
              </div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                Bank Account Balance (Where It Lives) vs. Earmarked Funds (What It Is For)
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Your physical bank account might hold {currencySymbol}150,000 total, but {currencySymbol}95,000 of that is <strong>Earmarked</strong> (reserved) for specific goals like your <em>Emergency Fund</em> or <em>Travel Fund</em>. CapitalFlow subtracts Earmarked funds from your Total Balance so you always see your true <strong>Available / Unallocated Cash</strong> ({currencySymbol}55,000).
              </p>
            </div>
          </div>
        </section>
      )}

      {/* 2B. COMPLETE CARD-BY-CARD GUIDE (EVERY CARD ACROSS ALL SCREENS EXPLAINED) */}
      {(activeSection === 'all' ||
        activeSection === 'cards' ||
        activeSection === 'dashboard' ||
        activeSection === 'budget' ||
        activeSection === 'funds' ||
        activeSection === 'loans') &&
        (!normalizedQuery ||
          'card by card explanation meaning formula dashboard total savings true net worth assigned to goal funds unassigned cash emergency runway remaining debt receivables full year cashflow year to date income paid expenses moved to savings remaining cash top funds accounts active loans analytics chart budget income outflow remaining to salary projected net payment channel subtotals restore deleted sinking fund general reserves compound growth projector borrowed i owe lent owed to me paid and collected net loan position'.includes(
            normalizedQuery
          )) && (
          <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                    Card-by-Card Visual Guide (What Every Card Means &amp; How It Is Calculated)
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Plain-English explanation and exact formula for every summary card across Dashboard, Budget, Funds, and Loans
                  </p>
                </div>
              </div>

              {/* Screen Filter Pills inside the Card Guide */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    { id: 'all', label: 'All Screens (25 Cards)' },
                    { id: 'dashboard', label: 'Dashboard Cards' },
                    { id: 'budget', label: 'Budget Cards' },
                    { id: 'funds', label: 'Funds Cards' },
                    { id: 'loans', label: 'Loans Cards' },
                  ] as const
                ).map((pill) => {
                  const isSelected =
                    activeSection === 'dashboard' ||
                    activeSection === 'budget' ||
                    activeSection === 'funds' ||
                    activeSection === 'loans'
                      ? activeSection === pill.id
                      : cardGuideScreen === pill.id;
                  return (
                    <button
                      key={pill.id}
                      type="button"
                      onClick={() => {
                        if (
                          activeSection === 'dashboard' ||
                          activeSection === 'budget' ||
                          activeSection === 'funds' ||
                          activeSection === 'loans'
                        ) {
                          setActiveSection('cards');
                        }
                        setCardGuideScreen(pill.id);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700/70'
                      }`}
                    >
                      {pill.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* A. DASHBOARD CARDS */}
            {((activeSection === 'all' || activeSection === 'cards')
              ? cardGuideScreen === 'all' || cardGuideScreen === 'dashboard'
              : activeSection === 'dashboard') && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      A. Dashboard Screen Cards
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('dashboard')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Dashboard</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      HERO BANNER CARD
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Total Savings &amp; True Net Worth
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <strong>Total Savings</strong> sums the current balances of all your physical bank and e-wallet accounts, plus net growth (<code className="font-mono">+%</code>) since your starting capital. <strong>True Net Worth</strong> adjusts that total by adding money owed to you (Receivables) and subtracting unpaid Borrowed Debt.
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      True Net Worth = Total Savings + Receivables − Debt
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      PILLAR CARD 1
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Assigned to Goal Funds
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Shows how much of your total bank savings is already earmarked (reserved) inside named Sinking Funds such as your <em>Emergency Fund</em>, <em>Travel Fund</em>, or <em>Tuition</em>, along with the count of active goal funds.
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Sum of all named Sinking Fund balances
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                      PILLAR CARD 2
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Unassigned Cash
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      The portion of your physical bank balance that is <strong>not yet locked into any Sinking Fund goal</strong>. This is your general reserve that you can freely assign to new goals without touching dedicated funds.
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Total Savings − Assigned to Goal Funds
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      PILLAR CARD 3
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Emergency Runway
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Measures how many months your Emergency Fund (or liquid reserves) can sustain your average monthly expenses if income stops. Rated as <strong>Critical</strong> (&lt;1 mo), <strong>Building</strong> (1–3 mo), <strong>Solid</strong> (3–6 mo), or <strong>Fortress</strong> (6+ mo).
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Emergency Reserve ÷ Avg Monthly Spend
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">
                      PILLAR CARD 4
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Remaining Debt / Receivables
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Displays your total remaining unpaid balance across active <strong>Borrowed Loans</strong> (plus your monthly installment commitment). If you have no debt, it shows your active <strong>Lent Receivables</strong> owed to you.
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Total Contract − (Initial Paid + Recorded Payments)
                    </div>
                  </div>



                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      PRIORITY SNAPSHOT CARDS
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Top Funds / Accounts &amp; Active Loans Lists
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      The left card toggles between your top 5 <strong>Goal Funds</strong> (with goal target <code className="font-mono">%</code>) and your physical <strong>Bank Accounts</strong> (with share of capital). The right card lists active loans and receivables sorted by highest remaining balance.
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Click any row to jump to Funds or Loans
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      3-TAB VISUAL ANALYTICS CARD
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Cashflow, Categories &amp; Capital Growth Charts
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <strong>Cashflow</strong> compares Income, Expenses, and Savings per period; <strong>Categories</strong> breaks down Expense, Funds, or Income shares in a donut chart; <strong>Capital Growth</strong> plots your cumulative ledger balance over time.
                    </p>
                    <div className="pt-1 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                      Charts include settled (Paid) entries only
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* B. BUDGET & ENTRIES CARDS */}
            {((activeSection === 'all' || activeSection === 'cards')
              ? cardGuideScreen === 'all' || cardGuideScreen === 'budget'
              : activeSection === 'budget') && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      B. Budget &amp; Entries Screen Cards
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('budget')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Budget Sheet</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      PERIOD SUMMARY CARD 1
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Income (Selected Period)
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Shows total settled (<code className="font-mono">Received</code>) income for the active month or bi-weekly cutoff. Before any income is marked received, it displays your Planned Estimate <code className="font-mono">(Est)</code> so you can plan ahead, with <code className="font-mono">Est</code> vs. <code className="font-mono">Act</code> underneath.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">
                      PERIOD SUMMARY CARD 2
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Outflow &amp; Funds (Selected Period)
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Shows the combined total of settled (<code className="font-mono">Paid</code>) expenses, bills, loan installments, and savings allocations for the selected period (or the Planned Estimate total before bills are paid), with <code className="font-mono">Est</code> vs. <code className="font-mono">Act</code> comparison.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-teal-600 dark:text-teal-400">
                      PERIOD SUMMARY CARD 3
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Remaining to Salary &amp; Projected Net
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      The large headline number shows your <strong>current remaining cash</strong> (<code className="font-mono">Received Income − Paid Outflows</code>). Beneath it, <strong>Projected net</strong> combines already-paid actuals with remaining unpaid estimates so you know your end-of-period surplus or deficit in advance.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      INCOME SOURCES CARD
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Collapsible Income Section &amp; Carry Over Surplus
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Lists your salary and extra income for the period. Once every income item is marked <code className="font-mono">Received</code>, the card can collapse into a single summary bar to save screen space. If a prior period had leftover cash, a <strong>Carry Over Surplus</strong> button appears here.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      STICKY CONTROL &amp; LIVE PILL CARD
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Status Filters, Restore Deleted &amp; Live In/Out/Left Readout
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Filter outflows by <code className="font-mono">All</code>, <code className="font-mono">Pending</code>, <code className="font-mono">Paid</code>, or <code className="font-mono">Funds</code>, search by keyword, or sort by any column. If you deleted any item in the current period, a <strong>Restore Deleted (X)</strong> button appears here to restore it.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      PAYMENT CHANNEL SUBTOTAL CARDS (6 CHANNELS)
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Cash, Credit Card, GCash, Kath, Check &amp; Bank Transfer
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Displays the exact settled outflow for each of the 6 payment channels (including split payments). <strong>Tap any channel card</strong> to filter the expense list to only bills paid via that account or payment method.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* C. FUNDS & ACCOUNTS CARDS */}
            {((activeSection === 'all' || activeSection === 'cards')
              ? cardGuideScreen === 'all' || cardGuideScreen === 'funds'
              : activeSection === 'funds') && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PiggyBank className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      C. Funds &amp; Accounts Screen Cards
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('savings')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Funds &amp; Accounts</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      CAPITAL &amp; MILESTONE HEADER CARD
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Total Bank &amp; Wallet Savings + Milestone Bar
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Shows your combined balance across all physical bank and e-wallet accounts, your progress (<code className="font-mono">%</code>) toward your next capital milestone, and 4 quick-action buttons: <strong>Deposit</strong>, <strong>Withdraw</strong>, <strong>Transfer</strong> (between banks), and <strong>Reallocate</strong> (between goals).
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      4-METRIC CAPITAL STRIP
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Assigned to Goal Funds, Added from Budget, Interest &amp; Withdrawn
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Breaks down your ledger history into 4 lifetime totals: <strong>Assigned to Goal Funds</strong> (earmarked), <strong>Added from Budget</strong> (auto-synced when Budget savings items are marked Paid), <strong>Interest Earned</strong> (yields/dividends), and <strong>Total Withdrawn</strong>.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      SINKING FUND GOAL CARDS (FUNDS TAB)
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Individual Goal Envelopes &amp; Where Held Badges
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Each card represents a dedicated savings goal (e.g., <em>Emergency Fund</em>, <em>Travel</em>), showing its current net balance (<code className="font-mono">Added − Used</code>), share of total capital, annual target progress bar, and <strong>Where Held</strong> tags showing which physical bank account(s) hold that fund.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-slate-600 dark:text-slate-400">
                      UNALLOCATED POOL CARD (FUNDS TAB)
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      General Reserves / Starting Capital Card
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Automatically displays any cash sitting in your physical bank accounts that has not yet been assigned to a specific Sinking Fund. Click <strong>Assign to a Goal Fund</strong> on this card to earmark part or all of it into a named goal.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      BANK &amp; WALLET CARDS (ACCOUNTS TAB)
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Physical Account Cards &amp; Fund Allocation Breakdown
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Each card represents a real bank or digital wallet account, displaying its current balance, APY interest rate, share of total capital, and an internal breakdown of which Sinking Funds are stored inside that specific bank account.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-amber-600 dark:text-amber-400">
                      HISTORY &amp; GROWTH PROJECTOR CARDS
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Chronological Audit Log &amp; Compound Simulator
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      <strong>History</strong> lists every deposit, withdrawal, transfer, and reallocation with a chronological <code className="font-mono">Running Total Capital</code> column. <strong>Growth Projector</strong> simulates future compound interest growth based on your monthly contribution, APY, and time horizon.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* D. LOANS & RECEIVABLES CARDS */}
            {((activeSection === 'all' || activeSection === 'cards')
              ? cardGuideScreen === 'all' || cardGuideScreen === 'loans'
              : activeSection === 'loans') && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HandCoins className="w-4 h-4 text-rose-600 dark:text-rose-400" />
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                      D. Loans &amp; Receivables Screen Cards
                    </h4>
                  </div>
                  <button
                    type="button"
                    onClick={() => onNavigateTab('loans')}
                    className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <span>Open Loans &amp; Receivables</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-rose-600 dark:text-rose-400">
                      LOANS KPI CARD 1
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Borrowed (I Owe)
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Total remaining unpaid balance across all active borrowed loans (mortgages, car loans, credit card installments, personal loans), plus the number of active contracts and your combined monthly payment commitment.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      LOANS KPI CARD 2
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Lent (Owed to Me)
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Total remaining uncollected balance across all active receivables (money you lent to friends, family, or clients), along with the active receivable count and expected monthly repayments.
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      LOANS KPI CARD 3
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Paid &amp; Collected
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Cumulative amount you have already repaid toward borrowed debt plus repayments collected on receivables (combining any prior initial paid amount with all logged installment payments).
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      LOANS KPI CARD 4
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Net Loan Position
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Calculated as <code className="font-mono">Lent Remaining − Borrowed Remaining</code>. Shows whether you are in a positive <strong>Net Receivable</strong> position (more owed to you than you owe), a negative <strong>Net Debt</strong> position, or <strong>Balanced</strong> (<code className="font-mono">{currencySymbol}0</code>).
                    </p>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-xl p-4 bg-slate-50/40 dark:bg-slate-800/20 space-y-1.5 md:col-span-2 lg:col-span-2">
                    <div className="text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">
                      CONTRACT AMORTIZATION CARDS
                    </div>
                    <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                      Individual Loan &amp; Receivable Contract Cards
                    </h5>
                    <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                      Each contract card displays the <strong>Remaining Balance</strong>, <strong>Total Paid / Collected</strong>, completion progress bar (<code className="font-mono">%</code>), <strong>Principal</strong> vs. <strong>Total Contract</strong> (including interest), <strong>Installment Amount</strong>, and <strong>Terms Paid / Total Terms</strong> (<code className="font-mono">X left</code>). Linked contracts automatically log payments when you mark their corresponding Budget row as <strong>Paid</strong>, or you can click <strong>Record Payment / Collection</strong> directly on the card.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

      {/* 3. BUDGET, EXCEL IMPORT, SPLIT PAYMENTS & BI-WEEKLY CUTOFFS */}
      {showSection(
        'budget',
        'budget entries spreadsheet monthly bi-weekly biweekly p1 p2 both cutoffs payroll planned estimate actual paid variance templates auto populate categories import excel csv column mapper split payment breakdown to be withdrawn'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  03. Budget Spreadsheet, Excel Import &amp; Split Payments
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Managing Planned vs. Actual amounts, importing spreadsheets, and splitting bills across payment accounts
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

          {/* Universal Excel Importer + Split Payments 2-Column Highlight */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Upload className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Universal Excel &amp; CSV Importer (Any Format)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Click <strong>Import Excel</strong> in the Budget tab to upload any <code className="font-mono">.xlsx</code>, <code className="font-mono">.xls</code>, or <code className="font-mono">.csv</code> file:
              </p>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                <li>Works with simple 3-column tables, bank CSV exports, or multi-section personal templates.</li>
                <li>Import into <strong>Monthly</strong> (<code className="font-mono">Jan–Dec</code>) or <strong>Bi-Weekly</strong> (<code className="font-mono">Jan-P1</code> to <code className="font-mono">Dec-P2</code>) periods.</li>
                <li>Includes an interactive <strong>Column Mapper</strong> and a downloadable <strong>Sample Excel Template</strong>.</li>
              </ul>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
                <Split className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span>Split Payments Across Multiple Accounts</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                Paying a single bill using two different payment methods? Toggle <strong>Split</strong> inside the Add/Edit Entry form:
              </p>
              <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1 list-disc list-inside">
                <li>Divide any expense across <em>Cash, Credit Card, GCash Transfer, Kath Account, Check,</em> or <em>Bank Transfer</em>.</li>
                <li>Automatically calculates the combined <strong>Actual Paid</strong> total from your non-zero split channels.</li>
                <li>Updates the <strong>To Be Withdrawn</strong> summary table accurately for every payment method.</li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {/* 4. DASHBOARD & CASHFLOW SUMMARY EXPLAINED */}
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
                  04. Dashboard &amp; Cashflow Summary Explained
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

      {/* 5. FUNDS, ACCOUNTS & "EARMARKED" EXPLAINED */}
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
                  05. Funds, Bank Accounts &amp; What &ldquo;Earmarked&rdquo; Means
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
                  If you later edit the amount or switch it back to <strong>Pending</strong>, the linked ledger transaction updates or removes itself automatically.
                </li>
              </ol>
            </div>
          </div>
        </section>
      )}

      {/* 6. LOANS PAYABLE & RECEIVABLES */}
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
                  06. Loans Payable (I Owe) &amp; Receivables (Owed to Me)
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
                Track mortgages, auto loans, credit card installments, or personal loans. Specify the <strong>Principal</strong>, <strong>Total Contract Amount</strong> (principal + interest), and total installment count. Link a loan to a recurring Budget Template so marking your monthly bill as <strong>Paid</strong> automatically records the loan payment and updates remaining installments.
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

      {/* 7. GOOGLE DRIVE STORAGE, CONFLICT PROTECTION & MESSENGER / MOBILE BROWSER GUIDE */}
      {showSection(
        'drive',
        'google drive storage cloud sync backup json csv conflict protection starter sample data go live reset multi-year messenger instagram facebook in-app browser missing initial state'
      ) && (
        <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/60 border border-sky-100 dark:border-sky-900 flex items-center justify-center text-sky-600 dark:text-sky-400 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                  07. Google Drive Cloud Sync &amp; Mobile Browser Tips
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800">
              <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Starter Data Overwrite Protection
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  If your browser is holding default sample data, CapitalFlow blocks automatic uploads to Google Drive so you never overwrite your real cloud backups on a new device.
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
                  Before syncing, CapitalFlow compares local and Google Drive timestamps. If Drive has newer edits from another device, a conflict prompt lets you choose whether to Pull or Push.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/70">
              <Smartphone className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h5 className="text-xs font-bold text-slate-900 dark:text-white">
                  Opening from Messenger or Instagram?
                </h5>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  In-app browsers block Google sign-in popups (<em>&ldquo;missing initial state&rdquo;</em>). Tap <strong>&bull;&bull;&bull; &rarr; Open in External Browser</strong> (Safari or Chrome) to sign in with Google Drive.
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* 8. INTERACTIVE FAQ ACCORDION */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 dark:border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Frequently Asked Questions ({filteredFaqs.length})
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Quick answers for new users, Excel imports, split payments, earmarked funds, and mobile sign-in
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
              Try searching for terms like <span className="font-mono">blank</span>, <span className="font-mono">excel</span>, <span className="font-mono">split</span>, <span className="font-mono">earmarked</span>, <span className="font-mono">P1</span>, or <span className="font-mono">messenger</span>.
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
