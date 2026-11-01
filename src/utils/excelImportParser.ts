import * as XLSX from 'xlsx';
import { BudgetEntry, EntryType, PaymentMethod } from '../types/finance';
import {
  MONTH_NAMES,
  BIWEEKLY_PERIODS,
  normalizeCategoryWording,
  normalizeSavingCategoryGroup,
  resolveCanonicalSinkingFundName,
} from '../services/sampleData';

export type ImportParserMode = 'structured' | 'universal';

export type DefaultTypeBehavior = 'auto' | 'expense' | 'income' | 'saving';

export interface UniversalColumnMapping {
  headerRowIndex: number;
  hasHeaderRow: boolean;
  itemCol: number;
  actualCol: number;
  creditIncomeCol: number; // -1 if none (used for bank statements with Debit + Credit columns)
  categoryCol: number; // -1 if none
  typeCol: number; // -1 if none
  estimatedCol: number; // -1 if none
  paymentMethodCol: number; // -1 if none
  referenceCol: number; // -1 if none
  dateCol: number; // -1 if none
  defaultEntryType: DefaultTypeBehavior;
  defaultCategory: string;
  defaultPaymentMethod: PaymentMethod;
  includePlannedZeroActual: boolean;
}

export interface DetectedColumnOption {
  index: number;
  letter: string;
  headerLabel: string;
  sampleValue: string;
}

export interface SheetParseResult {
  detectedMode: ImportParserMode;
  entries: Omit<BudgetEntry, 'id' | 'createdAt'>[];
  discoveredExpenseCategories: string[];
  columns: DetectedColumnOption[];
  suggestedMapping: UniversalColumnMapping;
}

export const parseCurrencyNumber = (val: unknown): number => {
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  if (typeof val !== 'string') return 0;
  const trimmed = val.trim();
  if (!trimmed || trimmed === '-' || trimmed === '—') return 0;
  const isNegative =
    (trimmed.startsWith('(') && trimmed.endsWith(')')) ||
    /^-|^[^\d-]*-\s*\d/.test(trimmed);
  const cleaned = trimmed.replace(/[^0-9.]/g, '');
  const num = parseFloat(cleaned);
  if (isNaN(num)) return 0;
  return isNegative ? -num : num;
};

export const getExcelColumnLetter = (colIdx: number): string => {
  let temp = colIdx;
  let letter = '';
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
};

export const resolvePaymentMethodFromText = (
  raw: string,
  fallback: PaymentMethod = 'Bank Transfer'
): PaymentMethod => {
  const lower = (raw || '').trim().toLowerCase();
  if (!lower) return fallback;
  if (lower.includes('cash') && !lower.includes('gcash')) return 'Cash';
  if (lower.includes('gcash') || lower.includes('maya') || lower.includes('e-wallet') || lower.includes('ewallet')) {
    return 'GCash Transfer';
  }
  if (lower.includes('credit') || lower.includes('card') || lower.includes('visa') || lower.includes('mastercard')) {
    return 'Credit Card';
  }
  if (lower.includes('kath')) return 'Kath Account';
  if (lower.includes('check') || lower.includes('cheque')) return 'Checking Account';
  if (
    lower.includes('bank') ||
    lower.includes('transfer') ||
    lower.includes('instapay') ||
    lower.includes('pesonet') ||
    lower.includes('bpi') ||
    lower.includes('bdo') ||
    lower.includes('unionbank')
  ) {
    return 'Bank Transfer';
  }
  if (lower.includes('other')) return 'Other';
  return fallback;
};

export const normalizeSpreadsheetDate = (
  rawVal: unknown,
  fallbackDateStr: string,
  targetYear: number
): string => {
  if (rawVal === null || rawVal === undefined || rawVal === '') return fallbackDateStr;

  // Handle Excel serial date numbers (e.g. 46000)
  if (typeof rawVal === 'number' && rawVal > 25000 && rawVal < 80000) {
    const utcDays = Math.floor(rawVal - 25569);
    const d = new Date(utcDays * 86400 * 1000);
    if (!isNaN(d.getTime())) {
      const yyyy = d.getUTCFullYear();
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      return `${yyyy}-${mm}-${dd}`;
    }
  }

  const str = String(rawVal).trim();
  if (!str) return fallbackDateStr;

  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }

  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear() > 1990 ? parsed.getFullYear() : targetYear;
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return fallbackDateStr;
};

/**
 * Checks if a 2D array of rows matches the multi-section structured budget format
 * (with "Income" and/or "Monthly Expenses" / "Category | Item" section blocks in Col A/B or Col B/C).
 */
export const isStructuredBudgetSheet = (rows: unknown[][]): { isStructured: boolean; colOffset: number } => {
  let hasIncomeHeader = false;
  let hasExpenseHeader = false;
  let detectedOffset = 1; // Default Col B = 1, Col C = 2

  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    for (const offset of [1, 0]) {
      const c1 = String(row[offset] ?? '').trim().toLowerCase();
      const c2 = String(row[offset + 1] ?? '').trim().toLowerCase();
      const c3 = String(row[offset + 2] ?? '').trim().toLowerCase();
      const c4 = String(row[offset + 3] ?? '').trim().toLowerCase();

      if (c2 === 'income' && !c1) {
        hasIncomeHeader = true;
        detectedOffset = offset;
      }
      if (
        c2.includes('monthly expenses') ||
        (c1 === 'category' && c2 === 'item' && (c3.includes('estimated') || c4.includes('actual')))
      ) {
        hasExpenseHeader = true;
        detectedOffset = offset;
      }
    }
  }

  // Require at least the structured expense header + income header, or explicit "Monthly Expenses" section
  return {
    isStructured: hasExpenseHeader && (hasIncomeHeader || rows.some((r) => Array.isArray(r) && String(r[detectedOffset + 1] ?? '').toLowerCase().includes('monthly expenses'))),
    colOffset: detectedOffset,
  };
};

export const resolvePeriodIndexAndDefaultDate = (
  year: number,
  period: string
): { periodIndex: number; defaultDateStr: string } => {
  const monthIdx = MONTH_NAMES.indexOf(period);
  if (monthIdx >= 0) {
    return {
      periodIndex: monthIdx,
      defaultDateStr: `${year}-${String(monthIdx + 1).padStart(2, '0')}-01`,
    };
  }
  const bwIdx = BIWEEKLY_PERIODS.findIndex((p) => p.id === period);
  if (bwIdx >= 0) {
    const bwMonthIdx = Math.floor(bwIdx / 2);
    const dayStr = bwIdx % 2 === 0 ? '01' : '16';
    return {
      periodIndex: bwIdx,
      defaultDateStr: `${year}-${String(bwMonthIdx + 1).padStart(2, '0')}-${dayStr}`,
    };
  }
  return {
    periodIndex: 0,
    defaultDateStr: `${year}-01-01`,
  };
};

/**
 * Parses the classic multi-section structured layout (compatible with Home_Buget_2026.xlsx and structured templates)
 */
export const parseStructuredRowsToEntries = (
  rows: unknown[][],
  year: number,
  period: string,
  colOffset: number = 1
): { entries: Omit<BudgetEntry, 'id' | 'createdAt'>[]; discoveredExpenseCategories: string[] } => {
  const { periodIndex, defaultDateStr: dateStr } = resolvePeriodIndexAndDefaultDate(year, period);

  const entries: Omit<BudgetEntry, 'id' | 'createdAt'>[] = [];
  const newCategories = new Set<string>();
  let section: 'none' | 'income' | 'expense' = 'none';

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const colCat = String(row[colOffset] ?? '').trim();
    const colItem = String(row[colOffset + 1] ?? '').trim();
    const colCatAndItem = `${colCat} ${colItem}`.toLowerCase();

    if (colItem.toLowerCase() === 'income' && !colCat) {
      section = 'income';
      continue;
    }
    if (
      colItem.toLowerCase().includes('monthly expenses') ||
      (colCat.toLowerCase() === 'category' && colItem.toLowerCase() === 'item')
    ) {
      section = 'expense';
      continue;
    }
    if (
      colItem.toLowerCase().includes('expenses total summary') ||
      colItem.toLowerCase().includes('total expense') ||
      colItem.toLowerCase().includes('total to be withdraw')
    ) {
      if (section === 'expense') {
        break;
      }
    }

    if (section === 'income') {
      if (
        !colItem ||
        colItem.toLowerCase() === 'estimated' ||
        colItem.toLowerCase().includes('total income')
      ) {
        continue;
      }
      const estimatedVal = parseCurrencyNumber(row[colOffset + 2]);
      const actualVal = parseCurrencyNumber(row[colOffset + 3]);
      if (actualVal > 0) {
        entries.push({
          year,
          period,
          periodIndex,
          date: dateStr,
          type: 'income',
          category: 'Salary & Wages',
          item: colItem,
          estimatedCost: estimatedVal > 0 ? estimatedVal : 0,
          actualCost: actualVal,
          amount: actualVal,
          paymentMethod: 'Bank Transfer',
          difference: actualVal - (estimatedVal > 0 ? estimatedVal : 0),
          status: 'Paid',
          reference: '',
          description: colItem,
        });
      }
    } else if (section === 'expense') {
      if (
        (!colCat && !colItem) ||
        colCat.toLowerCase() === 'category' ||
        colCatAndItem.includes('estimated cost')
      ) {
        continue;
      }

      const estimatedColD = parseCurrencyNumber(row[colOffset + 2]);
      const actualColE = parseCurrencyNumber(row[colOffset + 3]);
      if (actualColE <= 0) {
        continue;
      }

      const cash = parseCurrencyNumber(row[colOffset + 5]);
      const creditCard = parseCurrencyNumber(row[colOffset + 6]);
      const gcashTransfer = parseCurrencyNumber(row[colOffset + 7]);
      const kathAccount = parseCurrencyNumber(row[colOffset + 8]);
      const checkAccount = parseCurrencyNumber(row[colOffset + 9]);
      const bankTransfer = parseCurrencyNumber(row[colOffset + 10]);
      const refText = String(row[colOffset + 13] ?? '').trim();

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
      const categoryName = normalizeCategoryWording(colCat || 'Miscellaneous');
      const itemName = colItem || categoryName;
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
        estimatedCost: estimatedColD > 0 ? estimatedColD : 0,
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
        difference: (estimatedColD > 0 ? estimatedColD : 0) - actualColE,
        status: 'Paid',
        reference: refText,
        toBeWithdrawn: primaryMethod === 'Cash' || cash > 0,
        description: itemName,
      });
    }
  }

  return {
    entries,
    discoveredExpenseCategories: Array.from(newCategories),
  };
};

/**
 * Automatically detects the best header row and column mapping for any arbitrary Excel / CSV table.
 */
export const detectUniversalColumnMapping = (
  rows: unknown[][]
): { columns: DetectedColumnOption[]; mapping: UniversalColumnMapping } => {
  const headerKeywords = [
    'item',
    'description',
    'particulars',
    'name',
    'merchant',
    'payee',
    'details',
    'memo',
    'category',
    'group',
    'type',
    'amount',
    'actual',
    'cost',
    'paid',
    'total',
    'value',
    'price',
    'debit',
    'credit',
    'withdrawal',
    'deposit',
    'estimated',
    'budget',
    'planned',
    'payment',
    'method',
    'mode',
    'account',
    'reference',
    'ref',
    'note',
    'notes',
    'remarks',
    'date',
  ];

  let bestRowIdx = 0;
  let bestScore = -1;
  let maxCols = 0;

  for (let r = 0; r < Math.min(rows.length, 30); r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;
    maxCols = Math.max(maxCols, row.length);

    let score = 0;
    let nonEmptyCount = 0;
    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] ?? '').trim().toLowerCase();
      if (!cellStr) continue;
      nonEmptyCount++;
      if (headerKeywords.some((kw) => cellStr === kw || cellStr.includes(kw))) {
        score += 3;
      } else if (isNaN(Number(cellStr.replace(/[^0-9.-]/g, '')))) {
        score += 1;
      }
    }

    if (nonEmptyCount >= 2 && score > bestScore) {
      bestScore = score;
      bestRowIdx = r;
    }
  }

  // Ensure maxCols covers data rows too
  for (let r = 0; r < Math.min(rows.length, 50); r++) {
    if (Array.isArray(rows[r])) {
      maxCols = Math.max(maxCols, rows[r].length);
    }
  }

  const headerRow = Array.isArray(rows[bestRowIdx]) ? rows[bestRowIdx] : [];
  const hasHeaderRow = bestScore >= 3;

  // Build column descriptors with sample values from the first non-empty data row below header
  const columns: DetectedColumnOption[] = [];
  for (let c = 0; c < maxCols; c++) {
    const rawHeader = hasHeaderRow ? String(headerRow[c] ?? '').trim() : '';
    let sampleVal = '';
    const startSearchRow = hasHeaderRow ? bestRowIdx + 1 : bestRowIdx;
    for (let r = startSearchRow; r < Math.min(rows.length, startSearchRow + 15); r++) {
      const val = Array.isArray(rows[r]) ? String(rows[r][c] ?? '').trim() : '';
      if (val) {
        sampleVal = val;
        break;
      }
    }
    // Only include columns that have either a header or a sample value
    if (rawHeader || sampleVal) {
      const letter = getExcelColumnLetter(c);
      columns.push({
        index: c,
        letter,
        headerLabel: rawHeader || `Column ${letter}`,
        sampleValue: sampleVal,
      });
    }
  }

  let itemCol = -1;
  let actualCol = -1;
  let creditIncomeCol = -1;
  let categoryCol = -1;
  let typeCol = -1;
  let estimatedCol = -1;
  let paymentMethodCol = -1;
  let referenceCol = -1;
  let dateCol = -1;

  // Match columns by header name
  columns.forEach((col) => {
    const h = col.headerLabel.toLowerCase();

    if (
      typeCol === -1 &&
      (h === 'type' || h === 'entry type' || h === 'transaction type' || h === 'flow' || h === 'kind')
    ) {
      typeCol = col.index;
      return;
    }
    if (
      categoryCol === -1 &&
      (h.includes('category') || h === 'group' || h === 'classification' || h === 'folder')
    ) {
      categoryCol = col.index;
      return;
    }
    if (
      itemCol === -1 &&
      (h.includes('item') ||
        h.includes('description') ||
        h.includes('particular') ||
        h.includes('merchant') ||
        h.includes('payee') ||
        h === 'name' ||
        h === 'expense' ||
        h === 'details' ||
        h === 'narration' ||
        h === 'title')
    ) {
      itemCol = col.index;
      return;
    }
    if (
      estimatedCol === -1 &&
      (h.includes('estimat') || h.includes('budget') || h.includes('planned') || h.includes('target'))
    ) {
      estimatedCol = col.index;
      return;
    }
    if (
      actualCol === -1 &&
      (h.includes('actual') ||
        h === 'amount' ||
        h.includes('amount (') ||
        h === 'cost' ||
        h === 'paid' ||
        h === 'value' ||
        h === 'price' ||
        h === 'debit' ||
        h === 'withdrawal' ||
        h === 'outflow')
    ) {
      actualCol = col.index;
      return;
    }
    if (
      creditIncomeCol === -1 &&
      col.index !== actualCol &&
      (h === 'credit' || h === 'deposit' || h === 'inflow' || h.includes('credit amount'))
    ) {
      creditIncomeCol = col.index;
      return;
    }
    if (
      paymentMethodCol === -1 &&
      (h.includes('payment') || h.includes('method') || h === 'mode' || h === 'channel' || h === 'account')
    ) {
      paymentMethodCol = col.index;
      return;
    }
    if (
      referenceCol === -1 &&
      (h.includes('ref') || h.includes('note') || h.includes('remark') || h.includes('memo') || h.includes('receipt'))
    ) {
      referenceCol = col.index;
      return;
    }
    if (dateCol === -1 && (h === 'date' || h.includes('transaction date') || h.includes('posting date'))) {
      dateCol = col.index;
      return;
    }
  });

  // Fallback heuristics if headers weren't standard keywords (e.g. headerless table or custom column names)
  if (itemCol === -1 || actualCol === -1) {
    for (const col of columns) {
      if (col.index === dateCol || col.index === typeCol || col.index === categoryCol) continue;
      const numVal = parseCurrencyNumber(col.sampleValue);
      const looksNumeric = numVal !== 0 && /^[$₱€£¥\s()-]*[\d,]+(\.\d+)?[)\s]*$/.test(col.sampleValue.trim());
      if (looksNumeric && actualCol === -1 && col.index !== estimatedCol) {
        actualCol = col.index;
      } else if (!looksNumeric && itemCol === -1) {
        itemCol = col.index;
      }
    }
  }

  // Final safety fallbacks so selects always have a valid index if columns exist
  if (itemCol === -1 && columns.length > 0) {
    itemCol = columns[0].index;
  }
  if (actualCol === -1 && columns.length > 1) {
    actualCol = columns.find((c) => c.index !== itemCol)?.index ?? columns[0].index;
  } else if (actualCol === -1 && columns.length === 1) {
    actualCol = columns[0].index;
  }

  return {
    columns,
    mapping: {
      headerRowIndex: bestRowIdx,
      hasHeaderRow,
      itemCol,
      actualCol,
      creditIncomeCol,
      categoryCol,
      typeCol,
      estimatedCol,
      paymentMethodCol,
      referenceCol,
      dateCol,
      defaultEntryType: 'auto',
      defaultCategory: 'Miscellaneous',
      defaultPaymentMethod: 'Bank Transfer',
      includePlannedZeroActual: false,
    },
  };
};

/**
 * Parses any Excel/CSV sheet using the provided UniversalColumnMapping.
 */
export const parseUniversalRowsToEntries = (
  rows: unknown[][],
  mapping: UniversalColumnMapping,
  year: number,
  period: string
): { entries: Omit<BudgetEntry, 'id' | 'createdAt'>[]; discoveredExpenseCategories: string[] } => {
  const { periodIndex, defaultDateStr } = resolvePeriodIndexAndDefaultDate(year, period);

  const entries: Omit<BudgetEntry, 'id' | 'createdAt'>[] = [];
  const newCategories = new Set<string>();

  const startRow = mapping.hasHeaderRow ? mapping.headerRowIndex + 1 : mapping.headerRowIndex;

  for (let r = startRow; r < rows.length; r++) {
    const row = rows[r];
    if (!Array.isArray(row)) continue;

    const rawItem = mapping.itemCol >= 0 ? String(row[mapping.itemCol] ?? '').trim() : '';
    const rawCat = mapping.categoryCol >= 0 ? String(row[mapping.categoryCol] ?? '').trim() : '';
    const rawType = mapping.typeCol >= 0 ? String(row[mapping.typeCol] ?? '').trim().toLowerCase() : '';

    // Skip empty rows or repeated header rows
    if (!rawItem && !rawCat) continue;
    const itemLower = rawItem.toLowerCase();
    const catLower = rawCat.toLowerCase();
    if (
      itemLower === 'item' ||
      itemLower === 'description' ||
      itemLower === 'particulars' ||
      (catLower === 'category' && (itemLower === 'item' || itemLower === 'description'))
    ) {
      continue;
    }

    // Skip summary/total rows
    if (
      itemLower === 'total' ||
      itemLower.startsWith('total ') ||
      itemLower.endsWith(' total') ||
      itemLower.includes('subtotal') ||
      itemLower.includes('grand total') ||
      itemLower.includes('expenses total summary') ||
      catLower === 'total' ||
      catLower.startsWith('total ')
    ) {
      continue;
    }

    const rawActualVal = mapping.actualCol >= 0 ? parseCurrencyNumber(row[mapping.actualCol]) : 0;
    const rawCreditVal =
      mapping.creditIncomeCol >= 0 ? parseCurrencyNumber(row[mapping.creditIncomeCol]) : 0;
    const rawEstimatedVal =
      mapping.estimatedCol >= 0 ? Math.abs(parseCurrencyNumber(row[mapping.estimatedCol])) : 0;

    let effectiveActual = Math.abs(rawActualVal);
    if (effectiveActual === 0 && rawCreditVal !== 0) {
      effectiveActual = Math.abs(rawCreditVal);
    }

    if (effectiveActual <= 0 && (!mapping.includePlannedZeroActual || rawEstimatedVal <= 0)) {
      continue;
    }

    // Determine EntryType ('income' | 'expense' | 'saving')
    let resolvedType: EntryType = 'expense';

    if (mapping.defaultEntryType !== 'auto') {
      resolvedType = mapping.defaultEntryType;
    } else if (rawType) {
      if (
        rawType.includes('inc') ||
        rawType.includes('sal') ||
        rawType.includes('credit') ||
        rawType.includes('dep') ||
        rawType.includes('inflow')
      ) {
        resolvedType = 'income';
      } else if (
        rawType.includes('sav') ||
        rawType.includes('fund') ||
        rawType.includes('sink') ||
        rawType.includes('invest')
      ) {
        resolvedType = 'saving';
      } else {
        resolvedType = 'expense';
      }
    } else if (rawCreditVal > 0 && rawActualVal === 0) {
      resolvedType = 'income';
    } else if (
      catLower === 'savings' ||
      catLower.includes('sinking fund') ||
      catLower.includes('emergency fund') ||
      itemLower === 'savings'
    ) {
      resolvedType = 'saving';
    } else if (
      catLower === 'income' ||
      catLower.includes('salary') ||
      catLower.includes('wages') ||
      catLower.includes('payroll')
    ) {
      resolvedType = 'income';
    } else if (rawActualVal < 0) {
      resolvedType = 'expense';
    }

    const fallbackCategory =
      resolvedType === 'income'
        ? 'Salary & Wages'
        : resolvedType === 'saving'
        ? 'Savings & Emergency'
        : mapping.defaultCategory || 'Miscellaneous';

    const rawCategoryToUse = rawCat || fallbackCategory;
    const itemName = rawItem || rawCategoryToUse;

    const finalCategory =
      resolvedType === 'saving'
        ? normalizeSavingCategoryGroup(itemName, rawCategoryToUse)
        : resolvedType === 'income'
        ? rawCat || 'Salary & Wages'
        : normalizeCategoryWording(rawCategoryToUse);

    const finalItem =
      resolvedType === 'saving'
        ? resolveCanonicalSinkingFundName(itemName, rawCategoryToUse)
        : itemName;

    if (resolvedType === 'expense' && finalCategory) {
      newCategories.add(finalCategory);
    }

    const rawPaymentStr =
      mapping.paymentMethodCol >= 0 ? String(row[mapping.paymentMethodCol] ?? '').trim() : '';
    const paymentMethod = resolvePaymentMethodFromText(rawPaymentStr, mapping.defaultPaymentMethod);

    const refText = mapping.referenceCol >= 0 ? String(row[mapping.referenceCol] ?? '').trim() : '';
    const dateStr =
      mapping.dateCol >= 0
        ? normalizeSpreadsheetDate(row[mapping.dateCol], defaultDateStr, year)
        : defaultDateStr;

    const isPaid = effectiveActual > 0;
    const entryAmount = isPaid ? effectiveActual : rawEstimatedVal;

    entries.push({
      year,
      period,
      periodIndex,
      date: dateStr,
      type: resolvedType,
      category: finalCategory,
      item: finalItem,
      estimatedCost: rawEstimatedVal,
      actualCost: isPaid ? effectiveActual : 0,
      amount: entryAmount,
      paymentMethod,
      difference:
        resolvedType === 'income'
          ? effectiveActual - rawEstimatedVal
          : rawEstimatedVal - effectiveActual,
      status: isPaid ? 'Paid' : 'Pending',
      reference: refText,
      toBeWithdrawn: paymentMethod === 'Cash',
      description: finalItem,
    });
  }

  return {
    entries,
    discoveredExpenseCategories: Array.from(newCategories),
  };
};

/**
 * Master entry point to analyze a worksheet and return detected mode, columns, mapping, and parsed entries.
 */
export const analyzeAndParseWorksheet = (
  rows: unknown[][],
  year: number,
  period: string
): SheetParseResult => {
  const { columns, mapping } = detectUniversalColumnMapping(rows);
  const structuredCheck = isStructuredBudgetSheet(rows);

  if (structuredCheck.isStructured) {
    const { entries, discoveredExpenseCategories } = parseStructuredRowsToEntries(
      rows,
      year,
      period,
      structuredCheck.colOffset
    );
    return {
      detectedMode: 'structured',
      entries,
      discoveredExpenseCategories,
      columns,
      suggestedMapping: mapping,
    };
  }

  const { entries, discoveredExpenseCategories } = parseUniversalRowsToEntries(
    rows,
    mapping,
    year,
    period
  );

  return {
    detectedMode: 'universal',
    entries,
    discoveredExpenseCategories,
    columns,
    suggestedMapping: mapping,
  };
};

/**
 * Generates and downloads a clean sample Excel (.xlsx) workbook with both a Simple Universal Table tab
 * and a Multi-Section Budget Layout tab so any user can easily get started.
 */
export const downloadSampleExcelTemplate = (year: number = 2026, period: string = 'Oct'): void => {
  const wb = XLSX.utils.book_new();

  // Sheet 1: Clean Universal Table Format (Starts in Column A)
  const simpleTableRows = [
    [
      'Type',
      'Category',
      'Item / Description',
      'Estimated Cost',
      'Actual Cost',
      'Payment Method',
      'Date',
      'Reference / Notes',
    ],
    ['Income', 'Salary & Wages', 'Monthly Base Salary', 45000, 45000, 'Bank Transfer', `${year}-10-01`, 'Payroll credit'],
    ['Expense', 'Utilities', 'Meralco Electricity', 3500, 3420, 'GCash Transfer', `${year}-10-05`, 'Bill settled'],
    ['Expense', 'Utilities', 'Home Fiber Internet', 1699, 1699, 'Credit Card', `${year}-10-08`, 'Auto-charge'],
    ['Expense', 'Budget', 'Weekly Groceries & Market', 8000, 7650, 'Cash', `${year}-10-12`, 'Supermarket'],
    ['Savings', 'Savings & Emergency', 'Emergency Fund', 5000, 5000, 'Bank Transfer', `${year}-10-15`, 'Transferred to HYSA'],
  ];
  const wsSimple = XLSX.utils.aoa_to_sheet(simpleTableRows);
  XLSX.utils.book_append_sheet(wb, wsSimple, `${period}_Simple_Table`);

  // Sheet 2: Structured Multi-Section Budget Format
  const structuredRows = [
    ['', '', `${period} ${year} Budget Sheet`],
    [],
    ['', '', 'Income', 'Estimated', 'Actual'],
    ['', '', 'Salary 15th & 30th', 45000, 45000],
    ['', '', 'Total Income', 45000, 45000],
    [],
    [
      '',
      'Category',
      'Item',
      'Estimated Cost',
      'Actual Cost',
      'Stay in ATM',
      'Cash',
      'Credit Card',
      'GCash Transfer',
      'Kath Account',
      'Check Account',
      'Bank Transfer',
      'Difference',
      'Status',
      'Reference',
    ],
    ['', 'Utilities', 'Electricity Bill', 3500, 3420, 0, 0, 0, 3420, 0, 0, 0, 80, 'Paid', 'Meralco'],
    ['', 'Budget', 'Groceries & Allowance', 8000, 7650, 0, 7650, 0, 0, 0, 0, 0, 350, 'Paid', 'Cash withdrawal'],
    ['', 'Savings', 'Emergency Fund', 5000, 5000, 0, 0, 0, 0, 0, 0, 5000, 0, 'Paid', 'Monthly reserve'],
    ['', '', 'Expenses Total Summary', 16500, 16070],
  ];
  const wsStructured = XLSX.utils.aoa_to_sheet(structuredRows);
  XLSX.utils.book_append_sheet(wb, wsStructured, `${period}_Multi_Section`);

  XLSX.writeFile(wb, `CapitalFlow_Import_Template_${year}.xlsx`);
};
