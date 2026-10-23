import React, { useState, useMemo } from 'react';
import {
  PiggyBank,
  TrendingUp,
  ShieldCheck,
  Building2,
  Plus,
  Coins,
  ArrowUpRight,
  Calculator,
  CheckCircle2,
  Calendar,
  Sparkles,
  ArrowRight,
  X,
  Sliders,
  Edit2,
  Trash2,
  Settings,
  AlertTriangle,
  Landmark,
  Wallet,
  Check,
  ArrowDownRight,
  ArrowLeftRight,
  Target,
  Layers,
  Filter,
  Search,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import {
  SavingsLedgerData,
  SavingsAccount,
  SavingsTransaction,
  YearBudgetData,
} from '../types/finance';
import {
  resolveCanonicalSinkingFundName,
  normalizeSavingCategoryGroup,
  SAVING_CATEGORIES,
  DEFAULT_SINKING_FUND_NAMES,
} from '../services/sampleData';
import { CapitalGrowthChart } from './charts/CapitalGrowthChart';

const ACCOUNT_COLORS = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#f59e0b', // Amber
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#64748b', // Slate
];

const ACCOUNT_CATEGORIES: string[] = [
  'Digital Bank (High-Yield)',
  'Traditional Bank (Savings / Checking)',
  'E-Wallet',
  'Pag-IBIG MP2 & Gov\'t Savings',
  'Emergency Fund',
  'Time Deposit',
  'Stocks & Equities (PSE / Global)',
  'Mutual Funds & UITF',
  'Crypto & Digital Assets',
  'Cash on Hand',
];

const WITHDRAWAL_REASONS: string[] = [
  'Emergency Fund / Medical',
  'Bills & Living Expenses',
  'Tuition / School Fees',
  'Family Support / Remittance',
  'Major Purchase / Appliance',
  'Debt / Loan Settlement',
  'Home Maintenance / Repairs',
  'Travel / Vacation',
  'Cash on Hand',
  'Other',
];

const FUND_COLORS = [
  '#10b981', // Emerald
  '#6366f1', // Indigo
  '#f59e0b', // Amber
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#8b5cf6', // Purple
  '#3b82f6', // Blue
  '#14b8a6', // Teal
  '#f43f5e', // Rose
  '#64748b', // Slate
];

export interface CategoryFundSummary {
  id: string;
  name: string;
  category: string;
  color: string;
  totalInflow: number;
  totalOutflow: number;
  currentBalance: number;
  percentageOfTotal: number;
  accounts: {
    accountId: string;
    accountName: string;
    accountType?: string;
    accountColor?: string;
    amount: number;
    percentage: number;
  }[];
  transactionCount: number;
  latestDate?: string;
  plannedAnnualTarget?: number;
  savedThisYear?: number;
}

interface SavingsLedgerViewProps {
  ledger: SavingsLedgerData;
  budget?: YearBudgetData;
  onAddTransaction: (tx: Omit<SavingsTransaction, 'id' | 'runningTotalCapital'>) => void;
  onUpdateTransaction?: (txId: string, updated: Partial<SavingsTransaction>) => void;
  onDeleteTransaction?: (txId: string) => void;
  onAddAccount: (account: Omit<SavingsAccount, 'id'>) => void;
  onUpdateAccount?: (accountId: string, updates: Partial<SavingsAccount>) => void;
  onDeleteAccount?: (accountId: string, reassignToAccountId?: string) => void;
  onRenameOrMergeFund?: (
    oldFundName: string,
    newFundName: string,
    newMonthlyTarget?: number,
    newSavingCategory?: string
  ) => void;
  onDeleteFund?: (fundName: string, reassignToFund?: string) => void;
  currencySymbol?: string;
}

export const SavingsLedgerView: React.FC<SavingsLedgerViewProps> = ({
  ledger,
  budget,
  onAddTransaction,
  onUpdateTransaction,
  onDeleteTransaction,
  onAddAccount,
  onUpdateAccount,
  onDeleteAccount,
  onRenameOrMergeFund,
  onDeleteFund,
  currencySymbol = '$',
}) => {
  // Transaction modal state (Unified Deposit, Withdraw, Transfer)
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionMode, setTransactionMode] = useState<'deposit' | 'withdraw' | 'transfer'>('deposit');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isManageAccountsModalOpen, setIsManageAccountsModalOpen] = useState(false);
  const [isManageFundsModalOpen, setIsManageFundsModalOpen] = useState(false);
  const [editingFund, setEditingFund] = useState<CategoryFundSummary | null>(null);
  const [editFundName, setEditFundName] = useState('');
  const [editFundCategory, setEditFundCategory] = useState('Short-Term & General Savings');
  const [editFundMergeTarget, setEditFundMergeTarget] = useState('');
  const [editFundMonthlyTarget, setEditFundMonthlyTarget] = useState('');
  const [deletingFund, setDeletingFund] = useState<CategoryFundSummary | null>(null);
  const [deleteFundReassignTo, setDeleteFundReassignTo] = useState('General Reserves / Starting Capital');
  const [activeTab, setActiveTab] = useState<'transactions' | 'sinking_funds' | 'accounts' | 'calculator'>('transactions');
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('all');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');

  // Form states - Deposit
  const [depositAmount, setDepositAmount] = useState('');
  const [depositType, setDepositType] = useState<'interest_yield' | 'manual_deposit'>('manual_deposit');
  const [depositAccountId, setDepositAccountId] = useState(ledger.accounts[0]?.id || '');
  const [depositCategory, setDepositCategory] = useState<string>('');
  const [depositCustomCategory, setDepositCustomCategory] = useState<string>('');
  const [depositNote, setDepositNote] = useState('');
  const [depositDate, setDepositDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states - Withdraw
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawAccountId, setWithdrawAccountId] = useState(ledger.accounts[0]?.id || '');
  const [withdrawCategory, setWithdrawCategory] = useState(WITHDRAWAL_REASONS[0]);
  const [withdrawNote, setWithdrawNote] = useState('');
  const [withdrawDate, setWithdrawDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states - Transfer
  const [transferAmount, setTransferAmount] = useState('');
  const [transferFromAccountId, setTransferFromAccountId] = useState(ledger.accounts[0]?.id || '');
  const [transferToAccountId, setTransferToAccountId] = useState(ledger.accounts[1]?.id || ledger.accounts[0]?.id || '');
  const [transferNote, setTransferNote] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);

  // Form states - Reallocate Category Funds
  const [isReallocateModalOpen, setIsReallocateModalOpen] = useState(false);
  const [reallocateFromCategory, setReallocateFromCategory] = useState<string>('General Reserves / Starting Capital');
  const [reallocateToCategory, setReallocateToCategory] = useState<string>('');
  const [reallocateCustomCategory, setReallocateCustomCategory] = useState<string>('');
  const [reallocateAmount, setReallocateAmount] = useState('');
  const [reallocateAccountId, setReallocateAccountId] = useState<string>('');
  const [reallocateNote, setReallocateNote] = useState('');
  const [reallocateDate, setReallocateDate] = useState(new Date().toISOString().split('T')[0]);

  // Account modal states - Add
  const [accName, setAccName] = useState('');
  const [accType, setAccType] = useState<string>('Digital Bank (High-Yield)');
  const [accInstitution, setAccInstitution] = useState('');
  const [accBalance, setAccBalance] = useState('');
  const [accApy, setAccApy] = useState('4.5');
  const [accColor, setAccColor] = useState(ACCOUNT_COLORS[0]);

  // Account modal states - Edit / Rename
  const [isEditAccountModalOpen, setIsEditAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SavingsAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editType, setEditType] = useState<string>('Digital Bank (High-Yield)');
  const [editInstitution, setEditInstitution] = useState('');
  const [editBalance, setEditBalance] = useState('');
  const [editApy, setEditApy] = useState('');
  const [editColor, setEditColor] = useState(ACCOUNT_COLORS[0]);

  // Account modal states - Delete
  const [isDeleteAccountModalOpen, setIsDeleteAccountModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<SavingsAccount | null>(null);
  const [reassignAccountId, setReassignAccountId] = useState('');

  // Edit Transaction modal states
  const [editingTx, setEditingTx] = useState<SavingsTransaction | null>(null);
  const [editTxAmount, setEditTxAmount] = useState('');
  const [editTxDate, setEditTxDate] = useState('');
  const [editTxNote, setEditTxNote] = useState('');
  const [editTxAccountId, setEditTxAccountId] = useState('');
  const [editTxCategory, setEditTxCategory] = useState('');
  const [editTxCustomCategory, setEditTxCustomCategory] = useState('');

  const handleOpenEditTx = (tx: SavingsTransaction) => {
    setEditingTx(tx);
    setEditTxAmount(String(tx.amount));
    setEditTxDate(tx.date);
    setEditTxNote(tx.note);
    setEditTxAccountId(tx.accountId);
    setEditTxCategory(tx.category || '');
    setEditTxCustomCategory('');
  };

  const handleSaveEditTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !onUpdateTransaction) return;
    const amt = parseFloat(editTxAmount);
    if (isNaN(amt) || amt <= 0) return;
    const targetAcc = ledger.accounts.find((a) => a.id === editTxAccountId) || ledger.accounts[0];
    const resolvedCategory =
      editTxCategory === '__custom__' ? editTxCustomCategory.trim() : editTxCategory.trim();
    const d = new Date(editTxDate);
    onUpdateTransaction(editingTx.id, {
      amount: amt,
      date: editTxDate,
      year: d.getFullYear(),
      period: d.toLocaleString('default', { month: 'short' }),
      note: editTxNote.trim() || editingTx.note,
      category: resolvedCategory || undefined,
      accountId: targetAcc ? targetAcc.id : editingTx.accountId,
      accountName: targetAcc ? targetAcc.name : editingTx.accountName,
    });
    setEditingTx(null);
  };

  // Compound simulator state
  const [simYears, setSimYears] = useState(10);
  const [simMonthly, setSimMonthly] = useState(1200);
  const [simRate, setSimRate] = useState(7.5);

  const transactions = [...ledger.transactions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const accountsBalanceSum = ledger.accounts.reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalCapital =
    accountsBalanceSum > 0
      ? accountsBalanceSum
      : ledger.transactions.length > 0
      ? ledger.transactions[ledger.transactions.length - 1].runningTotalCapital ?? 0
      : ledger.initialCapital || 0;

  // Next milestone computation
  const milestones = [10000, 25000, 50000, 75000, 100000, 150000, 250000, 500000, 1000000];
  const nextMilestone = milestones.find((m) => m > totalCapital) || 1000000;
  const prevMilestone = milestones.slice().reverse().find((m) => m <= totalCapital) || 0;
  const milestoneProgress = Math.min(
    100,
    Math.max(0, ((totalCapital - prevMilestone) / (nextMilestone - prevMilestone)) * 100)
  );

  // Total additions from budget sync
  const budgetSyncAdditions = ledger.transactions
    .filter((tx) => tx.source === 'budget_sync')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const yieldAdditions = ledger.transactions
    .filter((tx) => tx.source === 'interest_yield')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const manualDeposits = ledger.transactions
    .filter((tx) => tx.source === 'manual_deposit')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalWithdrawn = ledger.transactions
    .filter((tx) => tx.source === 'withdrawal')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalTransfers = ledger.transactions
    .filter((tx) => tx.source === 'transfer')
    .reduce((sum, tx) => sum + tx.amount, 0);

  // Category & Sinking Funds Aggregation
  const categoryFunds = useMemo(() => {
    const fundMap = new Map<
      string,
      {
        id: string;
        name: string;
        category: string;
        color: string;
        inflow: number;
        outflow: number;
        accounts: Map<string, { accountId: string; accountName: string; amount: number }>;
        txCount: number;
        latestDate?: string;
        plannedAnnualTarget?: number;
        savedThisYear?: number;
      }
    >();

    const resolveSavingCategory = (fundName: string, fallbackCategory?: string): string => {
      const clean = fundName.trim().toLowerCase();
      // 1. Check if a saving itemTemplate matches by item name
      const byItem = budget?.itemTemplates?.find(
        (t) => t.type === 'saving' && t.item.trim().toLowerCase() === clean
      );
      if (byItem && byItem.category) {
        return normalizeSavingCategoryGroup(fundName, byItem.category);
      }

      return normalizeSavingCategoryGroup(fundName, fallbackCategory);
    };

    const knownCanonicalPool = Array.from(
      new Set([
        ...DEFAULT_SINKING_FUND_NAMES,
        ...(budget?.itemTemplates || [])
          .filter((t) => t.type === 'saving')
          .map((t) => resolveCanonicalSinkingFundName(t.item, t.category, DEFAULT_SINKING_FUND_NAMES)),
      ])
    );

    const getOrCreateFund = (name: string, category?: string, customColor?: string) => {
      const canonical = resolveCanonicalSinkingFundName(name, category, knownCanonicalPool);
      const trimmed = canonical.trim();
      const key = trimmed.toLowerCase();
      if (!knownCanonicalPool.some((p) => p.toLowerCase() === key)) {
        knownCanonicalPool.push(trimmed);
      }
      const resolvedCat = resolveSavingCategory(trimmed, category);
      if (!fundMap.has(key)) {
        const assignedColor = customColor || FUND_COLORS[fundMap.size % FUND_COLORS.length];
        fundMap.set(key, {
          id: `fund-${fundMap.size + 1}`,
          name: trimmed,
          category: resolvedCat,
          color: assignedColor,
          inflow: 0,
          outflow: 0,
          accounts: new Map(),
          txCount: 0,
        });
      }
      return fundMap.get(key)!;
    };

    // 1. Pre-register known fund templates from budget (if available)
    if (budget?.itemTemplates) {
      budget.itemTemplates
        .filter((t) => t.type === 'saving')
        .forEach((tpl, idx) => {
          const fund = getOrCreateFund(tpl.item, tpl.category || 'General Savings', FUND_COLORS[idx % FUND_COLORS.length]);
          fund.plannedAnnualTarget = Math.max(fund.plannedAnnualTarget || 0, (tpl.defaultEstimatedCost || 0) * 12);
        });
    }

    // 2. Track budget entries for this year
    if (budget?.entries) {
      budget.entries
        .filter((e) => e.type === 'saving')
        .forEach((entry) => {
          const fundName = resolveCanonicalSinkingFundName(
            entry.item || entry.description,
            entry.category,
            knownCanonicalPool
          );
          const fund = getOrCreateFund(fundName, entry.category || 'General Savings');
          fund.savedThisYear = (fund.savedThisYear || 0) + (entry.amount || entry.actualCost || 0);
        });
    }

    // 3. Process all ledger transactions
    ledger.transactions.forEach((tx) => {
      const amt = tx.amount || 0;
      const accObj = ledger.accounts.find((a) => a.id === tx.accountId);
      const accName = accObj ? accObj.name : tx.accountName;

      if (tx.source === 'transfer') {
        // Physical bank-to-bank transfers do not alter category fund inflow/outflow totals.
        // If tagged with a specific category fund, shift the physical account breakdown within that fund.
        if (tx.category) {
          const canonicalKey = resolveCanonicalSinkingFundName(tx.category, tx.category, knownCanonicalPool).toLowerCase();
          const targetFund = fundMap.get(canonicalKey);
          if (targetFund) {
            targetFund.txCount += 1;
            const fromAcc = targetFund.accounts.get(tx.accountId) || { accountId: tx.accountId, accountName: accName, amount: 0 };
            fromAcc.amount -= amt;
            targetFund.accounts.set(tx.accountId, fromAcc);
            if (tx.toAccountId) {
              const toAccObj = ledger.accounts.find((a) => a.id === tx.toAccountId);
              const toAccName = toAccObj ? toAccObj.name : (tx.toAccountName || 'Account');
              const toAcc = targetFund.accounts.get(tx.toAccountId) || { accountId: tx.toAccountId, accountName: toAccName, amount: 0 };
              toAcc.amount += amt;
              targetFund.accounts.set(tx.toAccountId, toAcc);
            }
          }
        }
        return;
      }

      if (tx.source === 'reallocation') {
        const fromFundName = tx.category || 'General Reserves / Starting Capital';
        const toFundName = tx.toCategory || 'General Reserves / Starting Capital';
        const isFromUnallocated = fromFundName.trim().toLowerCase() === 'general reserves / starting capital';
        const isToUnallocated = toFundName.trim().toLowerCase() === 'general reserves / starting capital';

        if (!isFromUnallocated) {
          const fromFund = getOrCreateFund(fromFundName);
          fromFund.txCount += 1;
          if (!fromFund.latestDate || new Date(tx.date) > new Date(fromFund.latestDate)) {
            fromFund.latestDate = tx.date;
          }
          fromFund.outflow += amt;
          if (tx.accountId) {
            const fromAcc = fromFund.accounts.get(tx.accountId) || { accountId: tx.accountId, accountName: accName, amount: 0 };
            fromAcc.amount -= amt;
            fromFund.accounts.set(tx.accountId, fromAcc);
          }
        }

        if (!isToUnallocated) {
          const toFund = getOrCreateFund(toFundName);
          toFund.txCount += 1;
          if (!toFund.latestDate || new Date(tx.date) > new Date(toFund.latestDate)) {
            toFund.latestDate = tx.date;
          }
          toFund.inflow += amt;
          if (tx.accountId) {
            const toAcc = toFund.accounts.get(tx.accountId) || { accountId: tx.accountId, accountName: accName, amount: 0 };
            toAcc.amount += amt;
            toFund.accounts.set(tx.accountId, toAcc);
          }
        }
        return;
      }

      let fundName = '';
      let category = tx.category || 'General Savings';

      // If explicitly placed into General Reserves / Starting Capital (unallocated),
      // skip creating a named category fund so it stays in the unallocated remainder pool.
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
      fund.txCount += 1;
      if (!fund.latestDate || new Date(tx.date) > new Date(fund.latestDate)) {
        fund.latestDate = tx.date;
      }

      if (tx.source === 'withdrawal') {
        fund.outflow += amt;
        const currentAcc = fund.accounts.get(tx.accountId) || { accountId: tx.accountId, accountName: accName, amount: 0 };
        currentAcc.amount -= amt;
        fund.accounts.set(tx.accountId, currentAcc);
      } else {
        fund.inflow += amt;
        const currentAcc = fund.accounts.get(tx.accountId) || { accountId: tx.accountId, accountName: accName, amount: 0 };
        currentAcc.amount += amt;
        fund.accounts.set(tx.accountId, currentAcc);
      }
    });

    // 4. Compute results
    const result: CategoryFundSummary[] = [];
    let categorizedNetSum = 0;

    fundMap.forEach((f) => {
      const net = Math.max(0, f.inflow - f.outflow);
      categorizedNetSum += net;

      const accList = Array.from(f.accounts.values())
        .filter((a) => a.amount > 0)
        .map((a) => {
          const accInfo = ledger.accounts.find((acc) => acc.id === a.accountId);
          return {
            accountId: a.accountId,
            accountName: a.accountName,
            accountType: accInfo?.type,
            accountColor: accInfo?.color || '#10b981',
            amount: a.amount,
            percentage: net > 0 ? (a.amount / net) * 100 : 0,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      result.push({
        id: f.id,
        name: f.name,
        category: f.category,
        color: f.color,
        totalInflow: f.inflow,
        totalOutflow: f.outflow,
        currentBalance: net,
        percentageOfTotal: totalCapital > 0 ? (net / totalCapital) * 100 : 0,
        accounts: accList,
        transactionCount: f.txCount,
        latestDate: f.latestDate,
        plannedAnnualTarget: f.plannedAnnualTarget,
        savedThisYear: f.savedThisYear,
      });
    });

    // Unallocated remainder (opening balances or unassigned capital)
    const unallocatedRemainder = Math.max(0, totalCapital - categorizedNetSum);
    if (unallocatedRemainder > 1) {
      const unallocatedAccounts: {
        accountId: string;
        accountName: string;
        accountType?: string;
        accountColor?: string;
        amount: number;
        percentage: number;
      }[] = [];

      ledger.accounts.forEach((acc) => {
        let usedInFunds = 0;
        result.forEach((rf) => {
          const match = rf.accounts.find((a) => a.accountId === acc.id);
          if (match) usedInFunds += match.amount;
        });
        const unallocatedInAcc = Math.max(0, acc.balance - usedInFunds);
        if (unallocatedInAcc > 0) {
          unallocatedAccounts.push({
            accountId: acc.id,
            accountName: acc.name,
            accountType: acc.type,
            accountColor: acc.color || '#64748b',
            amount: unallocatedInAcc,
            percentage: unallocatedRemainder > 0 ? (unallocatedInAcc / unallocatedRemainder) * 100 : 0,
          });
        }
      });

      result.push({
        id: 'fund-general-unallocated',
        name: 'General Reserves / Starting Capital',
        category: 'Unallocated Capital',
        color: '#64748b',
        totalInflow: unallocatedRemainder,
        totalOutflow: 0,
        currentBalance: unallocatedRemainder,
        percentageOfTotal: totalCapital > 0 ? (unallocatedRemainder / totalCapital) * 100 : 0,
        accounts: unallocatedAccounts,
        transactionCount: 0,
      });
    }

    return result.sort((a, b) => b.currentBalance - a.currentBalance);
  }, [ledger.transactions, ledger.accounts, budget, totalCapital]);

  // Filtered transactions for Tab 1
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedAccountFilter !== 'all' && tx.accountId !== selectedAccountFilter && tx.toAccountId !== selectedAccountFilter) {
        return false;
      }
      if (selectedFundFilter !== 'all') {
        const cleanNote = tx.note.replace(/^(Budget Sync|Withdrawal|Manual Deposit):\s*/i, '').trim().toLowerCase();
        const categoryMatch = (tx.category || '').toLowerCase();
        const toCategoryMatch = (tx.toCategory || '').toLowerCase();
        const filterKey = selectedFundFilter.toLowerCase();
        if (
          cleanNote !== filterKey &&
          categoryMatch !== filterKey &&
          toCategoryMatch !== filterKey &&
          !cleanNote.includes(filterKey)
        ) {
          return false;
        }
      }
      if (txSearchQuery.trim()) {
        const query = txSearchQuery.trim().toLowerCase();
        const matchNote = tx.note.toLowerCase().includes(query);
        const matchAcc = tx.accountName.toLowerCase().includes(query);
        const matchCategory = (tx.category || '').toLowerCase().includes(query);
        const matchToCategory = (tx.toCategory || '').toLowerCase().includes(query);
        const matchPeriod = tx.period.toLowerCase().includes(query);
        if (!matchNote && !matchAcc && !matchCategory && !matchToCategory && !matchPeriod) {
          return false;
        }
      }
      return true;
    });
  }, [transactions, selectedAccountFilter, selectedFundFilter, txSearchQuery]);

  const getAccountTransactionCount = (accountId: string) => {
    return ledger.transactions.filter((tx) => tx.accountId === accountId || tx.toAccountId === accountId).length;
  };

  const handleOpenTransactionModal = (mode: 'deposit' | 'withdraw' | 'transfer', accountId?: string) => {
    setTransactionMode(mode);
    if (accountId) {
      if (mode === 'deposit') {
        setDepositAccountId(accountId);
      } else if (mode === 'withdraw') {
        setWithdrawAccountId(accountId);
      } else if (mode === 'transfer') {
        setTransferFromAccountId(accountId);
        const other = ledger.accounts.find((a) => a.id !== accountId);
        if (other) setTransferToAccountId(other.id);
      }
    } else {
      if (mode === 'transfer' && transferFromAccountId === transferToAccountId) {
        const other = ledger.accounts.find((a) => a.id !== transferFromAccountId);
        if (other) setTransferToAccountId(other.id);
      }
    }
    setIsTransactionModalOpen(true);
  };

  const handleRecordDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const acc = ledger.accounts.find((a) => a.id === depositAccountId) || ledger.accounts[0];
    const d = new Date(depositDate);
    const chosenCategory =
      depositCategory === '__custom__' ? depositCustomCategory.trim() : depositCategory.trim();

    onAddTransaction({
      date: depositDate,
      year: d.getFullYear(),
      period: d.toLocaleString('default', { month: 'short' }),
      amount: amountNum,
      accountId: acc.id,
      accountName: acc.name,
      source: depositType,
      category: chosenCategory || undefined,
      note:
        depositNote.trim() ||
        (chosenCategory && chosenCategory !== 'General Reserves / Starting Capital'
          ? `${depositType === 'interest_yield' ? 'Yield' : 'Direct Deposit'}: ${chosenCategory}`
          : depositType === 'interest_yield'
            ? 'Compound yield payout'
            : 'Direct capital injection'),
    });

    setDepositAmount('');
    setDepositCategory('');
    setDepositCustomCategory('');
    setDepositNote('');
    setIsTransactionModalOpen(false);
  };

  const handleRecordWithdrawal = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(withdrawAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const acc = ledger.accounts.find((a) => a.id === withdrawAccountId) || ledger.accounts[0];
    const d = new Date(withdrawDate);

    onAddTransaction({
      date: withdrawDate,
      year: d.getFullYear(),
      period: d.toLocaleString('default', { month: 'short' }),
      amount: amountNum,
      accountId: acc.id,
      accountName: acc.name,
      source: 'withdrawal',
      category: withdrawCategory,
      note: withdrawNote.trim() || `Withdrawal: ${withdrawCategory}`,
    });

    setWithdrawAmount('');
    setWithdrawNote('');
    setIsTransactionModalOpen(false);
  };

  const handleRecordTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(transferAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    if (transferFromAccountId === transferToAccountId) return;

    const fromAcc = ledger.accounts.find((a) => a.id === transferFromAccountId) || ledger.accounts[0];
    const toAcc =
      ledger.accounts.find((a) => a.id === transferToAccountId) ||
      ledger.accounts.find((a) => a.id !== fromAcc.id) ||
      ledger.accounts[0];
    const d = new Date(transferDate);

    onAddTransaction({
      date: transferDate,
      year: d.getFullYear(),
      period: d.toLocaleString('default', { month: 'short' }),
      amount: amountNum,
      accountId: fromAcc.id,
      accountName: fromAcc.name,
      toAccountId: toAcc.id,
      toAccountName: toAcc.name,
      source: 'transfer',
      note: transferNote.trim() || `Transfer from ${fromAcc.name} to ${toAcc.name}`,
    });

    setTransferAmount('');
    setTransferNote('');
    setIsTransactionModalOpen(false);
  };

  const handleRecordReallocation = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(reallocateAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;
    const targetCat =
      reallocateToCategory === '__custom__'
        ? reallocateCustomCategory.trim()
        : reallocateToCategory.trim();
    if (!targetCat || reallocateFromCategory === targetCat) return;

    const acc = ledger.accounts.find((a) => a.id === reallocateAccountId);
    const d = new Date(reallocateDate);

    onAddTransaction({
      date: reallocateDate,
      year: d.getFullYear(),
      period: d.toLocaleString('default', { month: 'short' }),
      amount: amountNum,
      accountId: acc ? acc.id : (ledger.accounts[0]?.id || ''),
      accountName: acc ? acc.name : (ledger.accounts[0]?.name || 'General Account'),
      source: 'reallocation',
      category: reallocateFromCategory,
      toCategory: targetCat,
      note: reallocateNote.trim() || `Reallocated from ${reallocateFromCategory} to ${targetCat}`,
    });

    setReallocateAmount('');
    setReallocateCustomCategory('');
    setReallocateNote('');
    setIsReallocateModalOpen(false);
  };

  const handleOpenAddAccount = () => {
    setAccName('');
    setAccType('Digital Bank (High-Yield)');
    setAccInstitution('');
    setAccBalance('');
    setAccApy('4.5');
    setAccColor(ACCOUNT_COLORS[ledger.accounts.length % ACCOUNT_COLORS.length]);
    setIsAccountModalOpen(true);
  };

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) return;
    const balanceNum = parseFloat(accBalance) || 0;
    const apyNum = parseFloat(accApy) || 0;

    onAddAccount({
      name: accName.trim(),
      type: accType,
      institution: accInstitution.trim() || undefined,
      balance: balanceNum,
      color: accColor || ACCOUNT_COLORS[ledger.accounts.length % ACCOUNT_COLORS.length],
      apy: apyNum,
    });

    setAccName('');
    setAccInstitution('');
    setAccBalance('');
    setIsAccountModalOpen(false);
  };

  const handleOpenEditAccount = (acc: SavingsAccount) => {
    setEditingAccount(acc);
    setEditName(acc.name);
    setEditType(acc.type || 'Digital Bank (High-Yield)');
    setEditInstitution(acc.institution || '');
    setEditBalance(String(acc.balance));
    setEditApy(acc.apy !== undefined ? String(acc.apy) : '');
    setEditColor(acc.color || ACCOUNT_COLORS[0]);
    setIsEditAccountModalOpen(true);
  };

  const handleSaveEditAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount || !editName.trim()) return;

    const balNum = parseFloat(editBalance);
    const apyNum = parseFloat(editApy);

    if (onUpdateAccount) {
      onUpdateAccount(editingAccount.id, {
        name: editName.trim(),
        type: editType,
        institution: editInstitution.trim() || undefined,
        balance: !isNaN(balNum) ? balNum : editingAccount.balance,
        apy: !isNaN(apyNum) ? apyNum : undefined,
        color: editColor,
      });
    }

    setIsEditAccountModalOpen(false);
    setEditingAccount(null);
  };

  const handleOpenDeleteAccount = (acc: SavingsAccount) => {
    if (ledger.accounts.length <= 1) return;
    setDeletingAccount(acc);
    const otherAcc = ledger.accounts.find((a) => a.id !== acc.id);
    setReassignAccountId(otherAcc ? otherAcc.id : '');
    setIsDeleteAccountModalOpen(true);
  };

  const handleConfirmDeleteAccount = () => {
    if (!deletingAccount || !onDeleteAccount) return;
    onDeleteAccount(deletingAccount.id, reassignAccountId);
    setIsDeleteAccountModalOpen(false);
    setDeletingAccount(null);
  };

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  // Compound projector calculation
  const calculateCompound = () => {
    let current = totalCapital;
    let totalContributed = totalCapital;
    const monthlyRate = simRate / 100 / 12;
    const months = simYears * 12;

    for (let m = 0; m < months; m++) {
      current = (current + simMonthly) * (1 + monthlyRate);
      totalContributed += simMonthly;
    }

    return {
      futureVal: current,
      contributed: totalContributed,
      interestEarned: current - totalContributed,
    };
  };

  const compoundResult = calculateCompound();

  return (
    <div className="space-y-6">
      
      {/* Top Banner & Capital Header */}
      <div className="bg-gradient-to-r from-emerald-900 via-teal-900 to-indigo-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-700/60 text-emerald-200 text-xs font-semibold mb-3 border border-emerald-500/30">
              <PiggyBank className="w-3.5 h-3.5 text-emerald-300" />
              <span>Multi-Year Capital Growth Ledger</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
              Total Accumulated Capital: {currencySymbol}{formatNumber(totalCapital)}
            </h1>
            <p className="mt-1 text-sm text-emerald-100/90 max-w-xl">
              Every savings deposit recorded across your annual budgets accumulates in this separate Google Drive database (<code className="font-mono text-emerald-300">capitalflow_savings_ledger.json</code>).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={() => handleOpenTransactionModal('deposit')}
              className="px-3.5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-lg shadow-emerald-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Coins className="w-4 h-4" />
              <span>Record Deposit</span>
            </button>
            <button
              onClick={() => handleOpenTransactionModal('withdraw')}
              className="px-3.5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-rose-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>Withdraw</span>
            </button>
            <button
              onClick={() => handleOpenTransactionModal('transfer')}
              className="px-3.5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-lg shadow-indigo-600/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" />
              <span>Transfer</span>
            </button>
            <button
              onClick={handleOpenAddAccount}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-xl backdrop-blur-xs border border-white/15 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Account</span>
            </button>
            <button
              onClick={() => setIsManageAccountsModalOpen(true)}
              className="px-3 py-2.5 bg-white/10 hover:bg-white/20 text-white font-medium text-xs rounded-xl backdrop-blur-xs border border-white/15 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Sliders className="w-4 h-4" />
              <span>Manage Accounts</span>
            </button>
          </div>
        </div>

        {/* Milestone Progress Bar */}
        <div className="mt-8 pt-6 border-t border-white/10">
          <div className="flex items-center justify-between text-xs mb-2">
            <span className="text-emerald-200">
              Current Milestone: <strong className="text-white">{currencySymbol}{prevMilestone / 1000}k</strong>
            </span>
            <span className="font-semibold text-white">
              Target: <strong className="text-emerald-300">{currencySymbol}{nextMilestone / 1000}k</strong> ({milestoneProgress.toFixed(1)}%)
            </span>
          </div>
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden p-0.5 backdrop-blur-xs">
            <div
              className="h-full bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full transition-all duration-500"
              style={{ width: `${milestoneProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Automated Budget Inflows
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            +{currencySymbol}{formatNumber(budgetSyncAdditions)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Transferred automatically from budget page entries
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Interest &amp; Compounding Yields
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-indigo-600 dark:text-indigo-400">
            +{currencySymbol}{formatNumber(yieldAdditions)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            High-yield APY &amp; market investment growth
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Total Withdrawals
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-rose-600 dark:text-rose-400">
            -{currencySymbol}{formatNumber(totalWithdrawn)}
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Withdrawn across emergency, bills &amp; living expenses
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Active Accounts &amp; Buckets
          </span>
          <div className="mt-2 text-2xl font-bold font-mono text-slate-900 dark:text-white">
            {ledger.accounts.length} Accounts
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Digital banks, e-wallets, traditional &amp; MP2
          </p>
        </div>
      </div>

      {/* Capital Growth Curve */}
      <CapitalGrowthChart ledger={ledger} currencySymbol={currencySymbol} />

      {/* Navigation Sub-Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 text-xs font-semibold overflow-x-auto scrollbar-none">
        <button
          onClick={() => setActiveTab('transactions')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'transactions'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Savings Ledger Entries ({transactions.length})
        </button>
        <button
          onClick={() => setActiveTab('sinking_funds')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
            activeTab === 'sinking_funds'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <PiggyBank className="w-3.5 h-3.5" />
          <span>Category &amp; Sinking Funds ({categoryFunds.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('accounts')}
          className={`px-4 py-2 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
            activeTab === 'accounts'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          Physical Accounts ({ledger.accounts.length})
        </button>
        <button
          onClick={() => setActiveTab('calculator')}
          className={`px-4 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'calculator'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
          }`}
        >
          <Calculator className="w-3.5 h-3.5" />
          <span>Compound Growth Projector</span>
        </button>
      </div>

      {/* Tab 1: Savings Ledger Transactions */}
      {activeTab === 'transactions' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden space-y-0">
          <div className="p-4 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-semibold text-slate-700 dark:text-slate-200 shrink-0">
                Cumulative Capital Progression Ledger
              </span>
              <span className="font-mono text-emerald-600 dark:text-emerald-400 font-medium shrink-0">
                ({filteredTransactions.length} of {transactions.length})
              </span>
            </div>

            {/* Filters Toolbar */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Search Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Search memo, account, fund..."
                  className="pl-8 pr-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none w-44 sm:w-52"
                />
              </div>

              {/* Account Filter */}
              <select
                value={selectedAccountFilter}
                onChange={(e) => setSelectedAccountFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none"
              >
                <option value="all">All Accounts</option>
                {ledger.accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>

              {/* Fund Filter */}
              <select
                value={selectedFundFilter}
                onChange={(e) => setSelectedFundFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none"
              >
                <option value="all">All Category Funds</option>
                {categoryFunds.map((f) => (
                  <option key={f.id} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>

              {(selectedFundFilter !== 'all' || selectedAccountFilter !== 'all' || txSearchQuery.trim()) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedFundFilter('all');
                    setSelectedAccountFilter('all');
                    setTxSearchQuery('');
                  }}
                  className="px-2 py-1 bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-300 rounded-lg text-xs font-semibold hover:underline cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Source</th>
                  <th className="py-3 px-4">Account</th>
                  <th className="py-3 px-4">Note / Memo</th>
                  <th className="py-3 px-4 text-right">Flow / Change</th>
                  <th className="py-3 px-4 text-right">Running Total Capital</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-4 whitespace-nowrap font-mono text-slate-700 dark:text-slate-300">
                      {tx.date} <span className="text-[10px] text-slate-400">({tx.period})</span>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                          tx.source === 'budget_sync'
                            ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800'
                            : tx.source === 'interest_yield'
                            ? 'bg-amber-50 dark:bg-amber-950/70 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                            : tx.source === 'withdrawal'
                            ? 'bg-rose-50 dark:bg-rose-950/70 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                            : tx.source === 'transfer'
                            ? 'bg-sky-50 dark:bg-sky-950/70 text-sky-700 dark:text-sky-300 border border-sky-200 dark:border-sky-800'
                            : tx.source === 'reallocation'
                            ? 'bg-purple-50 dark:bg-purple-950/70 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800'
                            : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                        }`}
                      >
                        {tx.source === 'budget_sync' && 'Budget Transfer'}
                        {tx.source === 'interest_yield' && 'Interest / Yield'}
                        {tx.source === 'manual_deposit' && 'Direct Deposit'}
                        {tx.source === 'withdrawal' && 'Withdrawal'}
                        {tx.source === 'transfer' && 'Account Transfer'}
                        {tx.source === 'reallocation' && 'Category Reallocation'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {tx.source === 'transfer' && tx.toAccountName ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span>{tx.accountName}</span>
                          <ArrowRight className="w-3 h-3 text-sky-500" />
                          <span className="text-sky-700 dark:text-sky-300 font-semibold">{tx.toAccountName}</span>
                        </span>
                      ) : tx.source === 'reallocation' && tx.toCategory ? (
                        <span className="inline-flex items-center gap-1.5 text-xs">
                          <span>{tx.category || 'Reserves'}</span>
                          <ArrowRight className="w-3 h-3 text-purple-500" />
                          <span className="text-purple-700 dark:text-purple-300 font-semibold">{tx.toCategory}</span>
                        </span>
                      ) : (
                        tx.accountName
                      )}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span>{tx.note}</span>
                        {tx.category && tx.source !== 'reallocation' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70">
                            <Target className="w-2.5 h-2.5" />
                            <span>{tx.category}</span>
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                      {tx.source === 'withdrawal' ? (
                        <span className="text-rose-600 dark:text-rose-400">
                          -{currencySymbol}{formatNumber(tx.amount)}
                        </span>
                      ) : tx.source === 'transfer' ? (
                        <span className="text-sky-600 dark:text-sky-400">
                          ⇄ {currencySymbol}{formatNumber(tx.amount)}
                        </span>
                      ) : tx.source === 'reallocation' ? (
                        <span className="text-purple-600 dark:text-purple-400">
                          ⇄ {currencySymbol}{formatNumber(tx.amount)}
                        </span>
                      ) : (
                        <span className="text-emerald-600 dark:text-emerald-400">
                          +{currencySymbol}{formatNumber(tx.amount)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                      {currencySymbol}{formatNumber(tx.runningTotalCapital || 0)}
                    </td>
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      {tx.source !== 'budget_sync' ? (
                        <div className="flex items-center justify-center gap-1">
                          {onUpdateTransaction && (
                            <button
                              type="button"
                              onClick={() => handleOpenEditTx(tx)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded transition-colors cursor-pointer"
                              title="Edit transaction"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {onDeleteTransaction && (
                            <button
                              type="button"
                              onClick={() => onDeleteTransaction(tx.id)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                              title="Delete transaction"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-400" title="Managed via Budget Sheet">
                          Synced
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Category & Sinking Funds */}
      {activeTab === 'sinking_funds' && (
        <div className="space-y-6">
          {/* Header Info Banner */}
          <div className="bg-gradient-to-r from-emerald-950/80 via-teal-950/80 to-slate-900 rounded-2xl p-5 border border-emerald-800/60 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <PiggyBank className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold">Category Funds &amp; Goal Earmarks Breakdown</h3>
              </div>
              <p className="text-xs text-emerald-200/80 max-w-2xl">
                This view breaks down your <strong>{currencySymbol}{formatNumber(totalCapital)}</strong> in total reserves by its earmarked purpose (Emergency Fund, Travel Sinking Fund, Car Maintenance, MP2, etc.) and shows which physical accounts store each fund.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsManageFundsModalOpen(true)}
                className="px-3.5 py-2 bg-white/10 hover:bg-white/20 text-white font-semibold text-xs rounded-xl border border-white/15 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Manage Funds</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const firstNamedFund = categoryFunds.find((f) => f.id !== 'fund-general-unallocated');
                  const unallocatedFund = categoryFunds.find((f) => f.id === 'fund-general-unallocated');
                  setReallocateFromCategory('General Reserves / Starting Capital');
                  setReallocateToCategory(firstNamedFund ? firstNamedFund.name : '__custom__');
                  const firstUnallocatedAcc = unallocatedFund?.accounts?.[0];
                  setReallocateAccountId(firstUnallocatedAcc ? firstUnallocatedAcc.accountId : '');
                  setReallocateAmount(
                    firstUnallocatedAcc
                      ? String(firstUnallocatedAcc.amount)
                      : unallocatedFund
                      ? String(unallocatedFund.currentBalance)
                      : ''
                  );
                  setIsReallocateModalOpen(true);
                }}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Reallocate Funds</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenTransactionModal('deposit')}
                className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Deposit to Goal</span>
              </button>
            </div>
          </div>

          {/* Category Funds Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {categoryFunds.map((fund) => (
              <div
                key={fund.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-4 hover:border-emerald-500/50 transition-all group"
              >
                <div className="space-y-3">
                  {/* Card Header */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-white shadow-xs text-sm"
                        style={{ backgroundColor: fund.color }}
                      >
                        <Target className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate" title={fund.name}>
                          {fund.name}
                        </h4>
                        <span className="inline-block text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md truncate max-w-[190px]">
                          {fund.category}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {/* Share Badge */}
                      <span className="text-[11px] font-mono font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/80 border border-emerald-200 dark:border-emerald-800 px-2 py-1 rounded-lg">
                        {fund.percentageOfTotal.toFixed(1)}%
                      </span>
                      {fund.id !== 'fund-general-unallocated' && (
                        <>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingFund(fund);
                              setEditFundName(fund.name);
                              setEditFundCategory(fund.category || 'Short-Term & General Savings');
                              setEditFundMergeTarget('');
                              setEditFundMonthlyTarget(
                                fund.plannedAnnualTarget ? String(Math.round(fund.plannedAnnualTarget / 12)) : '0'
                              );
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Rename, merge, or change category/target for this fund"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingFund(fund);
                              const otherNamed = categoryFunds.find(
                                (f) => f.id !== 'fund-general-unallocated' && f.id !== fund.id
                              );
                              setDeleteFundReassignTo(
                                otherNamed ? otherNamed.name : 'General Reserves / Starting Capital'
                              );
                            }}
                            className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                            title="Delete or merge this fund"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Balance Display */}
                  <div>
                    <span className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider block mb-0.5">
                      Earmarked Capital Balance
                    </span>
                    <div className="text-2xl font-bold font-mono text-slate-900 dark:text-white">
                      {currencySymbol}{formatNumber(fund.currentBalance)}
                    </div>
                    {fund.plannedAnnualTarget && fund.plannedAnnualTarget > 0 ? (
                      <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-between">
                        <span>Planned Target: {currencySymbol}{formatNumber(fund.plannedAnnualTarget)}/yr</span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {((fund.currentBalance / fund.plannedAnnualTarget) * 100).toFixed(0)}% reached
                        </span>
                      </div>
                    ) : (
                      <div className="mt-1 text-[11px] text-slate-500 flex items-center justify-between">
                        <span className="inline-flex items-center gap-1 font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
                          <ShieldCheck className="w-3 h-3" />
                          <span>Open-Ended Cushion Reserve</span>
                        </span>
                        <span className="font-mono text-slate-500 text-[10px]">
                          Continuous Pool
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Visual Progress Bar */}
                  <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.min(100, Math.max(3, fund.percentageOfTotal))}%`,
                        backgroundColor: fund.color,
                      }}
                    />
                  </div>

                  {/* PHYSICAL LOCATION OF THESE FUNDS */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Landmark className="w-3 h-3 text-slate-400" />
                      <span>Physical Accounts Storing This Money:</span>
                    </span>

                    {fund.accounts.length > 0 ? (
                      <div className="space-y-1">
                        {fund.accounts.map((acc) => (
                          <div
                            key={acc.accountId}
                            className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800"
                          >
                            <div className="flex items-center gap-1.5 truncate pr-2">
                              <span
                                className="w-2 h-2 rounded-full shrink-0"
                                style={{ backgroundColor: acc.accountColor || '#10b981' }}
                              />
                              <span className="font-semibold text-slate-700 dark:text-slate-200 truncate">
                                {acc.accountName}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                                {currencySymbol}{formatNumber(acc.amount)}
                              </span>
                              {fund.id === 'fund-general-unallocated' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const firstNamedFund = categoryFunds.find(
                                      (f) => f.id !== 'fund-general-unallocated'
                                    );
                                    setReallocateFromCategory('General Reserves / Starting Capital');
                                    setReallocateToCategory(firstNamedFund ? firstNamedFund.name : '__custom__');
                                    setReallocateAccountId(acc.accountId);
                                    setReallocateAmount(String(acc.amount));
                                    setIsReallocateModalOpen(true);
                                  }}
                                  className="px-1.5 py-0.5 text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 rounded transition-colors cursor-pointer"
                                  title={`Allocate ${acc.accountName} beginning balance to a fund`}
                                >
                                  Allocate
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-400 italic">
                        No specific account assigned
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Footer Buttons */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400 font-mono">
                    {fund.transactionCount} {fund.transactionCount === 1 ? 'entry' : 'entries'}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFundFilter(fund.name);
                        setActiveTab('transactions');
                      }}
                      className="px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/60 rounded-lg transition-colors cursor-pointer"
                    >
                      View Entries
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (fund.id === 'fund-general-unallocated') {
                          const firstNamedFund = categoryFunds.find(
                            (f) => f.id !== 'fund-general-unallocated'
                          );
                          const firstAcc = fund.accounts[0];
                          setReallocateFromCategory('General Reserves / Starting Capital');
                          setReallocateToCategory(firstNamedFund ? firstNamedFund.name : '__custom__');
                          setReallocateAccountId(firstAcc ? firstAcc.accountId : '');
                          setReallocateAmount(
                            firstAcc ? String(firstAcc.amount) : String(fund.currentBalance)
                          );
                        } else {
                          setReallocateFromCategory('General Reserves / Starting Capital');
                          setReallocateToCategory(fund.name);
                        }
                        setIsReallocateModalOpen(true);
                      }}
                      className="px-2 py-1 text-[11px] font-bold bg-indigo-50 text-indigo-700 dark:bg-indigo-950/80 dark:text-indigo-300 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer"
                    >
                      {fund.id === 'fund-general-unallocated' ? 'Allocate to Fund' : 'Reallocate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDepositType('manual_deposit');
                        setDepositCategory(fund.name);
                        setDepositNote(fund.name);
                        handleOpenTransactionModal('deposit');
                      }}
                      className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 text-emerald-700 dark:bg-emerald-950/80 dark:text-emerald-300 hover:bg-emerald-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Deposit
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 2: Accounts Allocation */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Wallet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Savings &amp; Investment Accounts ({ledger.accounts.length})</span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Manage your asset buckets, rename accounts, adjust returns, or transfer funds.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsManageAccountsModalOpen(true)}
                className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-all border border-slate-200/60 dark:border-slate-700"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Manage Accounts</span>
              </button>
              <button
                onClick={handleOpenAddAccount}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Account</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {ledger.accounts.map((acc) => {
              const share = totalCapital > 0 ? (acc.balance / totalCapital) * 100 : 0;
              const txCount = getAccountTransactionCount(acc.id);
              return (
                <div
                  key={acc.id}
                  className="group bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs ring-2 ring-white dark:ring-slate-900"
                          style={{ backgroundColor: acc.color }}
                        />
                        {acc.apy !== undefined && acc.apy > 0 && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                            {acc.apy}% APY
                          </span>
                        )}
                      </div>

                      {/* Quick Action buttons on card: Edit/Rename and Delete */}
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick={() => handleOpenEditAccount(acc)}
                          className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Rename or Edit Account"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteAccount(acc)}
                          disabled={ledger.accounts.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={ledger.accounts.length <= 1 ? "Cannot delete the last remaining account" : "Delete Account"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <h4 className="font-semibold text-slate-900 dark:text-white text-sm line-clamp-1">
                      {acc.name}
                    </h4>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-xs text-slate-400">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-medium border border-slate-200/60 dark:border-slate-700/60">
                        {acc.type}
                      </span>
                      {acc.institution && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                          <Landmark className="w-3 h-3 text-slate-400" />
                          {acc.institution}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                    <div>
                      <div className="text-lg font-bold font-mono text-slate-900 dark:text-white">
                        {currencySymbol}{formatNumber(acc.balance)}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 flex items-center justify-between">
                        <span>Share of Net Worth</span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">{share.toFixed(1)}%</span>
                      </div>
                    </div>

                    {/* Account Category Fund Allocation Breakdown Bar */}
                    {(() => {
                      const allocatedSlices = categoryFunds
                        .filter((cf) => cf.id !== 'fund-general-unallocated')
                        .map((cf) => {
                          const match = cf.accounts.find((a) => a.accountId === acc.id);
                          return match && match.amount > 0
                            ? { name: cf.name, color: cf.color, amount: match.amount }
                            : null;
                        })
                        .filter(Boolean) as { name: string; color: string; amount: number }[];
                      const allocatedTotal = allocatedSlices.reduce((s, item) => s + item.amount, 0);
                      const unallocatedAmt = Math.max(0, acc.balance - allocatedTotal);
                      const allocatedPct = acc.balance > 0 ? Math.min(100, (allocatedTotal / acc.balance) * 100) : 0;

                      return (
                        <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-800 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-semibold text-slate-600 dark:text-slate-300">
                              Allocated to Funds: {currencySymbol}{formatNumber(allocatedTotal)}
                            </span>
                            <span className="font-mono text-slate-400">
                              Unallocated: {currencySymbol}{formatNumber(unallocatedAmt)}
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                            {allocatedSlices.map((slice, idx) => (
                              <div
                                key={`${slice.name}-${idx}`}
                                style={{
                                  width: `${acc.balance > 0 ? Math.min(100, (slice.amount / acc.balance) * 100) : 0}%`,
                                  backgroundColor: slice.color,
                                }}
                                title={`${slice.name}: ${currencySymbol}${formatNumber(slice.amount)}`}
                                className="h-full"
                              />
                            ))}
                            {allocatedSlices.length === 0 && allocatedPct > 0 && (
                              <div
                                style={{ width: `${allocatedPct}%` }}
                                className="h-full bg-indigo-500"
                              />
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <div className="flex items-center gap-1.5 pt-2 border-t border-slate-100/80 dark:border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => handleOpenTransactionModal('deposit', acc.id)}
                        className="flex-1 py-1.5 px-1.5 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Deposit into this account"
                      >
                        <Coins className="w-3 h-3" />
                        <span>Deposit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenTransactionModal('withdraw', acc.id)}
                        className="flex-1 py-1.5 px-1.5 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
                        title="Withdraw from this account"
                      >
                        <ArrowDownRight className="w-3 h-3" />
                        <span>Withdraw</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenTransactionModal('transfer', acc.id)}
                        disabled={ledger.accounts.length <= 1}
                        className="flex-1 py-1.5 px-1.5 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-[10px] font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer disabled:opacity-40"
                        title="Transfer from this account"
                      >
                        <ArrowLeftRight className="w-3 h-3" />
                        <span>Transfer</span>
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>{txCount} {txCount === 1 ? 'entry' : 'entries'}</span>
                      <button
                        type="button"
                        onClick={() => handleOpenEditAccount(acc)}
                        className="text-slate-500 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:underline font-medium cursor-pointer"
                      >
                        Rename / Edit
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Quick Add Account Card at end of grid */}
            <button
              type="button"
              onClick={handleOpenAddAccount}
              className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-all cursor-pointer min-h-[170px] group bg-slate-50/50 dark:bg-slate-900/50"
            >
              <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 group-hover:bg-emerald-50 dark:group-hover:bg-emerald-950 flex items-center justify-center transition-colors">
                <Plus className="w-5 h-5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
              </div>
              <span className="text-xs font-semibold">Add New Account</span>
              <span className="text-[10px] text-slate-400">HYSA, Brokerage, Retirement</span>
            </button>
          </div>
        </div>
      )}

      {/* Tab 3: Compound Projector */}
      {activeTab === 'calculator' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-4">
            <Calculator className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Long-Term Capital Compound Growth Projector
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">
            Project your total capital accumulation based on your current liquid assets of {currencySymbol}{formatNumber(totalCapital)} and steady recurring contributions.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <span>Monthly Savings Contribution:</span>
                  <span className="font-mono text-emerald-600">{currencySymbol}{formatNumber(simMonthly)}/mo</span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="10000"
                  step="50"
                  value={simMonthly}
                  onChange={(e) => setSimMonthly(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <span>Expected Annual Rate of Return:</span>
                  <span className="font-mono text-indigo-600">{simRate}%</span>
                </div>
                <input
                  type="range"
                  min="2"
                  max="15"
                  step="0.5"
                  value={simRate}
                  onChange={(e) => setSimRate(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  <span>Time Horizon:</span>
                  <span className="font-mono text-slate-900 dark:text-white">{simYears} Years</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="35"
                  step="1"
                  value={simYears}
                  onChange={(e) => setSimYears(parseInt(e.target.value, 10))}
                  className="w-full accent-slate-700"
                />
              </div>
            </div>

            {/* Results display */}
            <div className="bg-slate-50 dark:bg-slate-800/70 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 flex flex-col justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Projected Portfolio in {simYears} Years
                </span>
                <div className="text-3xl font-bold font-mono text-emerald-600 dark:text-emerald-400 mt-2">
                  {currencySymbol}{formatNumber(compoundResult.futureVal)}
                </div>
              </div>

              <div className="space-y-2 pt-4 border-t border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Starting Capital:</span>
                  <span className="font-mono font-medium">{currencySymbol}{formatNumber(totalCapital)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Cumulative Cash Added:</span>
                  <span className="font-mono font-medium">{currencySymbol}{formatNumber(compoundResult.contributed)}</span>
                </div>
                <div className="flex justify-between text-indigo-600 dark:text-indigo-400 font-bold">
                  <span>Compound Interest / Returns:</span>
                  <span className="font-mono">+{currencySymbol}{formatNumber(compoundResult.interestEarned)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unified Transaction Modal (Deposit, Withdraw, Transfer) */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    transactionMode === 'deposit'
                      ? 'bg-emerald-100 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400'
                      : transactionMode === 'withdraw'
                      ? 'bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400'
                      : 'bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400'
                  }`}
                >
                  {transactionMode === 'deposit' && <Coins className="w-5 h-5" />}
                  {transactionMode === 'withdraw' && <ArrowDownRight className="w-5 h-5" />}
                  {transactionMode === 'transfer' && <ArrowLeftRight className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    {transactionMode === 'deposit' && 'Record Savings Deposit / Yield'}
                    {transactionMode === 'withdraw' && 'Withdraw from Savings'}
                    {transactionMode === 'transfer' && 'Transfer Between Savings Accounts'}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {transactionMode === 'deposit' && 'Add fresh funds or compound yield dividend to your accounts'}
                    {transactionMode === 'withdraw' && 'Draw money from your savings bucket for expenses or needs'}
                    {transactionMode === 'transfer' && 'Reallocate funds across your bank, digital & e-wallet buckets'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransactionModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mt-4 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTransactionMode('deposit')}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  transactionMode === 'deposit'
                    ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Deposit</span>
              </button>
              <button
                type="button"
                onClick={() => setTransactionMode('withdraw')}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  transactionMode === 'withdraw'
                    ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ArrowDownRight className="w-3.5 h-3.5" />
                <span>Withdraw</span>
              </button>
              <button
                type="button"
                onClick={() => setTransactionMode('transfer')}
                className={`py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  transactionMode === 'transfer'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Transfer</span>
              </button>
            </div>

            {/* TAB 1: DEPOSIT / YIELD FORM */}
            {transactionMode === 'deposit' && (
              <form onSubmit={handleRecordDeposit} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Source Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setDepositType('interest_yield')}
                      className={`py-1.5 px-3 rounded-lg font-semibold border transition-all cursor-pointer ${
                        depositType === 'interest_yield'
                          ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 text-amber-700 dark:text-amber-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Interest / Yield Payout
                    </button>
                    <button
                      type="button"
                      onClick={() => setDepositType('manual_deposit')}
                      className={`py-1.5 px-3 rounded-lg font-semibold border transition-all cursor-pointer ${
                        depositType === 'manual_deposit'
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Direct Capital Injection
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Destination Account</label>
                  <select
                    value={depositAccountId}
                    onChange={(e) => setDepositAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {ledger.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — {currencySymbol}{formatNumber(acc.balance)} ({acc.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Amount ({currencySymbol})</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 5000.00"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {/* Balance Preview for Deposit */}
                {(() => {
                  const selAcc = ledger.accounts.find((a) => a.id === depositAccountId) || ledger.accounts[0];
                  const addAmt = parseFloat(depositAmount) || 0;
                  if (!selAcc) return null;
                  return (
                    <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/40 rounded-xl border border-emerald-200/70 dark:border-emerald-800/70 text-[11px] flex items-center justify-between">
                      <div className="text-slate-600 dark:text-slate-300">
                        <span>{selAcc.name}: </span>
                        <span className="font-mono">{currencySymbol}{formatNumber(selAcc.balance)}</span>
                        {addAmt > 0 && (
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                            {' '}➔ {currencySymbol}{formatNumber(selAcc.balance + addAmt)} (+{currencySymbol}{formatNumber(addAmt)})
                          </span>
                        )}
                      </div>
                      <span className="text-emerald-700 dark:text-emerald-300 font-medium">+Net Worth</span>
                    </div>
                  );
                })()}

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Which Fund to Put the Money In (Category / Sinking Fund)
                  </label>
                  <select
                    value={depositCategory}
                    onChange={(e) => setDepositCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {depositType === 'interest_yield' ? (
                      <option value="">Compounding Yields &amp; Dividend (Default Yield Pool)</option>
                    ) : (
                      <option value="">General Reserves / Starting Capital (Unallocated)</option>
                    )}
                    {Array.from(
                      new Set([
                        ...categoryFunds.filter((f) => f.id !== 'fund-general-unallocated').map((f) => f.name),
                        ...(budget?.customCategories?.saving || []),
                      ])
                    ).map((cat) => {
                      const matchingFund = categoryFunds.find(
                        (f) => f.name.toLowerCase() === cat.toLowerCase()
                      );
                      return (
                        <option key={cat} value={cat}>
                          {cat}
                          {matchingFund
                            ? ` — Current: ${currencySymbol}${formatNumber(matchingFund.currentBalance)}`
                            : ''}
                        </option>
                      );
                    })}
                    <option value="__custom__">+ Create New Sinking Fund / Goal...</option>
                  </select>
                  {depositCategory === '__custom__' && (
                    <div className="mt-2">
                      <input
                        type="text"
                        required
                        placeholder="Enter new fund name (e.g. Emergency Fund, MP2, Travel Fund)"
                        value={depositCustomCategory}
                        onChange={(e) => setDepositCustomCategory(e.target.value)}
                        className="w-full px-3 py-2 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                      />
                    </div>
                  )}
                  <p className="text-[10px] text-slate-400 mt-1">
                    Choose which earmarked fund receives this deposit, or leave as General Reserves to add to your unallocated balance.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={depositDate}
                      onChange={(e) => setDepositDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Memo / Description</label>
                    <input
                      type="text"
                      placeholder="e.g. Monthly interest or cash bonus"
                      value={depositNote}
                      onChange={(e) => setDepositNote(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Record Deposit</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 2: WITHDRAWAL FORM */}
            {transactionMode === 'withdraw' && (
              <form onSubmit={handleRecordWithdrawal} className="mt-4 space-y-3.5">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Withdraw From Account</label>
                  <select
                    value={withdrawAccountId}
                    onChange={(e) => setWithdrawAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {ledger.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Balance: {currencySymbol}{formatNumber(acc.balance)} ({acc.type})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold">Amount ({currencySymbol})</label>
                    {(() => {
                      const selAcc = ledger.accounts.find((a) => a.id === withdrawAccountId) || ledger.accounts[0];
                      if (!selAcc || selAcc.balance <= 0) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => setWithdrawAmount(selAcc.balance.toString())}
                          className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-medium cursor-pointer"
                        >
                          Withdraw Full ({currencySymbol}{formatNumber(selAcc.balance)})
                        </button>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 5000.00"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {/* Balance validation alert & preview */}
                {(() => {
                  const selAcc = ledger.accounts.find((a) => a.id === withdrawAccountId) || ledger.accounts[0];
                  const wAmt = parseFloat(withdrawAmount) || 0;
                  if (!selAcc) return null;
                  const exceeds = wAmt > selAcc.balance;
                  const newBal = Math.max(0, selAcc.balance - wAmt);

                  return (
                    <div className="space-y-1.5">
                      {exceeds && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-[11px] flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                          <span>
                            Warning: Entered amount ({currencySymbol}{formatNumber(wAmt)}) exceeds current available balance ({currencySymbol}{formatNumber(selAcc.balance)}).
                          </span>
                        </div>
                      )}
                      <div className="p-3 bg-rose-50/70 dark:bg-rose-950/40 rounded-xl border border-rose-200/70 dark:border-rose-800/70 text-[11px] flex flex-col gap-1">
                        <div className="flex items-center justify-between">
                          <span className="text-slate-600 dark:text-slate-300">
                            {selAcc.name}: <strong className="font-mono text-slate-800 dark:text-slate-100">{currencySymbol}{formatNumber(selAcc.balance)}</strong>
                            {wAmt > 0 && (
                              <span className="font-semibold text-rose-600 dark:text-rose-400">
                                {' '}➔ {currencySymbol}{formatNumber(newBal)} (-{currencySymbol}{formatNumber(wAmt)})
                              </span>
                            )}
                          </span>
                          <span className="text-rose-700 dark:text-rose-300 font-semibold">-Capital Outflow</span>
                        </div>
                        <p className="text-[10px] text-slate-400">
                          Total multi-year accumulated capital will decrease by {currencySymbol}{formatNumber(wAmt)}.
                        </p>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Category Fund / Reason</label>
                    <select
                      value={withdrawCategory}
                      onChange={(e) => setWithdrawCategory(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    >
                      {Array.from(
                        new Set([
                          ...categoryFunds.filter((f) => f.id !== 'fund-general-unallocated').map((f) => f.name),
                          ...(budget?.customCategories?.saving || []),
                          ...WITHDRAWAL_REASONS,
                        ])
                      ).map((reason) => (
                        <option key={reason} value={reason}>
                          {reason}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Date</label>
                    <input
                      type="date"
                      required
                      value={withdrawDate}
                      onChange={(e) => setWithdrawDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Memo / Purpose (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Hospital emergency / tuition fee / cash withdrawal"
                    value={withdrawNote}
                    onChange={(e) => setWithdrawNote(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Confirm Withdrawal</span>
                  </button>
                </div>
              </form>
            )}

            {/* TAB 3: TRANSFER BETWEEN ACCOUNTS FORM */}
            {transactionMode === 'transfer' && (
              <form onSubmit={handleRecordTransfer} className="mt-4 space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">From Account (Source)</label>
                    <select
                      value={transferFromAccountId}
                      onChange={(e) => {
                        const newFrom = e.target.value;
                        setTransferFromAccountId(newFrom);
                        if (newFrom === transferToAccountId) {
                          const other = ledger.accounts.find((a) => a.id !== newFrom);
                          if (other) setTransferToAccountId(other.id);
                        }
                      }}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    >
                      {ledger.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">To Account (Destination)</label>
                    <select
                      value={transferToAccountId}
                      onChange={(e) => setTransferToAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    >
                      {ledger.accounts
                        .filter((acc) => acc.id !== transferFromAccountId)
                        .map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold">Transfer Amount ({currencySymbol})</label>
                    {(() => {
                      const fromAcc = ledger.accounts.find((a) => a.id === transferFromAccountId) || ledger.accounts[0];
                      if (!fromAcc || fromAcc.balance <= 0) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => setTransferAmount(fromAcc.balance.toString())}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline font-medium cursor-pointer"
                        >
                          Transfer Max ({currencySymbol}{formatNumber(fromAcc.balance)})
                        </button>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="e.g. 10000.00"
                    value={transferAmount}
                    onChange={(e) => setTransferAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>

                {/* Transfer Preview Card */}
                {(() => {
                  const fromAcc = ledger.accounts.find((a) => a.id === transferFromAccountId) || ledger.accounts[0];
                  const toAcc =
                    ledger.accounts.find((a) => a.id === transferToAccountId) ||
                    ledger.accounts.find((a) => a.id !== fromAcc?.id) ||
                    ledger.accounts[0];
                  const tAmt = parseFloat(transferAmount) || 0;
                  if (!fromAcc || !toAcc) return null;
                  const exceeds = tAmt > fromAcc.balance;

                  return (
                    <div className="space-y-1.5">
                      {exceeds && (
                        <div className="p-2.5 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-[11px] flex items-center gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                          <span>
                            Notice: Transfer amount ({currencySymbol}{formatNumber(tAmt)}) exceeds {fromAcc.name} balance ({currencySymbol}{formatNumber(fromAcc.balance)}).
                          </span>
                        </div>
                      )}
                      <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200/70 dark:border-indigo-800/70 text-[11px] space-y-2">
                        <div className="flex items-center justify-between text-indigo-900 dark:text-indigo-200 font-semibold">
                          <span>Reallocation Preview</span>
                          <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-mono">Net Capital Change: {currencySymbol}0.00</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-600 dark:text-slate-300">
                          <div className="p-2 bg-white/70 dark:bg-slate-900/60 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                            <div className="text-[10px] text-rose-500 font-medium">From: {fromAcc.name}</div>
                            <div className="font-mono text-xs text-slate-900 dark:text-white mt-0.5">
                              {currencySymbol}{formatNumber(fromAcc.balance)}
                              {tAmt > 0 && (
                                <span className="text-rose-600 dark:text-rose-400 font-semibold">
                                  {' '}➔ {currencySymbol}{formatNumber(Math.max(0, fromAcc.balance - tAmt))}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="p-2 bg-white/70 dark:bg-slate-900/60 rounded-lg border border-indigo-100 dark:border-indigo-900/50">
                            <div className="text-[10px] text-emerald-500 font-medium">To: {toAcc.name}</div>
                            <div className="font-mono text-xs text-slate-900 dark:text-white mt-0.5">
                              {currencySymbol}{formatNumber(toAcc.balance)}
                              {tAmt > 0 && (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  {' '}➔ {currencySymbol}{formatNumber(toAcc.balance + tAmt)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Transfer Date</label>
                    <input
                      type="date"
                      required
                      value={transferDate}
                      onChange={(e) => setTransferDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">Memo / Note (Optional)</label>
                    <input
                      type="text"
                      placeholder="e.g. Move to higher APY digital bank"
                      value={transferNote}
                      onChange={(e) => setTransferNote(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    <span>Complete Transfer</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal: Full Manage Savings Accounts Overview */}
      {isManageAccountsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Manage Savings Accounts</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Rename, configure, add new accounts, or delete and reassign balances
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    handleOpenAddAccount();
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Account</span>
                </button>
                <button
                  onClick={() => setIsManageAccountsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-2.5 pr-1">
              {ledger.accounts.map((acc) => {
                const txCount = getAccountTransactionCount(acc.id);
                return (
                  <div
                    key={acc.id}
                    className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="w-4 h-4 rounded-full shrink-0 shadow-xs ring-2 ring-white dark:ring-slate-800"
                        style={{ backgroundColor: acc.color }}
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white text-sm">
                            {acc.name}
                          </span>
                          {acc.apy !== undefined && acc.apy > 0 && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
                              {acc.apy}% APY
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-1 text-slate-400 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium border border-slate-200/60 dark:border-slate-700/60 text-[10px]">
                            {acc.type}
                          </span>
                          {acc.institution && (
                            <>
                              <span>•</span>
                              <span>{acc.institution}</span>
                            </>
                          )}
                          <span>•</span>
                          <span>{txCount} {txCount === 1 ? 'transaction' : 'transactions'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-200 dark:border-slate-700">
                      <div className="text-right">
                        <div className="font-mono font-bold text-slate-900 dark:text-white text-sm">
                          {currencySymbol}{formatNumber(acc.balance)}
                        </div>
                        <div className="text-[10px] text-slate-400">Current Balance</div>
                      </div>

                      <div className="flex items-center gap-1.5 pl-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditAccount(acc)}
                          className="px-2.5 py-1.5 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-lg font-medium text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                          title="Rename / Edit"
                        >
                          <Edit2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                          <span>Rename / Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteAccount(acc)}
                          disabled={ledger.accounts.length <= 1}
                          className="p-1.5 text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                          title={ledger.accounts.length <= 1 ? "Cannot delete the last remaining account" : "Delete Account"}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-xs">
                Total: <strong>{ledger.accounts.length}</strong> active savings accounts
              </span>
              <button
                type="button"
                onClick={() => setIsManageAccountsModalOpen(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white font-semibold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Account */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Add Savings &amp; Asset Account
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Create a new bucket to track accumulated savings and yield
                </p>
              </div>
              <button onClick={() => setIsAccountModalOpen(false)} className="cursor-pointer">
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Account Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Savings, Pag-IBIG MP2, Seabank, BPI Express Teller"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Account Category
                </label>
                <select
                  value={accType}
                  onChange={(e) => setAccType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {ACCOUNT_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Institution / Provider <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maya Bank, SeaBank, Pag-IBIG Fund, BPI, BDO, GCash"
                  value={accInstitution}
                  onChange={(e) => setAccInstitution(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Initial Balance ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Estimated APY / Return %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 4.5"
                    value={accApy}
                    onChange={(e) => setAccApy(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                  Account Accent Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        accColor === c ? 'scale-115 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {accColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                >
                  Save Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Rename & Edit Account */}
      {isEditAccountModalOpen && editingAccount && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Rename &amp; Edit Account
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update account name, category, balance, or return rate
                </p>
              </div>
              <button
                onClick={() => {
                  setIsEditAccountModalOpen(false);
                  setEditingAccount(null);
                }}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAccount} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Account Name (Rename) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Savings, Pag-IBIG MP2, Seabank"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Renaming will automatically update all existing transactions and linked budget entries.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Account Category
                </label>
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                >
                  {Array.from(new Set([...ACCOUNT_CATEGORIES, ...(editType ? [editType] : [])])).map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Institution / Provider <span className="text-slate-400 font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. Maya Bank, SeaBank, Pag-IBIG Fund, BPI, BDO, GCash"
                  value={editInstitution}
                  onChange={(e) => setEditInstitution(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Current Balance ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Estimated APY / Return %
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="e.g. 4.5"
                    value={editApy}
                    onChange={(e) => setEditApy(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                  Account Accent Color
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        editColor === c ? 'scale-115 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900' : 'hover:scale-105'
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {editColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-3 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditAccountModalOpen(false);
                    handleOpenDeleteAccount(editingAccount);
                  }}
                  disabled={ledger.accounts.length <= 1}
                  className="text-rose-600 hover:text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditAccountModalOpen(false);
                      setEditingAccount(null);
                    }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete Account Confirmation & Reassignment */}
      {isDeleteAccountModalOpen && deletingAccount && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-base">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3>Delete Savings Account</h3>
              </div>
              <button
                onClick={() => {
                  setIsDeleteAccountModalOpen(false);
                  setDeletingAccount(null);
                }}
                className="cursor-pointer"
              >
                <X className="w-5 h-5 text-slate-400 hover:text-slate-600" />
              </button>
            </div>

            {ledger.accounts.length <= 1 ? (
              <div className="mt-4 space-y-4">
                <p className="text-slate-700 dark:text-slate-300">
                  Cannot delete <strong>&quot;{deletingAccount.name}&quot;</strong> because it is your only savings account.
                </p>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-300">
                  You must have at least one account in your savings ledger to receive budget savings allocations. Please add another account before deleting this one.
                </div>
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeleteAccountModalOpen(false);
                      setDeletingAccount(null);
                    }}
                    className="px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold rounded-xl cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-slate-700 dark:text-slate-300">
                  Are you sure you want to delete <strong>&quot;{deletingAccount.name}&quot;</strong>?
                </p>

                <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Account Balance:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {currencySymbol}{formatNumber(deletingAccount.balance)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Associated Transactions:</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {getAccountTransactionCount(deletingAccount.id)} records
                    </span>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Transfer Balance &amp; History To:
                  </label>
                  <select
                    value={reassignAccountId}
                    onChange={(e) => setReassignAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none"
                  >
                    {ledger.accounts
                      .filter((a) => a.id !== deletingAccount.id)
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                        </option>
                      ))}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">
                    All existing transactions and remaining capital will be safely transferred to this account.
                  </p>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDeleteAccountModalOpen(false);
                      setDeletingAccount(null);
                    }}
                    className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDeleteAccount}
                    className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Account</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Reallocate Category Funds */}
      {isReallocateModalOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-bold text-base">
                <ArrowLeftRight className="w-5 h-5 shrink-0" />
                <h3>Reallocate Category Funds</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsReallocateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="mt-3 text-slate-500 dark:text-slate-400">
              Shift virtual category envelope allocations without making any real bank transfers. Physical account balances remain completely unchanged.
            </p>

            <form onSubmit={handleRecordReallocation} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  From Category Fund (Source Envelope)
                </label>
                <select
                  value={reallocateFromCategory}
                  onChange={(e) => {
                    const nextFrom = e.target.value;
                    setReallocateFromCategory(nextFrom);
                    if (reallocateToCategory === nextFrom) {
                      const fallbackTarget = categoryFunds.find((f) => f.name !== nextFrom);
                      setReallocateToCategory(fallbackTarget ? fallbackTarget.name : '__custom__');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {!categoryFunds.some((f) => f.id === 'fund-general-unallocated') && (
                    <option value="General Reserves / Starting Capital">General Reserves / Starting Capital ({currencySymbol}0)</option>
                  )}
                  {categoryFunds.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name} ({currencySymbol}{formatNumber(f.currentBalance)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  To Category Fund (Target Envelope)
                </label>
                <select
                  value={reallocateToCategory}
                  onChange={(e) => setReallocateToCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="">-- Select Target Category Fund --</option>
                  {categoryFunds
                    .filter((f) => f.name !== reallocateFromCategory)
                    .map((f) => (
                      <option key={f.id} value={f.name}>
                        {f.name} ({currencySymbol}{formatNumber(f.currentBalance)})
                      </option>
                    ))}
                  {(budget?.customCategories?.saving || [])
                    .filter(
                      (cat) =>
                        cat !== reallocateFromCategory &&
                        !categoryFunds.some((f) => f.name.toLowerCase() === cat.toLowerCase())
                    )
                    .map((cat) => (
                      <option key={`custom-${cat}`} value={cat}>
                        {cat} (Savings Category)
                      </option>
                    ))}
                  <option value="__custom__">+ Create New Sinking Fund / Goal...</option>
                </select>
                {reallocateToCategory === '__custom__' && (
                  <input
                    type="text"
                    required
                    placeholder="Enter new fund name (e.g. House Downpayment, Car Fund)"
                    value={reallocateCustomCategory}
                    onChange={(e) => setReallocateCustomCategory(e.target.value)}
                    className="mt-2 w-full px-3 py-2 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                  />
                )}
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Physical Account Holding This Balance
                </label>
                <select
                  value={reallocateAccountId}
                  onChange={(e) => {
                    const nextAccId = e.target.value;
                    setReallocateAccountId(nextAccId);
                    if (
                      nextAccId &&
                      reallocateFromCategory.trim().toLowerCase() === 'general reserves / starting capital'
                    ) {
                      const unallocatedFund = categoryFunds.find((f) => f.id === 'fund-general-unallocated');
                      const accUnalloc = unallocatedFund?.accounts.find((a) => a.accountId === nextAccId);
                      if (accUnalloc && accUnalloc.amount > 0) {
                        setReallocateAmount(String(accUnalloc.amount));
                      }
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="">All / Unspecified Account</option>
                  {ledger.accounts.map((acc) => {
                    const unallocatedFund = categoryFunds.find((f) => f.id === 'fund-general-unallocated');
                    const accUnalloc = unallocatedFund?.accounts.find((a) => a.accountId === acc.id)?.amount || 0;
                    const isFromUnallocated =
                      reallocateFromCategory.trim().toLowerCase() === 'general reserves / starting capital';
                    return (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Total: {currencySymbol}{formatNumber(acc.balance)}
                        {isFromUnallocated ? ` (Unallocated: ${currencySymbol}${formatNumber(accUnalloc)})` : ''}
                      </option>
                    );
                  })}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Physical bank account balance stays unchanged; this tags which bank account holds the earmarked fund.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-slate-600 dark:text-slate-300 font-semibold">
                      Amount ({currencySymbol})
                    </label>
                    {(() => {
                      const sourceFund = categoryFunds.find((f) => f.name === reallocateFromCategory);
                      const accSlice = reallocateAccountId
                        ? sourceFund?.accounts.find((a) => a.accountId === reallocateAccountId)
                        : undefined;
                      const maxAvail = accSlice ? accSlice.amount : sourceFund?.currentBalance || 0;
                      if (maxAvail <= 0) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => setReallocateAmount(String(maxAvail))}
                          className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          Max ({currencySymbol}{formatNumber(maxAvail)})
                        </button>
                      );
                    })()}
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    placeholder="0.00"
                    value={reallocateAmount}
                    onChange={(e) => setReallocateAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={reallocateDate}
                    onChange={(e) => setReallocateDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Note / Reason
                </label>
                <input
                  type="text"
                  placeholder="e.g. Allocated beginning balance to Emergency Fund"
                  value={reallocateNote}
                  onChange={(e) => setReallocateNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReallocateModalOpen(false)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    !reallocateToCategory ||
                    reallocateToCategory === reallocateFromCategory ||
                    (reallocateToCategory === '__custom__' && !reallocateCustomCategory.trim()) ||
                    !reallocateAmount
                  }
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                >
                  Confirm Reallocation
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Ledger Transaction */}
      {editingTx && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Edit Ledger Transaction
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditTx} className="mt-4 space-y-3.5">
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Destination / Source Account
                </label>
                <select
                  value={editTxAccountId}
                  onChange={(e) => setEditTxAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {ledger.accounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>
              {editingTx.source !== 'transfer' && editingTx.source !== 'reallocation' && (
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Category / Sinking Fund (Envelope)
                  </label>
                  <select
                    value={editTxCategory}
                    onChange={(e) => setEditTxCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="">General Reserves / Starting Capital (Unallocated)</option>
                    {Array.from(
                      new Set([
                        ...categoryFunds.filter((f) => f.id !== 'fund-general-unallocated').map((f) => f.name),
                        ...(budget?.customCategories?.saving || []),
                        ...(editingTx.category ? [editingTx.category] : []),
                      ])
                    ).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                    <option value="__custom__">+ Create New Sinking Fund / Goal...</option>
                  </select>
                  {editTxCategory === '__custom__' && (
                    <input
                      type="text"
                      required
                      placeholder="Enter new fund name..."
                      value={editTxCustomCategory}
                      onChange={(e) => setEditTxCustomCategory(e.target.value)}
                      className="mt-2 w-full px-3 py-2 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                    />
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Amount ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editTxAmount}
                    onChange={(e) => setEditTxAmount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    required
                    value={editTxDate}
                    onChange={(e) => setEditTxDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-600 dark:text-slate-300 font-semibold mb-1">
                  Note / Memo
                </label>
                <input
                  type="text"
                  value={editTxNote}
                  onChange={(e) => setEditTxNote(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Manage All Sinking Funds Overview */}
      {isManageFundsModalOpen && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Manage Sinking Funds &amp; Envelopes</span>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Rename funds, merge redundant funds together, edit monthly targets, or remove unused funds
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsManageFundsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-4 space-y-2.5 pr-1">
              {categoryFunds.filter((f) => f.id !== 'fund-general-unallocated').length === 0 ? (
                <div className="p-8 text-center text-slate-400">
                  No named sinking funds yet. Allocate or deposit into a fund to create one.
                </div>
              ) : (
                categoryFunds
                  .filter((f) => f.id !== 'fund-general-unallocated')
                  .map((fund) => (
                    <div
                      key={fund.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-white font-bold"
                          style={{ backgroundColor: fund.color }}
                        >
                          <Target className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900 dark:text-white truncate">
                              {fund.name}
                            </span>
                            <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-semibold">
                              {fund.transactionCount} {fund.transactionCount === 1 ? 'entry' : 'entries'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-3 mt-0.5">
                            <span>
                              Balance: <strong className="font-mono text-slate-800 dark:text-slate-200">{currencySymbol}{formatNumber(fund.currentBalance)}</strong>
                            </span>
                            {fund.plannedAnnualTarget && fund.plannedAnnualTarget > 0 ? (
                              <span>
                                Target: <strong className="font-mono text-emerald-600 dark:text-emerald-400">{currencySymbol}{formatNumber(fund.plannedAnnualTarget)}/yr</strong>
                              </span>
                            ) : (
                              <span>Open-Ended Reserve</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingFund(fund);
                            setEditFundName(fund.name);
                            setEditFundCategory(normalizeSavingCategoryGroup(fund.name, fund.category));
                            setEditFundMergeTarget('');
                            setEditFundMonthlyTarget(
                              fund.plannedAnnualTarget ? String(Math.round(fund.plannedAnnualTarget / 12)) : '0'
                            );
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Rename / Merge</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingFund(fund);
                            const otherNamed = categoryFunds.find(
                              (f) => f.id !== 'fund-general-unallocated' && f.id !== fund.id
                            );
                            setDeleteFundReassignTo(
                              otherNamed ? otherNamed.name : 'General Reserves / Starting Capital'
                            );
                          }}
                          className="px-3 py-1.5 bg-white dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/50 text-rose-600 dark:text-rose-400 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsManageFundsModalOpen(false)}
                className="px-5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit / Rename / Merge Sinking Fund */}
      {editingFund && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  Edit or Merge Sinking Fund
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Rename &quot;{editingFund.name}&quot;, merge it into another fund, or update its target
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFund(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const finalName = editFundMergeTarget ? editFundMergeTarget.trim() : editFundName.trim();
                if (!finalName || !onRenameOrMergeFund) return;
                const monthlyNum = parseFloat(editFundMonthlyTarget);
                onRenameOrMergeFund(
                  editingFund.name,
                  finalName,
                  !isNaN(monthlyNum) && monthlyNum >= 0 ? monthlyNum : undefined,
                  editFundCategory
                );
                setEditingFund(null);
              }}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Merge Into Existing Fund (Optional — Fixes Redundant Funds)
                </label>
                <select
                  value={editFundMergeTarget}
                  onChange={(e) => {
                    const val = e.target.value;
                    setEditFundMergeTarget(val);
                    if (val) {
                      setEditFundName(val);
                      const targetFundObj = categoryFunds.find((f) => f.name === val);
                      if (targetFundObj?.category) {
                        setEditFundCategory(targetFundObj.category);
                      }
                      if (targetFundObj?.plannedAnnualTarget && (!editFundMonthlyTarget || editFundMonthlyTarget === '0')) {
                        setEditFundMonthlyTarget(String(Math.round(targetFundObj.plannedAnnualTarget / 12)));
                      }
                    } else {
                      setEditFundName(editingFund.name);
                      setEditFundCategory(normalizeSavingCategoryGroup(editingFund.name, editingFund.category));
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="">-- Keep Separate (Rename Only) --</option>
                  {categoryFunds
                    .filter((f) => f.id !== 'fund-general-unallocated' && f.id !== editingFund.id)
                    .map((f) => (
                      <option key={f.id} value={f.name}>
                        Merge into &quot;{f.name}&quot; (Balance: {currencySymbol}{formatNumber(f.currentBalance)})
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Selecting an existing fund combines both funds&apos; balances, transactions, and planned targets into one card.
                </p>
              </div>

              {!editFundMergeTarget && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Fund Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={editFundName}
                    onChange={(e) => setEditFundName(e.target.value)}
                    placeholder="e.g. General Savings, Emergency Fund"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                  />
                </div>
              )}

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Saving Category (Subtitle Badge)
                </label>
                <select
                  value={editFundCategory}
                  onChange={(e) => setEditFundCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                >
                  {Array.from(
                    new Set([
                      ...SAVING_CATEGORIES,
                      ...(budget?.customCategories?.saving || []),
                      editFundCategory || 'Short-Term & General Savings',
                    ])
                  )
                    .filter((cat) => cat && cat !== 'Savings / Envelope')
                    .map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  Matches your configured Saving Categories from Settings / Manage Categories.
                </p>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Planned Monthly Savings Target ({currencySymbol}/month)
                </label>
                <input
                  type="number"
                  step="100"
                  min="0"
                  value={editFundMonthlyTarget}
                  onChange={(e) => setEditFundMonthlyTarget(e.target.value)}
                  placeholder="0 for Open-Ended Cushion Reserve"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Annual Target: <strong>{currencySymbol}{formatNumber((parseFloat(editFundMonthlyTarget) || 0) * 12)}/yr</strong> (set to 0 for an Open-Ended Cushion Reserve).
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFund(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                >
                  {editFundMergeTarget ? `Merge into "${editFundMergeTarget}"` : 'Save Fund Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete / Remove Sinking Fund */}
      {deletingFund && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-base">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3>Remove Sinking Fund</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingFund(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <p className="text-slate-700 dark:text-slate-300">
                Are you sure you want to remove the sinking fund <strong>&quot;{deletingFund.name}&quot;</strong>?
              </p>

              <div className="bg-slate-50 dark:bg-slate-800/80 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Current Fund Balance:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {currencySymbol}{formatNumber(deletingFund.currentBalance)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Linked Entries:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {deletingFund.transactionCount} records
                  </span>
                </div>
              </div>

              {deletingFund.currentBalance > 0 || deletingFund.transactionCount > 0 ? (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Move Balance &amp; Entries To:
                  </label>
                  <select
                    value={deleteFundReassignTo}
                    onChange={(e) => setDeleteFundReassignTo(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="General Reserves / Starting Capital">
                      General Reserves / Starting Capital (Return to Unallocated Cash)
                    </option>
                    {categoryFunds
                      .filter((f) => f.id !== 'fund-general-unallocated' && f.id !== deletingFund.id)
                      .map((f) => (
                        <option key={f.id} value={f.name}>
                          {f.name} (Current: {currencySymbol}{formatNumber(f.currentBalance)})
                        </option>
                      ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1">
                    Your physical bank account balances will not be affected.
                  </p>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  This fund has a {currencySymbol}0 balance and 0 entries. Removing it will clean it up from your Sinking Funds list and Estimate Template.
                </p>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeletingFund(null)}
                  className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onDeleteFund) {
                      onDeleteFund(deletingFund.name, deleteFundReassignTo);
                    }
                    setDeletingFund(null);
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove Fund</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};
