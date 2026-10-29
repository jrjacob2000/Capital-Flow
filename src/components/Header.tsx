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
  KeyRound,
  LayoutDashboard,
  FileSpreadsheet,
  PiggyBank,
  HandCoins,
} from 'lucide-react';
import { EntryFrequency, DriveSyncStatus, APP_VERSION } from '../types/finance';

interface HeaderProps {
  currentYear: number;
  availableYears: number[];
  onSelectYear: (year: number) => void;
  onAddNewYear: () => void;
  frequency: EntryFrequency;
  onChangeFrequency: (freq: EntryFrequency) => void;
  activeTab: 'dashboard' | 'budget' | 'savings' | 'loans' | 'drive';
  onSelectTab: (tab: 'dashboard' | 'budget' | 'savings' | 'loans' | 'drive') => void;
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
    <>
      {/* Touch-friendly click-outside backdrop when dropdowns are open */}
      {(showYearDropdown || showUserDropdown) && (
        <div
          className="fixed inset-0 z-30 bg-transparent"
          onClick={() => {
            setShowYearDropdown(false);
            setShowUserDropdown(false);
          }}
        />
      )}

      <header className="sticky top-0 z-40 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 transform-gpu">
        <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16 gap-1.5 sm:gap-4">
            
            {/* Brand & Logo */}
            <div
              onClick={() => onSelectTab('dashboard')}
              className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 cursor-pointer"
            >
              <div className="w-7 h-7 sm:w-9 sm:h-9 lg:w-10 lg:h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-emerald-400 flex items-center justify-center text-white shadow-md shadow-indigo-500/20 shrink-0">
                <Wallet2 className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 whitespace-nowrap">
                  <span className="font-bold text-sm sm:text-base lg:text-lg text-slate-900 dark:text-white tracking-tight">
                    CapitalFlow
                  </span>
                  <span className="hidden sm:inline-block text-[9px] sm:text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200/80 dark:border-slate-700/80 shrink-0">
                    v{APP_VERSION}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 hidden xl:block whitespace-nowrap truncate">
                  Budget, Funds, Loans &amp; Capital Ledger
                </p>
              </div>
            </div>

            {/* Desktop Navigation Tabs */}
            <nav className="hidden md:flex items-center gap-0.5 lg:gap-1 bg-slate-100/80 dark:bg-slate-800/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60 text-xs font-medium shrink-0">
              <button
                onClick={() => onSelectTab('dashboard')}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'dashboard'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Dashboard
              </button>
              <button
                onClick={() => onSelectTab('budget')}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'budget'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span className="xl:hidden">Budget</span>
                <span className="hidden xl:inline">Budget &amp; Entries</span>
              </button>
              <button
                onClick={() => onSelectTab('savings')}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'savings'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>Funds</span>
              </button>
              <button
                onClick={() => onSelectTab('loans')}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'loans'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <span>Loans</span>
              </button>
              <button
                onClick={() => onSelectTab('drive')}
                className={`px-2.5 lg:px-3.5 py-1.5 rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === 'drive'
                    ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Cloud className="w-3.5 h-3.5" />
                <span className="xl:hidden">Drive</span>
                <span className="hidden xl:inline">Drive Storage</span>
                {driveStatus.isSignedIn && hasUnsavedChanges && !driveStatus.isSyncing && (
                  <span
                    className="w-2 h-2 rounded-full bg-amber-500"
                    title="Local changes not yet synced to Google Drive"
                  />
                )}
              </button>
            </nav>

            {/* Right Action Controls: Year, Frequency & Google Auth */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              
              {/* Year Selector Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowYearDropdown(!showYearDropdown);
                    setShowUserDropdown(false);
                  }}
                  className="flex items-center gap-1 min-h-[32px] sm:min-h-[38px] px-2 sm:px-2.5 lg:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition-colors border border-slate-200/80 dark:border-slate-700/80 cursor-pointer"
                >
                  <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-indigo-500 shrink-0" />
                  <span>{currentYear}</span>
                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </button>

                {showYearDropdown && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100">
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
                        className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
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
                      className="w-full text-left px-3 py-2 text-xs text-indigo-600 dark:text-indigo-400 font-semibold hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Create New Year</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Frequency Toggle: Monthly vs Bi-Weekly (Responsive for Mobile, Tablet & Desktop) */}
              <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl border border-slate-200/80 dark:border-slate-700/80 text-[11px] sm:text-xs">
                <button
                  type="button"
                  onClick={() => onChangeFrequency('monthly')}
                  className={`min-h-[28px] sm:min-h-[32px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    frequency === 'monthly'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                  title="Monthly Budget Mode"
                >
                  <span className="lg:hidden">Mo</span>
                  <span className="hidden lg:inline">Monthly</span>
                </button>
                <button
                  type="button"
                  onClick={() => onChangeFrequency('bi-weekly')}
                  className={`min-h-[28px] sm:min-h-[32px] px-1.5 sm:px-2 lg:px-2.5 py-0.5 sm:py-1 rounded-lg transition-all whitespace-nowrap cursor-pointer ${
                    frequency === 'bi-weekly'
                      ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-slate-300'
                  }`}
                  title="Bi-Weekly Cutoff Mode"
                >
                  <span className="lg:hidden">2W</span>
                  <span className="hidden lg:inline">Bi-Weekly</span>
                </button>
              </div>

              {/* Google Drive Status & User Profile */}
              {driveStatus.isSignedIn ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setShowUserDropdown(!showUserDropdown);
                      setShowYearDropdown(false);
                    }}
                    className="flex items-center gap-1 sm:gap-2 min-h-[32px] sm:min-h-[38px] pl-1.5 pr-1.5 sm:pl-2 sm:pr-2.5 py-1 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700/80 border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                  >
                    {driveStatus.userPhoto ? (
                      <img
                        src={driveStatus.userPhoto}
                        alt={driveStatus.userName || 'User'}
                        referrerPolicy="no-referrer"
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
                            ? 'bg-amber-500'
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
                    <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-3 z-50 animate-in fade-in zoom-in-95 duration-100">
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
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
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
                          className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors disabled:opacity-50"
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
                          className="w-full text-left px-2.5 py-2 text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg flex items-center gap-2 transition-colors"
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
                          className="w-full text-left px-2.5 py-2 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg flex items-center gap-2 transition-colors font-medium"
                        >
                          <LogOut className="w-3.5 h-3.5" />
                          <span>Disconnect Account</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : driveStatus.isSessionExpired ? (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  disabled={driveStatus.isSyncing}
                  className="flex items-center gap-1 sm:gap-1.5 min-h-[32px] sm:min-h-[36px] px-2 sm:px-3 py-1 sm:py-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/70 dark:hover:bg-amber-900/80 border border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-200 rounded-xl shadow-2xs transition-all text-[11px] sm:text-xs font-semibold cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                  title="Google Drive session has expired. Click to sign in again."
                >
                  <KeyRound className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span className="hidden xl:inline">
                    {driveStatus.isSyncing ? 'Reconnecting...' : 'Session Expired • Reconnect'}
                  </span>
                  <span className="xl:hidden">{driveStatus.isSyncing ? '...' : 'Reconnect'}</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSignInWithGoogle}
                  disabled={driveStatus.isSyncing}
                  className="flex items-center gap-1 sm:gap-2 min-h-[32px] sm:min-h-[36px] px-2 sm:px-3 py-1 sm:py-1.5 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 shadow-2xs transition-all text-[11px] sm:text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <svg
                    version="1.1"
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0"
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
                  <span className="hidden xl:inline">
                    {driveStatus.isSyncing ? 'Connecting...' : 'Sign in with Google'}
                  </span>
                  <span className="xl:hidden">{driveStatus.isSyncing ? '...' : 'Sign in'}</span>
                </button>
              )}

            </div>
          </div>
        </div>
      </header>

      {/* Fixed Bottom Tab Bar for Mobile Users (Thumb-Zone Navigation) */}
      <nav
        aria-label="Mobile Primary Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-[env(safe-area-inset-bottom)] transform-gpu will-change-transform after:content-[''] after:absolute after:inset-x-0 after:top-full after:h-24 after:bg-white dark:after:bg-slate-900 after:pointer-events-none"
      >
        <div className="grid grid-cols-5 items-center h-16 px-1">
          <button
            type="button"
            onClick={() => onSelectTab('dashboard')}
            className={`relative flex flex-col items-center justify-center h-full min-h-[48px] transition-colors cursor-pointer ${
              activeTab === 'dashboard'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            {activeTab === 'dashboard' && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-indigo-600 dark:bg-indigo-400" />
            )}
            <LayoutDashboard className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">Dashboard</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('budget')}
            className={`relative flex flex-col items-center justify-center h-full min-h-[48px] transition-colors cursor-pointer ${
              activeTab === 'budget'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            {activeTab === 'budget' && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-indigo-600 dark:bg-indigo-400" />
            )}
            <FileSpreadsheet className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">Budget</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('savings')}
            className={`relative flex flex-col items-center justify-center h-full min-h-[48px] transition-colors cursor-pointer ${
              activeTab === 'savings'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            {activeTab === 'savings' && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-indigo-600 dark:bg-indigo-400" />
            )}
            <PiggyBank className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">Funds</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('loans')}
            className={`relative flex flex-col items-center justify-center h-full min-h-[48px] transition-colors cursor-pointer ${
              activeTab === 'loans'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            {activeTab === 'loans' && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-indigo-600 dark:bg-indigo-400" />
            )}
            <HandCoins className="w-5 h-5" />
            <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">Loans</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('drive')}
            className={`relative flex flex-col items-center justify-center h-full min-h-[48px] transition-colors cursor-pointer ${
              activeTab === 'drive'
                ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white font-medium'
            }`}
          >
            {activeTab === 'drive' && (
              <span className="absolute top-0 inset-x-4 h-0.5 rounded-b-full bg-indigo-600 dark:bg-indigo-400" />
            )}
            <div className="relative">
              <Cloud className="w-5 h-5" />
              {driveStatus.isSignedIn && hasUnsavedChanges && !driveStatus.isSyncing && (
                <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white dark:ring-slate-900" />
              )}
            </div>
            <span className="text-[10px] tracking-tight mt-1 whitespace-nowrap">Drive</span>
          </button>
        </div>
      </nav>
    </>
  );
};

