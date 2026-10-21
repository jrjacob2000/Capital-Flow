import React, { useState } from 'react';
import { BudgetEntry, EntryType } from '../../types/finance';

interface CategoryDonutChartProps {
  entries: BudgetEntry[];
  type?: EntryType;
  currencySymbol?: string;
}

const CATEGORY_COLORS = [
  '#6366f1', // indigo-500
  '#14b8a6', // teal-500
  '#f59e0b', // amber-500
  '#ec4899', // pink-500
  '#8b5cf6', // violet-500
  '#f97316', // orange-500
  '#06b6d4', // cyan-500
  '#10b981', // emerald-500
  '#64748b', // slate-500
];

export const CategoryDonutChart: React.FC<CategoryDonutChartProps> = ({
  entries,
  type = 'expense',
  currencySymbol = '$',
}) => {
  const [hoveredCategory, setHoveredCategory] = useState<string | null>(null);

  const filteredEntries = entries.filter((e) => e.type === type);
  const categoryTotals: { [key: string]: number } = {};

  filteredEntries.forEach((e) => {
    categoryTotals[e.category] = (categoryTotals[e.category] || 0) + e.amount;
  });

  const sortedCategories = Object.entries(categoryTotals)
    .map(([category, amount]) => ({ category, amount }))
    .sort((a, b) => b.amount - a.amount);

  const totalAmount = sortedCategories.reduce((sum, item) => sum + item.amount, 0);

  // Calculate slice angles for SVG donut
  let cumulativeAngle = 0;
  const slices = sortedCategories.map((item, idx) => {
    const fraction = totalAmount > 0 ? item.amount / totalAmount : 0;
    const angle = fraction * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + angle;
    cumulativeAngle += angle;

    const color = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];

    return {
      category: item.category,
      amount: item.amount,
      percentage: fraction * 100,
      startAngle,
      endAngle,
      color,
    };
  });

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians),
    };
  };

  const describeArc = (x: number, y: number, radius: number, startAngle: number, endAngle: number) => {
    const start = polarToCartesian(x, y, radius, endAngle);
    const end = polarToCartesian(x, y, radius, startAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const formatNumber = (num: number) =>
    new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(num);

  const hoveredSlice = slices.find((s) => s.category === hoveredCategory);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900 dark:text-white capitalize">
            {type} Distribution
          </h3>
          <span className="text-xs font-mono font-medium text-slate-500 dark:text-slate-400">
            Total: {currencySymbol}{formatNumber(totalAmount)}
          </span>
        </div>

        {totalAmount === 0 ? (
          <div className="h-48 flex items-center justify-center text-sm text-slate-400">
            No {type} transactions recorded
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            {/* SVG Donut */}
            <div className="relative w-40 h-40 shrink-0">
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {slices.map((slice) => {
                  if (slice.endAngle - slice.startAngle >= 359.9) {
                    return (
                      <circle
                        key={slice.category}
                        cx="50"
                        cy="50"
                        r="35"
                        fill="transparent"
                        stroke={slice.color}
                        strokeWidth="15"
                        onMouseEnter={() => setHoveredCategory(slice.category)}
                        onMouseLeave={() => setHoveredCategory(null)}
                        className="cursor-pointer transition-all hover:opacity-90"
                      />
                    );
                  }

                  const path = describeArc(50, 50, 35, slice.startAngle, slice.endAngle);
                  const isHovered = hoveredCategory === slice.category;

                  return (
                    <path
                      key={slice.category}
                      d={path}
                      fill="transparent"
                      stroke={slice.color}
                      strokeWidth={isHovered ? 20 : 12}
                      strokeLinecap="round"
                      onMouseEnter={() => setHoveredCategory(slice.category)}
                      onMouseLeave={() => setHoveredCategory(null)}
                      className="cursor-pointer transition-all duration-300 ease-out"
                      style={{ filter: isHovered ? 'drop-shadow(0 0 6px rgba(0,0,0,0.2))' : 'none' }}
                    />
                  );
                })}
              </svg>

              {/* Center stat */}
              {/* Center stat */}
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
                <span className="text-[10px] text-slate-400 capitalize truncate w-full">
                  {hoveredSlice ? hoveredSlice.category : 'Total'}
                </span>
                <span className="text-xs font-bold font-mono text-slate-800 dark:text-white truncate max-w-[80px]">
                  {hoveredSlice ? `${currencySymbol}${formatNumber(hoveredSlice.amount)}` : `${currencySymbol}${formatNumber(totalAmount)}`}
                </span>
              </div>
            </div>

            {/* Category Legend list */}
            <div className="flex-1 w-full space-y-2 max-h-48 overflow-y-auto pr-1 text-xs">
              {slices.map((s) => {
                const isHovered = hoveredCategory === s.category;
                return (
                  <div
                    key={s.category}
                    onMouseEnter={() => setHoveredCategory(s.category)}
                    onMouseLeave={() => setHoveredCategory(null)}
                    className={`flex items-center justify-between p-1.5 rounded-lg cursor-pointer transition-all ${
                      isHovered
                        ? 'bg-slate-100 dark:bg-slate-800 font-medium'
                        : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="truncate text-slate-700 dark:text-slate-300">
                        {s.category}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono shrink-0 ml-2">
                      <span className="text-slate-900 dark:text-white font-medium">
                        {currencySymbol}{formatNumber(s.amount)}
                      </span>
                      <span className="text-slate-400 w-9 text-right">
                        {s.percentage.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
