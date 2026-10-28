import React, { useState, useMemo } from 'react';
import {
  PiggyBank,
  Plus,
  Coins,
  Calculator,
  ArrowRight,
  X,
  Sliders,
  Edit2,
  Trash2,
  AlertTriangle,
  Landmark,
  Wallet,
  Check,
  ArrowDownRight,
  ArrowLeftRight,
  Target,
  Search,
  History,
  Sparkles,
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
  MONTH_NAMES,
} from '../services/sampleData';

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
  // Primary sub-navigation: default to Sinking Funds for immediate goal visibility
  const [activeTab, setActiveTab] = useState<'sinking_funds' | 'accounts' | 'transactions' | 'calculator'>('sinking_funds');

  // Transaction modal state (Unified Deposit, Withdraw, Transfer)
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [transactionMode, setTransactionMode] = useState<'deposit' | 'withdraw' | 'transfer'>('deposit');
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [isManageAccountsModalOpen, setIsManageAccountsModalOpen] = useState(false);
  const [isManageFundsModalOpen, setIsManageFundsModalOpen] = useState(false);

  // Fund edit/delete state
  const [editingFund, setEditingFund] = useState<CategoryFundSummary | null>(null);
  const [editFundName, setEditFundName] = useState('');
  const [editFundCategory, setEditFundCategory] = useState('Short-Term & General Savings');
  const [editFundMergeTarget, setEditFundMergeTarget] = useState('');
  const [editFundMonthlyTarget, setEditFundMonthlyTarget] = useState('');
  const [deletingFund, setDeletingFund] = useState<CategoryFundSummary | null>(null);
  const [deleteFundReassignTo, setDeleteFundReassignTo] = useState('General Reserves / Starting Capital');

  // Ledger history filters
  const [selectedFundFilter, setSelectedFundFilter] = useState<string>('all');
  const [selectedAccountFilter, setSelectedAccountFilter] = useState<string>('all');
  const [selectedSourceFilter, setSelectedSourceFilter] = useState<string>('all');
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

  // Compound simulator state
  const [simYears, setSimYears] = useState(10);
  const [simMonthly, setSimMonthly] = useState(1200);
  const [simRate, setSimRate] = useState(7.5);

  const handleOpenEditTx = (tx: SavingsTransaction) => {
    setEditingTx(tx);
    setEditTxAmount(String(tx.amount));
    setEditTxDate(tx.date);
    setEditTxNote(tx.note);
    setEditTxAccountId(tx.accountId);
    setEditTxCategory(tx.category || '');
    setEditTxCustomCategory('');
  };

  const parseDateYearAndPeriod = (dateStr: string): { year: number; period: string } => {
    const parts = (dateStr || '').split('-').map((n) => parseInt(n, 10));
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const mIdx = Math.max(0, Math.min(11, parts[1] - 1));
      return { year: parts[0], period: MONTH_NAMES[mIdx] || 'Jan' };
    }
    const now = new Date();
    return { year: now.getFullYear(), period: MONTH_NAMES[now.getMonth()] || 'Jan' };
  };

  const handleSaveEditTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !onUpdateTransaction) return;
    const amt = parseFloat(editTxAmount);
    if (isNaN(amt) || amt <= 0) return;
    const targetAcc = ledger.accounts.find((a) => a.id === editTxAccountId) || ledger.accounts[0];
    const resolvedCategory =
      editTxCategory === '__custom__' ? editTxCustomCategory.trim() : editTxCategory.trim();
    const { year, period } = parseDateYearAndPeriod(editTxDate);
    onUpdateTransaction(editingTx.id, {
      amount: amt,
      date: editTxDate,
      year,
      period,
      note: editTxNote.trim() || editingTx.note,
      category: resolvedCategory || undefined,
      accountId: targetAcc ? targetAcc.id : editingTx.accountId,
      accountName: targetAcc ? targetAcc.name : editingTx.accountName,
    });
    setEditingTx(null);
  };

  const transactions = useMemo(
    () =>
      [...ledger.transactions].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [ledger.transactions]
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

  // Summary metrics
  const budgetSyncAdditions = ledger.transactions
    .filter((tx) => tx.source === 'budget_sync')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const yieldAdditions = ledger.transactions
    .filter((tx) => tx.source === 'interest_yield')
    .reduce((sum, tx) => sum + tx.amount, 0);

  const totalWithdrawn = ledger.transactions
    .filter((tx) => tx.source === 'withdrawal')
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

    // 1. Pre-register known fund templates from budget
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

    // 2. Track budget entries for this year
    if (budget?.entries) {
      budget.entries
        .filter((e) => e.type === 'saving')
        .forEach((entry) => {
          const rawItem = (entry.item || entry.description || '').trim();
          if (rawItem.toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          const fundName = resolveCanonicalSinkingFundName(
            rawItem,
            entry.category,
            knownCanonicalPool
          );
          if (fundName.trim().toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          const fund = getOrCreateFund(fundName, entry.category || 'General Savings');
          if (entry.status !== 'Pending') {
            fund.savedThisYear = (fund.savedThisYear || 0) + (entry.amount || entry.actualCost || 0);
          }
        });
    }

    // 3. Process all ledger transactions
    ledger.transactions.forEach((tx) => {
      const amt = tx.amount || 0;
      const accObj = ledger.accounts.find((a) => a.id === tx.accountId);
      const accName = accObj ? accObj.name : tx.accountName;

      if (tx.source === 'transfer') {
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
          const rawLinkedItem = (linkedEntry.item || linkedEntry.description || '').trim();
          if (rawLinkedItem.toLowerCase() === 'general reserves / starting capital') {
            return;
          }
          fundName = resolveCanonicalSinkingFundName(
            rawLinkedItem,
            linkedEntry.category,
            knownCanonicalPool
          );
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

  const unallocatedFund = useMemo(
    () => categoryFunds.find((f) => f.id === 'fund-general-unallocated'),
    [categoryFunds]
  );
  const earmarkedTotal = Math.max(0, totalCapital - (unallocatedFund?.currentBalance || 0));

  // Filtered transactions for Ledger History tab
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedSourceFilter !== 'all') {
        if (selectedSourceFilter === 'inflow' && tx.source !== 'budget_sync' && tx.source !== 'manual_deposit' && tx.source !== 'interest_yield') {
          return false;
        }
        if (selectedSourceFilter === 'withdrawal' && tx.source !== 'withdrawal') {
          return false;
        }
        if (selectedSourceFilter === 'transfer' && tx.source !== 'transfer' && tx.source !== 'reallocation') {
          return false;
        }
      }
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
  }, [transactions, selectedSourceFilter, selectedAccountFilter, selectedFundFilter, txSearchQuery]);

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

  const handleOpenReallocateModal = (fromFund?: string, toFund?: string, accountId?: string, amount?: number) => {
    const firstNamedFund = categoryFunds.find((f) => f.id !== 'fund-general-unallocated');
    const source = fromFund || 'General Reserves / Starting Capital';
    setReallocateFromCategory(source);
    if (toFund) {
      setReallocateToCategory(toFund);
    } else if (firstNamedFund && firstNamedFund.name !== source) {
      setReallocateToCategory(firstNamedFund.name);
    } else {
      setReallocateToCategory('__custom__');
    }
    const firstUnallocatedAcc = unallocatedFund?.accounts?.[0];
    setReallocateAccountId(accountId !== undefined ? accountId : (firstUnallocatedAcc ? firstUnallocatedAcc.accountId : ''));
    if (amount !== undefined) {
      setReallocateAmount(String(amount));
    } else if (source === 'General Reserves / Starting Capital' && firstUnallocatedAcc) {
      setReallocateAmount(String(firstUnallocatedAcc.amount));
    } else {
      setReallocateAmount('');
    }
    setIsReallocateModalOpen(true);
  };

  const handleRecordDeposit = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(depositAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const acc = ledger.accounts.find((a) => a.id === depositAccountId) || ledger.accounts[0];
    const { year, period } = parseDateYearAndPeriod(depositDate);
    const chosenCategory =
      depositCategory === '__custom__' ? depositCustomCategory.trim() : depositCategory.trim();

    onAddTransaction({
      date: depositDate,
      year,
      period,
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
    const { year, period } = parseDateYearAndPeriod(withdrawDate);

    onAddTransaction({
      date: withdrawDate,
      year,
      period,
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
    const { year, period } = parseDateYearAndPeriod(transferDate);

    onAddTransaction({
      date: transferDate,
      year,
      period,
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
    const { year, period } = parseDateYearAndPeriod(reallocateDate);

    onAddTransaction({
      date: reallocateDate,
      year,
      period,
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
  const compoundResult = useMemo(() => {
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
  }, [totalCapital, simRate, simYears, simMonthly]);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Compact Unified Capital & Action Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Left: Total Capital + Milestone Progress */}
          <div className="space-y-2 min-w-0 flex-1">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <PiggyBank className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Total Accumulated Capital</span>
              <span>&middot;</span>
              <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                {ledger.accounts.length} {ledger.accounts.length === 1 ? 'account' : 'accounts'}
              </span>
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight font-mono tabular-nums text-slate-900 dark:text-white">
                {currencySymbol}{formatNumber(totalCapital)}
              </h1>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                Milestone: {currencySymbol}{nextMilestone / 1000}k ({milestoneProgress.toFixed(0)}%)
              </span>
            </div>

            <div className="w-full max-w-md h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${milestoneProgress}%` }}
              />
            </div>
          </div>

          {/* Right: Primary Quick Actions (4-button thumb-friendly grid on mobile) */}
          <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleOpenTransactionModal('deposit')}
              className="min-h-[42px] px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
            >
              <Coins className="w-3.5 h-3.5 shrink-0" />
              <span>Deposit</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenTransactionModal('withdraw')}
              className="min-h-[42px] px-3.5 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
            >
              <ArrowDownRight className="w-3.5 h-3.5 shrink-0" />
              <span>Withdraw</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenTransactionModal('transfer')}
              className="min-h-[42px] px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 shrink-0 text-indigo-600 dark:text-indigo-400" />
              <span>Transfer</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenReallocateModal()}
              className="min-h-[42px] px-3.5 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Target className="w-3.5 h-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Reallocate</span>
            </button>
          </div>
        </div>

        {/* Compact 4-Metric Strip */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Earmarked in Funds</span>
            <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {currencySymbol}{formatNumber(earmarkedTotal)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Budget Sync Inflow</span>
            <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              +{currencySymbol}{formatNumber(budgetSyncAdditions)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Yield &amp; Interest</span>
            <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
              +{currencySymbol}{formatNumber(yieldAdditions)}
            </span>
          </div>
          <div>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">Total Withdrawn</span>
            <span className="text-sm sm:text-base font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400">
              -{currencySymbol}{formatNumber(totalWithdrawn)}
            </span>
          </div>
        </div>
      </div>

      {/* Segmented Navigation Bar (Responsive 2x2 on Mobile, 4-Across on Tablet & Desktop) */}
      <div className="grid grid-cols-2 min-[540px]:grid-cols-4 gap-1.5 sm:gap-2 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-2xl border border-slate-200/70 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('sinking_funds')}
          className={`min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
            activeTab === 'sinking_funds'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
          }`}
        >
          <Target className="w-4 h-4 shrink-0" />
          <span className="truncate">Funds</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full leading-none shrink-0 ${
              activeTab === 'sinking_funds'
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold'
                : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-400 font-medium'
            }`}
          >
            {categoryFunds.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('accounts')}
          className={`min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
            activeTab === 'accounts'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
          }`}
        >
          <Wallet className="w-4 h-4 shrink-0" />
          <span className="truncate">Accounts</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full leading-none shrink-0 ${
              activeTab === 'accounts'
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold'
                : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-400 font-medium'
            }`}
          >
            {ledger.accounts.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('transactions')}
          className={`min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
            activeTab === 'transactions'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
          }`}
        >
          <History className="w-4 h-4 shrink-0" />
          <span className="truncate">History</span>
          <span
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full leading-none shrink-0 ${
              activeTab === 'transactions'
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 font-bold'
                : 'bg-slate-200/80 dark:bg-slate-700/80 text-slate-600 dark:text-slate-400 font-medium'
            }`}
          >
            {transactions.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calculator')}
          className={`min-h-[42px] px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-1.5 sm:gap-2 cursor-pointer ${
            activeTab === 'calculator'
              ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-white/60 dark:hover:bg-slate-800/60'
          }`}
        >
          <Calculator className="w-4 h-4 shrink-0" />
          <span className="truncate">
            <span className="hidden sm:inline">Growth </span>Projector
          </span>
        </button>
      </div>

      {/* TAB 1: SINKING FUNDS & ENVELOPES */}
      {activeTab === 'sinking_funds' && (
        <div className="space-y-4">
          {/* Compact Section Toolbar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">Sinking Funds &amp; Envelopes</span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700">&middot;</span>
              <span>
                Track goal balances and which physical bank accounts store each reserve
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsManageFundsModalOpen(true)}
                className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200/70 dark:border-slate-700 transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span>Manage Funds</span>
              </button>
              <button
                type="button"
                onClick={() => handleOpenReallocateModal()}
                className="min-h-[38px] px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span>Reallocate</span>
              </button>
            </div>
          </div>

          {/* Compact Category Funds Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {categoryFunds.map((fund) => {
              const isUnallocated = fund.id === 'fund-general-unallocated';
              const targetPct =
                fund.plannedAnnualTarget && fund.plannedAnnualTarget > 0
                  ? Math.min(100, (fund.currentBalance / fund.plannedAnnualTarget) * 100)
                  : fund.percentageOfTotal;

              return (
                <div
                  key={fund.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-3">
                    {/* Top Row: Fund Identity + Balance */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 mt-1"
                          style={{ backgroundColor: fund.color }}
                        />
                        <div className="min-w-0">
                          <h4
                            className="font-bold text-sm text-slate-900 dark:text-white truncate"
                            title={fund.name}
                          >
                            {fund.name}
                          </h4>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {fund.category} &middot; {fund.percentageOfTotal.toFixed(1)}% of capital
                          </p>
                        </div>
                      </div>

                      {!isUnallocated && (
                        <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
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
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                            title="Edit or merge fund"
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
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                            title="Remove fund"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Balance + Target Progress */}
                    <div>
                      <div className="flex items-baseline justify-between gap-2">
                        <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                          {currencySymbol}{formatNumber(fund.currentBalance)}
                        </div>
                        {fund.plannedAnnualTarget && fund.plannedAnnualTarget > 0 ? (
                          <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold">
                            {((fund.currentBalance / fund.plannedAnnualTarget) * 100).toFixed(0)}% of {currencySymbol}{formatNumber(fund.plannedAnnualTarget)}/yr
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            {isUnallocated ? 'Unassigned pool' : 'Open reserve'}
                          </span>
                        )}
                      </div>

                      <div className="mt-1.5 w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(100, Math.max(3, targetPct))}%`,
                            backgroundColor: fund.color,
                          }}
                        />
                      </div>
                    </div>

                    {/* Stored In Accounts (Flat Hairline List — Zero Nested Boxes) */}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>Stored in accounts</span>
                        <span className="font-mono tabular-nums">
                          {fund.transactionCount} {fund.transactionCount === 1 ? 'entry' : 'entries'}
                        </span>
                      </div>

                      {fund.accounts.length > 0 ? (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                          {fund.accounts.map((acc) => (
                            <div
                              key={acc.accountId}
                              className="py-1 flex items-center justify-between gap-2 text-xs"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: acc.accountColor || '#10b981' }}
                                />
                                <span className="text-slate-700 dark:text-slate-300 truncate">
                                  {acc.accountName}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className="font-mono tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                                  {currencySymbol}{formatNumber(acc.amount)}
                                </span>
                                {isUnallocated && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleOpenReallocateModal(
                                        'General Reserves / Starting Capital',
                                        undefined,
                                        acc.accountId,
                                        acc.amount
                                      )
                                    }
                                    className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                                  >
                                    Allocate
                                  </button>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400 italic">No account balance assigned yet</p>
                      )}
                    </div>
                  </div>

                  {/* Card Footer Quick Actions */}
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedFundFilter(fund.name);
                        setActiveTab('transactions');
                      }}
                      className="min-h-[36px] px-2 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      History
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (isUnallocated) {
                          const firstAcc = fund.accounts[0];
                          handleOpenReallocateModal(
                            'General Reserves / Starting Capital',
                            undefined,
                            firstAcc ? firstAcc.accountId : '',
                            firstAcc ? firstAcc.amount : fund.currentBalance
                          );
                        } else {
                          handleOpenReallocateModal('General Reserves / Starting Capital', fund.name);
                        }
                      }}
                      className="min-h-[36px] px-2 py-1 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50/70 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-950 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      {isUnallocated ? 'Allocate' : 'Reallocate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDepositType('manual_deposit');
                        setDepositCategory(isUnallocated ? '' : fund.name);
                        setDepositNote(isUnallocated ? '' : fund.name);
                        handleOpenTransactionModal('deposit');
                      }}
                      className="min-h-[36px] px-2 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg transition-colors whitespace-nowrap cursor-pointer"
                    >
                      + Deposit
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 2: PHYSICAL ACCOUNTS */}
      {activeTab === 'accounts' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white dark:bg-slate-900 px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <span className="font-semibold text-slate-900 dark:text-white">
                Physical Bank &amp; Wallet Accounts ({ledger.accounts.length})
              </span>
              <span className="mx-1.5 text-slate-300 dark:text-slate-700">&middot;</span>
              <span>Manage high-yield banks, e-wallets, MP2, and investment buckets</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsManageAccountsModalOpen(true)}
                className="min-h-[38px] px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer transition-colors border border-slate-200/70 dark:border-slate-700 whitespace-nowrap"
              >
                <Sliders className="w-3.5 h-3.5 shrink-0" />
                <span>Manage</span>
              </button>
              <button
                type="button"
                onClick={handleOpenAddAccount}
                className="min-h-[38px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Add Account</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {ledger.accounts.map((acc) => {
              const share = totalCapital > 0 ? (acc.balance / totalCapital) * 100 : 0;
              const txCount = getAccountTransactionCount(acc.id);

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

              return (
                <div
                  key={acc.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 flex flex-col justify-between gap-3.5 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                >
                  <div className="space-y-3">
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0 mt-1"
                          style={{ backgroundColor: acc.color }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="font-bold text-slate-900 dark:text-white text-sm truncate">
                              {acc.name}
                            </h4>
                            {acc.apy !== undefined && acc.apy > 0 && (
                              <span className="text-[11px] font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400 shrink-0">
                                {acc.apy}% APY
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                            {acc.type}
                            {acc.institution ? ` · ${acc.institution}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 shrink-0 -mr-1 -mt-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditAccount(acc)}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
                          title="Edit Account"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDeleteAccount(acc)}
                          disabled={ledger.accounts.length <= 1}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                          title={ledger.accounts.length <= 1 ? 'Cannot delete the last account' : 'Delete Account'}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Balance & Share */}
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {currencySymbol}{formatNumber(acc.balance)}
                      </div>
                      <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                        {share.toFixed(1)}% of capital &middot; {txCount} {txCount === 1 ? 'entry' : 'entries'}
                      </span>
                    </div>

                    {/* Fund Breakdown Inside This Account */}
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="text-slate-500 dark:text-slate-400">
                          Earmarked: <strong className="font-mono tabular-nums text-slate-800 dark:text-slate-200">{currencySymbol}{formatNumber(allocatedTotal)}</strong>
                        </span>
                        <span className="text-slate-400 font-mono tabular-nums">
                          Unallocated: {currencySymbol}{formatNumber(unallocatedAmt)}
                        </span>
                      </div>

                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
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
                      </div>

                      {allocatedSlices.length > 0 && (
                        <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                          {allocatedSlices.slice(0, 3).map((slice) => (
                            <span key={slice.name} className="inline-flex items-center gap-1 truncate max-w-full">
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{ backgroundColor: slice.color }}
                              />
                              <span className="truncate">{slice.name}:</span>
                              <span className="font-mono tabular-nums font-medium text-slate-800 dark:text-slate-200">
                                {currencySymbol}{formatNumber(slice.amount)}
                              </span>
                            </span>
                          ))}
                          {allocatedSlices.length > 3 && (
                            <span className="text-[10px] text-slate-400">
                              +{allocatedSlices.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenTransactionModal('deposit', acc.id)}
                      className="min-h-[36px] px-2 py-1 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Coins className="w-3 h-3 shrink-0" />
                      <span>Deposit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenTransactionModal('withdraw', acc.id)}
                      className="min-h-[36px] px-2 py-1 bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <ArrowDownRight className="w-3 h-3 shrink-0" />
                      <span>Withdraw</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenTransactionModal('transfer', acc.id)}
                      disabled={ledger.accounts.length <= 1}
                      className="min-h-[36px] px-2 py-1 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg text-[11px] font-semibold flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer disabled:opacity-40"
                    >
                      <ArrowLeftRight className="w-3 h-3 shrink-0" />
                      <span>Transfer</span>
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Quick Add Account Tile */}
            <button
              type="button"
              onClick={handleOpenAddAccount}
              className="border border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-5 flex flex-col items-center justify-center gap-2 text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors cursor-pointer min-h-[160px] bg-slate-50/40 dark:bg-slate-900/40"
            >
              <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold">Add Savings Account</span>
              <span className="text-[11px] text-slate-400">Digital Bank, MP2, E-Wallet, Brokerage</span>
            </button>
          </div>
        </div>
      )}

      {/* TAB 3: SAVINGS LEDGER TRANSACTIONS */}
      {activeTab === 'transactions' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Compact Search & Filter Bar */}
          <div className="p-3.5 sm:p-4 bg-slate-50/60 dark:bg-slate-800/40 border-b border-slate-200 dark:border-slate-800 space-y-3 text-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {/* Quick Type Filter Segment */}
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'inflow', label: 'Inflows' },
                  { id: 'withdrawal', label: 'Withdrawals' },
                  { id: 'transfer', label: 'Transfers & Realloc' },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSelectedSourceFilter(tab.id)}
                    className={`min-h-[34px] px-3 py-1 rounded-lg font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                      selectedSourceFilter === tab.id
                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                Showing {filteredTransactions.length} of {transactions.length} entries
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={txSearchQuery}
                  onChange={(e) => setTxSearchQuery(e.target.value)}
                  placeholder="Search note, account, fund..."
                  className="w-full min-h-[38px] pl-8 pr-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none"
                />
              </div>

              <select
                value={selectedAccountFilter}
                onChange={(e) => setSelectedAccountFilter(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none"
              >
                <option value="all">All Accounts</option>
                {ledger.accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2">
                <select
                  value={selectedFundFilter}
                  onChange={(e) => setSelectedFundFilter(e.target.value)}
                  className="flex-1 min-h-[38px] px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-800 dark:text-slate-200 text-xs outline-none"
                >
                  <option value="all">All Sinking Funds</option>
                  {categoryFunds.map((f) => (
                    <option key={f.id} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>

                {(selectedFundFilter !== 'all' ||
                  selectedAccountFilter !== 'all' ||
                  selectedSourceFilter !== 'all' ||
                  txSearchQuery.trim()) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedFundFilter('all');
                      setSelectedAccountFilter('all');
                      setSelectedSourceFilter('all');
                      setTxSearchQuery('');
                    }}
                    className="min-h-[38px] px-2.5 py-1.5 bg-rose-50 text-rose-600 dark:bg-rose-950/80 dark:text-rose-300 rounded-xl text-xs font-semibold hover:bg-rose-100 whitespace-nowrap cursor-pointer"
                  >
                    Reset
                  </button>
                )}
              </div>
            </div>
          </div>

          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No matching ledger transactions
              </p>
              <p className="text-xs text-slate-400">
                Try clearing your filters or record a new deposit, transfer, or reallocation.
              </p>
            </div>
          ) : (
            <>
              {/* Mobile List Rows (Clean Zero-Pill Typography & 36px+ Touch Targets) */}
              <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTransactions.map((tx) => {
                  const sourceLabel =
                    tx.source === 'budget_sync'
                      ? 'Budget Sync'
                      : tx.source === 'interest_yield'
                      ? 'Yield'
                      : tx.source === 'manual_deposit'
                      ? 'Deposit'
                      : tx.source === 'withdrawal'
                      ? 'Withdraw'
                      : tx.source === 'transfer'
                      ? 'Transfer'
                      : 'Reallocate';

                  const dotColor =
                    tx.source === 'withdrawal'
                      ? 'bg-rose-500'
                      : tx.source === 'transfer' || tx.source === 'reallocation'
                      ? 'bg-indigo-500'
                      : tx.source === 'interest_yield'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500';

                  return (
                    <div
                      key={tx.id}
                      className="p-3.5 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                          {tx.note}
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 truncate">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dotColor}`} />
                          <span className="font-semibold">{sourceLabel}</span>
                          <span>&middot;</span>
                          <span className="truncate">
                            {tx.source === 'transfer' && tx.toAccountName
                              ? `${tx.accountName} → ${tx.toAccountName}`
                              : tx.source === 'reallocation' && tx.toCategory
                              ? `${tx.category || 'Reserves'} → ${tx.toCategory}`
                              : tx.accountName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-mono tabular-nums flex-wrap">
                          <span>{tx.date} ({tx.period})</span>
                          {tx.category && tx.source !== 'reallocation' && (
                            <>
                              <span>&middot;</span>
                              <span className="font-sans font-medium text-emerald-600 dark:text-emerald-400">
                                {tx.category}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <div className="font-mono tabular-nums font-bold text-xs">
                          {tx.source === 'withdrawal' ? (
                            <span className="text-rose-600 dark:text-rose-400">
                              -{currencySymbol}{formatNumber(tx.amount)}
                            </span>
                          ) : tx.source === 'transfer' || tx.source === 'reallocation' ? (
                            <span className="text-indigo-600 dark:text-indigo-400">
                              ⇄ {currencySymbol}{formatNumber(tx.amount)}
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              +{currencySymbol}{formatNumber(tx.amount)}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] font-mono tabular-nums text-slate-400">
                          Bal: {currencySymbol}{formatNumber(tx.runningTotalCapital || 0)}
                        </div>
                        {tx.source !== 'budget_sync' && (
                          <div className="flex items-center gap-1 mt-0.5 -mr-1">
                            {onUpdateTransaction && (
                              <button
                                type="button"
                                onClick={() => handleOpenEditTx(tx)}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="Edit"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onDeleteTransaction && (
                              <button
                                type="button"
                                onClick={() => onDeleteTransaction(tx.id)}
                                className="min-h-[34px] min-w-[34px] flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table View */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Type</th>
                      <th className="py-3 px-4">Account / Envelope</th>
                      <th className="py-3 px-4">Note &amp; Fund</th>
                      <th className="py-3 px-4 text-right">Amount</th>
                      <th className="py-3 px-4 text-right">Running Capital</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredTransactions.map((tx) => {
                      const typeLabel =
                        tx.source === 'budget_sync'
                          ? 'Budget Sync'
                          : tx.source === 'interest_yield'
                          ? 'Yield'
                          : tx.source === 'manual_deposit'
                          ? 'Deposit'
                          : tx.source === 'withdrawal'
                          ? 'Withdrawal'
                          : tx.source === 'transfer'
                          ? 'Transfer'
                          : 'Reallocation';

                      const dotColor =
                        tx.source === 'withdrawal'
                          ? 'bg-rose-500'
                          : tx.source === 'transfer' || tx.source === 'reallocation'
                          ? 'bg-indigo-500'
                          : tx.source === 'interest_yield'
                          ? 'bg-amber-500'
                          : 'bg-emerald-500';

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-4 whitespace-nowrap font-mono tabular-nums text-slate-700 dark:text-slate-300">
                            {tx.date} <span className="text-[10px] text-slate-400">({tx.period})</span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1.5 font-semibold text-slate-700 dark:text-slate-300">
                              <span className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />
                              <span>{typeLabel}</span>
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                            {tx.source === 'transfer' && tx.toAccountName ? (
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span>{tx.accountName}</span>
                                <ArrowRight className="w-3 h-3 text-indigo-500" />
                                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{tx.toAccountName}</span>
                              </span>
                            ) : tx.source === 'reallocation' && tx.toCategory ? (
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span>{tx.category || 'Reserves'}</span>
                                <ArrowRight className="w-3 h-3 text-indigo-500" />
                                <span className="text-indigo-600 dark:text-indigo-400 font-semibold">{tx.toCategory}</span>
                              </span>
                            ) : (
                              tx.accountName
                            )}
                          </td>
                          <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span>{tx.note}</span>
                              {tx.category && tx.source !== 'reallocation' && (
                                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                  &middot; {tx.category}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold whitespace-nowrap">
                            {tx.source === 'withdrawal' ? (
                              <span className="text-rose-600 dark:text-rose-400">
                                -{currencySymbol}{formatNumber(tx.amount)}
                              </span>
                            ) : tx.source === 'transfer' || tx.source === 'reallocation' ? (
                              <span className="text-indigo-600 dark:text-indigo-400">
                                ⇄ {currencySymbol}{formatNumber(tx.amount)}
                              </span>
                            ) : (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{currencySymbol}{formatNumber(tx.amount)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 dark:text-white whitespace-nowrap">
                            {currencySymbol}{formatNumber(tx.runningTotalCapital || 0)}
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {tx.source !== 'budget_sync' ? (
                              <div className="flex items-center justify-center gap-1">
                                {onUpdateTransaction && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenEditTx(tx)}
                                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors cursor-pointer"
                                    title="Edit transaction"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                                {onDeleteTransaction && (
                                  <button
                                    type="button"
                                    onClick={() => onDeleteTransaction(tx.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
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
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB 4: COMPOUND PROJECTOR */}
      {activeTab === 'calculator' && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center gap-2 mb-1">
            <Calculator className="w-4 h-4 text-emerald-600" />
            <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
              Compound Growth Projector
            </h3>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
            Project long-term growth starting from your current capital of {currencySymbol}{formatNumber(totalCapital)}.
          </p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4 text-xs">
              <div>
                <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Monthly Contribution</span>
                  <span className="font-mono tabular-nums text-emerald-600">
                    {currencySymbol}{formatNumber(simMonthly)}/mo
                  </span>
                </div>
                <input
                  type="range"
                  min="100"
                  max="50000"
                  step="100"
                  value={simMonthly}
                  onChange={(e) => setSimMonthly(parseFloat(e.target.value))}
                  className="w-full accent-emerald-600"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Expected Annual Return (APY)</span>
                  <span className="font-mono tabular-nums text-indigo-600">{simRate}%</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  step="0.5"
                  value={simRate}
                  onChange={(e) => setSimRate(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600"
                />
              </div>

              <div>
                <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                  <span>Time Horizon</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white">{simYears} Years</span>
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

            <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 flex flex-col justify-between gap-4">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Projected Value in {simYears} Years
                </span>
                <div className="text-2xl sm:text-3xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-1">
                  {currencySymbol}{formatNumber(compoundResult.futureVal)}
                </div>
              </div>

              <div className="space-y-1.5 pt-3 border-t border-slate-200 dark:border-slate-700 text-xs">
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Starting Capital</span>
                  <span className="font-mono tabular-nums font-medium">{currencySymbol}{formatNumber(totalCapital)}</span>
                </div>
                <div className="flex justify-between text-slate-600 dark:text-slate-300">
                  <span>Total Principal Contributed</span>
                  <span className="font-mono tabular-nums font-medium">{currencySymbol}{formatNumber(compoundResult.contributed)}</span>
                </div>
                <div className="flex justify-between text-indigo-600 dark:text-indigo-400 font-bold">
                  <span>Compound Yield Earned</span>
                  <span className="font-mono tabular-nums">+{currencySymbol}{formatNumber(compoundResult.interestEarned)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Unified Transaction Modal (Deposit, Withdraw, Transfer) */}
      {isTransactionModalOpen && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {transactionMode === 'deposit' && 'Record Deposit or Yield'}
                  {transactionMode === 'withdraw' && 'Withdraw from Savings'}
                  {transactionMode === 'transfer' && 'Transfer Between Accounts'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {transactionMode === 'deposit' && 'Add funds or interest yield to an account & fund'}
                  {transactionMode === 'withdraw' && 'Record an outflow from your savings reserves'}
                  {transactionMode === 'transfer' && 'Move balance between physical bank accounts'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsTransactionModalOpen(false)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl mt-2.5 sm:mt-3 text-xs font-semibold">
              <button
                type="button"
                onClick={() => setTransactionMode('deposit')}
                className={`h-8 sm:h-9 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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
                className={`h-8 sm:h-9 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
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
                className={`h-8 sm:h-9 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  transactionMode === 'transfer'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Transfer</span>
              </button>
            </div>

            {/* DEPOSIT / YIELD FORM */}
            {transactionMode === 'deposit' && (
              <form onSubmit={handleRecordDeposit} className="mt-3 space-y-2.5 sm:space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDepositType('manual_deposit')}
                    className={`h-8 sm:h-9 px-3 rounded-xl font-semibold border transition-all cursor-pointer ${
                      depositType === 'manual_deposit'
                        ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Direct Deposit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDepositType('interest_yield')}
                    className={`h-8 sm:h-9 px-3 rounded-xl font-semibold border transition-all cursor-pointer ${
                      depositType === 'interest_yield'
                        ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-400 text-amber-700 dark:text-amber-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    Interest / Yield
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                        <span className="sm:hidden">Account</span>
                        <span className="hidden sm:inline">Destination Account</span>
                      </label>
                    </div>
                    <select
                      value={depositAccountId}
                      onChange={(e) => setDepositAccountId(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                    >
                      {ledger.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Amount ({currencySymbol})</label>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      placeholder="0.00"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                      Target Sinking Fund / Envelope
                    </label>
                  </div>
                  <select
                    value={depositCategory}
                    onChange={(e) => setDepositCategory(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  >
                    {depositType === 'interest_yield' ? (
                      <option value="">Compounding Yields &amp; Dividend (Default)</option>
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
                            ? ` (${currencySymbol}${formatNumber(matchingFund.currentBalance)})`
                            : ''}
                        </option>
                      );
                    })}
                    <option value="__custom__">+ Create New Sinking Fund...</option>
                  </select>
                  {depositCategory === '__custom__' && (
                    <input
                      type="text"
                      required
                      placeholder="Enter new fund name (e.g. Emergency Fund, MP2)"
                      value={depositCustomCategory}
                      onChange={(e) => setDepositCustomCategory(e.target.value)}
                      className="mt-2 w-full min-w-0 h-8 sm:h-9 px-2.5 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Date</label>
                    </div>
                    <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <input
                        type="date"
                        required
                        value={depositDate}
                        onChange={(e) => setDepositDate(e.target.value)}
                        className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-[11px] sm:text-xs font-mono text-slate-900 dark:text-white outline-none appearance-none"
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Memo (Optional)</label>
                    </div>
                    <input
                      type="text"
                      placeholder="Interest, bonus..."
                      value={depositNote}
                      onChange={(e) => setDepositNote(e.target.value)}
                      className="block w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-8 sm:h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Coins className="w-3.5 h-3.5" />
                    <span>Save Deposit</span>
                  </button>
                </div>
              </form>
            )}

            {/* WITHDRAWAL FORM */}
            {transactionMode === 'withdraw' && (
              <form onSubmit={handleRecordWithdrawal} className="mt-3 space-y-2.5 sm:space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">From Account</label>
                    </div>
                    <select
                      value={withdrawAccountId}
                      onChange={(e) => setWithdrawAccountId(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                    >
                      {ledger.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Amount ({currencySymbol})</label>
                      {(() => {
                        const selAcc = ledger.accounts.find((a) => a.id === withdrawAccountId) || ledger.accounts[0];
                        if (!selAcc || selAcc.balance <= 0) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => setWithdrawAmount(selAcc.balance.toString())}
                            className="text-[10px] text-rose-600 dark:text-rose-400 hover:underline font-semibold cursor-pointer shrink-0 leading-none"
                          >
                            Max
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
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                    />
                  </div>
                </div>

                {(() => {
                  const selAcc = ledger.accounts.find((a) => a.id === withdrawAccountId) || ledger.accounts[0];
                  const wAmt = parseFloat(withdrawAmount) || 0;
                  if (!selAcc || wAmt <= selAcc.balance) return null;
                  return (
                    <div className="p-2 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-xl text-amber-800 dark:text-amber-200 text-[11px] flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
                      <span>
                        Exceeds balance ({currencySymbol}{formatNumber(selAcc.balance)}).
                      </span>
                    </div>
                  );
                })()}

                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Fund / Reason</label>
                    </div>
                    <select
                      value={withdrawCategory}
                      onChange={(e) => setWithdrawCategory(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
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

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Date</label>
                    </div>
                    <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <input
                        type="date"
                        required
                        value={withdrawDate}
                        onChange={(e) => setWithdrawDate(e.target.value)}
                        className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-[11px] sm:text-xs font-mono text-slate-900 dark:text-white outline-none appearance-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Memo (Optional)</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Emergency expense or bill settlement"
                    value={withdrawNote}
                    onChange={(e) => setWithdrawNote(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-8 sm:h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ArrowDownRight className="w-3.5 h-3.5" />
                    <span>Confirm Withdrawal</span>
                  </button>
                </div>
              </form>
            )}

            {/* TRANSFER BETWEEN ACCOUNTS FORM */}
            {transactionMode === 'transfer' && (
              <form onSubmit={handleRecordTransfer} className="mt-3 space-y-2.5 sm:space-y-3">
                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">From Account</label>
                    </div>
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
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                    >
                      {ledger.accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">To Account</label>
                    </div>
                    <select
                      value={transferToAccountId}
                      onChange={(e) => setTransferToAccountId(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
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

                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between gap-1 h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Amount ({currencySymbol})</label>
                      {(() => {
                        const fromAcc = ledger.accounts.find((a) => a.id === transferFromAccountId) || ledger.accounts[0];
                        if (!fromAcc || fromAcc.balance <= 0) return null;
                        return (
                          <button
                            type="button"
                            onClick={() => setTransferAmount(fromAcc.balance.toString())}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer shrink-0 leading-none"
                          >
                            Max
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
                      value={transferAmount}
                      onChange={(e) => setTransferAmount(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Date</label>
                    </div>
                    <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                      <input
                        type="date"
                        required
                        value={transferDate}
                        onChange={(e) => setTransferDate(e.target.value)}
                        className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-[11px] sm:text-xs font-mono text-slate-900 dark:text-white outline-none appearance-none"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">Memo (Optional)</label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Move to higher APY digital bank"
                    value={transferNote}
                    onChange={(e) => setTransferNote(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsTransactionModalOpen(false)}
                    className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-8 sm:h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
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
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Manage Savings Accounts
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Rename, configure APY, or remove accounts
                </p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenAddAccount}
                  className="h-8 px-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsManageAccountsModalOpen(false)}
                  className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto my-2.5 divide-y divide-slate-100 dark:divide-slate-800">
              {ledger.accounts.map((acc) => {
                const txCount = getAccountTransactionCount(acc.id);
                return (
                  <div
                    key={acc.id}
                    className="py-2.5 flex items-center justify-between gap-2.5"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ backgroundColor: acc.color }}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-slate-900 dark:text-white text-xs sm:text-sm truncate">
                            {acc.name}
                          </span>
                          {acc.apy !== undefined && acc.apy > 0 && (
                            <span className="text-[10px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                              {acc.apy}% APY
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] sm:text-[11px] text-slate-400 truncate">
                          {acc.type}
                          {acc.institution ? ` · ${acc.institution}` : ''} &middot; {txCount} entries
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono tabular-nums font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                        {currencySymbol}{formatNumber(acc.balance)}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenEditAccount(acc)}
                        className="p-1.5 flex items-center justify-center text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDeleteAccount(acc)}
                        disabled={ledger.accounts.length <= 1}
                        className="p-1.5 flex items-center justify-center text-slate-400 hover:text-rose-600 rounded-lg cursor-pointer disabled:opacity-25 disabled:cursor-not-allowed"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-slate-400 text-xs">
                {ledger.accounts.length} active accounts
              </span>
              <button
                type="button"
                onClick={() => setIsManageAccountsModalOpen(false)}
                className="h-8 sm:h-9 px-4 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Add Account */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 m-0 z-[70] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Add Savings Account
              </h3>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="mt-3 space-y-2.5 sm:space-y-3">
              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold">
                    Account Name <span className="text-rose-500">*</span>
                  </label>
                </div>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maya Savings, Pag-IBIG MP2, SeaBank"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Category
                    </label>
                  </div>
                  <select
                    value={accType}
                    onChange={(e) => setAccType(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  >
                    {ACCOUNT_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Institution (Optional)
                    </label>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Maya Bank, BPI"
                    value={accInstitution}
                    onChange={(e) => setAccInstitution(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Opening Balance ({currencySymbol})
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={accBalance}
                    onChange={(e) => setAccBalance(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Est. APY %
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="4.5"
                    value={accApy}
                    onChange={(e) => setAccApy(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                  Color Tag
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAccColor(c)}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        accColor === c ? 'scale-110 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {accColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2.5 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 sm:h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
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
        <div className="fixed inset-0 m-0 z-[70] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Edit Account
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsEditAccountModalOpen(false);
                  setEditingAccount(null);
                }}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAccount} className="mt-3 space-y-2.5 sm:space-y-3">
              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold">
                    Account Name <span className="text-rose-500">*</span>
                  </label>
                </div>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Category
                    </label>
                  </div>
                  <select
                    value={editType}
                    onChange={(e) => setEditType(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  >
                    {Array.from(new Set([...ACCOUNT_CATEGORIES, ...(editType ? [editType] : [])])).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Institution
                    </label>
                  </div>
                  <input
                    type="text"
                    value={editInstitution}
                    onChange={(e) => setEditInstitution(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Current Balance ({currencySymbol})
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Est. APY %
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={editApy}
                    onChange={(e) => setEditApy(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1.5">
                  Color Tag
                </label>
                <div className="flex items-center gap-2 flex-wrap">
                  {ACCOUNT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                        editColor === c ? 'scale-110 ring-2 ring-emerald-500 ring-offset-2 dark:ring-offset-slate-900' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    >
                      {editColor === c && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2.5 flex justify-between items-center border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditAccountModalOpen(false);
                    handleOpenDeleteAccount(editingAccount);
                  }}
                  disabled={ledger.accounts.length <= 1}
                  className="h-8 sm:h-9 px-2 text-rose-600 hover:text-rose-700 dark:text-rose-400 font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditAccountModalOpen(false);
                      setEditingAccount(null);
                    }}
                    className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="h-8 sm:h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
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
        <div className="fixed inset-0 m-0 z-[80] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm sm:text-base">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <h3>Delete Savings Account</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteAccountModalOpen(false);
                  setDeletingAccount(null);
                }}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-slate-700 dark:text-slate-300">
                Delete <strong>&quot;{deletingAccount.name}&quot;</strong> ({currencySymbol}{formatNumber(deletingAccount.balance)})?
              </p>

              <div>
                <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                  Transfer Balance &amp; History To:
                </label>
                <select
                  value={reassignAccountId}
                  onChange={(e) => setReassignAccountId(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                >
                  {ledger.accounts
                    .filter((a) => a.id !== deletingAccount.id)
                    .map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                      </option>
                    ))}
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteAccountModalOpen(false);
                    setDeletingAccount(null);
                  }}
                  className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteAccount}
                  className="h-8 sm:h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Account</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reallocate Category Funds */}
      {isReallocateModalOpen && (
        <div className="fixed inset-0 m-0 z-[80] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Reallocate Category Funds
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Move virtual fund envelopes without changing bank balances
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsReallocateModalOpen(false)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <form onSubmit={handleRecordReallocation} className="mt-3 space-y-2.5 sm:space-y-3">
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                      From Fund (Source)
                    </label>
                  </div>
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
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
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

                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                      To Fund (Target)
                    </label>
                  </div>
                  <select
                    value={reallocateToCategory}
                    onChange={(e) => setReallocateToCategory(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  >
                    <option value="">-- Select Target --</option>
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
                          {cat}
                        </option>
                      ))}
                    <option value="__custom__">+ New Fund...</option>
                  </select>
                </div>
              </div>

              {reallocateToCategory === '__custom__' && (
                <input
                  type="text"
                  required
                  placeholder="Enter new fund name (e.g. House Downpayment)"
                  value={reallocateCustomCategory}
                  onChange={(e) => setReallocateCustomCategory(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                />
              )}

              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                    Physical Account Holding This Fund
                  </label>
                </div>
                <select
                  value={reallocateAccountId}
                  onChange={(e) => {
                    const nextAccId = e.target.value;
                    setReallocateAccountId(nextAccId);
                    if (
                      nextAccId &&
                      reallocateFromCategory.trim().toLowerCase() === 'general reserves / starting capital'
                    ) {
                      const accUnalloc = unallocatedFund?.accounts.find((a) => a.accountId === nextAccId);
                      if (accUnalloc && accUnalloc.amount > 0) {
                        setReallocateAmount(String(accUnalloc.amount));
                      }
                    }
                  }}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                >
                  <option value="">All / Unspecified Account</option>
                  {ledger.accounts.map((acc) => {
                    const accUnalloc = unallocatedFund?.accounts.find((a) => a.accountId === acc.id)?.amount || 0;
                    const isFromUnallocated =
                      reallocateFromCategory.trim().toLowerCase() === 'general reserves / starting capital';
                    return (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({currencySymbol}{formatNumber(acc.balance)}
                        {isFromUnallocated ? ` · Unallocated: ${currencySymbol}${formatNumber(accUnalloc)}` : ''})
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between gap-1 h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
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
                          className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer shrink-0 leading-none"
                        >
                          Max
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
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                      Date
                    </label>
                  </div>
                  <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <input
                      type="date"
                      required
                      value={reallocateDate}
                      onChange={(e) => setReallocateDate(e.target.value)}
                      className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-[11px] sm:text-xs font-mono text-slate-900 dark:text-white outline-none appearance-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                    Note (Optional)
                  </label>
                </div>
                <input
                  type="text"
                  placeholder="e.g. Earmark opening balance for Emergency Fund"
                  value={reallocateNote}
                  onChange={(e) => setReallocateNote(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsReallocateModalOpen(false)}
                  className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
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
                  className="h-8 sm:h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
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
        <div className="fixed inset-0 m-0 z-[80] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                Edit Ledger Entry
              </h3>
              <button
                type="button"
                onClick={() => setEditingTx(null)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEditTx} className="mt-3 space-y-2.5 sm:space-y-3">
              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-600 dark:text-slate-300 font-semibold">
                    Account
                  </label>
                </div>
                <select
                  value={editTxAccountId}
                  onChange={(e) => setEditTxAccountId(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
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
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold">
                      Sinking Fund / Envelope
                    </label>
                  </div>
                  <select
                    value={editTxCategory}
                    onChange={(e) => setEditTxCategory(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
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
                    <option value="__custom__">+ Create New Sinking Fund...</option>
                  </select>
                  {editTxCategory === '__custom__' && (
                    <input
                      type="text"
                      required
                      placeholder="Enter new fund name..."
                      value={editTxCustomCategory}
                      onChange={(e) => setEditTxCustomCategory(e.target.value)}
                      className="mt-2 w-full h-8 sm:h-9 px-2.5 bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                    />
                  )}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                      Amount ({currencySymbol})
                    </label>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={editTxAmount}
                    onChange={(e) => setEditTxAmount(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-xs sm:text-sm text-slate-900 dark:text-white outline-none"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-600 dark:text-slate-300 font-semibold truncate">
                      Date
                    </label>
                  </div>
                  <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden">
                    <input
                      type="date"
                      required
                      value={editTxDate}
                      onChange={(e) => setEditTxDate(e.target.value)}
                      className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-[11px] sm:text-xs font-mono text-slate-900 dark:text-white outline-none appearance-none"
                    />
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-600 dark:text-slate-300 font-semibold">
                    Note
                  </label>
                </div>
                <input
                  type="text"
                  value={editTxNote}
                  onChange={(e) => setEditTxNote(e.target.value)}
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingTx(null)}
                  className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 sm:h-9 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
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
        <div className="fixed inset-0 m-0 z-[75] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Manage Sinking Funds
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Rename, merge redundant funds, or adjust monthly targets
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsManageFundsModalOpen(false)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto my-2.5 divide-y divide-slate-100 dark:divide-slate-800">
              {categoryFunds.filter((f) => f.id !== 'fund-general-unallocated').length === 0 ? (
                <div className="p-6 text-center text-slate-400">
                  No named sinking funds yet. Allocate or deposit into a fund to create one.
                </div>
              ) : (
                categoryFunds
                  .filter((f) => f.id !== 'fund-general-unallocated')
                  .map((fund) => (
                    <div
                      key={fund.id}
                      className="py-2.5 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: fund.color }}
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                            {fund.name}
                          </div>
                          <div className="text-[10px] sm:text-[11px] text-slate-400 truncate font-mono tabular-nums">
                            {currencySymbol}{formatNumber(fund.currentBalance)}
                            {fund.plannedAnnualTarget && fund.plannedAnnualTarget > 0
                              ? ` · Target: ${currencySymbol}${formatNumber(fund.plannedAnnualTarget)}/yr`
                              : ' · Open Reserve'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
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
                          className="h-8 px-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 rounded-lg font-semibold flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>Edit</span>
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
                          className="p-1.5 flex items-center justify-center text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg cursor-pointer transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))
              )}
            </div>

            <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setIsManageFundsModalOpen(false)}
                className="h-8 sm:h-9 px-4 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 font-semibold rounded-xl cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Edit / Rename / Merge Sinking Fund */}
      {editingFund && (
        <div className="fixed inset-0 m-0 z-[85] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  Edit or Merge Fund
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Configure &quot;{editingFund.name}&quot;
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingFund(null)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
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
              className="mt-3 space-y-2.5 sm:space-y-3"
            >
              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                    Merge Into Existing Fund (Optional)
                  </label>
                </div>
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
                  className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                >
                  <option value="">-- Keep Separate (Rename Only) --</option>
                  {categoryFunds
                    .filter((f) => f.id !== 'fund-general-unallocated' && f.id !== editingFund.id)
                    .map((f) => (
                      <option key={f.id} value={f.name}>
                        Merge into &quot;{f.name}&quot; ({currencySymbol}{formatNumber(f.currentBalance)})
                      </option>
                    ))}
                </select>
              </div>

              {!editFundMergeTarget && (
                <div>
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold">
                      Fund Name <span className="text-rose-500">*</span>
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    value={editFundName}
                    onChange={(e) => setEditFundName(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Category Group
                    </label>
                  </div>
                  <select
                    value={editFundCategory}
                    onChange={(e) => setEditFundCategory(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none"
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
                </div>

                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-slate-700 dark:text-slate-300 font-semibold truncate">
                      Target ({currencySymbol}/mo)
                    </label>
                  </div>
                  <input
                    type="number"
                    step="100"
                    min="0"
                    value={editFundMonthlyTarget}
                    onChange={(e) => setEditFundMonthlyTarget(e.target.value)}
                    placeholder="0"
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono tabular-nums text-slate-900 dark:text-white outline-none"
                  />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">
                Annual Target: <strong>{currencySymbol}{formatNumber((parseFloat(editFundMonthlyTarget) || 0) * 12)}/yr</strong>
              </p>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setEditingFund(null)}
                  className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 sm:h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs"
                >
                  {editFundMergeTarget ? 'Merge Fund' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Delete / Remove Sinking Fund */}
      {deletingFund && (
        <div className="fixed inset-0 m-0 z-[85] flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2 text-rose-600 dark:text-rose-400 font-bold text-sm sm:text-base">
                <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0" />
                <h3>Remove Sinking Fund</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeletingFund(null)}
                className="p-1.5 flex items-center justify-center text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <p className="text-slate-700 dark:text-slate-300">
                Remove <strong>&quot;{deletingFund.name}&quot;</strong> ({currencySymbol}{formatNumber(deletingFund.currentBalance)})?
              </p>

              {(deletingFund.currentBalance > 0 || deletingFund.transactionCount > 0) && (
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-semibold mb-1">
                    Reassign Balance &amp; Entries To:
                  </label>
                  <select
                    value={deleteFundReassignTo}
                    onChange={(e) => setDeleteFundReassignTo(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none"
                  >
                    <option value="General Reserves / Starting Capital">
                      General Reserves / Starting Capital (Unallocated)
                    </option>
                    {categoryFunds
                      .filter((f) => f.id !== 'fund-general-unallocated' && f.id !== deletingFund.id)
                      .map((f) => (
                        <option key={f.id} value={f.name}>
                          {f.name} ({currencySymbol}{formatNumber(f.currentBalance)})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setDeletingFund(null)}
                  className="h-8 sm:h-9 px-3.5 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
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
                  className="h-8 sm:h-9 px-4 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl cursor-pointer shadow-xs flex items-center gap-1.5"
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
