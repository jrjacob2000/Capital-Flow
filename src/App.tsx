/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
import { getPeriodItemExclusionKeys } from './utils/budgetCalculations';
import {
  initAuth,
  googleSignIn,
  logout,
  getAccessToken,
  ensureDriveAccessToken,
  clearCachedToken,
  isDriveTokenExpired,
  getBrowserEnvironmentInfo,
  isMissingInitialStateOrStorageError,
  auth,
} from './services/firebase';
import { FirestoreSyncService } from './services/firestoreService';
import { Header } from './components/Header';
import { DashboardView } from './components/DashboardView';
import { BudgetEntryView } from './components/BudgetEntryView';
import { SavingsLedgerView } from './components/SavingsLedgerView';
import { LoansView } from './components/LoansView';
import { DriveFilesManagerView } from './components/DriveFilesManagerView';
import { HelpGuideView } from './components/HelpGuideView';
import { ConfirmationModal } from './components/ConfirmationModal';
import { DriveConflictModal, DriveConflictDetail } from './components/DriveConflictModal';
import { DriveSessionExpiredModal } from './components/DriveSessionExpiredModal';
import { InAppBrowserAuthModal } from './components/InAppBrowserAuthModal';
import { PullToRefresh } from './components/PullToRefresh';
import {
  getBudgetFileName,
  SAVINGS_LEDGER_FILE_NAME,
  BUDGET_TEMPLATE_FILE_NAME,
  CAPITALFLOW_DRIVE_FOLDER_NAME,
  isSessionExpiredError,
  validateDriveToken,
} from './services/driveService';
import {
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Calendar,
  X,
  Cloud,
  Download,
  ShieldAlert,
  Smartphone,
  Copy,
  Sparkles,
} from 'lucide-react';

export default function App() {
  const [currentYear, setCurrentYear] = useState<number>(2026);
  const [availableYears, setAvailableYears] = useState<number[]>([2026, 2025]);
  const [frequency, setFrequency] = useState<EntryFrequency>('monthly');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'budget' | 'savings' | 'loans' | 'drive' | 'help'>('dashboard');

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

  // Firebase Cloud DB & Optional Google Drive State
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
    isFirebaseConnected: false,
    isFirebaseSyncing: false,
    lastFirebaseSyncedAt: null,
    isDriveBackupReady: false,
  });
  const [driveFiles, setDriveFiles] = useState<DriveFileInfo[]>([]);
  const isInitialCloudHydrationDoneRef = useRef<boolean>(false);

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
  // In-App Browser (Messenger / Instagram / FB WebView) Auth Modal & Banner State
  const [browserEnv] = useState(() => getBrowserEnvironmentInfo());
  const [isInAppBrowserModalOpen, setIsInAppBrowserModalOpen] = useState<boolean>(false);
  const [inAppBrowserErrorMsg, setInAppBrowserErrorMsg] = useState<string | null>(null);
  const [isInAppBannerDismissed, setIsInAppBannerDismissed] = useState<boolean>(false);
  const [inAppBannerCopied, setInAppBannerCopied] = useState<boolean>(false);

  const [hasUnsavedChanges, setHasUnsavedChanges] = useState<boolean>(false);
  const [isSyncReminderDismissed, setIsSyncReminderDismissed] = useState<boolean>(false);

  // Reset reminder dismissal whenever new unsaved changes occur
  useEffect(() => {
    if (hasUnsavedChanges) {
      setIsSyncReminderDismissed((prev) => (prev ? false : prev));
    }
  }, [hasUnsavedChanges]);

  // Browser window/tab close guard when changes are unsaved
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && !driveStatus.isSignedIn) {
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

  // Centralized optional Google Drive token expired handler (keeps Firebase Auth connected!)
  const handleSessionExpired = useCallback((customMsg?: string, showToastAlert: boolean = false) => {
    clearCachedToken();
    const hasFirebaseUser = Boolean(auth?.currentUser);
    setDriveStatus((prev) => ({
      ...prev,
      isSyncing: false,
      isSignedIn: hasFirebaseUser,
      isFirebaseConnected: hasFirebaseUser,
      isDriveBackupReady: false,
      isSessionExpired: false,
      error: customMsg || null,
    }));
    if (showToastAlert && customMsg) {
      showToast(customMsg, 'error');
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

  // Hydrate or initialize the user's primary Firebase Firestore cloud database
  const hydrateOrSyncFirebaseWorkspace = useCallback(
    async (user: { uid: string; email?: string | null; displayName?: string | null }, optionalDriveToken?: string | null) => {
      try {
        setDriveStatus((prev) => ({
          ...prev,
          isFirebaseConnected: true,
          isFirebaseSyncing: true,
          syncMessage: 'Connecting to Firebase Cloud Database...',
        }));

        // High-performance parallel retrieval: fetch workspace and current-year budget concurrently
        const [remoteWorkspace, initialBudget] = await Promise.all([
          FirestoreSyncService.fetchWorkspace(user.uid),
          FirestoreSyncService.fetchAnnualBudget(user.uid, currentYear),
        ]);
        let localBudgetNow = FinanceStorageService.loadLocalBudget(currentYear);
        let localLedgerNow = FinanceStorageService.loadLocalSavingsLedger();
        let localTemplateNow = FinanceStorageService.loadLocalTemplateData(localBudgetNow);
        let restoredFromFirebase = false;

        if (remoteWorkspace) {
          const targetYr = remoteWorkspace.activeYear || currentYear;
          const remoteBudget =
            targetYr === currentYear
              ? initialBudget
              : await FirestoreSyncService.fetchAnnualBudget(user.uid, targetYr);

          // Register all known years from Firebase workspace
          if (Array.isArray(remoteWorkspace.knownYears)) {
            remoteWorkspace.knownYears.forEach((yr) =>
              FinanceStorageService.registerKnownYear(yr, { skipFirestoreWrite: true })
            );
          }
          if (remoteWorkspace.frequency === 'monthly' || remoteWorkspace.frequency === 'bi-weekly') {
            setFrequency(remoteWorkspace.frequency);
          }

          // Hydrate Ledger from Firebase if local is default starter or older
          const remoteLedger = remoteWorkspace.ledgerData;
          if (remoteLedger) {
            const ledgerCmp = FinanceStorageService.compareTimestamps(
              localLedgerNow.lastUpdated,
              remoteLedger.lastUpdated || remoteWorkspace.updatedAtIso
            );
            if (isDefaultStarterLedger(localLedgerNow) || ledgerCmp !== 'local_newer') {
              const syncedLedger: SavingsLedgerData = {
                ...remoteLedger,
                isDefaultStarterData: false,
              };
              FinanceStorageService.saveLocalSavingsLedger(syncedLedger, {
                preserveTimestamp: true,
                skipFirestoreWrite: true,
              });
              localLedgerNow = syncedLedger;
              setLedger(syncedLedger);
              restoredFromFirebase = true;
            }
          }

          // Hydrate Annual Budget & Template from Firebase if local is default starter or older
          if (remoteBudget) {
            const localTargetBudget = FinanceStorageService.loadLocalBudget(targetYr);
            const budgetCmp = FinanceStorageService.compareTimestamps(
              localTargetBudget.lastUpdated,
              remoteBudget.lastUpdated
            );
            if (isDefaultStarterBudget(localTargetBudget) || budgetCmp !== 'local_newer') {
              let syncedBudget: YearBudgetData = {
                ...remoteBudget,
                isPersonalizedTemplate: Boolean(remoteBudget.isPersonalizedTemplate ?? true),
                isDefaultStarterData: false,
              };
              if (remoteWorkspace.templateData && !isDefaultStarterTemplateData(remoteWorkspace.templateData)) {
                syncedBudget = FinanceStorageService.applyTemplateDataToBudget(
                  remoteWorkspace.templateData,
                  syncedBudget,
                  { skipFirestoreWrite: true }
                );
              } else {
                FinanceStorageService.saveLocalBudget(syncedBudget, {
                  preserveTimestamp: true,
                  skipFirestoreWrite: true,
                });
              }
              localBudgetNow = syncedBudget;
              localTemplateNow = FinanceStorageService.loadLocalTemplateData(syncedBudget);
              setCurrentYear(targetYr);
              setBudget(syncedBudget);
              setTemplateData(localTemplateNow);
              restoredFromFirebase = true;
            }
          } else if (remoteWorkspace.templateData && !isDefaultStarterTemplateData(remoteWorkspace.templateData)) {
            if (isDefaultStarterTemplateData(localTemplateNow)) {
              const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
                remoteWorkspace.templateData,
                localBudgetNow,
                { skipFirestoreWrite: true }
              );
              localBudgetNow = updatedBudget;
              localTemplateNow = FinanceStorageService.loadLocalTemplateData(updatedBudget);
              setBudget(updatedBudget);
              setTemplateData(localTemplateNow);
              restoredFromFirebase = true;
            }
          }

          setAvailableYears(FinanceStorageService.getKnownYears());
        } else {
          // First-time Firebase Workspace setup for this user!
          // If the user has an optional Google Drive backup and local is starter data, check Drive first so we migrate their Drive data into Firebase automatically
          if (optionalDriveToken && (isDefaultStarterBudget(localBudgetNow) || isDefaultStarterLedger(localLedgerNow))) {
            try {
              const { files } = await FinanceStorageService.organizeFilesIntoFolder(optionalDriveToken);
              setDriveFiles(files);

              const existingBudgetFile = files.find((f) => f.name === getBudgetFileName(currentYear));
              if (existingBudgetFile && isDefaultStarterBudget(localBudgetNow)) {
                const driveBudgetRes = await FinanceStorageService.fetchBudgetFromDrive(optionalDriveToken, currentYear);
                if (driveBudgetRes && !isDefaultStarterBudget(driveBudgetRes.budget)) {
                  const syncedDriveBudget: YearBudgetData = {
                    ...driveBudgetRes.budget,
                    isPersonalizedTemplate: Boolean(driveBudgetRes.budget.isPersonalizedTemplate ?? true),
                    isDefaultStarterData: false,
                  };
                  FinanceStorageService.saveLocalBudget(syncedDriveBudget, {
                    preserveTimestamp: true,
                    skipFirestoreWrite: true,
                  });
                  localBudgetNow = syncedDriveBudget;
                  setBudget(syncedDriveBudget);
                  localTemplateNow = FinanceStorageService.loadLocalTemplateData(syncedDriveBudget);
                  setTemplateData(localTemplateNow);
                }
              }

              const existingTemplateFile = files.find((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);
              if (existingTemplateFile && isDefaultStarterTemplateData(localTemplateNow)) {
                const driveTemplateRes = await FinanceStorageService.fetchTemplateFromDrive(optionalDriveToken);
                if (driveTemplateRes && !isDefaultStarterTemplateData(driveTemplateRes.template)) {
                  const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
                    driveTemplateRes.template,
                    localBudgetNow,
                    { skipFirestoreWrite: true }
                  );
                  localBudgetNow = updatedBudget;
                  setBudget(updatedBudget);
                  localTemplateNow = FinanceStorageService.loadLocalTemplateData(updatedBudget);
                  setTemplateData(localTemplateNow);
                }
              }

              const existingLedgerFile = files.find((f) => f.name === SAVINGS_LEDGER_FILE_NAME);
              if (existingLedgerFile && isDefaultStarterLedger(localLedgerNow)) {
                const driveLedgerRes = await FinanceStorageService.fetchLedgerFromDrive(optionalDriveToken);
                if (driveLedgerRes && !isDefaultStarterLedger(driveLedgerRes.ledger)) {
                  const syncedLedger: SavingsLedgerData = {
                    ...driveLedgerRes.ledger,
                    isDefaultStarterData: false,
                  };
                  FinanceStorageService.saveLocalSavingsLedger(syncedLedger, {
                    preserveTimestamp: true,
                    skipFirestoreWrite: true,
                  });
                  localLedgerNow = syncedLedger;
                  setLedger(syncedLedger);
                }
              }
            } catch (driveErr) {
              console.warn('Optional Drive migration check skipped:', driveErr);
            }
          }

          // Initialize the user's primary Firebase Firestore workspace
          const knownYrs = FinanceStorageService.getKnownYears();
          await FirestoreSyncService.syncCompleteState(user.uid, {
            activeYear: localBudgetNow.year,
            knownYears: knownYrs,
            frequency,
            budget: localBudgetNow,
            templateData: localTemplateNow,
            ledgerData: localLedgerNow,
          });
        }

        // Activate Cloud Session & purge redundant localStorage cache now that Firebase Firestore + native IndexedDB cache are active
        FinanceStorageService.setCloudSessionActive(true);
        isInitialCloudHydrationDoneRef.current = true;
        const nowStr = new Date().toLocaleTimeString();
        setDriveStatus((prev) => ({
          ...prev,
          isFirebaseConnected: true,
          isFirebaseSyncing: false,
          lastFirebaseSyncedAt: nowStr,
          lastSyncedAt: prev.lastSyncedAt || nowStr,
          syncMessage: null,
        }));
        if (restoredFromFirebase) {
          setHasUnsavedChanges(false);
        }
      } catch (err) {
        console.warn('Firebase Cloud DB initial sync note:', err);
        FinanceStorageService.setCloudSessionActive(true);
        isInitialCloudHydrationDoneRef.current = true;
        setDriveStatus((prev) => ({
          ...prev,
          isFirebaseSyncing: false,
          syncMessage: null,
        }));
      }
    },
    [currentYear, frequency]
  );

  // Track direct Firestore CRUD writes in real time so header/status indicators reflect instant saves
  useEffect(() => {
    FirestoreSyncService.setWriteStatusListener(({ isSyncing, lastSyncedAt }) => {
      setDriveStatus((prev) => ({
        ...prev,
        isFirebaseConnected: prev.isSignedIn ? true : prev.isFirebaseConnected,
        isFirebaseSyncing: isSyncing,
        lastFirebaseSyncedAt: lastSyncedAt || prev.lastFirebaseSyncedAt,
      }));
      if (!isSyncing && lastSyncedAt) {
        setHasUnsavedChanges(false);
      }
    });
    return () => FirestoreSyncService.setWriteStatusListener(null);
  }, []);

  // Listen for Firebase Auth state (Primary Firebase DB stays connected without 1-hour OAuth expiry)
  useEffect(() => {
    const unsubscribe = initAuth(
      async (user, token) => {
        setIsSessionExpiredModalOpen(false);
        setDriveStatus((prev) => ({
          ...prev,
          isSignedIn: true,
          isFirebaseConnected: true,
          isDriveBackupReady: Boolean(token && !isDriveTokenExpired()),
          isSessionExpired: false,
          userEmail: user.email,
          userName: user.displayName || user.email?.split('@')[0] || 'User',
          userPhoto: user.photoURL,
          error: null,
        }));

        // 1. Hydrate/sync primary Firebase Firestore Database
        await hydrateOrSyncFirebaseWorkspace(user, token);

        // 2. If a valid optional Google Drive token is present, refresh the optional Drive backup index in background
        if (token && !isDriveTokenExpired()) {
          try {
            const { folder, files } = await FinanceStorageService.organizeFilesIntoFolder(token);
            setDriveFiles(files);
            setDriveStatus((prev) => ({
              ...prev,
              isDriveBackupReady: true,
              folderId: folder ? folder.id : prev.folderId,
              folderName: folder ? folder.name : prev.folderName,
            }));
          } catch (e) {
            // Optional Drive token expired or unavailable; Firebase DB remains active
            setDriveStatus((prev) => ({ ...prev, isDriveBackupReady: false }));
          }
        }
      },
      () => {
        FinanceStorageService.setCloudSessionActive(false);
        isInitialCloudHydrationDoneRef.current = false;
        setDriveStatus((prev) => ({
          ...prev,
          isSignedIn: false,
          isFirebaseConnected: false,
          isDriveBackupReady: false,
          isSessionExpired: false,
          error: null,
          userEmail: null,
          userName: null,
          userPhoto: null,
        }));
      }
    );

    return () => unsubscribe();
  }, [hydrateOrSyncFirebaseWorkspace]);

  // Real-time Firestore onSnapshot listeners for Workspace (Ledger, Templates, Known Years) and Active Year Budget
  useEffect(() => {
    const currentUser = auth?.currentUser;
    if (!currentUser || !driveStatus.isSignedIn || !isInitialCloudHydrationDoneRef.current) {
      return;
    }

    const unsubWorkspace = FirestoreSyncService.subscribeWorkspace(currentUser.uid, (remoteWorkspace) => {
      if (Array.isArray(remoteWorkspace.knownYears)) {
        remoteWorkspace.knownYears.forEach((yr) =>
          FinanceStorageService.registerKnownYear(yr, { skipFirestoreWrite: true })
        );
        setAvailableYears(FinanceStorageService.getKnownYears());
      }
      if (remoteWorkspace.ledgerData) {
        const localLedgerNow = FinanceStorageService.loadLocalSavingsLedger();
        if (remoteWorkspace.ledgerData.lastUpdated !== localLedgerNow.lastUpdated) {
          const cmp = FinanceStorageService.compareTimestamps(
            localLedgerNow.lastUpdated,
            remoteWorkspace.ledgerData.lastUpdated || remoteWorkspace.updatedAtIso
          );
          if (cmp === 'drive_newer') {
            const syncedLedger: SavingsLedgerData = {
              ...remoteWorkspace.ledgerData,
              isDefaultStarterData: false,
            };
            FinanceStorageService.saveLocalSavingsLedger(syncedLedger, {
              preserveTimestamp: true,
              skipFirestoreWrite: true,
            });
            setLedger(syncedLedger);
          }
        }
      }
    });

    const unsubBudget = FirestoreSyncService.subscribeAnnualBudget(
      currentUser.uid,
      currentYear,
      (remoteBudget) => {
        const localBudgetNow = FinanceStorageService.loadLocalBudget(currentYear);
        if (remoteBudget.lastUpdated !== localBudgetNow.lastUpdated) {
          const cmp = FinanceStorageService.compareTimestamps(
            localBudgetNow.lastUpdated,
            remoteBudget.lastUpdated
          );
          if (cmp === 'drive_newer') {
            const syncedBudget: YearBudgetData = {
              ...remoteBudget,
              isPersonalizedTemplate: Boolean(remoteBudget.isPersonalizedTemplate ?? true),
              isDefaultStarterData: false,
            };
            FinanceStorageService.saveLocalBudget(syncedBudget, {
              preserveTimestamp: true,
              skipFirestoreWrite: true,
            });
            setBudget(syncedBudget);
            setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedBudget));
          }
        }
      }
    );

    return () => {
      unsubWorkspace?.();
      unsubBudget?.();
    };
  }, [currentYear, driveStatus.isSignedIn]);

  // Google Sign-In handler (connects Primary Firebase DB + Optional Google Drive Backup)
  const handleSignInWithGoogle = async (forcePopup?: boolean | React.MouseEvent) => {
    const isForcedPopup = forcePopup === true;
    const currentEnv = getBrowserEnvironmentInfo();
    if ((currentEnv.isInAppBrowser || !currentEnv.isSessionStorageSupported) && !isForcedPopup) {
      setInAppBrowserErrorMsg(null);
      setIsInAppBrowserModalOpen(true);
      return;
    }

    try {
      setDriveStatus((prev) => ({
        ...prev,
        isSyncing: true,
        syncMessage: 'Signing in to Firebase Cloud Database...',
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
        isFirebaseConnected: true,
        isDriveBackupReady: Boolean(result.accessToken),
        isSessionExpired: false,
        userEmail: result.user.email,
        userName: result.user.displayName || result.user.email?.split('@')[0] || 'User',
        userPhoto: result.user.photoURL,
        isSyncing: true,
        syncMessage: 'Synchronizing with Firebase Cloud Database...',
        error: null,
      }));

      // 1. Connect and hydrate/sync primary Firebase Firestore Database
      await hydrateOrSyncFirebaseWorkspace(result.user, result.accessToken);

      // 2. If Drive token was granted during sign-in, also scan optional Google Drive backup folder
      if (result.accessToken) {
        try {
          const { folder, files } = await FinanceStorageService.organizeFilesIntoFolder(result.accessToken);
          setDriveFiles(files);
          setDriveStatus((prev) => ({
            ...prev,
            isDriveBackupReady: true,
            folderId: folder.id,
            folderName: folder.name,
          }));
        } catch (driveErr) {
          console.warn('Optional Google Drive folder check skipped:', driveErr);
        }
      }

      setDriveStatus((prev) => ({ ...prev, isSyncing: false, syncMessage: null }));
      showToast(`Connected to Firebase Cloud Database as ${result.user.email}`, 'success');
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
      if (err?.isBrowserStorageOrInAppError || isMissingInitialStateOrStorageError(err)) {
        setInAppBrowserErrorMsg(err.message || null);
        setIsInAppBrowserModalOpen(true);
        return;
      }
      showToast(err.message || 'Failed to authenticate with Google', 'error');
    }
  };

  // Start a clean blank workspace (0 entries, 0 starter templates) for new users
  const handleStartBlankWorkspace = () => {
    const {
      budget: blankBudget,
      ledger: blankLedger,
      templateData: blankTemplate,
    } = FinanceStorageService.startFreshBlankWorkspace(currentYear);
    setBudget(blankBudget);
    setLedger(blankLedger);
    setTemplateData(blankTemplate);
    setHasUnsavedChanges(false);
    showToast(`Initialized a blank ${currentYear} budget workspace ready for your own entries or Excel import!`, 'success');
  };

  const handleKeepAllLocal = () => {
    setConflictModalState({ isOpen: false, items: [] });
    showToast('Preserved all local changes on this device.', 'info');
  };

  const handlePushAllLocalToDrive = async () => {
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to back up your JSON files.', 'info');
      return;
    }
    try {
      setDriveStatus((p) => ({
        ...p,
        isDriveBackupReady: true,
        isSyncing: true,
        syncMessage: `Backing up ${currentYear} Annual Budget (1/3) to Google Drive...`,
      }));
      const currentLocalBudget = FinanceStorageService.loadLocalBudget(currentYear);
      const currentLocalLedger = FinanceStorageService.loadLocalSavingsLedger();
      const currentLocalTemplate = FinanceStorageService.loadLocalTemplateData(currentLocalBudget);
      const budgetRes = await FinanceStorageService.syncBudgetToDrive(token, currentLocalBudget);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Backing up Estimate Budget Template (2/3) to Google Drive...',
      }));
      const templateRes = await FinanceStorageService.syncTemplateToDrive(token, currentLocalTemplate);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Backing up Funds & Capital Ledger (3/3) to Google Drive...',
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
      showToast(`Backed up budget, template, and ledger to "${CAPITALFLOW_DRIVE_FOLDER_NAME}" in Google Drive!`, 'success');
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive token expired. Click Backup again to re-authorize Drive.');
        return;
      }
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
      showToast(`Drive backup failed: ${err.message}`, 'error');
    }
  };

  const handleOverwriteAllWithDrive = () => {
    conflictModalState.items.forEach((item) => item.onOverwriteWithDrive());
    setConflictModalState({ isOpen: false, items: [] });
  };

  const handleSignOut = async () => {
    FirestoreSyncService.clearMemoryCache();
    await logout();
    FinanceStorageService.setCloudSessionActive(false);
    FinanceStorageService.clearDriveFolderCache();
    isInitialCloudHydrationDoneRef.current = false;
    setDriveStatus((prev) => ({
      ...prev,
      isSignedIn: false,
      isFirebaseConnected: false,
      isDriveBackupReady: false,
      userEmail: null,
      userName: null,
      userPhoto: null,
      folderId: null,
    }));
    showToast('Signed out of Firebase Cloud Database', 'info');
  };

  // Switch year safely, checking Primary Firebase Firestore first
  const handleSelectYear = async (year: number) => {
    setCurrentYear(year);
    const loadedBudget = FinanceStorageService.loadLocalBudget(year);
    setBudget(loadedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(loadedBudget));

    const currentUser = auth?.currentUser;
    if (currentUser) {
      try {
        void FirestoreSyncService.saveWorkspace(currentUser.uid, { activeYear: year });
        const remoteBudget = await FirestoreSyncService.fetchAnnualBudget(currentUser.uid, year);
        if (remoteBudget) {
          const cmp = FinanceStorageService.compareTimestamps(
            loadedBudget.lastUpdated,
            remoteBudget.lastUpdated
          );
          if (isDefaultStarterBudget(loadedBudget) || loadedBudget.entries.length === 0 || cmp === 'drive_newer') {
            const syncedBudget: YearBudgetData = {
              ...remoteBudget,
              isPersonalizedTemplate: Boolean(remoteBudget.isPersonalizedTemplate ?? true),
              isDefaultStarterData: false,
            };
            FinanceStorageService.saveLocalBudget(syncedBudget, {
              preserveTimestamp: true,
              skipFirestoreWrite: true,
            });
            FinanceStorageService.registerKnownYear(year, { skipFirestoreWrite: true });
            setAvailableYears(FinanceStorageService.getKnownYears());
            setBudget(syncedBudget);
            setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedBudget));
            return;
          }
        }
      } catch (err) {
        console.warn('Could not fetch year from Firebase Firestore:', err);
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

    if (loadedNewYear.entries.length === 0) {
      if (copyTemplatesToNewYear) {
        const seededTemplates = budget.itemTemplates
          ? JSON.parse(JSON.stringify(budget.itemTemplates))
          : loadedNewYear.itemTemplates;
        const seededBudget: YearBudgetData = {
          ...loadedNewYear,
          customCategories: budget.customCategories
            ? JSON.parse(JSON.stringify(budget.customCategories))
            : loadedNewYear.customCategories,
          itemTemplates: seededTemplates,
          isPersonalizedTemplate: Boolean(seededTemplates && seededTemplates.length > 0),
          lastUpdated: new Date().toISOString(),
        };
        FinanceStorageService.saveLocalBudget(seededBudget);
      } else {
        const blankTemplatesBudget: YearBudgetData = {
          ...loadedNewYear,
          itemTemplates: [],
          isPersonalizedTemplate: false,
          budgets: [],
          lastUpdated: new Date().toISOString(),
        };
        FinanceStorageService.saveLocalBudget(blankTemplatesBudget, { skipTemplateProfileUpdate: true });
      }
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

    const updatedExcluded: Record<string, string[]> = { ...(budget.excludedPeriodItems || {}) };
    if (updatedExcluded[newEntry.period] && updatedExcluded[newEntry.period].length > 0) {
      const matchedTpl = (budget.itemTemplates || []).find(
        (t) =>
          t.type === newEntry.type &&
          ((newEntry.loanId && t.loanId === newEntry.loanId) ||
            t.item.trim().toLowerCase() === (newEntry.item || newEntry.description || '').trim().toLowerCase())
      );
      const keysToUnexclude = getPeriodItemExclusionKeys({
        templateId: matchedTpl?.id,
        type: newEntry.type,
        item: newEntry.item || newEntry.description,
        loanId: newEntry.loanId || matchedTpl?.loanId,
      });
      updatedExcluded[newEntry.period] = updatedExcluded[newEntry.period].filter(
        (k) => !keysToUnexclude.includes(k)
      );
      if (updatedExcluded[newEntry.period].length === 0) {
        delete updatedExcluded[newEntry.period];
      }
    }

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: [newEntry, ...budget.entries],
      excludedPeriodItems: updatedExcluded,
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

    const target = updatedEntries.find((e) => e.id === entryId);
    const updatedExcluded: Record<string, string[]> = { ...(budget.excludedPeriodItems || {}) };
    if (target && updatedExcluded[target.period] && updatedExcluded[target.period].length > 0) {
      const matchedTpl = (budget.itemTemplates || []).find(
        (t) =>
          t.type === target.type &&
          ((target.loanId && t.loanId === target.loanId) ||
            t.item.trim().toLowerCase() === (target.item || target.description || '').trim().toLowerCase())
      );
      const keysToUnexclude = getPeriodItemExclusionKeys({
        templateId: matchedTpl?.id,
        type: target.type,
        item: matchedTpl?.item || target.item || target.description,
        loanId: target.loanId || matchedTpl?.loanId,
      });
      updatedExcluded[target.period] = updatedExcluded[target.period].filter(
        (k) => !keysToUnexclude.includes(k)
      );
      if (updatedExcluded[target.period].length === 0) {
        delete updatedExcluded[target.period];
      }
    }

    const updatedBudget: YearBudgetData = {
      ...budget,
      entries: updatedEntries,
      excludedPeriodItems: updatedExcluded,
    };

    setBudget(updatedBudget);
    FinanceStorageService.saveLocalBudget(updatedBudget);
    setHasUnsavedChanges(true);
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

  // Delete an entire budget item (recorded entry and/or virtual template row) for a specific period
  const handleDeletePeriodItem = (
    period: string,
    target: {
      entryId?: string;
      templateId?: string;
      type: EntryType;
      item: string;
      category?: string;
      estimatedCost?: number;
      actualCost?: number;
      hasActualCost?: boolean;
      status?: 'Paid' | 'Pending' | 'Scheduled';
      loanId?: string;
    }
  ) => {
    const currSym = budget.currency || '₱';
    const typeLabel =
      target.type === 'saving' ? 'Funds' : target.type === 'income' ? 'Income' : 'Expense';
    const displayAmt =
      target.hasActualCost && target.status === 'Paid'
        ? target.actualCost ?? 0
        : target.estimatedCost ?? target.actualCost ?? 0;

    setConfirmationModal({
      isOpen: true,
      title: `Delete ${typeLabel} Item from ${period}?`,
      description:
        target.type === 'saving' && target.hasActualCost && target.status === 'Paid' && (target.actualCost || 0) > 0
          ? `Are you sure you want to delete "${target.item}" from ${period} (${budget.year})? The entire item will be removed from ${period} and its recorded allocation will be rolled back from your Funds ledger. Other periods will not be affected.`
          : `Are you sure you want to delete "${target.item}" from ${period} (${budget.year})? The entire item will be removed from ${period} only—other periods and your master template will not be affected.`,
      affectedItems: [
        `${target.item}${target.category ? ` (${target.category})` : ''} — ${currSym}${displayAmt.toLocaleString()} in ${period} ${budget.year}`,
      ],
      confirmLabel: `Yes, Delete from ${period}`,
      isDestructive: true,
      onConfirm: async () => {
        const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
        const {
          budget: updatedBudget,
          ledger: updatedLedger,
          removedEntries,
        } = FinanceStorageService.deleteBudgetPeriodItem(currentBudget, period, {
          entryId: target.entryId,
          templateId: target.templateId,
          type: target.type,
          item: target.item,
          loanId: target.loanId,
        });

        setBudget(updatedBudget);
        setLedger({ ...updatedLedger });
        setHasUnsavedChanges(true);

        const hadPaidSaving = removedEntries.some(
          (e) => e.type === 'saving' && e.status !== 'Pending' && (e.actualCost ?? e.amount ?? 0) > 0
        );
        if (hadPaidSaving) {
          showToast(`Deleted "${target.item}" from ${period} and updated Funds ledger`);
        } else {
          showToast(`Deleted "${target.item}" from ${period}`);
        }
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
      },
    });
  };

  // Restore any deleted template items for a specific period
  const handleRestorePeriodItems = (period: string) => {
    const currentBudget = FinanceStorageService.loadLocalBudget(budget.year);
    const updatedBudget = FinanceStorageService.restoreExcludedPeriodItems(currentBudget, period);
    setBudget(updatedBudget);
    setHasUnsavedChanges(true);
    showToast(`Restored deleted template items for ${period}`);
  };

  // Delete Budget Entry by ID (delegates to handleDeletePeriodItem so the entire item is removed from that period)
  const handleDeleteBudgetEntry = (entryId: string) => {
    const entry = budget.entries.find((e) => e.id === entryId);
    if (!entry) return;

    handleDeletePeriodItem(entry.period, {
      entryId: entry.id,
      type: entry.type,
      item: entry.item || entry.description,
      category: entry.category,
      estimatedCost: entry.estimatedCost,
      actualCost: entry.actualCost ?? entry.amount,
      hasActualCost: true,
      status: entry.status,
      loanId: entry.loanId,
    });
  };

  // Add direct ledger transaction (yield, deposit, withdrawal, transfer, reallocation)
  const handleAddLedgerTransaction = (txData: Omit<SavingsTransaction, 'id' | 'runningTotalCapital'>) => {
    const { ledger: updatedLedger } = FinanceStorageService.addLedgerTransaction(txData);
    const currSym = updatedLedger.currency || '₱';
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);

    if (txData.source === 'withdrawal') {
      const acc = updatedLedger.accounts.find((a) => a.id === txData.accountId);
      showToast(`Recorded withdrawal of ${currSym}${txData.amount.toLocaleString()} from ${acc?.name || 'account'}`);
    } else if (txData.source === 'transfer') {
      const fromAcc = updatedLedger.accounts.find((a) => a.id === txData.accountId);
      const toAcc = updatedLedger.accounts.find((a) => a.id === txData.toAccountId);
      showToast(
        `Transferred ${currSym}${txData.amount.toLocaleString()} from ${fromAcc?.name || 'account'} to ${toAcc?.name || 'account'}`
      );
    } else if (txData.source === 'reallocation') {
      showToast(
        `Reallocated ${currSym}${txData.amount.toLocaleString()} from ${txData.category || 'Reserves'} to ${txData.toCategory || 'Category Fund'}`
      );
    } else {
      const acc = updatedLedger.accounts.find((a) => a.id === txData.accountId);
      showToast(
        `Recorded ${txData.source === 'interest_yield' ? 'interest payout' : 'deposit'} of ${currSym}${txData.amount.toLocaleString()} to ${acc?.name || 'account'}`
      );
    }
  };

  // Update direct ledger transaction
  const handleUpdateLedgerTransaction = (txId: string, updated: Partial<SavingsTransaction>) => {
    const { ledger: updatedLedger, updatedBudget } = FinanceStorageService.updateLedgerTransaction(
      txId,
      updated,
      budget.year
    );
    if (updatedBudget && updatedBudget.year === budget.year) {
      setBudget({ ...updatedBudget });
    }
    setLedger({ ...updatedLedger });
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
        const { ledger: updatedLedger, updatedBudget } =
          FinanceStorageService.deleteLedgerTransaction(txId, budget.year);
        if (updatedBudget && updatedBudget.year === budget.year) {
          setBudget({ ...updatedBudget });
        }
        setLedger({ ...updatedLedger });
        setHasUnsavedChanges(true);
        showToast('Deleted transaction from Funds ledger');
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
      },
    });
  };

  // Add new account to savings ledger
  const handleAddSavingsAccount = (accountData: Omit<SavingsAccount, 'id'>) => {
    const { ledger: updatedLedger, newAccount } =
      FinanceStorageService.addSavingsAccount(accountData);
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    showToast(`Added account "${newAccount.name}"`);
  };

  // Update/Rename account in savings ledger
  const handleUpdateSavingsAccount = (accountId: string, updates: Partial<SavingsAccount>) => {
    const { ledger: updatedLedger, updatedBudget, newName } =
      FinanceStorageService.updateSavingsAccount(accountId, updates, budget.year);
    if (!newName) return;
    if (updatedBudget) {
      setBudget({ ...updatedBudget });
    }
    setLedger({ ...updatedLedger });
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

    const {
      deleted,
      ledger: updatedLedger,
      updatedBudget,
      deletedAccountName,
      targetAccountName,
    } = FinanceStorageService.deleteSavingsAccount(accountId, reassignToAccountId, budget.year);
    if (!deleted || !deletedAccountName) return;

    if (updatedBudget) {
      setBudget({ ...updatedBudget });
      setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    }
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    showToast(
      `Deleted account "${deletedAccountName}"${
        targetAccountName ? ` (transferred to ${targetAccountName})` : ''
      }`
    );
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
        : 'Personalized categories saved'
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
        ? 'Personalized estimated budget template saved'
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

    const { budget: updatedBudget, ledger: updatedLedger } =
      FinanceStorageService.renameOrMergeSinkingFund(
        budget,
        oldClean,
        newClean,
        newMonthlyTarget,
        newSavingCategory
      );

    setLedger({ ...updatedLedger });
    setBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    setHasUnsavedChanges(true);
    showToast(
      oldClean.toLowerCase() !== newClean.toLowerCase()
        ? `Merged / renamed fund "${oldClean}" into "${newClean}"`
        : `Updated sinking fund "${newClean}"`
    );
  };

  // Delete a Sinking Fund and optionally reassign its balance to another fund or General Reserves
  const handleDeleteFund = (fundName: string, reassignToFund?: string) => {
    if (!fundName.trim()) return;
    const {
      budget: updatedBudget,
      ledger: updatedLedger,
      destination,
    } = FinanceStorageService.deleteSinkingFund(budget, fundName, reassignToFund);

    const isDestUnallocated = destination.toLowerCase() === 'general reserves / starting capital';
    setLedger({ ...updatedLedger });
    setBudget(updatedBudget);
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
    const {
      budget: updatedBudget,
      ledger: updatedLedger,
      newEntries,
    } = FinanceStorageService.addMultipleBudgetEntries(budget, entriesData, options);

    setBudget(updatedBudget);
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    showToast(
      options?.replacePeriod
        ? `Migrated ${newEntries.length} actual entries into ${options.replacePeriod} (${budget.year})`
        : `Added ${newEntries.length} items to period`
    );
  };

  // --- LOANS & RECEIVABLES HANDLERS ---

  const handleSaveLoan = (
    loan: LoanRecord,
    options?: {
      syncToTemplate?: boolean;
      disburseFromAccountId?: string;
    }
  ) => {
    const {
      ledger: updatedLedger,
      budget: updatedBudget,
      isUpdate,
      disbursedAccountName,
      disbursedAmount,
    } = FinanceStorageService.saveLoanContract(loan, budget, frequency, options);

    setBudget(updatedBudget);
    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    const currSym = updatedLedger.currency || '₱';
    showToast(
      isUpdate
        ? `Updated loan "${loan.name}"`
        : `Added ${loan.direction === 'borrowed' ? 'borrowed loan' : 'receivable'} "${loan.name}"${
            disbursedAccountName
              ? ` (${currSym}${disbursedAmount.toLocaleString()} deducted from ${disbursedAccountName})`
              : ''
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
        const { ledger: updatedLedger, budget: updatedBudget } =
          FinanceStorageService.deleteLoanContract(loanId, budget);
        setLedger({ ...updatedLedger });
        setBudget(updatedBudget);
        setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
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
    const {
      ledger: updatedLedger,
      updatedActiveBudget,
      loan,
      linkedBudgetEntryId,
      resolvedPeriod,
    } = FinanceStorageService.recordLoanPayment(loanId, paymentData, budget, frequency);
    if (!loan) return;

    if (updatedActiveBudget) {
      setBudget(updatedActiveBudget);
    } else if (paymentData.recordInBudget) {
      setAvailableYears(FinanceStorageService.getKnownYears());
    }

    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    showToast(
      `Recorded ₱${paymentData.amount.toLocaleString()} for "${loan.name}"${
        linkedBudgetEntryId ? ` & logged in ${resolvedPeriod} Budget Sheet` : ''
      }`
    );
  };

  const handleDeleteLoanPayment = (loanId: string, paymentId: string) => {
    const {
      ledger: updatedLedger,
      updatedActiveBudget,
      loan,
      removedPayment,
    } = FinanceStorageService.deleteLoanPayment(loanId, paymentId, budget);
    if (!loan || !removedPayment) return;

    if (updatedActiveBudget) {
      setBudget(updatedActiveBudget);
    }
    setLedger({ ...updatedLedger });
    setHasUnsavedChanges(true);
    showToast(`Removed payment of ₱${removedPayment.amount.toLocaleString()} from "${loan.name}"`);
  };

  const handleLinkLoanToTemplate = (loan: LoanRecord) => {
    const { updatedBudget, templateId } = FinanceStorageService.syncLoanToBudgetTemplate(
      loan,
      budget
    );
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
      title: 'Delete All Data & Reset Workspace?',
      description:
        'This will permanently delete all financial data in your current workspace — including all recorded budget entries across all years, your Estimate Budget Template & custom categories, and all Funds ledger transactions and balances.',
      affectedItems: [
        'All recorded budget entries across all years (deleted)',
        'Estimate Budget Template & custom categories (reset to blank)',
        'All savings ledger transactions & account balances (reset to ₱0)',
        'Local browser storage & active cloud workspace (cleared)',
      ],
      confirmLabel: 'Yes, Delete & Reset Workspace',
      isDestructive: true,
      onConfirm: async () => {
        FinanceStorageService.resetAllDataForGoLive();
        const {
          budget: cleanBudget,
          ledger: cleanLedger,
          templateData: cleanTemplate,
        } = FinanceStorageService.startFreshBlankWorkspace(2026);
        setBudget(cleanBudget);
        setLedger(cleanLedger);
        setTemplateData(cleanTemplate);
        setCurrentYear(2026);
        setAvailableYears([2026]);
        setHasUnsavedChanges(false);
        const currentUser = auth?.currentUser;
        if (currentUser) {
          try {
            await FirestoreSyncService.syncCompleteState(currentUser.uid, {
              activeYear: 2026,
              knownYears: [2026],
              frequency,
              budget: cleanBudget,
              templateData: cleanTemplate,
              ledgerData: cleanLedger,
            });
          } catch (err) {
            console.warn('Could not sync blank reset state to Firestore:', err);
          }
        }
        setConfirmationModal((m) => ({ ...m, isOpen: false }));
        showToast('Workspace data has been deleted and reset to a clean slate!', 'success');
      },
    });
  };

  // Workspace-compliant Optional Google Drive Save / Restore actions
  // Pull and restore all saved backup files from Google Drive and overwrite current database
  const handlePullAllSavedFromDrive = async () => {
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to restore your Drive backup.', 'info');
      return;
    }
    try {
      setDriveStatus((p) => ({
        ...p,
        isDriveBackupReady: true,
        isSyncing: true,
        isFirebaseSyncing: true,
        syncMessage: 'Restoring database from your Google Drive backup files...',
      }));
      const files = await FinanceStorageService.fetchDriveFiles(token);
      setDriveFiles(files);

      let restoredCount = 0;

      // 1. Discover and restore all annual budget files (e.g., capitalflow_budget_2025.json, capitalflow_budget_2026.json)
      const budgetFileRegex = /^capitalflow_budget_(\d{4})\.json$/;
      const discoveredYears: number[] = [];
      for (const f of files) {
        const match = f.name.match(budgetFileRegex);
        if (match) {
          const yr = parseInt(match[1], 10);
          if (yr >= 2000 && yr <= 2100 && !discoveredYears.includes(yr)) {
            discoveredYears.push(yr);
          }
        }
      }
      if (!discoveredYears.includes(currentYear)) {
        const hasCurrent = files.some((f) => f.name === getBudgetFileName(currentYear));
        if (hasCurrent) discoveredYears.push(currentYear);
      }

      for (const yr of discoveredYears) {
        const driveBudgetRes = await FinanceStorageService.fetchBudgetFromDrive(token, yr);
        if (driveBudgetRes) {
          const syncedDriveBudget: YearBudgetData = {
            ...driveBudgetRes.budget,
            year: yr,
            isPersonalizedTemplate: Boolean(driveBudgetRes.budget.isPersonalizedTemplate ?? true),
            isDefaultStarterData: false,
          };
          FinanceStorageService.registerKnownYear(yr, { skipFirestoreWrite: true });
          FinanceStorageService.saveLocalBudget(syncedDriveBudget, {
            preserveTimestamp: true,
            skipFirestoreWrite: true,
          });
          if (yr === currentYear) {
            setBudget(syncedDriveBudget);
            setTemplateData(FinanceStorageService.loadLocalTemplateData(syncedDriveBudget));
          }
          restoredCount++;
        }
      }

      // 2. Restore Estimate Budget Template file
      const existingTemplateFile = files.find((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);
      if (existingTemplateFile) {
        const driveTemplateRes = await FinanceStorageService.fetchTemplateFromDrive(token);
        if (driveTemplateRes) {
          const latestBudget = FinanceStorageService.loadLocalBudget(currentYear);
          const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
            driveTemplateRes.template,
            latestBudget,
            { skipFirestoreWrite: true }
          );
          setBudget(updatedBudget);
          setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
          restoredCount++;
        }
      }

      // 3. Restore Funds & Loans Ledger file
      const existingLedgerFile = files.find((f) => f.name === SAVINGS_LEDGER_FILE_NAME);
      if (existingLedgerFile) {
        const driveLedgerRes = await FinanceStorageService.fetchLedgerFromDrive(token);
        if (driveLedgerRes) {
          const syncedLedger: SavingsLedgerData = {
            ...driveLedgerRes.ledger,
            isDefaultStarterData: false,
          };
          FinanceStorageService.saveLocalSavingsLedger(syncedLedger, {
            preserveTimestamp: true,
            skipFirestoreWrite: true,
          });
          setLedger(syncedLedger);
          restoredCount++;
        }
      }

      const updatedYears = FinanceStorageService.getKnownYears();
      setAvailableYears(updatedYears);

      // 4. Ensure complete restored state is committed sequentially to Firebase Firestore
      const currentUser = auth?.currentUser;
      if (currentUser && restoredCount > 0) {
        const finalBudget = FinanceStorageService.loadLocalBudget(currentYear);
        const finalTemplate = FinanceStorageService.loadLocalTemplateData(finalBudget);
        const finalLedger = FinanceStorageService.loadLocalSavingsLedger();
        await FirestoreSyncService.syncCompleteState(currentUser.uid, {
          activeYear: currentYear,
          knownYears: updatedYears,
          frequency,
          budget: finalBudget,
          templateData: finalTemplate,
          ledgerData: finalLedger,
        });
        for (const yr of discoveredYears) {
          if (yr !== currentYear) {
            const otherYrBudget = FinanceStorageService.loadLocalBudget(yr);
            await FirestoreSyncService.saveAnnualBudget(currentUser.uid, otherYrBudget);
          }
        }
      }

      const nowStr = new Date().toLocaleTimeString();
      setDriveStatus((p) => ({
        ...p,
        isSyncing: false,
        isFirebaseSyncing: false,
        lastFirebaseSyncedAt: currentUser ? nowStr : p.lastFirebaseSyncedAt,
        syncMessage: null,
        lastSyncedAt: nowStr,
      }));
      setHasUnsavedChanges(false);

      if (restoredCount > 0) {
        showToast(
          `Restored ${restoredCount} backup file(s) from Google Drive and updated your database!`,
          'success'
        );
      } else {
        showToast('No backup files found in Google Drive yet.', 'info');
      }
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive token expired. Click Restore from Drive Backup again to re-authorize Drive.');
        return;
      }
      let readableMsg = err?.message || 'Unknown error';
      try {
        const parsed = JSON.parse(readableMsg);
        if (parsed && typeof parsed.error === 'string') {
          readableMsg = `${parsed.error} (${parsed.operationType || 'op'} on ${parsed.path || 'db'})`;
        }
      } catch {
        // Not JSON
      }
      setDriveStatus((p) => ({
        ...p,
        isSyncing: false,
        isFirebaseSyncing: false,
        syncMessage: null,
        error: readableMsg,
      }));
      showToast(`Failed to restore from Drive backup: ${readableMsg}`, 'error');
    } finally {
      setConfirmationModal((m) => ({ ...m, isOpen: false }));
    }
  };

  const triggerRestoreAllFromDrive = async () => {
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to restore from your Drive backup.', 'info');
      return;
    }
    try {
      setDriveStatus((p) => ({
        ...p,
        isDriveBackupReady: true,
        isSyncing: true,
        syncMessage: 'Checking backup files in Google Drive...',
      }));
      const files = await FinanceStorageService.fetchDriveFiles(token);
      setDriveFiles(files);
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));

      if (files.length === 0) {
        showToast(`No backup files found in "${CAPITALFLOW_DRIVE_FOLDER_NAME}" on Google Drive.`, 'info');
        return;
      }

      const affectedItems = files.map(
        (f) =>
          `${f.name}${
            f.modifiedTime ? ` (Saved ${new Date(f.modifiedTime).toLocaleString()})` : ''
          }`
      );

      setConfirmationModal({
        isOpen: true,
        title: 'Restore Database from Google Drive Backup?',
        description: `This will overwrite your current database (Annual Budgets, Recurring Templates, and Funds & Loans Ledger) with the backup files stored in "${CAPITALFLOW_DRIVE_FOLDER_NAME}" on your Google Drive. Make sure you have saved a backup of any recent changes before proceeding.`,
        affectedItems,
        confirmLabel: 'Restore & Overwrite Database',
        isDestructive: true,
        onConfirm: handlePullAllSavedFromDrive,
      });
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive token expired. Click Restore from Drive Backup again to re-authorize Drive.');
        return;
      }
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
      showToast(`Error checking Google Drive backup: ${err.message}`, 'error');
    }
  };

  const triggerSaveBudgetToDrive = async () => {
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to back up your budget.', 'info');
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
      title: `Backup Annual Budget to Google Drive`,
      description: `Save a secondary JSON backup of the ${budget.year} budget data to the dedicated "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in your Google Drive?`,
      affectedItems: [`${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${fileName}`],
      confirmLabel: 'Backup to Google Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isDriveBackupReady: true,
            isSyncing: true,
            syncMessage: `Backing up ${fileName} to Google Drive...`,
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
          showToast(`Successfully backed up ${fileName} inside "${CAPITALFLOW_DRIVE_FOLDER_NAME}"!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive token expired. Click Backup again to re-authorize Drive.');
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
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to back up your template.', 'info');
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
      title: `Backup Estimate Budget Template to Google Drive`,
      description: `Save your personalized Categories and Estimated Budget Item Templates as a secondary JSON backup inside the "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in Google Drive?`,
      affectedItems: [`${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${BUDGET_TEMPLATE_FILE_NAME}`],
      confirmLabel: 'Backup Template to Google Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isDriveBackupReady: true,
            isSyncing: true,
            syncMessage: `Backing up ${BUDGET_TEMPLATE_FILE_NAME} to Google Drive...`,
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
          showToast(`Successfully backed up ${BUDGET_TEMPLATE_FILE_NAME} inside "${CAPITALFLOW_DRIVE_FOLDER_NAME}"!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive token expired. Click Backup again to re-authorize Drive.');
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
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to back up your Funds ledger.', 'info');
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
      title: `Backup Funds Ledger to Google Drive`,
      description: `Save your multi-year capital ledger and account balances as a secondary JSON backup to the dedicated "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in your Google Drive?`,
      affectedItems: [`${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${SAVINGS_LEDGER_FILE_NAME}`],
      confirmLabel: 'Backup Ledger to Google Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isDriveBackupReady: true,
            isSyncing: true,
            syncMessage: `Backing up ${SAVINGS_LEDGER_FILE_NAME} to Google Drive...`,
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
          showToast(`Successfully backed up ${SAVINGS_LEDGER_FILE_NAME} inside "${CAPITALFLOW_DRIVE_FOLDER_NAME}"!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive token expired. Click Backup again to re-authorize Drive.');
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
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to back up your JSON files.', 'info');
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

    const allKnownYears = Array.from(new Set([...FinanceStorageService.getKnownYears(), budget.year])).sort(
      (a, b) => a - b
    );
    const affectedDriveFiles = [
      ...allKnownYears.map((yr) => `${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${getBudgetFileName(yr)}`),
      `${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${BUDGET_TEMPLATE_FILE_NAME}`,
      `${CAPITALFLOW_DRIVE_FOLDER_NAME} / ${SAVINGS_LEDGER_FILE_NAME}`,
    ];

    setConfirmationModal({
      isOpen: true,
      title: 'Backup All Financial Data to Google Drive (Optional)',
      description: `Your primary database is already automatically saved in Firebase Firestore. Would you also like to export and update your JSON backup files inside the "${CAPITALFLOW_DRIVE_FOLDER_NAME}" folder in your Google Drive?`,
      affectedItems: affectedDriveFiles,
      confirmLabel: 'Backup All Files to Drive',
      onConfirm: async () => {
        try {
          setDriveStatus((p) => ({
            ...p,
            isDriveBackupReady: true,
            isSyncing: true,
            syncMessage: `Backing up ${budget.year} Annual Budget to Google Drive...`,
          }));
          const latestTemplate = FinanceStorageService.loadLocalTemplateData(budget);
          const budgetRes = await FinanceStorageService.syncBudgetToDrive(token, budget);

          for (const yr of allKnownYears) {
            if (yr !== budget.year) {
              const otherBudget = FinanceStorageService.loadLocalBudget(yr);
              await FinanceStorageService.syncBudgetToDrive(token, otherBudget);
            }
          }

          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Backing up Estimate Budget Template to Google Drive...',
          }));
          const templateRes = await FinanceStorageService.syncTemplateToDrive(token, latestTemplate);

          setDriveStatus((p) => ({
            ...p,
            syncMessage: 'Backing up Funds & Capital Ledger to Google Drive...',
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
          showToast(`Backed up ${affectedDriveFiles.length} JSON database files into "${CAPITALFLOW_DRIVE_FOLDER_NAME}" in Google Drive!`);
        } catch (err: any) {
          if (isSessionExpiredError(err)) {
            handleSessionExpired('Google Drive token expired. Click Backup again to re-authorize Drive.');
            return;
          }
          setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
          showToast(`Drive backup failed: ${err.message}`, 'error');
        } finally {
          setConfirmationModal((m) => ({ ...m, isOpen: false }));
        }
      },
    });
  };

  // Direct 1-click sync without modal prompt (for floating reminder banner)
  const triggerDirectSyncAll = async () => {
    const currentUser = auth?.currentUser;
    if (currentUser) {
      setHasUnsavedChanges(false);
      return;
    }

    const token = await ensureDriveAccessToken();
    if (!token) {
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
        isDriveBackupReady: true,
        isSyncing: true,
        syncMessage: `Backing up ${budget.year} Annual Budget (1/3) to Google Drive...`,
      }));
      const latestTemplate = FinanceStorageService.loadLocalTemplateData(budget);
      const budgetRes = await FinanceStorageService.syncBudgetToDrive(token, budget);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Backing up Estimate Budget Template (2/3) to Google Drive...',
      }));
      const templateRes = await FinanceStorageService.syncTemplateToDrive(token, latestTemplate);

      setDriveStatus((p) => ({
        ...p,
        syncMessage: 'Backing up Funds & Capital Ledger (3/3) to Google Drive...',
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
      showToast(`Backed up all files into "${CAPITALFLOW_DRIVE_FOLDER_NAME}" in Google Drive!`);
    } catch (err: any) {
      if (isSessionExpiredError(err)) {
        handleSessionExpired('Google Drive token expired.');
        return;
      }
      setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null, error: err.message }));
      showToast(`Backup failed: ${err.message}`, 'error');
    }
  };

  const triggerOrganizeDriveFolder = async () => {
    const token = await ensureDriveAccessToken();
    if (!token) {
      showToast('Please authorize Google Drive access to organize your Drive folder.', 'info');
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
            isDriveBackupReady: true,
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
            handleSessionExpired('Google Drive token expired.');
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

  // Mobile Pull-to-Refresh handler (soft in-app refresh)
  const handleSoftRefresh = useCallback(async () => {
    try {
      const currentUser = auth?.currentUser;
      if (currentUser) {
        await hydrateOrSyncFirebaseWorkspace(currentUser, await getAccessToken());
      } else {
        const freshBudget = FinanceStorageService.loadLocalBudget(currentYear);
        const freshLedger = FinanceStorageService.loadLocalSavingsLedger();
        const freshTemplate = FinanceStorageService.loadLocalTemplateData(freshBudget);
        const knownYears = FinanceStorageService.getKnownYears();

        setBudget(freshBudget);
        setLedger(freshLedger);
        setTemplateData(freshTemplate);
        setAvailableYears(knownYears);
      }

      if (driveStatus.isSignedIn) {
        const token = await getAccessToken();
        if (token && !isDriveTokenExpired()) {
          try {
            const files = await FinanceStorageService.fetchDriveFiles(token);
            setDriveFiles(files);
            setDriveStatus((prev) => ({
              ...prev,
              lastSynced: new Date(),
            }));
          } catch {
            // Keep existing drive files if offline or token check fails
          }
        }
      }

      showToast('Data refreshed');
    } catch (err: any) {
      console.warn('Soft refresh failed:', err);
      showToast('Refresh complete');
    }
  }, [currentYear, driveStatus.isSignedIn, hydrateOrSyncFirebaseWorkspace]);

  return (
    <PullToRefresh onRefresh={handleSoftRefresh}>
      <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans flex flex-col antialiased overflow-x-clip">
      
      {/* Clean Single Cloud Sync Toast (Shown only when no modal is open) */}
      {driveStatus.isSyncing && !confirmationModal.isOpen && !conflictModalState.isOpen && (
        <div className="fixed bottom-20 md:bottom-6 right-4 sm:right-6 z-[90] transform-gpu pointer-events-none">
          <div className="px-4 py-3 rounded-2xl shadow-xl bg-slate-900 dark:bg-slate-800 border border-slate-700/80 flex items-center gap-2.5 text-xs font-semibold text-white">
            <RefreshCw className="w-4 h-4 animate-spin text-indigo-400 shrink-0" />
            <span>{driveStatus.syncMessage || 'Syncing with Cloud Database...'}</span>
          </div>
        </div>
      )}

      {/* Floating Notification Banner: Unsaved Local Changes when signed out (when signed in, Firebase Cloud DB auto-saves) */}
      {hasUnsavedChanges &&
        !driveStatus.isSignedIn &&
        !isSyncReminderDismissed &&
        !driveStatus.isSyncing &&
        !(isDefaultStarterBudget(budget) && isDefaultStarterLedger(ledger)) && (
        <div className="fixed bottom-20 md:bottom-6 left-3 right-3 sm:left-6 sm:right-auto z-40 max-w-md transform-gpu">
          <div className="bg-slate-900 dark:bg-slate-800 text-white rounded-2xl p-3 sm:p-4 shadow-2xl border border-amber-500/40 flex items-center justify-between gap-2.5 sm:gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-slate-100 flex items-center gap-1.5">
                    <span>Local-Only Mode</span>
                    <span className="w-2 h-2 rounded-full bg-amber-400" />
                  </h4>
                </div>
                <p className="text-[11px] text-slate-300 mt-0.5 leading-snug">
                  Local edits saved on device. Sign in to auto-save to Firebase Cloud DB.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleSignInWithGoogle}
                disabled={driveStatus.isSyncing}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-emerald-600/30 transition-all cursor-pointer"
              >
                <span>Sign In &amp; Sync</span>
              </button>

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
        <div className="fixed bottom-24 right-4 sm:bottom-6 sm:right-6 z-50 transform-gpu">
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
        onSignInAgain={() => handleSignInWithGoogle(false)}
        onContinueOffline={() => setIsSessionExpiredModalOpen(false)}
        isSigningIn={driveStatus.isSyncing}
      />

      {/* In-App Browser (Messenger / IG / FB) & Storage Partitioning Auth Guide Modal */}
      <InAppBrowserAuthModal
        isOpen={isInAppBrowserModalOpen}
        browserEnv={browserEnv}
        errorMessage={inAppBrowserErrorMsg}
        onClose={() => setIsInAppBrowserModalOpen(false)}
        onStartBlankLocalWorkspace={isDefaultStarterBudget(budget) ? handleStartBlankWorkspace : undefined}
        onForceSignInAnyway={() => handleSignInWithGoogle(true)}
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
        onSignInWithGoogle={() => handleSignInWithGoogle(false)}
        onSignOut={handleSignOut}
        onOpenDriveModal={() => setActiveTab('drive')}
        onTriggerSync={triggerSyncAll}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Body Views */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6">
        {/* In-App Browser (Messenger / Facebook / Instagram) Proactive Guidance Banner */}
        {browserEnv.isInAppBrowser && !isInAppBannerDismissed && !driveStatus.isSignedIn && (
          <div className="mb-4 rounded-2xl border border-indigo-300/80 dark:border-indigo-700/60 bg-indigo-50/95 dark:bg-indigo-950/50 px-3.5 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-xs">
            <div className="flex items-start sm:items-center gap-2.5 min-w-0">
              <div className="p-1.5 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5 sm:mt-0">
                <Smartphone className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200">
                    Opened in {browserEnv.browserName} In-App Browser
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md bg-indigo-200/70 dark:bg-indigo-900/70 text-indigo-800 dark:text-indigo-300">
                    Local Mode Ready
                  </span>
                </div>
                <p className="text-[11px] text-indigo-900/90 dark:text-indigo-300/85 mt-0.5 leading-snug">
                  You can use CapitalFlow right here on your device, or tap <strong>&bull;&bull;&bull; &rarr; Open in external browser</strong> (Safari/Chrome) to sign in with Google.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(browserEnv.appUrl);
                  } catch {
                    // Ignore clipboard fallback
                  }
                  setInAppBannerCopied(true);
                  setTimeout(() => setInAppBannerCopied(false), 3000);
                }}
                className="h-8 px-2.5 rounded-xl bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-indigo-200 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer"
              >
                {inAppBannerCopied ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setIsInAppBrowserModalOpen(true)}
                className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <span>How to Open in Browser</span>
              </button>
              <button
                type="button"
                onClick={() => setIsInAppBannerDismissed(true)}
                className="p-1.5 rounded-lg text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-200 transition-colors cursor-pointer"
                title="Dismiss"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

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
                    Protected from Cloud Overwrite
                  </span>
                </div>
                <p className="text-[11px] text-amber-800/90 dark:text-amber-300/80 mt-0.5 leading-snug">
                  You are viewing built-in sample numbers. New user? Click <strong>Start My Blank Budget</strong> to clear sample data, or sign in to restore from Firebase Cloud DB or Google Drive.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={handleStartBlankWorkspace}
                className="h-8 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Start My Blank Budget</span>
              </button>
              {driveStatus.isSignedIn ? (
                <button
                  type="button"
                  onClick={triggerRestoreAllFromDrive}
                  disabled={driveStatus.isSyncing}
                  className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Restore from Drive Backup</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSignInWithGoogle(false)}
                  disabled={driveStatus.isSyncing}
                  className="h-8 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5" />
                  <span>Sign In to Cloud DB</span>
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
            onChangeFrequency={(nextFreq) => {
              setFrequency(nextFreq);
              if (auth?.currentUser) {
                void FirestoreSyncService.saveWorkspace(auth.currentUser.uid, { frequency: nextFreq });
              }
            }}
            onAddEntry={handleAddBudgetEntry}
            onAddMultipleEntries={handleAddMultipleBudgetEntries}
            onUpdateEntry={handleUpdateBudgetEntry}
            onDeleteEntry={handleDeleteBudgetEntry}
            onDeletePeriodItem={handleDeletePeriodItem}
            onRestorePeriodItems={handleRestorePeriodItems}
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
            onRestoreFromDrive={triggerRestoreAllFromDrive}
            onPullBudget={async (yr) => {
              const token = await ensureDriveAccessToken();
              if (!token) {
                showToast('Please authorize Google Drive access to load your Drive backup.', 'info');
                return;
              }
              try {
                setDriveStatus((p) => ({
                  ...p,
                  isDriveBackupReady: true,
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
                  title: `Overwrite Local ${yr} Budget with Google Drive Backup?`,
                  description: localIsNewer
                    ? `Warning: Your current ${yr} budget has NEWER edits than Google Drive. Overwriting will replace your current budget with the Drive backup (${driveRes.budget.entries.length} entries).`
                    : `Load ${yr} budget from Google Drive backup (${driveRes.budget.entries.length} entries)? This will update your workspace and Firebase Cloud DB.`,
                  affectedItems: [getBudgetFileName(yr)],
                  confirmLabel: 'Yes, Restore from Drive',
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
                    showToast(`Restored ${yr} budget from Google Drive backup`, 'success');
                    setConfirmationModal((m) => ({ ...m, isOpen: false }));
                  },
                });
              } catch (err: any) {
                if (isSessionExpiredError(err)) {
                  handleSessionExpired('Google Drive token expired.');
                  return;
                }
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                showToast(`Failed to pull from Drive: ${err.message}`, 'error');
              }
            }}
            onPullTemplate={async () => {
              const token = await ensureDriveAccessToken();
              if (!token) {
                showToast('Please authorize Google Drive access to load your Drive backup.', 'info');
                return;
              }
              try {
                setDriveStatus((p) => ({
                  ...p,
                  isDriveBackupReady: true,
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
                  title: 'Restore Estimate Template from Google Drive Backup?',
                  description: localIsNewer
                    ? `Warning: Your current Estimate Budget Template has NEWER edits than Google Drive. Overwriting will replace your categories and ${currentLocalTpl.itemTemplates.length} item templates with the Drive backup (${driveRes.template.itemTemplates.length} item templates).`
                    : `Load Estimate Budget Template from Google Drive backup (${driveRes.template.itemTemplates.length} item templates)? This will update your categories and recurring item templates.`,
                  affectedItems: [BUDGET_TEMPLATE_FILE_NAME],
                  confirmLabel: 'Yes, Restore Template',
                  isDestructive: localIsNewer,
                  onConfirm: async () => {
                    const latestBudget = FinanceStorageService.loadLocalBudget(currentYear);
                    const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(
                      driveRes.template,
                      latestBudget
                    );
                    setBudget(updatedBudget);
                    setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
                    setHasUnsavedChanges(false);
                    showToast('Restored Estimate Budget Template from Google Drive backup', 'success');
                    setConfirmationModal((m) => ({ ...m, isOpen: false }));
                  },
                });
              } catch (err: any) {
                if (isSessionExpiredError(err)) {
                  handleSessionExpired('Google Drive token expired.');
                  return;
                }
                setDriveStatus((p) => ({ ...p, isSyncing: false, syncMessage: null }));
                showToast(`Failed to pull template: ${err.message}`, 'error');
              }
            }}
            onPullLedger={async () => {
              const token = await ensureDriveAccessToken();
              if (!token) {
                showToast('Please authorize Google Drive access to load your Drive backup.', 'info');
                return;
              }
              try {
                setDriveStatus((p) => ({
                  ...p,
                  isDriveBackupReady: true,
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
                  title: 'Restore Funds Ledger from Google Drive Backup?',
                  description: localIsNewer
                    ? `Warning: Your current Funds ledger has NEWER edits than Google Drive. Overwriting will replace your transactions (${currentLocalLedger.transactions.length}) with the Drive backup (${driveRes.ledger.transactions.length}).`
                    : `Load Funds ledger from Google Drive backup (${driveRes.ledger.transactions.length} transactions)? This will update your workspace and Firebase Cloud DB.`,
                  affectedItems: [SAVINGS_LEDGER_FILE_NAME],
                  confirmLabel: 'Yes, Restore Ledger',
                  isDestructive: localIsNewer,
                  onConfirm: async () => {
                    const syncedLedger = { ...driveRes.ledger, isDefaultStarterData: false };
                    FinanceStorageService.saveLocalSavingsLedger(syncedLedger, { preserveTimestamp: true });
                    setLedger(syncedLedger);
                    setHasUnsavedChanges(false);
                    showToast('Restored Funds ledger from Google Drive backup', 'success');
                    setConfirmationModal((m) => ({ ...m, isOpen: false }));
                  },
                });
              } catch (err: any) {
                if (isSessionExpiredError(err)) {
                  handleSessionExpired('Google Drive token expired.');
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
              const { budget: normalizedBudget } = FinanceStorageService.normalizeBudgetTemplates({
                ...jsonData,
                isDefaultStarterData: false,
              });
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
              const latestBudget = FinanceStorageService.loadLocalBudget(currentYear);
              const updatedBudget = FinanceStorageService.applyTemplateDataToBudget(tplJson, latestBudget);
              setBudget(updatedBudget);
              setTemplateData(FinanceStorageService.loadLocalTemplateData(updatedBudget));
              setHasUnsavedChanges(true);
              showToast('Imported personalized Estimate Budget Template JSON');
            }}
            onImportLedgerJson={(ledgerJson) => {
              FinanceStorageService.saveLocalSavingsLedger({
                ...ledgerJson,
                isDefaultStarterData: false,
              });
              const normalizedLedger = FinanceStorageService.loadLocalSavingsLedger();
              setLedger(normalizedLedger);
              setHasUnsavedChanges(true);
              showToast('Imported Funds Ledger JSON');
            }}
            onImportFullBackupJson={async ({
              budget: backupBudget,
              budgetsByYear,
              templateData: backupTemplate,
              ledger: backupLedger,
            }) => {
              const targetYear = backupBudget.year || currentYear;
              const restoredYears: number[] = [];

              // 1. Restore any additional annual budgets included in budgetsByYear
              if (budgetsByYear && typeof budgetsByYear === 'object') {
                for (const [yrKey, yrBudget] of Object.entries(budgetsByYear)) {
                  const yrNum = parseInt(yrKey, 10);
                  if (!isNaN(yrNum) && yrBudget && typeof yrBudget === 'object' && yrNum !== targetYear) {
                    const { budget: normYr } = FinanceStorageService.normalizeBudgetTemplates({
                      ...yrBudget,
                      year: yrNum,
                      isDefaultStarterData: false,
                    });
                    FinanceStorageService.registerKnownYear(yrNum, { skipFirestoreWrite: true });
                    FinanceStorageService.saveLocalBudget(normYr, {
                      skipTemplateProfileUpdate: true,
                      skipFirestoreWrite: true,
                    });
                    restoredYears.push(yrNum);
                  }
                }
              }

              // 2. Normalize and save primary budget year + templateData atomically (no stale currentYear race)
              const { budget: normalizedPrimary } = FinanceStorageService.normalizeBudgetTemplates({
                ...backupBudget,
                year: targetYear,
                isDefaultStarterData: false,
              });
              FinanceStorageService.registerKnownYear(targetYear, { skipFirestoreWrite: true });
              const finalPrimaryBudget = backupTemplate
                ? FinanceStorageService.applyTemplateDataToBudget(backupTemplate, normalizedPrimary, {
                    skipFirestoreWrite: true,
                  })
                : normalizedPrimary;
              FinanceStorageService.saveLocalBudget(finalPrimaryBudget, { skipFirestoreWrite: true });
              restoredYears.push(targetYear);

              // 3. Save Funds & Loans Ledger
              FinanceStorageService.saveLocalSavingsLedger(
                {
                  ...backupLedger,
                  isDefaultStarterData: false,
                },
                { skipFirestoreWrite: true }
              );
              const finalLedger = FinanceStorageService.loadLocalSavingsLedger();
              const finalTemplate = FinanceStorageService.loadLocalTemplateData(finalPrimaryBudget);
              const updatedYears = FinanceStorageService.getKnownYears();

              setAvailableYears(updatedYears);
              setCurrentYear(targetYear);
              setBudget(finalPrimaryBudget);
              setTemplateData(finalTemplate);
              setLedger(finalLedger);
              setHasUnsavedChanges(true);

              // 4. Sync complete restored state to Firebase Firestore when signed in
              const currentUser = auth?.currentUser;
              if (currentUser) {
                try {
                  await FirestoreSyncService.syncCompleteState(currentUser.uid, {
                    activeYear: targetYear,
                    knownYears: updatedYears,
                    frequency,
                    budget: finalPrimaryBudget,
                    templateData: finalTemplate,
                    ledgerData: finalLedger,
                  });
                  for (const yr of restoredYears) {
                    if (yr !== targetYear) {
                      const otherYrBudget = FinanceStorageService.loadLocalBudget(yr);
                      await FirestoreSyncService.saveAnnualBudget(currentUser.uid, otherYrBudget);
                    }
                  }
                  setHasUnsavedChanges(false);
                } catch (err) {
                  console.warn('Could not sync restored full backup to Firestore:', err);
                }
              }
              showToast(`Restored full backup (${restoredYears.length} budget year${restoredYears.length > 1 ? 's' : ''}, templates & ledger)!`, 'success');
            }}
            onError={(msg) => showToast(msg, 'error')}
            onResetDataForGoLive={handleResetDataForGoLive}
            onOrganizeDriveFolder={triggerOrganizeDriveFolder}
          />
        )}

        {activeTab === 'help' && (
          <HelpGuideView
            onNavigateTab={setActiveTab}
            currentYear={currentYear}
            frequency={frequency}
            onChangeFrequency={setFrequency}
            currencySymbol="₱"
            isStarterSampleActive={isDefaultStarterBudget(budget)}
            onStartBlankWorkspace={handleStartBlankWorkspace}
            onSignInWithGoogle={() => handleSignInWithGoogle(false)}
            isSignedIn={driveStatus.isSignedIn}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="bg-slate-100 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 pt-6 pb-24 md:pb-6 text-center text-xs text-slate-500 dark:text-slate-400">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
            <span className="font-semibold text-slate-700 dark:text-slate-300">CapitalFlow</span>
            <span className="px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-[10px] font-mono font-semibold text-slate-600 dark:text-slate-400">
              v{APP_VERSION}
            </span>
            <span>&bull;</span>
            <span>Google Drive Folder: /{CAPITALFLOW_DRIVE_FOLDER_NAME}/</span>
            <span>&bull;</span>
            <button
              type="button"
              onClick={() => {
                setActiveTab('help');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="underline hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
            >
              User Guide &amp; Help
            </button>
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
    </PullToRefresh>
  );
}
