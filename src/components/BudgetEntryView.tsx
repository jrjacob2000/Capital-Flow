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
  const currentMonthName =
    budget.entries?.some((e) => e.period === 'Oct')
      ? 'Oct'
      : MONTH_NAMES[new Date().getMonth()] || 'Oct';
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

  return (
    <div key="spreadsheet-layout-root" className="space-y-4">
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
};
