import React, { useState, useMemo } from 'react';
import {
  Tag,
  Plus,
  Trash2,
  Edit2,
  Check,
  X,
  Sliders,
  DollarSign,
  PiggyBank,
  TrendingUp,
  Receipt,
  Sparkles,
  Banknote,
  FolderTree,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  Search,
} from 'lucide-react';
import {
  BudgetItemTemplate,
  EntryType,
  PaymentMethod,
  SavingsAccount,
  YearBudgetData,
} from '../types/finance';
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  SAVING_CATEGORIES,
  PAYMENT_METHODS,
  DEFAULT_ITEM_TEMPLATES,
  stripDefaultStarterTemplates,
} from '../services/sampleData';
import { ConfirmationModal } from './ConfirmationModal';

interface CategoryAndTemplateManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  budget: YearBudgetData;
  accounts?: SavingsAccount[];
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

export const CategoryAndTemplateManagerModal: React.FC<CategoryAndTemplateManagerModalProps> = ({
  isOpen,
  onClose,
  budget,
  accounts = [],
  onUpdateCategories,
  onUpdateTemplates,
  currencySymbol = '₱',
}) => {
  const [activeTab, setActiveTab] = useState<'estimates' | 'expense_cats' | 'income_cats' | 'saving_cats'>('estimates');

  // Categories state
  const expenseCats = budget.customCategories?.expense || [...EXPENSE_CATEGORIES];
  const incomeCats = budget.customCategories?.income || [...INCOME_CATEGORIES];
  const savingCats = budget.customCategories?.saving || [...SAVING_CATEGORIES];

  const templates: BudgetItemTemplate[] = budget.isPersonalizedTemplate
    ? stripDefaultStarterTemplates(budget.itemTemplates)
    : [];

  // Category editing state
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<{ original: string; current: string } | null>(null);

  // Template editing/add state
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [tplId, setTplId] = useState<string | null>(null);
  const [tplType, setTplType] = useState<EntryType>('expense');
  const [tplCategory, setTplCategory] = useState<string>(expenseCats[0] || 'Budget');
  const [tplItem, setTplItem] = useState<string>('');
  const [tplEstimated, setTplEstimated] = useState<string>('');
  const [tplFrequency, setTplFrequency] = useState<'monthly' | 'bi-weekly' | 'both'>('monthly');
  const [tplBiweeklyPeriod, setTplBiweeklyPeriod] = useState<'P1' | 'P2' | 'both'>('both');
  const [tplMethod, setTplMethod] = useState<PaymentMethod>('Bank Transfer');
  const [tplSavingAccountId, setTplSavingAccountId] = useState<string>(accounts[0]?.id || '');
  const [tplWithdraw, setTplWithdraw] = useState<boolean>(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    affectedItems: string[];
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    description: '',
    affectedItems: [],
    onConfirm: () => {},
  });

  // Template Sorting & Filtering State
  type TemplateSortField = 'manual' | 'item' | 'type' | 'category' | 'frequency' | 'cost';
  type SortDirection = 'asc' | 'desc';

  const [sortField, setSortField] = useState<TemplateSortField>('manual');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');

  // Move an item up or down in the template list
  const handleMoveTemplate = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= templates.length) return;

    const updated = [...templates];
    const [moved] = updated.splice(index, 1);
    updated.splice(targetIndex, 0, moved);

    setSortField('manual');
    onUpdateTemplates(updated);
  };

  // Preset sort and save order
  const handleApplyPresetSort = (field: TemplateSortField, dir: SortDirection = 'asc') => {
    const sorted = [...templates].sort((a, b) => {
      if (field === 'item') {
        return dir === 'asc' ? a.item.localeCompare(b.item) : b.item.localeCompare(a.item);
      }
      if (field === 'category') {
        const catCmp = a.category.localeCompare(b.category);
        return dir === 'asc' ? (catCmp !== 0 ? catCmp : a.item.localeCompare(b.item)) : -catCmp;
      }
      if (field === 'type') {
        const typeOrder: Record<string, number> = { income: 1, expense: 2, saving: 3 };
        const diff = (typeOrder[a.type] || 99) - (typeOrder[b.type] || 99);
        return dir === 'asc' ? (diff !== 0 ? diff : a.item.localeCompare(b.item)) : -diff;
      }
      if (field === 'frequency') {
        const freqOrder: Record<string, number> = { monthly: 1, 'bi-weekly': 2, both: 3 };
        const diff = (freqOrder[a.frequency || 'monthly'] || 99) - (freqOrder[b.frequency || 'monthly'] || 99);
        return dir === 'asc' ? (diff !== 0 ? diff : a.item.localeCompare(b.item)) : -diff;
      }
      if (field === 'cost') {
        const diff = (a.defaultEstimatedCost || 0) - (b.defaultEstimatedCost || 0);
        return dir === 'asc' ? diff : -diff;
      }
      return 0;
    });

    setSortField(field);
    setSortDirection(dir);
    onUpdateTemplates(sorted);
  };

  const handleToggleColumnSort = (field: TemplateSortField) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        handleApplyPresetSort(field, 'desc');
      } else {
        setSortField('manual');
      }
    } else {
      handleApplyPresetSort(field, field === 'cost' ? 'desc' : 'asc');
    }
  };

  const displayedTemplates = useMemo(() => {
    let result = [...templates];
    if (templateSearchQuery.trim()) {
      const q = templateSearchQuery.toLowerCase().trim();
      result = result.filter(
        (t) =>
          t.item.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q)
      );
    }
    return result;
  }, [templates, templateSearchQuery]);

  if (!isOpen) return null;

  // Category handlers
  const handleAddCategory = (type: 'expense' | 'income' | 'saving') => {
    const trimmed = newCatName.trim();
    if (!trimmed) return;

    const updated = {
      expense: [...expenseCats],
      income: [...incomeCats],
      saving: [...savingCats],
    };

    if (type === 'expense' && !updated.expense.includes(trimmed)) {
      updated.expense.push(trimmed);
    } else if (type === 'income' && !updated.income.includes(trimmed)) {
      updated.income.push(trimmed);
    } else if (type === 'saving' && !updated.saving.includes(trimmed)) {
      updated.saving.push(trimmed);
    }

    onUpdateCategories(updated);
    setNewCatName('');
  };

  const handleDeleteCategory = (type: 'expense' | 'income' | 'saving', name: string) => {
    const typeLabel = type === 'saving' ? 'Funds' : type === 'income' ? 'Income' : 'Expense';
    setDeleteConfirm({
      isOpen: true,
      title: `Delete ${typeLabel} Category?`,
      description: `Are you sure you want to remove "${name}" from your ${typeLabel.toLowerCase()} categories?`,
      affectedItems: [`${name} (${typeLabel} Category)`],
      onConfirm: () => {
        const updated = {
          expense: type === 'expense' ? expenseCats.filter((c) => c !== name) : expenseCats,
          income: type === 'income' ? incomeCats.filter((c) => c !== name) : incomeCats,
          saving: type === 'saving' ? savingCats.filter((c) => c !== name) : savingCats,
        };
        onUpdateCategories(updated);
        setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleSaveEditCategory = (type: 'expense' | 'income' | 'saving') => {
    if (!editingCat || !editingCat.current.trim()) return;
    const oldName = editingCat.original;
    const newName = editingCat.current.trim();

    const updated = {
      expense: type === 'expense' ? expenseCats.map((c) => (c === oldName ? newName : c)) : expenseCats,
      income: type === 'income' ? incomeCats.map((c) => (c === oldName ? newName : c)) : incomeCats,
      saving: type === 'saving' ? savingCats.map((c) => (c === oldName ? newName : c)) : savingCats,
    };
    onUpdateCategories(updated, { type, oldName, newName });
    setEditingCat(null);
  };

  // Template handlers
  const handleOpenAddTemplate = () => {
    setTplId(null);
    setTplType('expense');
    setTplCategory(expenseCats[0] || 'Budget');
    setTplItem('');
    setTplEstimated('');
    setTplFrequency('monthly');
    setTplBiweeklyPeriod('both');
    setTplMethod('Bank Transfer');
    setTplSavingAccountId(accounts[0]?.id || '');
    setTplWithdraw(false);
    setIsTemplateFormOpen(true);
  };

  const handleOpenEditTemplate = (tpl: BudgetItemTemplate) => {
    setTplId(tpl.id);
    setTplType(tpl.type);
    setTplCategory(tpl.category);
    setTplItem(tpl.item);
    setTplEstimated(String(tpl.defaultEstimatedCost || ''));
    setTplFrequency(tpl.frequency || 'monthly');
    setTplBiweeklyPeriod(tpl.biweeklyPeriod || 'both');
    setTplMethod(tpl.defaultPaymentMethod || 'Bank Transfer');
    setTplSavingAccountId(tpl.defaultSavingAccountId || accounts[0]?.id || '');
    setTplWithdraw(Boolean(tpl.toBeWithdrawn));
    setIsTemplateFormOpen(true);
  };

  const handleSaveTemplate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tplItem.trim()) return;
    const estNum = parseFloat(tplEstimated) || 0;

    let updatedList = [...templates];
    if (tplId) {
      updatedList = updatedList.map((t) =>
        t.id === tplId
          ? {
              ...t,
              type: tplType,
              category: tplCategory,
              item: tplItem.trim(),
              defaultEstimatedCost: estNum,
              frequency: tplFrequency,
              biweeklyPeriod: tplBiweeklyPeriod,
              defaultPaymentMethod: tplMethod,
              defaultSavingAccountId: tplType === 'saving' ? (tplSavingAccountId || accounts[0]?.id) : undefined,
              toBeWithdrawn: tplWithdraw,
            }
          : t
      );
    } else {
      const newTpl: BudgetItemTemplate = {
        id: `tpl-${Date.now()}`,
        type: tplType,
        category: tplCategory,
        item: tplItem.trim(),
        defaultEstimatedCost: estNum,
        frequency: tplFrequency,
        biweeklyPeriod: tplBiweeklyPeriod,
        defaultPaymentMethod: tplMethod,
        defaultSavingAccountId: tplType === 'saving' ? (tplSavingAccountId || accounts[0]?.id) : undefined,
        toBeWithdrawn: tplWithdraw,
      };
      updatedList.push(newTpl);
    }

    onUpdateTemplates(updatedList);
    setIsTemplateFormOpen(false);
  };

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-PH', { maximumFractionDigits: 0 }).format(num);

  const handleDeleteTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setDeleteConfirm({
      isOpen: true,
      title: 'Delete Estimated Item Template?',
      description: `Are you sure you want to delete "${tpl.item}" from your estimated budget templates?`,
      affectedItems: [
        `${tpl.item} (${tpl.category}) — Est: ${currencySymbol}${formatNumber(tpl.defaultEstimatedCost)}`,
      ],
      onConfirm: () => {
        onUpdateTemplates(templates.filter((t) => t.id !== id));
        setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
      },
    });
  };

  const handleApplyHelperItem = (helperId: string) => {
    const helper = DEFAULT_ITEM_TEMPLATES.find((d) => d.id === helperId);
    if (!helper) return;
    setTplType(helper.type);
    setTplCategory(helper.category);
    setTplItem(helper.item);
    setTplEstimated(helper.defaultEstimatedCost > 0 ? String(helper.defaultEstimatedCost) : '');
    setTplFrequency(helper.frequency || 'monthly');
    setTplBiweeklyPeriod(helper.biweeklyPeriod || 'both');
    setTplMethod(helper.defaultPaymentMethod || 'Bank Transfer');
    setTplWithdraw(Boolean(helper.toBeWithdrawn));
  };

  const createPersonalizedFromDefault = (): BudgetItemTemplate[] => {
    const now = Date.now();
    return DEFAULT_ITEM_TEMPLATES.map((t, idx) => ({
      ...t,
      id: `tpl-user-${now}-${idx}`,
    }));
  };

  const handleSelectDefaultTemplate = () => {
    if (templates.length > 0) {
      setDeleteConfirm({
        isOpen: true,
        title: 'Replace with Default Starter Template?',
        description:
          'This will replace your current personalized template items with a fresh copy of the default starter template (common income, expense, and funds items) that you can customize. Default and personalized templates will not mix.',
        affectedItems: [
          `${DEFAULT_ITEM_TEMPLATES.length} common income, expense, and funds starter items`,
        ],
        onConfirm: () => {
          onUpdateCategories({
            expense: Array.from(new Set([...EXPENSE_CATEGORIES, ...expenseCats])),
            income: Array.from(new Set([...INCOME_CATEGORIES, ...incomeCats])),
            saving: Array.from(new Set([...SAVING_CATEGORIES, ...savingCats])),
          });
          onUpdateTemplates(createPersonalizedFromDefault());
          setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
        },
      });
    } else {
      onUpdateCategories({
        expense: Array.from(new Set([...EXPENSE_CATEGORIES, ...expenseCats])),
        income: Array.from(new Set([...INCOME_CATEGORIES, ...incomeCats])),
        saving: Array.from(new Set([...SAVING_CATEGORIES, ...savingCats])),
      });
      onUpdateTemplates(createPersonalizedFromDefault());
    }
  };

  const handleStartFromBlank = () => {
    if (templates.length > 0) {
      setDeleteConfirm({
        isOpen: true,
        title: 'Start from a Blank Template?',
        description:
          'This will clear all current estimated template items so you can build your personalized estimate budget from a blank slate. Your recorded period entries will not be affected.',
        affectedItems: [`${templates.length} estimated budget template items`],
        onConfirm: () => {
          onUpdateTemplates([]);
          setDeleteConfirm((prev) => ({ ...prev, isOpen: false }));
        },
      });
    } else {
      onUpdateTemplates([]);
      handleOpenAddTemplate();
    }
  };

  const totalEstIncome = templates
    .filter((t) => t.type === 'income')
    .reduce((s, t) => s + (t.defaultEstimatedCost || 0), 0);
  const totalEstExpense = templates
    .filter((t) => t.type === 'expense')
    .reduce((s, t) => s + (t.defaultEstimatedCost || 0), 0);
  const totalEstFunds = templates
    .filter((t) => t.type === 'saving')
    .reduce((s, t) => s + (t.defaultEstimatedCost || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded-2xl border border-indigo-200 dark:border-indigo-800 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Personalized Estimate Budget &amp; Categories
                </h2>
                {budget.isPersonalizedTemplate && templates.length > 0 ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <Sparkles className="w-3 h-3" />
                    <span>Personalized User Template ({templates.length} items)</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    <span>No Template Set Up Yet</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Customize your recurring income, expenses, and funds estimates. Your personalized template is saved to your local profile and synced to your Google Drive database.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-4 sm:px-6 pt-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-2 overflow-x-auto text-xs font-semibold shrink-0">
          <button
            onClick={() => setActiveTab('estimates')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'estimates'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Monthly Estimated Budget Templates ({templates.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('expense_cats')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'expense_cats'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Receipt className="w-3.5 h-3.5" />
            <span>Expense Categories ({expenseCats.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('income_cats')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'income_cats'
                ? 'border-emerald-600 text-emerald-600 dark:text-emerald-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            <span>Income Categories ({incomeCats.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('saving_cats')}
            className={`pb-3 px-3 border-b-2 transition-all flex items-center gap-1.5 shrink-0 ${
              activeTab === 'saving_cats'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <PiggyBank className="w-3.5 h-3.5" />
            <span>Funds Categories ({savingCats.length})</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-xs">
          
          {/* TAB 1: ESTIMATED BUDGET ITEMS TEMPLATES */}
          {activeTab === 'estimates' && (
            <div className="space-y-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-700">
                <div>
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Personalized Estimated Budget Template
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Set up your template by selecting the default starter template or starting from a blank slate. Only your personalized template items appear in the budget grid.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={handleOpenAddTemplate}
                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center gap-1.5 shrink-0 cursor-pointer shadow-xs"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Estimated Item</span>
                  </button>
                </div>
              </div>

              {/* Monthly Template Summary Totals */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/60 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Est. Monthly Income:</span>
                  <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300">
                    {currencySymbol}{formatNumber(totalEstIncome)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-200/70 dark:border-rose-800/60 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Est. Living Expenses:</span>
                  <span className="font-mono font-bold text-sm text-rose-700 dark:text-rose-300">
                    {currencySymbol}{formatNumber(totalEstExpense)}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200/70 dark:border-indigo-800/60 flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-400 font-medium">Est. Planned Funds:</span>
                  <span className="font-mono font-bold text-sm text-indigo-700 dark:text-indigo-300">
                    {currencySymbol}{formatNumber(totalEstFunds)}
                  </span>
                </div>
              </div>

              {/* Template Items Table */}
              {templates.length === 0 ? (
                <div className="py-10 px-4 text-center border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl bg-slate-50/50 dark:bg-slate-800/30 space-y-5">
                  <div className="space-y-1.5">
                    <Sparkles className="w-8 h-8 text-indigo-500 mx-auto" />
                    <h5 className="text-sm font-bold text-slate-900 dark:text-white">
                      Set Up Your Personalized Estimate Budget Template
                    </h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-lg mx-auto">
                      Choose how you would like to initialize your personalized template. Nothing is shown in the budget grid until you set up your template.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto text-left">
                    {/* Option 1: Select Default Template */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between gap-3">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 mb-2">
                          <Sparkles className="w-3 h-3" />
                          <span>Option 1: Recommended Helper</span>
                        </div>
                        <h6 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                          Select Default Starter Template
                        </h6>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Pre-populate your personalized template with {DEFAULT_ITEM_TEMPLATES.length} common income, expense, and funds items that you can freely edit, rename, or remove.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleSelectDefaultTemplate}
                        className="w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Use Default Starter Template</span>
                      </button>
                    </div>

                    {/* Option 2: Start from a Blank */}
                    <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xs flex flex-col justify-between gap-3">
                      <div>
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 mb-2">
                          <Plus className="w-3 h-3" />
                          <span>Option 2: Custom Scratch</span>
                        </div>
                        <h6 className="font-bold text-slate-900 dark:text-white text-xs sm:text-sm">
                          Start from a Blank Template
                        </h6>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                          Begin with an empty template list and add your own personalized income, living expenses, and funds items one by one from scratch.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleStartFromBlank}
                        className="w-full py-2 px-4 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Start from Blank &amp; Add Item</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Sorting & Filter Controls Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50 dark:bg-slate-800/40 p-2.5 rounded-2xl border border-slate-200 dark:border-slate-700/70">
                    <div className="relative flex-1 max-w-xs">
                      <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search items or categories..."
                        value={templateSearchQuery}
                        onChange={(e) => setTemplateSearchQuery(e.target.value)}
                        className="w-full pl-8 pr-7 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      />
                      {templateSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setTemplateSearchQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-slate-400 font-semibold mr-1 hidden md:inline">Sort:</span>
                      <button
                        type="button"
                        onClick={() => handleApplyPresetSort('type', 'asc')}
                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          sortField === 'type'
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        title="Group by Type: Income first, then Expenses, then Funds"
                      >
                        Type
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPresetSort('category', 'asc')}
                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          sortField === 'category'
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        title="Sort alphabetically by category"
                      >
                        Category (A-Z)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPresetSort('item', 'asc')}
                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          sortField === 'item'
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        title="Sort alphabetically by item name"
                      >
                        Name (A-Z)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPresetSort('cost', 'desc')}
                        className={`px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                          sortField === 'cost'
                            ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700 font-bold'
                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                        title="Sort by highest estimated cost first"
                      >
                        Cost (High&rarr;Low)
                      </button>
                      {sortField !== 'manual' && (
                        <button
                          type="button"
                          onClick={() => setSortField('manual')}
                          className="px-2 py-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[10px] underline cursor-pointer"
                        >
                          Manual Order
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-x-auto shadow-2xs">
                    <table className="w-full text-left text-xs min-w-[680px]">
                      <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold border-b border-slate-200 dark:border-slate-700 select-none">
                        <tr>
                          <th className="py-2.5 px-3 text-center w-16">
                            <span title="Order in budget grid"># Order</span>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('item')}
                            className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Line Item</span>
                              {sortField === 'item' ? (
                                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('type')}
                            className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Type</span>
                              {sortField === 'type' ? (
                                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('category')}
                            className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Category</span>
                              {sortField === 'category' ? (
                                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('frequency')}
                            className="py-2.5 px-4 cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                          >
                            <div className="flex items-center gap-1.5">
                              <span>Frequency</span>
                              {sortField === 'frequency' ? (
                                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                              )}
                            </div>
                          </th>
                          <th
                            onClick={() => handleToggleColumnSort('cost')}
                            className="py-2.5 px-4 text-right cursor-pointer hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              <span>Estimated Cost</span>
                              {sortField === 'cost' ? (
                                sortDirection === 'asc' ? <ArrowUp className="w-3 h-3 text-indigo-600" /> : <ArrowDown className="w-3 h-3 text-indigo-600" />
                              ) : (
                                <ArrowUpDown className="w-3 h-3 text-slate-400 opacity-60" />
                              )}
                            </div>
                          </th>
                          <th className="py-2.5 px-4">Default Payment Channel</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {displayedTemplates.map((tpl) => {
                          const originalIndex = templates.findIndex((t) => t.id === tpl.id);
                          return (
                            <tr key={tpl.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                              {/* Order & Reordering Arrows */}
                              <td className="py-2 px-2 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <span className="font-mono text-[10px] text-slate-400 w-4 text-right">
                                    {originalIndex + 1}
                                  </span>
                                  <div className="flex flex-col">
                                    <button
                                      type="button"
                                      disabled={originalIndex <= 0}
                                      onClick={() => handleMoveTemplate(originalIndex, 'up')}
                                      className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                      title="Move up in order"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={originalIndex >= templates.length - 1}
                                      onClick={() => handleMoveTemplate(originalIndex, 'down')}
                                      className="p-0.5 text-slate-400 hover:text-indigo-600 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed transition-colors"
                                      title="Move down in order"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                </div>
                              </td>

                              <td className="py-2.5 px-4 font-semibold text-slate-800 dark:text-slate-200">
                                {tpl.item}
                              </td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                                    tpl.type === 'income'
                                      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                      : tpl.type === 'saving'
                                      ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300'
                                      : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                                  }`}
                                >
                                  {tpl.type === 'saving' ? 'funds' : tpl.type}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 dark:text-slate-400">
                                {tpl.category}
                              </td>
                              <td className="py-2.5 px-4">
                                <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-[10px]">
                                  {tpl.frequency === 'bi-weekly'
                                    ? `Bi-Weekly (${tpl.biweeklyPeriod || 'both'})`
                                    : tpl.frequency === 'both'
                                    ? `Both (${tpl.biweeklyPeriod || 'both'})`
                                    : 'Monthly'}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-900 dark:text-white">
                                {currencySymbol}{formatNumber(tpl.defaultEstimatedCost)}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">
                                {tpl.type === 'saving' ? (
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                                    <PiggyBank className="w-3.5 h-3.5" />
                                    <span>
                                      {accounts?.find((a) => a.id === tpl.defaultSavingAccountId)?.name || 'Default Account'}
                                    </span>
                                  </span>
                                ) : (
                                  tpl.defaultPaymentMethod || 'Bank Transfer'
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => handleOpenEditTemplate(tpl)}
                                    className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                                    title="Edit template item"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleDeleteTemplate(tpl.id)}
                                    className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                                    title="Delete template item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2, 3, 4: CATEGORY MANAGERS */}
          {activeTab !== 'estimates' && (
            <div className="space-y-4 max-w-2xl mx-auto">
              {/* Add category row */}
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder={`New ${activeTab.replace('_cats', '')} category name...`}
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCategory(
                        activeTab === 'expense_cats'
                          ? 'expense'
                          : activeTab === 'income_cats'
                          ? 'income'
                          : 'saving'
                      );
                    }
                  }}
                  className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button
                  type="button"
                  onClick={() =>
                    handleAddCategory(
                      activeTab === 'expense_cats'
                        ? 'expense'
                        : activeTab === 'income_cats'
                        ? 'income'
                        : 'saving'
                    )
                  }
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Add Category</span>
                </button>
              </div>

              {/* List of categories */}
              <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {(activeTab === 'expense_cats'
                  ? expenseCats
                  : activeTab === 'income_cats'
                  ? incomeCats
                  : savingCats
                ).map((cat) => (
                  <div
                    key={cat}
                    className="p-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {editingCat?.original === cat ? (
                      <div className="flex items-center gap-2 flex-1 mr-4">
                        <input
                          type="text"
                          value={editingCat.current}
                          onChange={(e) =>
                            setEditingCat({ ...editingCat, current: e.target.value })
                          }
                          className="px-3 py-1 bg-white dark:bg-slate-900 border border-indigo-400 rounded-lg flex-1"
                        />
                        <button
                          onClick={() =>
                            handleSaveEditCategory(
                              activeTab === 'expense_cats'
                                ? 'expense'
                                : activeTab === 'income_cats'
                                ? 'income'
                                : 'saving'
                            )
                          }
                          className="p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingCat(null)}
                          className="p-1.5 text-slate-400 hover:bg-slate-200 rounded-lg"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-indigo-500" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200">
                          {cat}
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setEditingCat({ original: cat, current: cat })}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                        title="Rename category"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() =>
                          handleDeleteCategory(
                            activeTab === 'expense_cats'
                              ? 'expense'
                              : activeTab === 'income_cats'
                              ? 'income'
                              : 'saving',
                            cat
                          )
                        }
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        title="Delete category"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
          <span className="text-slate-400">
            Changes save to your standalone Estimate Budget Template (<code className="font-mono text-amber-600 dark:text-amber-400">capitalflow_budget_template.json</code>) and sync to Google Drive.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold rounded-xl shrink-0 cursor-pointer"
          >
            Done
          </button>
        </div>

      </div>

      {/* SUB-MODAL: ADD / EDIT ITEM TEMPLATE */}
      {isTemplateFormOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {tplId ? 'Edit Estimated Item Template' : 'New Estimated Item Template'}
              </h3>
              <button onClick={() => setIsTemplateFormOpen(false)}>
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <form onSubmit={handleSaveTemplate} className="space-y-3.5">
              {!tplId && (
                <div className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60">
                  <label className="block text-[11px] font-bold text-amber-800 dark:text-amber-300 mb-1">
                    Starter Template Helper (Optional Quick-Fill)
                  </label>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        handleApplyHelperItem(e.target.value);
                      }
                    }}
                    className="w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-amber-300 dark:border-amber-700 rounded-lg text-xs text-slate-700 dark:text-slate-200"
                  >
                    <option value="">-- Choose a common starter item as helper --</option>
                    {DEFAULT_ITEM_TEMPLATES.map((d) => (
                      <option key={d.id} value={d.id}>
                        [{d.type === 'saving' ? 'Funds' : d.type.toUpperCase()}] {d.item} ({d.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Type</label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setTplType('expense');
                      setTplCategory(expenseCats[0] || 'Budget');
                    }}
                    className={`py-1.5 rounded-lg font-semibold border ${
                      tplType === 'expense'
                        ? 'bg-rose-50 border-rose-400 text-rose-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTplType('income');
                      setTplCategory(incomeCats[0] || 'Salary');
                    }}
                    className={`py-1.5 rounded-lg font-semibold border ${
                      tplType === 'income'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Income
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setTplType('saving');
                      setTplCategory('Savings');
                    }}
                    className={`py-1.5 rounded-lg font-semibold border ${
                      tplType === 'saving'
                        ? 'bg-indigo-50 border-indigo-400 text-indigo-700'
                        : 'border-slate-200 text-slate-600'
                    }`}
                  >
                    Funds
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Category</label>
                <select
                  value={tplCategory}
                  onChange={(e) => setTplCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  {(tplType === 'income'
                    ? incomeCats
                    : tplType === 'saving'
                    ? savingCats
                    : expenseCats
                  ).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Line Item Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Electricity Bill, Groceries & Supermarket, Rent"
                  value={tplItem}
                  onChange={(e) => setTplItem(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1">Frequency</label>
                <select
                  value={tplFrequency}
                  onChange={(e) => setTplFrequency(e.target.value as 'monthly' | 'bi-weekly' | 'both')}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                >
                  <option value="monthly">Monthly (Applies to Monthly periods)</option>
                  <option value="bi-weekly">Bi-Weekly (Applies to P1 / P2 periods)</option>
                  <option value="both">Both (Monthly &amp; Bi-Weekly)</option>
                </select>
              </div>

              {(tplFrequency === 'bi-weekly' || tplFrequency === 'both') && (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">Bi-Weekly Period</label>
                  <select
                    value={tplBiweeklyPeriod}
                    onChange={(e) => setTplBiweeklyPeriod(e.target.value as 'P1' | 'P2' | 'both')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <option value="both">Both (P1 &amp; P2)</option>
                    <option value="P1">P1 (First Half / 1st-15th)</option>
                    <option value="P2">P2 (Second Half / 16th-End)</option>
                  </select>
                </div>
              )}

              <div>
                <label className="block text-slate-600 font-semibold mb-1">
                  Default Estimated Cost ({currencySymbol})
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="e.g. 3500"
                  value={tplEstimated}
                  onChange={(e) => setTplEstimated(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl font-mono"
                />
              </div>

              {tplType === 'saving' ? (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    Destination Fund Account
                  </label>
                  <select
                    value={tplSavingAccountId}
                    onChange={(e) => setTplSavingAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {accounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({acc.type})
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">
                    Default Payment Channel
                  </label>
                  <select
                    value={tplMethod}
                    onChange={(e) => setTplMethod(e.target.value as PaymentMethod)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    {PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsTemplateFormOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl"
                >
                  Save Template Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal for Templates & Categories */}
      <ConfirmationModal
        isOpen={deleteConfirm.isOpen}
        title={deleteConfirm.title}
        description={deleteConfirm.description}
        affectedItems={deleteConfirm.affectedItems}
        confirmLabel="Yes, Delete"
        isDestructive={true}
        onConfirm={deleteConfirm.onConfirm}
        onCancel={() => setDeleteConfirm((prev) => ({ ...prev, isOpen: false }))}
      />

    </div>
  );
};
