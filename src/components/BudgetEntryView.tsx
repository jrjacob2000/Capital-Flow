import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  Plus,
  Filter,
  Search,
  Trash2,
  Edit2,
  Calendar,
  PiggyBank,
  TrendingUp,
  Receipt,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  SlidersHorizontal,
  X,
  Building2,
  AlertTriangle,
  Coins,
  ChevronRight,
  Info,
  FileSpreadsheet,
  Table,
} from 'lucide-react';
import {
  BudgetEntry,
  YearBudgetData,
  EntryFrequency,
  EntryType,
  SavingsAccount,
  BudgetItemTemplate,
} from '../types/finance';
import {
  MONTH_NAMES,
  BIWEEKLY_PERIODS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVING_CATEGORIES,
  stripDefaultStarterTemplates,
  isTemplateValidForPeriod,
} from '../services/sampleData';

import { BudgetSpreadsheetView } from './BudgetSpreadsheetView';
import { CategoryAndTemplateManagerModal } from './CategoryAndTemplateManagerModal';
import { CarryOverModal } from './CarryOverModal';

interface BudgetEntryViewProps {
  budget: YearBudgetData;
  accounts: SavingsAccount[];
  frequency: EntryFrequency;
  onChangeFrequency: (freq: EntryFrequency) => void;
  onAddEntry: (entry: Omit<BudgetEntry, 'id' | 'createdAt'>) => void;
  onAddMultipleEntries?: (entries: Omit<BudgetEntry, 'id' | 'createdAt'>[]) => void;
  onUpdateEntry?: (entryId: string, updated: Partial<BudgetEntry>) => void;
  onDeleteEntry: (entryId: string) => void;
  onUpdateCategories: (
    customCats: {
      expense: string[];
      income: string[];
      saving: string[];
    },
    renamed?: { type: EntryType; oldName: string; newName: string }
  ) => void;
  onUpdateTemplates: (templates: BudgetItemTemplate[]) => void;
  currencySymbol?: string;
}

export const BudgetEntryView: React.FC<BudgetEntryViewProps> = ({
  budget,
  accounts,
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
  const [viewLayout, setViewLayout] = useState<'spreadsheet' | 'standard'>(() => {
    try {
      const saved = localStorage.getItem('capitalflow_budget_layout');
      if (saved === 'standard' || saved === 'spreadsheet') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'spreadsheet';
  });

  const handleSetViewLayout = (layout: 'spreadsheet' | 'standard') => {
    setViewLayout(layout);
    if (frequency === 'monthly') {
      if (!MONTH_NAMES.includes(selectedPeriodFilter) && selectedPeriodFilter !== 'all') {
        setSelectedPeriodFilter(currentMonthName);
      }
    } else {
      if (!BIWEEKLY_PERIODS.some((p) => p.id === selectedPeriodFilter) && selectedPeriodFilter !== 'all') {
        setSelectedPeriodFilter(currentBiWeeklyPeriod);
      }
    }
    try {
      localStorage.setItem('capitalflow_budget_layout', layout);
    } catch {
      // ignore
    }
  };
  const currentMonthName = MONTH_NAMES[new Date().getMonth()] || 'Jan';
  const currentBiWeeklyPeriod = `${currentMonthName}-${new Date().getDate() <= 15 ? 'P1' : 'P2'}`;
  const defaultPeriod = frequency === 'monthly' ? currentMonthName : currentBiWeeklyPeriod;
  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>(defaultPeriod);

  const handleSelectPeriodFilter = useCallback((p: string) => {
    setSelectedPeriodFilter(p);
  }, []);

  // Sync default period when frequency changes
  useEffect(() => {
    if (frequency === 'monthly') {
      if (!MONTH_NAMES.includes(selectedPeriodFilter) && selectedPeriodFilter !== 'all') {
        setSelectedPeriodFilter(currentMonthName);
      }
    } else {
      if (!BIWEEKLY_PERIODS.some((p) => p.id === selectedPeriodFilter) && selectedPeriodFilter !== 'all') {
        setSelectedPeriodFilter(currentBiWeeklyPeriod);
      }
    }
  }, [frequency, currentMonthName, currentBiWeeklyPeriod, selectedPeriodFilter]);

  const selectedPeriodFilterBtnRef = useRef<HTMLButtonElement>(null);
  const periodScrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollToSelected = () => {
      const container = periodScrollContainerRef.current;
      const btn = selectedPeriodFilterBtnRef.current;
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
  }, [selectedPeriodFilter, frequency, viewLayout]);

  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [isSplitterOpen, setIsSplitterOpen] = useState<boolean>(false);
  const [isManagerModalOpen, setIsManagerModalOpen] = useState<boolean>(false);
  const [isCarryOverModalOpen, setIsCarryOverModalOpen] = useState<boolean>(false);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');

  // Active Categories & Templates
  const expenseCategories = budget.customCategories?.expense || [...EXPENSE_CATEGORIES];
  const incomeCategories = budget.customCategories?.income || [...INCOME_CATEGORIES];
  const savingCategories = budget.customCategories?.saving || [...SAVING_CATEGORIES];
  const itemTemplates = useMemo(() => {
    return budget.isPersonalizedTemplate
      ? stripDefaultStarterTemplates(budget.itemTemplates)
      : [];
  }, [budget.isPersonalizedTemplate, budget.itemTemplates]);

  // Modal period mode and selection
  const [modalFrequency, setModalFrequency] = useState<EntryFrequency>(frequency);
  const [modalPeriod, setModalPeriod] = useState<string>(
    frequency === 'monthly' ? currentMonthName : currentBiWeeklyPeriod
  );

  // Form state for new entry
  const [formType, setFormType] = useState<EntryType>('expense');
  const [formDate, setFormDate] = useState<string>(
    new Date().toISOString().split('T')[0].replace(/^\d{4}/, String(budget.year))
  );
  const [formCategory, setFormCategory] = useState<string>(expenseCategories[0] || 'Housing & Rent');
  const [formItem, setFormItem] = useState<string>('');
  const [formAmount, setFormAmount] = useState<string>('');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formAccountId, setFormAccountId] = useState<string>(accounts[0]?.id || '');

  // Paycheck splitter state
  const [splitterPaycheck, setSplitterPaycheck] = useState<string>(() => {
    const primaryIncome = itemTemplates.find((t) => t.type === 'income');
    return String(primaryIncome?.defaultEstimatedCost || 3500);
  });
  const [splitterTemplateAmounts, setSplitterTemplateAmounts] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    itemTemplates.forEach((t) => {
      init[t.id] = String(t.defaultEstimatedCost || 0);
    });
    return init;
  });

  // Sync splitter template amounts whenever user personalizes itemTemplates
  useEffect(() => {
    setSplitterTemplateAmounts((prev) => {
      let changed = false;
      const next: Record<string, string> = {};
      itemTemplates.forEach((t) => {
        const val = prev[t.id] !== undefined ? prev[t.id] : String(t.defaultEstimatedCost || 0);
        next[t.id] = val;
        if (prev[t.id] !== val) {
          changed = true;
        }
      });
      if (!changed && Object.keys(prev).length === Object.keys(next).length) {
        return prev;
      }
      return next;
    });
  }, [itemTemplates]);
  const [splitterAccountId, setSplitterAccountId] = useState<string>(accounts[0]?.id || '');
  const [splitterPeriod, setSplitterPeriod] = useState<string>(
    frequency === 'monthly' ? currentMonthName : currentBiWeeklyPeriod
  );

  // Get approximate date string for a period
  const getRepresentativeDateForPeriod = (period: string, freq: EntryFrequency, yr: number) => {
    if (freq === 'monthly') {
      const monthIdx = MONTH_NAMES.indexOf(period);
      const safeMonth = monthIdx >= 0 ? monthIdx + 1 : 1;
      return `${yr}-${String(safeMonth).padStart(2, '0')}-01`;
    } else {
      // Matches Month-P1, Month-P2 (e.g. Jan-P1, Oct-P2)
      const match = period.match(/^([A-Za-z]{3})-P([12])$/);
      if (match) {
        const mStr = match[1];
        const pNum = parseInt(match[2], 10);
        const mIdx = MONTH_NAMES.indexOf(mStr);
        const safeMonth = mIdx >= 0 ? mIdx + 1 : 1;
        const day = pNum === 1 ? '01' : '16';
        return `${yr}-${String(safeMonth).padStart(2, '0')}-${day}`;
      }
      const matchOld = period.match(/\d+/);
      const pNum = matchOld ? parseInt(matchOld[0], 10) : 1;
      const targetDate = new Date(yr, 0, 1 + (pNum - 1) * 14);
      const m = String(targetDate.getMonth() + 1).padStart(2, '0');
      const d = String(targetDate.getDate()).padStart(2, '0');
      return `${yr}-${m}-${d}`;
    }
  };

  const handleOpenAddModal = (presetPeriod?: string, entryToEdit?: BudgetEntry) => {
    if (entryToEdit) {
      setEditingEntryId(entryToEdit.id);
      setFormType(entryToEdit.type);
      setFormCategory(entryToEdit.category);
      setFormAmount(String(entryToEdit.amount));
      setFormItem(entryToEdit.item || '');
      setFormDescription(entryToEdit.description);
      setModalPeriod(entryToEdit.period);
      setFormDate(entryToEdit.date);
      setModalFrequency(frequency);
    } else {
      setEditingEntryId(null);
      const targetPeriod =
        presetPeriod && presetPeriod !== 'all'
          ? presetPeriod
          : selectedPeriodFilter !== 'all'
          ? selectedPeriodFilter
          : frequency === 'monthly'
          ? currentMonthName
          : currentBiWeeklyPeriod;

      setModalFrequency(frequency);
      setModalPeriod(targetPeriod);
      setFormDate(getRepresentativeDateForPeriod(targetPeriod, frequency, budget.year));
      
      setSelectedTemplateId('');
      setFormType('expense');
      setFormCategory(expenseCategories[0] || 'Budget');
      setFormItem('');
      setFormAmount('');
      setFormDescription('');
    }
    setIsAddModalOpen(true);
  };

  // Update modal period & sync representative date
  const handleModalPeriodChange = (newPeriod: string) => {
    setModalPeriod(newPeriod);
    setFormDate(getRepresentativeDateForPeriod(newPeriod, modalFrequency, budget.year));
  };

  // Compute stats for modal selected period
  const periodStats = useMemo(() => {
    const entriesInPeriod = budget.entries.filter(
      (e) => e.period === modalPeriod
    );

    const income = entriesInPeriod
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);

    const expenses = entriesInPeriod
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);

    const savings = entriesInPeriod
      .filter((e) => e.type === 'saving')
      .reduce((sum, e) => sum + e.amount, 0);

    const currentRemaining = income - expenses - savings;

    // Simulation with current typed amount
    const inputVal = parseFloat(formAmount) || 0;
    let simulatedRemaining = currentRemaining;
    let simulatedIncome = income;
    let simulatedExpenses = expenses;
    let simulatedSavings = savings;

    if (formType === 'income') {
      simulatedIncome += inputVal;
      simulatedRemaining += inputVal;
    } else if (formType === 'expense') {
      simulatedExpenses += inputVal;
      simulatedRemaining -= inputVal;
    } else if (formType === 'saving') {
      simulatedSavings += inputVal;
      simulatedRemaining -= inputVal;
    }

    const currentUsedPct = income > 0 ? ((expenses + savings) / income) * 100 : 0;
    const simulatedUsedPct = simulatedIncome > 0 ? ((simulatedExpenses + simulatedSavings) / simulatedIncome) * 100 : 0;

    return {
      income,
      expenses,
      savings,
      currentRemaining,
      simulatedRemaining,
      simulatedIncome,
      simulatedExpenses,
      simulatedSavings,
      inputVal,
      currentUsedPct,
      simulatedUsedPct,
      hasIncome: income > 0,
    };
  }, [budget.entries, modalPeriod, formAmount, formType]);

  // Compute stats for currently active filter in the main view
  const activeViewStats = useMemo(() => {
    const isAll = selectedPeriodFilter === 'all';
    const entries = isAll
      ? budget.entries
      : budget.entries.filter((e) => e.period === selectedPeriodFilter);

    const income = entries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + e.amount, 0);

    const expenses = entries
      .filter((e) => e.type === 'expense')
      .reduce((sum, e) => sum + e.amount, 0);

    const savings = entries
      .filter((e) => e.type === 'saving')
      .reduce((sum, e) => sum + e.amount, 0);

    const remaining = income - expenses - savings;
    const savingsRate = income > 0 ? (savings / income) * 100 : 0;
    const allocationRate = income > 0 ? ((expenses + savings) / income) * 100 : 0;

    return {
      isAll,
      income,
      expenses,
      savings,
      remaining,
      savingsRate,
      allocationRate,
    };
  }, [budget.entries, selectedPeriodFilter]);

  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(formAmount);
    if (isNaN(amountNum) || amountNum < 0) return;

    let periodIndex = 0;
    if (modalFrequency === 'monthly') {
      periodIndex = Math.max(0, MONTH_NAMES.indexOf(modalPeriod));
    } else {
      const idx = BIWEEKLY_PERIODS.findIndex((p) => p.id === modalPeriod);
      periodIndex = idx >= 0 ? idx : 0;
    }

    const selectedAcc = accounts.find((a) => a.id === formAccountId);

    if (editingEntryId && onUpdateEntry) {
      onUpdateEntry(editingEntryId, {
        year: budget.year,
        date: formDate,
        period: modalPeriod,
        periodIndex,
        type: formType,
        category: formCategory,
        item: formItem || formCategory,
        amount: amountNum,
        description: formDescription || formItem || formCategory,
        savingAccountId: formType === 'saving' ? formAccountId : undefined,
        savingAccountName: formType === 'saving' ? selectedAcc?.name : undefined,
      });
    } else {
      onAddEntry({
        year: budget.year,
        date: formDate,
        period: modalPeriod,
        periodIndex,
        type: formType,
        category: formCategory,
        item: formItem || formCategory,
        amount: amountNum,
        description: formDescription || formItem || formCategory,
        savingAccountId: formType === 'saving' ? formAccountId : undefined,
        savingAccountName: formType === 'saving' ? selectedAcc?.name : undefined,
      });
    }

    setEditingEntryId(null);
    setFormAmount('');
    setFormDescription('');
    setFormItem('');
    setIsAddModalOpen(false);
  };

  const handleApplyPaycheckSplitter = () => {
    const total = parseFloat(splitterPaycheck) || 0;
    if (total <= 0) return;

    const chosenPeriod = splitterPeriod;
    let periodIndex = 0;
    if (frequency === 'monthly') {
      periodIndex = Math.max(0, MONTH_NAMES.indexOf(chosenPeriod));
    } else {
      const idx = BIWEEKLY_PERIODS.findIndex((p) => p.id === chosenPeriod);
      periodIndex = idx >= 0 ? idx : 0;
    }

    const repDate = getRepresentativeDateForPeriod(chosenPeriod, frequency, budget.year);
    const acc = accounts.find((a) => a.id === splitterAccountId);

    const entriesToAdd: Omit<BudgetEntry, 'id' | 'createdAt'>[] = [];

    // 1. Add Income entry for the paycheck
    entriesToAdd.push({
      year: budget.year,
      date: repDate,
      period: chosenPeriod,
      periodIndex,
      type: 'income',
      category: 'Primary Salary / Paycheck',
      item: 'Salary',
      amount: total,
      description: `Paycheck Salary (${chosenPeriod})`,
    });

    // 2. Dynamically add entries for all itemTemplates valid for this period that have a non-zero amount in splitter state
    itemTemplates
      .filter((tpl) => tpl.type !== 'income' && isTemplateValidForPeriod(tpl, frequency, chosenPeriod))
      .forEach((tpl) => {
        const amtStr = splitterTemplateAmounts[tpl.id] || '0';
        const amt = parseFloat(amtStr) || 0;
        if (amt > 0) {
          const isSaving = tpl.type === 'saving';
          entriesToAdd.push({
            year: budget.year,
            date: repDate,
            period: chosenPeriod,
            periodIndex,
            type: tpl.type,
            category: tpl.category,
            item: tpl.item,
            amount: amt,
            actualCost: amt,
            estimatedCost: tpl.defaultEstimatedCost,
            status: 'Paid',
            description: `${tpl.item} allocation from ${chosenPeriod} paycheck`,
            ...(isSaving ? { savingAccountId: acc?.id, savingAccountName: acc?.name } : {}),
          });
        }
      });

    if (onAddMultipleEntries && entriesToAdd.length > 0) {
      onAddMultipleEntries(entriesToAdd);
    } else {
      entriesToAdd.forEach((entry) => onAddEntry(entry));
    }

    setIsSplitterOpen(false);
  };

  // Filter entries
  const filteredEntries = budget.entries.filter((entry) => {
    if (selectedPeriodFilter !== 'all' && entry.period !== selectedPeriodFilter) {
      return false;
    }
    if (selectedTypeFilter !== 'all' && entry.type !== selectedTypeFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCat = entry.category.toLowerCase().includes(q);
      const matchDesc = entry.description.toLowerCase().includes(q);
      if (!matchCat && !matchDesc) return false;
    }
    return true;
  });

  filteredEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const periodOptions =
    frequency === 'monthly'
      ? MONTH_NAMES
      : BIWEEKLY_PERIODS.map((p) => p.id);

  const modalPeriodOptions =
    modalFrequency === 'monthly'
      ? MONTH_NAMES
      : BIWEEKLY_PERIODS.map((p) => p.id);

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  // Compute previous period surplus for Carry-Over in Standard View
  const { surplus, hasBeenCarriedOver, prevPeriod } = useMemo(() => {
    if (selectedPeriodFilter === 'all') {
      return { surplus: 0, hasBeenCarriedOver: true, prevPeriod: '' };
    }
    const currentIndex = periodOptions.indexOf(selectedPeriodFilter);
    if (currentIndex <= 0) {
      return { surplus: 0, hasBeenCarriedOver: true, prevPeriod: '' };
    }
    const previousPeriod = periodOptions[currentIndex - 1];
    const prevEntries = budget.entries.filter((e) => e.period === previousPeriod);
    const incAct = prevEntries
      .filter((e) => e.type === 'income')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const expAct = prevEntries
      .filter((e) => e.type === 'expense' || e.type === 'saving')
      .reduce((sum, e) => sum + (e.actualCost ?? e.amount ?? 0), 0);
    const computedSurplus = incAct - expAct;
    const alreadyCarriedOver = budget.entries.some(
      (e) =>
        e.period === selectedPeriodFilter &&
        (e.description.includes('Carry-over') || (e.item && e.item.includes('Carry-over')))
    );
    return {
      surplus: computedSurplus,
      hasBeenCarriedOver: alreadyCarriedOver,
      prevPeriod: previousPeriod,
    };
  }, [budget.entries, periodOptions, selectedPeriodFilter]);

  if (viewLayout === 'spreadsheet') {
    return (
      <div key="spreadsheet-layout-root" className="space-y-4">
        {/* Layout Switcher Bar */}
        <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="font-semibold text-slate-700 dark:text-slate-300">Format:</span>
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => handleSetViewLayout('spreadsheet')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs cursor-default"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Spreadsheet Sheet (Multi-Channel)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSetViewLayout('standard')}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Table className="w-3.5 h-3.5 text-slate-400" />
                <span>Standard Table &amp; HUD</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 font-mono hidden sm:block">
            Database: capitalflow_budget_{budget.year}.json &bull; Currency: {currencySymbol}
          </div>
        </div>

        <BudgetSpreadsheetView
          budget={budget}
          accounts={accounts}
          selectedPeriod={selectedPeriodFilter === 'all' ? defaultPeriod : selectedPeriodFilter}
          onSelectPeriod={handleSelectPeriodFilter}
          frequency={frequency}
          onChangeFrequency={onChangeFrequency}
          onAddEntry={onAddEntry}
          onAddMultipleEntries={onAddMultipleEntries}
          onUpdateEntry={onUpdateEntry || (() => {})}
          onDeleteEntry={onDeleteEntry}
          onUpdateCategories={onUpdateCategories}
          onUpdateTemplates={onUpdateTemplates}
          currencySymbol={currencySymbol}
        />
      </div>
    );
  }

  return (
    <div key="standard-layout-root" className="space-y-6">
      {/* Layout Switcher Bar */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 px-5 py-3 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="font-semibold text-slate-700 dark:text-slate-300">Format:</span>
          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200 dark:border-slate-700">
            <button
              type="button"
              onClick={() => handleSetViewLayout('spreadsheet')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-medium text-slate-600 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-white transition-colors cursor-pointer hover:bg-white/60 dark:hover:bg-slate-700/60"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-500" />
              <span>Spreadsheet Sheet (Multi-Channel)</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetViewLayout('standard')}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg font-bold bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs cursor-default"
            >
              <Table className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              <span>Standard Table &amp; HUD</span>
            </button>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-mono hidden sm:block">
          Database: capitalflow_budget_{budget.year}.json &bull; Currency: {currencySymbol}
        </div>
      </div>
      
      {/* Top Header Card */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white shrink-0">
                {budget.year} Budget &amp; Data Entry
              </h2>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 whitespace-nowrap shrink-0 leading-none">
                {frequency === 'monthly' ? 'Monthly Mode (12 Periods)' : 'Bi-Weekly Mode (26 Periods)'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Record entries by period with real-time remaining salary tracking. Savings automatically accumulate in your Google Drive savings ledger.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Frequency Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs">
              <button
                type="button"
                onClick={() => {
                  onChangeFrequency('monthly');
                  setSelectedPeriodFilter(currentMonthName);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  frequency === 'monthly'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Monthly (12)
              </button>
              <button
                type="button"
                onClick={() => {
                  onChangeFrequency('bi-weekly');
                  setSelectedPeriodFilter(currentBiWeeklyPeriod);
                }}
                className={`px-3 py-1.5 rounded-lg transition-all ${
                  frequency === 'bi-weekly'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Bi-Weekly (26)
              </button>
            </div>

            {/* Quick Paycheck Splitter */}
            <button
              onClick={() => setIsSplitterOpen(true)}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
              <span>Split Paycheck</span>
            </button>

            {/* Manage Estimates & Categories */}
            <button
              onClick={() => setIsManagerModalOpen(true)}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
              title="Manage monthly estimated budgets and expense, income, and saving categories"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
              <span>Estimates &amp; Categories</span>
            </button>

            {/* Add Transaction Button */}
            <button
              onClick={() => handleOpenAddModal()}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Entry by Period</span>
            </button>
          </div>
        </div>

        {/* Filters and Period Bar */}
        <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 space-y-3 text-xs">
          
          {/* Period selector tabs */}
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold shrink-0">
              <Calendar className="w-3.5 h-3.5 text-indigo-500" />
              <span>Period:</span>
            </div>
            {frequency === 'monthly' ? (
              <div ref={periodScrollContainerRef} key="monthly-entry-container" className="flex items-center gap-1 overflow-x-auto min-w-0 w-full md:flex-1 pb-1 scrollbar-thin bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <button
                  ref={selectedPeriodFilter === 'all' ? selectedPeriodFilterBtnRef : null}
                  onClick={() => setSelectedPeriodFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                    selectedPeriodFilter === 'all'
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All Periods
                </button>
                {MONTH_NAMES.map((period) => (
                  <button
                    key={period}
                    ref={selectedPeriodFilter === period ? selectedPeriodFilterBtnRef : null}
                    onClick={() => setSelectedPeriodFilter(period)}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
                      selectedPeriodFilter === period
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {period}
                  </button>
                ))}
              </div>
            ) : (
              <div ref={periodScrollContainerRef} key="biweekly-entry-container" className="flex items-center gap-1 overflow-x-auto min-w-0 w-full md:flex-1 pb-1 scrollbar-thin bg-slate-50 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                <button
                  ref={selectedPeriodFilter === 'all' ? selectedPeriodFilterBtnRef : null}
                  onClick={() => setSelectedPeriodFilter('all')}
                  className={`px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                    selectedPeriodFilter === 'all'
                      ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  All Periods
                </button>
                {BIWEEKLY_PERIODS.map((p) => (
                  <button
                    key={p.id}
                    ref={selectedPeriodFilter === p.id ? selectedPeriodFilterBtnRef : null}
                    onClick={() => setSelectedPeriodFilter(p.id)}
                    className={`px-2.5 py-1.5 rounded-lg font-semibold transition-colors shrink-0 ${
                      selectedPeriodFilter === p.id
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {p.id}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Type Filter & Search input */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <select
              value={selectedTypeFilter}
              onChange={(e) => setSelectedTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 outline-none"
            >
              <option value="all">All Types</option>
              <option value="income">Income Only</option>
              <option value="expense">Expenses Only</option>
              <option value="saving">Funds Only</option>
            </select>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entries..."
                className="pl-8 pr-3 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 placeholder-slate-400 outline-none w-36 sm:w-48"
              />
            </div>
          </div>

        </div>
      </div>

      {/* Real-Time Period Salary & Remaining Income HUD Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 border border-slate-800 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                {activeViewStats.isAll ? 'Full Year Financial Balance' : `Period Cashflow: ${selectedPeriodFilter}`}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  activeViewStats.remaining >= 0
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800'
                    : 'bg-rose-950/80 text-rose-400 border border-rose-800'
                }`}
              >
                {activeViewStats.remaining >= 0 ? 'Surplus Remaining' : 'Over Allocated'}
              </span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold mt-1 font-mono">
              {activeViewStats.remaining >= 0 ? '+' : '-'}
              {currencySymbol}{formatNumber(Math.abs(activeViewStats.remaining))}
              <span className="text-xs font-sans font-normal text-slate-300 ml-2">
                unallocated from {activeViewStats.isAll ? 'annual' : 'period'} salary/income
              </span>
            </h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0 self-start lg:self-center">
            {selectedPeriodFilter !== 'all' && surplus > 0 && !hasBeenCarriedOver && (
              <button
                onClick={() => setIsCarryOverModalOpen(true)}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl border border-amber-400/40 shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Bring Forward Previous Surplus: {currencySymbol}{formatNumber(surplus)}</span>
              </button>
            )}
            <button
              onClick={() => handleOpenAddModal(selectedPeriodFilter !== 'all' ? selectedPeriodFilter : undefined)}
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Entry for {selectedPeriodFilter === 'all' ? 'Current Period' : selectedPeriodFilter}</span>
            </button>
          </div>
        </div>

        {/* Breakdown Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 text-xs">
          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Salary / Income</span>
            <span className="text-base font-bold font-mono text-emerald-400 mt-1 block">
              +{currencySymbol}{formatNumber(activeViewStats.income)}
            </span>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Living Expenses</span>
            <span className="text-base font-bold font-mono text-rose-400 mt-1 block">
              -{currencySymbol}{formatNumber(activeViewStats.expenses)}
            </span>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Funds</span>
            <span className="text-base font-bold font-mono text-indigo-300 mt-1 block">
              -{currencySymbol}{formatNumber(activeViewStats.savings)}
            </span>
          </div>

          <div className="bg-white/5 rounded-xl p-3 border border-white/5">
            <span className="text-slate-400 block text-[11px]">Remaining Inflow</span>
            <span
              className={`text-base font-bold font-mono mt-1 block ${
                activeViewStats.remaining >= 0 ? 'text-white' : 'text-rose-400'
              }`}
            >
              {currencySymbol}{formatNumber(activeViewStats.remaining)}
            </span>
          </div>
        </div>

        {/* Progress meter */}
        {activeViewStats.income > 0 && (
          <div className="mt-4 pt-3 border-t border-white/5">
            <div className="flex justify-between text-[11px] text-slate-300 mb-1.5">
              <span>Income Allocation: {activeViewStats.allocationRate.toFixed(1)}% utilized</span>
              <span className="font-semibold text-emerald-400">
                {Math.max(0, 100 - activeViewStats.allocationRate).toFixed(1)}% Free Cash
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden flex">
              <div
                className="bg-rose-500 h-full transition-all duration-300"
                style={{ width: `${Math.min(100, (activeViewStats.expenses / activeViewStats.income) * 100)}%` }}
                title="Expenses"
              />
              <div
                className="bg-indigo-500 h-full transition-all duration-300"
                style={{ width: `${Math.min(100, (activeViewStats.savings / activeViewStats.income) * 100)}%` }}
                title="Savings"
              />
            </div>
          </div>
        )}
      </div>

      {/* Entries Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 bg-slate-50/70 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="font-medium">
              Showing {filteredEntries.length} {filteredEntries.length === 1 ? 'record' : 'records'}{' '}
              {selectedPeriodFilter !== 'all' ? `for ${selectedPeriodFilter}` : 'across all periods'}
            </span>
            {selectedPeriodFilter !== 'all' && surplus > 0 && !hasBeenCarriedOver && (
              <button
                onClick={() => setIsCarryOverModalOpen(true)}
                className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg border border-amber-600 flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
              >
                <ArrowRight className="w-3.5 h-3.5" />
                <span>Bring Forward Previous Surplus: {currencySymbol}{formatNumber(surplus)}</span>
              </button>
            )}
          </div>
          <span className="font-mono">Database: capitalflow_budget_{budget.year}.json</span>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="py-16 text-center text-slate-400">
            <Receipt className="w-10 h-10 mx-auto text-slate-300 dark:text-slate-700 mb-2" />
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              No entries found for {selectedPeriodFilter === 'all' ? 'this filter' : selectedPeriodFilter}
            </p>
            <p className="text-xs mt-1 text-slate-400">
              Click &quot;New Entry by Period&quot; above to record your salary, expense, or savings for this period.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Period &amp; Date</th>
                  <th className="py-3 px-4">Type</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Description / Ledger Flow</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                  <th className="py-3 px-4 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredEntries.map((entry) => {
                  const isIncome = entry.type === 'income';
                  const isExpense = entry.type === 'expense';
                  const isSaving = entry.type === 'saving';

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {entry.period}
                        </span>
                        <div className="font-mono text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {entry.date}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                            isIncome
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800'
                              : isExpense
                              ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                          }`}
                        >
                          {isIncome && <TrendingUp className="w-3 h-3" />}
                          {isExpense && <Receipt className="w-3 h-3" />}
                          {isSaving && <PiggyBank className="w-3 h-3" />}
                          <span className="capitalize">{isSaving ? 'Funds' : entry.type}</span>
                        </span>
                      </td>

                      <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                        {entry.category}
                      </td>

                      <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                        <div>{entry.description}</div>
                        {isSaving && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                            <ArrowRight className="w-3 h-3" />
                            <span>Accumulating into: {entry.savingAccountName || 'Savings Ledger'}</span>
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span
                          className={
                            isIncome
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : isExpense
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-indigo-600 dark:text-indigo-400'
                          }
                        >
                          {isIncome ? '+' : isExpense ? '-' : '+'}
                          {currencySymbol}{formatNumber(entry.amount)}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => handleOpenAddModal(undefined, entry)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
                            title="Edit entry"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteEntry(entry.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 transition-colors"
                            title="Delete entry"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL: ADD ENTRY BY PERIOD WITH LIVE REMAINING SALARY COMPUTATION */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden max-h-[90vh] flex flex-col">
            
            {/* Modal Header */}
            <div className="p-5 sm:p-6 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  {editingEntryId ? 'Update Entry' : formType === 'income' ? 'New Income' : formType === 'expense' ? 'New Expense' : 'New Funds'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Recording for {modalPeriod} ({budget.year})
                </p>
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

            {/* Modal Body */}
            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
              
              {/* Period selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Period
                  </label>
                  <select
                    value={modalPeriod}
                    onChange={(e) => handleModalPeriodChange(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold outline-none text-xs sm:text-sm"
                  >
                    {modalPeriodOptions.map((period) => (
                      <option key={period} value={period}>{period}</option>
                    ))}
                  </select>
                </div>
                
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Mode
                  </label>
                  <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-semibold text-slate-600 dark:text-slate-300 text-xs sm:text-sm">
                    {modalFrequency === 'monthly' ? 'Monthly' : 'Bi-Weekly'}
                  </div>
                </div>
              </div>

              {/* Form Details */}
              <form onSubmit={handleCreateEntry} id="entry-form" className="space-y-4">
                {/* Entry Type */}
                <div>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setFormType('expense');
                        setFormCategory(expenseCategories[0] || 'Budget');
                        setSelectedTemplateId('');
                      }}
                      className={`py-2 px-2 sm:px-3 rounded-xl font-semibold border text-center transition-all text-xs sm:text-sm cursor-pointer ${
                        formType === 'expense'
                          ? 'bg-rose-50 dark:bg-rose-950/80 border-rose-400 text-rose-700 dark:text-rose-300 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Expense
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormType('income');
                        setFormCategory(incomeCategories[0] || 'Salary');
                        setSelectedTemplateId('');
                      }}
                      className={`py-2 px-2 sm:px-3 rounded-xl font-semibold border text-center transition-all text-xs sm:text-sm cursor-pointer ${
                        formType === 'income'
                          ? 'bg-emerald-50 dark:bg-emerald-950/80 border-emerald-400 text-emerald-700 dark:text-emerald-300 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Income
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setFormType('saving');
                        setFormCategory(savingCategories[0] || 'Savings');
                        setSelectedTemplateId('');
                      }}
                      className={`py-2 px-2 sm:px-3 rounded-xl font-semibold border text-center transition-all text-xs sm:text-sm cursor-pointer ${
                        formType === 'saving'
                          ? 'bg-indigo-50 dark:bg-indigo-950/80 border-indigo-400 text-indigo-700 dark:text-indigo-300 shadow-2xs'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50'
                      }`}
                    >
                      Funds
                    </button>
                  </div>
                </div>

                {/* Pre-populate from Estimated Budget Templates */}
                {!editingEntryId && (
                  <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                        <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                        <span>Pre-Populate from Estimated Budget</span>
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
                      onChange={(e) => {
                        const tplId = e.target.value;
                        setSelectedTemplateId(tplId);
                        const tpl = itemTemplates.find((t) => t.id === tplId);
                        if (tpl) {
                          setFormType(tpl.type);
                          setFormCategory(tpl.category);
                          setFormItem(tpl.item);
                          setFormAmount(String(tpl.defaultEstimatedCost || ''));
                          setFormDescription(tpl.item);
                        }
                      }}
                      className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg text-slate-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">⚡ Select an Item to Pre-Populate...</option>
                      {itemTemplates
                        .filter((t) => {
                          if (t.type !== formType) return false;
                          return isTemplateValidForPeriod(t, frequency, modalPeriod);
                        })
                        .map((tpl) => (
                          <option key={tpl.id} value={tpl.id}>
                            {tpl.item} ({tpl.category}) — Est: {currencySymbol}{formatNumber(tpl.defaultEstimatedCost)}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {/* Amount & Date in Period */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder={`Amount (${currencySymbol})`}
                      value={formAmount}
                      onChange={(e) => setFormAmount(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-sm font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Date</label>
                    <input
                      type="date"
                      required
                      value={formDate}
                      onChange={(e) => setFormDate(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                    />
                  </div>
                </div>

                {/* Category Selection */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Category</label>
                  <input
                    type="text"
                    list="category-options"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="Category"
                  />
                  <datalist id="category-options">
                    {(formType === 'income'
                      ? incomeCategories
                      : formType === 'expense'
                      ? expenseCategories
                      : savingCategories
                    ).map((cat) => (
                      <option key={cat} value={cat} />
                    ))}
                  </datalist>
                </div>
                
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Item Name</label>
                  <input
                    type="text"
                    placeholder="e.g., Electricity Bill, Groceries & Market, Emergency Fund"
                    value={formItem}
                    onChange={(e) => setFormItem(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* If Saving: Select Destination Account for Ledger */}
                {formType === 'saving' && (
                  <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200 dark:border-indigo-800/80 space-y-2">
                    <div className="flex items-center gap-1.5 text-indigo-700 dark:text-indigo-300 font-semibold text-[11px]">
                      <PiggyBank className="w-3.5 h-3.5" />
                      <span>Accumulate into Fund Account</span>
                    </div>
                    <select
                      value={formAccountId}
                      onChange={(e) => setFormAccountId(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-700 rounded-lg text-slate-900 dark:text-white outline-none text-xs"
                    >
                      {accounts.map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} ({acc.type})
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Description */}
                <div>
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1 block">Description</label>
                  <input
                    type="text"
                    placeholder="Description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </form>
            </div>

            {/* Modal Footer / Actions */}
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
                form="entry-form"
                className="px-5 py-2.5 text-xs sm:text-sm bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                {editingEntryId ? 'Update Entry' : `Record for ${modalPeriod}`}
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: PAYCHECK SPLITTER */}
      {isSplitterOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-6">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 rounded-lg">
                    <SlidersHorizontal className="w-4 h-4" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Quick Paycheck Allocator
                  </h3>
                </div>
                <button
                  onClick={() => setIsSplitterOpen(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3.5 text-xs">
                <p className="text-slate-500 dark:text-slate-400">
                  Split your periodic paycheck into living expenses and automated savings in a single step.
                </p>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                    Select Paycheck Period
                  </label>
                  <select
                    value={splitterPeriod}
                    onChange={(e) => setSplitterPeriod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {periodOptions.map((period) => (
                      <option key={period} value={period}>
                        {frequency === 'monthly' ? `Month of ${period}` : period}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold mb-1">
                    Total Paycheck Amount ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    value={splitterPaycheck}
                    onChange={(e) => setSplitterPaycheck(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono text-base font-bold text-emerald-600 outline-none"
                  />
                </div>

                <div className="space-y-3 max-h-[260px] overflow-y-auto pr-1">
                  <label className="block text-slate-600 dark:text-slate-400 font-semibold">
                    Template Allocations
                  </label>
                  {itemTemplates
                    .filter((t) => t.type !== 'income' && isTemplateValidForPeriod(t, frequency, splitterPeriod))
                    .map((tpl) => {
                      const isSaving = tpl.type === 'saving';
                      const val = splitterTemplateAmounts[tpl.id] ?? String(tpl.defaultEstimatedCost || 0);
                      return (
                        <div
                          key={tpl.id}
                          className={`p-3 rounded-xl border ${
                            isSaving
                              ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-200 dark:border-indigo-800'
                              : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700'
                          } space-y-2`}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <span className="font-bold text-slate-900 dark:text-white text-xs">
                                {tpl.item}
                              </span>
                              <span className="ml-2 text-[10px] text-slate-500 uppercase tracking-wider">
                                ({tpl.category})
                              </span>
                            </div>
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                              tpl.type === 'income' ? 'bg-emerald-100 text-emerald-700' :
                              tpl.type === 'expense' ? 'bg-amber-100 text-amber-700' :
                              'bg-indigo-100 text-indigo-700'
                            }`}>
                              {tpl.type}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-slate-500 font-mono">{currencySymbol}</span>
                            <input
                              type="number"
                              value={val}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                setSplitterTemplateAmounts((prev) => ({
                                  ...prev,
                                  [tpl.id]: newVal,
                                }));
                              }}
                              className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg font-mono text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                          {isSaving && (
                            <div className="pt-1">
                              <label className="block text-[10px] text-slate-500 mb-0.5">Target Account</label>
                              <select
                                value={splitterAccountId}
                                onChange={(e) => setSplitterAccountId(e.target.value)}
                                className="w-full px-2 py-1 bg-white dark:bg-slate-900 border border-indigo-200 rounded-lg text-xs"
                              >
                                {accounts.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      );
                    })}
                </div>

                {/* Remaining unallocated from paycheck preview */}
                <div className="p-2.5 bg-slate-50 dark:bg-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <span className="text-slate-500">Remaining from this paycheck:</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {currencySymbol}
                    {formatNumber(
                      Math.max(
                        0,
                        (parseFloat(splitterPaycheck) || 0) -
                          itemTemplates
                            .filter((t) => t.type !== 'income' && isTemplateValidForPeriod(t, frequency, splitterPeriod))
                            .reduce((sum, tpl) => {
                              return sum + (parseFloat(splitterTemplateAmounts[tpl.id] ?? String(tpl.defaultEstimatedCost || 0)) || 0);
                            }, 0)
                      )
                    )}
                  </span>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSplitterOpen(false)}
                    className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleApplyPaycheckSplitter}
                    className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl shadow-xs"
                  >
                    Allocate &amp; Record
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Category & Estimated Budget Template Manager Modal */}
      <CategoryAndTemplateManagerModal
        isOpen={isManagerModalOpen}
        onClose={() => setIsManagerModalOpen(false)}
        budget={budget}
        accounts={accounts}
        onUpdateCategories={onUpdateCategories}
        onUpdateTemplates={onUpdateTemplates}
        currencySymbol={currencySymbol}
      />

      {/* Carry Over Surplus Confirmation Modal */}
      <CarryOverModal
        isOpen={isCarryOverModalOpen}
        onClose={() => setIsCarryOverModalOpen(false)}
        onConfirm={() => {
          if (selectedPeriodFilter === 'all' || surplus <= 0 || !prevPeriod) return;
          const currentIndex = periodOptions.indexOf(selectedPeriodFilter);
          onAddEntry({
            year: budget.year,
            period: selectedPeriodFilter,
            periodIndex: Math.max(0, currentIndex),
            date: getRepresentativeDateForPeriod(selectedPeriodFilter, frequency, budget.year),
            type: 'income',
            category: 'Other',
            item: `Carry-over from ${prevPeriod}`,
            amount: surplus,
            actualCost: surplus,
            status: 'Paid',
            description: `Carry-over from ${prevPeriod}`,
          });
        }}
        surplus={surplus}
        fromPeriod={prevPeriod}
        toPeriod={selectedPeriodFilter}
        currencySymbol={currencySymbol}
      />

    </div>
  );
};
