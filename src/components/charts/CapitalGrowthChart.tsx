import React, { useState } from 'react';
import { SavingsLedgerData } from '../../types/finance';
import { TrendingUp, Award, ShieldCheck, Sparkles } from 'lucide-react';

interface CapitalGrowthChartProps {
  ledger: SavingsLedgerData;
  currencySymbol?: string;
}

export const CapitalGrowthChart: React.FC<CapitalGrowthChartProps> = ({
  ledger,
  currencySymbol = '$',
}) => {
  const [hoveredPoint, setHoveredPoint] = useState<number | null>(null);

  const transactions = ledger.transactions || [];
  
  // Build time-series points
  const points = transactions.map((tx, idx) => ({
    idx,
    id: tx.id,
    date: tx.date,
    period: tx.period,
    year: tx.year,
    capital: tx.runningTotalCapital || 0,
    amount: tx.amount,
    source: tx.source,
    accountName: tx.accountName,
    note: tx.note,
  }));

  const accountsBalanceSum = (ledger.accounts || []).reduce((sum, a) => sum + (a.balance || 0), 0);
  const totalCapital =
    points.length > 0
      ? points[points.length - 1].capital
      : accountsBalanceSum || ledger.initialCapital || 0;
  const startingCapital = ledger.initialCapital || (points.length > 0 ? points[0].capital : 0);
  const netGrowth = totalCapital - startingCapital;
  const growthPercentage = startingCapital > 0 ? (netGrowth / startingCapital) * 100 : 0;

  const minCapital = Math.min(...points.map((p) => p.capital), startingCapital * 0.9);
  const maxCapital = Math.max(...points.map((p) => p.capital), totalCapital * 1.05, 50000);

  const chartWidth = 720;
  const chartHeight = 220;
  const paddingLeft = 60;
  const paddingRight = 30;
  const paddingTop = 25;
  const paddingBottom = 30;

  const plotWidth = chartWidth - paddingLeft - paddingRight;
  const plotHeight = chartHeight - paddingTop - paddingBottom;

  const getX = (idx: number) => {
    if (points.length <= 1) return paddingLeft + plotWidth / 2;
    return paddingLeft + (idx / (points.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    const range = maxCapital - minCapital;
    if (range <= 0) return paddingTop + plotHeight / 2;
    const ratio = (val - minCapital) / range;
    return chartHeight - paddingBottom - ratio * plotHeight;
  };

  // Generate SVG path for line and area
  const linePoints = points.map((p, i) => `${getX(i)},${getY(p.capital)}`).join(' L ');
  const areaPath =
    points.length > 0
      ? `M ${getX(0)},${chartHeight - paddingBottom} L ${linePoints} L ${getX(
          points.length - 1
        )},${chartHeight - paddingBottom} Z`
      : '';

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  const activePoint = hoveredPoint !== null ? points[hoveredPoint] : null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Cumulative Capital &amp; Savings Growth
            </h3>
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
              <TrendingUp className="w-3 h-3" />
              +{growthPercentage.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Accumulated savings transferred from budget cycles plus asset appreciation
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-xs text-slate-500 dark:text-slate-400">Total Liquid Net Worth</div>
            <div className="text-xl font-bold font-mono text-slate-900 dark:text-white">
              {currencySymbol}{formatNumber(totalCapital)}
            </div>
          </div>
        </div>
      </div>

      {/* SVG Growth Chart */}
      <div className="relative">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          className="w-full h-56 select-none"
        >
          <defs>
            <linearGradient id="capitalGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0" />
            </linearGradient>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
            </filter>
          </defs>

          {/* Grid lines */}
          {[0, 0.33, 0.66, 1].map((pct, i) => {
            const val = minCapital + (maxCapital - minCapital) * pct;
            const y = getY(val);
            return (
              <g key={i}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="currentColor"
                  strokeDasharray="3 3"
                  className="text-slate-100 dark:text-slate-800"
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="text-[10px] fill-slate-400 dark:fill-slate-500 font-mono"
                >
                  {currencySymbol}{formatNumber(val)}
                </text>
              </g>
            );
          })}

          {/* Area fill */}
          {points.length > 0 && (
            <path d={areaPath} fill="url(#capitalGradient)" />
          )}

          {/* Line stroke */}
          {points.length > 0 && (
            <path
              d={`M ${linePoints}`}
              fill="none"
              stroke="#4f46e5"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}

          {/* Milestone markers */}
          {[25000, 50000, 75000, 100000].map((milestone) => {
            if (milestone < minCapital || milestone > maxCapital) return null;
            const y = getY(milestone);
            return (
              <g key={milestone}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={chartWidth - paddingRight}
                  y2={y}
                  stroke="#10b981"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  strokeOpacity="0.4"
                />
                <text
                  x={chartWidth - paddingRight + 5}
                  y={y + 3}
                  className="text-[9px] fill-emerald-600 dark:fill-emerald-400 font-semibold"
                >
                  {currencySymbol}{milestone / 1000}k
                </text>
              </g>
            );
          })}

          {/* Interactive points */}
          {points.map((p, i) => {
            const x = getX(i);
            const y = getY(p.capital);
            const isHovered = hoveredPoint === i;

            return (
              <g
                key={p.id}
                onMouseEnter={() => setHoveredPoint(i)}
                onMouseLeave={() => setHoveredPoint(null)}
                className="cursor-pointer"
              >
                {/* Larger transparent hover target */}
                <circle cx={x} cy={y} r="12" fill="transparent" />

                {/* Point circle */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? 6 : 3.5}
                  className={`transition-all duration-150 ${
                    isHovered
                      ? 'fill-indigo-600 stroke-white dark:stroke-slate-900 stroke-2'
                      : 'fill-indigo-500 hover:fill-indigo-600'
                  }`}
                />

                {/* Date marker along bottom */}
                {(i === 0 || i === Math.floor(points.length / 2) || i === points.length - 1) && (
                  <text
                    x={x}
                    y={chartHeight - 8}
                    textAnchor="middle"
                    className="text-[10px] fill-slate-400 dark:fill-slate-500 font-mono"
                  >
                    {p.date}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Hover Info Tooltip */}
        {activePoint && (
          <div className="mt-3 p-3 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-xl border border-indigo-200/80 dark:border-indigo-800/80 flex flex-wrap items-center justify-between gap-4 text-xs animate-in fade-in duration-150">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-600" />
              <span className="font-semibold text-slate-900 dark:text-white">
                {activePoint.date} ({activePoint.period})
              </span>
              <span className="text-slate-500 dark:text-slate-400 font-mono">
                {activePoint.note}
              </span>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-slate-600 dark:text-slate-300">
                {activePoint.source === 'withdrawal' ? (
                  <span>
                    Withdrawal:{' '}
                    <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                      -{currencySymbol}{formatNumber(activePoint.amount)}
                    </span>
                  </span>
                ) : activePoint.source === 'transfer' ? (
                  <span>
                    Transfer:{' '}
                    <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                      ⇄ {currencySymbol}{formatNumber(activePoint.amount)}
                    </span>
                  </span>
                ) : activePoint.source === 'reallocation' ? (
                  <span>
                    Reallocation:{' '}
                    <span className="font-mono font-bold text-purple-600 dark:text-purple-400">
                      ⇄ {currencySymbol}{formatNumber(activePoint.amount)}
                    </span>
                  </span>
                ) : (
                  <span>
                    Addition:{' '}
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      +{currencySymbol}{formatNumber(activePoint.amount)}
                    </span>
                  </span>
                )}
              </div>
              <div className="text-slate-600 dark:text-slate-300">
                {activePoint.source === 'withdrawal' ? 'From: ' : 'Account: '}
                <span className="font-medium text-slate-800 dark:text-slate-200">{activePoint.accountName}</span>
              </div>
              <div className="bg-white dark:bg-slate-900 px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 font-mono font-bold">
                Total Capital: {currencySymbol}{formatNumber(activePoint.capital)}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
