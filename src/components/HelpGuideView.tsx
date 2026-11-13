import React, { useState, useMemo } from 'react';
import {
  BookOpen,
  Search,
  LayoutDashboard,
  FileSpreadsheet,
  PiggyBank,
  HandCoins,
  Cloud,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Sparkles,
  X,
  Compass,
  HelpCircle,
  Lightbulb,
  Layers,
} from 'lucide-react';
import { EntryFrequency, APP_VERSION } from '../types/finance';

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

type GuideCategory =
  | 'all'
  | 'setup'
  | 'dashboard'
  | 'budget'
  | 'funds'
  | 'loans'
  | 'cloud';

interface HowToItem {
  id: string;
  category: Exclude<GuideCategory, 'all'>;
  categoryLabel: string;
  title: string;
  summary: string;
  steps: string[];
  tip?: string;
  actionLabel: string;
  actionTab: AppTab;
}

const HOW_TO_GUIDES: HowToItem[] = [
  // 1. GETTING STARTED & SETUP
  {
    id: 'howto-start-blank',
    category: 'setup',
    categoryLabel: 'Getting Started',
    title: 'How to Clear Sample Data & Start a Blank Budget',
    summary: 'Remove the built-in demo numbers and start with a clean ₱0 workspace.',
    steps: [
      'Look at the amber banner at the top of the app (or the Quick Setup box on this page).',
      'Tap "Start My Blank Budget" and confirm.',
      'All demo budget entries, sample bank accounts, and sample loans are immediately cleared to ₱0.',
    ],
    tip: 'If you already have a saved backup in the cloud, tap "Sign In with Google" instead so your existing data loads automatically.',
    actionLabel: 'Go to Budget',
    actionTab: 'budget',
  },
  {
    id: 'howto-switch-frequency',
    category: 'setup',
    categoryLabel: 'Getting Started',
    title: 'How to Switch Between Monthly & Bi-Weekly (P1 / P2) Mode',
    summary: 'Choose between 12 monthly periods (Jan–Dec) or 24 payday cutoffs (Jan-P1 to Dec-P2).',
    steps: [
      'Open the "Budget" tab.',
      'In the top toolbar, tap either "Monthly" (12 months) or "Bi-Weekly" (P1: 1st–15th, P2: 16th–End).',
      'Your active month is preserved automatically (e.g., Nov switches smoothly to Nov-P1).',
    ],
    tip: 'In Bi-Weekly mode, recurring templates set to "Both (P1 & P2)" automatically budget for both paydays each month.',
    actionLabel: 'Open Budget Toolbar',
    actionTab: 'budget',
  },
  {
    id: 'howto-add-switch-year',
    category: 'setup',
    categoryLabel: 'Getting Started',
    title: 'How to Add or Switch Budget Years (e.g., 2026 to 2027)',
    summary: 'Keep separate annual budget sheets while carrying over your templates and funds ledger.',
    steps: [
      'Tap the Year selector dropdown (e.g., "2026") in the top navigation bar.',
      'Select an existing year to switch, or tap "+ Add Year" to create the next year.',
      'Your recurring Estimate Templates, Bank Accounts, Sinking Funds, and Loans carry over automatically.',
    ],
    actionLabel: 'Go to Dashboard',
    actionTab: 'dashboard',
  },

  // 2. DASHBOARD
  {
    id: 'howto-dashboard-overview',
    category: 'dashboard',
    categoryLabel: 'Dashboard',
    title: 'How to Read Your Total Capital & Cashflow Cards',
    summary: 'Understand your real bank capital, earmarked goals, unassigned cash, and monthly runway.',
    steps: [
      'Open the "Dashboard" tab.',
      'Check "Total Capital" at the top to see the combined balance across all your physical bank and e-wallet accounts.',
      'Check "Assigned to Goal Funds" vs. "Unassigned Cash" to see how much of your bank money is reserved for specific goals versus free to spend.',
      'Review "Emergency Runway" to see how many months your current capital can cover your average monthly expenses.',
    ],
    tip: 'Dashboard settled totals only count budget items marked as "Paid". Pending items are excluded until settled.',
    actionLabel: 'Open Dashboard',
    actionTab: 'dashboard',
  },
  {
    id: 'howto-dashboard-monthly-filter',
    category: 'dashboard',
    categoryLabel: 'Dashboard',
    title: 'How to Inspect Monthly vs. Annual Cashflow & Charts',
    summary: 'Filter your settled income, expenses, and category distribution for any specific month.',
    steps: [
      'On the Dashboard, locate the "Cashflow Summary" card.',
      'Use the period selector dropdown to switch between "Full Year" or a specific month (e.g., "Nov").',
      'Scroll down to the "Goal Funds / Accounts" and "Active Loans" cards to tap any item and jump straight to its ledger.',
    ],
    actionLabel: 'View Dashboard Charts',
    actionTab: 'dashboard',
  },

  // 3. BUDGET & TEMPLATES
  {
    id: 'howto-add-budget-entry',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Add Income, Expenses & Savings Entries',
    summary: 'Record planned bills or actual transactions in your selected month or cutoff.',
    steps: [
      'Open the "Budget" tab and tap your target period (e.g., "Nov" or "Nov-P1") in the period bar.',
      'Tap "+ Add Income" (green), "+ Add Expense" (rose), or "+ Add Fund" (purple) in the section headers.',
      'Select a Category, enter the Item name, and type your Planned Estimate and/or Actual Cost.',
      'Choose a Payment Method (Cash, GCash, Credit Card, Bank Transfer, etc.) and tap "Save".',
    ],
    actionLabel: 'Open Budget Sheet',
    actionTab: 'budget',
  },
  {
    id: 'howto-mark-paid-vs-pending',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Mark Items as "Paid" vs. "Pending"',
    summary: 'Turn planned estimates into settled actuals that update your Dashboard, Funds, and Loans.',
    steps: [
      'Find the item row in your Budget spreadsheet.',
      'Tap the Status badge ("Pending" / "Paid") on the row, or tap the row to edit its Actual Cost and set Status to "Paid".',
      'When marked "Paid", CapitalFlow locks in the Actual Cost (or uses the Estimated Cost if Actual is blank) and automatically triggers any linked Sinking Fund deposit or Loan payment.',
    ],
    tip: 'If a bill was waived or cost ₱0 this month, type 0 in Actual Cost and mark it "Paid".',
    actionLabel: 'Go to Budget',
    actionTab: 'budget',
  },
  {
    id: 'howto-templates-autofill',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Set Up Recurring Templates & Auto-Fill a Period',
    summary: 'Define your regular monthly bills and salary once so every period populates automatically.',
    steps: [
      'In the Budget tab, tap the "Templates" button in the top toolbar.',
      'Add your recurring Income, Expenses, and Savings goals, along with their typical estimated amounts and cutoff schedule (P1, P2, or Both).',
      'Choose visibility: "Displayed" (always shown as a virtual row in the sheet), "Optional" (tagged as optional), or "Not Displayed".',
      'Back on the Budget sheet, you can either click any virtual template row to settle it, or tap "Auto-Fill [Period]" to materialize all planned rows at once.',
    ],
    actionLabel: 'Manage Templates',
    actionTab: 'budget',
  },
  {
    id: 'howto-split-payment',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Split One Expense Across Multiple Payment Methods',
    summary: 'Pay a single bill using two or more accounts (e.g., ₱1,500 Cash + ₱2,000 GCash).',
    steps: [
      'Tap an expense row in the Budget sheet (or click "+ Add Expense").',
      'Next to the Payment Method field, tap the "Split Payment" toggle.',
      'Enter the exact amount paid under each method (Cash, Credit Card, GCash Transfer, Bank Transfer, etc.).',
      'CapitalFlow automatically sums the split amounts into your Total Actual Cost and updates each payment column.',
    ],
    actionLabel: 'Open Budget Sheet',
    actionTab: 'budget',
  },
  {
    id: 'howto-carry-over-surplus',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Carry Over Unspent Surplus from the Previous Period',
    summary: 'Roll over leftover cash from last month into the current month as available income.',
    steps: [
      'When the previous period (e.g., Oct) has Paid Income greater than Paid Expenses + Savings, switch to the next period (e.g., Nov).',
      'Look at the green Income header bar for the amber button: "Carry Over Surplus: ₱X,XXX".',
      'Tap the button and confirm to insert a "Carry-over Surplus" income row into your current period.',
    ],
    actionLabel: 'Go to Budget',
    actionTab: 'budget',
  },
  {
    id: 'howto-delete-restore-period-item',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Delete an Item for One Period Only (and Restore It)',
    summary: 'Skip a recurring template item for a single month without deleting it from your master template.',
    steps: [
      'In the Budget sheet, tap the Trash (Delete) icon on the row you want to skip for the current period.',
      'The item is hidden for that specific period only; other months and your Master Template remain untouched.',
      'Changed your mind? Tap the "Restore Deleted (X)" button in the Budget filter bar to bring it back.',
    ],
    actionLabel: 'Open Budget Sheet',
    actionTab: 'budget',
  },
  {
    id: 'howto-excel-csv-import-export',
    category: 'budget',
    categoryLabel: 'Budget & Templates',
    title: 'How to Import Excel / CSV Files or Export Your Budget',
    summary: 'Bulk-import transactions from any spreadsheet or download a clean CSV report.',
    steps: [
      'In the Budget tab toolbar, tap "Import Excel".',
      'Upload any .xlsx, .xls, or .csv file (or tap "Download Sample Template" first for a ready-to-fill sheet).',
      'Select the target period (e.g., Nov) and verify the column mapping preview, then tap "Import Entries".',
      'To export your current period to Excel/Numbers, tap the "Export CSV" button in the Budget toolbar.',
    ],
    actionLabel: 'Open Budget Importer',
    actionTab: 'budget',
  },

  // 4. FUNDS & ACCOUNTS
  {
    id: 'howto-add-sinking-fund',
    category: 'funds',
    categoryLabel: 'Funds & Accounts',
    title: 'How to Create a New Sinking Fund / Savings Goal (Mobile & Desktop)',
    summary: 'Add a dedicated savings goal like Emergency Fund, Travel, Tuition, or Car Maintenance.',
    steps: [
      'Tap "Funds" (PiggyBank icon) on the navigation bar.',
      'Tap "Reallocate" (to move existing cash into a new goal) or "+ Record" → "Deposit" (to add new money).',
      'In the Goal Fund dropdown, scroll to the bottom and select "+ Create New Sinking Fund...".',
      'Type your new goal name, enter the amount, and tap Save. Your new goal card will appear immediately.',
    ],
    tip: 'You can also create a new fund from the Budget tab by clicking "+ Add Fund" under Savings & Sinking Funds and selecting "+ New Sinking Fund...".',
    actionLabel: 'Open Funds & Goals',
    actionTab: 'savings',
  },
  {
    id: 'howto-manage-sinking-funds',
    category: 'funds',
    categoryLabel: 'Funds & Accounts',
    title: 'How to Set Annual Goal Targets, Rename, or Merge Funds',
    summary: 'Customize your Sinking Fund targets or combine duplicate fund names.',
    steps: [
      'Open the "Funds" tab and make sure you are on the "Goal Funds" view.',
      'Tap the "Manage Funds" button on the right side of the Goal Funds header.',
      'From the modal, edit any fund’s Annual Target, rename a fund, or merge one fund into another.',
    ],
    actionLabel: 'Manage Goal Funds',
    actionTab: 'savings',
  },
  {
    id: 'howto-add-bank-account',
    category: 'funds',
    categoryLabel: 'Funds & Accounts',
    title: 'How to Add or Edit a Bank / E-Wallet Account (GCash, Maya, BPI)',
    summary: 'Track where your physical money is stored and see which goals live inside each bank.',
    steps: [
      'Open the "Funds" tab and switch to the "Accounts" sub-tab.',
      'Tap "+ Add Account" (or the "+ Add Savings Account" card).',
      'Enter the Account Name (e.g., Maya Savings, BPI, GCash), Account Type, APY interest rate, and current balance, then tap Save.',
    ],
    actionLabel: 'Open Bank Accounts',
    actionTab: 'savings',
  },
  {
    id: 'howto-record-ledger-transactions',
    category: 'funds',
    categoryLabel: 'Funds & Accounts',
    title: 'How to Record Deposits, Withdrawals, Interest Yields & Transfers',
    summary: 'Log direct bank movements, high-yield interest earnings, or virtual goal reallocations.',
    steps: [
      'In the "Funds" tab, tap "+ Record" at the top.',
      'Choose the transaction type: "Deposit" (add cash), "Interest / Yield" (log bank interest earned), "Withdrawal" (spend from a fund), "Account Transfer" (move money between banks), or "Reallocate" (move money between goal funds without moving banks).',
      'Select the Account and Sinking Fund Goal, enter the amount, and tap Save.',
    ],
    actionLabel: 'Open Funds Ledger',
    actionTab: 'savings',
  },

  // 5. LOANS & RECEIVABLES
  {
    id: 'howto-add-loan-or-receivable',
    category: 'loans',
    categoryLabel: 'Loans & Debt',
    title: 'How to Add a Borrowed Loan or Lent Receivable',
    summary: 'Track credit card installments, personal loans, mortgages, or money owed to you.',
    steps: [
      'Open the "Loans" tab from the navigation bar.',
      'Tap "+ Add Loan / Receivable".',
      'Select "I Borrowed (Debt / Installment)" for money you owe, or "I Lent (Receivable)" for money someone owes you.',
      'Enter the Principal Amount, Monthly Installment, Total Terms (months), and Start Date, then tap Save.',
    ],
    actionLabel: 'Open Loans & Debt',
    actionTab: 'loans',
  },
  {
    id: 'howto-link-loan-to-budget',
    category: 'loans',
    categoryLabel: 'Loans & Debt',
    title: 'How to Link a Loan to Your Budget for Automatic Paydown',
    summary: 'Automatically deduct loan balances whenever you mark your monthly bill as "Paid".',
    steps: [
      'When creating or editing a Loan in the "Loans" tab, enable "Sync with Recurring Budget Template" (or tap "Link to Budget" on an existing loan card).',
      'Each period, your loan installment will appear in your Budget spreadsheet.',
      'When you mark that budget row as "Paid", CapitalFlow automatically records the loan payment and reduces your remaining loan balance.',
    ],
    tip: 'You can also record a one-off direct payment anytime by tapping "Record Payment" directly on the loan card.',
    actionLabel: 'Go to Loans',
    actionTab: 'loans',
  },

  // 6. CLOUD SYNC & BACKUPS
  {
    id: 'howto-cloud-sync',
    category: 'cloud',
    categoryLabel: 'Cloud & Backups',
    title: 'How to Sync Automatically Across Phone & Laptop (Firebase Cloud)',
    summary: 'Keep your budget, templates, accounts, and loans synced in real time across devices.',
    steps: [
      'Tap "Sign In" in the top-right header (or open the "Backup" tab) and sign in with your Google Account.',
      'Once connected, a green dot appears next to your profile indicating "Firebase Cloud DB Active".',
      'Every change you make to your Budget, Templates, Funds, or Loans is saved automatically to your private cloud database.',
    ],
    actionLabel: 'Open Cloud & Backup',
    actionTab: 'drive',
  },
  {
    id: 'howto-drive-json-backup',
    category: 'cloud',
    categoryLabel: 'Cloud & Backups',
    title: 'How to Back Up or Restore Using Google Drive or Local JSON Files',
    summary: 'Create secondary snapshots in your Google Drive folder or download an offline backup file.',
    steps: [
      'Open the "Backup" (Drive) tab.',
      'Tap "Backup to Google Drive" to save JSON snapshots directly into your personal Google Drive folder, or tap "Restore from Drive" to load them.',
      'For an offline file on your device, tap "Download Full Backup (.json)" or upload an existing backup via "Restore from JSON File".',
    ],
    actionLabel: 'Open Backup Manager',
    actionTab: 'drive',
  },
  {
    id: 'howto-in-app-browser-fix',
    category: 'cloud',
    categoryLabel: 'Cloud & Backups',
    title: 'How to Sign In When Opening Links from Messenger or Instagram',
    summary: 'Bypass restricted social media WebViews that block Google Sign-In popups.',
    steps: [
      'In-app browsers inside Messenger, Instagram, and TikTok block Google security popups ("missing initial state").',
      'Tap the three dots (•••) in the top-right corner of the Messenger/Instagram screen and select "Open in External Browser" (Safari or Chrome).',
      'Or tap the "How to Open in Browser" button on the top banner to launch Chrome directly on Android or copy the link for Safari on iOS.',
    ],
    actionLabel: 'Open Backup Tab',
    actionTab: 'drive',
  },
];

const QUICK_RULES = [
  {
    title: 'Pending vs. Paid',
    description:
      'New budget items start as "Pending" (planned). Only items marked "Paid" count toward Dashboard settled totals, Sinking Fund auto-deposits, and Loan paydowns.',
    badge: 'Rule #1',
    color: 'border-emerald-200 dark:border-emerald-800/60 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-900 dark:text-emerald-200',
  },
  {
    title: 'Physical Accounts vs. Goal Funds',
    description:
      'Accounts (BPI, Maya, GCash) track WHERE your money is kept. Goal Funds (Emergency, Travel) track WHAT that money is reserved for.',
    badge: 'Rule #2',
    color: 'border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/50 dark:bg-indigo-950/20 text-indigo-900 dark:text-indigo-200',
  },
  {
    title: 'Unassigned / Free Cash',
    description:
      'Total Bank Capital minus Assigned Goal Funds equals your Unassigned Cash—the amount you can freely allocate to new goals.',
    badge: 'Rule #3',
    color: 'border-amber-200 dark:border-amber-800/60 bg-amber-50/50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200',
  },
  {
    title: 'Remaining vs. Projected Net',
    description:
      '"Remaining to Salary" shows cash left from settled Paid items right now. "Projected Net" shows your expected end-of-period balance after all Pending bills are paid.',
    badge: 'Rule #4',
    color: 'border-purple-200 dark:border-purple-800/60 bg-purple-50/50 dark:bg-purple-950/20 text-purple-900 dark:text-purple-200',
  },
];

export const HelpGuideView: React.FC<HelpGuideViewProps> = ({
  onNavigateTab,
  currentYear,
  frequency,
  onChangeFrequency,
  isStarterSampleActive = false,
  onStartBlankWorkspace,
  onSignInWithGoogle,
  isSignedIn = false,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<GuideCategory>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(HOW_TO_GUIDES[0].id);
  const [expandAll, setExpandAll] = useState<boolean>(false);

  const categories: { id: GuideCategory; label: string; icon: React.ReactNode }[] = [
    { id: 'all', label: 'All How-To Guides', icon: <Compass className="w-3.5 h-3.5" /> },
    { id: 'setup', label: 'Getting Started', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
    { id: 'budget', label: 'Budget & Templates', icon: <FileSpreadsheet className="w-3.5 h-3.5" /> },
    { id: 'funds', label: 'Funds & Accounts', icon: <PiggyBank className="w-3.5 h-3.5" /> },
    { id: 'loans', label: 'Loans & Debt', icon: <HandCoins className="w-3.5 h-3.5" /> },
    { id: 'cloud', label: 'Cloud & Backups', icon: <Cloud className="w-3.5 h-3.5" /> },
  ];

  const filteredGuides = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return HOW_TO_GUIDES.filter((item) => {
      const matchesCat = selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchesCat) return false;
      if (!q) return true;
      return (
        item.title.toLowerCase().includes(q) ||
        item.summary.toLowerCase().includes(q) ||
        item.categoryLabel.toLowerCase().includes(q) ||
        item.steps.some((s) => s.toLowerCase().includes(q)) ||
        (item.tip && item.tip.toLowerCase().includes(q))
      );
    });
  }, [selectedCategory, searchQuery]);

  const toggleItem = (id: string) => {
    if (expandAll) {
      setExpandAll(false);
      setExpandedId(id);
      return;
    }
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-5 pb-8">
      {/* 1. Header & Quick Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <BookOpen className="w-4 h-4" />
              <span>CapitalFlow v{APP_VERSION} &middot; Step-by-Step Guide</span>
            </div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 dark:text-white">
              How to Use Every Feature in CapitalFlow
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
              Simple, step-by-step instructions for budgeting, sinking funds, bank accounts, loans, and cloud sync.
            </p>
          </div>
        </div>

        {/* Optional Quick-Start Actions if Starter Data is Active or Not Signed In */}
        {(isStarterSampleActive || !isSignedIn) && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-bold text-slate-900 dark:text-white">Ready to begin?</span>{' '}
              {isStarterSampleActive
                ? 'Clear the built-in sample numbers for a clean ₱0 workspace, or sign in to load your cloud data.'
                : 'Sign in with Google to automatically back up and sync your data across devices.'}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {isStarterSampleActive && onStartBlankWorkspace && (
                <button
                  type="button"
                  onClick={onStartBlankWorkspace}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start My Blank Budget ({currentYear})</span>
                </button>
              )}
              {!isSignedIn && onSignInWithGoogle && (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sign In with Google</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. Four Core Rules At-a-Glance */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {QUICK_RULES.map((rule) => (
          <div
            key={rule.title}
            className={`rounded-2xl p-3.5 border ${rule.color} flex flex-col justify-between gap-1.5`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold">{rule.title}</span>
              <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded-md bg-white/70 dark:bg-slate-900/70">
                {rule.badge}
              </span>
            </div>
            <p className="text-[11px] leading-relaxed opacity-90">{rule.description}</p>
          </div>
        ))}
      </div>

      {/* 3. Search & Category Filter Bar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search how to add a fund, split payment, import Excel, link loans..."
              className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Expand / Collapse All Toggle */}
          <button
            type="button"
            onClick={() => setExpandAll((prev) => !prev)}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 flex items-center justify-center gap-1.5 shrink-0 cursor-pointer transition-colors"
          >
            <Layers className="w-3.5 h-3.5 text-indigo-500" />
            <span>{expandAll ? 'Collapse All Steps' : 'Expand All Steps'}</span>
          </button>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {categories.map((cat) => {
            const active = selectedCategory === cat.id;
            const count =
              cat.id === 'all'
                ? HOW_TO_GUIDES.length
                : HOW_TO_GUIDES.filter((g) => g.category === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-700'
                }`}
              >
                {cat.icon}
                <span>{cat.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. Step-by-Step "How To" Accordion List */}
      {filteredGuides.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800">
          <HelpCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            No matching guides found for "{searchQuery}"
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Try searching for keywords like "fund", "account", "paid", "split", "loan", or "backup".
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="mt-3 px-3 py-1.5 rounded-xl bg-indigo-600 text-white text-xs font-semibold cursor-pointer"
          >
            Show All How-To Guides
          </button>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredGuides.map((guide, index) => {
            const isOpen = expandAll || expandedId === guide.id || Boolean(searchQuery.trim());
            return (
              <div
                key={guide.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transition-colors"
              >
                {/* Clickable Header */}
                <button
                  type="button"
                  onClick={() => toggleItem(guide.id)}
                  className="w-full p-3.5 sm:p-4 text-left flex items-start sm:items-center justify-between gap-3 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/80 dark:border-indigo-800/60 text-indigo-600 dark:text-indigo-400 text-xs font-bold font-mono flex items-center justify-center shrink-0 mt-0.5 sm:mt-0">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {guide.categoryLabel}
                        </span>
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                          {guide.title}
                        </h3>
                      </div>
                      <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {guide.summary}
                      </p>
                    </div>
                  </div>

                  <div className="text-slate-400 shrink-0 mt-1 sm:mt-0">
                    {isOpen ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </div>
                </button>

                {/* Expanded Step-by-Step Content */}
                {isOpen && (
                  <div className="px-3.5 pb-4 sm:px-4 sm:pb-4 pt-2 border-t border-slate-100 dark:border-slate-800/80 bg-slate-50/40 dark:bg-slate-950/30 space-y-3">
                    <ol className="space-y-2">
                      {guide.steps.map((step, stepIdx) => (
                        <li
                          key={stepIdx}
                          className="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed"
                        >
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                          <span>
                            <strong className="text-slate-900 dark:text-white">
                              Step {stepIdx + 1}:
                            </strong>{' '}
                            {step}
                          </span>
                        </li>
                      ))}
                    </ol>

                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pt-1">
                      {guide.tip ? (
                        <div className="flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-800/50 rounded-xl px-3 py-2">
                          <Lightbulb className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                          <span>
                            <strong>Tip:</strong> {guide.tip}
                          </span>
                        </div>
                      ) : (
                        <div />
                      )}

                      <button
                        type="button"
                        onClick={() => onNavigateTab(guide.actionTab)}
                        className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer shadow-2xs"
                      >
                        <span>{guide.actionLabel}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
