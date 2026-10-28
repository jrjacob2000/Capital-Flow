/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  BudgetEntry,
  YearBudgetData,
  SavingsLedgerData,
  BudgetTemplateData,
  SavingsAccount,
  SavingsTransaction,
  EntryFrequency,
  EntryType,
  BudgetItemTemplate,
  DriveSyncStatus,
  DriveFileInfo,
  LoanRecord,
  LoanPayment,
  APP_VERSION,
} from './types/finance';
import { FinanceStorageService } from './services/storageService';
import {
  normalizeSavingCategoryGroup,
  MONTH_NAMES,
  BIWEEKLY_PERIODS,
  isDefaultStarterBudget,
  isDefaultStarterTemplateData,
  isDefaultStarterLedger,
} from './services/sampleData';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  clearCachedToken,
  isDriveTokenExpired,
  auth,
} from './services/firebase';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { BudgetEntryView } from './components/BudgetEntryView';
import { SavingsLedgerView } from './components/SavingsLedgerView';
import { LoansView } from './components/LoansView';
import { DriveFilesManagerView } from './components/DriveFilesManagerView';
import { ConfirmationModal } from './components/ConfirmationModal';
import { DriveConflictModal, DriveConflictDetail } from './components/DriveConflictModal';
import { DriveSessionExpiredModal } from './components/DriveSessionExpiredModal';
import {
  getBudgetFileName,
  SAVINGS_LEDGER_FILE_NAME,
  BUDGET_TEMPLATE_FILE_NAME,
  CAPITALFLOW_DRIVE_FOLDER_NAME,
  isSessionExpiredError,
  validateDriveToken,
} from './services/driveService';
import { CheckCircle2, AlertCircle, RefreshCw, Calendar, X, Cloud, Download, ShieldAlert } from 'lucide-react';

export default function App() {
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [availableYears, setAvailableYears] = useState<number[]>([2026, 2025]);
  const [frequency, setFrequency] = useState<EntryFrequency>('monthly');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'budget' | 'savings' | 'loans' | 'drive'>('dashboard');

  // Core Financial Data
  const [budget, setBudget] = useState<YearBudgetData>(() =>
    FinanceStorageService.loadLocalBudget(2026)
  );
  const [ledger, setLedger] = useState<SavingsLedgerData>(() =>
    FinanceStorageService.loadLocalSavingsLedger()
  );
  const [templateData, setTemplateData] = useState<BudgetTemplateData>(() =>
    FinanceStorageService.loadLocalTemplateData(FinanceStorageService.loadLocalBudget(2026))
  );

  // Google Drive & Auth State
  const [driveStatus, setDriveStatus] = useState<DriveSyncStatus>({
    isConfigured: true,
    isSignedIn: false,
    userEmail: null,
    userName: null,
    userPhoto: null,
    lastSyncedAt: null,
    isSyncing: false,
    error: null,
    budgetFileId: null,
    savingsFileId: null,
    templateFileId: null,
    folderId: null,
    folderName: CAPITALFLOW_DRIVE_FOLDER_NAME,
  });
  const [driveFiles, setDriveFiles] = useState<DriveFileInfo[]>([]);

  // Conflict / Overwrite Prevention Modal State
  const [conflictModalState, setConflictModalState] = useState<{
    isOpen: boolean;
    items: DriveConflictDetail[];
  }>({
    isOpen: false,
    items: [],
  });

  // Google Drive Session Expired Modal State
  const [isSessionExpiredModalOpen, setIsSessionExpiredModalOpen] = useState<boolean>(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSyncReminderDismissed, setIsSyncReminderDismissed] = useState<boolean>(false);

  // Reset reminder dismissal whenever new unsaved changes occur
  useEffect(() => {
    if (hasUnsavedChanges) {
      setIsSyncReminderDismissed((prev) => (prev ? false : prev));
    }
  }, [hasUnsavedChanges]);

  // Browser window/tab close guard when changes are unsaved to Google Drive
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && driveStatus.isSignedIn) {
        e.preventDefault();
        e.returnValue = '';
        return '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, driveStatus.isSignedIn]);

  // Create New Year Modal State
  const [isNewYearModalOpen, setIsNewYearModalOpen] = useState<boolean>(false);
  const [newYearInput, setNewYearInput] = useState<string>('');
  const [copyTemplatesToNewYear, setCopyTemplatesToNewYear] = useState<boolean>(true);

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'error' } | null>(null);

  const showToast = (text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Centralized Google Drive session expired handler (non-intrusive by default)
  const handleSessionExpired = useCallback((customMsg?: string, showToastAlert: boolean = false) => {
    clearCachedToken();
    setDriveStatus((prev) => ({
      ...prev,
      isSyncing: false,
      isSignedIn: false,
      isSessionExpired: true,
      error: customMsg || 'Google Drive session has expired. Please sign in again.',
    }));
    if (showToastAlert) {
      showToast(customMsg || 'Google Drive session expired. Please sign in again.', 'error');
    }
  }, []);

  // Confirmation Modal State (required for Google Workspace mutating actions)
  const [confirmationModal, setConfirmationModal] = useState<{
    isOpen: boolean;
    title: string;
    description: string;
    affectedItems: string[];
    confirmLabel?: string;
    isDestructive?: boolean;
    onConfirm: () => Promise<void>;
  }>({
    isOpen: false,
    title: '',
    description: '',
    affectedItems: [],
    onConfirm: async () => {},
  });

  // Load known years on mount
  useEffect(() => {
    const years = FinanceStorageService.getKnownYears();
    setAvailableYears(years);
  }, []);

  // Listen for Firebase Auth state
  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setIsSessionExpiredModalOpen(false);
        setDriveStatus((prev) => ({
          ...prev,
          isSignedIn: true,
          isSessionExpired: false,
          userEmail: user.email,
          userName: user.displayName || user.email?.split('@')[0] || 'User',
          userPhoto: user.photoURL,
          error: null,
        }));
        // Fetch existing Drive folder & files
        try {
          setDriveStatus((prev) => ({
            ...prev,
            isSyncing: true,
            syncMessage: `Checking /${CAPITALFLOW_DRIVE_FOLDER_NAME}/ folder in Google Drive...`,
          }));
          const { folder, files, cleanedDuplicatesCount } = await FinanceStorageService.organizeFilesIntoFolder(token);
          setDriveFiles(files);

          // Auto-restore from Google Drive if local storage currently holds untouched default starter data
          const localBudgetNow = FinanceStorageService.loadLocalBudget(currentYear);
          const localLedgerNow = FinanceStorageService.loadLocalSavingsLedger();
          const localTemplateNow = FinanceStorageService.loadLocalTemplateData(localBudgetNow);
          let restoredAny = false;

          const existingBudgetFile = files.find((f) => f.name === getBudgetFileName(currentYear));
          if (existingBudgetFile && isDefaultStarterBudget(localBudgetNow)) {
            const driveBudgetRes = await FinanceStorageService.fetchBudgetFromDrive(token, currentYear);
            if (driveBudgetRes && !isDefaultStarterBudget(driveBudgetRes.budget)) {
              const syncedDriveBudget: YearBudgetData = {
                ...driveBudgetRes.budget,
                isPersonalizedTemplate: Boolean(driveBudgetRes.budget.isPersonalizedTemplate ?? true),
                isDefaultStarterData: false,
              };
              FinanceStorageService.saveLocalBudget(syncedDriveBudget, { preserveTimestamp: true });
              setBudget(syncedDriveBudget);
              setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedDriveBudget));
              restoredAny = true;
            }
          }

          const existingTemplateFile = files.find((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);
          if (existingTemplateFile && isDefaultStarterTemplateData(localTemplateNow)) {
            const driveTemplateRes = await FinanceStorageService.fetchTemplateFromDrive(token);
            if (driveTemplateRes && !isDefaultStarterTemplateData(driveTemplateRes.template)) {
              const latestBudgetAfterPull = FinanceStorageService.loadLocalBudget(currentYear);
              const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
                driveTemplateRes.template,
                latestBudgetAfterPull
              );
              setBudget(updatedBudget);
              setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
              restoredAny = true;
            }
          }

          const existingLedgerFile = files.find((f) => f.name === SAVINGS_LEDGER_FILE_NAME);
          if (existingLedgerFile && isDefaultStarterLedger(localLedgerNow)) {
            const driveLedgerRes = await FinanceStorageService.fetchLedgerFromDrive(token);
            if (driveLedgerRes && !isDefaultStarterLedger(driveLedgerRes.ledger)) {
              const syncedLedger: SavingsLedgerData = {
                ...driveLedgerRes.ledger,
                isDefaultStarterData: false,
              };
              FinanceStorageService.saveLocalSavingsLedger(syncedLedger, { preserveTimestamp: true });
              setLedger(syncedLedger);
              restoredAny = true;
            }
          }

          setDriveStatus((prev) => ({
            ...prev,
            isSyncing: false,
            syncMessage: null,
            folderId: folder ? folder.id : prev.folderId,
            folderName: folder ? folder.name : prev.folderName,
          }));
          if (restoredAny) {
            setHasUnsavedChanges(false);
            showToast('Automatically restored your saved data from Google Drive!', 'success');
          } else if (cleanedDuplicatesCount > 0) {
            showToast(`Consolidated ${cleanedDuplicatesCount} duplicate folder${cleanedDuplicatesCount > 1 ? 's' : ''} in Google Drive.`, 'info');
          }
          const years = FinanceStorageService.getKnownYears();
          setAvailableYears(years);
        } catch (e: any) {
          setDriveStatus((prev) => ({ ...prev, isSyncing: false, syncMessage: null }));
          if (isSessionExpiredError(e)) {
            handleSessionExpired();
          } else {
            console.warn('Could not auto-fetch files on auth init:', e);
          }
        }
      },
      () => {
        const hasFirebaseUser = Boolean(auth?.currentUser);
        setDriveStatus((prev) => ({
          ...prev,
          isSignedIn: false,
          isSessionExpired: hasFirebaseUser,
          error: hasFirebaseUser ? 'Google Drive session expired. Please sign in again.' : null,
          userEmail: hasFirebaseUser ? auth?.currentUser?.email || prev.userEmail : null,
          userName: hasFirebaseUser ? auth?.currentUser?.displayName || prev.userName : null,
          userPhoto: hasFirebaseUser ? auth?.currentUser?.photoURL || prev.userPhoto : null,
        }));
      }
    );

    return () => unsubscribe();
  }, [handleSessionExpired]);

  // Proactively check session expiration (every 3 minutes and when window regains focus)
  useEffect(() => {
    if (!driveStatus.isSignedIn) return;

    const checkLiveness = async () => {
      if (isDriveTokenExpired()) {
        handleSessionExpired('Google Drive access token expired (1-hour limit). Please log in again.');
        return;
      }
      const token = await getAccessToken();
      if (!token) {
        handleSessionExpired('Google Drive session has expired.');
        return;
      }
      const isValid = await validateDriveToken(token);
      if (!isValid) {
        handleSessionExpired('Google Drive authorization expired or was revoked.');
      }
    };

    const onFocus = () => {
      checkLiveness();
    };

    window.addEventListener('focus', onFocus);
    const interval = setInterval(checkLiveness, 3 * 60 * 1000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [driveStatus.isSignedIn, handleSessionExpired]);

  // Google Sign-In handler with local overwrite protection & conflict check
  const handleSignInWithGoogle = async () => {
    try {
      setDriveStatus((prev) => ({
        ...prev,
        isSyncing: true,
        syncMessage: 'Authenticating with Google Drive...',
        error: null,
      }));
      const result = await googleSignIn();
      if (!result) {
        setDriveStatus((prev) => ({ ...prev, isSyncing: false, syncMessage: null }));
        return;
      }

      setIsSessionExpiredModalOpen(false);

      setDriveStatus((prev) => ({
        ...prev,
        isSignedIn: true,
        isSessionExpired: false,
        userEmail: result.user.email,
        userName: result.user.displayName || result.user.email?.split('@')[0] || 'User',
        userPhoto: result.user.photoURL,
        isSyncing: true,
        syncMessage: `Scanning /${CAPITALFLOW_DRIVE_FOLDER_NAME}/ folder in Google Drive...`,
        error: null,
      }));

      // Ensure dedicated folder exists and scan Google Drive for existing files
      const { folder, files } = await FinanceStorageService.organizeFilesIntoFolder(result.accessToken);
      setDriveFiles(files);
      setDriveStatus((prev) => ({
        ...prev,
        folderId: folder.id,
        folderName: folder.name,
        syncMessage: 'Comparing local data with Google Drive files...',
      }));

      const conflictItems: DriveConflictDetail[] = [];
      let currentLocalBudget = FinanceStorageService.loadLocalBudget(currentYear);
      let currentLocalLedger = FinanceStorageService.loadLocalSavingsLedger();
      let currentLocalTemplate = FinanceStorageService.loadLocalTemplateData(currentLocalBudget);
      let autoRestoredCount = 0;

      // 1. Check if there is an existing annual file in Drive for currentYear
      const existingBudgetFile = files.find((f) => f.name === getBudgetFileName(currentYear));
      if (existingBudgetFile) {
        const driveBudgetRes = await FinanceStorageService.fetchBudgetFromDrive(result.accessToken, currentYear);
        if (driveBudgetRes) {
          // If local is untouched default starter data, automatically restore the user's real Drive budget!
          if (isDefaultStarterBudget(currentLocalBudget) && !isDefaultStarterBudget(driveBudgetRes.budget)) {
            const syncedDriveBudget: YearBudgetData = {
              ...driveBudgetRes.budget,
              isPersonalizedTemplate: Boolean(driveBudgetRes.budget.isPersonalizedTemplate ?? true),
              isDefaultStarterData: false,
            };
            FinanceStorageService.saveLocalBudget(syncedDriveBudget, { preserveTimestamp: true });
            currentLocalBudget = syncedDriveBudget;
            setBudget(syncedDriveBudget);
            currentLocalTemplate = FinanceStorageService.loadLocalTemplateData(syncedDriveBudget);
            setTemplateData(currentLocalTemplate);
            autoRestoredCount++;
          } else {
            const timestampStatus = FinanceStorageService.compareTimestamps(
              currentLocalBudget.lastUpdated,
              driveBudgetRes.budget.lastUpdated || driveBudgetRes.file.modifiedTime
            );

            const isIdentical =
              JSON.stringify(currentLocalBudget.entries) === JSON.stringify(driveBudgetRes.budget.entries);

            if (!isIdentical) {
              conflictItems.push({
                id: 'budget',
                title: `${currentYear} Annual Budget`,
                fileName: getBudgetFileName(currentYear),
                status: timestampStatus === 'local_newer' ? 'local_newer' : 'drive_newer',
                localTimestamp: currentLocalBudget.lastUpdated,
                driveTimestamp: driveBudgetRes.budget.lastUpdated || driveBudgetRes.file.modifiedTime,
                localStats: {
                  count: currentLocalBudget.entries.length,
                  countLabel: 'entries',
                  detail: `₱${currentLocalBudget.entries.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()} recorded`,
                },
                driveStats: {
                  count: driveBudgetRes.budget.entries.length,
                  countLabel: 'entries',
                  fileSize: driveBudgetRes.file.size ? `${Math.round(parseInt(driveBudgetRes.file.size, 10) / 1024)} KB` : undefined,
                },
                onKeepLocal: () => {
                  showToast(`Kept local ${currentYear} budget (Drive copy was not loaded).`, 'info');
                  setConflictModalState((prev) => ({
                    ...prev,
                    items: prev.items.filter((i) => i.id !== 'budget'),
                    isOpen: prev.items.filter((i) => i.id !== 'budget').length > 0,
                  }));
                },
                onOverwriteWithDrive: () => {
                  const syncedDriveBudget: YearBudgetData = {
                    ...driveBudgetRes.budget,
                    isPersonalizedTemplate: Boolean(driveBudgetRes.budget.isPersonalizedTemplate ?? true),
                    isDefaultStarterData: false,
                  };
                  FinanceStorageService.saveLocalBudget(syncedDriveBudget, { preserveTimestamp: true });
                  setBudget(syncedDriveBudget);
                  setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedDriveBudget));
                  setHasUnsavedChanges(false);
                  showToast(`Loaded ${currentYear} budget from Google Drive.`, 'success');
                  setConflictModalState((prev) => ({
                    ...prev,
                    items: prev.items.filter((i) => i.id !== 'budget'),
                    isOpen: prev.items.filter((i) => i.id !== 'budget').length > 0,
                  }));
                },
                onPushToDrive: async () => {
                  try {
                    setDriveStatus((p) => ({
                      ...p,
                      isSyncing: true,
                      syncMessage: `Uploading ${currentYear} Annual Budget to Google Drive...`,
                    }));
                    await FinanceStorageService.syncBudgetToDrive(result.accessToken, currentLocalBudget, existingBudgetFile?.id);
                    const updatedFiles = await FinanceStorageService.fetchDriveFiles(result.accessToken);
                    setDriveFiles(updatedFiles);
                    setDriveStatus((p) => ({
                      ...p,
                      isSyncing: false,
                      syncMessage: null,
                      lastSyncedAt: new Date().toLocaleTimeString(),
                    }));
                    showToast(`Uploaded local ${currentYear} budget to Google Drive!`, 'success');
                    setConflictModalState((prev) => ({
                      ...prev,
                      items: prev.items.filter((i) => i.id !== 'budget'),
                      isOpen: prev.items.filter((i) => i.id !== 'budget').length > 0,
                    }));
                  } catch (err: any) {
                    setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                    showToast(`Upload failed: ${err.message}`, 'error');
                  }
                },
              });
            }
          }
        }
      }

      // 2. Check if there is an existing standalone Estimate Budget Template file in Drive
      const existingTemplateFile = files.find((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);
      if (existingTemplateFile) {
        const driveTemplateRes = await FinanceStorageService.fetchTemplateFromDrive(result.accessToken);
        if (driveTemplateRes) {
          if (isDefaultStarterTemplateData(currentLocalTemplate) && !isDefaultStarterTemplateData(driveTemplateRes.template)) {
            const latestLocalBudget = FinanceStorageService.loadLocalBudget(currentYear);
            const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
              driveTemplateRes.template,
              latestLocalBudget
            );
            currentLocalBudget = updatedBudget;
            setBudget(updatedBudget);
            currentLocalTemplate = FinanceStorageService.loadLocalTemplateData(updatedBudget);
            setTemplateData(currentLocalTemplate);
            autoRestoredCount++;
          } else {
            const timestampStatus = FinanceStorageService.compareTimestamps(
              currentLocalTemplate.lastUpdated,
              driveTemplateRes.template.lastUpdated || driveTemplateRes.file.modifiedTime
            );

            const isIdentical =
              JSON.stringify(currentLocalTemplate.itemTemplates || []) ===
                JSON.stringify(driveTemplateRes.template.itemTemplates || []) &&
              JSON.stringify(currentLocalTemplate.customCategories || {}) ===
                JSON.stringify(driveTemplateRes.template.customCategories || {});

            if (!isIdentical) {
              const localCatCount =
                (currentLocalTemplate.customCategories?.expense?.length || 0) +
                (currentLocalTemplate.customCategories?.income?.length || 0) +
                (currentLocalTemplate.customCategories?.saving?.length || 0);
              const driveCatCount =
                (driveTemplateRes.template.customCategories?.expense?.length || 0) +
                (driveTemplateRes.template.customCategories?.income?.length || 0) +
                (driveTemplateRes.template.customCategories?.saving?.length || 0);

              conflictItems.push({
                id: 'template',
                title: 'Estimate Budget & Categories Template',
                fileName: BUDGET_TEMPLATE_FILE_NAME,
                status: timestampStatus === 'local_newer' ? 'local_newer' : 'drive_newer',
                localTimestamp: currentLocalTemplate.lastUpdated,
                driveTimestamp: driveTemplateRes.template.lastUpdated || driveTemplateRes.file.modifiedTime,
                localStats: {
                  count: currentLocalTemplate.itemTemplates.length,
                  countLabel: 'estimate items',
                  detail: `${localCatCount} categories`,
                },
                driveStats: {
                  count: driveTemplateRes.template.itemTemplates.length,
                  countLabel: `estimate items · ${driveCatCount} categories`,
                  fileSize: driveTemplateRes.file.size ? `${Math.round(parseInt(driveTemplateRes.file.size, 10) / 1024)} KB` : undefined,
                },
                onKeepLocal: () => {
                  showToast('Kept local Estimate Budget Template (Drive copy was not loaded).', 'info');
                  setConflictModalState((prev) => ({
                    ...prev,
                    items: prev.items.filter((i) => i.id !== 'template'),
                    isOpen: prev.items.filter((i) => i.id !== 'template').length > 0,
                  }));
                },
                onOverwriteWithDrive: () => {
                  const latestLocalBudget = FinanceStorageService.loadLocalBudget(currentYear);
                  const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
                    driveTemplateRes.template,
                    latestLocalBudget
                  );
                  setBudget(updatedBudget);
                  setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
                  showToast('Loaded personalized Estimate Budget Template from Google Drive.', 'success');
                  setConflictModalState((prev) => ({
                    ...prev,
                    items: prev.items.filter((i) => i.id !== 'template'),
                    isOpen: prev.items.filter((i) => i.id !== 'template').length > 0,
                  }));
                },
                onPushToDrive: async () => {
                  try {
                    setDriveStatus((p) => ({
                      ...p,
                      isSyncing: true,
                      syncMessage: 'Uploading Estimate Budget Template to Google Drive...',
                    }));
                    await FinanceStorageService.syncTemplateToDrive(
                      result.accessToken,
                      currentLocalTemplate,
                      existingTemplateFile?.id
                    );
                    const updatedFiles = await FinanceStorageService.fetchDriveFiles(result.accessToken);
                    setDriveFiles(updatedFiles);
                    setDriveStatus((p) => ({
                      ...p,
                      isSyncing: false,
                      syncMessage: null,
                      lastSyncedAt: new Date().toLocaleTimeString(),
                    }));
                    showToast('Uploaded local Estimate Budget Template to Google Drive!', 'success');
                    setConflictModalState((prev) => ({
                      ...prev,
                      items: prev.items.filter((i) => i.id !== 'template'),
                      isOpen: prev.items.filter((i) => i.id !== 'template').length > 0,
                    }));
                  } catch (err: any) {
                    setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                    showToast(`Upload failed: ${err.message}`, 'error');
                  }
                },
              });
            }
          }
        }
      }

      // 3. Check if there is an existing savings ledger in Drive
      const existingLedgerFile = files.find((f) => f.name === SAVINGS_LEDGER_FILE_NAME);
      if (existingLedgerFile) {
        const driveLedgerRes = await FinanceStorageService.fetchLedgerFromDrive(result.accessToken);
        if (driveLedgerRes) {
          if (isDefaultStarterLedger(currentLocalLedger) && !isDefaultStarterLedger(driveLedgerRes.ledger)) {
            const syncedLedger: SavingsLedgerData = {
              ...driveLedgerRes.ledger,
              isDefaultStarterData: false,
            };
            FinanceStorageService.saveLocalSavingsLedger(syncedLedger, { preserveTimestamp: true });
            currentLocalLedger = syncedLedger;
            setLedger(syncedLedger);
            autoRestoredCount++;
          } else {
            const timestampStatus = FinanceStorageService.compareTimestamps(
              currentLocalLedger.lastUpdated,
              driveLedgerRes.ledger.lastUpdated || driveLedgerRes.file.modifiedTime
            );

            const isIdentical =
              JSON.stringify(currentLocalLedger.transactions) === JSON.stringify(driveLedgerRes.ledger.transactions) &&
              JSON.stringify(currentLocalLedger.loans || []) === JSON.stringify(driveLedgerRes.ledger.loans || []) &&
              JSON.stringify(currentLocalLedger.accounts || []) === JSON.stringify(driveLedgerRes.ledger.accounts || []) &&
              currentLocalLedger.initialCapital === driveLedgerRes.ledger.initialCapital;

            if (!isIdentical) {
              conflictItems.push({
                id: 'ledger',
                title: 'Funds & Capital Ledger',
                fileName: SAVINGS_LEDGER_FILE_NAME,
                status: timestampStatus === 'local_newer' ? 'local_newer' : 'drive_newer',
                localTimestamp: currentLocalLedger.lastUpdated,
                driveTimestamp: driveLedgerRes.ledger.lastUpdated || driveLedgerRes.file.modifiedTime,
                localStats: {
                  count: currentLocalLedger.transactions.length,
                  countLabel: 'transactions',
                  detail: `${currentLocalLedger.accounts.length} accounts · ${(currentLocalLedger.loans || []).length} loans`,
                },
                driveStats: {
                  count: driveLedgerRes.ledger.transactions.length,
                  countLabel: `transactions · ${(driveLedgerRes.ledger.loans || []).length} loans`,
                  fileSize: driveLedgerRes.file.size ? `${Math.round(parseInt(driveLedgerRes.file.size, 10) / 1024)} KB` : undefined,
                },
                onKeepLocal: () => {
                  showToast('Kept local funds ledger (Drive copy was not loaded).', 'info');
                  setConflictModalState((prev) => ({
                    ...prev,
                    items: prev.items.filter((i) => i.id !== 'ledger'),
                    isOpen: prev.items.filter((i) => i.id !== 'ledger').length > 0,
                  }));
                },
                onOverwriteWithDrive: () => {
                  const syncedLedger: SavingsLedgerData = {
                    ...driveLedgerRes.ledger,
                    isDefaultStarterData: false,
                  };
                  FinanceStorageService.saveLocalSavingsLedger(syncedLedger, { preserveTimestamp: true });
                  setLedger(syncedLedger);
                  setHasUnsavedChanges(false);
                  showToast('Loaded funds ledger from Google Drive.', 'success');
                  setConflictModalState((prev) => ({
                    ...prev,
                    items: prev.items.filter((i) => i.id !== 'ledger'),
                    isOpen: prev.items.filter((i) => i.id !== 'ledger').length > 0,
                  }));
                },
                onPushToDrive: async () => {
                  try {
                    setDriveStatus((p) => ({
                      ...p,
                      isSyncing: true,
                      syncMessage: 'Uploading Funds & Capital Ledger to Google Drive...',
                    }));
                    await FinanceStorageService.syncLedgerToDrive(result.accessToken, currentLocalLedger, existingLedgerFile?.id);
                    const updatedFiles = await FinanceStorageService.fetchDriveFiles(result.accessToken);
                    setDriveFiles(updatedFiles);
                    setDriveStatus((p) => ({
                      ...p,
                      isSyncing: false,
                      syncMessage: null,
                      lastSyncedAt: new Date().toLocaleTimeString(),
                    }));
                    showToast('Uploaded local funds ledger to Google Drive!', 'success');
                    setConflictModalState((prev) => ({
                      ...prev,
                      items: prev.items.filter((i) => i.id !== 'ledger'),
                      isOpen: prev.items.filter((i) => i.id !== 'ledger').length > 0,
                    }));
                  } catch (err: any) {
                    setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                    showToast(`Upload failed: ${err.message}`, 'error');
                  }
                },
              });
            }
          }
        }
      }

      setDriveStatus((prev) => ({ ...prev, isSyncing: false, syncMessage: null }));

      if (autoRestoredCount > 0) {
        setHasUnsavedChanges(false);
      }

      // If there are differences between non-default local data and Google Drive, open the conflict resolution modal
      if (conflictItems.length > 0) {
        setConflictModalState({ isOpen: true, items: conflictItems });
      } else if (autoRestoredCount > 0) {
        showToast(`Connected to Google Drive and restored your saved financial files!`, 'success');
      } else {
        showToast(`Connected to Google Drive as ${result.user.email}`);
      }
    } catch (err: any) {
      if (
        err?.code === 'auth/user-cancelled' ||
        err?.code === 'auth/popup-closed-by-user' ||
        err?.code === 'auth/cancelled-popup-request'
      ) {
        setDriveStatus((prev) => ({ ...prev, isSyncing: false, syncMessage: null }));
        return;
      }
      console.warn('Sign in note:', err);
      setDriveStatus((prev) => ({
        ...prev,
        isSyncing: false,
        syncMessage: null,
        error: err.message || 'Google sign-in was aborted',
      }));
      showToast(err.message || 'Failed to authenticate with Google', 'error');
    }
  };

  const handleKeepAllLocal = () => {
    setConflictModalState({ isOpen: false, items: [] });
    showToast('Preserved all local changes on this device.', 'info');
  };

  const handlePushAllLocalToDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again to sync your files.');
      return;
    }
    try {
      setDriveStatus((p) => ({
        ...p,
        isSyncing: true,
        syncMessage: `Uploading ${currentYear} Annual Budget (1/3) to Google Drive...`,
      }));
      const currentLocalBudget = FinanceStorageService.loadLocalBudget(currentYear);
      const currentLocalLedger = FinanceStorageService.loadLocalSavingsLedger();
      const currentLocalTemplate = FinanceStorageService.loadLocalTemplateData(currentLocalBudget);
      const budgetRes = await FinanceStorageService.syncBudgetToDrive(token, currentLocalBudget);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Uploading Estimate Budget Template (2/3) to Google Drive...',
      }));
      const templateRes = await FinanceStorageService.syncTemplateToDrive(token, currentLocalTemplate);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Uploading Funds & Capital Ledger (3/3) to Google Drive...',
      }));
      const ledgerRes = await FinanceStorageService.syncLedgerToDrive(token, currentLocalLedger);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Refreshing Google Drive folder index...',
      }));
      const files = await FinanceStorageService.fetchDriveFiles(token);
      setDriveFiles(files);
      setDriveStatus((p) => ({
        ...p,
        isSyncing: false,
        syncMessage: null,
        lastSyncedAt: new Date().toLocaleTimeString(),
        budgetFileId: budgetRes.fileId,
        templateFileId: templateRes.fileId,
        savingsFileId: ledgerRes.fileId,
        folderId: budgetRes.folderId || templateRes.folderId || ledgerRes.folderId || p.folderId,
      }));
      setHasUnsavedChanges(false);
      setConflictModalState({ isOpen: false, items: [] });
      showToast(`Uploaded latest local budget, template, and ledger to "${CAPITALFLOW_DRIVE_FOLDER_NAME}" in Google Drive!`, 'success');
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive session expired while uploading. Please sign in again.');
        return;
      }
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
      showToast(`Upload failed: ${err.message}`, 'error');
    }
  };

  const handleOverwriteAllWithDrive = () => {
    conflictModalState.items.forEach((item) => item.onOverwriteWithDrive());
    setConflictModalState({ isOpen: false, items: [] });
  };

  const handleSignOut = async () => {
    await logout();
    FinanceStorageService.clearDriveFolderCache();
    setDriveStatus((prev) => ({
      ...prev,
      isSignedIn: false,
      userEmail: null,
      userName: null,
      userPhoto: null,
      folderId: null,
    }));
    showToast('Signed out of Google Drive', 'info');
  };

  // Switch year safely without overwriting newer local edits
  const handleSelectYear = async (year: number) => {
    setCurrentYear(year);
    const loadedBudget = FinanceStorageService.loadLocalBudget(year);
    setBudget(loadedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(loadedBudget));

    // If signed into Google Drive, verify version safely
    const token = await getAccessToken();
    if (token) {
      try {
        setDriveStatus((p) => ({
          ...p,
          isSyncing: true,
          syncMessage: `Checking Google Drive for ${year} budget...`,
        }));
        const driveRes = await FinanceStorageService.fetchBudgetFromDrive(token, year);
        setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
        if (driveRes) {
          const timestampStatus = FinanceStorageService.compareTimestamps(
            loadedBudget.lastUpdated,
            driveRes.budget.lastUpdated || driveRes.file.modifiedTime
          );

          const isIdentical =
            JSON.stringify(loadedBudget.entries) === JSON.stringify(driveRes.budget.entries) &&
            JSON.stringify(loadedBudget.itemTemplates || []) === JSON.stringify(driveRes.budget.itemTemplates || []) &&
            JSON.stringify(loadedBudget.customCategories || {}) === JSON.stringify(driveRes.budget.customCategories || {});

          if (isIdentical) {
            return;
          }

          if (timestampStatus === 'local_newer' && loadedBudget.entries.length > 0) {
            // Local is newer: DO NOT overwrite!
            showToast(`Opened ${year} budget (Local version is newer than Drive and was kept).`, 'info');
          } else if (loadedBudget.entries.length === 0 && driveRes.budget.entries.length > 0) {
            // Local is empty, Drive has data: confirm before restoring
            setConfirmationModal({
              isOpen: true,
              title: `Restore ${year} Budget from Google Drive?`,
              description: `Found a Google Drive cloud backup for ${year} with ${driveRes.budget.entries.length} entries. Would you like to load it into your local storage?`,
              affectedItems: [getBudgetFileName(year)],
              confirmLabel: 'Load from Google Drive',
              onConfirm: async () => {
                const syncedBudget = { ...driveRes.budget, isDefaultStarterData: false };
                FinanceStorageService.saveLocalBudget(syncedBudget, { preserveTimestamp: true });
                FinanceStorageService.registerKnownYear(year);
                setAvailableYears(FinanceStorageService.getKnownYears());
                setBudget(syncedBudget);
                setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedBudget));
                setHasUnsavedChanges(false);
                showToast(`Loaded ${year} budget from Google Drive`, 'success');
                setConfirmationModal((m) => ({ ...m, isOpen: false }));
              },
            });
          } else {
            // Drive has differences: prompt before overwriting local!
            setConfirmationModal({
              isOpen: true,
              title: `Google Drive Version Available for ${year}`,
              description: `Google Drive has a cloud version of ${year} budget (${driveRes.budget.entries.length} entries). Overwrite your current local data?`,
              affectedItems: [getBudgetFileName(year)],
              confirmLabel: 'Overwrite Local with Drive',
              isDestructive: true,
              onConfirm: async () => {
                const syncedBudget = { ...driveRes.budget, isDefaultStarterData: false };
                FinanceStorageService.saveLocalBudget(syncedBudget, { preserveTimestamp: true });
                FinanceStorageService.registerKnownYear(year);
                setAvailableYears(FinanceStorageService.getKnownYears());
                setBudget(syncedBudget);
                setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedBudget));
                setHasUnsavedChanges(false);
                showToast(`Loaded ${year} budget from Google Drive`, 'success');
                setConfirmationModal((m) => ({ ...m, isOpen: false }));
              },
            });
          }
        }
      } catch (err) {
        setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
        console.warn('Could not check year from Drive:', err);
      }
    }
  };

  // Open Create New Year Modal
  const handleAddNewYear = () => {
    const nextDefaultYear = Math.max(...availableYears, new Date().getFullYear()) + 1;
    setNewYearInput(String(nextDefaultYear));
    setCopyTemplatesToNewYear(true);
    setIsNewYearModalOpen(true);
  };

  const handleConfirmCreateNewYear = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedYear = parseInt(newYearInput.trim(), 10);
    if (isNaN(parsedYear) || parsedYear < 2000 || parsedYear > 2100) {
      showToast('Please enter a valid 4-digit year between 2000 and 2100.', 'error');
      return;
    }

    FinanceStorageService.registerKnownYear(parsedYear);
    const loadedNewYear = FinanceStorageService.loadLocalBudget(parsedYear);

    if (copyTemplatesToNewYear && loadedNewYear.entries.length === 0) {
      const seededBudget: YearBudgetData = {
        ...loadedNewYear,
        customCategories: budget.customCategories
          ? JSON.parse(JSON.stringify(budget.customCategories))
          : loadedNewYear.customCategories,
        itemTemplates: budget.itemTemplates
          ? JSON.parse(JSON.stringify(budget.itemTemplates))
          : loadedNewYear.itemTemplates,
        lastUpdated: new Date().toISOString(),
      };
      FinanceStorageService.saveLocalBudget(seededBudget);
    }

    setAvailableYears(FinanceStorageService.getKnownYears());
    setIsNewYearModalOpen(false);
    handleSelectYear(parsedYear);
    setHasUnsavedChanges(true);
    showToast(`Initialized database for year ${parsedYear}`);
  };

  // Add Budget Entry
  const handleAddBudgetEntry = (entryData: Omit<BudgetEntry, 'id' | 'createdAt'>) => {
    const syncedAmount = entryData.actualCost ?? entryData.amount ?? 0;
    const newEntry: BudgetEntry = {
      ...entryData,
      amount: syncedAmount,
      actualCost: entryData.actualCost ?? syncedAmount,
      id: `entry-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      createdAt: new Date().toISOString(),
    };

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: [newEntry, ...budget.entries],
    };

    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setHasUnsavedChanges(true);

    // If paid saving entry with positive amount: accumulate in the separate Savings Ledger!
    if (newEntry.type === 'saving' && newEntry.status !== 'Pending' && newEntry.amount > 0) {
      const updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(newEntry, false);
      setLedger({ ...updatedLedger });
      showToast(`Savings accumulated: +₱${newEntry.amount} transferred to ${newEntry.savingAccountName || 'Savings Ledger'}`);
    } else if (newEntry.type === 'saving') {
      showToast(`Recorded pending funds entry: ₱${newEntry.estimatedCost || newEntry.amount}`);
    } else {
      const loanSync = FinanceStorageService.syncBudgetLoanPaymentToLedger(newEntry, false);
      if (loanSync.matchedLoan) {
        setLedger({ ...loanSync.ledger });
        showToast(`Recorded ${newEntry.type}: ₱${newEntry.amount} (Synced to loan "${loanSync.matchedLoan.name}")`);
      } else {
        showToast(`Recorded ${newEntry.type}: ₱${newEntry.amount}`);
      }
    }
  };

  // Update Budget Entry
  const handleUpdateBudgetEntry = (entryId: string, updated: Partial<BudgetEntry>) => {
    const oldEntry = budget.entries.find((e) => e.id === entryId);
    const updatedEntries = budget.entries.map((e) => {
      if (e.id === entryId) {
        const merged = { ...e, ...updated };
        if (updated.actualCost !== undefined && updated.amount === undefined) {
          merged.amount = updated.actualCost;
        } else if (updated.amount !== undefined && updated.actualCost === undefined) {
          merged.actualCost = updated.amount;
        }
        return merged;
      }
      return e;
    });

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
    };

    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setHasUnsavedChanges(true);

    const target = updatedEntries.find((e) => e.id === entryId);
    if (oldEntry?.type === 'saving' && target && target.type !== 'saving') {
      const rolledBackLedger = FinanceStorageService.accumulateBudgetSavingToLedger(oldEntry, true);
      setLedger({ ...rolledBackLedger });
    } else if (target?.type === 'saving') {
      const updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(target, false);
      setLedger({ ...updatedLedger });
    }

    if (target) {
      const loanSync = FinanceStorageService.syncBudgetLoanPaymentToLedger(target, false);
      if (loanSync.matchedLoan) {
        setLedger({ ...loanSync.ledger });
      }
    }

    showToast(`Updated entry: ${target?.item || target?.description || 'Item'}`);
  };

  // Delete Budget Entry (with confirmation)
  const handleDeleteBudgetEntry = (entryId: string) => {
    const entry = budget.entries.find((e) => e.id === entryId);
    if (!entry) return;

    const currSym = budget.currency || '₱';
    const entryAmt = entry.actualCost ?? entry.amount ?? 0;
    const typeLabel = entry.type === 'saving' ? 'Funds' : entry.type === 'income' ? 'Income' : 'Expense';

    setConfirmationModal({
      isOpen: true,
      title: `Delete ${typeLabel} Entry?`,
      description:
        entry.type === 'saving'
          ? `Are you sure you want to delete this Funds entry? The corresponding amount will also be rolled back from your Funds ledger.`
          : `Are you sure you want to delete this recorded ${typeLabel.toLowerCase()} entry from ${entry.period} (${entry.year})?`,
      affectedItems: [
        `${entry.item || entry.description} (${entry.category}) — ${currSym}${entryAmt.toLocaleString()}`,
      ],
      confirmLabel: 'Yes, Delete Entry',
      isDestructive: true,
      onConfirm: async () => {
        const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
        const updatedEntries = currentBudget.entries.filter((e) => e.id !== entryId);
        const updatedBudget: YearBudgetData = {
          ...currentBudget,
          entries: updatedEntries,
        };

        setBudget(updatedBudget);
        FinanceStorageService.saveLocalBudget(updatedBudget);
        setHasUnsavedChanges(true);

        // If it was a saving entry, roll back from Savings Ledger
        if (entry.type === 'saving') {
          const updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(entry, true);
          setLedger(updatedLedger);
          showToast(`Removed Funds entry and updated Funds ledger`);
        } else {
          const loanSync = FinanceStorageService.syncBudgetLoanPaymentToLedger(entry, true);
          if (loanSync.matchedLoan) {
            setLedger({ ...loanSync.ledger });
            showToast(`Deleted entry and rolled back loan payment on "${loanSync.matchedLoan.name}"`);
          } else {
            showToast(`Deleted ${entry.type} entry`);
          }
        }
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
      },
    });
  };

  // Helper to recalculate runningTotalCapital across all ledger transactions chronologically
  const recalculateLedgerRunningCapital = (targetLedger: SavingsLedgerData) => {
    let runningTotal = targetLedger.initialCapital || 0;
    const sorted = [...targetLedger.transactions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    sorted.forEach((tx) => {
      if (tx.source === 'withdrawal') {
        runningTotal = Math.max(0, runningTotal - tx.amount);
      } else if (tx.source === 'transfer' || tx.source === 'reallocation') {
        // Internal transfer between accounts or virtual category reallocation does not change total net capital
      } else {
        runningTotal += tx.amount;
      }
      tx.runningTotalCapital = runningTotal;
    });
    targetLedger.transactions = sorted;
  };

  // Add direct ledger transaction (yield, deposit, withdrawal, transfer, reallocation)
  const handleAddLedgerTransaction = (txData: Omit<SavingsTransaction, 'id' | 'runningTotalCapital'>) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const newTx: SavingsTransaction = {
      ...txData,
      id: `tx-manual-${Date.now()}`,
    };

    currentLedger.transactions.push(newTx);
    const currSym = currentLedger.currency || '₱';

    if (txData.source === 'withdrawal') {
      const acc = currentLedger.accounts.find((a) => a.id === txData.accountId);
      if (acc) {
        acc.balance = Math.max(0, acc.balance - txData.amount);
      }
      recalculateLedgerRunningCapital(currentLedger);
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
      setLedger({ ...currentLedger });
      setHasUnsavedChanges(true);
      showToast(`Recorded withdrawal of ${currSym}${txData.amount.toLocaleString()} from ${acc?.name || 'account'}`);
    } else if (txData.source === 'transfer') {
      const fromAcc = currentLedger.accounts.find((a) => a.id === txData.accountId);
      const toAcc = currentLedger.accounts.find((a) => a.id === txData.toAccountId);
      if (fromAcc) {
        fromAcc.balance = Math.max(0, fromAcc.balance - txData.amount);
      }
      if (toAcc) {
        toAcc.balance += txData.amount;
      }
      recalculateLedgerRunningCapital(currentLedger);
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
      setLedger({ ...currentLedger });
      setHasUnsavedChanges(true);
      showToast(
        `Transferred ${currSym}${txData.amount.toLocaleString()} from ${fromAcc?.name || 'account'} to ${toAcc?.name || 'account'}`
      );
    } else if (txData.source === 'reallocation') {
      // Virtual category reallocation: physical account balances and total net capital remain unchanged
      recalculateLedgerRunningCapital(currentLedger);
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
      setLedger({ ...currentLedger });
      setHasUnsavedChanges(true);
      showToast(
        `Reallocated ${currSym}${txData.amount.toLocaleString()} from ${txData.category || 'Reserves'} to ${txData.toCategory || 'Category Fund'}`
      );
    } else {
      const acc = currentLedger.accounts.find((a) => a.id === txData.accountId);
      if (acc) {
        acc.balance += txData.amount;
      }
      recalculateLedgerRunningCapital(currentLedger);
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
      setLedger({ ...currentLedger });
      setHasUnsavedChanges(true);
      showToast(
        `Recorded ${txData.source === 'interest_yield' ? 'interest payout' : 'deposit'} of ${currSym}${txData.amount.toLocaleString()} to ${acc?.name || 'account'}`
      );
    }
  };

  // Helper to reverse or apply a transaction's balance effect on accounts
  const applyTxBalanceEffect = (
    accounts: SavingsAccount[],
    tx: SavingsTransaction,
    reverse: boolean
  ) => {
    const sign = reverse ? -1 : 1;
    if (tx.source === 'withdrawal') {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) acc.balance = Math.max(0, acc.balance - sign * tx.amount);
    } else if (tx.source === 'transfer') {
      const fromAcc = accounts.find((a) => a.id === tx.accountId);
      const toAcc = accounts.find((a) => a.id === tx.toAccountId);
      if (fromAcc) fromAcc.balance = Math.max(0, fromAcc.balance - sign * tx.amount);
      if (toAcc) toAcc.balance = Math.max(0, toAcc.balance + sign * tx.amount);
    } else if (tx.source === 'reallocation') {
      // Category reallocation only shifts virtual envelope allocations; physical account balances remain unchanged
      return;
    } else {
      const acc = accounts.find((a) => a.id === tx.accountId);
      if (acc) acc.balance = Math.max(0, acc.balance + sign * tx.amount);
    }
  };

  // Update direct ledger transaction
  const handleUpdateLedgerTransaction = (txId: string, updated: Partial<SavingsTransaction>) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const txIndex = currentLedger.transactions.findIndex((t) => t.id === txId);
    if (txIndex === -1) return;

    const oldTx = currentLedger.transactions[txIndex];
    // Reverse old balance effect
    applyTxBalanceEffect(currentLedger.accounts, oldTx, true);

    const newTx: SavingsTransaction = {
      ...oldTx,
      ...updated,
    };
    currentLedger.transactions[txIndex] = newTx;

    // Apply new balance effect
    applyTxBalanceEffect(currentLedger.accounts, newTx, false);
    recalculateLedgerRunningCapital(currentLedger);

    // If this transaction is linked to a Budget Sheet saving entry, keep the budget entry synchronized
    if (newTx.budgetEntryId) {
      const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
      let budgetChanged = false;
      currentBudget.entries = currentBudget.entries.map((e) => {
        if (e.id === newTx.budgetEntryId) {
          budgetChanged = true;
          return {
            ...e,
            amount: newTx.amount,
            actualCost: newTx.amount,
            date: newTx.date,
            savingAccountId: newTx.accountId,
            savingAccountName: newTx.accountName,
          };
        }
        return e;
      });
      if (budgetChanged) {
        FinanceStorageService.saveLocalBudget(currentBudget);
        setBudget({ ...currentBudget });
      }
    }

    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast('Updated Funds ledger transaction');
  };

  // Delete direct ledger transaction (with confirmation)
  const handleDeleteLedgerTransaction = (txId: string) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const oldTx = currentLedger.transactions.find((t) => t.id === txId);
    if (!oldTx) return;

    const currSym = currentLedger.currency || '₱';

    setConfirmationModal({
      isOpen: true,
      title: 'Delete Funds Transaction?',
      description:
        'Are you sure you want to delete this transaction from your Funds ledger? The associated account balance will be automatically reversed.',
      affectedItems: [
        `${oldTx.note} (${oldTx.accountName}) — ${currSym}${oldTx.amount.toLocaleString()}`,
      ],
      confirmLabel: 'Yes, Delete Transaction',
      isDestructive: true,
      onConfirm: async () => {
        const latestLedger = FinanceStorageService.loadLocalSavingsLedger();
        const targetTx = latestLedger.transactions.find((t) => t.id === txId);
        if (targetTx) {
          applyTxBalanceEffect(latestLedger.accounts, targetTx, true);
          latestLedger.transactions = latestLedger.transactions.filter((t) => t.id !== txId);

          // Unlink any loan payment that referenced this ledger transaction
          if (Array.isArray(latestLedger.loans)) {
            latestLedger.loans.forEach((ln) => {
              (ln.payments || []).forEach((p) => {
                if (p.ledgerTransactionId === txId) {
                  delete p.ledgerTransactionId;
                  delete p.accountId;
                }
              });
            });
          }

          // If linked to a budget saving entry, remove that saving entry from the budget sheet as well
          if (targetTx.budgetEntryId) {
            const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
            const filteredEntries = currentBudget.entries.filter((e) => e.id !== targetTx.budgetEntryId);
            if (filteredEntries.length !== currentBudget.entries.length) {
              const updatedBudget: YearBudgetData = {
                ...currentBudget,
                entries: filteredEntries,
              };
              FinanceStorageService.saveLocalBudget(updatedBudget);
              setBudget(updatedBudget);
            }
          }

          recalculateLedgerRunningCapital(latestLedger);
          FinanceStorageService.saveLocalSavingsLedger(latestLedger);
          setLedger({ ...latestLedger });
          setHasUnsavedChanges(true);
          showToast('Deleted transaction from Funds ledger');
        }
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
      },
    });
  };

  // Add new account to savings ledger
  const handleAddSavingsAccount = (accountData: Omit<SavingsAccount, 'id'>) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const newAccount: SavingsAccount = {
      ...accountData,
      id: `acc-${Date.now()}`,
    };

    currentLedger.accounts.push(newAccount);
    if (newAccount.balance > 0) {
      currentLedger.initialCapital = Math.max(0, (currentLedger.initialCapital || 0) + newAccount.balance);
      recalculateLedgerRunningCapital(currentLedger);
    }
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast(`Added account "${newAccount.name}"`);
  };

  // Update/Rename account in savings ledger
  const handleUpdateSavingsAccount = (accountId: string, updates: Partial<SavingsAccount>) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const accIndex = currentLedger.accounts.findIndex((a) => a.id === accountId);
    if (accIndex === -1) return;

    const oldName = currentLedger.accounts[accIndex].name;
    const oldBalance = currentLedger.accounts[accIndex].balance || 0;
    const newName = updates.name?.trim() || oldName;

    currentLedger.accounts[accIndex] = {
      ...currentLedger.accounts[accIndex],
      ...updates,
      name: newName,
    };

    // If balance was manually adjusted, keep initialCapital and runningTotalCapital synchronized
    if (updates.balance !== undefined && updates.balance !== oldBalance) {
      const balanceDelta = updates.balance - oldBalance;
      currentLedger.initialCapital = Math.max(0, (currentLedger.initialCapital || 0) + balanceDelta);
      recalculateLedgerRunningCapital(currentLedger);
    }

    // If name changed, update transaction accountName for consistency
    if (updates.name && updates.name.trim() !== oldName) {
      currentLedger.transactions.forEach((tx) => {
        if (tx.accountId === accountId) {
          tx.accountName = newName;
        }
        if (tx.toAccountId === accountId) {
          tx.toAccountName = newName;
        }
      });

      // Also update in current budget entries if savingAccountId matches
      const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
      let budgetUpdated = false;
      currentBudget.entries.forEach((e) => {
        if (e.savingAccountId === accountId) {
          e.savingAccountName = newName;
          budgetUpdated = true;
        }
      });
      if (budgetUpdated) {
        FinanceStorageService.saveLocalBudget(currentBudget);
        setBudget({ ...currentBudget });
      }
    }

    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast(`Updated account "${newName}"`);
  };

  // Delete account from savings ledger
  const handleDeleteSavingsAccount = (accountId: string, reassignToAccountId?: string) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    if (currentLedger.accounts.length <= 1) {
      showToast('Cannot delete the last remaining savings account');
      return;
    }

    const deletingAcc = currentLedger.accounts.find((a) => a.id === accountId);
    if (!deletingAcc) return;

    const targetAcc = reassignToAccountId
      ? currentLedger.accounts.find((a) => a.id === reassignToAccountId)
      : currentLedger.accounts.find((a) => a.id !== accountId);

    // Reassign transactions if target account is found
    if (targetAcc) {
      currentLedger.transactions.forEach((tx) => {
        if (tx.accountId === accountId) {
          tx.accountId = targetAcc.id;
          tx.accountName = targetAcc.name;
        }
        if (tx.toAccountId === accountId) {
          tx.toAccountId = targetAcc.id;
          tx.toAccountName = targetAcc.name;
        }
      });
      // Transfer balance
      targetAcc.balance += deletingAcc.balance;
    }

    // Also update budget entries pointing to this account
    const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
    let budgetUpdated = false;
    currentBudget.entries.forEach((e) => {
      if (e.savingAccountId === accountId) {
        if (targetAcc) {
          e.savingAccountId = targetAcc.id;
          e.savingAccountName = targetAcc.name;
        } else {
          delete e.savingAccountId;
          delete e.savingAccountName;
        }
        budgetUpdated = true;
      }
    });
    if (budgetUpdated) {
      FinanceStorageService.saveLocalBudget(currentBudget);
      setBudget({ ...currentBudget });
    }

    // Remove account
    currentLedger.accounts = currentLedger.accounts.filter((a) => a.id !== accountId);
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast(`Deleted account "${deletingAcc.name}"${targetAcc ? ` (transferred to ${targetAcc.name})` : ''}`);
  };

  // Update Custom Categories (and propagate category renames if applicable)
  const handleUpdateCategories = (
    customCats: {
      expense: string[];
      income: string[];
      saving: string[];
    },
    renamed?: { type: EntryType; oldName: string; newName: string }
  ) => {
    const updatedEntries = renamed
      ? budget.entries.map((e) =>
          e.type === renamed.type && e.category === renamed.oldName
            ? { ...e, category: renamed.newName }
            : e
        )
      : budget.entries;

    const updatedTemplates =
      renamed && budget.itemTemplates
        ? budget.itemTemplates.map((t) =>
            t.type === renamed.type && t.category === renamed.oldName
              ? { ...t, category: renamed.newName }
              : t
          )
        : budget.itemTemplates;

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
      itemTemplates: updatedTemplates,
      customCategories: customCats,
      isPersonalizedTemplate: Boolean(updatedTemplates && updatedTemplates.length > 0),
      lastUpdated: new Date().toISOString(),
    };
    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));

    // Propagate saving category rename to Savings Ledger transactions if applicable
    if (renamed && renamed.type === 'saving') {
      const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
      let ledgerUpdated = false;
      currentLedger.transactions.forEach((tx) => {
        if (tx.category === renamed.oldName) {
          tx.category = renamed.newName;
          ledgerUpdated = true;
        }
        if (tx.toCategory === renamed.oldName) {
          tx.toCategory = renamed.newName;
          ledgerUpdated = true;
        }
      });
      if (ledgerUpdated) {
        FinanceStorageService.saveLocalSavingsLedger(currentLedger);
        setLedger({ ...currentLedger });
      }
    }

    setHasUnsavedChanges(true);
    showToast(
      renamed
        ? `Renamed category "${renamed.oldName}" to "${renamed.newName}"`
        : 'Personalized categories saved (Sync to Drive to back up)'
    );
  };

  // Update Item Templates / Estimated Budgets
  const handleUpdateTemplates = (templates: BudgetItemTemplate[]) => {
    const updatedBudget: YearBudgetData = {
      ...budget,
      itemTemplates: templates,
      isPersonalizedTemplate: templates.length > 0,
      lastUpdated: new Date().toISOString(),
    };
    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    setHasUnsavedChanges(true);
    showToast(
      templates.length > 0
        ? 'Personalized estimated budget template saved (Sync to Drive to back up)'
        : 'Started from a blank template'
    );
  };

  // Rename, merge, or update planned monthly target & saving category for a Sinking Fund
  const handleRenameOrMergeFund = (
    oldFundName: string,
    newFundName: string,
    newMonthlyTarget?: number,
    newSavingCategory?: string
  ) => {
    const oldClean = oldFundName.trim();
    const newClean = newFundName.trim();
    if (!oldClean || !newClean) return;
    const oldLower = oldClean.toLowerCase();
    const newLower = newClean.toLowerCase();
    const resolvedCategory = normalizeSavingCategoryGroup(newClean, newSavingCategory);

    // 1. Update Ledger Transactions
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    let ledgerChanged = false;
    currentLedger.transactions = currentLedger.transactions
      .map((tx) => {
        const updated = { ...tx };
        if ((tx.category || '').trim().toLowerCase() === oldLower) {
          updated.category = newClean;
          ledgerChanged = true;
        }
        if ((tx.toCategory || '').trim().toLowerCase() === oldLower) {
          updated.toCategory = newClean;
          ledgerChanged = true;
        }
        const cleanNote = tx.note
          .replace(/^(Budget Sync|Manual Deposit|Direct Deposit|Withdrawal|Yield):\s*/i, '')
          .trim();
        if (cleanNote.toLowerCase() === oldLower) {
          updated.note = tx.note.replace(new RegExp(oldClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), newClean);
          ledgerChanged = true;
        }
        return updated;
      })
      .filter((tx) => {
        if (
          tx.source === 'reallocation' &&
          (tx.category || '').trim().toLowerCase() === (tx.toCategory || '').trim().toLowerCase()
        ) {
          ledgerChanged = true;
          return false;
        }
        return true;
      });

    if (ledgerChanged) {
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
      setLedger({ ...currentLedger });
    }

    // 2. Update Budget Saving Entries & Saving Item Templates
    const currentTemplates = [...(budget.itemTemplates || [])];
    let matchedSavingTemplate = false;
    const deduplicatedTemplates: BudgetItemTemplate[] = [];

    currentTemplates.forEach((tpl) => {
      if (
        tpl.type === 'saving' &&
        (tpl.item.trim().toLowerCase() === oldLower || tpl.item.trim().toLowerCase() === newLower)
      ) {
        if (!matchedSavingTemplate) {
          matchedSavingTemplate = true;
          deduplicatedTemplates.push({
            ...tpl,
            item: newClean,
            category: newSavingCategory
              ? resolvedCategory
              : normalizeSavingCategoryGroup(newClean, tpl.category),
            defaultEstimatedCost:
              newMonthlyTarget !== undefined ? newMonthlyTarget : tpl.defaultEstimatedCost,
          });
        } else if (newMonthlyTarget === undefined && tpl.defaultEstimatedCost > 0) {
          const existingIdx = deduplicatedTemplates.findIndex(
            (d) => d.type === 'saving' && d.item.trim().toLowerCase() === newLower
          );
          if (existingIdx >= 0 && deduplicatedTemplates[existingIdx].defaultEstimatedCost === 0) {
            deduplicatedTemplates[existingIdx].defaultEstimatedCost = tpl.defaultEstimatedCost;
          }
        }
      } else {
        deduplicatedTemplates.push(tpl);
      }
    });

    if (!matchedSavingTemplate && ((newMonthlyTarget !== undefined && newMonthlyTarget > 0) || newSavingCategory)) {
      deduplicatedTemplates.push({
        id: `tpl-sav-${Date.now()}`,
        type: 'saving',
        category: resolvedCategory,
        item: newClean,
        defaultEstimatedCost: newMonthlyTarget || 0,
        frequency: 'monthly',
        biweeklyPeriod: 'both',
        defaultPaymentMethod: 'Bank Transfer',
      });
    }

    const updatedEntries = budget.entries.map((e) => {
      if (
        e.type === 'saving' &&
        ((e.item || '').trim().toLowerCase() === oldLower ||
          (e.description || '').trim().toLowerCase() === oldLower)
      ) {
        return {
          ...e,
          item: newClean,
          description: newClean,
          category: newSavingCategory ? resolvedCategory : e.category,
        };
      }
      return e;
    });

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
      itemTemplates: deduplicatedTemplates,
      isPersonalizedTemplate: deduplicatedTemplates.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    setHasUnsavedChanges(true);
    showToast(
      oldLower !== newLower
        ? `Merged / renamed fund "${oldClean}" into "${newClean}"`
        : `Updated sinking fund "${newClean}"`
    );
  };

  // Delete a Sinking Fund and optionally reassign its balance to another fund or General Reserves
  const handleDeleteFund = (fundName: string, reassignToFund?: string) => {
    const targetLower = fundName.trim().toLowerCase();
    if (!targetLower) return;

    const destination = (reassignToFund || 'General Reserves / Starting Capital').trim();
    const isDestUnallocated = destination.toLowerCase() === 'general reserves / starting capital';

    // 1. Update Ledger Transactions
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    let ledgerChanged = false;

    currentLedger.transactions = currentLedger.transactions
      .map((tx) => {
        const catLower = (tx.category || '').trim().toLowerCase();
        const toCatLower = (tx.toCategory || '').trim().toLowerCase();
        if (catLower === targetLower || toCatLower === targetLower) {
          ledgerChanged = true;
          const updated = { ...tx };
          if (catLower === targetLower) {
            updated.category = destination;
          }
          if (toCatLower === targetLower) {
            updated.toCategory = destination;
          }
          return updated;
        }
        return tx;
      })
      .filter((tx) => {
        if (
          tx.source === 'reallocation' &&
          (tx.category || '').trim().toLowerCase() === (tx.toCategory || '').trim().toLowerCase()
        ) {
          ledgerChanged = true;
          return false;
        }
        return true;
      });

    if (ledgerChanged) {
      FinanceStorageService.saveLocalSavingsLedger(currentLedger);
      setLedger({ ...currentLedger });
    }

    // 2. Remove from Budget Saving Templates
    const filteredTemplates = (budget.itemTemplates || []).filter(
      (tpl) => !(tpl.type === 'saving' && tpl.item.trim().toLowerCase() === targetLower)
    );

    const updatedEntries = budget.entries.map((e) => {
      if (
        e.type === 'saving' &&
        ((e.item || '').trim().toLowerCase() === targetLower ||
          (e.description || '').trim().toLowerCase() === targetLower)
      ) {
        return { ...e, item: destination, description: destination };
      }
      return e;
    });

    const updatedSavingCats = (budget.customCategories?.saving || []).filter(
      (c) => c.trim().toLowerCase() !== targetLower
    );

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
      itemTemplates: filteredTemplates,
      customCategories: budget.customCategories
        ? {
            ...budget.customCategories,
            saving: updatedSavingCats,
          }
        : undefined,
      isPersonalizedTemplate: filteredTemplates.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    setHasUnsavedChanges(true);
    showToast(
      isDestUnallocated
        ? `Removed fund "${fundName}" (balance returned to Unallocated Cash)`
        : `Removed fund "${fundName}" (merged into "${destination}")`
    );
  };

  // Add multiple entries (e.g. pre-populate period from estimated budgets or Excel import)
  const handleAddMultipleBudgetEntries = (
    entriesData: Omit<BudgetEntry, 'id' | 'createdAt'>[],
    options?: { replacePeriod?: string; customExpenseCategories?: string[] }
  ) => {
    const newEntries: BudgetEntry[] = entriesData.map((e, idx) => ({
      ...e,
      id: `entry-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    }));

    // If replacing an existing period, roll back any previous saving & loan entries from that period in the ledger first
    const removedPeriodEntries = options?.replacePeriod
      ? budget.entries.filter((e) => e.period === options.replacePeriod)
      : [];
    const removedPeriodSavings = removedPeriodEntries.filter((e) => e.type === 'saving');

    const baseEntries = options?.replacePeriod
      ? budget.entries.filter((e) => e.period !== options.replacePeriod)
      : budget.entries;

    const currentCustomCats = budget.customCategories || {
      expense: [],
      income: [],
      saving: [],
    };
    const mergedExpenseCats = options?.customExpenseCategories?.length
      ? Array.from(new Set([...currentCustomCats.expense, ...options.customExpenseCategories]))
      : currentCustomCats.expense;

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: [...newEntries, ...baseEntries],
      customCategories: {
        ...currentCustomCats,
        expense: mergedExpenseCats,
      },
      lastUpdated: new Date().toISOString(),
    };

    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);

    // Sync any saving & loan entries to ledger (rolling back replaced period entries first)
    let updatedLedger = ledger;
    removedPeriodSavings.forEach((oldSaving) => {
      updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(oldSaving, true);
    });
    removedPeriodEntries.forEach((oldEntry) => {
      if (oldEntry.type !== 'saving') {
        const res = FinanceStorageService.syncBudgetLoanPaymentToLedger(oldEntry, true);
        updatedLedger = res.ledger;
      }
    });
    newEntries.forEach((entry) => {
      if (entry.type === 'saving' && entry.status !== 'Pending' && (entry.actualCost ?? entry.amount ?? 0) > 0) {
        updatedLedger = FinanceStorageService.accumulateBudgetSavingToLedger(entry, false);
      } else if (entry.type !== 'saving') {
        const res = FinanceStorageService.syncBudgetLoanPaymentToLedger(entry, false);
        updatedLedger = res.ledger;
      }
    });
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    showToast(
      options?.replacePeriod
        ? `Migrated ${newEntries.length} actual entries into ${options.replacePeriod} (${budget.year})`
        : `Added ${newEntries.length} items to period`
    );
  };

  // --- LOANS & RECEIVABLES HANDLERS ---

  const syncLoanToBudgetTemplateHelper = (
    loan: LoanRecord,
    currentBudget: YearBudgetData
  ): { updatedBudget: YearBudgetData; templateId: string } => {
    const templates = [...(currentBudget.itemTemplates || [])];
    const targetType: EntryType = loan.direction === 'borrowed' ? 'expense' : 'income';
    const targetCat = loan.direction === 'borrowed' ? 'Loans' : 'Other Income';

    const existingIdx = templates.findIndex(
      (t) =>
        (loan.linkedTemplateId && t.id === loan.linkedTemplateId) ||
        (t.loanId && t.loanId === loan.id) ||
        (t.type === targetType && t.item.trim().toLowerCase() === loan.name.trim().toLowerCase())
    );

    const templateId = existingIdx >= 0 ? templates[existingIdx].id : `tpl-loan-${loan.id}`;
    const tplPayload: BudgetItemTemplate = {
      id: templateId,
      type: targetType,
      category: existingIdx >= 0 ? templates[existingIdx].category : targetCat,
      item: loan.name,
      defaultEstimatedCost: loan.installmentAmount,
      frequency: loan.frequency,
      biweeklyPeriod: loan.biweeklyPeriod || 'both',
      defaultPaymentMethod: existingIdx >= 0 ? templates[existingIdx].defaultPaymentMethod : 'Bank Transfer',
      loanId: loan.id,
    };

    if (existingIdx >= 0) {
      templates[existingIdx] = tplPayload;
    } else {
      templates.push(tplPayload);
    }

    const customCats = currentBudget.customCategories
      ? {
          expense: [...currentBudget.customCategories.expense],
          income: [...currentBudget.customCategories.income],
          saving: [...currentBudget.customCategories.saving],
        }
      : { expense: ['Loans'], income: ['Other Income'], saving: [] };

    if (targetType === 'expense' && !customCats.expense.includes('Loans')) {
      customCats.expense.push('Loans');
    }

    const updatedBudget: YearBudgetData = {
      ...currentBudget,
      itemTemplates: templates,
      customCategories: customCats,
      isPersonalizedTemplate: templates.length > 0,
      lastUpdated: new Date().toISOString(),
    };

    FinanceStorageService.saveLocalBudget(updatedBudget);
    return { updatedBudget, templateId };
  };

  const handleSaveLoan = (
    loan: LoanRecord,
    options?: {
      syncToTemplate?: boolean;
      disburseFromAccountId?: string;
    }
  ) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = [...(currentLedger.loans || [])];
    const existingIdx = loans.findIndex((l) => l.id === loan.id);

    let updatedLoan = { ...loan };

    const hasMatchingTemplateInBudget = (budget.itemTemplates || []).some(
      (t) => t.loanId === updatedLoan.id || (updatedLoan.linkedTemplateId && t.id === updatedLoan.linkedTemplateId)
    );

    if (options?.syncToTemplate || updatedLoan.linkedTemplateId || hasMatchingTemplateInBudget) {
      const { updatedBudget, templateId } = syncLoanToBudgetTemplateHelper(updatedLoan, budget);
      updatedLoan.linkedTemplateId = templateId;
      setBudget(updatedBudget);
      setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    }

    if (existingIdx >= 0) {
      loans[existingIdx] = updatedLoan;
    } else {
      loans.unshift(updatedLoan);
    }

    // Optional: If lending money out and user selected an account to disburse from, deduct the principal
    let disbursedAccountName: string | undefined;
    let disbursedAmount = 0;
    if (existingIdx === -1 && options?.disburseFromAccountId && updatedLoan.direction === 'lent') {
      const targetAcc = currentLedger.accounts.find((a) => a.id === options.disburseFromAccountId);
      disbursedAmount = updatedLoan.principalAmount || updatedLoan.totalContractAmount;
      if (targetAcc && disbursedAmount > 0) {
        targetAcc.balance = Math.max(0, targetAcc.balance - disbursedAmount);
        disbursedAccountName = targetAcc.name;

        const dateParts = (updatedLoan.startDate || '').split('-').map((n) => parseInt(n, 10));
        const parsedYear =
          dateParts.length === 3 && !isNaN(dateParts[0]) ? dateParts[0] : budget.year;
        const parsedMonthIdx =
          dateParts.length === 3 && !isNaN(dateParts[1]) ? Math.max(0, Math.min(11, dateParts[1] - 1)) : new Date().getMonth();
        const monthName = MONTH_NAMES[parsedMonthIdx] || 'Jan';
        const dayOfMonth = dateParts.length === 3 && !isNaN(dateParts[2]) ? dateParts[2] : new Date().getDate();
        const resolvedPeriod =
          frequency === 'bi-weekly'
            ? `${monthName}-${dayOfMonth <= 15 ? 'P1' : 'P2'}`
            : monthName;

        currentLedger.transactions.push({
          id: `tx-disburse-${Date.now()}`,
          date: updatedLoan.startDate || new Date().toISOString().split('T')[0],
          year: parsedYear,
          period: resolvedPeriod,
          amount: disbursedAmount,
          accountId: targetAcc.id,
          accountName: targetAcc.name,
          source: 'withdrawal',
          category: 'General Reserves / Starting Capital',
          note: `Disbursed Lent Loan: ${updatedLoan.name}${updatedLoan.counterparty ? ` to ${updatedLoan.counterparty}` : ''}`,
        });
        recalculateLedgerRunningCapital(currentLedger);
      }
    }

    currentLedger.loans = loans;
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    const currSym = currentLedger.currency || '₱';
    showToast(
      existingIdx >= 0
        ? `Updated loan "${updatedLoan.name}"`
        : `Added ${updatedLoan.direction === 'borrowed' ? 'borrowed loan' : 'receivable'} "${updatedLoan.name}"${
            disbursedAccountName ? ` (${currSym}${disbursedAmount.toLocaleString()} deducted from ${disbursedAccountName})` : ''
          }`
    );
  };

  const handleDeleteLoan = (loanId: string) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const target = (currentLedger.loans || []).find((l) => l.id === loanId);
    if (!target) return;

    const currSym = currentLedger.currency || '₱';

    setConfirmationModal({
      isOpen: true,
      title: `Delete ${target.direction === 'borrowed' ? 'Loan' : 'Receivable'} Contract?`,
      description: `Are you sure you want to remove "${target.name}" from your Loans ledger? Existing Budget Sheet entries will remain untouched.`,
      affectedItems: [
        `${target.name} (${target.category}) — ${currSym}${target.totalContractAmount.toLocaleString()}`,
      ],
      confirmLabel: 'Yes, Delete Loan',
      isDestructive: true,
      onConfirm: async () => {
        const latestLedger = FinanceStorageService.loadLocalSavingsLedger();
        latestLedger.loans = (latestLedger.loans || []).filter((l) => l.id !== loanId);
        FinanceStorageService.saveLocalSavingsLedger(latestLedger);
        setLedger({ ...latestLedger });

        // Also remove any auto-linked recurring template item so deleted loans don't remain as virtual rows on the Budget Sheet
        const currentTemplates = budget.itemTemplates || [];
        const filteredTemplates = currentTemplates.filter(
          (t) => t.loanId !== loanId && (!target.linkedTemplateId || t.id !== target.linkedTemplateId)
        );
        if (filteredTemplates.length !== currentTemplates.length) {
          const updatedBudget: YearBudgetData = {
            ...budget,
            itemTemplates: filteredTemplates,
            isPersonalizedTemplate: true,
          };
          FinanceStorageService.saveLocalBudget(updatedBudget);
          setBudget(updatedBudget);
          setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
        }

        setHasUnsavedChanges(true);
        showToast(`Removed loan "${target.name}"`);
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
      },
    });
  };

  const handleRecordLoanPayment = (
    loanId: string,
    paymentData: {
      amount: number;
      date: string;
      note: string;
      recordInBudget?: boolean;
      depositToAccountId?: string;
    }
  ) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = [...(currentLedger.loans || [])];
    const loanIdx = loans.findIndex((l) => l.id === loanId);
    if (loanIdx === -1) return;

    const loan = { ...loans[loanIdx], payments: [...(loans[loanIdx].payments || [])] };
    // Parse YYYY-MM-DD in local time without UTC-midnight shift
    const dateParts = (paymentData.date || '').split('-').map((n) => parseInt(n, 10));
    const parsedMonthIdx =
      dateParts.length === 3 && !isNaN(dateParts[1]) ? Math.max(0, Math.min(11, dateParts[1] - 1)) : new Date().getMonth();
    const dayOfMonth =
      dateParts.length === 3 && !isNaN(dateParts[2]) ? dateParts[2] : new Date().getDate();
    const monthName = MONTH_NAMES[parsedMonthIdx] || 'Oct';
    const resolvedPeriod =
      frequency === 'bi-weekly'
        ? `${monthName}-${dayOfMonth <= 15 ? 'P1' : 'P2'}`
        : monthName;
    const resolvedPeriodIdx =
      frequency === 'bi-weekly'
        ? Math.max(0, BIWEEKLY_PERIODS.findIndex((p) => p.id === resolvedPeriod))
        : parsedMonthIdx;

    let linkedBudgetEntryId: string | undefined;

    if (paymentData.recordInBudget) {
      const entryId = `entry-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      linkedBudgetEntryId = entryId;
      const newBudgetEntry: BudgetEntry = {
        id: entryId,
        year: budget.year,
        period: resolvedPeriod,
        periodIndex: resolvedPeriodIdx,
        date: paymentData.date,
        type: loan.direction === 'borrowed' ? 'expense' : 'income',
        category: loan.direction === 'borrowed' ? 'Loans' : 'Other Income',
        item: loan.name,
        description: paymentData.note || loan.name,
        amount: paymentData.amount,
        estimatedCost: loan.installmentAmount || paymentData.amount,
        actualCost: paymentData.amount,
        status: 'Paid',
        paymentMethod: 'Bank Transfer',
        loanId: loan.id,
        createdAt: new Date().toISOString(),
      };

      const updatedBudget: YearBudgetData = {
        ...budget,
        entries: [newBudgetEntry, ...budget.entries],
        lastUpdated: new Date().toISOString(),
      };
      setBudget(updatedBudget);
      FinanceStorageService.saveLocalBudget(updatedBudget);
    }

    let linkedLedgerTxId: string | undefined;
    if (paymentData.depositToAccountId) {
      const targetAcc = currentLedger.accounts.find((a) => a.id === paymentData.depositToAccountId);
      if (targetAcc) {
        linkedLedgerTxId = `tx-loan-${Date.now()}`;
        targetAcc.balance += paymentData.amount;
        currentLedger.transactions.push({
          id: linkedLedgerTxId,
          date: paymentData.date,
          year: budget.year,
          period: resolvedPeriod,
          amount: paymentData.amount,
          accountId: targetAcc.id,
          accountName: targetAcc.name,
          source: 'manual_deposit',
          category: 'General Reserves / Starting Capital',
          note: `Loan Repayment Collected: ${loan.name}`,
        });
      }
    }

    const newPayment: LoanPayment = {
      id: `lpay-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      loanId: loan.id,
      date: paymentData.date,
      year: budget.year,
      period: resolvedPeriod,
      amount: paymentData.amount,
      source: linkedBudgetEntryId ? 'budget_sync' : 'manual_payment',
      budgetEntryId: linkedBudgetEntryId,
      accountId: paymentData.depositToAccountId,
      ledgerTransactionId: linkedLedgerTxId,
      note: paymentData.note,
    };

    loan.payments.push(newPayment);
    const totalPaid =
      (loan.initialPaidAmount || 0) + loan.payments.reduce((s, p) => s + (p.amount || 0), 0);
    loan.status =
      loan.totalContractAmount > 0 && totalPaid + 0.005 >= loan.totalContractAmount ? 'completed' : 'active';
    loan.updatedAt = new Date().toISOString();

    loans[loanIdx] = loan;
    currentLedger.loans = loans;
    recalculateLedgerRunningCapital(currentLedger);
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast(
      `Recorded ₱${paymentData.amount.toLocaleString()} for "${loan.name}"${
        linkedBudgetEntryId ? ` & logged in ${resolvedPeriod} Budget Sheet` : ''
      }`
    );
  };

  const handleDeleteLoanPayment = (loanId: string, paymentId: string) => {
    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    const loans = [...(currentLedger.loans || [])];
    const loanIdx = loans.findIndex((l) => l.id === loanId);
    if (loanIdx === -1) return;

    const loan = { ...loans[loanIdx], payments: [...(loans[loanIdx].payments || [])] };
    const targetPay = loan.payments.find((p) => p.id === paymentId);
    if (!targetPay) return;

    // 1. If this payment deposited money into a savings account, reverse the account balance and remove its ledger transaction
    if (targetPay.ledgerTransactionId) {
      const linkedTx = currentLedger.transactions.find((t) => t.id === targetPay.ledgerTransactionId);
      if (linkedTx) {
        applyTxBalanceEffect(currentLedger.accounts, linkedTx, true);
        currentLedger.transactions = currentLedger.transactions.filter((t) => t.id !== targetPay.ledgerTransactionId);
      } else if (targetPay.accountId) {
        const acc = currentLedger.accounts.find((a) => a.id === targetPay.accountId);
        if (acc) {
          acc.balance = Math.max(0, acc.balance - targetPay.amount);
        }
      }
    } else if (targetPay.accountId) {
      const acc = currentLedger.accounts.find((a) => a.id === targetPay.accountId);
      if (acc) {
        acc.balance = Math.max(0, acc.balance - targetPay.amount);
      }
    }

    // 2. If this payment was synced with a Budget Sheet entry, remove that Budget Sheet entry as well
    if (targetPay.budgetEntryId) {
      const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
      const updatedEntries = currentBudget.entries.filter((e) => e.id !== targetPay.budgetEntryId);
      if (updatedEntries.length !== currentBudget.entries.length) {
        const updatedBudget: YearBudgetData = {
          ...currentBudget,
          entries: updatedEntries,
        };
        FinanceStorageService.saveLocalBudget(updatedBudget);
        setBudget(updatedBudget);
      }
    }

    loan.payments = loan.payments.filter((p) => p.id !== paymentId);
    const totalPaid =
      (loan.initialPaidAmount || 0) + loan.payments.reduce((s, p) => s + (p.amount || 0), 0);
    loan.status =
      loan.totalContractAmount > 0 && totalPaid + 0.005 >= loan.totalContractAmount ? 'completed' : 'active';
    loan.updatedAt = new Date().toISOString();

    loans[loanIdx] = loan;
    currentLedger.loans = loans;
    recalculateLedgerRunningCapital(currentLedger);
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast(`Removed payment of ₱${targetPay.amount.toLocaleString()} from "${loan.name}"`);
  };

  const handleLinkLoanToTemplate = (loan: LoanRecord) => {
    const { updatedBudget, templateId } = syncLoanToBudgetTemplateHelper(loan, budget);
    setBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));

    const currentLedger = FinanceStorageService.loadLocalSavingsLedger();
    currentLedger.loans = (currentLedger.loans || []).map((l) =>
      l.id === loan.id ? { ...l, linkedTemplateId: templateId } : l
    );
    FinanceStorageService.saveLocalSavingsLedger(currentLedger);
    setLedger({ ...currentLedger });
    setHasUnsavedChanges(true);
    showToast(`Linked "${loan.name}" to your Estimate Budget Templates!`);
  };

  // Reset / delete all local data for live production
  const handleResetDataForGoLive = () => {
    setConfirmationModal({
      isOpen: true,
      title: 'Delete All Local Data?',
      description:
        'This will permanently delete all local data stored on this browser/device — including all recorded budget entries across all years, your local Estimate Budget Template & custom categories, and all local Funds ledger transactions and balances.',
      affectedItems: [
        'All local recorded budget entries across all years (deleted)',
        'Local Estimate Budget Template & custom categories (deleted)',
        'All local savings ledger transactions & account balances (reset to ₱0)',
        'All local browser storage cache for CapitalFlow (cleared)',
      ],
      confirmLabel: 'Yes, Delete All Local Data',
      isDestructive: true,
      onConfirm: async () => {
        const { budget: cleanBudget, ledger: cleanLedger } = FinanceStorageService.resetAllDataForGoLive();
        setBudget(cleanBudget);
        setLedger(cleanLedger);
        setTemplateData(FinanceStorageService.loadLocalTemplateData(cleanBudget));
        setCurrentYear(2026);
        setAvailableYears([2026]);
        setHasUnsavedChanges(false);
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
        showToast('All local data has been deleted and reset!', 'success');
      },
    });
  };

  // Workspace-compliant Google Drive Save / Update actions
  // Pull and restore all saved files from Google Drive (used when recovering from default starter data)
  const handlePullAllSavedFromDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }
    try {
      setDriveStatus((p) => ({
        ...p,
        isSyncing: true,
        syncMessage: 'Loading your saved financial files from Google Drive...',
      }));
      const files = await FinanceStorageService.fetchDriveFiles(token);
      setDriveFiles(files);

      let restoredCount = 0;

      const existingBudgetFile = files.find((f) => f.name === getBudgetFileName(currentYear));
      if (existingBudgetFile) {
        const driveBudgetRes = await FinanceStorageService.fetchBudgetFromDrive(token, currentYear);
        if (driveBudgetRes) {
          const syncedDriveBudget: YearBudgetData = {
            ...driveBudgetRes.budget,
            isPersonalizedTemplate: Boolean(driveBudgetRes.budget.isPersonalizedTemplate ?? true),
            isDefaultStarterData: false,
          };
          FinanceStorageService.saveLocalBudget(syncedDriveBudget, { preserveTimestamp: true });
          setBudget(syncedDriveBudget);
          setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedDriveBudget));
          restoredCount++;
        }
      }

      const existingTemplateFile = files.find((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);
      if (existingTemplateFile) {
        const driveTemplateRes = await FinanceStorageService.fetchTemplateFromDrive(token);
        if (driveTemplateRes) {
          const latestBudget = FinanceStorageService.loadLocalBudget(currentYear);
          const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
            driveTemplateRes.template,
            latestBudget
          );
          setBudget(updatedBudget);
          setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
          restoredCount++;
        }
      }

      const existingLedgerFile = files.find((f) => f.name === SAVINGS_LEDGER_FILE_NAME);
      if (existingLedgerFile) {
        const driveLedgerRes = await FinanceStorageService.fetchLedgerFromDrive(token);
        if (driveLedgerRes) {
          const syncedLedger: SavingsLedgerData = {
            ...driveLedgerRes.ledger,
            isDefaultStarterData: false,
          };
          FinanceStorageService.saveLocalSavingsLedger(syncedLedger, { preserveTimestamp: true });
          setLedger(syncedLedger);
          restoredCount++;
        }
      }

      setDriveStatus((p) => ({
        ...p,
        isSyncing: false,
        syncMessage: null,
        lastSyncedAt: new Date().toLocaleTimeString(),
      }));
      setHasUnsavedChanges(false);

      if (restoredCount > 0) {
        showToast('Restored your saved financial data from Google Drive!', 'success');
      } else {
        showToast('No saved files found in Google Drive yet.', 'info');
      }
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive session expired while loading files. Please sign in again.');
        return;
      }
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
      showToast(`Failed to load from Drive: ${err.message}`, 'error');
    } finally {
      setConfirmationModal((m) => ({ ...m, isOpen: false }));
    }
  };

  const triggerSaveBudgetToDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }

    const fileName = getBudgetFileName(budget.year);
    const hasExistingCloudBudget = driveFiles.some((f) => f.name === fileName);

    // Guard: Prevent accidentally overwriting an existing Drive budget with default starter data
    if (isDefaultStarterBudget(budget) && hasExistingCloudBudget) {
      setConfirmationModal({
        isOpen: true,
        title: 'Prevent Overwriting Google Drive with Default Sample Data',
        description: `Your screen is currently showing the default starter sample budget, while your Google Drive already has a saved "${fileName}" backup. Saving now would overwrite your cloud backup with default sample data. Would you like to load your saved budget from Google Drive instead?`,
        affectedItems: [`Restore from ${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${fileName}`],
        confirmLabel: 'Load My Saved Data from Drive',
        onConfirm: handlePullAllSavedFromDrive,
      });
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: `Update Google Drive File`,
      description: `Save and synchronize the ${budget.year} budget data to the dedicated "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in your Google Drive?`,
      affectedItems: [`${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${fileName}`],
      confirmLabel: 'Save to Google Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isSyncing: true,
            syncMessage: `Uploading ${fileName} to Google Drive...`,
          }));
          const res = await FinanceStorageService.syncBudgetToDrive(token, budget);
          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Refreshing Google Drive file list...',
          }));
          const files = await FinanceStorageService.fetchDriveFiles(token);
          setDriveFiles(files);
          setDriveStatus((p) => ({
            ...p,
            isSyncing: false,
            syncMessage: null,
            lastSyncedAt: new Date().toLocaleTimeString(),
            budgetFileId: res.fileId,
            folderId: res.folderId || p.folderId,
          }));
          showToast(`Successfully saved ${fileName} inside "${CAPITALFLOW_DRIVE_FOLDER_NAME}"!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive session expired while saving budget. Please sign in again.');
            return;
          }
          setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
          showToast(`Error saving to Drive: ${err.message}`, 'error');
        } finally {
          setConfirmationModal((m) => ({ ...m, isOpen: false }));
        }
      },
    });
  };

  const triggerSaveTemplateToDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }

    const latestTemplate = FinanceStorageService.loadLocalTemplateData(budget);
    const hasExistingCloudTemplate = driveFiles.some((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);

    if (isDefaultStarterTemplateData(latestTemplate) && hasExistingCloudTemplate) {
      setConfirmationModal({
        isOpen: true,
        title: 'Prevent Overwriting Google Drive with Default Template',
        description: `Your screen is currently showing the default starter template, while your Google Drive already has a saved "${BUDGET_TEMPLATE_FILE_NAME}" backup. Would you like to load your saved template from Google Drive instead?`,
        affectedItems: [`Restore from ${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${BUDGET_TEMPLATE_FILE_NAME}`],
        confirmLabel: 'Load My Saved Data from Drive',
        onConfirm: handlePullAllSavedFromDrive,
      });
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: `Update Estimate Budget Template in Google Drive`,
      description: `Save your personalized Categories and Estimated Budget Item Templates as a separate file inside the "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in Google Drive?`,
      affectedItems: [`${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${BUDGET_TEMPLATE_FILE_NAME}`],
      confirmLabel: 'Save Template to Google Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isSyncing: true,
            syncMessage: `Uploading ${BUDGET_TEMPLATE_FILE_NAME} to Google Drive...`,
          }));
          const res = await FinanceStorageService.syncTemplateToDrive(token, latestTemplate);
          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Refreshing Google Drive file list...',
          }));
          const files = await FinanceStorageService.fetchDriveFiles(token);
          setDriveFiles(files);
          setDriveStatus((p) => ({
            ...p,
            isSyncing: false,
            syncMessage: null,
            lastSyncedAt: new Date().toLocaleTimeString(),
            templateFileId: res.fileId,
            folderId: res.folderId || p.folderId,
          }));
          showToast(`Successfully saved ${BUDGET_TEMPLATE_FILE_NAME} inside "${CAPITALFLOW_DRIVE_FOLDER_NAME}"!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive session expired while saving template. Please sign in again.');
            return;
          }
          setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
          showToast(`Error saving template: ${err.message}`, 'error');
        } finally {
          setConfirmationModal((m) => ({ ...m, isOpen: false }));
        }
      },
    });
  };

  const triggerSaveLedgerToDrive = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }

    const hasExistingCloudLedger = driveFiles.some((f) => f.name === SAVINGS_LEDGER_FILE_NAME);

    if (isDefaultStarterLedger(ledger) && hasExistingCloudLedger) {
      setConfirmationModal({
        isOpen: true,
        title: 'Prevent Overwriting Google Drive with Default Funds Ledger',
        description: `Your screen is currently showing the default starter funds ledger, while your Google Drive already has a saved "${SAVINGS_LEDGER_FILE_NAME}" backup. Would you like to load your saved funds ledger from Google Drive instead?`,
        affectedItems: [`Restore from ${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${SAVINGS_LEDGER_FILE_NAME}`],
        confirmLabel: 'Load My Saved Data from Drive',
        onConfirm: handlePullAllSavedFromDrive,
      });
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: `Update Funds Ledger in Google Drive`,
      description: `Save your multi-year capital ledger and account balances to the dedicated "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in your Google Drive?`,
      affectedItems: [`${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${SAVINGS_LEDGER_FILE_NAME}`],
      confirmLabel: 'Save Ledger to Google Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isSyncing: true,
            syncMessage: `Uploading ${SAVINGS_LEDGER_FILE_NAME} to Google Drive...`,
          }));
          const res = await FinanceStorageService.syncLedgerToDrive(token, ledger);
          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Refreshing Google Drive file list...',
          }));
          const files = await FinanceStorageService.fetchDriveFiles(token);
          setDriveFiles(files);
          setDriveStatus((p) => ({
            ...p,
            isSyncing: false,
            syncMessage: null,
            lastSyncedAt: new Date().toLocaleTimeString(),
            savingsFileId: res.fileId,
            folderId: res.folderId || p.folderId,
          }));
          showToast(`Successfully saved ${SAVINGS_LEDGER_FILE_NAME} inside "${CAPITALFLOW_DRIVE_FOLDER_NAME}"!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive session expired while saving ledger. Please sign in again.');
            return;
          }
          setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
          showToast(`Error saving ledger: ${err.message}`, 'error');
        } finally {
          setConfirmationModal((m) => ({ ...m, isOpen: false }));
        }
      },
    });
  };

  const triggerSyncAll = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }

    const budgetFileName = getBudgetFileName(budget.year);
    const hasExistingCloudFiles = driveFiles.some(
      (f) =>
        f.name === budgetFileName ||
        f.name === BUDGET_TEMPLATE_FILE_NAME ||
        f.name === SAVINGS_LEDGER_FILE_NAME
    );

    // Guard: Prevent accidentally syncing default starter data over existing Google Drive backups
    if ((isDefaultStarterBudget(budget) || isDefaultStarterLedger(ledger)) && hasExistingCloudFiles) {
      setConfirmationModal({
        isOpen: true,
        title: 'Prevent Overwriting Google Drive with Default Sample Data',
        description: `Your device is currently displaying the default starter sample data, while your Google Drive folder "${CAPITALFLOW_DRIVE_FOLDER_NAME}" already contains your saved financial files. Uploading now would replace your cloud backup with default sample data. Would you like to load your saved data from Google Drive instead?`,
        affectedItems: [
          `Restore ${budgetFileName}`,
          `Restore ${BUDGET_TEMPLATE_FILE_NAME}`,
          `Restore ${SAVINGS_LEDGER_FILE_NAME}`,
        ],
        confirmLabel: 'Load My Saved Data from Drive',
        onConfirm: handlePullAllSavedFromDrive,
      });
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: 'Sync All Financial Data to Google Drive',
      description: `You are about to synchronize your ${budget.year} annual budget, your separate Estimate Budget Template, and your permanent Funds ledger into the dedicated "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in Google Drive.`,
      affectedItems: [
        `${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${budgetFileName}`,
        `${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${BUDGET_TEMPLATE_FILE_NAME}`,
        `${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${SAVINGS_LEDGER_FILE_NAME}`,
      ],
      confirmLabel: 'Sync All Files Now',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isSyncing: true,
            syncMessage: `Syncing ${budget.year} Annual Budget (1/3) to Google Drive...`,
          }));
          const latestTemplate = FinanceStorageService.loadLocalTemplateData(budget);
          const budgetRes = await FinanceStorageService.syncBudgetToDrive(token, budget);

          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Syncing Estimate Budget Template (2/3) to Google Drive...',
          }));
          const templateRes = await FinanceStorageService.syncTemplateToDrive(token, latestTemplate);

          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Syncing Funds & Capital Ledger (3/3) to Google Drive...',
          }));
          const ledgerRes = await FinanceStorageService.syncLedgerToDrive(token, ledger);

          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Verifying files in Google Drive folder...',
          }));
          const files = await FinanceStorageService.fetchDriveFiles(token);
          setDriveFiles(files);
          setDriveStatus((p) => ({
            ...p,
            isSyncing: false,
            syncMessage: null,
            lastSyncedAt: new Date().toLocaleTimeString(),
            budgetFileId: budgetRes.fileId,
            templateFileId: templateRes.fileId,
            savingsFileId: ledgerRes.fileId,
            folderId: budgetRes.folderId || templateRes.folderId || ledgerRes.folderId || p.folderId,
          }));
          setHasUnsavedChanges(false);
          showToast(`Synced all 3 JSON database files into "${CAPITALFLOW_DRIVE_FOLDER_NAME}" in Google Drive!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive session expired while syncing. Please sign in again.');
            return;
          }
          setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
          showToast(`Sync failed: ${err.message}`, 'error');
        } finally {
          setConfirmationModal((m) => ({ ...m, isOpen: false }));
        }
      },
    });
  };

  // Direct 1-click sync without modal prompt (for floating reminder banner)
  const triggerDirectSyncAll = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }

    const budgetFileName = getBudgetFileName(budget.year);
    const hasExistingCloudFiles = driveFiles.some(
      (f) =>
        f.name === budgetFileName ||
        f.name === BUDGET_TEMPLATE_FILE_NAME ||
        f.name === SAVINGS_LEDGER_FILE_NAME
    );

    if ((isDefaultStarterBudget(budget) || isDefaultStarterLedger(ledger)) && hasExistingCloudFiles) {
      setConfirmationModal({
        isOpen: true,
        title: 'Prevent Overwriting Google Drive with Default Sample Data',
        description: `Your device is currently displaying the default starter sample data, while your Google Drive folder "${CAPITALFLOW_DRIVE_FOLDER_NAME}" already contains your saved financial files. Would you like to load your saved data from Google Drive instead?`,
        affectedItems: [
          `Restore ${budgetFileName}`,
          `Restore ${BUDGET_TEMPLATE_FILE_NAME}`,
          `Restore ${SAVINGS_LEDGER_FILE_NAME}`,
        ],
        confirmLabel: 'Load My Saved Data from Drive',
        onConfirm: handlePullAllSavedFromDrive,
      });
      return;
    }

    try {
      setDriveStatus((p) => ({
        ...p,
        isSyncing: true,
        syncMessage: `Syncing ${budget.year} Annual Budget (1/3) to Google Drive...`,
      }));
      const latestTemplate = FinanceStorageService.loadLocalTemplateData(budget);
      const budgetRes = await FinanceStorageService.syncBudgetToDrive(token, budget);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Syncing Estimate Budget Template (2/3) to Google Drive...',
      }));
      const templateRes = await FinanceStorageService.syncTemplateToDrive(token, latestTemplate);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Syncing Funds & Capital Ledger (3/3) to Google Drive...',
      }));
      const ledgerRes = await FinanceStorageService.syncLedgerToDrive(token, ledger);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Verifying files in Google Drive folder...',
      }));
      const files = await FinanceStorageService.fetchDriveFiles(token);
      setDriveFiles(files);
      setDriveStatus((p) => ({
        ...p,
        isSyncing: false,
        syncMessage: null,
        lastSyncedAt: new Date().toLocaleTimeString(),
        budgetFileId: budgetRes.fileId,
        templateFileId: templateRes.fileId,
        savingsFileId: ledgerRes.fileId,
        folderId: budgetRes.folderId || templateRes.folderId || ledgerRes.folderId || p.folderId,
      }));
      setHasUnsavedChanges(false);
      showToast(`Synced all files into "${CAPITALFLOW_DRIVE_FOLDER_NAME}" in Google Drive!`);
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive session expired while syncing. Please sign in again.');
        return;
      }
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
      showToast(`Sync failed: ${err.message}`, 'error');
    }
  };

  const triggerOrganizeDriveFolder = async () => {
    const token = await getAccessToken();
    if (!token) {
      handleSessionExpired('Google Drive session expired. Please sign in again.');
      return;
    }

    setConfirmationModal({
      isOpen: true,
      title: 'Organize & Deduplicate Google Drive Folder',
      description: `Verify the dedicated "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder, merge and clean any duplicate folders, and ensure all CapitalFlow database JSON files reside in one single folder?`,
      affectedItems: [
        `Folder: /${CAPITALFLOW_DRIVE_FOLDER_NAME}/`,
        'Duplicate folder cleanup & file consolidation',
        ...(driveFiles.length > 0 ? driveFiles.map((f) => f.name) : ['All future CapitalFlow JSON files']),
      ],
      confirmLabel: 'Organize & Clean Now',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isSyncing: true,
            syncMessage: `Organizing and deduplicating /${CAPITALFLOW_DRIVE_FOLDER_NAME}/...`,
          }));
          const { folder, movedCount, files, cleanedDuplicatesCount } = await FinanceStorageService.organizeFilesIntoFolder(token);
          setDriveFiles(files);
          setDriveStatus((p) => ({
            ...p,
            isSyncing: false,
            syncMessage: null,
            folderId: folder.id,
            folderName: folder.name,
          }));

          const messages: string[] = [];
          if (cleanedDuplicatesCount > 0) {
            messages.push(`Consolidated & cleaned up ${cleanedDuplicatesCount} duplicate folder(s)`);
          }
          if (movedCount > 0) {
            messages.push(`Moved ${movedCount} file(s) into "${folder.name}"`);
          } else {
            messages.push(`Dedicated folder "${folder.name}" is verified`);
          }
          showToast(messages.join('. ') + ' in Google Drive!', 'success');
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive session expired while organizing folder. Please sign in again.');
            return;
          }
          setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
          showToast(`Folder organization failed: ${err.message}`, 'error');
        } finally {
          setConfirmationModal((m) => ({ ...m, isOpen: false }));
        }
      },
    });
  };

  return (
    <div className="min-h-screen bg-slate-100/60 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col antialiased">
      
      {/* Clean Single Drive Sync Toast (Shown only when no modal is open) */}
      {driveStatus.isSyncing && !confirmationModal.isOpen && !conflictModalState.isOpen && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[90] animate-in slide-in-from-bottom-5 duration-200 pointer-events-none">
          <div className="px-4 py-3 rounded-2xl shadow-xl bg-slate-900 dark:bg-slate-800 border border-slate-700/80 flex items-center gap-2.5 text-xs font-semibold text-white">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
            <span>{driveStatus.syncMessage || 'Syncing with Google Drive...'}</span>
          </div>
        </div>
      )}

      {/* Floating Notification Banner: Unsaved Local Changes not yet saved to Drive (never shown for untouched default starter data) */}
      {hasUnsavedChanges &&
        !isSyncReminderDismissed &&
        !driveStatus.isSyncing &&
        !(isDefaultStarterBudget(budget) && isDefaultStarterLedger(ledger)) && (
        <div className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-6 sm:right-auto z-40 max-w-md animate-in slide-in-from-bottom-5 duration-300">
          <div className="bg-slate-900/95 dark:bg-slate-800/95 backdrop-blur-md text-white rounded-2xl p-3 sm:p-4 shadow-2xl border border-amber-500/40 flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <span>Unsaved to Drive</span>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                  </h4>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  {driveStatus.isSignedIn
                    ? 'Local edits not yet backed up to Google Drive.'
                    : 'Local edits saved on device. Sign in to back up.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {driveStatus.isSignedIn ? (
                <button
                  type="button"
                  onClick={triggerDirectSyncAll}
                  disabled={driveStatus.isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition-all cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Save to Drive</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignInWithGoogle}
                  disabled={driveStatus.isSyncing}
                  className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
                >
                  <span>Sign In &amp; Save</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsSyncReminderDismissed(true)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                title="Dismiss reminder until next edit"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-50 animate-in slide-in-from-bottom-5 duration-200">
          <div
            className={`px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold text-white ${
              toastMessage.type === 'error'
                ? 'bg-rose-600'
                : toastMessage.type === 'info'
                ? 'bg-slate-800'
                : 'bg-emerald-600'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmationModal
        isOpen={confirmationModal.isOpen}
        title={confirmationModal.title}
        description={confirmationModal.description}
        affectedItems={confirmationModal.affectedItems}
        confirmLabel={confirmationModal.confirmLabel}
        isDestructive={confirmationModal.isDestructive}
        isLoading={driveStatus.isSyncing}
        loadingMessage={driveStatus.syncMessage}
        onConfirm={confirmationModal.onConfirm}
        onCancel={() => setConfirmationModal((m) => ({ ...m, isOpen: false }))}
      />

      {/* Drive Reconnection Conflict / Overwrite Prevention Modal */}
      <DriveConflictModal
        isOpen={conflictModalState.isOpen}
        onClose={handleKeepAllLocal}
        userEmail={driveStatus.userEmail}
        items={conflictModalState.items}
        onKeepAllLocal={handleKeepAllLocal}
        onPushAllLocalToDrive={handlePushAllLocalToDrive}
        onOverwriteAllWithDrive={handleOverwriteAllWithDrive}
        isLoading={driveStatus.isSyncing}
        loadingMessage={driveStatus.syncMessage}
      />

      {/* Drive Session Expired Modal */}
      <DriveSessionExpiredModal
        isOpen={isSessionExpiredModalOpen}
        userEmail={driveStatus.userEmail}
        onSignInAgain={handleSignInWithGoogle}
        onContinueOffline={() => setIsSessionExpiredModalOpen(false)}
        isSigningIn={driveStatus.isSyncing}
      />

      {/* Create New Year Modal */}
      {isNewYearModalOpen && (
        <div className="fixed inset-0 m-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-xs p-2.5 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-md w-full overflow-hidden shadow-2xl">
            <div className="px-3.5 py-2.5 sm:px-5 sm:py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                  <Calendar className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white truncate">
                    Initialize New Budget Year
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Create a dedicated annual budget database
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsNewYearModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmCreateNewYear} className="p-3.5 sm:p-5 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Budget Year (4-digit)
                </label>
                <input
                  type="number"
                  min={2000}
                  max={2100}
                  required
                  value={newYearInput}
                  onChange={(e) => setNewYearInput(e.target.value)}
                  placeholder="e.g. 2027"
                  className="w-full h-9 px-3 text-xs sm:text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 font-semibold"
                />
              </div>

              <label className="flex items-start gap-2.5 p-2.5 sm:p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyTemplatesToNewYear}
                  onChange={(e) => setCopyTemplatesToNewYear(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 block">
                    Carry over Categories &amp; Item Templates from {currentYear}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400 text-[11px]">
                    Keeps your custom categories and recurring item estimates ready for the new year.
                  </span>
                </div>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsNewYearModalOpen(false)}
                  className="h-8 sm:h-9 px-3.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="h-8 sm:h-9 px-4 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm transition-colors cursor-pointer"
                >
                  Create {newYearInput || ''} Database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Main Header */}
      <Header
        currentYear={currentYear}
        availableYears={availableYears}
        onSelectYear={handleSelectYear}
        onAddNewYear={handleAddNewYear}
        frequency={frequency}
        onChangeFrequency={setFrequency}
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        driveStatus={driveStatus}
        onSignInWithGoogle={handleSignInWithGoogle}
        onSignOut={handleSignOut}
        onOpenDriveModal={() => setActiveTab('drive')}
        onTriggerSync={triggerSyncAll}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Body Views */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* Default Starter Sample Data Indicator & Protection Banner */}
        {isDefaultStarterBudget(budget) && (
          <div className="mb-4 rounded-2xl border border-amber-300/80 dark:border-amber-700/60 bg-amber-50/90 dark:bg-amber-950/40 px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5 sm:mt-0">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-amber-900 dark:text-amber-200">
                    Default Starter Sample Data Active
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-amber-200/70 dark:bg-amber-900/70 text-amber-800 dark:text-amber-300">
                    Protected from Drive Overwrite
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 mt-0.5 leading-snug">
                  You are viewing built-in starter sample numbers. This sample data will not overwrite your saved Google Drive files.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {driveStatus.isSignedIn ? (
                <button
                  type="button"
                  onClick={handlePullAllSavedFromDrive}
                  disabled={driveStatus.isSyncing}
                  className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Load My Saved Data from Drive</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSignInWithGoogle}
                  disabled={driveStatus.isSyncing}
                  className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sign In to Load Saved Data</span>
                </button>
              )}
            </div>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardView
            budget={budget}
            ledger={ledger}
            frequency={frequency}
            onNavigateToSavings={() => setActiveTab('savings')}
            onNavigateToLoans={() => setActiveTab('loans')}
            onNavigateToBudget={() => setActiveTab('budget')}
            onNavigateToDrive={() => setActiveTab('drive')}
            currencySymbol="₱"
          />
        )}

        {activeTab === 'budget' && (
          <BudgetEntryView
            budget={budget}
            accounts={ledger.accounts}
            frequency={frequency}
            onChangeFrequency={setFrequency}
            onAddEntry={handleAddBudgetEntry}
            onAddMultipleEntries={handleAddMultipleBudgetEntries}
            onUpdateEntry={handleUpdateBudgetEntry}
            onDeleteEntry={handleDeleteBudgetEntry}
            onUpdateCategories={handleUpdateCategories}
            onUpdateTemplates={handleUpdateTemplates}
            currencySymbol="₱"
          />
        )}

        {activeTab === 'savings' && (
          <SavingsLedgerView
            ledger={ledger}
            budget={budget}
            onAddTransaction={handleAddLedgerTransaction}
            onUpdateTransaction={handleUpdateLedgerTransaction}
            onDeleteTransaction={handleDeleteLedgerTransaction}
            onAddAccount={handleAddSavingsAccount}
            onUpdateAccount={handleUpdateSavingsAccount}
            onDeleteAccount={handleDeleteSavingsAccount}
            onRenameOrMergeFund={handleRenameOrMergeFund}
            onDeleteFund={handleDeleteFund}
            currencySymbol="₱"
          />
        )}

        {activeTab === 'loans' && (
          <LoansView
            ledger={ledger}
            budget={budget}
            onSaveLoan={handleSaveLoan}
            onDeleteLoan={handleDeleteLoan}
            onRecordLoanPayment={handleRecordLoanPayment}
            onDeleteLoanPayment={handleDeleteLoanPayment}
            onLinkLoanToTemplate={handleLinkLoanToTemplate}
            currencySymbol="₱"
          />
        )}

        {activeTab === 'drive' && (
          <DriveFilesManagerView
            driveStatus={driveStatus}
            currentYear={currentYear}
            budget={budget}
            ledger={ledger}
            templateData={templateData}
            driveFiles={driveFiles}
            onSignIn={handleSignInWithGoogle}
            onSyncAll={triggerSyncAll}
            onPullBudget={async (yr) => {
              const token = await getAccessToken();
              if (!token) {
                handleSessionExpired('Google Drive session expired. Please sign in again.');
                return;
              }
              try {
                setDriveStatus((p) => ({
                  ...p,
                  isSyncing: true,
                  syncMessage: `Fetching ${yr} Annual Budget from Google Drive...`,
                }));
                const driveRes = await FinanceStorageService.fetchBudgetFromDrive(token, yr);
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                if (!driveRes) {
                  showToast(`No file found in Drive for year ${yr}`, 'info');
                  return;
                }
                const currentLocal = FinanceStorageService.loadLocalBudget(yr);
                const status = FinanceStorageService.compareTimestamps(
                  currentLocal.lastUpdated,
                  driveRes.budget.lastUpdated || driveRes.file.modifiedTime
                );
                const localIsNewer = status === 'local_newer' && currentLocal.entries.length > 0;

                setConfirmationModal({
                  isOpen: true,
                  title: `Overwrite Local ${yr} Budget with Google Drive?`,
                  description: localIsNewer
                    ? `Warning: Your local ${yr} budget has NEWER edits than Google Drive. Overwriting will permanently discard your local changes in favor of the Drive cloud version (${driveRes.budget.entries.length} entries).`
                    : `Load ${yr} budget from Google Drive (${driveRes.budget.entries.length} entries)? This will replace your local device copy.`,
                  affectedItems: [getBudgetFileName(yr)],
                  confirmLabel: 'Yes, Overwrite Local',
                  isDestructive: localIsNewer,
                  onConfirm: async () => {
                    const syncedBudget = { ...driveRes.budget, isDefaultStarterData: false };
                    FinanceStorageService.saveLocalBudget(syncedBudget, { preserveTimestamp: true });
                    FinanceStorageService.registerKnownYear(yr);
                    setAvailableYears(FinanceStorageService.getKnownYears());
                    setCurrentYear(yr);
                    setBudget(syncedBudget);
                    setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedBudget));
                    setHasUnsavedChanges(false);
                    showToast(`Updated ${yr} budget from Google Drive`, 'success');
                    setConfirmationModal((m) => ({ ...m, isOpen: false }));
                  },
                });
              } catch (err: any) {
                if (isSessionExpiredError(err)) {
                  handleSessionExpired('Google Drive session expired. Please sign in again.');
                  return;
                }
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                showToast(`Failed to pull from Drive: ${err.message}`, 'error');
              }
            }}
            onPullTemplate={async () => {
              const token = await getAccessToken();
              if (!token) {
                handleSessionExpired('Google Drive session expired. Please sign in again.');
                return;
              }
              try {
                setDriveStatus((p) => ({
                  ...p,
                  isSyncing: true,
                  syncMessage: 'Fetching Estimate Budget Template from Google Drive...',
                }));
                const driveRes = await FinanceStorageService.fetchTemplateFromDrive(token);
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                if (!driveRes) {
                  showToast(`No template file (${BUDGET_TEMPLATE_FILE_NAME}) found in Drive yet`, 'info');
                  return;
                }
                const currentLocalTpl = FinanceStorageService.loadLocalTemplateData(budget);
                const status = FinanceStorageService.compareTimestamps(
                  currentLocalTpl.lastUpdated,
                  driveRes.template.lastUpdated || driveRes.file.modifiedTime
                );
                const localIsNewer = status === 'local_newer' && currentLocalTpl.isPersonalizedTemplate;

                setConfirmationModal({
                  isOpen: true,
                  title: 'Overwrite Local Estimate Template with Google Drive?',
                  description: localIsNewer
                    ? `Warning: Your local Estimate Budget Template has NEWER edits than Google Drive. Overwriting will replace your local categories and ${currentLocalTpl.itemTemplates.length} item templates with the cloud copy (${driveRes.template.itemTemplates.length} item templates).`
                    : `Load Estimate Budget Template from Google Drive (${driveRes.template.itemTemplates.length} item templates)? This will update your categories and recurring item templates.`,
                  affectedItems: [BUDGET_TEMPLATE_FILE_NAME],
                  confirmLabel: 'Yes, Overwrite Template',
                  isDestructive: localIsNewer,
                  onConfirm: async () => {
                    const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
                      driveRes.template,
                      budget
                    );
                    setBudget(updatedBudget);
                    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
                    setHasUnsavedChanges(false);
                    showToast('Updated Estimate Budget Template from Google Drive', 'success');
                    setConfirmationModal((m) => ({ ...m, isOpen: false }));
                  },
                });
              } catch (err: any) {
                if (isSessionExpiredError(err)) {
                  handleSessionExpired('Google Drive session expired. Please sign in again.');
                  return;
                }
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                showToast(`Failed to pull template: ${err.message}`, 'error');
              }
            }}
            onPullLedger={async () => {
              const token = await getAccessToken();
              if (!token) {
                handleSessionExpired('Google Drive session expired. Please sign in again.');
                return;
              }
              try {
                setDriveStatus((p) => ({
                  ...p,
                  isSyncing: true,
                  syncMessage: 'Fetching Funds & Capital Ledger from Google Drive...',
                }));
                const driveRes = await FinanceStorageService.fetchLedgerFromDrive(token);
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                if (!driveRes) {
                  showToast('No savings ledger file found in Drive', 'info');
                  return;
                }
                const currentLocalLedger = FinanceStorageService.loadLocalSavingsLedger();
                const status = FinanceStorageService.compareTimestamps(
                  currentLocalLedger.lastUpdated,
                  driveRes.ledger.lastUpdated || driveRes.file.modifiedTime
                );
                const localHasData =
                  currentLocalLedger.transactions.length > 0 ||
                  (currentLocalLedger.loans || []).length > 0 ||
                  currentLocalLedger.accounts.some((a) => (a.balance || 0) > 0);
                const localIsNewer = status === 'local_newer' && localHasData;

                setConfirmationModal({
                  isOpen: true,
                  title: 'Overwrite Local Funds Ledger with Google Drive?',
                  description: localIsNewer
                    ? `Warning: Your local Funds ledger has NEWER edits than Google Drive. Overwriting will replace your local transactions (${currentLocalLedger.transactions.length}) with the cloud copy (${driveRes.ledger.transactions.length}).`
                    : `Load Funds ledger from Google Drive (${driveRes.ledger.transactions.length} transactions)? This will replace your local device copy.`,
                  affectedItems: [SAVINGS_LEDGER_FILE_NAME],
                  confirmLabel: 'Yes, Overwrite Local',
                  isDestructive: localIsNewer,
                  onConfirm: async () => {
                    const syncedLedger = { ...driveRes.ledger, isDefaultStarterData: false };
                    FinanceStorageService.saveLocalSavingsLedger(syncedLedger, { preserveTimestamp: true });
                    setLedger(syncedLedger);
                    setHasUnsavedChanges(false);
                    showToast('Updated Funds ledger from Google Drive', 'success');
                    setConfirmationModal((m) => ({ ...m, isOpen: false }));
                  },
                });
              } catch (err: any) {
                if (isSessionExpiredError(err)) {
                  handleSessionExpired('Google Drive session expired. Please sign in again.');
                  return;
                }
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                showToast(`Failed to pull ledger: ${err.message}`, 'error');
              }
            }}
            onSaveBudgetToDrive={triggerSaveBudgetToDrive}
            onSaveTemplateToDrive={triggerSaveTemplateToDrive}
            onSaveLedgerToDrive={triggerSaveLedgerToDrive}
            onAddNewYear={handleAddNewYear}
            onSelectYear={handleSelectYear}
            onImportBudgetJson={(jsonData) => {
              const { budget: normalizedBudget } = FinanceStorageService.normalizeBudgetTemplates(jsonData);
              FinanceStorageService.saveLocalBudget(normalizedBudget);
              FinanceStorageService.registerKnownYear(normalizedBudget.year);
              setAvailableYears(FinanceStorageService.getKnownYears());
              setBudget(normalizedBudget);
              setTemplateData(FinanceStorageService.loadLocalTemplateData(normalizedBudget));
              setCurrentYear(normalizedBudget.year);
              setHasUnsavedChanges(true);
              showToast(`Imported budget for year ${normalizedBudget.year}`);
            }}
            onImportTemplateJson={(tplJson) => {
              const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(tplJson, budget);
              setBudget(updatedBudget);
              setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
              setHasUnsavedChanges(true);
              showToast('Imported personalized Estimate Budget Template JSON');
            }}
            onImportLedgerJson={(ledgerJson) => {
              FinanceStorageService.saveLocalSavingsLedger(ledgerJson);
              const normalizedLedger = FinanceStorageService.loadLocalSavingsLedger();
              setLedger(normalizedLedger);
              setHasUnsavedChanges(true);
              showToast('Imported Funds Ledger JSON');
            }}
            onError={(msg) => showToast(msg, 'error')}
            onResetDataForGoLive={handleResetDataForGoLive}
            onOrganizeDriveFolder={triggerOrganizeDriveFolder}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 pt-6 pb-24 md:pb-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">CapitalFlow</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-400">
              v{APP_VERSION}
            </span>
            <span>&bull;</span>
            <span>Google Drive Folder: /{CAPITALFLOW_DRIVE_FOLDER_NAME}/</span>
            <span>&bull;</span>
            <a
              href="./privacy.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Privacy Policy
            </a>
            <span>&bull;</span>
            <a
              href="./terms.html"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
            >
              Terms of Service
            </a>
          </div>
          <div className="font-mono text-[11px] text-slate-400">
            Budget: {getBudgetFileName(currentYear)} &bull; Template: {BUDGET_TEMPLATE_FILE_NAME} &bull; Ledger: {SAVINGS_LEDGER_FILE_NAME}
          </div>
        </div>
      </footer>

    </div>
  );
}
