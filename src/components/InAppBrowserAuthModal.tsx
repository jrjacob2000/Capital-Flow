import React, { useState } from 'react';
import {
  ExternalLink,
  Copy,
  CheckCircle2,
  X,
  Smartphone,
  ShieldAlert,
  MoreHorizontal,
  Compass,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { BrowserEnvironmentInfo } from '../services/firebase';

interface InAppBrowserAuthModalProps {
  isOpen: boolean;
  browserEnv: BrowserEnvironmentInfo;
  errorMessage?: string | null;
  onClose: () => void;
  onStartBlankLocalWorkspace?: () => void;
  onForceSignInAnyway: () => void;
}

export const InAppBrowserAuthModal: React.FC<InAppBrowserAuthModalProps> = ({
  isOpen,
  browserEnv,
  errorMessage,
  onClose,
  onStartBlankLocalWorkspace,
  onForceSignInAnyway,
}) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const browserLabel = browserEnv.isInAppBrowser ? browserEnv.browserName : 'In-App / Restricted Browser';
  const targetExternalBrowser = browserEnv.isIOS
    ? 'Safari or Chrome'
    : browserEnv.isAndroid
      ? 'Chrome'
      : 'Safari, Chrome, or Edge';

  const handleCopyLink = async () => {
    const linkToCopy = browserEnv.appUrl;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(linkToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = linkToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 3500);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="inapp-browser-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-amber-200 dark:border-amber-900/60 relative overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-indigo-500 via-amber-500 to-emerald-500" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-2xl bg-amber-50 dark:bg-amber-950/70 border border-amber-200 dark:border-amber-800 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800 mb-1">
                <ShieldAlert className="w-3 h-3 shrink-0" />
                <span>{browserLabel} Detected</span>
              </div>
              <h3
                id="inapp-browser-modal-title"
                className="text-sm sm:text-base font-bold text-slate-900 dark:text-white leading-snug"
              >
                Open in {targetExternalBrowser} for Google Sign-In
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Why this happens */}
        <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
          <p className="leading-relaxed">
            <strong>{browserLabel}</strong> uses an embedded in-app web viewer that clears{' '}
            <code className="px-1 py-0.5 rounded bg-slate-100 dark:bg-slate-800 font-mono text-[11px]">
              sessionStorage
            </code>{' '}
            during Google Sign-In, causing the{' '}
            <span className="font-semibold text-amber-700 dark:text-amber-300">
              &ldquo;Unable to process request due to missing initial state&rdquo;
            </span>{' '}
            error.
          </p>

          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/70 text-[11px] text-rose-700 dark:text-rose-300">
              {errorMessage}
            </div>
          )}

          {/* Visual 2-Step Guide matching Messenger's Top Bar */}
          <div className="rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700/80 p-3.5 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5" />
              <span>How to Open in {targetExternalBrowser} (2 Seconds)</span>
            </div>

            <div className="space-y-2 text-xs text-slate-700 dark:text-slate-200">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  1
                </span>
                <div className="leading-snug">
                  Tap the{' '}
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 font-bold text-slate-900 dark:text-white align-middle">
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </span>{' '}
                  <strong>menu icon</strong> in the <strong>top-right corner</strong> of {browserLabel}.
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  2
                </span>
                <div className="leading-snug">
                  Select{' '}
                  <strong className="text-indigo-600 dark:text-indigo-400">
                    &ldquo;Open in external browser&rdquo;
                  </strong>{' '}
                  (or <strong>&ldquo;Open in {browserEnv.isIOS ? 'Safari' : 'Chrome'}&rdquo;</strong>).
                </div>
              </div>
            </div>
          </div>

          {/* Primary Action: Copy Link / Direct Open */}
          <div className="space-y-2 pt-1">
            {browserEnv.isAndroid && browserEnv.chromeIntentUrl && (
              <a
                href={browserEnv.chromeIntentUrl}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open Directly in Google Chrome</span>
              </a>
            )}

            {browserEnv.isIOS && browserEnv.safariSchemeUrl && (
              <a
                href={browserEnv.safariSchemeUrl}
                className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2"
              >
                <Compass className="w-4 h-4" />
                <span>Launch in Mobile Safari</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleCopyLink}
              className={`w-full py-2.5 px-4 rounded-xl text-xs font-bold border transition-all flex items-center justify-center gap-2 cursor-pointer ${
                copied
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 text-white dark:text-slate-900 border-slate-900 dark:border-white'
              }`}
            >
              {copied ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Link Copied! Paste in {targetExternalBrowser}</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Link to Paste in {targetExternalBrowser}</span>
                </>
              )}
            </button>
          </div>

          {/* New User Reassurance: Use Without Google Sign-In */}
          <div className="rounded-2xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200/80 dark:border-emerald-800/60 p-3.5 space-y-2">
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>New User? No Sign-In Required!</span>
            </div>
            <p className="text-[11px] text-emerald-800 dark:text-emerald-300/90 leading-snug">
              CapitalFlow saves your budget, funds, and Excel imports directly on your device even without connecting Google Drive.
            </p>
            <div className="flex flex-col sm:flex-row gap-2 pt-1">
              {onStartBlankLocalWorkspace && (
                <button
                  type="button"
                  onClick={() => {
                    onStartBlankLocalWorkspace();
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Start My Blank Budget Now</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="py-2 px-3 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 border border-emerald-200 dark:border-slate-700 text-xs font-semibold flex items-center justify-center gap-1 transition-colors cursor-pointer"
              >
                <span>Continue Local Mode</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Fallback: Force Popup Sign-In Anyway */}
        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px] text-slate-400">
          <span>Already in Safari or Chrome?</span>
          <button
            type="button"
            onClick={() => {
              onClose();
              onForceSignInAnyway();
            }}
            className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
          >
            Try Google Sign-In Popup Anyway &rarr;
          </button>
        </div>
      </div>
    </div>
  );
};
