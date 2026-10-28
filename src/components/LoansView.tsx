import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  CheckCircle2,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Edit3,
  Trash2,
  Receipt,
  History,
  Link2,
  X,
  ChevronDown,
  ChevronUp,
  Landmark,
  Wallet,
  Scale,
  FileSpreadsheet,
} from 'lucide-react';
import {
  LoanRecord,
  LoanDirection,
  YearBudgetData,
  SavingsLedgerData,
  BudgetItemTemplate,
  BudgetEntry,
  SavingsTransaction,
} from '../types/finance';

interface LoansViewProps {
  ledger: SavingsLedgerData;
  budget: YearBudgetData;
  onSaveLoan: (
    loan: LoanRecord,
    options?: {
      syncToTemplate?: boolean;
      disburseFromAccountId?: string;
    }
  ) => void;
  onDeleteLoan: (loanId: string) => void;
  onRecordLoanPayment: (
    loanId: string,
    paymentData: {
      amount: number;
      date: string;
      note: string;
      recordInBudget?: boolean;
      depositToAccountId?: string;
    }
  ) => void;
  onDeleteLoanPayment: (loanId: string, paymentId: string) => void;
  onLinkLoanToTemplate: (loan: LoanRecord) => void;
  currencySymbol?: string;
}

const BORROWED_CATEGORIES = [
  'Government Loan (SSS / Pag-IBIG)',
  'Credit Card Installment',
  'Auto / Vehicle Loan',
  'Housing / Mortgage',
  'Personal / Cash Loan',
  'Gadget / Appliance Installment',
  'Other Payable',
];

const LENT_CATEGORIES = [
  'Personal Receivable (Family / Friend)',
  'Cash Advance / Employee Loan',
  'Shared Expense / Split Receivable',
  'Business / Project Receivable',
  'Other Receivable',
];

export const LoansView: React.FC<LoansViewProps> = ({
  ledger,
  budget,
  onSaveLoan,
  onDeleteLoan,
  onRecordLoanPayment,
  onDeleteLoanPayment,
  onLinkLoanToTemplate,
  currencySymbol = '₱',
}) => {
  const loans = useMemo(() => ledger.loans || [], [ledger.loans]);

  const [filterTab, setFilterTab] = useState<'all_active' | 'borrowed' | 'lent' | 'completed'>('all_active');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedHistoryIds, setExpandedHistoryIds] = useState<Record<string, boolean>>({});

  // Add / Edit Loan Modal State
  const [isLoanModalOpen, setIsLoanModalOpen] = useState(false);
  const [editingLoan, setEditingLoan] = useState<LoanRecord | null>(null);
  const [formDirection, setFormDirection] = useState<LoanDirection>('borrowed');
  const [formName, setFormName] = useState('');
  const [formCounterparty, setFormCounterparty] = useState('');
  const [formCategory, setFormCategory] = useState(BORROWED_CATEGORIES[0]);
  const [formPrincipal, setFormPrincipal] = useState('');
  const [formInstallmentAmount, setFormInstallmentAmount] = useState('');
  const [formTotalInstallments, setFormTotalInstallments] = useState('12');
  const [formTotalContract, setFormTotalContract] = useState('');
  const [formFrequency, setFormFrequency] = useState<'monthly' | 'bi-weekly'>('monthly');
  const [formBiweeklyPeriod, setFormBiweeklyPeriod] = useState<'P1' | 'P2' | 'both'>('both');
  const [formInitialTermsPaid, setFormInitialTermsPaid] = useState('0');
  const [formInitialAmountPaid, setFormInitialAmountPaid] = useState('0');
  const [formStartDate, setFormStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [formDueDay, setFormDueDay] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formSyncTemplate, setFormSyncTemplate] = useState(true);
  const [formDisburseAccountId, setFormDisburseAccountId] = useState('');

  // Record Payment / Collection Modal State
  const [paymentModalLoan, setPaymentModalLoan] = useState<LoanRecord | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payNote, setPayNote] = useState('');
  const [payRecordInBudget, setPayRecordInBudget] = useState(true);
  const [payDepositAccountId, setPayDepositAccountId] = useState('');

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);

  // Helper to compute derived loan metrics
  const getLoanMetrics = (loan: LoanRecord) => {
    const paymentsSum = (loan.payments || []).reduce((sum, p) => sum + (p.amount || 0), 0);
    const totalPaid = (loan.initialPaidAmount || 0) + paymentsSum;
    const totalContract = loan.totalContractAmount || 0;
    const remainingBalance = Math.max(0, totalContract - totalPaid);
    const progressPct = totalContract > 0 ? Math.min(100, (totalPaid / totalContract) * 100) : 0;

    // Installment count math
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
    const isCompleted = loan.status === 'completed' || (totalContract > 0 && remainingBalance <= 0.005);

    // Monthly commitment normalization
    const monthlyCommitment =
      isCompleted
        ? 0
        : loan.frequency === 'bi-weekly'
        ? loan.biweeklyPeriod === 'both'
          ? (loan.installmentAmount || 0) * 2
          : loan.installmentAmount || 0
        : loan.installmentAmount || 0;

    // Check if linked to an active template
    const targetTplType = loan.direction === 'borrowed' ? 'expense' : 'income';
    const hasLinkedTemplate = Boolean(
      (budget.itemTemplates || []).some(
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
  };

  // Summary KPIs across all loans
  const summaryStats = useMemo(() => {
    let borrowedRemaining = 0;
    let borrowedPaid = 0;
    let borrowedContract = 0;
    let borrowedMonthlyCommitment = 0;
    let activeBorrowedCount = 0;

    let lentRemaining = 0;
    let lentCollected = 0;
    let lentContract = 0;
    let lentMonthlyExpected = 0;
    let activeLentCount = 0;

    let completedCount = 0;

    loans.forEach((ln) => {
      const m = getLoanMetrics(ln);
      if (m.isCompleted) {
        completedCount += 1;
      }
      if (ln.direction === 'borrowed') {
        borrowedPaid += m.totalPaid;
        borrowedContract += m.totalContract;
        if (!m.isCompleted) {
          borrowedRemaining += m.remainingBalance;
          borrowedMonthlyCommitment += m.monthlyCommitment;
          activeBorrowedCount += 1;
        }
      } else {
        lentCollected += m.totalPaid;
        lentContract += m.totalContract;
        if (!m.isCompleted) {
          lentRemaining += m.remainingBalance;
          lentMonthlyExpected += m.monthlyCommitment;
          activeLentCount += 1;
        }
      }
    });

    const netLoanPosition = lentRemaining - borrowedRemaining;
    const totalAllContract = borrowedContract + lentContract;
    const totalAllPaid = borrowedPaid + lentCollected;
    const overallProgress = totalAllContract > 0 ? (totalAllPaid / totalAllContract) * 100 : 0;

    return {
      borrowedRemaining,
      borrowedPaid,
      borrowedContract,
      borrowedMonthlyCommitment,
      activeBorrowedCount,
      lentRemaining,
      lentCollected,
      lentContract,
      lentMonthlyExpected,
      activeLentCount,
      completedCount,
      netLoanPosition,
      totalAllPaid,
      overallProgress,
    };
  }, [loans, budget.itemTemplates]);

  // Filtered loans
  const filteredLoans = useMemo(() => {
    return loans
      .filter((ln) => {
        const m = getLoanMetrics(ln);
        if (filterTab === 'all_active' && m.isCompleted) return false;
        if (filterTab === 'borrowed' && (ln.direction !== 'borrowed' || m.isCompleted)) return false;
        if (filterTab === 'lent' && (ln.direction !== 'lent' || m.isCompleted)) return false;
        if (filterTab === 'completed' && !m.isCompleted) return false;

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchName = ln.name.toLowerCase().includes(q);
          const matchCounterparty = (ln.counterparty || '').toLowerCase().includes(q);
          const matchCat = (ln.category || '').toLowerCase().includes(q);
          return matchName || matchCounterparty || matchCat;
        }
        return true;
      })
      .sort((a, b) => {
        const ma = getLoanMetrics(a);
        const mb = getLoanMetrics(b);
        return mb.remainingBalance - ma.remainingBalance;
      });
  }, [loans, filterTab, searchQuery, budget.itemTemplates]);

  // Open Add Loan Modal
  const handleOpenAddModal = (defaultDir: LoanDirection = 'borrowed') => {
    setEditingLoan(null);
    setFormDirection(defaultDir);
    setFormName('');
    setFormCounterparty('');
    setFormCategory(defaultDir === 'borrowed' ? BORROWED_CATEGORIES[0] : LENT_CATEGORIES[0]);
    setFormPrincipal('');
    setFormInstallmentAmount('');
    setFormTotalInstallments('12');
    setFormTotalContract('');
    setFormFrequency('monthly');
    setFormBiweeklyPeriod('both');
    setFormInitialTermsPaid('0');
    setFormInitialAmountPaid('0');
    setFormStartDate(new Date().toISOString().split('T')[0]);
    setFormDueDay('');
    setFormNotes('');
    setFormSyncTemplate(defaultDir === 'borrowed');
    setFormDisburseAccountId('');
    setIsLoanModalOpen(true);
  };

  // Open Edit Loan Modal
  const handleOpenEditModal = (loan: LoanRecord) => {
    setEditingLoan(loan);
    setFormDirection(loan.direction);
    setFormName(loan.name);
    setFormCounterparty(loan.counterparty || '');
    setFormCategory(loan.category || (loan.direction === 'borrowed' ? BORROWED_CATEGORIES[0] : LENT_CATEGORIES[0]));
    setFormPrincipal(String(loan.principalAmount || ''));
    setFormInstallmentAmount(String(loan.installmentAmount || ''));
    setFormTotalInstallments(String(loan.totalInstallments || '12'));
    setFormTotalContract(String(loan.totalContractAmount || ''));
    setFormFrequency(loan.frequency || 'monthly');
    setFormBiweeklyPeriod(loan.biweeklyPeriod || 'both');
    setFormInitialTermsPaid(String(loan.initialInstallmentsPaid || 0));
    setFormInitialAmountPaid(String(loan.initialPaidAmount || 0));
    setFormStartDate(loan.startDate || new Date().toISOString().split('T')[0]);
    setFormDueDay(loan.dueDay || '');
    setFormNotes(loan.notes || '');
    setFormSyncTemplate(false);
    setIsLoanModalOpen(true);
  };

  // Auto-compute Total Contract Amount when Fixed Installment or Total Installments changes
  const handleInstallmentOrTermsChange = (newInstallmentStr: string, newTermsStr: string) => {
    setFormInstallmentAmount(newInstallmentStr);
    setFormTotalInstallments(newTermsStr);

    const inst = parseFloat(newInstallmentStr);
    const terms = parseInt(newTermsStr, 10);
    if (!isNaN(inst) && inst > 0 && !isNaN(terms) && terms > 0) {
      setFormTotalContract(String(Math.round(inst * terms * 100) / 100));
      const initTerms = parseInt(formInitialTermsPaid, 10);
      if (!isNaN(initTerms) && initTerms >= 0) {
        setFormInitialAmountPaid(String(Math.round(inst * initTerms * 100) / 100));
      }
    }
  };

  const handleInitialTermsChange = (newInitTermsStr: string) => {
    setFormInitialTermsPaid(newInitTermsStr);
    const initTerms = parseInt(newInitTermsStr, 10);
    const inst = parseFloat(formInstallmentAmount);
    if (!isNaN(initTerms) && initTerms >= 0 && !isNaN(inst) && inst > 0) {
      setFormInitialAmountPaid(String(Math.round(initTerms * inst * 100) / 100));
    }
  };

  const handleSubmitLoanForm = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = formName.trim();
    if (!cleanName) return;

    const instAmt = Math.max(0, parseFloat(formInstallmentAmount) || 0);
    const totalTerms = Math.max(1, parseInt(formTotalInstallments, 10) || 1);
    const totalContract = Math.max(
      0,
      parseFloat(formTotalContract) || Math.round(instAmt * totalTerms * 100) / 100
    );
    const principal = Math.max(0, parseFloat(formPrincipal) || totalContract);
    const initialPaid = Math.max(0, parseFloat(formInitialAmountPaid) || 0);
    const initialTerms = Math.max(0, parseInt(formInitialTermsPaid, 10) || 0);

    const existingPayments = editingLoan ? editingLoan.payments || [] : [];
    const paymentsSum = existingPayments.reduce((s, p) => s + (p.amount || 0), 0);
    const isCompleted = totalContract > 0 && initialPaid + paymentsSum + 0.005 >= totalContract;

    const nowIso = new Date().toISOString();
    const savedLoan: LoanRecord = {
      id: editingLoan ? editingLoan.id : `loan-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      name: cleanName,
      direction: formDirection,
      category: formCategory.trim() || (formDirection === 'borrowed' ? 'Other Payable' : 'Other Receivable'),
      counterparty: formCounterparty.trim() || undefined,
      principalAmount: principal,
      totalContractAmount: totalContract,
      installmentAmount: instAmt,
      totalInstallments: totalTerms,
      frequency: formFrequency,
      biweeklyPeriod: formFrequency === 'bi-weekly' ? formBiweeklyPeriod : 'both',
      initialPaidAmount: initialPaid,
      initialInstallmentsPaid: initialTerms,
      startDate: formStartDate || nowIso.split('T')[0],
      dueDay: formDueDay.trim() || undefined,
      status: isCompleted ? 'completed' : 'active',
      linkedTemplateId: editingLoan?.linkedTemplateId,
      payments: existingPayments,
      notes: formNotes.trim() || undefined,
      createdAt: editingLoan ? editingLoan.createdAt : nowIso,
      updatedAt: nowIso,
    };

    onSaveLoan(savedLoan, {
      syncToTemplate: formSyncTemplate,
      disburseFromAccountId:
        formDirection === 'lent' && !editingLoan && formDisburseAccountId ? formDisburseAccountId : undefined,
    });
    setIsLoanModalOpen(false);
  };

  // Open Record Payment / Collection Modal
  const handleOpenPaymentModal = (loan: LoanRecord) => {
    const m = getLoanMetrics(loan);
    const defaultPay =
      loan.installmentAmount > 0
        ? Math.min(loan.installmentAmount, m.remainingBalance || loan.installmentAmount)
        : m.remainingBalance;

    setPaymentModalLoan(loan);
    setPayAmount(defaultPay > 0 ? String(defaultPay) : '');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayNote(
      loan.direction === 'borrowed'
        ? `Installment payment — ${loan.name}`
        : `Repayment received — ${loan.name}`
    );
    setPayRecordInBudget(loan.direction === 'borrowed');
    setPayDepositAccountId('');
  };

  const handleSubmitPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalLoan) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0) return;

    onRecordLoanPayment(paymentModalLoan.id, {
      amount: amt,
      date: payDate || new Date().toISOString().split('T')[0],
      note: payNote.trim() || `${paymentModalLoan.name} payment`,
      recordInBudget: payRecordInBudget,
      depositToAccountId: payDepositAccountId || undefined,
    });
    setPaymentModalLoan(null);
  };

  const toggleHistory = (loanId: string) => {
    setExpandedHistoryIds((prev) => ({
      ...prev,
      [loanId]: !prev[loanId],
    }));
  };

  return (
    <div className="space-y-6">
      {/* Page Header & Actions */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Loans &amp; Receivables Ledger
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track fixed-installment borrowed liabilities (I Owe) and lent receivables (Owed to Me) with automatic Budget Sheet synchronization.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => handleOpenAddModal('lent')}
            className="px-3 sm:px-3.5 py-2.5 sm:py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Add Lent</span>
          </button>
          <button
            type="button"
            onClick={() => handleOpenAddModal('borrowed')}
            className="px-3 sm:px-4 py-2.5 sm:py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span>Add Borrowed</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
        {/* 1. Total Borrowed (Payables) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">
              Borrowed (I Owe)
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center shrink-0">
              <ArrowUpRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
            <span className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
              {currencySymbol}{formatNumber(summaryStats.borrowedRemaining)}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            <span>{summaryStats.activeBorrowedCount} active</span>
            <span aria-hidden="true">&middot;</span>
            <span className="truncate">{currencySymbol}{formatNumber(summaryStats.borrowedMonthlyCommitment)}/mo</span>
          </div>
        </div>

        {/* 2. Total Lent (Receivables) */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">
              Lent (Owed to Me)
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
              <ArrowDownLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
            <span className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
              {currencySymbol}{formatNumber(summaryStats.lentRemaining)}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            <span>{summaryStats.activeLentCount} active</span>
            <span aria-hidden="true">&middot;</span>
            <span className="truncate">{currencySymbol}{formatNumber(summaryStats.lentMonthlyExpected)}/mo</span>
          </div>
        </div>

        {/* 3. Total Paid & Collected */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">
              Paid &amp; Collected
            </span>
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
            <span className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
              {currencySymbol}{formatNumber(summaryStats.totalAllPaid)}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            <span>Paid: {currencySymbol}{formatNumber(summaryStats.borrowedPaid)}</span>
          </div>
        </div>

        {/* 4. Net Loan Position */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-5 border border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-1">
            <span className="text-[11px] sm:text-xs font-medium text-slate-500 dark:text-slate-400 leading-tight">
              Net Loan Position
            </span>
            <div
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center shrink-0 ${
                summaryStats.netLoanPosition > 0.005
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                  : summaryStats.netLoanPosition < -0.005
                  ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
              }`}
            >
              <Scale className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
          </div>
          <div className="mt-2 sm:mt-3 flex items-baseline gap-2">
            {summaryStats.netLoanPosition > 0.005 ? (
              <span className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 truncate">
                +{currencySymbol}{formatNumber(summaryStats.netLoanPosition)}
              </span>
            ) : summaryStats.netLoanPosition < -0.005 ? (
              <span className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-rose-600 dark:text-rose-400 truncate">
                -{currencySymbol}{formatNumber(Math.abs(summaryStats.netLoanPosition))}
              </span>
            ) : (
              <span className="text-lg sm:text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                {currencySymbol}0.00
              </span>
            )}
          </div>
          <div className="mt-1.5 sm:mt-2 flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
            {summaryStats.netLoanPosition > 0.005 ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Net Receivable</span>
            ) : summaryStats.netLoanPosition < -0.005 ? (
              <span className="text-rose-600 dark:text-rose-400 font-semibold">Net Debt</span>
            ) : (
              <span className="text-slate-600 dark:text-slate-400 font-medium">Balanced</span>
            )}
            <span aria-hidden="true">&middot;</span>
            <span>{summaryStats.completedCount} settled</span>
          </div>
        </div>
      </div>

      {/* Filter Bar & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1 p-1 bg-slate-200/70 dark:bg-slate-800/80 rounded-xl overflow-x-auto">
          <button
            type="button"
            onClick={() => setFilterTab('all_active')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterTab === 'all_active'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All Active ({summaryStats.activeBorrowedCount + summaryStats.activeLentCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('borrowed')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterTab === 'borrowed'
                ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Borrowed &middot; I Owe ({summaryStats.activeBorrowedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('lent')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterTab === 'lent'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Lent &middot; Owed to Me ({summaryStats.activeLentCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('completed')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              filterTab === 'completed'
                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Settled / Completed ({summaryStats.completedCount})
          </button>
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search loans, lender, borrower..."
            className="w-full pl-9 pr-8 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Loans Grid */}
      {filteredLoans.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLoans.map((loan) => {
            const m = getLoanMetrics(loan);
            const isBorrowed = loan.direction === 'borrowed';
            const isHistoryOpen = Boolean(expandedHistoryIds[loan.id]);
            const sortedPayments = [...(loan.payments || [])].sort(
              (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
            );

            return (
              <div
                key={loan.id}
                className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 flex flex-col justify-between space-y-4 transition-colors hover:border-slate-300 dark:hover:border-slate-700"
              >
                {/* Top Header */}
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                        <span
                          className={
                            isBorrowed
                              ? 'text-rose-600 dark:text-rose-400 font-semibold'
                              : 'text-emerald-600 dark:text-emerald-400 font-semibold'
                          }
                        >
                          {isBorrowed ? 'Borrowed · Payable' : 'Lent · Receivable'}
                        </span>
                        <span aria-hidden="true">&middot;</span>
                        <span className="truncate">{loan.category}</span>
                      </div>
                      <h3
                        className="text-base font-bold text-slate-900 dark:text-white mt-0.5 truncate"
                        title={loan.name}
                      >
                        {loan.name}
                      </h3>
                      {(loan.counterparty || loan.dueDay) && (
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {loan.counterparty && (
                            <span>
                              {isBorrowed ? 'Lender: ' : 'Borrower: '}
                              <strong className="font-medium text-slate-700 dark:text-slate-300">
                                {loan.counterparty}
                              </strong>
                            </span>
                          )}
                          {loan.counterparty && loan.dueDay && <span aria-hidden="true">&middot;</span>}
                          {loan.dueDay && <span>Due: {loan.dueDay}</span>}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(loan)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                        title="Edit loan contract"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLoan(loan.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                        title="Delete loan contract"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Remaining Balance & Contract Metrics */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-baseline justify-between gap-2">
                    <div>
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                        {m.isCompleted ? 'Settled Balance' : 'Remaining Balance'}
                      </span>
                      <span
                        className={`text-2xl font-bold font-mono tabular-nums ${
                          m.isCompleted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      >
                        {currencySymbol}{formatNumber(m.remainingBalance)}
                      </span>
                    </div>
                    <div className="text-right font-mono tabular-nums">
                      <span className="text-[11px] text-slate-400 dark:text-slate-500 block">
                        {isBorrowed ? 'Paid / Total Contract' : 'Collected / Total'}
                      </span>
                      <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {currencySymbol}{formatNumber(m.totalPaid)} / {currencySymbol}{formatNumber(m.totalContract)}
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar & Installment Counter */}
                  <div className="space-y-1.5">
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          m.isCompleted
                            ? 'bg-emerald-500'
                            : isBorrowed
                            ? 'bg-indigo-600'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, m.progressPct))}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                      <span>
                        {m.totalTerms > 0
                          ? `${m.termsPaid} of ${m.totalTerms} installments (${m.remainingTerms} left)`
                          : `${(loan.payments || []).length} payments recorded`}
                      </span>
                      <span className="font-semibold text-slate-700 dark:text-slate-300">
                        {m.progressPct.toFixed(0)}%
                      </span>
                    </div>
                  </div>

                  {/* Fixed Installment Schedule & Template Sync Status */}
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between gap-2 text-xs">
                    <div className="font-mono tabular-nums text-slate-600 dark:text-slate-300">
                      <span className="text-slate-400 dark:text-slate-500 font-sans">Installment: </span>
                      <strong className="font-semibold">
                        {currencySymbol}{formatNumber(loan.installmentAmount)}
                      </strong>
                      <span className="text-slate-400 dark:text-slate-500 font-sans">
                        {' '}
                        / {loan.frequency === 'bi-weekly' ? `cutoff (${loan.biweeklyPeriod || 'both'})` : 'month'}
                      </span>
                    </div>

                    {m.hasLinkedTemplate ? (
                      <span
                        className="text-[11px] text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-medium whitespace-nowrap shrink-0"
                        title="Linked to your Estimate Budget Template for automatic Budget Sheet sync"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Budget Linked</span>
                      </span>
                    ) : !m.isCompleted ? (
                      <button
                        type="button"
                        onClick={() => onLinkLoanToTemplate(loan)}
                        className="text-[11px] text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 flex items-center gap-1 underline cursor-pointer whitespace-nowrap shrink-0"
                        title="Add this fixed installment to your Estimate Budget Templates"
                      >
                        <Link2 className="w-3 h-3" />
                        <span>Link to Template</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Action Footer */}
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    {!m.isCompleted && (
                      <button
                        type="button"
                        onClick={() => handleOpenPaymentModal(loan)}
                        className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                          isBorrowed
                            ? 'bg-indigo-600 hover:bg-indigo-500'
                            : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        <span>{isBorrowed ? 'Record Payment' : 'Record Collection'}</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleHistory(loan.id)}
                      className="py-2 px-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
                    >
                      <History className="w-3.5 h-3.5 text-slate-400" />
                      <span>History ({sortedPayments.length})</span>
                      {isHistoryOpen ? (
                        <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </button>
                  </div>

                  {/* Expandable Payment Ledger History */}
                  {isHistoryOpen && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5 max-h-48 overflow-y-auto">
                      {loan.initialPaidAmount > 0 && (
                        <div className="flex items-center justify-between text-[11px] py-1 px-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400">
                          <span>
                            Prior Paid Balance ({loan.initialInstallmentsPaid || 0} terms)
                          </span>
                          <span className="font-mono tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                            {currencySymbol}{formatNumber(loan.initialPaidAmount)}
                          </span>
                        </div>
                      )}
                      {sortedPayments.length > 0 ? (
                        sortedPayments.map((pay) => (
                          <div
                            key={pay.id}
                            className="flex items-center justify-between gap-2 text-[11px] py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/60"
                          >
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 dark:text-slate-200 truncate">
                                {pay.note || 'Installment payment'}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center gap-1 font-mono tabular-nums">
                                <span>{pay.date}</span>
                                <span aria-hidden="true">&middot;</span>
                                <span>
                                  {pay.source === 'budget_sync' ? 'Budget Sheet Sync' : 'Direct Entry'}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="font-mono tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                                +{currencySymbol}{formatNumber(pay.amount)}
                              </span>
                              <button
                                type="button"
                                onClick={() => onDeleteLoanPayment(loan.id, pay.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors cursor-pointer"
                                title="Remove payment record"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-slate-400 italic py-2 text-center">
                          No payments recorded yet. Mark the loan Paid in your Budget Sheet or click Record Payment.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Clean Empty State */
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-10 border border-slate-200 dark:border-slate-800 text-center max-w-xl mx-auto my-4 space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
            <Landmark className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              {searchQuery
                ? 'No matching loans found'
                : filterTab === 'completed'
                ? 'No settled loans yet'
                : 'No active loans or receivables tracked yet'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              Add your fixed-installment loans (SSS, Pag-IBIG, Car, Credit Card) or money lent to others. Link them to your Estimate Budget Template so marking an installment Paid in the Budget Sheet automatically updates your remaining balance.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => handleOpenAddModal('borrowed')}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Borrowed Loan (I Owe)</span>
            </button>
            <button
              type="button"
              onClick={() => handleOpenAddModal('lent')}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowDownLeft className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              <span>Add Lent Loan (Owed to Me)</span>
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Loan Modal */}
      {isLoanModalOpen && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2.5 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh]">
            <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="min-w-0">
                <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                  {editingLoan
                    ? `Edit ${editingLoan.name}`
                    : formDirection === 'borrowed'
                    ? 'Add Borrowed Loan (I Owe)'
                    : 'Add Lent Loan (Owed to Me)'}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  {formDirection === 'borrowed'
                    ? 'Track fixed-installment debt, interest total, and payoff progress'
                    : 'Track money lent to others and schedule repayment collections'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsLoanModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitLoanForm} className="p-3.5 sm:p-5 space-y-2.5 sm:space-y-3.5 overflow-y-auto flex-1 text-xs">
              {/* Direction Selector */}
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFormDirection('borrowed');
                    if (!BORROWED_CATEGORIES.includes(formCategory)) {
                      setFormCategory(BORROWED_CATEGORIES[0]);
                    }
                  }}
                  className={`h-8 sm:h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    formDirection === 'borrowed'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ArrowUpRight className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Borrowed (I Owe)</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFormDirection('lent');
                    if (!LENT_CATEGORIES.includes(formCategory)) {
                      setFormCategory(LENT_CATEGORIES[0]);
                    }
                  }}
                  className={`h-8 sm:h-9 px-2.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    formDirection === 'lent'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <ArrowDownLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">Lent (Owed to Me)</span>
                </button>
              </div>

              {/* Loan Name & Counterparty */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {formDirection === 'borrowed' ? 'Loan Name *' : 'Receivable Name *'}
                    </label>
                  </div>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder={
                      formDirection === 'borrowed'
                        ? 'e.g. SSS Loan, Car Loan'
                        : 'e.g. Lent to Mark'
                    }
                    className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      {formDirection === 'borrowed' ? 'Lender / Bank' : 'Borrower Name'}
                    </label>
                  </div>
                  <input
                    type="text"
                    value={formCounterparty}
                    onChange={(e) => setFormCounterparty(e.target.value)}
                    placeholder={
                      formDirection === 'borrowed'
                        ? 'e.g. SSS, Pag-IBIG, BPI'
                        : 'e.g. Mark, Alex'
                    }
                    className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Category & Start Date */}
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      Loan Category
                    </label>
                  </div>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {(formDirection === 'borrowed' ? BORROWED_CATEGORIES : LENT_CATEGORIES).map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      Start / Issue Date
                    </label>
                  </div>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="block w-full max-w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 text-[11px] sm:text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              {/* Fixed Installment Math Box */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2.5">
                <div className="flex items-center justify-between gap-1">
                  <div className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white truncate">
                    Fixed Installment Schedule
                  </div>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium shrink-0">
                    Contract = Inst × Terms
                  </span>
                </div>

                {/* Row 1: Fixed Installment & Total Installments */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Installment ({currencySymbol}) *
                      </label>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={formInstallmentAmount}
                      onChange={(e) => handleInstallmentOrTermsChange(e.target.value, formTotalInstallments)}
                      placeholder="e.g. 2500"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Total Terms (Count) *
                      </label>
                    </div>
                    <input
                      type="number"
                      min="1"
                      max="600"
                      required
                      value={formTotalInstallments}
                      onChange={(e) => handleInstallmentOrTermsChange(formInstallmentAmount, e.target.value)}
                      placeholder="e.g. 24"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Row 2: Total Contract & Principal */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Total Contract ({currencySymbol}) *
                      </label>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={formTotalContract}
                      onChange={(e) => setFormTotalContract(e.target.value)}
                      placeholder="Auto-computed"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Principal (Optional)
                      </label>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formPrincipal}
                      onChange={(e) => setFormPrincipal(e.target.value)}
                      placeholder="Cash received"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Row 3: Payment Frequency & Due Date */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Frequency
                      </label>
                    </div>
                    <select
                      value={formFrequency}
                      onChange={(e) => setFormFrequency(e.target.value as 'monthly' | 'bi-weekly')}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="monthly">Monthly</option>
                      <option value="bi-weekly">Bi-Weekly (Cutoff)</option>
                    </select>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Due Day / Schedule
                      </label>
                    </div>
                    <input
                      type="text"
                      value={formDueDay}
                      onChange={(e) => setFormDueDay(e.target.value)}
                      placeholder="e.g. 15th, 30th"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Row 4: Bi-Weekly Cutoff Allocation (only if bi-weekly) */}
                {formFrequency === 'bi-weekly' && (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Bi-Weekly Cutoff Allocation
                      </label>
                    </div>
                    <select
                      value={formBiweeklyPeriod}
                      onChange={(e) => setFormBiweeklyPeriod(e.target.value as 'P1' | 'P2' | 'both')}
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="both">Both Cutoffs (Period 1 and Period 2)</option>
                      <option value="P1">1st Cutoff Only (Period 1)</option>
                      <option value="P2">2nd Cutoff Only (Period 2)</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Prior Paid Balance (For migrating ongoing loans) */}
              <div className="p-3 sm:p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/80 space-y-2">
                <div className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white">
                  Prior Progress (If Started Before Tracking)
                </div>
                <div className="grid grid-cols-2 gap-2 sm:gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Terms Paid
                      </label>
                    </div>
                    <input
                      type="number"
                      min="0"
                      value={formInitialTermsPaid}
                      onChange={(e) => handleInitialTermsChange(e.target.value)}
                      placeholder="0"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                        Amount {formDirection === 'borrowed' ? 'Paid' : 'Collected'} ({currencySymbol})
                      </label>
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formInitialAmountPaid}
                      onChange={(e) => setFormInitialAmountPaid(e.target.value)}
                      placeholder="0"
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              {/* Notes / Reference */}
              <div className="min-w-0">
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                    Notes / Reference (Optional)
                  </label>
                </div>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Account/PN #, special conditions..."
                  className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Auto-Sync to Budget Template Checkbox */}
              {!editingLoan && (
                <label className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/80 dark:border-indigo-800/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formSyncTemplate}
                    onChange={(e) => setFormSyncTemplate(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                  />
                  <div className="text-[11px]">
                    <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                      Add to Estimate Budget Template ({formDirection === 'borrowed' ? 'Expense → Loans' : 'Income → Other Income'})
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 text-[10px] leading-snug block mt-0.5">
                      Pre-populates this installment in your Budget Sheet and updates loan balance when marked Paid.
                    </span>
                  </div>
                </label>
              )}

              {/* Optional Account Deduction for Lent Loans */}
              {formDirection === 'lent' && !editingLoan && ledger.accounts.length > 0 && (
                <div className="p-3 sm:p-3.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/25 border border-emerald-200/80 dark:border-emerald-800/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] sm:text-xs font-bold text-slate-900 dark:text-white">
                      Disburse / Deduct Principal from Funds Account (Optional)
                    </span>
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold px-1.5 py-0.5 rounded bg-emerald-100/70 dark:bg-emerald-900/50">
                      Funds Ledger
                    </span>
                  </div>
                  <p className="text-[10px] sm:text-[11px] text-slate-600 dark:text-slate-300 leading-snug">
                    Which account did this lent money come from? Select an account below to deduct the principal ({currencySymbol}{formatNumber(parseFloat(formPrincipal) || parseFloat(formTotalContract) || 0)}) from its balance now, or leave unselected to track the receivable agreement without moving account funds.
                  </p>
                  <select
                    value={formDisburseAccountId}
                    onChange={(e) => setFormDisburseAccountId(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="">Do not deduct from an account (track agreement only)</option>
                    {ledger.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Current Balance: {currencySymbol}{formatNumber(acc.balance)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsLoanModalOpen(false)}
                  className="h-8 sm:h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 sm:h-9 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
                >
                  {editingLoan ? 'Save Changes' : formDirection === 'borrowed' ? 'Save Borrowed Loan' : 'Save Lent Receivable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Record Payment / Collection Modal */}
      {paymentModalLoan && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2.5 sm:p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                  {paymentModalLoan.direction === 'borrowed'
                    ? `Record Loan Payment — ${paymentModalLoan.name}`
                    : `Record Collection — ${paymentModalLoan.name}`}
                </h3>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Deducts from the remaining contract balance
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalLoan(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPayment} className="p-3.5 sm:p-5 space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 sm:gap-3">
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      Amount ({currencySymbol}) *
                    </label>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(e.target.value)}
                    className="w-full min-w-0 h-8 sm:h-9 px-2.5 text-xs font-mono tabular-nums font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      Payment Date *
                    </label>
                  </div>
                  <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                    <input
                      type="date"
                      required
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-[11px] sm:text-xs font-mono text-slate-900 dark:text-white outline-none appearance-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between h-4 mb-1">
                  <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                    Reference / Note
                  </label>
                </div>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  placeholder="e.g. Monthly installment or extra payment"
                  className="w-full h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Optional Sync to Current Budget Sheet */}
              <label className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={payRecordInBudget}
                  onChange={(e) => setPayRecordInBudget(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
                <div className="text-[11px]">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Also record in {budget.year} Budget Sheet
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[10px] leading-snug block mt-0.5">
                    Logs a Paid {paymentModalLoan.direction === 'borrowed' ? 'Expense (Loans)' : 'Income'} entry so your cashflow sheet stays accurate.
                  </span>
                </div>
              </label>

              {/* Optional Deposit to Funds Account for Lent Receivables */}
              {paymentModalLoan.direction === 'lent' && ledger.accounts.length > 0 && (
                <div>
                  <div className="flex items-center justify-between h-4 mb-1">
                    <label className="text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate">
                      Deposit Collected Cash to Funds Account (Optional)
                    </label>
                  </div>
                  <select
                    value={payDepositAccountId}
                    onChange={(e) => setPayDepositAccountId(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Do not add to Funds Ledger</option>
                    {ledger.accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({currencySymbol}{formatNumber(acc.balance)})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setPaymentModalLoan(null)}
                  className="h-8 sm:h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 sm:h-9 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer"
                >
                  Confirm {paymentModalLoan.direction === 'borrowed' ? 'Payment' : 'Collection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
