import React from 'react';
import {
  Cloud,
  AlertTriangle,
  HardDrive,
  CheckCircle2,
  ArrowRight,
  ArrowUpCircle,
  ArrowDownCircle,
  ShieldCheck,
  X,
  Clock,
  FileJson,
  RefreshCw,
} from 'lucide-react';

export interface DriveConflictDetail {
  id: 'budget' | 'ledger' | 'template';
  title: string;
  fileName: string;
  status: 'local_newer' | 'drive_newer' | 'identical' | 'drive_only';
  localTimestamp?: string;
  driveTimestamp?: string;
  localStats: {
    count: number;
    countLabel: string;
    detail?: string;
  };
  driveStats: {
    count: number;
    countLabel: string;
    fileSize?: string;
  };
  onKeepLocal: () => void;
  onOverwriteWithDrive: () => void;
  onPushToDrive?: () => void;
}

interface DriveConflictModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  items: DriveConflictDetail[];
  onKeepAllLocal: () => void;
  onPushAllLocalToDrive?: () => void;
  onOverwriteAllWithDrive?: () => void;
  isLoading?: boolean;
  loadingMessage?: string | null;
}

export const DriveConflictModal: React.FC<DriveConflictModalProps> = ({
  isOpen,
  onClose,
  userEmail,
  items,
  onKeepAllLocal,
  onPushAllLocalToDrive,
  onOverwriteAllWithDrive,
  isLoading = false,
  loadingMessage = null,
}) => {
  if (!isOpen || items.length === 0) return null;

  const formatDate = (iso?: string) => {
    if (!iso) return 'Not recorded';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return iso;
    }
  };

  const hasLocalNewer = items.some((i) => i.status === 'local_newer');
  const hasDriveNewer = items.some((i) => i.status === 'drive_newer');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-modal-title"
      >
        {/* Header (Always visible) */}
        <div className="shrink-0 px-4 sm:px-6 py-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-indigo-100 dark:bg-indigo-950/70 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <h2
                id="conflict-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug"
              >
                Google Drive Reconnection &amp; Data Sync
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400 mt-0.5 break-words">
                {userEmail ? `Connected as ${userEmail} · ` : ''}
                Comparing local device data with Google Drive files
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer shrink-0 disabled:opacity-40"
            title="Close and keep local data"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {/* Informational Guidance Banner */}
          <div>
            {hasLocalNewer ? (
              <div className="p-3.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs flex items-start gap-2.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="text-emerald-900 dark:text-emerald-200 leading-relaxed">
                  <span className="font-semibold">Local changes protected:</span> Your local device has newer changes than Google Drive. By default, <span className="underline font-medium">local changes are preserved</span> and will NOT be overwritten. You can push them to Drive now or review below.
                </div>
              </div>
            ) : hasDriveNewer ? (
              <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-amber-900 dark:text-amber-200 leading-relaxed">
                  <span className="font-semibold">Google Drive contains newer data:</span> Cloud backup has more recent timestamps. Would you like to load from Drive (overwriting local device copy) or keep your local changes?
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800/60 text-xs flex items-start gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <div className="text-indigo-900 dark:text-indigo-200 leading-relaxed">
                  Found matching database files in Google Drive. Review versions below to confirm synchronization.
                </div>
              </div>
            )}
          </div>

          {/* Conflict / Comparison Items List */}
          <div className="space-y-4">
            {items.map((item) => {
              const isLocalNewer = item.status === 'local_newer';
              const isDriveNewer = item.status === 'drive_newer';

              return (
                <div
                  key={item.id}
                  className="bg-slate-50/70 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 sm:p-4 space-y-3 min-w-0"
                >
                  {/* Title & Status Badge */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <FileJson className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="font-semibold text-xs text-slate-800 dark:text-slate-200">
                          {item.title}
                        </span>
                      </div>
                      <code className="inline-block mt-1 text-[10px] font-mono text-slate-500 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 break-all max-w-full">
                        {item.fileName}
                      </code>
                    </div>

                    <div className="shrink-0 self-start">
                      {isLocalNewer ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 whitespace-nowrap">
                          <ShieldCheck className="w-3 h-3 shrink-0" />
                          <span>Local is Latest</span>
                        </span>
                      ) : isDriveNewer ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200 dark:border-blue-800 whitespace-nowrap">
                          <Cloud className="w-3 h-3 shrink-0" />
                          <span>Drive is Newer</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          <span>Identical</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comparison Columns */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* Local Column */}
                    <div
                      className={`p-3 rounded-xl border min-w-0 ${
                        isLocalNewer
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <HardDrive className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>Local Device</span>
                        </span>
                        {isLocalNewer && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                            Preserved
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                        <div className="flex items-start gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="break-words">Edited: {formatDate(item.localTimestamp)}</span>
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.localStats.count} {item.localStats.countLabel}
                        </div>
                        {item.localStats.detail && (
                          <div className="text-[10px] text-slate-500 break-words">{item.localStats.detail}</div>
                        )}
                      </div>
                    </div>

                    {/* Drive Column */}
                    <div
                      className={`p-3 rounded-xl border min-w-0 ${
                        isDriveNewer
                          ? 'bg-blue-50/50 dark:bg-blue-950/20 border-blue-300 dark:border-blue-800'
                          : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-1 mb-1.5">
                        <span className="font-semibold text-[11px] text-slate-700 dark:text-slate-300 flex items-center gap-1">
                          <Cloud className="w-3 h-3 text-indigo-400 shrink-0" />
                          <span>Google Drive</span>
                        </span>
                        {isDriveNewer && (
                          <span className="text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                            Newer Cloud Copy
                          </span>
                        )}
                      </div>
                      <div className="space-y-1 text-slate-600 dark:text-slate-400 text-[11px]">
                        <div className="flex items-start gap-1">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0 mt-0.5" />
                          <span className="break-words">Saved: {formatDate(item.driveTimestamp)}</span>
                        </div>
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {item.driveStats.count} {item.driveStats.countLabel}
                        </div>
                        {item.driveStats.fileSize && (
                          <div className="text-[10px] text-slate-500">Size: {item.driveStats.fileSize}</div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Per-item action buttons */}
                  <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-end gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={item.onKeepLocal}
                      disabled={isLoading}
                      className="px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 transition-colors cursor-pointer text-center disabled:opacity-50"
                    >
                      Keep Local Changes
                    </button>

                    {item.onPushToDrive && isLocalNewer && (
                      <button
                        type="button"
                        onClick={item.onPushToDrive}
                        disabled={isLoading}
                        className="px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
                      >
                        <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>Push Local to Drive</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={item.onOverwriteWithDrive}
                      disabled={isLoading}
                      className={`px-3 py-2 sm:py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                        isDriveNewer
                          ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                          : 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <ArrowDownCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{isDriveNewer ? 'Load Newer from Drive' : 'Overwrite Local with Drive'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer Bulk Actions (Always visible) */}
        <div className="shrink-0 px-4 sm:px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="text-[11px] sm:text-xs text-slate-500 dark:text-slate-400">
            {isLoading ? (
              <span className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 font-semibold">
                <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                <span>{loadingMessage || 'Syncing with Google Drive...'}</span>
              </span>
            ) : (
              <span>Your local files will never be overwritten without explicit approval.</span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto justify-end shrink-0">
            <button
              type="button"
              onClick={onKeepAllLocal}
              disabled={isLoading}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-200 transition-colors cursor-pointer text-center disabled:opacity-50"
            >
              Keep All Local (Safe)
            </button>

            {hasLocalNewer && onPushAllLocalToDrive && (
              <button
                type="button"
                onClick={onPushAllLocalToDrive}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                <ArrowUpCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Upload Latest to Drive</span>
              </button>
            )}

            {hasDriveNewer && onOverwriteAllWithDrive && (
              <button
                type="button"
                onClick={onOverwriteAllWithDrive}
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowDownCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Load All from Drive</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
