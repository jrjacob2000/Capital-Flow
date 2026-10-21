import React from 'react';
import { KeyRound, ShieldAlert, X, Cloud, RefreshCw, AlertTriangle } from 'lucide-react';

interface DriveSessionExpiredModalProps {
  isOpen: boolean;
  userEmail?: string | null;
  onSignInAgain: () => Promise<void> | void;
  onContinueOffline: () => void;
  isSigningIn?: boolean;
}

export const DriveSessionExpiredModal: React.FC<DriveSessionExpiredModalProps> = ({
  isOpen,
  userEmail,
  onSignInAgain,
  onContinueOffline,
  isSigningIn = false,
}) => {
  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="session-expired-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-200 dark:border-amber-900/50 relative overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Subtle decorative glow */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-500" />
        <div className="absolute -right-12 -top-12 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <KeyRound className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 mb-1">
                <AlertTriangle className="w-3 h-3" />
                <span>Re-Authentication Required</span>
              </div>
              <h3 id="session-expired-title" className="text-base font-bold text-slate-900 dark:text-white">
                Google Drive Session Expired
              </h3>
            </div>
          </div>

          <button
            onClick={onContinueOffline}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg transition-colors cursor-pointer"
            title="Dismiss and continue offline"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <p>
            Your Google Drive authorization token has expired or requires renewal. While your data is safely saved in your browser, cloud synchronization is paused until you sign in again.
          </p>

          {userEmail && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <span className="text-slate-500 text-[11px]">Previous Account:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-100 font-mono text-[11px] truncate max-w-[200px]">
                {userEmail}
              </span>
            </div>
          )}

          <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-200 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>What happens next?</span>
            </div>
            <p className="text-amber-700 dark:text-amber-300/90 pl-5">
              Signing in will grant a fresh Google Drive token to save and load your annual budgets and savings ledger seamlessly.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex flex-col sm:flex-row items-center gap-2.5">
          <button
            type="button"
            onClick={onSignInAgain}
            disabled={isSigningIn}
            className="w-full sm:flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSigningIn ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                {/* Standard Google "G" logo */}
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-4 h-4 shrink-0 bg-white rounded-full p-0.5"
                >
                  <path
                    fill="#EA4335"
                    d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                  />
                  <path
                    fill="#4285F4"
                    d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6.19C30.01 37.45 27.23 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                </svg>
                <span>Sign In Again with Google</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onContinueOffline}
            className="w-full sm:w-auto py-2.5 px-4 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
          >
            Continue Offline
          </button>
        </div>
      </div>
    </div>
  );
};
