import React, { useState } from 'react';
import { MONTH_NAMES, BIWEEKLY_PERIODS } from '../../services/sampleData';
import { BudgetEntry, EntryFrequency } from '../../types/finance';

interface CashflowChartProps {
  entries: BudgetEntry[];
  frequency: EntryFrequency;
  currencySymbol?: string;
}

export const CashflowChart: React.FC<CashflowChartProps> = ({
  entries,
  frequency,
  currencySymbol = '$',
}) => {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [visibleSeries, setVisibleSeries] = useState({
    income: true,
    expense: true,
    saving: true,
  });

  const periodLabels =
    frequency === 'monthly'
      ? MONTH_NAMES
      : BIWEEKLY_PERIODS.map((p) => p.id);

  // Aggregate by period index
  const aggregatedData = periodLabels.map((label, idx) => {
    let income = 0;
    let expense = 0;
    let saving = 0;

    entries.forEach((entry) => {
      if (entry.period === label) {
        const amt = entry.actualCost ?? entry.amount ?? 0;
        if (entry.type === 'income') income += amt;
        if (entry.type === 'expense') expense += amt;
        if (entry.type === 'saving') saving += amt;
      }
    });

    const net = income - expense;
    const savingsRate = income > 0 ? (saving / income) * 100 : 0;

    return {
      label,
      idx,
      income,
      expense,
      saving,
      net,
      savingsRate,
    };
  });

  // Calculate chart max for scaling
  const maxVal = Math.max(
    ...aggregatedData.flatMap((d) => [d.income, d.expense, d.saving]),
    5000
  );

  const chartHeight = 240;
  const paddingBottom = 30;
  const paddingTop = 20;
  const usableHeight = chartHeight - paddingTop - paddingBottom;

  const getY = (val: number) => {
    const ratio = Math.min(1, Math.max(0, val / (maxVal * 1.15)));
    return chartHeight - paddingBottom - ratio * usableHeight;
  };

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  const hoveredData = hoveredIdx !== null ? aggregatedData[hoveredIdx] : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <span>Budget Performance &amp; Cash Flow</span>
            <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {frequency === 'monthly' ? '12 Months' : '26 Pay Periods'}
            </span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Compare monthly inflows against lifestyle expenses and retained capital
          </p>
        </div>

        {/* Legend toggles */}
        <div className="flex items-center gap-3 text-xs">
          <button
            onClick={() => setVisibleSeries((s) => ({ ...s, income: !s.income }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
              visibleSeries.income
                ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            Income
          </button>
          <button
            onClick={() => setVisibleSeries((s) => ({ ...s, expense: !s.expense }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
              visibleSeries.expense
                ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            Expenses
          </button>
          <button
            onClick={() => setVisibleSeries((s) => ({ ...s, saving: !s.saving }))}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border transition-all ${
              visibleSeries.saving
                ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-400 line-through'
            }`}
          >
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500" />
            Savings
          </button>
        </div>
      </div>

      {/* SVG Chart */}
      <div className="relative">
        <div className="overflow-x-auto pb-2 scrollbar-thin">
          <div style={{ minWidth: frequency === 'bi-weekly' ? '1060px' : '580px' }}>
            <svg
              viewBox={`0 0 ${frequency === 'bi-weekly' ? 1080 : 640} ${chartHeight}`}
              className="w-full h-56 select-none"
            >
              {/* Background horizontal grid lines */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const val = maxVal * pct;
                const y = getY(val);
                return (
                  <g key={i}>
                    <line
                      x1="52"
                      y1={y}
                      x2={frequency === 'bi-weekly' ? 1070 : 630}
                      y2={y}
                      stroke="currentColor"
                      strokeDasharray="3 3"
                      className="text-slate-100 dark:text-slate-800/80"
                    />
                    <text
                      x="48"
                      y={y + 3}
                      textAnchor="end"
                      className="text-[10px] fill-slate-400 dark:fill-slate-500 font-mono"
                    >
                      {currencySymbol}{formatNumber(val)}
                    </text>
                  </g>
                );
              })}

              {/* Data Bars */}
              {aggregatedData.map((d, i) => {
                const count = aggregatedData.length;
                const chartWidth = (frequency === 'bi-weekly' ? 1070 : 630) - 55;
                const slotWidth = chartWidth / count;
                const groupX = 55 + i * slotWidth;
                const barWidth = Math.max(3, Math.min(14, slotWidth / 4));
                const isHovered = hoveredIdx === i;

                const incHeight = (chartHeight - paddingBottom) - getY(d.income);
                const expHeight = (chartHeight - paddingBottom) - getY(d.expense);
                const savHeight = (chartHeight - paddingBottom) - getY(d.saving);

                return (
                  <g
                    key={d.label}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    className="cursor-pointer"
                  >
                    {/* Hover column background highlight */}
                    {isHovered && (
                      <rect
                        x={groupX - 2}
                        y={paddingTop}
                        width={slotWidth + 4}
                        height={usableHeight}
                        rx="4"
                        className="fill-indigo-50/70 dark:fill-indigo-950/30 transition-all"
                      />
                    )}

                    {/* Income Bar */}
                    {visibleSeries.income && (
                      <rect
                        x={groupX + 2}
                        y={getY(d.income)}
                        width={barWidth}
                        height={Math.max(2, incHeight)}
                        rx="3"
                        className="fill-emerald-500 dark:fill-emerald-400 transition-all hover:brightness-110"
                      />
                    )}

                    {/* Expense Bar */}
                    {visibleSeries.expense && (
                      <rect
                        x={groupX + 2 + barWidth + 2}
                        y={getY(d.expense)}
                        width={barWidth}
                        height={Math.max(2, expHeight)}
                        rx="3"
                        className="fill-rose-500 dark:fill-rose-400 transition-all hover:brightness-110"
                      />
                    )}

                    {/* Saving Bar */}
                    {visibleSeries.saving && (
                      <rect
                        x={groupX + 2 + (barWidth + 2) * 2}
                        y={getY(d.saving)}
                        width={barWidth}
                        height={Math.max(2, savHeight)}
                        rx="3"
                        className="fill-indigo-500 dark:fill-indigo-400 transition-all hover:brightness-110"
                      />
                    )}

                    {/* X-axis label */}
                    <text
                      x={groupX + slotWidth / 2}
                      y={chartHeight - 10}
                      textAnchor="middle"
                      className={`${frequency === 'bi-weekly' ? 'text-[9px]' : 'text-[10px]'} font-medium transition-colors ${
                        isHovered
                          ? 'fill-indigo-600 dark:fill-indigo-400 font-bold'
                          : 'fill-slate-500 dark:fill-slate-400'
                      }`}
                    >
                      {d.label}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Interactive Detail Box on Hover */}
        {hoveredData && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700/80 flex flex-wrap items-center justify-between gap-4 text-xs animate-in fade-in duration-150">
            <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              Period: {hoveredData.label}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                <span>Income:</span>
                <span className="font-mono font-bold">
                  {currencySymbol}{formatNumber(hoveredData.income)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                <span>Expenses:</span>
                <span className="font-mono font-bold">
                  {currencySymbol}{formatNumber(hoveredData.expense)}
                </span>
              </div>
              <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium">
                <span>Savings:</span>
                <span className="font-mono font-bold">
                  {currencySymbol}{formatNumber(hoveredData.saving)}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-900 px-2 py-0.5 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-medium">
                Rate: <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{hoveredData.savingsRate.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
