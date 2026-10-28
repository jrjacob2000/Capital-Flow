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
  ChevronDown,
  ChevronRight,
  SlidersHorizontal,
  X,
  FileSpreadsheet,
  Check,
  Upload,
  Search,
  LayoutList,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
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
  const [mobileShowFullTable, setMobileShowFullTable] = useState<boolean>(false);
  const [mobileExpenseFilter, setMobileExpenseFilter] = useState<'all' | 'pending' | 'paid' | 'saving'>('all');
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<PaymentMethod | null>(null);
  const [expenseSearchQuery, setExpenseSearchQuery] = useState<string>('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [expandedIncomeRowId, setExpandedIncomeRowId] = useState<string | null>(null);

  // Sorting states for Expense & Income grids
  type ExpenseSortField = 'default' | 'item' | 'category' | 'estimated' | 'actual' | 'variance' | 'status' | 'mode';
  type IncomeSortField = 'default' | 'item' | 'status' | 'estimated' | 'actual' | 'variance' | 'reference';
  const [expenseSortField, setExpenseSortField] = useState<ExpenseSortField>('default');
  const [expenseSortDir, setExpenseSortDir] = useState<'asc' | 'desc'>('asc');
  const [incomeSortField, setIncomeSortField] = useState<IncomeSortField>('default');
  const [incomeSortDir, setIncomeSortDir] = useState<'asc' | 'desc'>('asc');

  const handleToggleExpenseSort = (field: ExpenseSortField) => {
    if (expenseSortField !== field) {
      setExpenseSortField(field);
      // Default numeric columns to descending (highest amount first), text columns to ascending
      setExpenseSortDir(field === 'estimated' || field === 'actual' || field === 'variance' ? 'desc' : 'asc');
    } else if (expenseSortDir === 'asc') {
      setExpenseSortDir('desc');
    } else {
      // Third click resets to default order
      setExpenseSortField('default');
      setExpenseSortDir('asc');
    }
  };

  const handleToggleIncomeSort = (field: IncomeSortField) => {
    if (incomeSortField !== field) {
      setIncomeSortField(field);
      setIncomeSortDir(field === 'estimated' || field === 'actual' || field === 'variance' ? 'desc' : 'asc');
    } else if (incomeSortDir === 'asc') {
      setIncomeSortDir('desc');
    } else {
      setIncomeSortField('default');
      setIncomeSortDir('asc');
    }
  };

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

  // Helper: Only regular Salary should be pre-displayed on the Income Sources grid by default.
  // Irregular income sources (Extra Income, Apartment Rent, Car Rental, 13th Month, Bonuses, etc.)
  // are only displayed in a period when actual income (> 0) has been received for them.
  const isRegularSalaryIncome = (itemName?: string, categoryName?: string): boolean => {
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
  };

  const handleAutoFillPeriodFromTemplates = () => {
    const validTemplates = itemTemplates.filter(
      (t) =>
        isTemplateValidForPeriod(t, frequency, selectedPeriod) &&
        (t.type !== 'income' || isRegularSalaryIncome(t.item, t.category))
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
        difference:
          t.type === 'saving'
            ? 0
            : t.type === 'income'
            ? -t.defaultEstimatedCost
            : t.defaultEstimatedCost,
        status: (t.type === 'saving' ? 'Paid' : 'Pending') as 'Paid' | 'Pending',
        reference: 'Auto-filled from template',
        toBeWithdrawn: Boolean(t.toBeWithdrawn),
        description: t.item || t.category,
        savingAccountId: t.type === 'saving' ? targetAcc?.id : undefined,
        savingAccountName: t.type === 'saving' ? targetAcc?.name : undefined,
        loanId: t.loanId,
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

  // UNIFIED SHEET ROWS: THE SHEET IS PRE-POPULATED WITH ESTIMATES (FOR INCOME, ONLY REGULAR SALARY IS PRE-POPULATED)
  const { unifiedIncomeRows, unifiedExpenseRows } = useMemo(() => {
    const recordedEntries = budget.entries.filter((e) => e.period === selectedPeriod);
    const usedEntryIds = new Set<string>();

    const incomeRows: SheetRowItem[] = [];
    const expenseRows: SheetRowItem[] = [];

    // 1. Populate from templates matching the current frequency mode
    itemTemplates
      .filter((tpl) => isTemplateValidForPeriod(tpl, frequency, selectedPeriod))
      .forEach((tpl) => {
      const tplItemLower = tpl.item.toLowerCase().trim();
      const matchingCandidates = recordedEntries.filter(
        (e) =>
          !usedEntryIds.has(e.id) &&
          e.type === tpl.type &&
          (e.item || e.description || '').toLowerCase().trim() === tplItemLower
      );
      const matchedEntry =
        matchingCandidates.find((e) => (e.actualCost !== undefined ? e.actualCost : e.amount) > 0) ||
        matchingCandidates[0];

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
          // Non-salary irregular income sources are only displayed if income was actually received (> 0)
          if (isRegularSalaryIncome(row.item, row.category) || act > 0) {
            incomeRows.push(row);
          }
        } else {
          expenseRows.push(row);
        }
      } else {
        // Not yet recorded: For income, ONLY pre-populate regular Salary; irregular income sources only appear when received
        if (tpl.type === 'income' && !isRegularSalaryIncome(tpl.item, tpl.category)) {
          return;
        }

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
          if (isRegularSalaryIncome(row.item, row.category) || act > 0) {
            incomeRows.push(row);
          }
        } else {
          expenseRows.push(row);
        }
      }
    });

    return { unifiedIncomeRows: incomeRows, unifiedExpenseRows: expenseRows };
  }, [budget.entries, itemTemplates, selectedPeriod, budget.year, frequency, accounts]);

  // Totals calculations across the pre-populated sheet (counting settled/Paid actuals)
  const totalIncomeEstimated = unifiedIncomeRows.reduce(
    (sum, r) => sum + r.estimatedCost,
    0
  );
  const totalIncomeActual = unifiedIncomeRows.reduce(
    (sum, r) => sum + (r.hasActualCost && r.status === 'Paid' ? r.actualCost : 0),
    0
  );
  const incomeDifference = totalIncomeActual - totalIncomeEstimated;

  const totalExpenseEstimated = unifiedExpenseRows.reduce(
    (sum, r) => sum + r.estimatedCost,
    0
  );
  const totalExpenseActual = unifiedExpenseRows.reduce(
    (sum, r) => sum + (r.hasActualCost && r.status === 'Paid' ? r.actualCost : 0),
    0
  );
  const expenseDifference = totalExpenseEstimated - totalExpenseActual;

  // Extra / Remaining Salary
  const remainingExtra = totalIncomeActual - totalExpenseActual;
  const remainingExtraEstimated = totalIncomeEstimated - totalExpenseEstimated;

  const hasAnyIncomeRecorded = useMemo(
    () => unifiedIncomeRows.some((r) => r.hasActualCost && r.status === 'Paid'),
    [unifiedIncomeRows]
  );
  const receivedIncomeCount = useMemo(
    () => unifiedIncomeRows.filter((r) => r.hasActualCost && r.status === 'Paid').length,
    [unifiedIncomeRows]
  );
  const allIncomeReceived = useMemo(
    () => unifiedIncomeRows.length > 0 && receivedIncomeCount === unifiedIncomeRows.length,
    [unifiedIncomeRows.length, receivedIncomeCount]
  );
  const [isIncomeCollapsed, setIsIncomeCollapsed] = useState<boolean>(false);

  useEffect(() => {
    setIsIncomeCollapsed(allIncomeReceived);
  }, [selectedPeriod, allIncomeReceived]);

  const hasAnyExpenseRecorded = useMemo(
    () => unifiedExpenseRows.some((r) => r.hasActualCost && r.status === 'Paid'),
    [unifiedExpenseRows]
  );

  const totalExpensePaid = totalExpenseActual;

  const currentRemainingPaid = hasAnyIncomeRecorded
    ? totalIncomeActual - totalExpensePaid
    : remainingExtraEstimated;

  const projectedRemainingAll = hasAnyIncomeRecorded
    ? totalIncomeActual - totalExpenseActual
    : remainingExtraEstimated;

  const { surplus, hasBeenCarriedOver, prevPeriodName } = useMemo(() => {
    const currentIndex = periodList.indexOf(selectedPeriod);
    if (currentIndex <= 0) return { surplus: 0, hasBeenCarriedOver: true, prevPeriodName: '' };
    const prevPeriod = periodList[currentIndex - 1];
    const prevEntries = budget.entries.filter((e) => e.period === prevPeriod && e.status !== 'Pending');
    const incAct = prevEntries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const expAct = prevEntries
      .filter((e) => e.type === 'expense' || e.type === 'saving')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const surplus = incAct - expAct;
    const hasBeenCarriedOver = budget.entries.some(
      (e) => e.period === selectedPeriod && (e.description || e.item || '').includes('Carry-over')
    );
    return { surplus, hasBeenCarriedOver, prevPeriodName: prevPeriod };
  }, [budget.entries, periodList, selectedPeriod]);

  // Helpers
  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(num);

  const getMethodAmount = (entry: SheetRowItem, method: PaymentMethod): number => {
    if (!entry.hasActualCost || entry.status !== 'Paid') return 0;
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

  const getActivePaymentChannels = (entry: SheetRowItem): { label: string; amount: number }[] => {
    if (!entry.hasActualCost || entry.status !== 'Paid') return [];
    const channels: { label: string; amount: number }[] = [
      { label: 'Cash', amount: getMethodAmount(entry, 'Cash') },
      { label: 'Credit Card', amount: getMethodAmount(entry, 'Credit Card') },
      { label: 'GCash', amount: getMethodAmount(entry, 'GCash Transfer') },
      { label: 'Kath Acct', amount: getMethodAmount(entry, 'Kath Account') },
      { label: 'Check Acct', amount: getMethodAmount(entry, 'Checking Account') },
      { label: 'Bank Transfer', amount: getMethodAmount(entry, 'Bank Transfer') },
    ].filter((c) => c.amount > 0);
    if (channels.length === 0 && entry.actualCost > 0) {
      return [{ label: entry.paymentMethod || 'Bank Transfer', amount: entry.actualCost }];
    }
    return channels;
  };

  const sortedIncomeRows = useMemo(() => {
    if (incomeSortField === 'default') return unifiedIncomeRows;
    const rows = [...unifiedIncomeRows];
    const mult = incomeSortDir === 'asc' ? 1 : -1;
    rows.sort((a, b) => {
      switch (incomeSortField) {
        case 'item': {
          const cmp = a.item.localeCompare(b.item, undefined, { sensitivity: 'base' });
          return cmp !== 0 ? cmp * mult : a.category.localeCompare(b.category) * mult;
        }
        case 'status': {
          const rank = (r: SheetRowItem) => (r.status === 'Paid' ? 2 : r.status === 'Scheduled' ? 1 : 0);
          const diff = rank(a) - rank(b);
          return diff !== 0 ? diff * mult : a.item.localeCompare(b.item) * mult;
        }
        case 'estimated':
          return (a.estimatedCost - b.estimatedCost) * mult;
        case 'actual': {
          const actA = a.hasActualCost && a.status === 'Paid' ? a.actualCost : -1;
          const actB = b.hasActualCost && b.status === 'Paid' ? b.actualCost : -1;
          return (actA - actB) * mult;
        }
        case 'variance': {
          const varA = a.hasActualCost && a.status === 'Paid' ? a.actualCost - a.estimatedCost : -999999999;
          const varB = b.hasActualCost && b.status === 'Paid' ? b.actualCost - b.estimatedCost : -999999999;
          return (varA - varB) * mult;
        }
        case 'reference':
          return (a.reference || '').localeCompare(b.reference || '', undefined, { sensitivity: 'base' }) * mult;
        default:
          return 0;
      }
    });
    return rows;
  }, [unifiedIncomeRows, incomeSortField, incomeSortDir]);

  const filteredExpenseRows = useMemo(() => {
    const filtered = unifiedExpenseRows.filter((exp) => {
      if (mobileExpenseFilter === 'pending' && exp.status === 'Paid') return false;
      if (mobileExpenseFilter === 'paid' && exp.status !== 'Paid') return false;
      if (
        mobileExpenseFilter === 'saving' &&
        exp.type !== 'saving' &&
        exp.category !== 'Savings'
      ) {
        return false;
      }
      if (paymentMethodFilter) {
        const methodAmt = getMethodAmount(exp, paymentMethodFilter);
        const matchesPendingMethod = exp.status !== 'Paid' && exp.paymentMethod === paymentMethodFilter;
        if (methodAmt <= 0 && !matchesPendingMethod) return false;
      }
      if (expenseSearchQuery.trim()) {
        const q = expenseSearchQuery.toLowerCase();
        const matchItem = exp.item.toLowerCase().includes(q);
        const matchCat = exp.category.toLowerCase().includes(q);
        const matchRef = (exp.reference || '').toLowerCase().includes(q);
        const matchMethod = (exp.paymentMethod || '').toLowerCase().includes(q);
        if (!matchItem && !matchCat && !matchRef && !matchMethod) return false;
      }
      return true;
    });

    if (expenseSortField === 'default') return filtered;

    const sorted = [...filtered];
    const mult = expenseSortDir === 'asc' ? 1 : -1;
    sorted.sort((a, b) => {
      switch (expenseSortField) {
        case 'item': {
          const cmp = a.item.localeCompare(b.item, undefined, { sensitivity: 'base' });
          return cmp !== 0 ? cmp * mult : a.category.localeCompare(b.category) * mult;
        }
        case 'category': {
          const cmp = a.category.localeCompare(b.category, undefined, { sensitivity: 'base' });
          return cmp !== 0 ? cmp * mult : a.item.localeCompare(b.item) * mult;
        }
        case 'estimated': {
          const diff = a.estimatedCost - b.estimatedCost;
          return diff !== 0 ? diff * mult : a.item.localeCompare(b.item);
        }
        case 'actual': {
          const actA = a.hasActualCost && a.status === 'Paid' ? a.actualCost : -1;
          const actB = b.hasActualCost && b.status === 'Paid' ? b.actualCost : -1;
          const diff = actA - actB;
          return diff !== 0 ? diff * mult : (a.estimatedCost - b.estimatedCost) * mult;
        }
        case 'variance': {
          const varA = a.hasActualCost && a.status === 'Paid' ? a.estimatedCost - a.actualCost : -999999999;
          const varB = b.hasActualCost && b.status === 'Paid' ? b.estimatedCost - b.actualCost : -999999999;
          const diff = varA - varB;
          return diff !== 0 ? diff * mult : (b.estimatedCost - a.estimatedCost);
        }
        case 'status': {
          const paidA = a.status === 'Paid' && a.hasActualCost ? 1 : 0;
          const paidB = b.status === 'Paid' && b.hasActualCost ? 1 : 0;
          if (paidA !== paidB) return (paidA - paidB) * mult;
          return (b.estimatedCost - a.estimatedCost);
        }
        case 'mode': {
          const chA = getActivePaymentChannels(a).map((c) => c.label).join(', ') || a.paymentMethod || '';
          const chB = getActivePaymentChannels(b).map((c) => c.label).join(', ') || b.paymentMethod || '';
          const cmp = chA.localeCompare(chB, undefined, { sensitivity: 'base' });
          return cmp !== 0 ? cmp * mult : a.item.localeCompare(b.item);
        }
        default:
          return 0;
      }
    });
    return sorted;
  }, [unifiedExpenseRows, mobileExpenseFilter, paymentMethodFilter, expenseSearchQuery, expenseSortField, expenseSortDir]);

  const isExpenseFiltered =
    mobileExpenseFilter !== 'all' ||
    paymentMethodFilter !== null ||
    expenseSearchQuery.trim().length > 0;

  const filteredExpenseEstimated = useMemo(
    () => filteredExpenseRows.reduce((sum, r) => sum + r.estimatedCost, 0),
    [filteredExpenseRows]
  );

  const filteredExpenseActual = useMemo(
    () =>
      filteredExpenseRows.reduce(
        (sum, r) => sum + (r.hasActualCost && r.status === 'Paid' ? r.actualCost : 0),
        0
      ),
    [filteredExpenseRows]
  );

  // Breakdown by payment methods for rows with settled actuals recorded
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
      if (e.hasActualCost && e.status === 'Paid') {
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
    setFormSavingAccountId(row.savingAccountId || accounts[0]?.id || '');
    setSelectedTemplateId(row.templateId || '');
    setEntrySourceMode(row.templateId || row.isVirtualEstimate || (row.estimatedCost && row.estimatedCost > 0) ? 'template' : 'unplanned');
    setSaveToTemplate(false);
    setIsAddModalOpen(true);
  };

  // One-click quick confirm estimate or pending entry as Paid
  const handleQuickConfirmEstimate = (row: SheetRowItem) => {
    const estNum = row.estimatedCost || 0;
    if (!row.isVirtualEstimate) {
      const settledAmount = row.actualCost > 0 ? row.actualCost : estNum;
      onUpdateEntry(row.id, {
        status: 'Paid',
        actualCost: settledAmount,
        amount: settledAmount,
        difference: row.type === 'income' ? settledAmount - estNum : estNum - settledAmount,
      });
      return;
    }

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
    let actNum =
      formActual.trim() !== '' && !isNaN(parseFloat(formActual))
        ? parseFloat(formActual)
        : 0;

    const resolvedFundOrItem =
      modalType === 'saving'
        ? isCreatingNewSinkingFund
          ? formItem.trim() || formCategory
          : resolveCanonicalSinkingFundName(formItem.trim() || formCategory, formCategory, existingSinkingFunds)
        : formItem.trim() || formCategory;

    // For irregular (non-salary) income items, only received income (actual > 0) is displayed.
    // If the user selected a template and typed the amount into Estimated while leaving Actual blank/0, use Estimated as Actual.
    if (
      modalType === 'income' &&
      !isRegularSalaryIncome(resolvedFundOrItem, formCategory) &&
      actNum <= 0 &&
      estNum > 0
    ) {
      actNum = estNum;
    }

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

    const isCashExplicit = formPaymentMethod === 'Cash';
    const isCashInSplit = Boolean(parsedBreakdown && (parsedBreakdown.cash || 0) > 0);
    const computedToBeWithdrawn = isCashExplicit || isCashInSplit;

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
      toBeWithdrawn: computedToBeWithdrawn,
      description: resolvedFundOrItem,
      savingAccountId: modalType === 'saving' ? formSavingAccountId : undefined,
      savingAccountName: modalType === 'saving' ? selectedAcc?.name : undefined,
    };

    // Auto-save or update personalized Estimate Budget Template if requested or if virtual row estimate was edited directly
    const trimmedItem = formItem.trim() || formCategory;
    if (trimmedItem && (saveToTemplate || (isRowAction && selectedTemplateId && estNum > 0))) {
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
                  toBeWithdrawn: formPaymentMethod === 'Cash',
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
          toBeWithdrawn: formPaymentMethod === 'Cash',
        };
        onUpdateTemplates([...itemTemplates, newTpl]);
      }
    }

    if (editingEntryId) {
      onUpdateEntry(editingEntryId, entryPayload);
    } else {
      // If a zero-amount placeholder entry already exists for this item in the same period, update it instead of creating a duplicate
      const existingZeroEntry = budget.entries.find(
        (en) =>
          en.period === modalPeriod &&
          en.type === modalType &&
          (en.item || en.description || '').toLowerCase().trim() === resolvedFundOrItem.toLowerCase().trim() &&
          (en.actualCost !== undefined ? en.actualCost : en.amount) === 0
      );
      if (existingZeroEntry) {
        onUpdateEntry(existingZeroEntry.id, entryPayload);
      } else {
        onAddEntry(entryPayload);
      }
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
      const act = inc.hasActualCost && inc.status === 'Paid' ? inc.actualCost : 0;
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
      const act = exp.hasActualCost && exp.status === 'Paid' ? exp.actualCost : 0;
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
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
        {/* Row 1: Title & Actions */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 sm:gap-4">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white shrink-0">
                  Period Ledger &amp; Cash Flow Sheet
                </h2>
                <span className="inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap shrink-0 leading-none">
                  {selectedPeriod} ({budget.year})
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Estimates are pre-loaded on your sheet. Tap any line item to record or adjust actual amounts.
              </p>
            </div>
          </div>

          {/* Period Utility Actions (Creation buttons live contextually in each section below) */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 shrink-0">
            {/* View Mode Switcher: Cards vs Table (Mobile Only — Desktop automatically uses full Table View) */}
            <div className="flex md:hidden items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs mr-1">
              <button
                type="button"
                onClick={() => setMobileShowFullTable(false)}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  !mobileShowFullTable
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'
                }`}
                title="Switch to clean Card View"
              >
                <LayoutList className="w-3.5 h-3.5" />
                <span>Cards</span>
              </button>
              <button
                type="button"
                onClick={() => setMobileShowFullTable(true)}
                className={`px-2.5 py-1 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer ${
                  mobileShowFullTable
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold shadow-2xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-semibold'
                }`}
                title="Switch to compact Table View"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Table</span>
              </button>
            </div>

            <button
              onClick={handleAutoFillPeriodFromTemplates}
              className="px-3 py-2 sm:py-1.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title={`Populate ${selectedPeriod} with all planned items from your Estimate Budget Template`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-200 shrink-0" />
              <span>Auto-Fill {selectedPeriod}</span>
            </button>

            <button
              onClick={() => setIsManagerModalOpen(true)}
              className="px-3 py-2 sm:py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              title="Manage recurring estimated budget templates and categories"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>
                Templates{budget.isPersonalizedTemplate && itemTemplates.length > 0 ? ` (${itemTemplates.length})` : ''}
              </span>
            </button>

            <button
              onClick={() => setIsImportExcelOpen(true)}
              className="px-2.5 sm:px-3 py-2 sm:py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/70 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 text-xs font-semibold rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1 transition-colors cursor-pointer"
              title="Import actual data from any worksheet tab in your Excel (.xlsx) file"
            >
              <Upload className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Import Excel</span>
              <span className="sm:hidden">Import</span>
            </button>

            <button
              onClick={handleExportCSV}
              className="px-2.5 sm:px-3 py-2 sm:py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
              title="Download CSV without currency symbols for easy spreadsheet analysis"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">Export CSV</span>
              <span className="sm:hidden">CSV</span>
            </button>
          </div>
        </div>

        {/* Row 2: Dedicated Period Navigator Bar */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center gap-3 min-w-0">
          <div className="flex items-center justify-between md:justify-start gap-2 shrink-0">
            <div className="flex items-center gap-2">
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4">
        
        {/* CARD 1: SALARY & INCOME */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-1">
            <span className="font-semibold uppercase tracking-wider truncate">Income ({selectedPeriod})</span>
            <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 truncate">
            {currencySymbol}{formatNumber(hasAnyIncomeRecorded ? totalIncomeActual : totalIncomeEstimated)}
            {!hasAnyIncomeRecorded && <span className="text-[11px] text-slate-400 ml-1 font-normal">(Est)</span>}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] sm:text-[11px] text-slate-400 mt-1 gap-0.5">
            <span>Est: {currencySymbol}{formatNumber(totalIncomeEstimated)}</span>
            <span className={hasAnyIncomeRecorded ? 'text-emerald-600 font-semibold' : 'text-slate-400 font-semibold'}>
              Act: {hasAnyIncomeRecorded ? `${currencySymbol}${formatNumber(totalIncomeActual)}` : '—'}
            </span>
          </div>
        </div>

        {/* CARD 2: TOTAL EXPENSES & SAVINGS */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-4 border border-slate-200 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-500 mb-1">
            <span className="font-semibold uppercase tracking-wider truncate">Outflow &amp; Funds</span>
            <Receipt className="w-4 h-4 text-rose-500 shrink-0" />
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-rose-600 dark:text-rose-400 truncate">
            {currencySymbol}{formatNumber(hasAnyExpenseRecorded ? totalExpenseActual : totalExpenseEstimated)}
            {!hasAnyExpenseRecorded && <span className="text-[11px] text-slate-400 ml-1 font-normal">(Est)</span>}
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between text-[10px] sm:text-[11px] text-slate-400 mt-1 gap-0.5">
            <span>Est: {currencySymbol}{formatNumber(totalExpenseEstimated)}</span>
            <span className={hasAnyExpenseRecorded ? 'text-slate-700 dark:text-slate-300 font-semibold' : 'text-slate-400'}>
              Act: {hasAnyExpenseRecorded ? `${currencySymbol}${formatNumber(totalExpenseActual)}` : '—'}
            </span>
          </div>
        </div>

        {/* CARD 3: REMAINING TO SALARY */}
        <div className="col-span-2 md:col-span-1 bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl p-3.5 sm:p-4 text-white shadow-md">
          <div className="flex items-center justify-between text-xs text-emerald-100 mb-1">
            <span className="font-bold uppercase tracking-wider">Remaining to Salary ({selectedPeriod})</span>
            <Sparkles className="w-4 h-4 text-amber-300" />
          </div>
          <div className="text-xl font-black font-mono">
            {currencySymbol}{formatNumber(currentRemainingPaid)}
            {!hasAnyIncomeRecorded && <span className="text-xs text-emerald-100 ml-1 font-normal">(Est)</span>}
          </div>
          <div className="flex items-center justify-between text-[11px] text-emerald-100 mt-1 font-medium">
            <span>Projected net: {currencySymbol}{formatNumber(projectedRemainingAll)}</span>
            <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
              {currentRemainingPaid >= 0 ? 'Safe Surplus' : 'Deficit'}
            </span>
          </div>
        </div>

      </div>

      {/* SPREADSHEET MAIN CONTAINER */}
      <div className="space-y-6">
          
          {/* 1. INCOME TABLE - PRE-POPULATED ESTIMATES (Auto-collapses when all received) */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-all">
            <div
              onClick={() => setIsIncomeCollapsed((prev) => !prev)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  setIsIncomeCollapsed((prev) => !prev);
                }
              }}
              className={`p-3 sm:px-4 sm:py-3 bg-slate-50/80 dark:bg-slate-800/60 hover:bg-emerald-50/40 dark:hover:bg-slate-800 transition-colors cursor-pointer select-none flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 ${
                !isIncomeCollapsed ? 'border-b border-slate-200 dark:border-slate-800' : ''
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 min-w-0">
                <span className="p-1 rounded-lg bg-emerald-100/70 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300">
                  {isIncomeCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </span>
                <span className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                  Income Sources ({selectedPeriod})
                </span>
                {allIncomeReceived ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/90 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>All Received ({receivedIncomeCount}/{unifiedIncomeRows.length})</span>
                  </span>
                ) : (
                  <span className="text-[10px] text-slate-500 font-mono bg-emerald-50 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                    {receivedIncomeCount}/{unifiedIncomeRows.length} received
                  </span>
                )}

                {/* Compact Summary Readout when Collapsed */}
                {isIncomeCollapsed && (
                  <div className="flex items-center gap-2 text-xs font-mono bg-white dark:bg-slate-900 px-2.5 py-1 rounded-xl border border-emerald-200/80 dark:border-emerald-800/70 shadow-2xs">
                    <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                      Est: {currencySymbol}{formatNumber(totalIncomeEstimated)}
                    </span>
                    <span className="text-slate-300 dark:text-slate-700">•</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      Actual: {currencySymbol}{formatNumber(totalIncomeActual)}
                    </span>
                  </div>
                )}

                {surplus > 0 && !hasBeenCarriedOver && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsCarryOverModalOpen(true);
                    }}
                    className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg border border-amber-600 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
                  >
                    <ArrowRight className="w-3.5 h-3.5" />
                    <span>Carry Over Surplus: {currencySymbol}{formatNumber(surplus)}</span>
                  </button>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                <button
                  type="button"
                  onClick={() => setIsIncomeCollapsed((prev) => !prev)}
                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:text-emerald-700 dark:hover:text-emerald-300 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl transition-colors cursor-pointer"
                >
                  {isIncomeCollapsed ? 'Expand' : 'Collapse'}
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenAdd('income')}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer shrink-0"
                  title="Add an income source for this period"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Income</span>
                </button>
              </div>
            </div>

            {!isIncomeCollapsed && (
              <>
            {/* INCOME CLEAN CARDS VIEW (Mobile Only when Cards selected) */}
            <div className={mobileShowFullTable ? 'hidden' : 'md:hidden'}>
                {sortedIncomeRows.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    No income sources recorded for {selectedPeriod} yet.
                  </div>
                ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sortedIncomeRows.map((inc) => {
                    const est = inc.estimatedCost;
                    const act = inc.actualCost;
                    const diff = inc.hasActualCost ? act - est : 0;
                    const isReceived = inc.hasActualCost && inc.status === 'Paid';
                    const canQuickConfirm = !isReceived && (est > 0 || act > 0);
                    const isExpanded = expandedIncomeRowId === inc.id;
                    return (
                      <div
                        key={inc.id}
                        className="bg-white dark:bg-slate-900 transition-all overflow-hidden flex flex-col justify-between"
                      >
                        <div
                          onClick={() => setExpandedIncomeRowId(isExpanded ? null : inc.id)}
                          className="px-3.5 py-2.5 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20 transition-colors cursor-pointer flex items-center justify-between gap-3"
                        >
                          {/* Left: Clean Item Title + Unboxed Subtitle */}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {isReceived ? (
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              ) : isExpanded ? (
                                <ChevronDown className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              )}
                              <span className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                                {inc.item}
                              </span>
                            </div>
                            <div className="pl-5 mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              <span className="truncate">{inc.category}</span>
                              {inc.reference && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className="truncate">{inc.reference}</span>
                                </>
                              )}
                            </div>
                          </div>

                          {/* Right: Clean Amount + Single Primary Action */}
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right font-mono leading-tight">
                              {isReceived ? (
                                <>
                                  <div className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                                    {currencySymbol}{formatNumber(act)}
                                  </div>
                                  {est > 0 && est !== act && (
                                    <div className="text-[10px] text-slate-400">
                                      Est {currencySymbol}{formatNumber(est)}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                  {est > 0 ? `${currencySymbol}${formatNumber(est)}` : '—'}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              {canQuickConfirm && (
                                <button
                                  onClick={() => handleQuickConfirmEstimate(inc)}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                  title={`Confirm ${currencySymbol}${formatNumber(act > 0 ? act : est)} as Received`}
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Receive</span>
                                </button>
                              )}
                              <button
                                onClick={() => handleOpenRow(inc)}
                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                title="Edit Income"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="px-3.5 pb-2.5 pt-1.5 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800/80 text-[11px] flex flex-wrap items-center justify-between gap-2 animate-in fade-in duration-150">
                            <div className="flex flex-wrap items-center gap-2 font-mono text-slate-500 dark:text-slate-400">
                              <span>Est: <strong className="text-slate-700 dark:text-slate-200">{currencySymbol}{formatNumber(est)}</strong></span>
                              <span aria-hidden="true">·</span>
                              <span>Actual: <strong className="text-emerald-600 dark:text-emerald-400">{inc.hasActualCost ? `${currencySymbol}${formatNumber(act)}` : '—'}</strong></span>
                              {inc.hasActualCost && diff !== 0 && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span className={diff > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                    {diff > 0 ? `+${currencySymbol}${formatNumber(diff)}` : `-${currencySymbol}${formatNumber(Math.abs(diff))}`}
                                  </span>
                                </>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={() => handleOpenRow(inc)}
                                className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold flex items-center gap-1"
                              >
                                <Edit2 className="w-3 h-3" />
                                <span>Edit</span>
                              </button>
                              {!inc.isVirtualEstimate && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteEntry(inc.id)}
                                  className="px-2 py-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-[10px] font-semibold flex items-center gap-1"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Reset</span>
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                )}
                <div className="px-3.5 py-2.5 bg-emerald-50/80 dark:bg-emerald-950/40 flex items-center justify-between text-xs font-bold border-t border-emerald-200 dark:border-emerald-800">
                  <span className="text-slate-800 dark:text-slate-200">Total Income</span>
                  <div className="font-mono flex items-center gap-3">
                    <span className="text-slate-500 font-normal text-[10px]">Est {currencySymbol}{formatNumber(totalIncomeEstimated)}</span>
                    <span className="text-emerald-600 dark:text-emerald-400 text-xs">{currencySymbol}{formatNumber(totalIncomeActual)}</span>
                  </div>
                </div>
            </div>

            {/* #1: INCOME SPREADSHEET TABLE (Always shown on Desktop md+, or on Mobile when Table selected) */}
            <div className={`${mobileShowFullTable ? 'block' : 'hidden md:block'} overflow-x-auto scrollbar-thin`}>
              <table className="w-full text-left text-xs md:text-[13px] font-mono border-separate border-spacing-0 whitespace-nowrap">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-[11px] md:text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-sans font-semibold">
                  <tr>
                    <th
                      onClick={() => handleToggleIncomeSort('item')}
                      className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 py-2 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none border-b border-r border-slate-200/80 dark:border-slate-800 truncate cursor-pointer select-none transition-colors"
                      title="Sort by Income Item"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Item</span>
                        {incomeSortField === 'item' ? (
                          incomeSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleIncomeSort('status')}
                      className="hidden md:table-cell py-2.5 px-3 text-center border-b border-slate-200/80 dark:border-slate-800 w-[100px] hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Status"
                    >
                      <div className="inline-flex items-center justify-center gap-1">
                        <span>Status</span>
                        {incomeSortField === 'status' ? (
                          incomeSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleIncomeSort('estimated')}
                      className="py-2 px-3 md:py-2.5 md:px-4 text-right border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Estimated Income"
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Estimated</span>
                        {incomeSortField === 'estimated' ? (
                          incomeSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleIncomeSort('actual')}
                      className="py-2 px-3 md:py-2.5 md:px-4 text-right border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Actual Income"
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Actual</span>
                        {incomeSortField === 'actual' ? (
                          incomeSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleIncomeSort('variance')}
                      className="hidden md:table-cell py-2.5 px-4 text-right border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Income Variance (Actual vs Estimated)"
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Variance</span>
                        {incomeSortField === 'variance' ? (
                          incomeSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th
                      onClick={() => handleToggleIncomeSort('reference')}
                      className="hidden md:table-cell py-2.5 px-4 md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] text-left border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 truncate cursor-pointer select-none transition-colors"
                      title="Sort by Reference"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Reference</span>
                        {incomeSortField === 'reference' ? (
                          incomeSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>
                    <th className="md:sticky md:right-0 md:z-20 w-[64px] md:w-[88px] bg-slate-50 dark:bg-slate-800 py-2 px-2 md:py-2.5 md:px-3.5 text-right border-b border-l border-slate-200/80 dark:border-slate-800">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {sortedIncomeRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-6 text-center font-sans text-xs md:text-sm text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                        No income sources recorded for {selectedPeriod} yet.
                      </td>
                    </tr>
                  ) : sortedIncomeRows.map((inc) => {
                    const est = inc.estimatedCost;
                    const act = inc.actualCost;
                    const diff = inc.hasActualCost ? act - est : 0;
                    const isReceived = inc.status === 'Paid' && inc.hasActualCost;
                    const canQuickConfirm = !isReceived && (est > 0 || act > 0);

                    return (
                      <tr
                        key={inc.id}
                        onClick={() => handleOpenRow(inc)}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group"
                      >
                        {/* Item + Category */}
                        <td
                          className="sticky left-0 z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 py-1.5 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none font-sans border-b border-r border-slate-100 dark:border-slate-800/80"
                          title={`${inc.item} (${inc.category})`}
                        >
                          <div className="flex items-center gap-1 md:gap-1.5 min-w-0">
                            {isReceived && (
                              <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-500 shrink-0" />
                            )}
                            <span className="font-semibold text-xs md:text-sm text-slate-900 dark:text-slate-100 truncate">
                              {inc.item}
                            </span>
                          </div>
                          <div className="text-[10px] md:text-xs text-slate-400 dark:text-slate-500 truncate leading-tight">
                            {inc.category}
                          </div>
                        </td>

                        {/* Status (Desktop Only) */}
                        <td className="hidden md:table-cell py-2.5 px-3 text-center font-sans border-b border-slate-100 dark:border-slate-800/80">
                          {isReceived ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70">
                              Received
                            </span>
                          ) : inc.status === 'Scheduled' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/70 dark:border-blue-800/70">
                              Scheduled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Estimated */}
                        <td className="py-2 px-3 md:py-2.5 md:px-4 text-right text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                          {est > 0 ? `${currencySymbol}${formatNumber(est)}` : '—'}
                        </td>

                        {/* Actual */}
                        <td className="py-2 px-3 md:py-2.5 md:px-4 text-right border-b border-slate-100 dark:border-slate-800/80">
                          {isReceived ? (
                            <div className="leading-tight">
                              <div className="font-bold text-emerald-600 dark:text-emerald-400">
                                {currencySymbol}{formatNumber(act)}
                              </div>
                              {est > 0 && diff !== 0 && (
                                <div
                                  className={`md:hidden text-[10px] ${
                                    diff < 0 ? 'text-rose-500' : 'text-emerald-600'
                                  }`}
                                >
                                  {diff > 0
                                    ? `+${currencySymbol}${formatNumber(diff)}`
                                    : `-${currencySymbol}${formatNumber(Math.abs(diff))}`}
                                </div>
                              )}
                            </div>
                          ) : canQuickConfirm ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickConfirmEstimate(inc);
                              }}
                              className="inline-flex items-center gap-1 ml-auto px-2 py-0.5 md:px-2.5 md:py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-sans rounded-md text-[10px] md:text-xs font-semibold transition-colors cursor-pointer"
                              title={`Mark ${currencySymbol}${formatNumber(act > 0 ? act : est)} as Received`}
                            >
                              <Check className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span>Receive</span>
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Variance (Desktop Only) */}
                        <td className="hidden md:table-cell py-2.5 px-4 text-right border-b border-slate-100 dark:border-slate-800/80">
                          {!isReceived || est <= 0 ? (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          ) : diff === 0 ? (
                            <span className="font-sans text-xs text-slate-400 dark:text-slate-500">On target</span>
                          ) : (
                            <span
                              className={`font-semibold ${
                                diff > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {diff > 0
                                ? `+${currencySymbol}${formatNumber(diff)}`
                                : `-${currencySymbol}${formatNumber(Math.abs(diff))}`}
                            </span>
                          )}
                        </td>

                        {/* Reference (Visible on Larger Screens) */}
                        <td className="hidden md:table-cell py-2.5 px-4 md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] font-sans text-xs text-slate-500 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/80 truncate">
                          {inc.reference ? (
                            <span title={inc.reference} className="truncate block">
                              {inc.reference}
                            </span>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600 font-mono">—</span>
                          )}
                        </td>

                        {/* Action (Sticky Right on Desktop) */}
                        <td
                          className="md:sticky md:right-0 md:z-10 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/60 py-1.5 px-2 md:py-2.5 md:px-3.5 text-right font-sans border-b border-l border-slate-100 dark:border-slate-800/80"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenRow(inc)}
                              className="p-1 md:p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title={isReceived ? 'Edit income' : 'Record actual'}
                            >
                              <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                            {!inc.isVirtualEstimate && (
                              <button
                                onClick={() => onDeleteEntry(inc.id)}
                                className="p-1 md:p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Reset to estimate"
                              >
                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Income Total Row */}
                  <tr className="bg-emerald-50/70 dark:bg-emerald-950/30 font-bold text-slate-900 dark:text-white">
                    <td className="sticky left-0 z-10 bg-emerald-50 dark:bg-emerald-950 py-2 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none font-sans text-xs md:text-sm border-r border-emerald-200/70 dark:border-emerald-800/70 truncate">
                      Total Income
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-center font-sans text-xs font-normal text-emerald-800/70 dark:text-emerald-300/70">
                      {receivedIncomeCount}/{unifiedIncomeRows.length}
                    </td>
                    <td className="py-2 px-3 md:py-2.5 md:px-4 text-right text-slate-600 dark:text-slate-300 font-mono text-xs md:text-sm">
                      {currencySymbol}{formatNumber(totalIncomeEstimated)}
                    </td>
                    <td className="py-2 px-3 md:py-2.5 md:px-4 text-right text-emerald-600 dark:text-emerald-400 font-mono text-xs md:text-sm">
                      {currencySymbol}{formatNumber(totalIncomeActual)}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-4 text-right font-mono text-xs md:text-sm">
                      {hasAnyIncomeRecorded && incomeDifference !== 0 ? (
                        <span className={incomeDifference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {incomeDifference > 0
                            ? `+${currencySymbol}${formatNumber(incomeDifference)}`
                            : `-${currencySymbol}${formatNumber(Math.abs(incomeDifference))}`}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-4 font-sans text-xs font-normal text-emerald-800/70 dark:text-emerald-300/70">
                      {unifiedIncomeRows.length} {unifiedIncomeRows.length === 1 ? 'source' : 'sources'}
                    </td>
                    <td className="md:sticky md:right-0 md:z-10 bg-emerald-50 dark:bg-emerald-950 border-l border-emerald-200/70 dark:border-emerald-800/70"></td>
                  </tr>
                </tbody>
              </table>
            </div>
              </>
            )}
          </div>

          {/* STICKY OUTFLOW CONTROLS, FILTERS & MINI SUMMARY BAR (Pinned while scrolling Expenses) */}
          <div className="sticky top-14 sm:top-16 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md rounded-2xl border border-slate-200/90 dark:border-slate-800/90 shadow-sm px-3 py-2.5 flex flex-col gap-2">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2">
              {/* Left: Status Filter Pills + Compact Period Readout */}
              <div className="flex items-center justify-between lg:justify-start gap-2 overflow-x-auto scrollbar-none">
                <div className="flex items-center gap-1 text-[11px] font-semibold shrink-0">
                  {(
                    [
                      { id: 'all', label: `All (${unifiedExpenseRows.length})` },
                      {
                        id: 'pending',
                        label: `Pending (${unifiedExpenseRows.filter((r) => r.status !== 'Paid').length})`,
                      },
                      {
                        id: 'paid',
                        label: `Paid (${unifiedExpenseRows.filter((r) => r.status === 'Paid').length})`,
                      },
                      {
                        id: 'saving',
                        label: `Funds (${unifiedExpenseRows.filter((r) => r.type === 'saving' || r.category === 'Savings').length})`,
                      },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setMobileExpenseFilter(tab.id)}
                      className={`px-2.5 py-1 rounded-lg whitespace-nowrap transition-colors cursor-pointer ${
                        mobileExpenseFilter === tab.id
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Compact Live Pill Readout */}
                <div className="hidden sm:flex items-center gap-1.5 text-[10px] font-mono pl-2 border-l border-slate-200 dark:border-slate-700 shrink-0">
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-bold">
                    In: {currencySymbol}{formatNumber(hasAnyIncomeRecorded ? totalIncomeActual : totalIncomeEstimated)}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 font-bold">
                    Out: {currencySymbol}{formatNumber(hasAnyExpenseRecorded ? totalExpenseActual : totalExpenseEstimated)}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded font-black ${
                      currentRemainingPaid >= 0
                        ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                        : 'bg-rose-100 dark:bg-rose-950 text-rose-800 dark:text-rose-200'
                    }`}
                  >
                    Left: {currencySymbol}{formatNumber(currentRemainingPaid)}
                  </span>
                </div>
              </div>

              {/* Right: Quick Search Input + Sort Control + Cards/Table Switcher */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[150px] lg:w-56">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={expenseSearchQuery}
                    onChange={(e) => setExpenseSearchQuery(e.target.value)}
                    placeholder="Search bill, category, method..."
                    className="w-full pl-8 pr-7 py-1.5 bg-slate-100/90 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  {expenseSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setExpenseSearchQuery('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Sort Selector & Direction Toggle (Works in both Cards and Table Views) */}
                <div className="flex items-center gap-1 bg-slate-100/90 dark:bg-slate-800 px-2 py-1 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] shrink-0">
                  <ArrowUpDown className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <select
                    value={expenseSortField}
                    onChange={(e) => {
                      const nextField = e.target.value as ExpenseSortField;
                      setExpenseSortField(nextField);
                      if (nextField === 'estimated' || nextField === 'actual' || nextField === 'variance') {
                        setExpenseSortDir('desc');
                      } else {
                        setExpenseSortDir('asc');
                      }
                    }}
                    aria-label="Sort budget items by"
                    className="bg-transparent text-slate-700 dark:text-slate-200 font-semibold outline-none cursor-pointer pr-1"
                  >
                    <option value="default" className="bg-white dark:bg-slate-900">Sort: Default</option>
                    <option value="item" className="bg-white dark:bg-slate-900">Sort: Item Name</option>
                    <option value="category" className="bg-white dark:bg-slate-900">Sort: Category</option>
                    <option value="status" className="bg-white dark:bg-slate-900">Sort: Status</option>
                    <option value="estimated" className="bg-white dark:bg-slate-900">Sort: Estimated Cost</option>
                    <option value="actual" className="bg-white dark:bg-slate-900">Sort: Actual Paid</option>
                    <option value="variance" className="bg-white dark:bg-slate-900">Sort: Variance (Saved/Over)</option>
                    <option value="mode" className="bg-white dark:bg-slate-900">Sort: Payment Mode</option>
                  </select>
                  {expenseSortField !== 'default' && (
                    <button
                      type="button"
                      onClick={() => setExpenseSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
                      className="px-1.5 py-0.5 rounded-md bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-bold border border-slate-200/80 dark:border-slate-700 flex items-center gap-0.5 hover:bg-indigo-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                      title={
                        expenseSortDir === 'asc'
                          ? 'Ascending order (Click to switch to Descending)'
                          : 'Descending order (Click to switch to Ascending)'
                      }
                    >
                      {expenseSortDir === 'asc' ? (
                        <>
                          <ArrowUp className="w-3 h-3" />
                          <span>{expenseSortField === 'estimated' || expenseSortField === 'actual' || expenseSortField === 'variance' ? 'Low→High' : 'A→Z'}</span>
                        </>
                      ) : (
                        <>
                          <ArrowDown className="w-3 h-3" />
                          <span>{expenseSortField === 'estimated' || expenseSortField === 'actual' || expenseSortField === 'variance' ? 'High→Low' : 'Z→A'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {/* Mobile-only Cards vs Table Switcher (Desktop automatically renders Table View) */}
                <div className="flex md:hidden items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileShowFullTable(false)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      !mobileShowFullTable
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Cards
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileShowFullTable(true)}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all cursor-pointer ${
                      mobileShowFullTable
                        ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    Table
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 2. MONTHLY EXPENSES MASTER SPREADSHEET TABLE - PRE-POPULATED ESTIMATES */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
            <div className="p-3.5 sm:p-4 bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-xs uppercase tracking-wider text-rose-700 dark:text-rose-400">
                    {frequency === 'monthly'
                      ? `Expenses & Outflows (${selectedPeriod})`
                      : `Bi-Weekly Outflows (${selectedPeriod})`}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono bg-rose-50 dark:bg-rose-950/80 px-2 py-0.5 rounded-full border border-rose-200 dark:border-rose-800">
                    {filteredExpenseRows.length} / {unifiedExpenseRows.length} lines
                  </span>
                  {paymentMethodFilter && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethodFilter(null)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 cursor-pointer"
                    >
                      <span>Channel: {paymentMethodFilter}</span>
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">

                  <button
                    onClick={() => handleOpenAdd('expense')}
                    className="flex-1 sm:flex-initial justify-center px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    title="Add an expense item for this period"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add Expense</span>
                  </button>
                  <button
                    onClick={() => handleOpenAdd('saving')}
                    className="flex-1 sm:flex-initial justify-center px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                    title="Add a fund or savings allocation for this period"
                  >
                    <PiggyBank className="w-3.5 h-3.5" />
                    <span>Add Fund</span>
                  </button>
                </div>
              </div>

              {/* Interactive Payment Method Subtotals Bar (Tap any channel to filter!) */}
              <div className="pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Payment Channel Subtotals (Tap to filter)
                  </span>
                  <span className="text-[10px] font-mono font-bold text-rose-600 dark:text-rose-400">
                    Actual Outflow: {currencySymbol}{formatNumber(totalExpenseActual)}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-1.5 text-[11px]">
                  {(
                    [
                      { key: 'Cash', label: 'Cash' },
                      { key: 'Credit Card', label: 'Credit Card' },
                      { key: 'GCash Transfer', label: 'GCash Transfer' },
                      { key: 'Kath Account', label: 'Kath Account' },
                      { key: 'Checking Account', label: 'Check Account' },
                      { key: 'Bank Transfer', label: 'Bank Transfer' },
                    ] as const
                  ).map((ch) => {
                    const amt = paymentTotals[ch.key] || 0;
                    const pct = totalExpenseActual > 0 ? Math.round((amt / totalExpenseActual) * 100) : 0;
                    const isSelected = paymentMethodFilter === ch.key;
                    return (
                      <button
                        type="button"
                        key={ch.key}
                        onClick={() =>
                          setPaymentMethodFilter((prev) => (prev === ch.key ? null : ch.key))
                        }
                        className={`px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-1.5 text-left transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs ring-2 ring-indigo-500/30'
                            : amt > 0
                            ? 'bg-white dark:bg-slate-900 border-indigo-200/80 dark:border-indigo-800/70 text-slate-800 dark:text-slate-100 hover:border-indigo-400 shadow-2xs'
                            : 'bg-slate-100/60 dark:bg-slate-900/40 border-slate-200/60 dark:border-slate-800 text-slate-400 dark:text-slate-500 hover:text-slate-600'
                        }`}
                        title={`Filter by ${ch.label}${pct > 0 ? ` (${pct}% of actual outflow)` : ''}`}
                      >
                        <span className="truncate font-medium text-[10px]">{ch.label}</span>
                        <span
                          className={`font-mono font-bold shrink-0 ${
                            isSelected
                              ? 'text-white'
                              : amt > 0
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : ''
                          }`}
                        >
                          {currencySymbol}{formatNumber(amt)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* #3: CLEAN & SIMPLE CARDS VIEW (Mobile Only when Cards selected; Desktop automatically uses Table View) */}
            <div className={mobileShowFullTable ? 'hidden' : 'md:hidden'}>
                {filteredExpenseRows.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400 space-y-2">
                    <div>No matching budget items found for this filter.</div>
                    {isExpenseFiltered && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileExpenseFilter('all');
                          setPaymentMethodFilter(null);
                          setExpenseSearchQuery('');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Clear Filters</span>
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredExpenseRows.map((exp) => {
                      const est = exp.estimatedCost;
                      const act = exp.actualCost;
                      const diff = exp.hasActualCost ? est - act : est;
                      const isSaving = exp.type === 'saving' || exp.category === 'Savings';
                      const isPaid = exp.status === 'Paid' && exp.hasActualCost;
                      const canQuickPay = !isPaid && (est > 0 || act > 0);
                      const isExpanded = expandedRowId === exp.id;
                      const activeChannels = getActivePaymentChannels(exp);
                      const channelLabel =
                        activeChannels.length === 1
                          ? activeChannels[0].label
                          : activeChannels.length > 1
                          ? `Split (${activeChannels.length})`
                          : '';

                      return (
                        <div
                          key={exp.id}
                          className={`transition-all overflow-hidden flex flex-col justify-between ${
                            isSaving
                              ? 'bg-indigo-50/20 dark:bg-indigo-950/15'
                              : 'bg-white dark:bg-slate-900'
                          }`}
                        >
                          {/* Clean 2-line Card Row: Left (Item / Category · Method), Right (Amount + Single Action) */}
                          <div
                            onClick={() => setExpandedRowId(isExpanded ? null : exp.id)}
                            className="px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer flex items-center justify-between gap-3"
                          >
                            <div className="min-w-0 flex-1">
                              {/* Line 1: Subtle Settled Icon or Chevron + Full Item Title */}
                              <div className="flex items-center gap-1.5">
                                {isPaid ? (
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                ) : isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                )}
                                <span
                                  className={`text-xs truncate ${
                                    isPaid
                                      ? 'font-semibold text-slate-900 dark:text-white'
                                      : 'font-bold text-slate-900 dark:text-white'
                                  }`}
                                >
                                  {exp.item}
                                </span>
                              </div>

                              {/* Line 2: Clean Unboxed Category · Channel / Fund Account */}
                              <div className="pl-5 mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                <span
                                  className={`truncate ${
                                    isSaving
                                      ? 'font-medium text-indigo-600 dark:text-indigo-400'
                                      : ''
                                  }`}
                                >
                                  {exp.category}
                                </span>
                                {isPaid && channelLabel && (
                                  <>
                                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                                    <span className="text-slate-600 dark:text-slate-300 shrink-0">
                                      {channelLabel}
                                    </span>
                                  </>
                                )}
                                {isSaving && exp.savingAccountName && (
                                  <>
                                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-600 shrink-0">·</span>
                                    <span className="truncate text-indigo-600 dark:text-indigo-400">
                                      {exp.savingAccountName}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Right Side: Clean Amount + Pay (if pending) + Edit */}
                            <div className="flex items-center gap-2 shrink-0">
                              <div className="text-right font-mono leading-tight">
                                {isPaid ? (
                                  <>
                                    <div
                                      className={`text-xs font-bold ${
                                        isSaving
                                          ? 'text-indigo-600 dark:text-indigo-400'
                                          : 'text-slate-900 dark:text-white'
                                      }`}
                                    >
                                      {currencySymbol}{formatNumber(act)}
                                    </div>
                                    {est > 0 && est !== act && (
                                      <div className="text-[10px] text-slate-400">
                                        Est {currencySymbol}{formatNumber(est)}
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {act > 0
                                      ? `${currencySymbol}${formatNumber(act)}`
                                      : est > 0
                                      ? `${currencySymbol}${formatNumber(est)}`
                                      : '—'}
                                  </div>
                                )}
                              </div>

                              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                {canQuickPay && (
                                  <button
                                    onClick={() => handleQuickConfirmEstimate(exp)}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-semibold flex items-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                    title={`Mark ${currencySymbol}${formatNumber(act > 0 ? act : est)} as Paid`}
                                  >
                                    <Check className="w-3 h-3" />
                                    <span>Pay</span>
                                  </button>
                                )}
                                <button
                                  onClick={() => handleOpenRow(exp)}
                                  className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                                  title="Edit Item"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Compact Expandable Details Bar */}
                          {isExpanded && (
                            <div className="px-3.5 pb-2.5 pt-1.5 bg-slate-50/70 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 text-[11px] space-y-1.5 animate-in fade-in duration-150">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-2 font-mono text-slate-500 dark:text-slate-400">
                                  <span>
                                    Est: <strong className="text-slate-700 dark:text-slate-200">{est > 0 ? `${currencySymbol}${formatNumber(est)}` : '—'}</strong>
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>
                                    Paid: <strong className="text-slate-900 dark:text-white">{isPaid ? `${currencySymbol}${formatNumber(act)}` : '—'}</strong>
                                  </span>
                                  {isPaid && est > 0 && diff !== 0 && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span className={diff > 0 ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                                        {diff > 0
                                          ? `Saved ${currencySymbol}${formatNumber(diff)}`
                                          : `Over ${currencySymbol}${formatNumber(Math.abs(diff))}`}
                                      </span>
                                    </>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 ml-auto">
                                  <button
                                    type="button"
                                    onClick={() => handleOpenRow(exp)}
                                    className="px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-[10px] font-semibold flex items-center gap-1"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Edit</span>
                                  </button>
                                  {!exp.isVirtualEstimate && (
                                    <button
                                      type="button"
                                      onClick={() => onDeleteEntry(exp.id)}
                                      className="px-2 py-1 rounded-md text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/60 text-[10px] font-semibold flex items-center gap-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                      <span>Reset</span>
                                    </button>
                                  )}
                                </div>
                              </div>

                              {(activeChannels.length > 1 || exp.reference) && (
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                                  {activeChannels.length > 1 && (
                                    <span>
                                      Split: {activeChannels.map((c) => `${c.label} (${currencySymbol}${formatNumber(c.amount)})`).join(', ')}
                                    </span>
                                  )}
                                  {exp.reference && (
                                    <span className="truncate">
                                      Ref: {exp.reference}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Cards View Summary Footer (Mobile) */}
                {isExpenseFiltered && filteredExpenseRows.length > 0 && (
                  <div className="px-3.5 py-2 bg-indigo-50/70 dark:bg-indigo-950/30 border-t border-indigo-200/70 dark:border-indigo-900/60 flex items-center justify-between text-xs font-bold">
                    <span className="text-indigo-900 dark:text-indigo-200">
                      Filtered Selection ({filteredExpenseRows.length} of {unifiedExpenseRows.length})
                    </span>
                    <div className="font-mono flex items-center gap-3">
                      <span className="text-indigo-700/80 dark:text-indigo-300/80 font-normal text-[10px]">
                        Est {currencySymbol}{formatNumber(filteredExpenseEstimated)}
                      </span>
                      <span className="text-indigo-700 dark:text-indigo-300 text-xs">
                        Paid {currencySymbol}{formatNumber(filteredExpenseActual)}
                      </span>
                    </div>
                  </div>
                )}
                <div className="border-t border-slate-200 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800">
                  <div className="px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between text-xs font-bold">
                    <span className="text-slate-800 dark:text-slate-200">
                      Total Outflows ({unifiedExpenseRows.length})
                    </span>
                    <div className="font-mono flex items-center gap-3">
                      <span className="text-slate-500 font-normal text-[10px]">
                        Est {currencySymbol}{formatNumber(totalExpenseEstimated)}
                      </span>
                      <span className="text-rose-600 dark:text-rose-400 text-xs">
                        {currencySymbol}{formatNumber(totalExpenseActual)}
                      </span>
                    </div>
                  </div>
                  <div className="px-3.5 py-2.5 bg-emerald-50/70 dark:bg-emerald-950/30 flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-900 dark:text-emerald-200">
                      Net Remaining (Income − Outflows)
                    </span>
                    <div className="font-mono flex items-center gap-3">
                      <span className="text-emerald-700/80 dark:text-emerald-300/80 font-normal text-[10px]">
                        Est {currencySymbol}{formatNumber(remainingExtraEstimated)}
                      </span>
                      <span className="text-emerald-700 dark:text-emerald-300 text-xs">
                        {currencySymbol}{formatNumber(remainingExtra)}
                      </span>
                    </div>
                  </div>
                </div>
            </div>

            {/* #1 & #2: EXPENSES & OUTFLOWS SPREADSHEET TABLE (Always shown on Desktop md+ with Enhanced Status & Variance Columns, or on Mobile when Table selected) */}
            <div className={`${mobileShowFullTable ? 'block' : 'hidden md:block'} overflow-x-auto scrollbar-thin`}>
              <table className="w-full text-left text-xs md:text-[13px] font-mono border-separate border-spacing-0 whitespace-nowrap">
                <thead className="bg-slate-50/90 dark:bg-slate-800/60 text-[11px] md:text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 font-sans font-semibold">
                  <tr>
                    {/* Column 1: Item & Category (Frozen Left, Sortable by Item or Category) */}
                    <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-800 py-2 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none border-b border-r border-slate-200/80 dark:border-slate-800 truncate select-none">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleExpenseSort('item')}
                          className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer uppercase font-semibold"
                          title="Sort by Item Name"
                        >
                          <span>Item</span>
                          {expenseSortField === 'item' ? (
                            expenseSortDir === 'asc' ? (
                              <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            ) : (
                              <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            )
                          ) : (
                            <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                          )}
                        </button>
                        <span className="text-slate-300 dark:text-slate-600">/</span>
                        <button
                          type="button"
                          onClick={() => handleToggleExpenseSort('category')}
                          className="inline-flex items-center gap-0.5 text-[10px] md:text-[11px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer uppercase font-semibold"
                          title="Sort by Category"
                        >
                          <span>Cat</span>
                          {expenseSortField === 'category' && (
                            expenseSortDir === 'asc' ? (
                              <ArrowUp className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            ) : (
                              <ArrowDown className="w-2.5 h-2.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                            )
                          )}
                        </button>
                      </div>
                    </th>

                    {/* Column 2 (Desktop Only): Status Badge (Sortable) */}
                    <th
                      onClick={() => handleToggleExpenseSort('status')}
                      className="hidden md:table-cell py-2.5 px-3 text-center border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 w-[100px] cursor-pointer select-none transition-colors"
                      title="Sort by Status (Pending / Paid)"
                    >
                      <div className="inline-flex items-center justify-center gap-1">
                        <span>Status</span>
                        {expenseSortField === 'status' ? (
                          expenseSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>

                    {/* Column 3: Estimated (Sortable) */}
                    <th
                      onClick={() => handleToggleExpenseSort('estimated')}
                      className="py-2 px-3 md:py-2.5 md:px-4 text-right border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Estimated Cost"
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Estimated</span>
                        {expenseSortField === 'estimated' ? (
                          expenseSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>

                    {/* Column 4: Actual (Sortable) */}
                    <th
                      onClick={() => handleToggleExpenseSort('actual')}
                      className="py-2 px-3 md:py-2.5 md:px-4 text-right border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Actual Paid Amount"
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Actual</span>
                        {expenseSortField === 'actual' ? (
                          expenseSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>

                    {/* Column 5 (Desktop Only): Variance / Saved vs Over (Sortable) */}
                    <th
                      onClick={() => handleToggleExpenseSort('variance')}
                      className="hidden md:table-cell py-2.5 px-4 text-right border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 cursor-pointer select-none transition-colors"
                      title="Sort by Variance (Saved vs Over Budget)"
                    >
                      <div className="inline-flex items-center justify-end gap-1">
                        <span>Variance</span>
                        {expenseSortField === 'variance' ? (
                          expenseSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>

                    {/* Column 6: Payment Mode (Sortable) */}
                    <th
                      onClick={() => handleToggleExpenseSort('mode')}
                      className="py-2 px-2.5 md:py-2.5 md:px-4 w-[90px] sm:w-[110px] max-w-[90px] sm:max-w-[110px] md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] text-left border-b border-slate-200/80 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700/80 truncate cursor-pointer select-none transition-colors"
                      title="Sort by Payment Mode"
                    >
                      <div className="inline-flex items-center gap-1">
                        <span>Mode</span>
                        {expenseSortField === 'mode' ? (
                          expenseSortDir === 'asc' ? (
                            <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          ) : (
                            <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          )
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60 shrink-0" />
                        )}
                      </div>
                    </th>

                    {/* Column 7: Action (Frozen Right on Desktop) */}
                    <th className="md:sticky md:right-0 md:z-20 w-[64px] md:w-[88px] bg-slate-50 dark:bg-slate-800 py-2 px-2 md:py-2.5 md:px-3.5 text-right border-b border-l border-slate-200/80 dark:border-slate-800">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                  {filteredExpenseRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center font-sans text-xs md:text-sm text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                        <div className="space-y-2">
                          <div>No matching budget items found for this filter.</div>
                          {isExpenseFiltered && (
                            <button
                              type="button"
                              onClick={() => {
                                setMobileExpenseFilter('all');
                                setPaymentMethodFilter(null);
                                setExpenseSearchQuery('');
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Clear Filters</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : filteredExpenseRows.map((exp) => {
                    const est = exp.estimatedCost;
                    const act = exp.actualCost;
                    const diff = exp.hasActualCost ? est - act : est;
                    const isSaving = exp.type === 'saving' || exp.category === 'Savings';
                    const isPaid = exp.status === 'Paid' && exp.hasActualCost;
                    const canQuickPay = !isPaid && (est > 0 || act > 0);
                    const activeChannels = getActivePaymentChannels(exp);
                    const categorySubtitle =
                      isSaving && exp.savingAccountName
                        ? `${exp.category} · ${exp.savingAccountName}`
                        : exp.category;

                    return (
                      <tr
                        key={exp.id}
                        onClick={() => handleOpenRow(exp)}
                        className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group ${
                          isSaving ? 'bg-indigo-50/15 dark:bg-indigo-950/15' : ''
                        }`}
                      >
                        {/* Column 1: Item + Category (Frozen Left) */}
                        <td
                          className={`sticky left-0 z-10 py-1.5 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none font-sans border-b border-r border-slate-100 dark:border-slate-800/80 ${
                            isSaving
                              ? 'bg-indigo-50 dark:bg-slate-900'
                              : 'bg-white dark:bg-slate-900'
                          } group-hover:bg-slate-50 dark:group-hover:bg-slate-800`}
                          title={`${exp.item} (${categorySubtitle})`}
                        >
                          <div className="flex items-center gap-1 md:gap-1.5 min-w-0">
                            {isPaid && (
                              <CheckCircle2 className="w-3 h-3 md:w-3.5 md:h-3.5 text-emerald-500 shrink-0" />
                            )}
                            <span
                              className={`text-xs md:text-sm truncate ${
                                isPaid
                                  ? 'font-medium text-slate-900 dark:text-slate-100'
                                  : 'font-semibold text-slate-900 dark:text-white'
                              }`}
                            >
                              {exp.item}
                            </span>
                          </div>
                          <div
                            className={`text-[10px] md:text-xs truncate leading-tight ${
                              isSaving
                                ? 'text-indigo-600 dark:text-indigo-400 font-medium'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          >
                            {categorySubtitle}
                          </div>
                        </td>

                        {/* Column 2 (Desktop Only): Status Badge */}
                        <td className="hidden md:table-cell py-2.5 px-3 text-center font-sans border-b border-slate-100 dark:border-slate-800/80">
                          {isPaid ? (
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold ${
                                isSaving
                                  ? 'bg-indigo-50 dark:bg-indigo-950/70 text-indigo-700 dark:text-indigo-300 border border-indigo-200/70 dark:border-indigo-800/70'
                                  : 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70'
                              }`}
                            >
                              {isSaving ? 'Allocated' : 'Paid'}
                            </span>
                          ) : exp.status === 'Scheduled' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/60">
                              Scheduled
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50/80 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border border-amber-200/60 dark:border-amber-800/60">
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Column 3: Estimated */}
                        <td className="py-2 px-3 md:py-2.5 md:px-4 text-right text-slate-600 dark:text-slate-400 border-b border-slate-100 dark:border-slate-800/80">
                          {est > 0 ? `${currencySymbol}${formatNumber(est)}` : '—'}
                        </td>

                        {/* Column 4: Actual (Shows quick Pay button when pending, or Actual + mobile-only variance when paid) */}
                        <td className="py-2 px-3 md:py-2.5 md:px-4 text-right border-b border-slate-100 dark:border-slate-800/80">
                          {isPaid ? (
                            <div className="leading-tight">
                              <div
                                className={`font-bold ${
                                  isSaving
                                    ? 'text-indigo-600 dark:text-indigo-400'
                                    : 'text-slate-900 dark:text-white'
                                }`}
                              >
                                {currencySymbol}{formatNumber(act)}
                              </div>
                              {est > 0 && diff !== 0 && (
                                <div
                                  className={`md:hidden text-[10px] ${
                                    diff < 0 ? 'text-rose-500' : 'text-emerald-600'
                                  }`}
                                >
                                  {diff < 0
                                    ? `Over ${currencySymbol}${formatNumber(Math.abs(diff))}`
                                    : `Saved ${currencySymbol}${formatNumber(diff)}`}
                                </div>
                              )}
                            </div>
                          ) : canQuickPay ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleQuickConfirmEstimate(exp);
                              }}
                              className="inline-flex items-center gap-1 ml-auto px-2 py-0.5 md:px-2.5 md:py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-sans rounded-md text-[10px] md:text-xs font-semibold transition-colors cursor-pointer"
                              title={`Mark ${currencySymbol}${formatNumber(act > 0 ? act : est)} as Paid`}
                            >
                              <Check className="w-3 h-3 md:w-3.5 md:h-3.5" />
                              <span>Pay</span>
                            </button>
                          ) : (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Column 5 (Desktop Only): Dedicated Variance Column */}
                        <td className="hidden md:table-cell py-2.5 px-4 text-right border-b border-slate-100 dark:border-slate-800/80">
                          {!isPaid || est <= 0 ? (
                            <span className="text-slate-300 dark:text-slate-600">—</span>
                          ) : diff === 0 ? (
                            <span className="font-sans text-xs text-slate-400 dark:text-slate-500">On budget</span>
                          ) : (
                            <span
                              className={`font-semibold ${
                                diff > 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-rose-600 dark:text-rose-400'
                              }`}
                            >
                              {diff > 0
                                ? `Saved ${currencySymbol}${formatNumber(diff)}`
                                : `Over ${currencySymbol}${formatNumber(Math.abs(diff))}`}
                            </span>
                          )}
                        </td>

                        {/* Column 6: Payment Mode */}
                        <td className="py-2 px-2.5 md:py-2.5 md:px-4 w-[90px] sm:w-[110px] max-w-[90px] sm:max-w-[110px] md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] font-sans text-[11px] md:text-xs text-slate-600 dark:text-slate-300 border-b border-slate-100 dark:border-slate-800/80 truncate">
                          {!isPaid || activeChannels.length === 0 ? (
                            <span className="text-slate-300 dark:text-slate-600 font-mono">—</span>
                          ) : activeChannels.length === 1 ? (
                            <div
                              className="truncate"
                              title={
                                exp.reference
                                  ? `${activeChannels[0].label} · ${exp.reference}`
                                  : activeChannels[0].label
                              }
                            >
                              {activeChannels[0].label}
                              {exp.reference ? ` · ${exp.reference}` : ''}
                            </div>
                          ) : (
                            <div
                              className="text-indigo-600 dark:text-indigo-400 font-medium truncate"
                              title={activeChannels
                                .map((c) => `${c.label}: ${currencySymbol}${formatNumber(c.amount)}`)
                                .join(' | ')}
                            >
                              Split ({activeChannels.map((c) => c.label).join(', ')})
                            </div>
                          )}
                        </td>

                        {/* Column 7: Action (Frozen Right on Desktop) */}
                        <td
                          className={`md:sticky md:right-0 md:z-10 py-1.5 px-2 md:py-2.5 md:px-3.5 text-right font-sans whitespace-nowrap border-b border-l border-slate-100 dark:border-slate-800/80 ${
                            isSaving
                              ? 'bg-indigo-50 dark:bg-slate-900'
                              : 'bg-white dark:bg-slate-900'
                          } group-hover:bg-slate-50 dark:group-hover:bg-slate-800`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleOpenRow(exp)}
                              className="p-1 md:p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                              title={isPaid ? 'Edit entry' : 'Record actual'}
                            >
                              <Edit2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                            </button>
                            {!exp.isVirtualEstimate && (
                              <button
                                onClick={() => onDeleteEntry(exp.id)}
                                className="p-1 md:p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                                title="Reset to estimate"
                              >
                                <Trash2 className="w-3.5 h-3.5 md:w-4 md:h-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* FILTERED SUBTOTAL ROW (Shown when a filter or search is active) */}
                  {isExpenseFiltered && filteredExpenseRows.length > 0 && (
                    <tr className="bg-indigo-50/70 dark:bg-indigo-950/30 font-bold text-indigo-900 dark:text-indigo-200 border-t border-indigo-200/70 dark:border-indigo-900/60">
                      <td className="sticky left-0 z-10 bg-indigo-50 dark:bg-slate-900 py-2 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none font-sans text-xs md:text-sm border-b border-r border-indigo-200/70 dark:border-indigo-900/60 truncate">
                        <div className="truncate">Filtered Subtotal</div>
                        <div className="text-[10px] md:text-xs font-normal text-indigo-700/80 dark:text-indigo-300/80 truncate">
                          {filteredExpenseRows.length} of {unifiedExpenseRows.length} items
                        </div>
                      </td>
                      <td className="hidden md:table-cell py-2.5 px-3 text-center font-sans text-xs font-normal text-indigo-700/80 dark:text-indigo-300/80 border-b border-indigo-200/70 dark:border-indigo-900/60">
                        Filtered
                      </td>
                      <td className="py-2 px-3 md:py-2.5 md:px-4 text-right font-mono text-xs md:text-sm text-indigo-800 dark:text-indigo-300 border-b border-indigo-200/70 dark:border-indigo-900/60">
                        {currencySymbol}{formatNumber(filteredExpenseEstimated)}
                      </td>
                      <td className="py-2 px-3 md:py-2.5 md:px-4 text-right font-mono text-xs md:text-sm text-indigo-700 dark:text-indigo-300 border-b border-indigo-200/70 dark:border-indigo-900/60">
                        {currencySymbol}{formatNumber(filteredExpenseActual)}
                      </td>
                      <td className="hidden md:table-cell py-2.5 px-4 text-right font-mono text-xs md:text-sm border-b border-indigo-200/70 dark:border-indigo-900/60">
                        {filteredExpenseEstimated - filteredExpenseActual >= 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">
                            Saved {currencySymbol}{formatNumber(filteredExpenseEstimated - filteredExpenseActual)}
                          </span>
                        ) : (
                          <span className="text-rose-600 dark:text-rose-400">
                            Over {currencySymbol}{formatNumber(Math.abs(filteredExpenseEstimated - filteredExpenseActual))}
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-2.5 md:py-2.5 md:px-4 w-[90px] sm:w-[110px] max-w-[90px] sm:max-w-[110px] md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] font-sans text-[11px] md:text-xs font-normal text-indigo-700/80 dark:text-indigo-300/80 border-b border-indigo-200/70 dark:border-indigo-900/60 truncate">
                        —
                      </td>
                      <td className="md:sticky md:right-0 md:z-10 bg-indigo-50 dark:bg-slate-900 border-b border-l border-indigo-200/70 dark:border-indigo-900/60"></td>
                    </tr>
                  )}

                  {/* SUMMARY TOTALS ROW */}
                  <tr className="bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-900 dark:text-white border-t border-slate-200 dark:border-slate-700">
                    <td className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800 py-2 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none font-sans text-xs md:text-sm border-b border-r border-slate-200/80 dark:border-slate-700 truncate">
                      <div className="truncate">Total Outflows</div>
                      <div className="text-[10px] md:text-xs font-normal text-slate-500 dark:text-slate-400 truncate">
                        {unifiedExpenseRows.length} items
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-center font-sans text-xs font-normal text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-700">
                      {unifiedExpenseRows.filter((r) => r.status === 'Paid').length}/{unifiedExpenseRows.length} paid
                    </td>
                    <td className="py-2 px-3 md:py-2.5 md:px-4 text-right font-mono text-xs md:text-sm text-slate-600 dark:text-slate-300 border-b border-slate-200/80 dark:border-slate-700">
                      {currencySymbol}{formatNumber(totalExpenseEstimated)}
                    </td>
                    <td className="py-2 px-3 md:py-2.5 md:px-4 text-right text-rose-600 dark:text-rose-400 text-xs md:text-sm font-mono border-b border-slate-200/80 dark:border-slate-700">
                      {currencySymbol}{formatNumber(totalExpenseActual)}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-4 text-right font-mono text-xs md:text-sm border-b border-slate-200/80 dark:border-slate-700">
                      {hasAnyExpenseRecorded && expenseDifference !== 0 ? (
                        <span className={expenseDifference > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {expenseDifference > 0
                            ? `Saved ${currencySymbol}${formatNumber(expenseDifference)}`
                            : `Over ${currencySymbol}${formatNumber(Math.abs(expenseDifference))}`}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-2 px-2.5 md:py-2.5 md:px-4 w-[90px] sm:w-[110px] max-w-[90px] sm:max-w-[110px] md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] font-sans text-[11px] md:text-xs font-normal text-slate-500 dark:text-slate-400 border-b border-slate-200/80 dark:border-slate-700 truncate">
                      —
                    </td>
                    <td className="md:sticky md:right-0 md:z-10 bg-slate-50 dark:bg-slate-800 border-b border-l border-slate-200/80 dark:border-slate-700"></td>
                  </tr>

                  {/* REMAINING EXTRA SALARY ROW */}
                  <tr className="bg-emerald-50/60 dark:bg-emerald-950/30 font-bold text-slate-900 dark:text-white">
                    <td className="sticky left-0 z-10 bg-emerald-50 dark:bg-emerald-950 py-2 px-2.5 md:py-2.5 md:px-4 w-[125px] max-w-[125px] md:w-[240px] lg:w-[280px] md:max-w-none font-sans text-xs md:text-sm text-emerald-900 dark:text-emerald-200 border-r border-emerald-200/70 dark:border-emerald-800/70 truncate">
                      <div className="truncate">Net Remaining</div>
                      <div className="text-[10px] md:text-xs font-normal text-emerald-700 dark:text-emerald-300 truncate">
                        Income − Outflows
                      </div>
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-3 text-center font-sans text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                      {currentRemainingPaid >= 0 ? 'Surplus' : 'Deficit'}
                    </td>
                    <td className="py-2 px-3 md:py-2.5 md:px-4 text-right font-mono text-xs md:text-sm text-emerald-800 dark:text-emerald-300">
                      {currencySymbol}{formatNumber(remainingExtraEstimated)}
                    </td>
                    <td className="py-2 px-3 md:py-2.5 md:px-4 text-right font-mono text-xs md:text-sm text-emerald-700 dark:text-emerald-300">
                      {currencySymbol}{formatNumber(remainingExtra)}
                    </td>
                    <td className="hidden md:table-cell py-2.5 px-4 text-right font-mono text-xs md:text-sm text-emerald-700 dark:text-emerald-300">
                      —
                    </td>
                    <td className="py-2 px-2.5 md:py-2.5 md:px-4 w-[90px] sm:w-[110px] max-w-[90px] sm:max-w-[110px] md:w-auto md:min-w-[150px] md:max-w-[240px] lg:max-w-[300px] font-sans text-[11px] md:text-xs font-normal text-emerald-800 dark:text-emerald-300 truncate">
                      {currentRemainingPaid >= 0 ? 'Safe Surplus' : 'Deficit'}
                    </td>
                    <td className="md:sticky md:right-0 md:z-10 bg-emerald-50 dark:bg-emerald-950 border-l border-emerald-200/70 dark:border-emerald-800/70"></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </div>

      {/* MODAL: COMPACT, DECLUTTERED ADD / EDIT ENTRY */}
      {isAddModalOpen && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md sm:max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[92vh] sm:max-h-[88vh] overflow-hidden flex flex-col">
            
            {/* Compact Modal Header */}
            <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-slate-50/90 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 shrink-0 space-y-2 sm:space-y-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className={`p-1.5 sm:p-2 rounded-xl shrink-0 ${
                    modalType === 'income'
                      ? 'bg-emerald-100/80 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400'
                      : modalType === 'saving'
                      ? 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400'
                      : 'bg-rose-100/80 text-rose-600 dark:bg-rose-950 dark:text-rose-400'
                  }`}>
                    {modalType === 'income' ? (
                      <TrendingUp className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : modalType === 'saving' ? (
                      <PiggyBank className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    ) : (
                      <Receipt className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                      {editingEntryId
                        ? 'Update Entry'
                        : isRowAction
                        ? 'Record Actual'
                        : modalType === 'saving'
                        ? 'New Fund Allocation'
                        : `New ${modalType.charAt(0).toUpperCase() + modalType.slice(1)}`}
                    </h3>
                    <span className="px-1.5 py-0.5 rounded-md bg-slate-200/70 dark:bg-slate-700 text-[10px] font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                      {modalPeriod} {budget.year}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 shrink-0">
                  {/* Desktop Inline Entry Type Segmented Pill */}
                  <div className="hidden sm:flex items-center bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                    <button
                      type="button"
                      onClick={() => {
                        setModalType('expense');
                        if (entrySourceMode === 'unplanned') {
                          setFormCategory(expenseCategories[0] || 'Budget');
                        } else {
                          const firstTpl = itemTemplates.find((t) => t.type === 'expense');
                          if (firstTpl) handleSelectTemplate(firstTpl.id);
                          else {
                            setFormCategory(expenseCategories[0] || 'Budget');
                            setSelectedTemplateId('');
                          }
                        }
                      }}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        modalType === 'expense'
                          ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                          if (firstTpl) handleSelectTemplate(firstTpl.id);
                          else {
                            setFormCategory(incomeCategories[0] || 'Salary');
                            setSelectedTemplateId('');
                          }
                        }
                      }}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        modalType === 'income'
                          ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Income
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setModalType('saving');
                        setIsCreatingNewSinkingFund(false);
                        const defaultFund = existingSinkingFunds[0] || savingCategories[0] || 'General Savings';
                        if (entrySourceMode === 'unplanned') {
                          setFormCategory(savingCategories[0] || 'General Savings');
                          setFormItem(defaultFund);
                        } else {
                          const firstTpl = itemTemplates.find((t) => t.type === 'saving');
                          if (firstTpl) handleSelectTemplate(firstTpl.id);
                          else {
                            setFormCategory(savingCategories[0] || 'General Savings');
                            setFormItem(defaultFund);
                            setSelectedTemplateId('');
                          }
                        }
                      }}
                      className={`px-2 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                        modalType === 'saving'
                          ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                          : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      Funds
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-200/50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    title="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mobile Full-Width Entry Type Segmented Pill */}
              <div className="grid grid-cols-3 gap-1 sm:hidden bg-slate-200/70 dark:bg-slate-800 p-0.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setModalType('expense');
                    if (entrySourceMode === 'unplanned') {
                      setFormCategory(expenseCategories[0] || 'Budget');
                    } else {
                      const firstTpl = itemTemplates.find((t) => t.type === 'expense');
                      if (firstTpl) handleSelectTemplate(firstTpl.id);
                      else {
                        setFormCategory(expenseCategories[0] || 'Budget');
                        setSelectedTemplateId('');
                      }
                    }
                  }}
                  className={`py-1 rounded-md font-semibold transition-all cursor-pointer text-center ${
                    modalType === 'expense'
                      ? 'bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
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
                      if (firstTpl) handleSelectTemplate(firstTpl.id);
                      else {
                        setFormCategory(incomeCategories[0] || 'Salary');
                        setSelectedTemplateId('');
                      }
                    }
                  }}
                  className={`py-1 rounded-md font-semibold transition-all cursor-pointer text-center ${
                    modalType === 'income'
                      ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Income
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModalType('saving');
                    setIsCreatingNewSinkingFund(false);
                    const defaultFund = existingSinkingFunds[0] || savingCategories[0] || 'General Savings';
                    if (entrySourceMode === 'unplanned') {
                      setFormCategory(savingCategories[0] || 'General Savings');
                      setFormItem(defaultFund);
                    } else {
                      const firstTpl = itemTemplates.find((t) => t.type === 'saving');
                      if (firstTpl) handleSelectTemplate(firstTpl.id);
                      else {
                        setFormCategory(savingCategories[0] || 'General Savings');
                        setFormItem(defaultFund);
                        setSelectedTemplateId('');
                      }
                    }
                  }}
                  className={`py-1 rounded-md font-semibold transition-all cursor-pointer text-center ${
                    modalType === 'saving'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                      : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  Funds
                </button>
              </div>
            </div>

            {/* Compact Modal Body */}
            <div className="p-3 sm:p-4 overflow-y-auto overflow-x-hidden flex-1">
              <form id="spreadsheet-entry-form" onSubmit={handleSubmitForm} className="space-y-2.5 sm:space-y-3.5">
                
                {/* 1. COMPACT SOURCE BAR (Only when adding new item) */}
                {!isRowAction && (
                  <div className="bg-slate-50 dark:bg-slate-800/50 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEntrySourceMode('unplanned');
                            setSelectedTemplateId('');
                            setFormEstimated('0');
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            entrySourceMode === 'unplanned'
                              ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          One-Off
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEntrySourceMode('template');
                            const firstTpl = itemTemplates.find((t) => t.type === modalType);
                            if (firstTpl) handleSelectTemplate(firstTpl.id);
                          }}
                          className={`px-2 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            entrySourceMode === 'template'
                              ? 'bg-white dark:bg-slate-900 text-amber-600 dark:text-amber-400 shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          From Template
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => setIsManagerModalOpen(true)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline px-1.5 cursor-pointer shrink-0"
                      >
                        Manage Templates
                      </button>
                    </div>

                    {entrySourceMode === 'template' && (
                      <select
                        value={selectedTemplateId}
                        onChange={(e) => handleSelectTemplate(e.target.value)}
                        className="w-full min-w-0 h-8 px-2.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg text-[11px] text-slate-900 dark:text-white font-medium outline-none"
                      >
                        <option value="">Select preset...</option>
                        {itemTemplates
                          .filter((t) => t.type === modalType && isTemplateValidForPeriod(t, frequency, modalPeriod))
                          .map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>
                              {tpl.item} ({currencySymbol}{formatNumber(tpl.defaultEstimatedCost)})
                            </option>
                          ))}
                      </select>
                    )}
                  </div>
                )}

                {/* 2. ITEM NAME & CATEGORY (Aligned 2-Column Grid on Mobile & Desktop) */}
                <div className="grid grid-cols-2 sm:grid-cols-12 gap-2 sm:gap-2.5">
                  <div className="sm:col-span-7 min-w-0">
                    <div className="flex items-center justify-between gap-1 h-4 mb-1">
                      <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                        {modalType === 'saving' ? 'Target Fund' : 'Item / Description'}
                      </label>
                      {modalType === 'saving' && isCreatingNewSinkingFund && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsCreatingNewSinkingFund(false);
                            setFormItem(existingSinkingFunds[0] || formCategory || 'General Savings');
                          }}
                          className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer shrink-0 leading-none"
                        >
                          Existing
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
                        className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-slate-900 dark:text-white font-semibold outline-none focus:ring-2 focus:ring-indigo-500"
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
                                  {fundName}
                                </option>
                              ))}
                            </optgroup>
                          ));
                        })()}
                        <option value="__CREATE_NEW_FUND__">+ New Sinking Fund...</option>
                      </select>
                    ) : (
                      <div className="space-y-1">
                        <input
                          type="text"
                          required
                          list={modalType === 'saving' ? 'existing-sinking-funds-list' : undefined}
                          placeholder={
                            modalType === 'saving'
                              ? 'New Fund name...'
                              : 'e.g. Electricity, Groceries'
                          }
                          value={formItem}
                          onChange={(e) => handleItemChange(e.target.value)}
                          className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500"
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
                                  <div className="flex items-center justify-between gap-1.5 px-2 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-[10px] text-amber-800 dark:text-amber-200">
                                    <span className="truncate">
                                      Match: <strong>{closeMatch}</strong>
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setIsCreatingNewSinkingFund(false);
                                        handleItemChange(closeMatch);
                                      }}
                                      className="px-1.5 py-0.5 bg-amber-600 text-white font-bold rounded cursor-pointer shrink-0"
                                    >
                                      Use
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
                  </div>

                  <div className="sm:col-span-5 min-w-0">
                    <div className="flex items-center justify-between gap-1 h-4 mb-1">
                      <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                        Category
                      </label>
                      <button
                        type="button"
                        onClick={() => setIsManagerModalOpen(true)}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer shrink-0 leading-none"
                      >
                        Edit
                      </button>
                    </div>
                    <input
                      type="text"
                      list="category-options"
                      value={formCategory}
                      onChange={(e) => handleCategoryChange(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                      placeholder="Category..."
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
                </div>

                {/* 3. AMOUNTS: COMPACT SIDE-BY-SIDE OR SINGLE ACTUAL */}
                {entrySourceMode === 'unplanned' && !isRowAction ? (
                  <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <div className="flex items-center justify-between gap-2 h-4 mb-1">
                      <label className="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate">
                        {modalType === 'income' ? 'Actual Amount Received' : 'Actual Amount'} ({currencySymbol})
                      </label>
                      <button
                        type="button"
                        onClick={() => setEntrySourceMode('template')}
                        className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold hover:underline cursor-pointer shrink-0 leading-none"
                      >
                        + Add Estimate
                      </button>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      value={formActual}
                      onChange={(e) => setFormActual(e.target.value)}
                      className="w-full min-w-0 h-8 sm:h-9 px-2.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg font-mono font-bold text-slate-900 dark:text-white text-xs sm:text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 sm:gap-2.5 p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/80">
                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-1 h-4 mb-1">
                        <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 truncate">
                          Estimated ({currencySymbol})
                        </label>
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={formEstimated}
                        onChange={(e) => setFormEstimated(e.target.value)}
                        className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-white dark:bg-slate-900 border border-amber-300/90 dark:border-amber-700 rounded-lg font-mono font-bold text-slate-800 dark:text-slate-200 text-xs sm:text-sm outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center justify-between gap-1 h-4 mb-1">
                        <label className="text-[11px] font-bold text-slate-800 dark:text-slate-200 truncate">
                          Actual ({currencySymbol})
                        </label>
                        {parseFloat(formEstimated) > 0 && formActual !== formEstimated && (
                          <button
                            type="button"
                            onClick={() => setFormActual(formEstimated)}
                            className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded text-[9px] sm:text-[10px] font-semibold hover:bg-indigo-100 cursor-pointer shrink-0 leading-none"
                            title="Copy estimated amount to actual"
                          >
                            = Est
                          </button>
                        )}
                      </div>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formActual}
                        onChange={(e) => setFormActual(e.target.value)}
                        className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-white dark:bg-slate-900 border border-rose-300/90 dark:border-rose-700 rounded-lg font-mono font-bold text-slate-900 dark:text-white text-xs sm:text-sm outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                )}

                {/* 4. PAYMENT CHANNEL & DESTINATION ACCOUNT / STATUS */}
                {modalType !== 'income' ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-1 h-4 mb-1">
                          <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                            <span className="sm:hidden">Channel</span>
                            <span className="hidden sm:inline">Payment Channel</span>
                          </label>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => setIsSplitPayment((prev) => !prev)}
                              className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer leading-none"
                            >
                              {isSplitPayment ? 'Single' : 'Split'}
                            </button>
                          </div>
                        </div>

                        {!isSplitPayment ? (
                          <select
                            value={formPaymentMethod}
                            onChange={(e) => setFormPaymentMethod(e.target.value as PaymentMethod)}
                            className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {PAYMENT_METHODS.map((pm) => (
                              <option key={pm} value={pm}>
                                {pm}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div className="h-8 sm:h-9 px-2 sm:px-2.5 bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 rounded-xl text-[11px] text-indigo-700 dark:text-indigo-300 font-semibold flex items-center justify-between gap-1.5 min-w-0">
                            <span className="truncate">Split (6)</span>
                            <span className="font-mono shrink-0">{currencySymbol}{formatNumber(parseFloat(formActual) || 0)}</span>
                          </div>
                        )}
                      </div>

                      {modalType === 'saving' ? (
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1 h-4 mb-1">
                            <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                              <span className="sm:hidden">Dest. Account</span>
                              <span className="hidden sm:inline">Destination Account</span>
                            </label>
                          </div>
                          <select
                            value={formSavingAccountId}
                            onChange={(e) => setFormSavingAccountId(e.target.value)}
                            className="w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-indigo-50/50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            {accounts.map((acc) => (
                              <option key={acc.id} value={acc.id}>
                                {acc.name} ({acc.type})
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <div className="flex items-center justify-between gap-1 h-4 mb-1">
                            <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                              Status
                            </label>
                          </div>
                          <div className="grid grid-cols-3 gap-0.5 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 h-8 sm:h-9 items-center">
                            {(['Paid', 'Pending', 'Scheduled'] as const).map((st) => (
                              <button
                                key={st}
                                type="button"
                                onClick={() => setFormStatus(st)}
                                className={`h-full rounded-lg text-[10px] sm:text-[11px] font-semibold transition-all cursor-pointer truncate px-0.5 ${
                                  formStatus === st
                                    ? st === 'Paid'
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : st === 'Scheduled'
                                      ? 'bg-blue-600 text-white shadow-2xs'
                                      : 'bg-amber-500 text-white shadow-2xs'
                                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                                }`}
                              >
                                {st === 'Scheduled' ? 'Sched' : st}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Split Payment 6-Channel Grid (Only expanded when Split is toggled) */}
                    {isSplitPayment && (
                      <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
                          {([
                            { key: 'cash', label: 'Cash' },
                            { key: 'creditCard', label: 'Credit Card' },
                            { key: 'gcashTransfer', label: 'GCash' },
                            { key: 'kathAccount', label: 'Kath Acct' },
                            { key: 'checkAccount', label: 'Check Acct' },
                            { key: 'bankTransfer', label: 'Bank Trans' },
                          ] as const).map((ch) => (
                            <div key={ch.key} className="min-w-0">
                              <label className="block text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mb-0.5">
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
                                className="w-full min-w-0 h-7 sm:h-8 px-1.5 sm:px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-[11px] sm:text-xs text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}

                {/* 5. COMPACT METADATA ROW: STATUS (for Income/Saving) + DATE + MEMO */}
                {(modalType === 'income' || modalType === 'saving') && (
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold">
                        Status
                      </label>
                    </div>
                    <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700 h-8 sm:h-9 items-center">
                      {(['Paid', 'Pending', 'Scheduled'] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setFormStatus(st)}
                          className={`h-full rounded-lg text-[11px] font-semibold transition-all cursor-pointer truncate px-1 ${
                            formStatus === st
                              ? st === 'Paid'
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : st === 'Scheduled'
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-amber-500 text-white shadow-2xs'
                              : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                          }`}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 sm:gap-2.5">
                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                        Date
                      </label>
                    </div>
                    <div className="flex items-center w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500">
                      <input
                        type="date"
                        value={formDate}
                        onChange={(e) => setFormDate(e.target.value)}
                        className="w-full max-w-full min-w-0 h-full bg-transparent border-0 p-0 m-0 text-slate-900 dark:text-white text-[11px] sm:text-xs font-mono outline-none appearance-none"
                      />
                    </div>
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center justify-between h-4 mb-1">
                      <label className="text-[11px] text-slate-600 dark:text-slate-400 font-semibold truncate">
                        Reference / Note
                      </label>
                    </div>
                    <input
                      type="text"
                      placeholder="Receipt, check #, memo..."
                      value={formReference}
                      onChange={(e) => setFormReference(e.target.value)}
                      className="block w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </form>
            </div>

            {/* Compact Modal Footer with Template Sync & Actions */}
            <div className="px-3.5 py-2.5 sm:px-4 sm:py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-1.5 min-w-0">
                {editingEntryId && (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteEntry(editingEntryId);
                      setIsAddModalOpen(false);
                    }}
                    className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors cursor-pointer shrink-0"
                    title="Delete / Reset to Estimate"
                  >
                    <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                  </button>
                )}
                <label
                  htmlFor="saveToTemplateSheetCheckbox"
                  className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 dark:text-slate-300 font-medium cursor-pointer select-none truncate"
                >
                  <input
                    type="checkbox"
                    id="saveToTemplateSheetCheckbox"
                    checked={saveToTemplate}
                    onChange={(e) => setSaveToTemplate(e.target.checked)}
                    className="w-3.5 h-3.5 rounded text-amber-600 accent-amber-600 cursor-pointer shrink-0"
                  />
                  <span className="truncate">
                    <span className="sm:hidden">Sync template</span>
                    <span className="hidden sm:inline">Sync to recurring template</span>
                  </span>
                </label>
              </div>

              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="spreadsheet-entry-form"
                  className="px-3.5 sm:px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {editingEntryId ? 'Update' : 'Save Entry'}
                </button>
              </div>
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
          if (currentIndex <= 0 || surplus <= 0) return;
          onAddEntry({
            year: budget.year,
            period: selectedPeriod,
            periodIndex: currentIndex,
            date: new Date().toISOString().split('T')[0],
            type: 'income',
            category: 'Other',
            item: `Carry-over from ${prevPeriodName}`,
            amount: surplus,
            actualCost: surplus,
            status: 'Paid',
            description: `Carry-over from ${prevPeriodName}`,
          });
        }}
        surplus={surplus}
        fromPeriod={prevPeriodName}
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
