import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  X,
  AlertCircle,
  Download,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { BudgetEntry, PaymentMethod } from '../types/finance';
import { MONTH_NAMES, BIWEEKLY_PERIODS, EXPENSE_CATEGORIES, PAYMENT_METHODS } from '../services/sampleData';
import {
  ImportParserMode,
  UniversalColumnMapping,
  DetectedColumnOption,
  DefaultTypeBehavior,
  analyzeAndParseWorksheet,
  parseStructuredRowsToEntries,
  parseUniversalRowsToEntries,
  isStructuredBudgetSheet,
  downloadSampleExcelTemplate,
} from '../utils/excelImportParser';

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

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  year,
  defaultPeriod,
  currencySymbol = '₱',
  onImportActualEntries,
}) => {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetRows, setSheetRows] = useState<unknown[][]>([]);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const resolveValidPeriod = (period: string): string => {
    if (MONTH_NAMES.includes(period)) return period;
    if (BIWEEKLY_PERIODS.some((p) => p.id === period)) return period;
    const stripped = period?.replace(/-P[12]$/i, '');
    if (stripped && MONTH_NAMES.includes(stripped)) return stripped;
    return MONTH_NAMES[new Date().getMonth()] || 'Jan';
  };

  const [targetPeriod, setTargetPeriod] = useState<string>(() => resolveValidPeriod(defaultPeriod));
  const [replaceExisting, setReplaceExisting] = useState<boolean>(false);
  const [parserMode, setParserMode] = useState<ImportParserMode>('universal');
  const [detectedStructured, setDetectedStructured] = useState<boolean>(false);
  const [showColumnMapper, setShowColumnMapper] = useState<boolean>(false);
  const [columns, setColumns] = useState<DetectedColumnOption[]>([]);
  const [mapping, setMapping] = useState<UniversalColumnMapping | null>(null);
  const [parsedEntries, setParsedEntries] = useState<Omit<BudgetEntry, 'id' | 'createdAt'>[]>([]);
  const [discoveredCategories, setDiscoveredCategories] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    if (isOpen && !workbook) {
      setTargetPeriod(resolveValidPeriod(defaultPeriod));
    }
  }, [isOpen, defaultPeriod, workbook]);

  if (!isOpen) return null;

  const loadAndAnalyzeSheet = (wb: XLSX.WorkBook, sheetName: string, period: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' });
    setSheetRows(rows);

    const structuredInfo = isStructuredBudgetSheet(rows);
    setDetectedStructured(structuredInfo.isStructured);

    const result = analyzeAndParseWorksheet(rows, year, period);
    setParserMode(result.detectedMode);
    setColumns(result.columns);
    setMapping(result.suggestedMapping);
    setParsedEntries(result.entries);
    setDiscoveredCategories(result.discoveredExpenseCategories);
    setShowColumnMapper(result.detectedMode === 'universal');
  };

  const recomputeWithMapping = (
    rows: unknown[][],
    mode: ImportParserMode,
    nextMapping: UniversalColumnMapping,
    period: string
  ) => {
    if (mode === 'structured') {
      const structuredInfo = isStructuredBudgetSheet(rows);
      const res = parseStructuredRowsToEntries(rows, year, period, structuredInfo.colOffset);
      setParsedEntries(res.entries);
      setDiscoveredCategories(res.discoveredExpenseCategories);
    } else {
      const res = parseUniversalRowsToEntries(rows, nextMapping, year, period);
      setParsedEntries(res.entries);
      setDiscoveredCategories(res.discoveredExpenseCategories);
    }
  };

  const handleUpdateMapping = (patch: Partial<UniversalColumnMapping>) => {
    if (!mapping) return;
    const updated: UniversalColumnMapping = { ...mapping, ...patch };
    setMapping(updated);
    recomputeWithMapping(sheetRows, 'universal', updated, targetPeriod);
  };

  const handleSwitchMode = (newMode: ImportParserMode) => {
    setParserMode(newMode);
    setShowColumnMapper(newMode === 'universal');
    if (mapping) {
      recomputeWithMapping(sheetRows, newMode, mapping, targetPeriod);
    }
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

      const matchingSheet =
        wb.SheetNames.find((s) => s.toLowerCase().includes(targetPeriod.toLowerCase())) ||
        wb.SheetNames.find((s) => s.toLowerCase().includes('oct')) ||
        wb.SheetNames[0] ||
        '';
      setSelectedSheet(matchingSheet);

      const matchedMonth = MONTH_NAMES.find((m) =>
        matchingSheet.toLowerCase().includes(m.toLowerCase())
      );
      const effectivePeriod = matchedMonth || targetPeriod;
      if (matchedMonth) {
        setTargetPeriod(matchedMonth);
      }

      if (matchingSheet) {
        loadAndAnalyzeSheet(wb, matchingSheet, effectivePeriod);
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
      loadAndAnalyzeSheet(workbook, newSheet, effectivePeriod);
    }
  };

  const handlePeriodChange = (newPeriod: string) => {
    setTargetPeriod(newPeriod);
    if (sheetRows.length > 0 && mapping) {
      recomputeWithMapping(sheetRows, parserMode, mapping, newPeriod);
    } else if (workbook && selectedSheet) {
      loadAndAnalyzeSheet(workbook, selectedSheet, newPeriod);
    }
  };

  const totalActualIncome = parsedEntries
    .filter((e) => e.type === 'income')
    .reduce((s, e) => s + (e.actualCost || e.amount || 0), 0);
  const totalActualExpense = parsedEntries
    .filter((e) => e.type === 'expense')
    .reduce((s, e) => s + (e.actualCost || e.amount || 0), 0);
  const totalActualSaving = parsedEntries
    .filter((e) => e.type === 'saving')
    .reduce((s, e) => s + (e.actualCost || e.amount || 0), 0);

  return (
    <div className="fixed inset-0 m-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl p-3.5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl text-xs max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-2 pb-2.5 sm:pb-3 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 sm:p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
              <FileSpreadsheet className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate">
                Import Excel or CSV (.xlsx / .xls / .csv)
              </h3>
              <p className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 truncate">
                Works with any spreadsheet table, bank/e-wallet export, or multi-section budget template
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => downloadSampleExcelTemplate(year, targetPeriod)}
              className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download a clean sample Excel (.xlsx) template"
            >
              <Download className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span className="hidden sm:inline">Sample Template</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1 text-slate-400 hover:text-slate-600 shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto my-3 sm:my-4 space-y-3 sm:space-y-4 pr-1">
          {/* File Upload Box */}
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-emerald-300 dark:border-emerald-800 hover:border-emerald-500 rounded-2xl p-3.5 sm:p-5 bg-emerald-50/40 dark:bg-emerald-950/20 cursor-pointer transition-colors text-center">
            <Upload className="w-5 h-5 sm:w-6 sm:h-6 text-emerald-600 dark:text-emerald-400 mb-1" />
            <span className="font-semibold text-slate-800 dark:text-slate-200 text-xs">
              {fileName ? `Loaded: ${fileName}` : 'Click to upload any Excel (.xlsx, .xls) or CSV (.csv) file'}
            </span>
            <span className="text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Auto-detects columns from any spreadsheet or bank statement &bull; Processed 100% locally in your browser
            </span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {errorMsg && (
            <div className="p-2.5 sm:p-3 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {sheetNames.length > 0 && (
            <>
              {/* Step 1 & 2: Worksheet Tab & Target Period */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3 bg-slate-50 dark:bg-slate-800/60 p-2.5 sm:p-3.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate mb-1">
                    1. Worksheet Tab ({sheetNames.length})
                  </label>
                  <select
                    value={selectedSheet}
                    onChange={(e) => handleSheetChange(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2 sm:px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-semibold text-xs"
                  >
                    {sheetNames.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate mb-1">
                    2. Target Period ({year})
                  </label>
                  <select
                    value={targetPeriod}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                    className="w-full h-8 sm:h-9 px-2 sm:px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-semibold text-xs"
                  >
                    <optgroup label="Monthly (12)">
                      {MONTH_NAMES.map((m) => (
                        <option key={m} value={m}>
                          {m} ({year})
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Bi-Weekly (24)">
                      {BIWEEKLY_PERIODS.map((bw) => (
                        <option key={bw.id} value={bw.id}>
                          {bw.label} ({year})
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>

                <div className="min-w-0">
                  <label className="block text-[10px] sm:text-[11px] font-semibold text-slate-700 dark:text-slate-300 truncate mb-1">
                    3. Format Mode
                  </label>
                  <div className="flex items-center gap-1 h-8 sm:h-9 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-700">
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('universal')}
                      className={`flex-1 h-full rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        parserMode === 'universal'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      Universal Table
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('structured')}
                      className={`flex-1 h-full rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                        parserMode === 'structured'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Multi-section sheet with Income and Monthly Expenses blocks"
                    >
                      Multi-Section
                    </button>
                  </div>
                </div>
              </div>

              {/* Format Detection Banner & Toggle Column Mapper */}
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/60">
                <div className="flex items-center gap-2 text-[11px] text-slate-700 dark:text-slate-300">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>
                    {parserMode === 'structured' ? (
                      <>
                        Using <strong>Multi-Section Budget Layout</strong> (reads Income &amp; Monthly Expenses blocks automatically).
                      </>
                    ) : (
                      <>
                        Using <strong>Universal Table &amp; Column Mapper</strong> — works with any Excel or CSV column layout.
                      </>
                    )}
                  </span>
                </div>
                {parserMode === 'universal' ? (
                  <button
                    type="button"
                    onClick={() => setShowColumnMapper((prev) => !prev)}
                    className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-indigo-600 dark:text-indigo-400 font-semibold text-[11px] flex items-center gap-1 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3 h-3" />
                    <span>{showColumnMapper ? 'Hide Column Mapper' : 'Customize Columns'}</span>
                  </button>
                ) : (
                  !detectedStructured && (
                    <button
                      type="button"
                      onClick={() => handleSwitchMode('universal')}
                      className="px-2.5 py-1 rounded-lg bg-amber-600 text-white font-semibold text-[11px] cursor-pointer"
                    >
                      Switch to Universal Column Mapper
                    </button>
                  )
                )}
              </div>

              {/* Universal Column Mapper Panel */}
              {parserMode === 'universal' && showColumnMapper && mapping && (
                <div className="p-3 sm:p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/70 dark:border-slate-700/70 pb-2">
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 text-xs">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                        <span>Map Your Spreadsheet Columns</span>
                      </h4>
                      <p className="text-[10px] text-slate-500 dark:text-slate-400">
                        Columns were auto-matched from your file. Adjust any dropdown below if your sheet uses different columns.
                      </p>
                    </div>
                    <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mapping.hasHeaderRow}
                        onChange={(e) => handleUpdateMapping({ hasHeaderRow: e.target.checked })}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Row {mapping.headerRowIndex + 1} has column headers</span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
                    {/* Item / Description Column (Required) */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Item / Description Column <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={mapping.itemCol}
                        onChange={(e) => handleUpdateMapping({ itemCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>-- Select Column --</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Actual Cost / Amount Column (Required) */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Actual Amount Column <span className="text-rose-500">*</span>
                      </label>
                      <select
                        value={mapping.actualCol}
                        onChange={(e) => handleUpdateMapping({ actualCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>-- Select Column --</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Category Column */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Category Column (Optional)
                      </label>
                      <select
                        value={mapping.categoryCol}
                        onChange={(e) => handleUpdateMapping({ categoryCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>None (Use Default: {mapping.defaultCategory})</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Entry Type Column */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Entry Type Column (Optional)
                      </label>
                      <select
                        value={mapping.typeCol}
                        onChange={(e) => handleUpdateMapping({ typeCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>None (Use Type Rule Below)</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Estimated / Planned Amount Column */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Estimated / Budget Column (Optional)
                      </label>
                      <select
                        value={mapping.estimatedCol}
                        onChange={(e) => handleUpdateMapping({ estimatedCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>None (₱0 Estimated)</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Payment Method Column */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Payment Method Column (Optional)
                      </label>
                      <select
                        value={mapping.paymentMethodCol}
                        onChange={(e) => handleUpdateMapping({ paymentMethodCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>None (Default: {mapping.defaultPaymentMethod})</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Reference / Notes Column */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Reference / Notes Column (Optional)
                      </label>
                      <select
                        value={mapping.referenceCol}
                        onChange={(e) => handleUpdateMapping({ referenceCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>None</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Date Column */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Date Column (Optional)
                      </label>
                      <select
                        value={mapping.dateCol}
                        onChange={(e) => handleUpdateMapping({ dateCol: parseInt(e.target.value, 10) })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value={-1}>None (Default to {targetPeriod} {year})</option>
                        {columns.map((c) => (
                          <option key={c.index} value={c.index}>
                            Col {c.letter}: {c.headerLabel} {c.sampleValue ? `(e.g. ${c.sampleValue.slice(0, 18)})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Default Entry Type Rule */}
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Entry Type Detection Rule
                      </label>
                      <select
                        value={mapping.defaultEntryType}
                        onChange={(e) =>
                          handleUpdateMapping({ defaultEntryType: e.target.value as DefaultTypeBehavior })
                        }
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px] font-medium"
                      >
                        <option value="auto">Auto-detect (Income / Expense / Funds)</option>
                        <option value="expense">Import All as Expenses</option>
                        <option value="income">Import All as Income</option>
                        <option value="saving">Import All as Funds (Savings)</option>
                      </select>
                    </div>
                  </div>

                  {/* Fallback Defaults Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Fallback Expense Category
                      </label>
                      <select
                        value={mapping.defaultCategory}
                        onChange={(e) => handleUpdateMapping({ defaultCategory: e.target.value })}
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px]"
                      >
                        {EXPENSE_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Fallback Payment Method
                      </label>
                      <select
                        value={mapping.defaultPaymentMethod}
                        onChange={(e) =>
                          handleUpdateMapping({ defaultPaymentMethod: e.target.value as PaymentMethod })
                        }
                        className="w-full h-8 px-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white text-[11px]"
                      >
                        {PAYMENT_METHODS.map((pm) => (
                          <option key={pm} value={pm}>
                            {pm}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex items-end pb-1">
                      <label className="flex items-center gap-1.5 text-[11px] font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={mapping.includePlannedZeroActual}
                          onChange={(e) =>
                            handleUpdateMapping({ includePlannedZeroActual: e.target.checked })
                          }
                          className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                        />
                        <span>Include Pending rows (Actual = 0)</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {sheetNames.length > 0 && parsedEntries.length === 0 && (
            <div className="p-4 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 space-y-2">
              <div className="flex items-center gap-2 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>No matching entries with amounts &gt; 0 found in &quot;{selectedSheet}&quot;</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                {parserMode === 'structured'
                  ? 'This tab does not appear to use the Multi-Section layout. Click "Universal Table" above to map your spreadsheet columns directly.'
                  : 'Try selecting a different Worksheet Tab above, or adjust the "Item / Description Column" and "Actual Amount Column" in the Column Mapper.'}
              </p>
            </div>
          )}

          {parsedEntries.length > 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
                <div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    Ready to Import {parsedEntries.length} Entries from &quot;{selectedSheet}&quot;
                  </span>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Target Period: <strong>{targetPeriod} ({year})</strong> &bull; Totals and blank rows are automatically filtered out.
                  </p>
                </div>
                <div className="text-right font-mono text-[11px] space-y-0.5">
                  {totalActualIncome > 0 && (
                    <div className="text-emerald-600 dark:text-emerald-400 font-bold">
                      Income: {currencySymbol}{totalActualIncome.toLocaleString()}
                    </div>
                  )}
                  {totalActualExpense > 0 && (
                    <div className="text-rose-600 dark:text-rose-400 font-bold">
                      Expenses: {currencySymbol}{totalActualExpense.toLocaleString()}
                    </div>
                  )}
                  {totalActualSaving > 0 && (
                    <div className="text-indigo-600 dark:text-indigo-400 font-bold">
                      Funds: {currencySymbol}{totalActualSaving.toLocaleString()}
                    </div>
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  Replace existing entries in {targetPeriod} ({year}) (uncheck to append to existing entries)
                </span>
              </label>

              <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden max-h-56 overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold sticky top-0">
                    <tr>
                      <th className="py-2 px-3">Type</th>
                      <th className="py-2 px-3">Category</th>
                      <th className="py-2 px-3">Item / Description</th>
                      <th className="py-2 px-3">Payment Method</th>
                      <th className="py-2 px-3 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsedEntries.map((entry, idx) => (
                      <tr key={idx}>
                        <td className="py-1.5 px-3 capitalize font-medium">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                              entry.type === 'income'
                                ? 'bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                : entry.type === 'saving'
                                ? 'bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300'
                                : 'bg-rose-50 dark:bg-rose-950 text-rose-700 dark:text-rose-300'
                            }`}
                          >
                            {entry.type === 'saving' ? 'Funds' : entry.type}
                          </span>
                        </td>
                        <td className="py-1.5 px-3 text-slate-500">{entry.category}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-900 dark:text-white">{entry.item}</td>
                        <td className="py-1.5 px-3 text-slate-500">{entry.paymentMethod}</td>
                        <td className="py-1.5 px-3 text-right font-mono font-bold">
                          {currencySymbol}{(entry.actualCost || entry.amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => downloadSampleExcelTemplate(year, targetPeriod)}
            className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Sample .xlsx Template</span>
          </button>

          <div className="flex items-center gap-2">
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
              <span>Import {parsedEntries.length} Entries into {targetPeriod}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
