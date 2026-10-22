import React, { useState } from 'react';
import {
  Wallet2,
  Calendar,
  Cloud,
  CheckCircle2,
  RefreshCw,
  LogOut,
  FolderSync,
  ChevronDown,
  Plus,
  Layers,
  Sparkles,
  KeyRound,
} from 'lucide-react';
import { EntryFrequency, DriveSyncStatus, APP_VERSION } from '../types/finance';

interface HeaderProps {
  currentYear: number;
  availableYears: number[];
  onSelectYear: (year: number) => void;
  onAddNewYear: () => void;
  frequency: EntryFrequency;
  onChangeFrequency: (freq: EntryFrequency) => void;
  activeTab: 'dashboard' | 'budget' | 'savings' | 'drive';
  onSelectTab: (tab: 'dashboard' | 'budget' | 'savings' | 'drive') => void;
  driveStatus: DriveSyncStatus;
  onSignInWithGoogle: () => void;
  onSignOut: () => void;
  onOpenDriveModal: () => void;
  onTriggerSync: () => void;
  hasUnsavedChanges?: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  currentYear,
  availableYears,
  onSelectYear,
  onAddNewYear,
  frequency,
  onChangeFrequency,
  activeTab,
  onSelectTab,
  driveStatus,
  onSignInWithGoogle,
  onSignOut,
  onOpenDriveModal,
  onTriggerSync,
  hasUnsavedChanges = false,
}) => {
  const [showYearDropdown, setShowYearDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);

  return (
    <header className="sticky top-0 z-40 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2 sm:gap-4">
          
          {/* Brand & Logo */}
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
              <Wallet2 className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 truncate">
                <span className="font-bold text-base sm:text-lg text-slate-900 dark:text-white tracking-tight truncate">
                  CapitalFlow
                </span>
                <span className="text-[9px] sm:text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
                  v{APP_VERSION}
                </span>
                <span className="text-[9px] sm:text-[10px] font-semibold tracking-wider uppercase px-1 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 hidden lg:inline-block shrink-0">
                  Drive DB
                </span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden sm:block">
                Budget, Funds &amp; Capital Growth Ledger
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs font-medium">
            <button
              onClick={() => onSelectTab('dashboard')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeTab === 'dashboard'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => onSelectTab('budget')}
              className={`px-3.5 py-1.5 rounded-lg transition-all ${
                activeTab === 'budget'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Budget &amp; Entries
            </button>
            <button
              onClick={() => onSelectTab('savings')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'savings'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <span>Funds</span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </button>
            <button
              onClick={() => onSelectTab('drive')}
              className={`px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 ${
                activeTab === 'drive'
                  ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Cloud className="w-3.5 h-3.5" />
              <span>Drive Storage</span>
              {driveStatus.isSignedIn && hasUnsavedChanges && !driveStatus.isSyncing && (
                <span
                  className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                  title="Local changes not yet synced to Google Drive"
                />
              )}
            </button>
          </nav>

          {/* Right Action Controls: Year, Frequency & Google Auth */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            
            {/* Year Selector Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowYearDropdown(!showYearDropdown)}
                className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-colors border border-slate-200/80 dark:border-slate-700/80"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                <span>{currentYear}</span>
                <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
              </button>

              {showYearDropdown && (
                <div
                  className="absolute right-0 mt-2 w-44 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-1 z-50 animate-in fade-in zoom-in-95 duration-100"
                  onMouseLeave={() => setShowYearDropdown(false)}
                >
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                    Annual Databases
                  </div>
                  {availableYears.map((yr) => (
                    <button
                      key={yr}
                      onClick={() => {
                        onSelectYear(yr);
                        setShowYearDropdown(false);
                      }}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                        yr === currentYear
                          ? 'text-indigo-600 dark:text-indigo-400 font-bold bg-indigo-50/50 dark:bg-indigo-950/30'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span>{yr} Database</span>
                      {yr === currentYear && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                    </button>
                  ))}
                  <div className="border-t border-slate-100 dark:border-slate-800 my-1" />
                  <button
                    onClick={() => {
                      onAddNewYear();
                      setShowYearDropdown(false);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Year</span>
                  </button>
                </div>
              )}
            </div>

            {/* Frequency Toggle: Monthly vs Bi-Weekly */}
            <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-xs">
              <button
                type="button"
                onClick={() => onChangeFrequency('monthly')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  frequency === 'monthly'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => onChangeFrequency('bi-weekly')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  frequency === 'bi-weekly'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                }`}
              >
                Bi-Weekly
              </button>
            </div>

            {/* Google Drive Status & User Profile */}
            {driveStatus.isSignedIn ? (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowUserDropdown(!showUserDropdown)}
                  className="flex items-center gap-2 pl-2 pr-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors"
                >
                  {driveStatus.userPhoto ? (
                    <img
                      src={driveStatus.userPhoto}
                      alt={driveStatus.userName || 'User'}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] flex items-center justify-center font-bold">
                      {driveStatus.userName ? driveStatus.userName[0].toUpperCase() : 'U'}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 text-xs">
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${
                        driveStatus.isSyncing
                          ? 'bg-indigo-500 animate-pulse'
                          : hasUnsavedChanges
                          ? 'bg-amber-500 animate-pulse'
                          : 'bg-emerald-500'
                      }`}
                    />
                    <span className="font-medium text-slate-700 dark:text-slate-200 max-w-[100px] truncate hidden lg:inline">
                      {driveStatus.userName || driveStatus.userEmail || 'Connected'}
                    </span>
                    {hasUnsavedChanges && !driveStatus.isSyncing && (
                      <span className="hidden sm:inline-block px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                        Unsaved
                      </span>
                    )}
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-400" />
                </button>

                {showUserDropdown && (
                  <div
                    className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onMouseLeave={() => setShowUserDropdown(false)}
                  >
                    <div className="pb-2 border-b border-slate-100 dark:border-slate-800">
                      <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                        {driveStatus.userName || 'Google Account'}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {driveStatus.userEmail}
                      </div>
                      <div className="mt-1 flex items-center gap-1 text-[10px] font-medium">
                        {driveStatus.isSyncing ? (
                          <span className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1 font-semibold">
                            <span>{driveStatus.syncMessage || 'Syncing with Google Drive...'}</span>
                          </span>
                        ) : hasUnsavedChanges ? (
                          <span className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                            Unsaved local changes
                          </span>
                        ) : (
                          <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Connected to Google Drive
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="py-2 space-y-1">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          onTriggerSync();
                        }}
                        disabled={driveStatus.isSyncing}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors disabled:opacity-50"
                      >
                        <span className="flex items-center gap-2">
                          <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                          <span>{driveStatus.isSyncing ? 'Syncing in progress...' : 'Sync Changes Now'}</span>
                        </span>
                        {hasUnsavedChanges && !driveStatus.isSyncing && (
                          <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase rounded bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300">
                            Pending
                          </span>
                        )}
                      </button>

                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          onOpenDriveModal();
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors"
                      >
                        <FolderSync className="w-3.5 h-3.5 text-slate-400" />
                        <span>Manage Drive Files</span>
                      </button>
                    </div>

                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => {
                          setShowUserDropdown(false);
                          onSignOut();
                        }}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center gap-2 transition-colors font-medium"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect Account</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : driveStatus.isSessionExpired ? (
              /* Session Expired Prompt Button */
              <button
                type="button"
                onClick={onSignInWithGoogle}
                disabled={driveStatus.isSyncing}
                className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-xl shadow-2xs transition-all text-xs font-semibold cursor-pointer disabled:opacity-60"
                title="Google Drive session has expired. Click to sign in again."
              >
                <KeyRound className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="hidden sm:inline">
                  {driveStatus.isSyncing ? 'Reconnecting...' : 'Session Expired • Reconnect'}
                </span>
                <span className="sm:hidden">{driveStatus.isSyncing ? 'Syncing...' : 'Reconnect'}</span>
              </button>
            ) : (
              /* Official Google Sign-In Button as mandated in workspace-integration */
              <button
                type="button"
                onClick={onSignInWithGoogle}
                disabled={driveStatus.isSyncing}
                className="flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-all text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-60"
              >
                <svg
                  version="1.1"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 48 48"
                  className="w-4 h-4 shrink-0"
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
                    d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                  />
                  <path fill="none" d="M0 0h48v48H0z" />
                </svg>
                <span className="hidden sm:inline">
                  {driveStatus.isSyncing ? 'Connecting...' : 'Sign in with Google'}
                </span>
                <span className="sm:hidden">{driveStatus.isSyncing ? 'Connecting...' : 'Sign in'}</span>
              </button>
            )}

          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="flex md:hidden items-center justify-around py-2 border-t border-slate-100 dark:border-slate-800 text-xs">
          <button
            onClick={() => onSelectTab('dashboard')}
            className={`px-3 py-1 rounded-lg ${
              activeTab === 'dashboard'
                ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => onSelectTab('budget')}
            className={`px-3 py-1 rounded-lg ${
              activeTab === 'budget'
                ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Budget &amp; Entries
          </button>
          <button
            onClick={() => onSelectTab('savings')}
            className={`px-3 py-1 rounded-lg ${
              activeTab === 'savings'
                ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Funds
          </button>
          <button
            onClick={() => onSelectTab('drive')}
            className={`px-3 py-1 rounded-lg ${
              activeTab === 'drive'
                ? 'font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Drive
          </button>
        </div>

      </div>
    </header>
  );
};
