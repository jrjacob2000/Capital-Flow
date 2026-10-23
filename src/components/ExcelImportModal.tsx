import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileSpreadsheet, CheckCircle2, X, AlertCircle } from 'lucide-react';
import { BudgetEntry, PaymentMethod } from '../types/finance';
import {
  MONTH_NAMES,
  normalizeCategoryWording,
  normalizeSavingCategoryGroup,
  resolveCanonicalSinkingFundName,
} from '../services/sampleData';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  year: number;
  defaultPeriod: string;
  currencySymbol?: string;
  onImportActualEntries: (
    period: string,
    entries: Omit<BudgetEntry, 'id' | 'createdAt'>[],
    replaceExistingInPeriod: boolean,
    discoveredExpenseCategories: string[]
  ) => void;
}

const parseCurrencyNumber = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '-') return 0;
  const isNegative = (trimmed.startsWith('(') && trimmed.endsWith(')')) || trimmed.startsWith('-');
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
};

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  year,
  defaultPeriod,
  currencySymbol = '₱',
  onImportActualEntries,
}) => {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [targetPeriod, setTargetPeriod] = useState<string>(
    MONTH_NAMES.includes(defaultPeriod) ? defaultPeriod : 'Oct'
  );
  const [replaceExisting, setReplaceExisting] = useState<boolean>(true);
  const [parsedEntries, setParsedEntries] = useState<Omit<BudgetEntry, 'id' | 'createdAt'>[]>([]);
  const [discoveredCategories, setDiscoveredCategories] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  if (!isOpen) return null;

  const parseSheetToActualEntries = (wb: XLSX.WorkBook, sheetName: string, period: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    const periodIndex = Math.max(0, MONTH_NAMES.indexOf(period));
    const dateStr = `${year}-${String(periodIndex + 1).padStart(2, '0')}-01`;

    const entries: Omit<BudgetEntry, 'id' | 'createdAt'>[] = [];
    const newCategories = new Set<string>();
    let section: 'none' | 'income' | 'expense' = 'none';

    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      if (!Array.isArray(row)) continue;

      const colB = String(row[1] ?? '').trim();
      const colC = String(row[2] ?? '').trim();
      const colBAndC = `${colB} ${colC}`.toLowerCase();

      if (colC.toLowerCase() === 'income' && !colB) {
        section = 'income';
        continue;
      }
      if (colC.toLowerCase().includes('monthly expenses') || (colB.toLowerCase() === 'category' && colC.toLowerCase() === 'item')) {
        section = 'expense';
        continue;
      }
      if (
        colC.toLowerCase().includes('expenses total summary') ||
        colC.toLowerCase().includes('total expense') ||
        colC.toLowerCase().includes('total to be withdraw')
      ) {
        if (section === 'expense') {
          break;
        }
      }

      if (section === 'income') {
        if (
          !colC ||
          colC.toLowerCase() === 'estimated' ||
          colC.toLowerCase().includes('total income')
        ) {
          continue;
        }
        // In the Income table: Col C (2) = Item, Col D (3) = Estimated, Col E (4) = Actual
        const actualVal = parseCurrencyNumber(row[4]);
        if (actualVal > 0) {
          entries.push({
            year,
            period,
            periodIndex,
            date: dateStr,
            type: 'income',
            category: 'Salary & Wages',
            item: colC,
            estimatedCost: 0,
            actualCost: actualVal,
            amount: actualVal,
            paymentMethod: 'Bank Transfer',
            difference: actualVal,
            status: 'Paid',
            reference: '',
            description: colC,
          });
        }
      } else if (section === 'expense') {
        if (
          !colB && !colC ||
          colB.toLowerCase() === 'category' ||
          colBAndC.includes('estimated cost')
        ) {
          continue;
        }

        // Columns in Monthly Expenses:
        // [1] Category, [2] Item, [3] Estimated Cost, [4] Actual Cost, [5] Stay in ATM,
        // [6] Cash, [7] Credit Card, [8] GCash Transfer, [9] Kath Account, [10] Check Account, [11] Bank Transfer,
        // [12] Difference, [13] Status, [14] Reference
        const actualColE = parseCurrencyNumber(row[4]);
        if (actualColE <= 0) {
          continue;
        }

        const cash = parseCurrencyNumber(row[6]);
        const creditCard = parseCurrencyNumber(row[7]);
        const gcashTransfer = parseCurrencyNumber(row[8]);
        const kathAccount = parseCurrencyNumber(row[9]);
        const checkAccount = parseCurrencyNumber(row[10]);
        const bankTransfer = parseCurrencyNumber(row[11]);
        const refText = String(row[14] ?? '').trim();

        const methodPairs: { method: PaymentMethod; val: number }[] = (
          [
            { method: 'Cash', val: cash },
            { method: 'Credit Card', val: creditCard },
            { method: 'GCash Transfer', val: gcashTransfer },
            { method: 'Kath Account', val: kathAccount },
            { method: 'Checking Account', val: checkAccount },
            { method: 'Bank Transfer', val: bankTransfer },
          ] as { method: PaymentMethod; val: number }[]
        ).filter((m) => m.val > 0);

        let primaryMethod: PaymentMethod = 'Bank Transfer';
        if (methodPairs.length > 0) {
          methodPairs.sort((a, b) => b.val - a.val);
          primaryMethod = methodPairs[0].method;
        }

        const hasSplit = methodPairs.length > 1;
        const categoryName = normalizeCategoryWording(colB || 'Miscellaneous');
        const itemName = colC || categoryName;
        const isSaving =
          categoryName.toLowerCase() === 'savings' || itemName.toLowerCase() === 'savings';

        if (!isSaving && categoryName) {
          newCategories.add(categoryName);
        }

        entries.push({
          year,
          period,
          periodIndex,
          date: dateStr,
          type: isSaving ? 'saving' : 'expense',
          category: isSaving ? normalizeSavingCategoryGroup(itemName, categoryName) : categoryName,
          item: isSaving ? resolveCanonicalSinkingFundName(itemName, categoryName) : itemName,
          estimatedCost: 0,
          actualCost: actualColE,
          amount: actualColE,
          paymentMethod: primaryMethod,
          paymentBreakdown: hasSplit
            ? {
                ...(cash > 0 ? { cash } : {}),
                ...(creditCard > 0 ? { creditCard } : {}),
                ...(gcashTransfer > 0 ? { gcashTransfer } : {}),
                ...(kathAccount > 0 ? { kathAccount } : {}),
                ...(checkAccount > 0 ? { checkAccount } : {}),
                ...(bankTransfer > 0 ? { bankTransfer } : {}),
              }
            : undefined,
          difference: -actualColE,
          status: 'Paid',
          reference: refText,
          toBeWithdrawn: categoryName.toLowerCase().includes('odiongan'),
          description: itemName,
        });
      }
    }

    setParsedEntries(entries);
    setDiscoveredCategories(Array.from(newCategories));
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Spreadsheet file is too large (max 10 MB allowed).');
      e.target.value = '';
      return;
    }
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      setWorkbook(wb);
      setSheetNames(wb.SheetNames);

      // Prefer a sheet matching 'oct' or targetPeriod if present
      const matchingSheet =
        wb.SheetNames.find((s) => s.toLowerCase().includes(targetPeriod.toLowerCase())) ||
        wb.SheetNames.find((s) => s.toLowerCase().includes('oct')) ||
        wb.SheetNames[0] ||
        '';
      setSelectedSheet(matchingSheet);

      // If sheet name matches a month, auto-set targetPeriod
      const matchedMonth = MONTH_NAMES.find((m) =>
        matchingSheet.toLowerCase().includes(m.toLowerCase())
      );
      const effectivePeriod = matchedMonth || targetPeriod;
      if (matchedMonth) {
        setTargetPeriod(matchedMonth);
      }

      if (matchingSheet) {
        parseSheetToActualEntries(wb, matchingSheet, effectivePeriod);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Could not parse spreadsheet file.');
    }
  };

  const handleSheetChange = (newSheet: string) => {
    setSelectedSheet(newSheet);
    const matchedMonth = MONTH_NAMES.find((m) =>
      newSheet.toLowerCase().includes(m.toLowerCase())
    );
    const effectivePeriod = matchedMonth || targetPeriod;
    if (matchedMonth) {
      setTargetPeriod(matchedMonth);
    }
    if (workbook && newSheet) {
      parseSheetToActualEntries(workbook, newSheet, effectivePeriod);
    }
  };

  const handlePeriodChange = (newPeriod: string) => {
    setTargetPeriod(newPeriod);
    if (workbook && selectedSheet) {
      parseSheetToActualEntries(workbook, selectedSheet, newPeriod);
    }
  };

  const totalActualIncome = parsedEntries
    .filter((e) => e.type === 'income')
    .reduce((s, e) => s + (e.actualCost || 0), 0);
  const totalActualExpense = parsedEntries
    .filter((e) => e.type !== 'income')
    .reduce((s, e) => s + (e.actualCost || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Import Excel (.xlsx / .csv) — Actual Data Only
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Select any worksheet tab (e.g. Oct) from your Excel workbook to migrate only actual recorded values
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto my-4 space-y-4 pr-1">
          {/* File Upload Box */}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 rounded-2xl p-5 bg-emerald-50/40 dark:bg-emerald-950/20 cursor-pointer transition-colors">
            <Upload className="w-6 h-6 text-emerald-600 dark:text-emerald-400 mb-1.5" />
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
              {fileName ? `Loaded: ${fileName}` : 'Click to select your Home_Buget_2026.xlsx file'}
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Reads all worksheet tabs directly in your browser (Actual Cost &gt; 0 only)
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {sheetNames.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  1. Select Excel Worksheet Tab ({sheetNames.length} tabs found)
                </label>
                <select
                  value={selectedSheet}
                  onChange={(e) => handleSheetChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                >
                  {sheetNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  2. Target Period in CapitalFlow ({year})
                </label>
                <select
                  value={targetPeriod}
                  onChange={(e) => handlePeriodChange(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-semibold"
                >
                  {MONTH_NAMES.map((m) => (
                    <option key={m} value={m}>
                      {m} ({year})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {parsedEntries.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Found {parsedEntries.length} Actual Entries in &quot;{selectedSheet}&quot;
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Estimated values and ₱0 rows are automatically excluded.
                  </p>
                </div>
                <div className="text-right font-mono">
                  <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                    Income: {currencySymbol}{totalActualIncome.toLocaleString()}
                  </div>
                  <div className="text-rose-600 dark:text-rose-400 font-bold">
                    Expenses: {currencySymbol}{totalActualExpense.toLocaleString()}
                  </div>
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>Replace existing entries in {targetPeriod} ({year}) with these actual records</span>
              </label>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-60 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Item</th>
                      <th className="py-2 px-3">Payment Method</th>
                      <th className="py-2 px-3 text-right">Actual Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedEntries.map((entry, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 capitalize font-medium">{entry.type}</td>
                        <td className="py-1.5 px-3 text-slate-500">{entry.category}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-900 dark:text-white">{entry.item}</td>
                        <td className="py-1.5 px-3 text-slate-500">{entry.paymentMethod}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold">
                          {currencySymbol}{(entry.actualCost || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={parsedEntries.length === 0}
            onClick={() => {
              onImportActualEntries(targetPeriod, parsedEntries, replaceExisting, discoveredCategories);
              onClose();
            }}
            className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-semibold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Import {parsedEntries.length} Actual Entries into {targetPeriod}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
