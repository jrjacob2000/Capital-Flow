import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface CarryOverModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  surplus: number;
  fromPeriod: string;
  toPeriod: string;
  currencySymbol?: string;
}

export const CarryOverModal: React.FC<CarryOverModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  surplus,
  fromPeriod,
  toPeriod,
  currencySymbol = '₱',
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl p-5 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-2xl max-w-sm w-full overflow-hidden"
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 text-amber-600 dark:text-amber-400 min-w-0">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/60 shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug">
              Carry Over Surplus
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 mb-6 leading-relaxed break-words">
          Are you sure you want to carry over a surplus of{' '}
          <strong className="font-mono text-emerald-600 dark:text-emerald-400">
            {currencySymbol}{surplus.toLocaleString()}
          </strong>{' '}
          from <strong>{fromPeriod}</strong> to <strong>{toPeriod}</strong>?
        </p>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 bg-slate-100 sm:bg-transparent dark:bg-slate-800 sm:dark:bg-transparent rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="px-4 py-2 text-xs sm:text-sm font-semibold bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 shadow-xs transition-colors cursor-pointer"
          >
            Confirm Carry Over
          </button>
        </div>
      </div>
    </div>
  );
};

