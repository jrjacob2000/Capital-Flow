import React, { useState, useEffect, useCallback } from 'react';
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
} from '../services/sampleData';
import { BudgetSpreadsheetView } from './BudgetSpreadsheetView';

interface BudgetEntryViewProps {
  budget: YearBudgetData;
  accounts: SavingsAccount[];
  frequency: EntryFrequency;
  onChangeFrequency: (freq: EntryFrequency) => void;
  onAddEntry: (entry: Omit<BudgetEntry, 'id' | 'createdAt'>) => void;
  onAddMultipleEntries?: (
    entries: Omit<BudgetEntry, 'id' | 'createdAt'>[],
    options?: { replacePeriod?: string; customExpenseCategories?: string[] }
  ) => void;
  onUpdateEntry?: (entryId: string, updated: Partial<BudgetEntry>) => void;
  onDeleteEntry: (entryId: string) => void;
  onDeletePeriodItem?: (
    period: string,
    target: {
      entryId?: string;
      templateId?: string;
      type: EntryType;
      item: string;
      category?: string;
      estimatedCost?: number;
      actualCost?: number;
      hasActualCost?: boolean;
      status?: 'Paid' | 'Pending' | 'Scheduled';
      loanId?: string;
    }
  ) => void;
  onRestorePeriodItems?: (period: string) => void;
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
  onDeletePeriodItem,
  onRestorePeriodItems,
  onUpdateCategories,
  onUpdateTemplates,
  currencySymbol = '₱',
}) => {
  // Determine the default period cleanly without hardcoded month fallbacks
  const resolveInitialPeriod = useCallback(() => {
    // 1. Try to restore user's last selected period for this year
    try {
      const saved = localStorage.getItem(`capitalflow_active_period_${budget.year}`);
      if (saved) {
        if (frequency === 'monthly' && MONTH_NAMES.includes(saved)) {
          return saved;
        }
        if (frequency === 'bi-weekly' && BIWEEKLY_PERIODS.some((p) => p.id === saved)) {
          return saved;
        }
      }
    } catch {
      // Ignore storage access errors
    }

    const currentCalendarYear = new Date().getFullYear();
    const currentCalendarMonth = MONTH_NAMES[new Date().getMonth()] || 'Jan';
    const currentBiWeeklyPeriod = `${currentCalendarMonth}-${new Date().getDate() <= 15 ? 'P1' : 'P2'}`;

    // 2. If viewing the current calendar year, default to current real-world period
    if (budget.year === currentCalendarYear) {
      return frequency === 'monthly' ? currentCalendarMonth : currentBiWeeklyPeriod;
    }

    // 3. If viewing another year, default to the latest period that has entries
    if (budget.entries && budget.entries.length > 0) {
      for (let i = MONTH_NAMES.length - 1; i >= 0; i--) {
        const m = MONTH_NAMES[i];
        const hasData = budget.entries.some((e) => e.period === m || e.period.startsWith(`${m}-`));
        if (hasData) {
          return frequency === 'monthly' ? m : `${m}-P1`;
        }
      }
    }

    return frequency === 'monthly' ? 'Jan' : 'Jan-P1';
  }, [budget.year, budget.entries, frequency]);

  const [selectedPeriodFilter, setSelectedPeriodFilter] = useState<string>(resolveInitialPeriod);

  // Update selected period and persist to localStorage
  const handleSelectPeriodFilter = useCallback(
    (p: string) => {
      setSelectedPeriodFilter(p);
      try {
        localStorage.setItem(`capitalflow_active_period_${budget.year}`, p);
      } catch {
        // Ignore storage access errors
      }
    },
    [budget.year]
  );

  // Sync default period when frequency changes while preserving the active month
  useEffect(() => {
    const currentCalendarMonth = MONTH_NAMES[new Date().getMonth()] || 'Jan';
    const currentBiWeeklyPeriod = `${currentCalendarMonth}-${new Date().getDate() <= 15 ? 'P1' : 'P2'}`;

    if (frequency === 'monthly') {
      if (!MONTH_NAMES.includes(selectedPeriodFilter) && selectedPeriodFilter !== 'all') {
        const stripped = selectedPeriodFilter.replace(/-P[12]$/i, '');
        const nextPeriod = MONTH_NAMES.includes(stripped) ? stripped : currentCalendarMonth;
        setSelectedPeriodFilter(nextPeriod);
        try {
          localStorage.setItem(`capitalflow_active_period_${budget.year}`, nextPeriod);
        } catch {
          // Ignore
        }
      }
    } else {
      if (!BIWEEKLY_PERIODS.some((p) => p.id === selectedPeriodFilter) && selectedPeriodFilter !== 'all') {
        const nextPeriod = MONTH_NAMES.includes(selectedPeriodFilter)
          ? `${selectedPeriodFilter}-P1`
          : currentBiWeeklyPeriod;
        setSelectedPeriodFilter(nextPeriod);
        try {
          localStorage.setItem(`capitalflow_active_period_${budget.year}`, nextPeriod);
        } catch {
          // Ignore
        }
      }
    }
  }, [frequency, budget.year, selectedPeriodFilter]);

  // Reset selected period when switching budget years
  const prevYearRef = React.useRef(budget.year);
  useEffect(() => {
    if (prevYearRef.current !== budget.year) {
      prevYearRef.current = budget.year;
      setSelectedPeriodFilter(resolveInitialPeriod());
    }
  }, [budget.year, resolveInitialPeriod]);

  return (
    <div key="spreadsheet-layout-root" className="space-y-4">
      <BudgetSpreadsheetView
        budget={budget}
        accounts={accounts}
        selectedPeriod={selectedPeriodFilter}
        onSelectPeriod={handleSelectPeriodFilter}
        frequency={frequency}
        onChangeFrequency={onChangeFrequency}
        onAddEntry={onAddEntry}
        onAddMultipleEntries={onAddMultipleEntries}
        onUpdateEntry={onUpdateEntry || (() => {})}
        onDeleteEntry={onDeleteEntry}
        onDeletePeriodItem={onDeletePeriodItem}
        onRestorePeriodItems={onRestorePeriodItems}
        onUpdateCategories={onUpdateCategories}
        onUpdateTemplates={onUpdateTemplates}
        currencySymbol={currencySymbol}
      />
    </div>
  );
};
