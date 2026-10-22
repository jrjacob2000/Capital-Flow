import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  Download,
  Calendar,
  PiggyBank,
  TrendingUp,
  Receipt,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Banknote,
  CreditCard,
  Building,
  Smartphone,
  Wallet,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
  AlertTriangle,
  Tag,
  Check,
  Upload,
} from 'lucide-react';
import {
  BudgetEntry,
  YearBudgetData,
  EntryFrequency,
  PaymentMethod,
  SavingsAccount,
  BudgetItemTemplate,
} from '../types/finance';
import {
  MONTH_NAMES,
  BIWEEKLY_PERIODS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVING_CATEGORIES,
  PAYMENT_METHODS,
  stripDefaultStarterTemplates,
  isTemplateValidForPeriod,
  resolveCanonicalSinkingFundName,
  findClosestSinkingFundMatch,
  normalizeSavingCategoryGroup,
  DEFAULT_SINKING_FUND_NAMES,
} from '../services/sampleData';
import { CategoryAndTemplateManagerModal } from './CategoryAndTemplateManagerModal';
import { CarryOverModal } from './CarryOverModal';
import { ExcelImportModal } from './ExcelImportModal';

export interface SheetRowItem {
  id: string;
  isVirtualEstimate: boolean;
  templateId?: string;
  type: 'income' | 'expense' | 'saving';
  category: string;
  item: string;
  estimatedCost: number;
  actualCost: number;
  hasActualCost: boolean;
  paymentMethod: PaymentMethod;
  paymentBreakdown?: BudgetEntry['paymentBreakdown'];
  difference: number;
  status: 'Paid' | 'Pending' | 'Scheduled';
  reference?: string;
  date: string;
  toBeWithdrawn: boolean;
  savingAccountId?: string;
  savingAccountName?: string;
}

interface BudgetSpreadsheetViewProps {
  budget: YearBudgetData;
  accounts: SavingsAccount[];
  selectedPeriod: string;
  onSelectPeriod: (period: string) => void;
  frequency: EntryFrequency;
  onChangeFrequency: (freq: EntryFrequency) => void;
  onAddEntry: (entry: Omit<BudgetEntry, 'id' | 'createdAt'>) => void;
  onAddMultipleEntries?: (
    entries: Omit<BudgetEntry, 'id' | 'createdAt'>[],
    options?: { replacePeriod?: string; customExpenseCategories?: string[] }
  ) => void;
  onUpdateEntry: (id: string, updated: Partial<BudgetEntry>) => void;
  onDeleteEntry: (entryId: string) => void;
  onUpdateCategories: (
    customCats: {
      expense: string[];
      income: string[];
      saving: string[];
    },
    renamed?: { type: 'income' | 'expense' | 'saving'; oldName: string; newName: string }
  ) => void;
  onUpdateTemplates: (templates: BudgetItemTemplate[]) => void;
  currencySymbol?: string;
}

export const BudgetSpreadsheetView: React.FC<BudgetSpreadsheetViewProps> = ({
  budget,
  accounts,
  selectedPeriod,
  onSelectPeriod,
  frequency,
  onChangeFrequency,
  onAddEntry,
  onAddMultipleEntries,
  onUpdateEntry,
  onDeleteEntry,
  onUpdateCategories,
  onUpdateTemplates,
  currencySymbol = '₱',
}) => {
  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState(false);
  const [isCarryOverModalOpen, setIsCarryOverModalOpen] = useState(false);
  const [isImportExcelOpen, setIsImportExcelOpen] = useState(false);
  const [modalPeriod, setModalPeriod] = useState<string>(selectedPeriod);
  const [modalType, setModalType] = useState<'income' | 'expense' | 'saving'>('expense');
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [isRowAction, setIsRowAction] = useState<boolean>(false);
  const [entrySourceMode, setEntrySourceMode] = useState<'unplanned' | 'template'>('unplanned');

  // Active Categories & Templates (from budget or defaults)
  const expenseCategories = budget.customCategories?.expense || [...EXPENSE_CATEGORIES];
  const incomeCategories = budget.customCategories?.income || [...INCOME_CATEGORIES];
  const savingCategories = budget.customCategories?.saving || [...SAVING_CATEGORIES];
  const itemTemplates: BudgetItemTemplate[] = useMemo(() => {
    return budget.isPersonalizedTemplate
      ? stripDefaultStarterTemplates(budget.itemTemplates)
      : [];
  }, [budget.isPersonalizedTemplate, budget.itemTemplates]);

  // Helper to find estimated cost for any item name or category
  const getEstimateForItem = (itemName: string, catName?: string, type?: 'income' | 'expense' | 'saving'): number => {
    const trimmed = itemName.trim().toLowerCase();
    if (!trimmed) {
      if (catName) {
        const catMatch = itemTemplates.find((t) => t.category.toLowerCase() === catName.toLowerCase());
        if (catMatch && catMatch.defaultEstimatedCost > 0) return catMatch.defaultEstimatedCost;
      }
      return 0;
    }
    const exact = itemTemplates.find((t) => t.item.toLowerCase() === trimmed);
    if (exact && exact.defaultEstimatedCost > 0) {
      return exact.defaultEstimatedCost;
    }
    const partial = itemTemplates.find(
      (t) => t.item.toLowerCase().includes(trimmed) || trimmed.includes(t.item.toLowerCase())
    );
    if (partial && partial.defaultEstimatedCost > 0) {
      return partial.defaultEstimatedCost;
    }
    if (catName) {
      const catMatch = itemTemplates.find((t) => t.category.toLowerCase() === catName.toLowerCase());
      if (catMatch && catMatch.defaultEstimatedCost > 0) return catMatch.defaultEstimatedCost;
    }
    return 0;
  };

  // Form states - initialized with estimates pre-populated
  const [formCategory, setFormCategory] = useState<string>(expenseCategories[0] || 'Budget');
  const [formItem, setFormItem] = useState<string>('');
  const [formEstimated, setFormEstimated] = useState<string>('');
  const [formActual, setFormActual] = useState<string>('');
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('Bank Transfer');
  const [isSplitPayment, setIsSplitPayment] = useState<boolean>(false);
  const [formPaymentBreakdown, setFormPaymentBreakdown] = useState<{
    cash: string;
    creditCard: string;
    gcashTransfer: string;
    kathAccount: string;
    checkAccount: string;
    bankTransfer: string;
  }>({
    cash: '',
    creditCard: '',
    gcashTransfer: '',
    kathAccount: '',
    checkAccount: '',
    bankTransfer: '',
  });
  const [formStatus, setFormStatus] = useState<'Paid' | 'Pending' | 'Scheduled'>('Paid');
  const [formReference, setFormReference] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(
    new Date().toISOString().split('T')[0].replace(/^\d{4}/, String(budget.year))
  );
  const [formToBeWithdrawn, setFormToBeWithdrawn] = useState<boolean>(false);
  const [formSavingAccountId, setFormSavingAccountId] = useState<string>(accounts[0]?.id || '');
  const [saveToTemplate, setSaveToTemplate] = useState<boolean>(false);
  const [isCreatingNewSinkingFund, setIsCreatingNewSinkingFund] = useState<boolean>(false);

  const existingSinkingFunds = useMemo(() => {
    const basePool = [...DEFAULT_SINKING_FUND_NAMES];
    const fromTemplates = itemTemplates
      .filter((t) => t.type === 'saving')
      .map((t) => resolveCanonicalSinkingFundName(t.item, t.category, basePool));
    const combinedPool = Array.from(new Set([...fromTemplates, ...basePool]));
    const fromEntries = budget.entries
      .filter((e) => e.type === 'saving')
      .map((e) => resolveCanonicalSinkingFundName(e.item || e.description, e.category, combinedPool));
    return Array.from(new Set([...fromTemplates, ...basePool, ...fromEntries])).filter(Boolean);
  }, [itemTemplates, budget.entries]);



  const currentMonthName = useMemo(() => MONTH_NAMES[new Date().getMonth()] || 'Jan', []);
  const currentBiWeeklyPeriod = useMemo(
    () => `${currentMonthName}-${new Date().getDate() <= 15 ? 'P1' : 'P2'}`,
    [currentMonthName]
  );

  // Ensure selectedPeriod matches frequency
  useEffect(() => {
    const validList = frequency === 'monthly' ? MONTH_NAMES : BIWEEKLY_PERIODS.map((p) => p.id);
    if (!validList.includes(selectedPeriod)) {
      const fallback = frequency === 'monthly' ? currentMonthName : currentBiWeeklyPeriod;
      if (selectedPeriod !== fallback) {
        onSelectPeriod(fallback);
      }
    }
  }, [frequency, selectedPeriod, currentMonthName, currentBiWeeklyPeriod, onSelectPeriod]);

  // Keep modalPeriod in sync when selectedPeriod changes
  useEffect(() => {
    setModalPeriod((prev) => (prev !== selectedPeriod ? selectedPeriod : prev));
  }, [selectedPeriod]);

  const selectedPeriodBtnRef = useRef<HTMLButtonElement>(null);
  const periodScrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollToSelected = () => {
      const container = periodScrollContainerRef.current;
      const btn = selectedPeriodBtnRef.current;
      if (!container || !btn) return;
      const containerRect = container.getBoundingClientRect();
      const btnRect = btn.getBoundingClientRect();
      if (containerRect.width === 0) return;
      const currentScroll = container.scrollLeft;
      const targetLeft =
        currentScroll +
        (btnRect.left - containerRect.left) -
        containerRect.width / 2 +
        btnRect.width / 2;
      const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
      const clampedLeft = Math.max(0, Math.min(targetLeft, maxScroll));
      container.scrollTo({
        left: clampedLeft,
        behavior: 'smooth',
      });
    };

    const rafId = requestAnimationFrame(scrollToSelected);
    const timerId = setTimeout(scrollToSelected, 60);
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timerId);
    };
  }, [selectedPeriod, frequency]);

  const [autoFillMessage, setAutoFillMessage] = useState<string | null>(null);

  const handleAutoFillPeriodFromTemplates = () => {
    const validTemplates = itemTemplates.filter((t) =>
      isTemplateValidForPeriod(t, frequency, selectedPeriod)
    );

    if (validTemplates.length === 0) {
      setAutoFillMessage(
        `No estimate templates found for ${selectedPeriod}. Click "Estimates & Categories" to create your templates first.`
      );
      setTimeout(() => setAutoFillMessage(null), 4000);
      return;
    }

    const existingInPeriod = budget.entries.filter((e) => e.period === selectedPeriod);
    const unpopulated = validTemplates.filter((t) => {
      return !existingInPeriod.some(
        (e) =>
          e.type === t.type &&
          (e.item?.toLowerCase().trim() === t.item.toLowerCase().trim() ||
            e.category.toLowerCase().trim() === t.item.toLowerCase().trim())
      );
    });

    if (unpopulated.length === 0) {
      setAutoFillMessage(
        `All ${validTemplates.length} planned items from your template are already recorded in ${selectedPeriod}!`
      );
      setTimeout(() => setAutoFillMessage(null), 4000);
      return;
    }

    let periodIndex = 0;
    let periodDate = `${budget.year}-01-01`;
    if (frequency === 'monthly') {
      periodIndex = Math.max(0, MONTH_NAMES.indexOf(selectedPeriod));
      periodDate = `${budget.year}-${String(periodIndex + 1).padStart(2, '0')}-01`;
    } else {
      const bwIdx = BIWEEKLY_PERIODS.findIndex((p) => p.id === selectedPeriod);
      periodIndex = bwIdx >= 0 ? bwIdx : 0;
      const bw = BIWEEKLY_PERIODS[periodIndex];
      const mIdx = Math.max(0, MONTH_NAMES.indexOf(bw?.approxMonth || 'Jan'));
      const isP2 = bw?.id.endsWith('-P2');
      periodDate = `${budget.year}-${String(mIdx + 1).padStart(2, '0')}-${isP2 ? '16' : '01'}`;
    }

    const defaultAcc = accounts[0];
    const newEntries: Omit<BudgetEntry, 'id' | 'createdAt'>[] = unpopulated.map((t) => {
      const targetAcc = t.defaultSavingAccountId
        ? accounts.find((a) => a.id === t.defaultSavingAccountId) || defaultAcc
        : defaultAcc;

      return {
        year: budget.year,
        period: selectedPeriod,
        periodIndex,
        date: periodDate,
        type: t.type,
        category: t.category,
        item: t.item,
        estimatedCost: t.defaultEstimatedCost,
        actualCost: t.type === 'saving' ? t.defaultEstimatedCost : 0,
        amount: t.type === 'saving' ? t.defaultEstimatedCost : 0,
        paymentMethod: t.defaultPaymentMethod || 'Bank Transfer',
        difference: t.defaultEstimatedCost,
        status: (t.type === 'saving' ? 'Paid' : 'Pending') as 'Paid' | 'Pending',
        reference: 'Auto-filled from template',
        toBeWithdrawn: Boolean(t.toBeWithdrawn),
        description: t.item || t.category,
        savingAccountId: t.type === 'saving' ? targetAcc?.id : undefined,
        savingAccountName: t.type === 'saving' ? targetAcc?.name : undefined,
      };
    });

    if (onAddMultipleEntries) {
      onAddMultipleEntries(newEntries);
    } else {
      newEntries.forEach((e) => onAddEntry(e));
    }

    setAutoFillMessage(
      `Populated ${newEntries.length} planned items into ${selectedPeriod} from your Estimate Template!`
    );
    setTimeout(() => setAutoFillMessage(null), 4000);
  };

  // Period lists
  const periodList =
    frequency === 'monthly' ? MONTH_NAMES : BIWEEKLY_PERIODS.map((p) => p.id);

  // UNIFIED SHEET ROWS: THE SHEET IS ALREADY PRE-POPULATED WITH ALL ESTIMATES!
  const { unifiedIncomeRows, unifiedExpenseRows } = useMemo(() => {
    const recordedEntries = budget.entries.filter((e) => e.period === selectedPeriod);
    const recordedMap = new Map<string, BudgetEntry>();
    const usedEntryIds = new Set<string>();

    recordedEntries.forEach((e) => {
      const key = (e.item || e.description || '').toLowerCase().trim();
      if (!recordedMap.has(key)) {
        recordedMap.set(key, e);
      }
    });

    const incomeRows: SheetRowItem[] = [];
    const expenseRows: SheetRowItem[] = [];

    // 1. Every template matching the current frequency mode is guaranteed to appear on the sheet PRE-POPULATED with its estimate!
    itemTemplates
      .filter((tpl) => isTemplateValidForPeriod(tpl, frequency, selectedPeriod))
      .forEach((tpl) => {
      const key = tpl.item.toLowerCase().trim();
      const matchedEntry = recordedMap.get(key);

      if (matchedEntry) {
        usedEntryIds.add(matchedEntry.id);
        const est =
          matchedEntry.estimatedCost !== undefined && matchedEntry.estimatedCost > 0
            ? matchedEntry.estimatedCost
            : tpl.defaultEstimatedCost;
        const act = matchedEntry.actualCost !== undefined ? matchedEntry.actualCost : matchedEntry.amount;
        const diff = tpl.type === 'income' ? act - est : est - act;

        const row: SheetRowItem = {
          id: matchedEntry.id,
          isVirtualEstimate: false,
          templateId: tpl.id,
          type: matchedEntry.type,
          category: matchedEntry.category || tpl.category,
          item: matchedEntry.item || tpl.item,
          estimatedCost: est,
          actualCost: act,
          hasActualCost: true,
          paymentMethod: matchedEntry.paymentMethod || tpl.defaultPaymentMethod || 'Bank Transfer',
          paymentBreakdown: matchedEntry.paymentBreakdown,
          difference: diff,
          status: matchedEntry.status || 'Paid',
          reference: matchedEntry.reference,
          date: matchedEntry.date,
          toBeWithdrawn: Boolean(matchedEntry.toBeWithdrawn || tpl.toBeWithdrawn),
          savingAccountId: matchedEntry.savingAccountId,
          savingAccountName: matchedEntry.savingAccountName,
        };

        if (tpl.type === 'income') {
          incomeRows.push(row);
        } else {
          expenseRows.push(row);
        }
      } else {
        // Not yet recorded: Sheet is initialized with the estimate
        const est = tpl.defaultEstimatedCost || 0;
        const repDate = new Date().toISOString().split('T')[0].replace(/^\d{4}/, String(budget.year));
        const tplTargetAcc = tpl.defaultSavingAccountId
          ? accounts.find((a) => a.id === tpl.defaultSavingAccountId) || accounts[0]
          : accounts[0];

        const row: SheetRowItem = {
          id: `virtual-${tpl.id}-${selectedPeriod}`,
          isVirtualEstimate: true,
          templateId: tpl.id,
          type: tpl.type,
          category: tpl.category,
          item: tpl.item,
          estimatedCost: est,
          actualCost: 0,
          hasActualCost: false,
          paymentMethod: tpl.defaultPaymentMethod || 'Bank Transfer',
          difference: tpl.type === 'income' ? -est : est,
          status: 'Pending',
          reference: '',
          date: repDate,
          toBeWithdrawn: Boolean(tpl.toBeWithdrawn),
          savingAccountId: tpl.type === 'saving' ? tplTargetAcc?.id : undefined,
          savingAccountName: tpl.type === 'saving' ? tplTargetAcc?.name : undefined,
        };

        if (tpl.type === 'income') {
          incomeRows.push(row);
        } else {
          expenseRows.push(row);
        }
      }
    });

    // 2. Add any custom recorded entries that are not in the template list
    recordedEntries.forEach((entry) => {
      if (!usedEntryIds.has(entry.id)) {
        const est = entry.estimatedCost ?? 0;
        const act = entry.actualCost ?? entry.amount ?? 0;
        const diff = entry.type === 'income' ? act - est : est - act;

        const row: SheetRowItem = {
          id: entry.id,
          isVirtualEstimate: false,
          type: entry.type,
          category: entry.category,
          item: entry.item || entry.description,
          estimatedCost: est,
          actualCost: act,
          hasActualCost: true,
          paymentMethod: entry.paymentMethod || 'Bank Transfer',
          paymentBreakdown: entry.paymentBreakdown,
          difference: diff,
          status: entry.status || 'Paid',
          reference: entry.reference,
          date: entry.date,
          toBeWithdrawn: Boolean(entry.toBeWithdrawn),
          savingAccountId: entry.savingAccountId,
          savingAccountName: entry.savingAccountName,
        };

        if (entry.type === 'income') {
          incomeRows.push(row);
        } else {
          expenseRows.push(row);
        }
      }
    });

    return { unifiedIncomeRows: incomeRows, unifiedExpenseRows: expenseRows };
  }, [budget.entries, itemTemplates, selectedPeriod, budget.year]);

  // Totals calculations across the pre-populated sheet
  const totalIncomeEstimated = unifiedIncomeRows.reduce(
    (sum, r) => sum + r.estimatedCost,
    0
  );
  const totalIncomeActual = unifiedIncomeRows.reduce(
    (sum, r) => sum + (r.hasActualCost ? r.actualCost : 0),
    0
  );
  const incomeDifference = totalIncomeActual - totalIncomeEstimated;

  const totalExpenseEstimated = unifiedExpenseRows.reduce(
    (sum, r) => sum + r.estimatedCost,
    0
  );
  const totalExpenseActual = unifiedExpenseRows.reduce(
    (sum, r) => sum + (r.hasActualCost ? r.actualCost : 0),
    0
  );
  const expenseDifference = totalExpenseEstimated - totalExpenseActual;

  // Extra / Remaining Salary
  const remainingExtra = totalIncomeActual - totalExpenseActual;
  const remainingExtraEstimated = totalIncomeEstimated - totalExpenseEstimated;

  const hasAnyIncomeRecorded = useMemo(
    () => unifiedIncomeRows.some((r) => r.hasActualCost),
    [unifiedIncomeRows]
  );
  const hasAnyExpenseRecorded = useMemo(
    () => unifiedExpenseRows.some((r) => r.hasActualCost),
    [unifiedExpenseRows]
  );

  const { surplus, hasBeenCarriedOver } = useMemo(() => {
    const currentIndex = periodList.indexOf(selectedPeriod);
    if (currentIndex <= 0) return { surplus: 0, hasBeenCarriedOver: true };
    const prevPeriod = periodList[currentIndex - 1];
    const prevEntries = budget.entries.filter((e) => e.period === prevPeriod);
    const incAct = prevEntries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const expAct = prevEntries
      .filter((e) => e.type === 'expense' || e.type === 'saving')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const surplus = incAct - expAct;
    const hasBeenCarriedOver = budget.entries.some(
      (e) => e.period === selectedPeriod && e.description.includes('Carry-over')
    );
    return { surplus, hasBeenCarriedOver };
  }, [budget.entries, periodList, selectedPeriod]);

  // Helpers
  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(num);

  const getMethodAmount = (entry: SheetRowItem, method: PaymentMethod): number => {
    if (!entry.hasActualCost) return 0;
    if (entry.paymentBreakdown) {
      switch (method) {
        case 'Cash':
          return entry.paymentBreakdown.cash || 0;
        case 'Credit Card':
          return entry.paymentBreakdown.creditCard || 0;
        case 'GCash Transfer':
          return entry.paymentBreakdown.gcashTransfer || 0;
        case 'Kath Account':
          return entry.paymentBreakdown.kathAccount || 0;
        case 'Checking Account':
          return entry.paymentBreakdown.checkAccount || 0;
        case 'Bank Transfer':
          return entry.paymentBreakdown.bankTransfer || 0;
        default:
          return 0;
      }
    }
    return entry.paymentMethod === method ? entry.actualCost : 0;
  };

  // Breakdown by payment methods for rows with actuals recorded
  const paymentTotals = useMemo(() => {
    const totals: { [key in PaymentMethod]?: number } = {
      Cash: 0,
      'Credit Card': 0,
      'GCash Transfer': 0,
      'Kath Account': 0,
      'Checking Account': 0,
      'Bank Transfer': 0,
      Other: 0,
    };

    unifiedExpenseRows.forEach((e) => {
      if (e.hasActualCost) {
        if (e.paymentBreakdown) {
          totals.Cash = (totals.Cash || 0) + (e.paymentBreakdown.cash || 0);
          totals['Credit Card'] = (totals['Credit Card'] || 0) + (e.paymentBreakdown.creditCard || 0);
          totals['GCash Transfer'] =
            (totals['GCash Transfer'] || 0) + (e.paymentBreakdown.gcashTransfer || 0);
          totals['Kath Account'] =
            (totals['Kath Account'] || 0) + (e.paymentBreakdown.kathAccount || 0);
          totals['Checking Account'] =
            (totals['Checking Account'] || 0) + (e.paymentBreakdown.checkAccount || 0);
          totals['Bank Transfer'] =
            (totals['Bank Transfer'] || 0) + (e.paymentBreakdown.bankTransfer || 0);
        } else {
          const method = e.paymentMethod || 'Bank Transfer';
          totals[method] = (totals[method] || 0) + e.actualCost;
        }
      }
    });

    return totals;
  }, [unifiedExpenseRows]);



  // Real-time calculations for the modal's selected period
  const modalPeriodStats = useMemo(() => {
    const entriesInModalPeriod = budget.entries.filter((e) => e.period === modalPeriod);
    const incAct = entriesInModalPeriod
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const incEst = itemTemplates
      .filter((t) => t.type === 'income' && isTemplateValidForPeriod(t, frequency, modalPeriod))
      .reduce((sum, t) => sum + t.defaultEstimatedCost, 0);

    // Paid only expenses
    const expPaid = entriesInModalPeriod
      .filter((e) => (e.type === 'expense' || e.type === 'saving') && e.status === 'Paid')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    // All expenses (paid + pending/scheduled)
    const expAll = entriesInModalPeriod
      .filter((e) => e.type === 'expense' || e.type === 'saving')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
      
    const expEst = itemTemplates
      .filter((t) => (t.type === 'expense' || t.type === 'saving') && isTemplateValidForPeriod(t, frequency, modalPeriod))
      .reduce((sum, t) => sum + t.defaultEstimatedCost, 0);

    const hasRecordedIncome = entriesInModalPeriod.some((e) => e.type === 'income');
    // Use only actual recorded income
    const totalIncome = incAct;
    
    // Remaining based on PAID items
    const currRemainingPaid = totalIncome - expPaid;
    // Projected remaining if ALL items are paid
    const projectedTotalRemaining = totalIncome - expAll;
    
    const hasActualInput = formActual.trim() !== '' && !isNaN(parseFloat(formActual));
    const actInput = hasActualInput ? parseFloat(formActual) : (parseFloat(formEstimated) || 0);

    let origAct = 0;
    if (editingEntryId) {
      const orig = budget.entries.find((e) => e.id === editingEntryId);
      if (orig && orig.period === modalPeriod) {
        origAct = orig.actualCost ?? orig.amount ?? 0;
      }
    }

    let projectedIncome = totalIncome;
    let projectedExpense = expAll;

    if (modalType === 'income') {
      projectedIncome = totalIncome - origAct + actInput;
    } else {
      projectedExpense = expAll - origAct + actInput;
    }

    const projectedRemaining = projectedIncome - projectedExpense;
    const usedPercentage = projectedIncome > 0 ? (projectedExpense / projectedIncome) * 100 : 0;

    return {
      incAct,
      incEst,
      expAct: expPaid, // Used in the HUD as 'Total Outflow'
      expEst,
      currRemainingPaid,
      projectedTotalRemaining,
      projectedIncome,
      projectedExpense,
      projectedRemaining,
      usedPercentage,
    };
  }, [
    budget.entries,
    itemTemplates,
    modalPeriod,
    formActual,
    formEstimated,
    modalType,
    editingEntryId,
  ]);

  // Open modal for clicking ANY row on the sheet (virtual estimate or recorded)
  // THE ESTIMATE TEXT IS ALREADY POPULATED!
  const handleOpenRow = (row: SheetRowItem) => {
    setIsRowAction(true);
    setModalPeriod(selectedPeriod);
    setModalType(row.type);
    setFormCategory(row.category);
    setFormItem(row.item);

    // In entry modal the estimate text should already populated if it has an estimate amount
    const est = row.estimatedCost || getEstimateForItem(row.item, row.category, row.type);
    setFormEstimated(est > 0 ? String(est) : '');

    if (row.hasActualCost && !row.isVirtualEstimate) {
      setEditingEntryId(row.id);
      setFormActual(String(row.actualCost));
      setFormStatus(row.status || 'Paid');
      setFormReference(row.reference || '');
    } else {
      setEditingEntryId(null);
      // Pre-fill Actual Cost with Estimated Cost for quick recording
      setFormActual(est > 0 ? String(est) : '');
      setFormStatus('Paid');
      setFormReference('');
    }

    setFormPaymentMethod(row.paymentMethod || 'Bank Transfer');
    if (row.paymentBreakdown) {
      setIsSplitPayment(true);
      setFormPaymentBreakdown({
        cash: row.paymentBreakdown.cash ? String(row.paymentBreakdown.cash) : '',
        creditCard: row.paymentBreakdown.creditCard ? String(row.paymentBreakdown.creditCard) : '',
        gcashTransfer: row.paymentBreakdown.gcashTransfer ? String(row.paymentBreakdown.gcashTransfer) : '',
        kathAccount: row.paymentBreakdown.kathAccount ? String(row.paymentBreakdown.kathAccount) : '',
        checkAccount: row.paymentBreakdown.checkAccount ? String(row.paymentBreakdown.checkAccount) : '',
        bankTransfer: row.paymentBreakdown.bankTransfer ? String(row.paymentBreakdown.bankTransfer) : '',
      });
    } else {
      setIsSplitPayment(false);
      setFormPaymentBreakdown({
        cash: '',
        creditCard: '',
        gcashTransfer: '',
        kathAccount: '',
        checkAccount: '',
        bankTransfer: '',
      });
    }
    setFormToBeWithdrawn(Boolean(row.toBeWithdrawn));
    setFormSavingAccountId(row.savingAccountId || accounts[0]?.id || '');
    setSelectedTemplateId(row.templateId || '');
    setEntrySourceMode(row.templateId || row.isVirtualEstimate || (row.estimatedCost && row.estimatedCost > 0) ? 'template' : 'unplanned');
    setSaveToTemplate(false);
    setIsAddModalOpen(true);
  };

  // One-click quick confirm estimate as Paid
  const handleQuickConfirmEstimate = (row: SheetRowItem) => {
    const estNum = row.estimatedCost || 0;
    let periodIndex = 0;
    if (frequency === 'monthly') {
      periodIndex = Math.max(0, MONTH_NAMES.indexOf(selectedPeriod));
    } else {
      const bwIdx = BIWEEKLY_PERIODS.findIndex((p) => p.id === selectedPeriod);
      periodIndex = bwIdx >= 0 ? bwIdx : 0;
    }
    const matchedTpl = itemTemplates.find(
      (t) => t.item.toLowerCase() === row.item.toLowerCase() && t.type === row.type
    );
    const targetAccId = row.savingAccountId || matchedTpl?.defaultSavingAccountId || accounts[0]?.id;
    const targetAcc = accounts.find((a) => a.id === targetAccId) || accounts[0];

    onAddEntry({
      year: budget.year,
      period: selectedPeriod,
      periodIndex,
      date: row.date,
      type: row.type,
      category: row.category,
      item: row.item,
      estimatedCost: estNum,
      actualCost: estNum,
      amount: estNum,
      paymentMethod: row.paymentMethod || 'Bank Transfer',
      difference: 0,
      status: 'Paid',
      reference: '',
      toBeWithdrawn: Boolean(row.toBeWithdrawn),
      description: row.item || row.category,
      savingAccountId: row.type === 'saving' ? targetAcc?.id : undefined,
      savingAccountName: row.type === 'saving' ? targetAcc?.name : undefined,
    });
  };

  // Open modal for new entry button (+ Add Income, + Add Expense, + Add Fund)
  const handleOpenAdd = (type: 'income' | 'expense' | 'saving') => {
    setIsRowAction(false);
    setEditingEntryId(null);
    setModalPeriod(selectedPeriod);
    setModalType(type);
    setIsSplitPayment(false);
    setFormPaymentBreakdown({
      cash: '',
      creditCard: '',
      gcashTransfer: '',
      kathAccount: '',
      checkAccount: '',
      bankTransfer: '',
    });

    // Default to Unplanned mode for quick, friction-free ad-hoc entry
    setEntrySourceMode('unplanned');
    setSelectedTemplateId('');
    setIsCreatingNewSinkingFund(false);
    const defaultFund = existingSinkingFunds[0] || 'General Savings';
    setFormCategory(
      type === 'income'
        ? incomeCategories[0] || 'Salary'
        : type === 'saving'
        ? normalizeSavingCategoryGroup(defaultFund, savingCategories[0])
        : expenseCategories[0] || 'Food & Dining'
    );
    setFormItem(type === 'saving' ? defaultFund : '');
    setFormEstimated('0');
    setFormActual('');
    setFormPaymentMethod('Bank Transfer');
    setFormToBeWithdrawn(false);
    setFormStatus('Paid');
    setFormReference('');
    setSaveToTemplate(false);
    setIsAddModalOpen(true);
  };

  // When template is selected in modal:
  const handleSelectTemplate = (templateId: string) => {
    setSelectedTemplateId(templateId);
    if (!templateId) {
      setEntrySourceMode('unplanned');
      setFormEstimated('0');
      return;
    }

    setEntrySourceMode('template');
    const tpl = itemTemplates.find((t) => t.id === templateId);
    if (!tpl) return;

    setModalType(tpl.type);
    setFormCategory(tpl.category);
    setFormItem(tpl.item);
    const estCost = tpl.defaultEstimatedCost || 0;
    setFormEstimated(estCost > 0 ? String(estCost) : '');
    if (!formActual || formActual.trim() === '') {
      setFormActual(estCost > 0 ? String(estCost) : '');
    }
    if (tpl.defaultPaymentMethod) {
      setFormPaymentMethod(tpl.defaultPaymentMethod);
    }
    if (tpl.defaultSavingAccountId) {
      setFormSavingAccountId(tpl.defaultSavingAccountId);
    }
  };

  // When user types or selects a line item: auto-populate estimate if matching (only in template mode)
  const handleItemChange = (newItemName: string) => {
    setFormItem(newItemName);
    // If user is adding an unplanned item, do not auto-fill estimate or tie to a template!
    if (entrySourceMode === 'unplanned') {
      return;
    }
    const est = getEstimateForItem(newItemName, formCategory, modalType);
    if (est > 0) {
      setFormEstimated(String(est));
      if (!formActual || formActual.trim() === '') {
        setFormActual(String(est));
      }
    }
    const tpl = itemTemplates.find(
      (t) => t.item.toLowerCase() === newItemName.trim().toLowerCase()
    );
    if (tpl) {
      setFormCategory(tpl.category);
      if (tpl.defaultPaymentMethod) setFormPaymentMethod(tpl.defaultPaymentMethod);
      if (tpl.defaultSavingAccountId) setFormSavingAccountId(tpl.defaultSavingAccountId);
      setSelectedTemplateId(tpl.id);
    }
  };

  // When user changes category: update estimate if applicable (only in template mode)
  const handleCategoryChange = (newCat: string) => {
    setFormCategory(newCat);
    if (entrySourceMode === 'unplanned') return;
    const est = getEstimateForItem(formItem, newCat, modalType);
    if (est > 0 && (!formEstimated || formEstimated === '0')) {
      setFormEstimated(String(est));
    }
  };

  // Submit modal entry
  const handleSubmitForm = (e: React.FormEvent) => {
    e.preventDefault();
    const estNum = parseFloat(formEstimated) || 0;
    // 0 is explicitly accepted as actual value!
    const actNum =
      formActual.trim() !== '' && !isNaN(parseFloat(formActual))
        ? parseFloat(formActual)
        : 0;
    const diff = modalType === 'income' ? actNum - estNum : estNum - actNum;

    let periodIndex = 0;
    if (frequency === 'monthly') {
      periodIndex = Math.max(0, MONTH_NAMES.indexOf(modalPeriod));
    } else {
      const bwIdx = BIWEEKLY_PERIODS.findIndex((p) => p.id === modalPeriod);
      periodIndex = bwIdx >= 0 ? bwIdx : 0;
    }

    const selectedAcc = accounts.find((a) => a.id === formSavingAccountId);

    const parsedBreakdown =
      isSplitPayment && modalType !== 'income'
        ? {
            cash: parseFloat(formPaymentBreakdown.cash) || 0,
            creditCard: parseFloat(formPaymentBreakdown.creditCard) || 0,
            gcashTransfer: parseFloat(formPaymentBreakdown.gcashTransfer) || 0,
            kathAccount: parseFloat(formPaymentBreakdown.kathAccount) || 0,
            checkAccount: parseFloat(formPaymentBreakdown.checkAccount) || 0,
            bankTransfer: parseFloat(formPaymentBreakdown.bankTransfer) || 0,
          }
        : undefined;

    const resolvedFundOrItem =
      modalType === 'saving'
        ? isCreatingNewSinkingFund
          ? formItem.trim() || formCategory
          : resolveCanonicalSinkingFundName(formItem.trim() || formCategory, formCategory, existingSinkingFunds)
        : formItem.trim() || formCategory;

    const entryPayload = {
      year: budget.year,
      period: modalPeriod,
      periodIndex,
      date: formDate,
      type: modalType,
      category: formCategory,
      item: resolvedFundOrItem,
      estimatedCost: estNum,
      actualCost: actNum,
      amount: actNum,
      paymentMethod: formPaymentMethod,
      paymentBreakdown: parsedBreakdown,
      difference: diff,
      status: formStatus,
      reference: formReference.trim(),
      toBeWithdrawn: formToBeWithdrawn,
      description: resolvedFundOrItem,
      savingAccountId: modalType === 'saving' ? formSavingAccountId : undefined,
      savingAccountName: modalType === 'saving' ? selectedAcc?.name : undefined,
    };

    // Auto-save or update personalized Estimate Budget Template if requested or if virtual template estimate changed
    const trimmedItem = formItem.trim() || formCategory;
    if (trimmedItem && (saveToTemplate || (selectedTemplateId && estNum > 0))) {
      const existingById = selectedTemplateId
        ? itemTemplates.find((t) => t.id === selectedTemplateId)
        : undefined;
      const existingByName = itemTemplates.find(
        (t) => t.item.toLowerCase() === trimmedItem.toLowerCase() && t.type === modalType
      );
      const targetTpl = existingById || existingByName;

      if (targetTpl) {
        if (
          saveToTemplate ||
          targetTpl.defaultEstimatedCost !== estNum ||
          targetTpl.category !== formCategory ||
          targetTpl.item !== trimmedItem
        ) {
          const updatedTemplates = itemTemplates.map((t) =>
            t.id === targetTpl.id
              ? {
                  ...t,
                  category: formCategory,
                  item: trimmedItem,
                  defaultEstimatedCost: estNum,
                  defaultPaymentMethod: formPaymentMethod,
                  toBeWithdrawn: formToBeWithdrawn,
                }
              : t
          );
          onUpdateTemplates(updatedTemplates);
        }
      } else if (saveToTemplate) {
        const newTpl: BudgetItemTemplate = {
          id: `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          type: modalType,
          category: formCategory,
          item: trimmedItem,
          defaultEstimatedCost: estNum,
          defaultPaymentMethod: formPaymentMethod,
          toBeWithdrawn: formToBeWithdrawn,
        };
        onUpdateTemplates([...itemTemplates, newTpl]);
      }
    }

    if (editingEntryId) {
      onUpdateEntry(editingEntryId, entryPayload);
    } else {
      onAddEntry(entryPayload);
    }

    setIsAddModalOpen(false);
  };

  // Export current period as CSV (clean numbers with no currency symbol for easy spreadsheet analysis)
  const handleExportCSV = () => {
    const formatCsvNum = (num: number | undefined | null): string => {
      if (num === undefined || num === null || isNaN(num)) return '0.00';
      return Number(num).toFixed(2);
    };

    const lines: string[] = [];
    lines.push(`Period,${selectedPeriod} (${budget.year}),Frequency,${frequency === 'monthly' ? 'Monthly' : 'Bi-Weekly'}`);
    lines.push('');
    lines.push('--- INCOME ---');
    lines.push('Income Source,Estimated,Actual Recorded,Difference');

    unifiedIncomeRows.forEach((inc) => {
      const est = inc.estimatedCost || 0;
      const act = inc.actualCost || 0;
      const diff = act - est;
      lines.push(
        `"${inc.item.replace(/"/g, '""')}",${formatCsvNum(est)},${formatCsvNum(act)},${formatCsvNum(diff)}`
      );
    });

    lines.push(
      `Total Income,${formatCsvNum(totalIncomeEstimated)},${formatCsvNum(totalIncomeActual)},${formatCsvNum(incomeDifference)}`
    );
    lines.push('');
    lines.push('--- EXPENSES & OUTFLOWS ---');
    lines.push(
      'Category,Item,Estimated Cost,Actual Cost,Cash,Credit Card,GCash Transfer,Kath Account,Checking Account,Bank Transfer,Difference,Status,Reference,Date'
    );

    unifiedExpenseRows.forEach((exp) => {
      const est = exp.estimatedCost || 0;
      const act = exp.actualCost || 0;
      const cash = getMethodAmount(exp, 'Cash');
      const cc = getMethodAmount(exp, 'Credit Card');
      const gcash = getMethodAmount(exp, 'GCash Transfer');
      const kath = getMethodAmount(exp, 'Kath Account');
      const chk = getMethodAmount(exp, 'Checking Account');
      const bank = getMethodAmount(exp, 'Bank Transfer');
      const diff = est - act;

      lines.push(
        `"${exp.category.replace(/"/g, '""')}","${exp.item.replace(/"/g, '""')}",${formatCsvNum(est)},${formatCsvNum(act)},${cash ? formatCsvNum(cash) : '0.00'},${cc ? formatCsvNum(cc) : '0.00'},${gcash ? formatCsvNum(gcash) : '0.00'},${kath ? formatCsvNum(kath) : '0.00'},${chk ? formatCsvNum(chk) : '0.00'},${bank ? formatCsvNum(bank) : '0.00'},${formatCsvNum(diff)},"${exp.status || 'Paid'}","${(exp.reference || '').replace(/"/g, '""')}",${exp.date}`
      );
    });

    lines.push('');
    lines.push('--- EXPENSES TOTAL SUMMARY ---');
    lines.push(
      `Total Expense,${formatCsvNum(totalExpenseEstimated)},${formatCsvNum(totalExpenseActual)},${formatCsvNum(paymentTotals.Cash || 0)},${formatCsvNum(paymentTotals['Credit Card'] || 0)},${formatCsvNum(paymentTotals['GCash Transfer'] || 0)},${formatCsvNum(paymentTotals['Kath Account'] || 0)},${formatCsvNum(paymentTotals['Checking Account'] || 0)},${formatCsvNum(paymentTotals['Bank Transfer'] || 0)},${formatCsvNum(expenseDifference)}`
    );
    lines.push(`Total Income Recorded,,${formatCsvNum(totalIncomeActual)}`);
    lines.push(`Extra / Remaining Salary,,${formatCsvNum(remainingExtra)}`);

    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Budget_${selectedPeriod}_${budget.year}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6">
      
      {/* Top Controls Toolbar */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Row 1: Title & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white shrink-0">
                  Period Ledger &amp; Cash Flow Sheet
                </h2>
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap shrink-0 leading-none">
                  {selectedPeriod} ({budget.year})
                </span>
                <button
                  type="button"
                  onClick={() => setIsManagerModalOpen(true)}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 font-semibold whitespace-nowrap shrink-0 leading-none hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-colors cursor-pointer"
                  title="Click to manage or set up your Personalized Estimate Budget Template"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  {budget.isPersonalizedTemplate && itemTemplates.length > 0
                    ? `Personalized Template (${itemTemplates.length} items)`
                    : 'Set Up Personalized Template'}
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Estimates are loaded on the sheet. Click any line item to record the actual amount.
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              onClick={() => handleOpenAdd('income')}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Income</span>
            </button>

            <button
              onClick={() => handleOpenAdd('expense')}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Expense</span>
            </button>

            <button
              onClick={() => handleOpenAdd('saving')}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              title="Add funds entry to accumulate in separate funds ledger"
            >
              <PiggyBank className="w-3.5 h-3.5" />
              <span>Funds</span>
            </button>

            <button
              onClick={handleAutoFillPeriodFromTemplates}
              className="px-3 py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title={`Populate ${selectedPeriod} with all planned items from your Estimate Budget Template`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200" />
              <span>Auto-Fill {selectedPeriod}</span>
            </button>

            <button
              onClick={() => setIsManagerModalOpen(true)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1 shadow-xs transition-colors cursor-pointer"
              title="Manage monthly estimated budgets and expense, income, and saving categories"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Estimates &amp; Categories</span>
            </button>

            <button
              onClick={() => setIsImportExcelOpen(true)}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
              title="Import actual data from any worksheet tab in your Excel (.xlsx) file"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Import Excel</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              title="Download CSV without currency symbols for easy spreadsheet analysis"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
          </div>
        </div>

        {/* Row 2: Dedicated Period Navigator Bar */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center gap-3 min-w-0">
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>Period:</span>
            </div>

            {/* Mode Switcher: Monthly vs Bi-Weekly */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => {
                  onChangeFrequency('monthly');
                  onSelectPeriod(currentMonthName);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  frequency === 'monthly'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Monthly (12)
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeFrequency('bi-weekly');
                  onSelectPeriod(currentBiWeeklyPeriod);
                }}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  frequency === 'bi-weekly'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Bi-Weekly (26)
              </button>
            </div>
          </div>

          {frequency === 'monthly' ? (
            <div ref={periodScrollContainerRef} key="monthly-container" className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl text-xs overflow-x-auto min-w-0 w-full md:flex-1 scrollbar-thin">
              {MONTH_NAMES.map((m) => (
                <button
                  key={m}
                  ref={selectedPeriod === m ? selectedPeriodBtnRef : null}
                  onClick={() => onSelectPeriod(m)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                    selectedPeriod === m
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          ) : (
            <div ref={periodScrollContainerRef} key="biweekly-container" className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800/90 p-1 rounded-xl text-xs overflow-x-auto min-w-0 w-full md:flex-1 scrollbar-thin">
              {BIWEEKLY_PERIODS.map((p) => (
                <button
                  key={p.id}
                  ref={selectedPeriod === p.id ? selectedPeriodBtnRef : null}
                  onClick={() => onSelectPeriod(p.id)}
                  className={`px-3 py-1.5 rounded-lg font-semibold transition-all shrink-0 ${
                    selectedPeriod === p.id
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/60 dark:hover:bg-slate-700/60'
                  }`}
                >
                  {p.id}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Auto-Fill Feedback Notification Banner */}
        {autoFillMessage && (
          <div className="mt-3 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-xs text-amber-800 dark:text-amber-200 flex items-center justify-between animate-in fade-in">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
              <span>{autoFillMessage}</span>
            </div>
            <button
              onClick={() => setAutoFillMessage(null)}
              className="p-1 hover:bg-amber-100 dark:hover:bg-amber-900/60 rounded text-amber-700 dark:text-amber-300 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* TOP 3-CARD PERIOD SUMMARY: REMAINING SALARY & TOTALS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        
        {/* CARD 1: SALARY & INCOME */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold uppercase tracking-wider">Salary &amp; Income ({selectedPeriod})</span>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {currencySymbol}{formatNumber(hasAnyIncomeRecorded ? totalIncomeActual : totalIncomeEstimated)}
            {!hasAnyIncomeRecorded && <span className="text-xs text-slate-400 ml-1 font-normal">(Est)</span>}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
            <span>Estimated: {currencySymbol}{formatNumber(totalIncomeEstimated)}</span>
            <span className={hasAnyIncomeRecorded ? 'text-emerald-600 font-semibold' : 'text-slate-400 font-semibold'}>
              Actual: {hasAnyIncomeRecorded ? `${currencySymbol}${formatNumber(totalIncomeActual)}` : '—'}
            </span>
          </div>
        </div>

        {/* CARD 2: TOTAL EXPENSES & SAVINGS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
            <span className="font-semibold uppercase tracking-wider">Total Outflow &amp; Savings</span>
            <Receipt className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400">
            {currencySymbol}{formatNumber(hasAnyExpenseRecorded ? totalExpenseActual : totalExpenseEstimated)}
            {!hasAnyExpenseRecorded && <span className="text-xs text-slate-400 ml-1 font-normal">(Est)</span>}
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
            <span>Estimated: {currencySymbol}{formatNumber(totalExpenseEstimated)}</span>
            <span className={hasAnyExpenseRecorded ? 'text-slate-700 dark:text-slate-300 font-semibold' : 'text-slate-400'}>
              Actual: {hasAnyExpenseRecorded ? `${currencySymbol}${formatNumber(totalExpenseActual)}` : '—'}
            </span>
          </div>
        </div>

        {/* CARD 3: REMAINING TO SALARY */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl p-4 text-white shadow-md">
          <div className="flex items-center justify-between text-xs text-emerald-100 mb-1">
            <span className="font-bold uppercase tracking-wider">Remaining to Salary ({selectedPeriod})</span>
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div className="text-xl font-black font-mono">
            {currencySymbol}{formatNumber(modalPeriodStats.currRemainingPaid)}
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-100 mt-1 font-medium">
            <span>Projected if all paid: {currencySymbol}{formatNumber(modalPeriodStats.projectedTotalRemaining)}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
              {modalPeriodStats.currRemainingPaid >= 0 ? 'Safe Surplus' : 'Deficit'}
            </span>
          </div>
        </div>

      </div>

      {/* SPREADSHEET MAIN CONTAINER */}
      <div className="space-y-6">
          
          {/* 1. INCOME TABLE - PRE-POPULATED ESTIMATES */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Income Sources ({selectedPeriod})
                </span>
                <span className="text-[10px] text-slate-500 font-mono bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  {unifiedIncomeRows.length} items
                </span>
                {surplus > 0 && !hasBeenCarriedOver && (
                  <button
                    onClick={() => setIsCarryOverModalOpen(true)}
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg border border-amber-600 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Bring Forward Previous Surplus: ₱{surplus.toLocaleString()}</span>
                  </button>
                )}
              </div>
              <button
                onClick={() => handleOpenAdd('income')}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                title="Add an income source for this period"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Income</span>
              </button>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-xs font-mono border-separate border-spacing-0 whitespace-nowrap">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-sans font-semibold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    {/* Column 1: Income Source (unfrozen) */}
                    <th className="py-2.5 px-3 min-w-[170px] font-semibold border-b border-r border-slate-200 dark:border-slate-700 truncate">
                      Income Source
                    </th>
                    <th className="py-2.5 px-4 text-right bg-emerald-50/40 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border-b border-r border-slate-200 dark:border-slate-700">
                      Estimated Cost
                    </th>
                    <th className="py-2.5 px-4 text-right border-b border-r border-slate-200 dark:border-slate-700">Actual Recorded</th>
                    <th className="py-2.5 px-4 text-right border-b border-r border-slate-200 dark:border-slate-700">Difference</th>
                    {/* Frozen Right Column: Status */}
                    <th className="sticky right-[64px] z-20 w-[88px] min-w-[88px] max-w-[88px] bg-slate-100 dark:bg-slate-800 py-2.5 px-1.5 text-center border-b border-l-2 border-slate-300 dark:border-slate-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)] font-sans">
                      Status
                    </th>
                    {/* Frozen Right Column: Action */}
                    <th className="sticky right-0 z-20 w-[64px] min-w-[64px] max-w-[64px] bg-slate-100 dark:bg-slate-800 py-2.5 px-1 text-center font-sans border-b border-l border-slate-200 dark:border-slate-700">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unifiedIncomeRows.map((inc) => {
                    const est = inc.estimatedCost;
                    const act = inc.actualCost;
                    const diff = inc.hasActualCost ? act - est : 0;

                    return (
                      <tr
                        key={inc.id}
                        onClick={() => handleOpenRow(inc)}
                        className="hover:bg-emerald-50/50 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer group"
                      >
                        {/* Column 1: Income Source (unfrozen) */}
                        <td className="py-2.5 px-3 min-w-[170px] font-sans font-medium text-slate-800 dark:text-slate-200 border-b border-r border-slate-100 dark:border-slate-800 truncate">
                          <div className="truncate">{inc.item}</div>
                        </td>
                        {/* ESTIMATE COLUMN */}
                        <td className="py-2.5 px-4 text-right font-bold text-slate-800 dark:text-slate-200 bg-emerald-50/20 dark:bg-emerald-950/10 border-b border-r border-slate-100 dark:border-slate-800">
                          {est > 0 ? (
                            `${currencySymbol}${formatNumber(est)}`
                          ) : (
                            <span className="text-slate-400 font-normal text-xs" title="Unplanned income (No baseline estimate)">—</span>
                          )}
                        </td>
                        {/* ACTUAL COLUMN */}
                        <td className="py-2.5 px-4 text-right border-b border-r border-slate-100 dark:border-slate-800">
                          {inc.hasActualCost ? (
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">
                              {currencySymbol}{formatNumber(act)}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-sans text-[11px] group-hover:text-emerald-600 font-medium transition-colors">
                              Record actual
                            </span>
                          )}
                        </td>
                        {/* DIFFERENCE */}
                        <td className="py-2.5 px-4 text-right border-b border-r border-slate-100 dark:border-slate-800">
                          {inc.hasActualCost ? (
                            <span
                              className={
                                diff < 0
                                  ? 'text-rose-600'
                                  : diff > 0
                                  ? 'text-emerald-600 font-bold'
                                  : 'text-slate-400'
                              }
                            >
                              {diff < 0
                                ? `(${currencySymbol}${formatNumber(Math.abs(diff))})`
                                : `${currencySymbol}${formatNumber(diff)}`}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Pending</span>
                          )}
                        </td>
                        {/* Frozen Right Column: Status */}
                        <td className="sticky right-[64px] z-10 w-[88px] min-w-[88px] max-w-[88px] bg-white dark:bg-slate-900 group-hover:bg-emerald-50/50 py-2.5 px-1.5 text-center font-sans border-b border-l-2 border-slate-300 dark:border-slate-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]">
                          {inc.hasActualCost ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Received
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                              Estimated
                            </span>
                          )}
                        </td>
                        {/* Frozen Right Column: Action */}
                        <td className="sticky right-0 z-10 w-[64px] min-w-[64px] max-w-[64px] bg-white dark:bg-slate-900 group-hover:bg-emerald-50/50 py-2.5 px-1 text-center whitespace-nowrap border-b border-l border-slate-200 dark:border-slate-700" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {inc.isVirtualEstimate && inc.estimatedCost > 0 && (
                              <button
                                onClick={() => handleQuickConfirmEstimate(inc)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded"
                                title={`Quick confirm ${currencySymbol}${formatNumber(inc.estimatedCost)} as Received`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenRow(inc)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                              title={inc.hasActualCost ? 'Edit income' : 'Record actual'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {!inc.isVirtualEstimate && (
                              <button
                                onClick={() => onDeleteEntry(inc.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Reset to estimate"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Income Total Row */}
                  <tr className="bg-emerald-50/80 dark:bg-emerald-950/40 font-bold text-slate-900 dark:text-white border-t-2 border-emerald-500/30">
                    <td className="py-3 px-4 font-sans border-r border-emerald-200 dark:border-emerald-800">
                      Total Income
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-900 dark:text-emerald-200 font-mono text-sm border-r border-emerald-200 dark:border-emerald-800">
                      {currencySymbol}{formatNumber(totalIncomeEstimated)}
                    </td>
                    <td className="py-3 px-4 text-right text-emerald-600 dark:text-emerald-400 font-mono text-sm border-r border-emerald-200 dark:border-emerald-800">
                      {currencySymbol}{formatNumber(totalIncomeActual)}
                    </td>
                    <td className="py-3 px-4 text-right text-slate-700 dark:text-slate-300 border-r border-emerald-200 dark:border-emerald-800">
                      {incomeDifference < 0
                        ? `(${currencySymbol}${formatNumber(Math.abs(incomeDifference))})`
                        : `${currencySymbol}${formatNumber(incomeDifference)}`}
                    </td>
                    <td className="sticky right-[64px] z-10 w-[88px] min-w-[88px] max-w-[88px] bg-emerald-50 dark:bg-emerald-950 border-l-2 border-emerald-300 dark:border-emerald-700 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]"></td>
                    <td className="sticky right-0 z-10 w-[64px] min-w-[64px] max-w-[64px] bg-emerald-50 dark:bg-emerald-950 border-l border-emerald-300 dark:border-emerald-700"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. MONTHLY EXPENSES MASTER SPREADSHEET TABLE - PRE-POPULATED ESTIMATES */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-4 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400">
                  {frequency === 'monthly'
                    ? `Monthly Expenses & Outflows (${selectedPeriod})`
                    : `Bi-Weekly Expenses & Outflows (${selectedPeriod})`}
                </span>
                <span className="text-[10px] text-slate-500 font-mono bg-rose-50 dark:bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                  {unifiedExpenseRows.length} lines
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleOpenAdd('expense')}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Add an expense item for this period"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Expense</span>
                </button>
                <button
                  onClick={() => handleOpenAdd('saving')}
                  className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                  title="Add a fund or savings allocation for this period"
                >
                  <PiggyBank className="w-3.5 h-3.5" />
                  <span>Add Fund</span>
                </button>
              </div>
            </div>

            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-left text-[11px] font-mono border-separate border-spacing-0 whitespace-nowrap">
                <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-sans font-semibold border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    {/* Column 1: Category (unfrozen) */}
                    <th className="py-2.5 px-2.5 min-w-[95px] border-b border-r border-slate-200 dark:border-slate-700 truncate">
                      Category
                    </th>

                    {/* Column 2: Item (unfrozen) */}
                    <th className="py-2.5 px-2.5 min-w-[140px] border-b border-r border-slate-200 dark:border-slate-700 truncate">
                      Item
                    </th>

                    {/* Column 3: Estimated Cost */}
                    <th className="py-2.5 px-3 text-right bg-amber-50/60 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 border-b border-r border-slate-200 dark:border-slate-700">
                      Estimated Cost
                    </th>

                    {/* Column 4: Actual Cost */}
                    <th className="py-2.5 px-3 text-right bg-rose-50/50 dark:bg-rose-950/20 font-bold border-b border-r border-slate-200 dark:border-slate-700">
                      Actual Cost
                    </th>
                    
                    {/* Payment Breakdown Columns (5-10) */}
                    <th className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-700">
                      Cash
                    </th>
                    <th className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-700">
                      Credit Card
                    </th>
                    <th className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-700">
                      GCash Transfer
                    </th>
                    <th className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-700">
                      Kath Account
                    </th>
                    <th className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-700">
                      Check Account
                    </th>
                    <th className="py-2.5 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-200 dark:border-slate-700">
                      Bank Transfer
                    </th>

                    {/* Column 12: Difference */}
                    <th className="py-2.5 px-3 text-right border-b border-r border-slate-200 dark:border-slate-700">Difference</th>

                    {/* Column 13: Reference */}
                    <th className="py-2.5 px-3 border-b border-r border-slate-200 dark:border-slate-700 font-sans">Reference</th>

                    {/* Frozen Right Column: Status */}
                    <th className="sticky right-[64px] z-20 w-[88px] min-w-[88px] max-w-[88px] bg-slate-100 dark:bg-slate-800 py-2.5 px-1.5 text-center border-b border-l-2 border-slate-300 dark:border-slate-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)] font-sans">
                      Status
                    </th>

                    {/* Frozen Right Column: Action */}
                    <th className="sticky right-0 z-20 w-[64px] min-w-[64px] max-w-[64px] bg-slate-100 dark:bg-slate-800 py-2.5 px-1 text-center font-sans border-b border-l border-slate-200 dark:border-slate-700">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {unifiedExpenseRows.map((exp) => {
                    const est = exp.estimatedCost;
                    const act = exp.actualCost;
                    const diff = exp.hasActualCost ? est - act : est;
                    const isSaving = exp.type === 'saving' || exp.category === 'Savings';

                    const cash = getMethodAmount(exp, 'Cash');
                    const cc = getMethodAmount(exp, 'Credit Card');
                    const gcash = getMethodAmount(exp, 'GCash Transfer');
                    const kath = getMethodAmount(exp, 'Kath Account');
                    const chk = getMethodAmount(exp, 'Checking Account');
                    const bank = getMethodAmount(exp, 'Bank Transfer');

                    return (
                      <tr
                        key={exp.id}
                        onClick={() => handleOpenRow(exp)}
                        className={`hover:bg-slate-100/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group ${
                          isSaving ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                        }`}
                      >
                        {/* Column 1: Category (unfrozen) */}
                        <td className="py-2 px-2.5 min-w-[95px] font-sans font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-100 dark:border-slate-800 truncate">
                          <div className="truncate">
                            {isSaving && (
                              <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-500 mr-1" />
                            )}
                            {exp.category}
                          </div>
                        </td>

                        {/* Column 2: Item (unfrozen) */}
                        <td className="py-2 px-2.5 min-w-[140px] font-sans font-medium text-slate-900 dark:text-slate-100 border-b border-r border-slate-100 dark:border-slate-800">
                          <div className="flex items-center justify-between gap-1">
                            <span className="truncate">{exp.item}</span>
                            {isSaving && (
                              <div className="flex items-center gap-1 shrink-0">
                                <span className="px-1 py-0.5 rounded text-[9px] bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 font-semibold">
                                  Funds
                                </span>
                                {exp.savingAccountName && (
                                  <span
                                    className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200/80 dark:border-emerald-800/80 hidden sm:inline-block truncate max-w-[120px]"
                                    title={`Deposits to ${exp.savingAccountName}`}
                                  >
                                    &rarr; {exp.savingAccountName}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Column 3: Estimated Cost */}
                        <td className="py-2 px-3 text-right font-bold text-slate-800 dark:text-slate-200 bg-amber-50/20 dark:bg-amber-950/10 border-b border-r border-slate-100 dark:border-slate-800">
                          {est > 0 ? (
                            `${currencySymbol}${formatNumber(est)}`
                          ) : (
                            <span className="text-slate-400 font-normal text-xs" title="Unplanned entry (No baseline estimate)">—</span>
                          )}
                        </td>

                        {/* Column 4: Actual Cost */}
                        <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white bg-rose-50/20 dark:bg-rose-950/10 border-b border-r border-slate-100 dark:border-slate-800">
                          {exp.hasActualCost ? (
                            `${currencySymbol}${formatNumber(act)}`
                          ) : (
                            <span className="text-slate-400 font-sans text-[10px] group-hover:text-indigo-600 transition-colors">
                              Record actual
                            </span>
                          )}
                        </td>

                        {/* Columns 5-10: Payment Breakdown */}
                        <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-100 dark:border-slate-800">
                          {cash > 0 ? `${currencySymbol}${formatNumber(cash)}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-100 dark:border-slate-800">
                          {cc > 0 ? `${currencySymbol}${formatNumber(cc)}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-100 dark:border-slate-800">
                          {gcash > 0 ? `${currencySymbol}${formatNumber(gcash)}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-100 dark:border-slate-800">
                          {kath > 0 ? `${currencySymbol}${formatNumber(kath)}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800">
                          {chk > 0 ? `${currencySymbol}${formatNumber(chk)}` : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right text-slate-600 dark:text-slate-400 border-b border-r border-slate-100 dark:border-slate-800">
                          {bank > 0 ? `${currencySymbol}${formatNumber(bank)}` : '—'}
                        </td>

                        {/* Column 12: Difference */}
                        <td className="py-2 px-3 text-right font-medium border-b border-r border-slate-100 dark:border-slate-800">
                          {exp.hasActualCost ? (
                            <span
                              className={
                                diff < 0
                                  ? 'text-rose-600 font-bold'
                                  : diff > 0
                                  ? 'text-emerald-600'
                                  : 'text-slate-400'
                              }
                            >
                              {diff < 0
                                ? `-${currencySymbol}${formatNumber(Math.abs(diff))}`
                                : `${currencySymbol}${formatNumber(diff)}`}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">Pending</span>
                          )}
                        </td>

                        {/* Column 13: Reference */}
                        <td className="py-2 px-3 font-sans text-slate-500 text-[10px] truncate max-w-[120px] border-b border-r border-slate-100 dark:border-slate-800">
                          {exp.reference || '—'}
                        </td>

                        {/* Frozen Right Column: Status */}
                        <td
                          className={`sticky right-[64px] z-10 w-[88px] min-w-[88px] max-w-[88px] py-2 px-1.5 text-center font-sans border-b border-l-2 border-slate-300 dark:border-slate-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)] ${
                            isSaving ? 'bg-indigo-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-900'
                          } group-hover:bg-slate-100 dark:group-hover:bg-slate-800`}
                        >
                          {exp.status === 'Paid' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                              <CheckCircle2 className="w-2.5 h-2.5" />
                              Paid
                            </span>
                          ) : exp.status === 'Scheduled' ? (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              <Clock className="w-2.5 h-2.5" />
                              Scheduled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              <Clock className="w-2.5 h-2.5" />
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Frozen Right Column: Action */}
                        <td className={`sticky right-0 z-10 w-[64px] min-w-[64px] max-w-[64px] py-2 px-1 text-center whitespace-nowrap border-b border-l border-slate-200 dark:border-slate-700 ${
                          isSaving ? 'bg-indigo-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-900'
                        } group-hover:bg-slate-100 dark:group-hover:bg-slate-800`} onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1">
                            {exp.isVirtualEstimate && exp.estimatedCost > 0 && (
                              <button
                                onClick={() => handleQuickConfirmEstimate(exp)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/60 rounded"
                                title={`Quick confirm ${currencySymbol}${formatNumber(exp.estimatedCost)} as Paid`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenRow(exp)}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded"
                              title={exp.hasActualCost ? 'Edit entry' : 'Record actual'}
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            {!exp.isVirtualEstimate && (
                              <button
                                onClick={() => onDeleteEntry(exp.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 rounded"
                                title="Reset to estimate"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* SUMMARY TOTALS ROW */}
                  <tr className="bg-slate-100/90 dark:bg-slate-800/90 font-bold text-slate-900 dark:text-white border-t-2 border-slate-300 dark:border-slate-700">
                    <td
                      colSpan={2}
                      className="py-3 px-3 font-sans uppercase tracking-wider text-[11px] border-b border-r border-slate-200 dark:border-slate-700"
                    >
                      Total Expense &amp; Outflows
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-amber-800 dark:text-amber-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(totalExpenseEstimated)}
                    </td>
                    <td className="py-3 px-3 text-right text-rose-600 dark:text-rose-400 text-xs font-mono border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(totalExpenseActual)}
                    </td>

                    {/* Breakdown Totals */}
                    <td className="py-3 px-2.5 text-right font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(paymentTotals.Cash || 0)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(paymentTotals['Credit Card'] || 0)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(paymentTotals['GCash Transfer'] || 0)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(paymentTotals['Kath Account'] || 0)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(paymentTotals['Checking Account'] || 0)}
                    </td>
                    <td className="py-3 px-2.5 text-right font-medium text-slate-700 dark:text-slate-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(paymentTotals['Bank Transfer'] || 0)}
                    </td>

                    <td className="py-3 px-3 text-right text-rose-600 font-mono border-b border-r border-slate-200 dark:border-slate-700">
                      {expenseDifference < 0
                        ? `-${currencySymbol}${formatNumber(Math.abs(expenseDifference))}`
                        : `${currencySymbol}${formatNumber(expenseDifference)}`}
                    </td>
                    {/* Reference empty */}
                    <td className="py-3 px-3 border-b border-r border-slate-200 dark:border-slate-700"></td>
                    {/* Frozen Right Column: Status */}
                    <td className="sticky right-[64px] z-10 w-[88px] min-w-[88px] max-w-[88px] bg-slate-100 dark:bg-slate-800 py-3 px-1.5 border-b border-l-2 border-slate-300 dark:border-slate-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]"></td>
                    {/* Frozen Right Column: Action */}
                    <td className="sticky right-0 z-10 w-[64px] min-w-[64px] max-w-[64px] bg-slate-100 dark:bg-slate-800 py-3 px-1 border-b border-l border-slate-200 dark:border-slate-700"></td>
                  </tr>

                  {/* Summary Income Row */}
                  <tr className="bg-slate-50 dark:bg-slate-850 font-semibold text-slate-700 dark:text-slate-300">
                    <td
                      colSpan={2}
                      className="py-2.5 px-3 font-sans border-b border-r border-slate-200 dark:border-slate-700"
                    >
                      Income
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-emerald-700 dark:text-emerald-300 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(totalIncomeEstimated)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 border-b border-r border-slate-200 dark:border-slate-700">
                      {currencySymbol}{formatNumber(totalIncomeActual)}
                    </td>
                    <td colSpan={8} className="border-b border-slate-200 dark:border-slate-700"></td>
                    {/* Frozen Right Column: Status */}
                    <td className="sticky right-[64px] z-10 w-[88px] min-w-[88px] max-w-[88px] bg-slate-50 dark:bg-slate-850 border-b border-l-2 border-slate-300 dark:border-slate-600 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]"></td>
                    {/* Frozen Right Column: Action */}
                    <td className="sticky right-0 z-10 w-[64px] min-w-[64px] max-w-[64px] bg-slate-50 dark:bg-slate-850 border-b border-l border-slate-200 dark:border-slate-700"></td>
                  </tr>

                  {/* REMAINING EXTRA SALARY ROW */}
                  <tr className="bg-gradient-to-r from-emerald-100/80 to-teal-100/80 dark:from-emerald-950/60 dark:to-teal-950/60 font-bold text-slate-900 dark:text-white border-t border-emerald-300 dark:border-emerald-800">
                    <td
                      colSpan={2}
                      className="py-3 px-3 font-sans text-xs text-emerald-900 dark:text-emerald-200 border-b border-r border-emerald-200 dark:border-emerald-800"
                    >
                      Extra / Remaining to Salary
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-xs text-emerald-800 dark:text-emerald-300 border-b border-r border-emerald-200 dark:border-emerald-800">
                      {currencySymbol}{formatNumber(remainingExtraEstimated)} (Est)
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-sm text-emerald-700 dark:text-emerald-300 border-b border-r border-emerald-200 dark:border-emerald-800">
                      {currencySymbol}{formatNumber(remainingExtra)}
                    </td>
                    <td colSpan={8} className="py-3 px-3 font-sans text-[11px] text-emerald-800 dark:text-emerald-300 border-b border-emerald-200 dark:border-emerald-800">
                      {totalIncomeActual > 0
                        ? `₱${formatNumber(remainingExtra)} remaining from your recorded salary!`
                        : `₱${formatNumber(remainingExtraEstimated)} projected remaining from estimated budget.`}
                    </td>
                    {/* Frozen Right Column: Status */}
                    <td className="sticky right-[64px] z-10 w-[88px] min-w-[88px] max-w-[88px] bg-emerald-100 dark:bg-emerald-950 border-b border-l-2 border-emerald-300 dark:border-emerald-800 shadow-[-4px_0_8px_-2px_rgba(0,0,0,0.12)]"></td>
                    {/* Frozen Right Column: Action */}
                    <td className="sticky right-0 z-10 w-[64px] min-w-[64px] max-w-[64px] bg-emerald-100 dark:bg-emerald-950 border-b border-l border-emerald-300 dark:border-emerald-800"></td>
                  </tr>

                </tbody>
              </table>
            </div>
          </div>

          {/* Payment Channel Breakdown Card */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-xl">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                    Payment Channel Breakdown ({selectedPeriod})
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Distribution of actual recorded expenses across payment methods
                  </span>
                </div>
              </div>
              <div className="text-right text-xs">
                <span className="text-slate-400 mr-1">Total Actual:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  {currencySymbol}{formatNumber(totalExpenseActual)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 text-xs">
              {PAYMENT_METHODS.map((method) => {
                const amt = paymentTotals[method] || 0;
                const pct = totalExpenseActual > 0 ? (amt / totalExpenseActual) * 100 : 0;
                return (
                  <div
                    key={method}
                    className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 border border-slate-100 dark:border-slate-800"
                  >
                    <span className="text-slate-500 text-[11px] block truncate" title={method}>
                      {method}
                    </span>
                    <span className="font-mono font-bold text-sm text-slate-900 dark:text-white mt-1 block">
                      {currencySymbol}{formatNumber(amt)}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {pct > 0 ? `${pct.toFixed(0)}% of total` : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

        </div>

      {/* MODAL: ADD / EDIT ENTRY WITH PRE-POPULATED ESTIMATE TEXT AND SALARY HUD */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] overflow-hidden flex flex-col">
            
            {/* Modal Header (Always Visible) */}
            <div className="p-5 sm:p-6 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className={`p-2.5 rounded-2xl ${
                  modalType === 'income'
                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                    : modalType === 'saving'
                    ? 'bg-teal-50 text-teal-600 dark:bg-teal-950 dark:text-teal-400'
                    : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                }`}>
                  {modalType === 'income' ? (
                    <TrendingUp className="w-5 h-5" />
                  ) : modalType === 'saving' ? (
                    <PiggyBank className="w-5 h-5" />
                  ) : (
                    <Receipt className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                    {editingEntryId
                      ? 'Update Entry'
                      : modalType === 'saving'
                      ? 'New Funds'
                      : `New ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Recording for {modalPeriod} ({budget.year})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-200/50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1">
              <form id="spreadsheet-entry-form" onSubmit={handleSubmitForm} className="space-y-5">
                {/* 3. TYPE SWITCHER */}
                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                    Entry Type
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setModalType('expense');
                        if (entrySourceMode === 'unplanned') {
                          setFormCategory(expenseCategories[0] || 'Budget');
                        } else {
                          const firstTpl = itemTemplates.find((t) => t.type === 'expense');
                          if (firstTpl) {
                            handleSelectTemplate(firstTpl.id);
                          } else {
                            setFormCategory(expenseCategories[0] || 'Budget');
                            setSelectedTemplateId('');
                          }
                        }
                      }}
                      className={`py-2 rounded-xl font-semibold border transition-all cursor-pointer ${
                        modalType === 'expense'
                          ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-400 text-rose-700 dark:text-rose-300 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalType('income');
                        if (entrySourceMode === 'unplanned') {
                          setFormCategory(incomeCategories[0] || 'Salary');
                        } else {
                          const firstTpl = itemTemplates.find((t) => t.type === 'income');
                          if (firstTpl) {
                            handleSelectTemplate(firstTpl.id);
                          } else {
                            setFormCategory(incomeCategories[0] || 'Salary');
                            setSelectedTemplateId('');
                          }
                        }
                      }}
                      className={`py-2 rounded-xl font-semibold border transition-all cursor-pointer ${
                        modalType === 'income'
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-400 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Income
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalType('saving');
                        setIsCreatingNewSinkingFund(false);
                        if (entrySourceMode === 'unplanned') {
                          const defaultFund = existingSinkingFunds[0] || savingCategories[0] || 'General Savings';
                          setFormCategory(savingCategories[0] || 'General Savings');
                          setFormItem(defaultFund);
                        } else {
                          const firstTpl = itemTemplates.find((t) => t.type === 'saving');
                          if (firstTpl) {
                            handleSelectTemplate(firstTpl.id);
                          } else {
                            const defaultFund = existingSinkingFunds[0] || savingCategories[0] || 'General Savings';
                            setFormCategory(savingCategories[0] || 'General Savings');
                            setFormItem(defaultFund);
                            setSelectedTemplateId('');
                          }
                        }
                      }}
                      className={`py-2 rounded-xl font-semibold border transition-all cursor-pointer ${
                        modalType === 'saving'
                          ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-400 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Funds
                    </button>
                  </div>
                </div>

                {/* 4. ITEM SELECTION & PRE-POPULATED ESTIMATE SELECTOR / UNPLANNED MODE */}
                {!isRowAction && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Item Source
                      </span>
                      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                        <button
                          type="button"
                          onClick={() => {
                            setEntrySourceMode('unplanned');
                            setSelectedTemplateId('');
                            setFormEstimated('0');
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            entrySourceMode === 'unplanned'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          ✨ Unplanned / One-Off
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEntrySourceMode('template');
                            const firstTpl = itemTemplates.find((t) => t.type === modalType);
                            if (firstTpl) {
                              handleSelectTemplate(firstTpl.id);
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            entrySourceMode === 'template'
                              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs font-bold'
                              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          ⚡ From Estimate Template
                        </button>
                      </div>
                    </div>

                    {entrySourceMode === 'template' ? (
                      <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-2xl border border-amber-200 dark:border-amber-800 animate-in fade-in duration-150">
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                            <span>Choose Template Item (Auto-fills Estimated Cost)</span>
                          </label>
                          <button
                            type="button"
                            onClick={() => setIsManagerModalOpen(true)}
                            className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                          >
                            Manage Templates
                          </button>
                        </div>
                        <select
                          value={selectedTemplateId}
                          onChange={(e) => handleSelectTemplate(e.target.value)}
                          className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 font-medium"
                        >
                          <option value="">⚡ Select Item Preset...</option>
                          {itemTemplates
                            .filter((t) => t.type === modalType && isTemplateValidForPeriod(t, frequency, modalPeriod))
                            .map((tpl) => (
                              <option key={tpl.id} value={tpl.id}>
                                {tpl.item} ({tpl.category}) — Est: {currencySymbol}{formatNumber(tpl.defaultEstimatedCost)}
                              </option>
                            ))}
                        </select>
                      </div>
                    ) : (
                      <div className="px-3.5 py-2 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/80 dark:border-indigo-800/60 text-xs text-indigo-800 dark:text-indigo-300 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                          <span className="font-semibold">Unplanned Entry:</span>
                          <span className="text-slate-600 dark:text-slate-400">
                            Only Category, Item name, and Actual cost are required.
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 5. CATEGORY & ITEM NAME / TARGET SINKING FUND */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                        {modalType === 'saving' ? 'Saving Category' : 'Category'}
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsManagerModalOpen(true)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                      >
                        Manage
                      </button>
                    </div>
                    <input
                      type="text"
                      list="category-options"
                      value={formCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                      placeholder="Select or type a category..."
                    />
                    <datalist id="category-options">
                      {(modalType === 'income'
                        ? incomeCategories
                        : modalType === 'saving'
                        ? savingCategories
                        : expenseCategories
                      ).map((cat) => (
                        <option key={cat} value={cat} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                        {modalType === 'saving' ? 'Target Sinking Fund (Envelope)' : 'Line Item Name'}
                      </label>
                      {modalType === 'saving' && isCreatingNewSinkingFund && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNewSinkingFund(false);
                            setFormItem(existingSinkingFunds[0] || formCategory || 'General Savings');
                          }}
                          className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer"
                        >
                          Select Existing Fund
                        </button>
                      )}
                    </div>

                    {modalType === 'saving' && !isCreatingNewSinkingFund ? (
                      <select
                        value={
                          existingSinkingFunds.includes(formItem)
                            ? formItem
                            : resolveCanonicalSinkingFundName(formItem, formCategory, existingSinkingFunds)
                        }
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === '__CREATE_NEW_FUND__') {
                            setIsCreatingNewSinkingFund(true);
                            setFormItem('');
                          } else {
                            handleItemChange(val);
                            setFormCategory(normalizeSavingCategoryGroup(val, formCategory));
                          }
                        }}
                        className="w-full px-3 py-2 bg-indigo-50/60 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                      >
                        {(() => {
                          const allFunds = Array.from(
                            new Set([
                              ...existingSinkingFunds,
                              ...(formItem && formItem.trim()
                                ? [resolveCanonicalSinkingFundName(formItem, formCategory, existingSinkingFunds)]
                                : []),
                            ])
                          );
                          const grouped = new Map<string, string[]>();
                          allFunds.forEach((f) => {
                            const grp = normalizeSavingCategoryGroup(f);
                            if (!grouped.has(grp)) grouped.set(grp, []);
                            grouped.get(grp)!.push(f);
                          });
                          return Array.from(grouped.entries()).map(([grpName, funds]) => (
                            <optgroup key={grpName} label={grpName}>
                              {funds.map((fundName) => (
                                <option key={fundName} value={fundName}>
                                  🎯 {fundName}
                                </option>
                              ))}
                            </optgroup>
                          ));
                        })()}
                        <option value="__CREATE_NEW_FUND__">➕ Create a New Sinking Fund...</option>
                      </select>
                    ) : (
                      <div className="space-y-1.5">
                        <input
                          type="text"
                          required
                          list={modalType === 'saving' ? 'existing-sinking-funds-list' : undefined}
                          placeholder={
                            modalType === 'saving'
                              ? 'Type new Sinking Fund name (e.g. Car Maintenance Fund)'
                              : 'e.g. Electricity Bill, Groceries & Market, Emergency Fund'
                          }
                          value={formItem}
                          onChange={(e) => handleItemChange(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium"
                        />
                        {modalType === 'saving' && (
                          <>
                            <datalist id="existing-sinking-funds-list">
                              {existingSinkingFunds.map((f) => (
                                <option key={f} value={f} />
                              ))}
                            </datalist>
                            {(() => {
                              const closeMatch = findClosestSinkingFundMatch(formItem, existingSinkingFunds);
                              if (
                                closeMatch &&
                                formItem.trim() &&
                                closeMatch.toLowerCase() !== formItem.trim().toLowerCase()
                              ) {
                                return (
                                  <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-[11px] text-amber-800 dark:text-amber-200">
                                    <span>
                                      Similar to existing fund <strong>&quot;{closeMatch}&quot;</strong>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsCreatingNewSinkingFund(false);
                                        handleItemChange(closeMatch);
                                      }}
                                      className="px-2 py-0.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-md cursor-pointer shrink-0"
                                    >
                                      Use &quot;{closeMatch}&quot;
                                    </button>
                                  </div>
                                );
                              }
                              return null;
                            })()}
                          </>
                        )}
                      </div>
                    )}
                    {modalType === 'saving' && !isCreatingNewSinkingFund && (
                      <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
                        Allocates directly into this existing Sinking Fund without creating duplicate funds from typos. Use Reference/Memo below for specific notes.
                      </p>
                    )}
                  </div>
                </div>

                {/* 6. ESTIMATED COST & ACTUAL COST */}
                {entrySourceMode === 'unplanned' ? (
                  <div className="space-y-2">
                    <div className="p-3.5 bg-rose-50/60 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-800/60">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-800 dark:text-slate-200">
                          {modalType === 'income' ? 'Actual Amount Received' : 'Actual Amount Paid'} ({currencySymbol})
                        </label>
                        <span className="text-[10px] font-semibold text-rose-600 dark:text-rose-400">
                          Required
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        placeholder="0.00"
                        value={formActual}
                        onChange={(e) => setFormActual(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-xl font-mono font-bold text-slate-900 dark:text-white text-base focus:ring-2 focus:ring-rose-500 outline-none"
                      />
                      <div className="flex items-center justify-between mt-1 text-[11px] text-slate-500">
                        <span>Baseline Estimate: <strong className="font-mono text-slate-600 dark:text-slate-400">₱0.00 (Unplanned)</strong></span>
                        <button
                          type="button"
                          onClick={() => {
                            setEntrySourceMode('template');
                            const firstTpl = itemTemplates.find((t) => t.type === modalType);
                            if (firstTpl) handleSelectTemplate(firstTpl.id);
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                        >
                          Have a planned estimate?
                        </button>
                      </div>
                    </div>

                    <div className="px-3 py-2 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-800/50 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="saveToTemplateSheetCheckbox"
                        checked={saveToTemplate}
                        onChange={(e) => setSaveToTemplate(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-amber-600 accent-amber-600 cursor-pointer shrink-0"
                      />
                      <label
                        htmlFor="saveToTemplateSheetCheckbox"
                        className="text-[11px] text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                      >
                        Also save this new item to recurring Estimate Budget Template for future periods
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3 bg-amber-50/50 dark:bg-amber-950/20 rounded-xl border border-amber-200 dark:border-amber-800/60">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-800 dark:text-slate-200 font-bold flex items-center gap-1">
                          <span>Estimated Cost ({currencySymbol})</span>
                        </label>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="e.g. 3500"
                        value={formEstimated}
                        onChange={(e) => setFormEstimated(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-xl font-mono font-bold text-slate-900 dark:text-white text-sm"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        From your personalized estimate template.
                      </p>
                    </div>

                    <div className="p-3 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-200 dark:border-rose-800/60">
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-800 dark:text-slate-200 font-bold">
                          Actual Cost ({currencySymbol})
                        </label>
                        <span className="text-[10px] text-rose-600 dark:text-rose-400 font-semibold">
                          Recorded Payment
                        </span>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formActual}
                        onChange={(e) => setFormActual(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-rose-300 dark:border-rose-700 rounded-xl font-mono font-bold text-slate-900 dark:text-white text-sm"
                      />
                      <p className="text-[10px] text-slate-500 mt-1">
                        Enter actual amount (0 is accepted).
                      </p>
                    </div>

                    <div className="sm:col-span-2 px-3 py-2 bg-amber-50/40 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-800/50 flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="saveToTemplateSheetCheckbox"
                        checked={saveToTemplate}
                        onChange={(e) => setSaveToTemplate(e.target.checked)}
                        className="w-3.5 h-3.5 rounded text-amber-600 accent-amber-600 cursor-pointer shrink-0"
                      />
                      <label
                        htmlFor="saveToTemplateSheetCheckbox"
                        className="text-[11px] text-slate-700 dark:text-slate-300 font-medium cursor-pointer"
                      >
                        Save this item &amp; estimated cost to my personal recurring Estimate Budget Template (syncs to Drive)
                      </label>
                    </div>
                  </div>
                )}

                {/* 7. PAYMENT METHOD / CHANNEL */}
                {modalType !== 'income' && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between">
                      <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                        Payment Channel / Account
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsSplitPayment((prev) => !prev)}
                        className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        {isSplitPayment ? 'Use Single Channel' : 'Split Across Multiple Channels'}
                      </button>
                    </div>
                    {!isSplitPayment ? (
                      <select
                        value={formPaymentMethod}
                        onChange={(e) => setFormPaymentMethod(e.target.value as PaymentMethod)}
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                      >
                        {PAYMENT_METHODS.map((pm) => (
                          <option key={pm} value={pm}>
                            {pm}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                        <p className="text-[10px] text-slate-500">
                          Enter amounts per channel. Actual Cost automatically updates to match the sum.
                        </p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {([
                            { key: 'cash', label: 'Cash' },
                            { key: 'creditCard', label: 'Credit Card' },
                            { key: 'gcashTransfer', label: 'GCash Transfer' },
                            { key: 'kathAccount', label: 'Kath Account' },
                            { key: 'checkAccount', label: 'Checking Account' },
                            { key: 'bankTransfer', label: 'Bank Transfer' },
                          ] as const).map((ch) => (
                            <div key={ch.key}>
                              <label className="block text-[10px] text-slate-500 truncate mb-0.5">
                                {ch.label}
                              </label>
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                placeholder="0"
                                value={formPaymentBreakdown[ch.key]}
                                onChange={(e) => {
                                  const next = {
                                    ...formPaymentBreakdown,
                                    [ch.key]: e.target.value,
                                  };
                                  setFormPaymentBreakdown(next);
                                  const totalSplit =
                                    (parseFloat(next.cash) || 0) +
                                    (parseFloat(next.creditCard) || 0) +
                                    (parseFloat(next.gcashTransfer) || 0) +
                                    (parseFloat(next.kathAccount) || 0) +
                                    (parseFloat(next.checkAccount) || 0) +
                                    (parseFloat(next.bankTransfer) || 0);
                                  setFormActual(String(totalSplit));
                                }}
                                className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 8. IF SAVING: CHOOSE LEDGER ACCOUNT */}
                {modalType === 'saving' && (
                  <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 space-y-1">
                    <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-semibold">
                      <PiggyBank className="w-4 h-4" />
                      <span>Destination Fund Account</span>
                    </div>
                    <select
                      value={formSavingAccountId}
                      onChange={(e) => setFormSavingAccountId(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-900 border border-indigo-200 rounded-lg text-xs"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* 9. DATE, STATUS, REFERENCE */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Date</label>
                    <input
                      type="date"
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    >
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Scheduled">Scheduled</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">Reference / Memo</label>
                  <input
                    type="text"
                    placeholder="e.g. official receipt, check #104, transfer ref"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </form>
            </div>

            {/* Modal Footer / Actions (Always Visible) */}
            <div className="p-4 sm:p-5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="px-4 py-2.5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="spreadsheet-entry-form"
                className="px-5 py-2.5 text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {editingEntryId ? 'Update Line Item' : 'Save to Period Sheet'}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: CATEGORY & ESTIMATED BUDGET TEMPLATE MANAGER */}
      <CategoryAndTemplateManagerModal
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        budget={budget}
        accounts={accounts}
        onUpdateCategories={onUpdateCategories}
        onUpdateTemplates={onUpdateTemplates}
        currencySymbol={currencySymbol}
      />

      {/* MODAL: CARRY OVER SURPLUS CONFIRMATION */}
      <CarryOverModal
        isOpen={isCarryOverModalOpen}
        onClose={() => setIsCarryOverModalOpen(false)}
        onConfirm={() => {
          const currentIndex = periodList.indexOf(selectedPeriod);
          const prevPeriod = periodList[currentIndex - 1];
          const prevEntries = budget.entries.filter((e) => e.period === prevPeriod);
          const incAct = prevEntries
            .filter((e) => e.type === 'income')
            .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
          const expAct = prevEntries
            .filter((e) => e.type === 'expense' || e.type === 'saving')
            .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
          const surplus = incAct - expAct;

          onAddEntry({
            year: budget.year,
            period: selectedPeriod,
            periodIndex: currentIndex,
            date: new Date().toISOString().split('T')[0],
            type: 'income',
            category: 'Other',
            item: `Carry-over from ${prevPeriod}`,
            amount: surplus,
            actualCost: surplus,
            status: 'Paid',
            description: `Carry-over from ${prevPeriod}`,
          });
        }}
        surplus={
          (function() {
            const currentIndex = periodList.indexOf(selectedPeriod);
            if (currentIndex <= 0) return 0;
            const prevPeriod = periodList[currentIndex - 1];
            const prevEntries = budget.entries.filter((e) => e.period === prevPeriod);
            const incAct = prevEntries
              .filter((e) => e.type === 'income')
              .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
            const expAct = prevEntries
              .filter((e) => e.type === 'expense' || e.type === 'saving')
              .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
            return incAct - expAct;
          })()
        }
        fromPeriod={
          (function() {
            const currentIndex = periodList.indexOf(selectedPeriod);
            return currentIndex > 0 ? periodList[currentIndex - 1] : '';
          })()
        }
        toPeriod={selectedPeriod}
        currencySymbol={currencySymbol}
      />

      <ExcelImportModal
        isOpen={isImportExcelOpen}
        onClose={() => setIsImportExcelOpen(false)}
        year={budget.year}
        defaultPeriod={selectedPeriod}
        currencySymbol={currencySymbol}
        onImportActualEntries={(targetPeriod, entries, replaceExistingInPeriod, discoveredExpenseCats) => {
          if (onAddMultipleEntries) {
            onAddMultipleEntries(entries, {
              replacePeriod: replaceExistingInPeriod ? targetPeriod : undefined,
              customExpenseCategories: discoveredExpenseCats,
            });
          } else {
            entries.forEach((entry) => onAddEntry(entry));
          }
          onSelectPeriod(targetPeriod);
        }}
      />

    </div>
  );
};
