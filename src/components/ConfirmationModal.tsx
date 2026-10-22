import React from 'react';
import { HardDrive, Trash2, X, RefreshCw } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  title: string;
  description: string;
  affectedItems?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
  loadingMessage?: string | null;
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  title,
  description,
  affectedItems = [],
  confirmLabel = 'Confirm & Proceed',
  cancelLabel = 'Cancel',
  isDestructive = false,
  onConfirm,
  onCancel,
  isLoading = false,
  loadingMessage = null,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-md max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header: Icon + Title + Close Button */}
        <div className="shrink-0 px-4 sm:px-6 pt-4 sm:pt-6 pb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div
              className={`p-2.5 sm:p-3 rounded-xl shrink-0 ${
                isDestructive
                  ? 'bg-rose-100 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400'
                  : 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-400'
              }`}
            >
              {isDestructive ? (
                <Trash2 className="w-5 h-5 sm:w-6 sm:h-6" />
              ) : (
                <HardDrive className="w-5 h-5 sm:w-6 sm:h-6" />
              )}
            </div>

            <h3
              id="modal-title"
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-white leading-snug break-words min-w-0 flex-1"
            >
              {title}
            </h3>
          </div>

          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors shrink-0 cursor-pointer disabled:opacity-40"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Full-Width Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-1 min-w-0">
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
            {description}
          </p>

          {affectedItems.length > 0 && (
            <div className="mt-3.5 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700/60 min-w-0 overflow-hidden">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
                Targeted Files / Records:
              </div>
              <ul className="text-xs font-mono text-slate-700 dark:text-slate-300 space-y-1.5 min-w-0">
                {affectedItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2 min-w-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0 mt-1.5" />
                    <span className="break-all leading-relaxed min-w-0 flex-1">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {isLoading && (
            <p className="mt-3 text-xs font-medium text-indigo-600 dark:text-indigo-400">
              {loadingMessage || 'Synchronizing with Google Drive...'}
            </p>
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 px-4 sm:px-6 pt-4 pb-4 sm:pb-6 mt-2 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 sm:bg-transparent hover:bg-slate-200 sm:hover:bg-slate-100 dark:bg-slate-800 sm:dark:bg-transparent dark:hover:bg-slate-800 rounded-xl transition-colors disabled:opacity-50 text-center cursor-pointer"
          >
            {cancelLabel}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2.5 sm:py-2 text-xs sm:text-sm font-semibold rounded-xl text-white shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 focus:ring-4 focus:ring-rose-500/20'
                : 'bg-emerald-600 hover:bg-emerald-700 focus:ring-4 focus:ring-emerald-500/20'
            } disabled:opacity-75`}
          >
            {isLoading && <RefreshCw className="w-4 h-4 animate-spin shrink-0" />}
            <span>{isLoading ? 'Syncing...' : confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

