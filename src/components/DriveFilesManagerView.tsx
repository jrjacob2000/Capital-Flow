import React, { useState } from 'react';
import {
  Cloud,
  CheckCircle2,
  RefreshCw,
  HardDrive,
  FileCode,
  Download,
  Upload,
  Calendar,
  PiggyBank,
  AlertCircle,
  ExternalLink,
  ShieldCheck,
  Plus,
  Trash2,
  Eye,
  X,
  Folder,
  FolderCheck,
  FolderOpen,
  Sliders,
  ChevronDown,
  ChevronUp,
  RotateCcw,
} from 'lucide-react';
import {
  DriveSyncStatus,
  DriveFileInfo,
  YearBudgetData,
  SavingsLedgerData,
  BudgetTemplateData,
  APP_VERSION,
} from '../types/finance';
import {
  getBudgetFileName,
  SAVINGS_LEDGER_FILE_NAME,
  BUDGET_TEMPLATE_FILE_NAME,
  CAPITALFLOW_DRIVE_FOLDER_NAME,
} from '../services/driveService';
import { FinanceStorageService } from '../services/storageService';

interface DriveFilesManagerViewProps {
  driveStatus: DriveSyncStatus;
  currentYear: number;
  budget: YearBudgetData;
  ledger: SavingsLedgerData;
  templateData: BudgetTemplateData;
  driveFiles: DriveFileInfo[];
  onSignIn: () => void;
  onSyncAll: () => void;
  onRestoreFromDrive?: () => void;
  onPullBudget: (year: number) => void;
  onPullLedger: () => void;
  onPullTemplate: () => void;
  onSaveBudgetToDrive: () => void;
  onSaveLedgerToDrive: () => void;
  onSaveTemplateToDrive: () => void;
  onAddNewYear: () => void;
  onSelectYear: (year: number) => void;
  onImportBudgetJson: (jsonData: YearBudgetData) => void;
  onImportTemplateJson?: (templateJson: BudgetTemplateData) => void;
  onImportLedgerJson?: (ledgerJson: SavingsLedgerData) => void;
  onImportFullBackupJson?: (payload: {
    budget: YearBudgetData;
    budgetsByYear?: Record<number, YearBudgetData>;
    templateData?: BudgetTemplateData;
    ledger: SavingsLedgerData;
  }) => void;
  onError?: (message: string) => void;
  onResetDataForGoLive?: () => void;
  onOrganizeDriveFolder?: () => void;
}

export const DriveFilesManagerView: React.FC<DriveFilesManagerViewProps> = ({
  driveStatus,
  currentYear,
  budget,
  ledger,
  templateData,
  driveFiles,
  onSignIn,
  onSyncAll,
  onRestoreFromDrive,
  onPullBudget,
  onPullLedger,
  onPullTemplate,
  onSaveBudgetToDrive,
  onSaveLedgerToDrive,
  onSaveTemplateToDrive,
  onAddNewYear,
  onSelectYear,
  onImportBudgetJson,
  onImportTemplateJson,
  onImportLedgerJson,
  onImportFullBackupJson,
  onError,
  onResetDataForGoLive,
  onOrganizeDriveFolder,
}) => {
  const [activeJsonViewer, setActiveJsonViewer] = useState<'budget' | 'ledger' | 'template' | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [showAdvancedFiles, setShowAdvancedFiles] = useState(false);
  const [pendingJsonRestore, setPendingJsonRestore] = useState<{
    fileName: string;
    affectedItems: string[];
    onConfirm: () => void;
  } | null>(null);

  const budgetFileName = getBudgetFileName(currentYear);
  const budgetDriveFile = driveFiles.find((f) => f.name === budgetFileName);
  const ledgerDriveFile = driveFiles.find((f) => f.name === SAVINGS_LEDGER_FILE_NAME);
  const templateDriveFile = driveFiles.find((f) => f.name === BUDGET_TEMPLATE_FILE_NAME);

  const folderName = driveStatus.folderName || CAPITALFLOW_DRIVE_FOLDER_NAME;
  const folderId = driveStatus.folderId || null;
  const unorganizedFilesCount = folderId
    ? driveFiles.filter((f) => !f.parents?.includes(folderId)).length
    : driveFiles.length;

  const budgetTimestampStatus = budgetDriveFile
    ? FinanceStorageService.compareTimestamps(budget.lastUpdated, budgetDriveFile.modifiedTime)
    : null;

  const ledgerTimestampStatus = ledgerDriveFile
    ? FinanceStorageService.compareTimestamps(ledger.lastUpdated, ledgerDriveFile.modifiedTime)
    : null;

  const templateTimestampStatus = templateDriveFile
    ? FinanceStorageService.compareTimestamps(templateData.lastUpdated, templateDriveFile.modifiedTime)
    : null;

  const totalCustomCategoriesCount =
    (templateData.customCategories?.expense?.length || 0) +
    (templateData.customCategories?.income?.length || 0) +
    (templateData.customCategories?.saving?.length || 0);

  const handleDownload = (data: any, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadFullBackup = () => {
    const knownYears = FinanceStorageService.getKnownYears();
    const budgetsByYear: Record<number, YearBudgetData> = {};
    knownYears.forEach((yr) => {
      budgetsByYear[yr] = yr === budget.year ? budget : FinanceStorageService.loadLocalBudget(yr);
    });
    budgetsByYear[budget.year] = budget;

    const fullBackup = {
      backupVersion: '1.1',
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      budget,
      budgetsByYear,
      templateData,
      ledger,
    };
    const dateStr = new Date().toISOString().split('T')[0];
    handleDownload(fullBackup, `capitalflow_full_backup_${budget.year}_${dateStr}.json`);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const MAX_IMPORT_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB safety limit
    if (file.size > MAX_IMPORT_FILE_SIZE_BYTES) {
      onError?.('File is too large (max 10 MB allowed).');
      e.target.value = '';
      return;
    }

    const uploadedFileName = file.name;
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawParsed = JSON.parse(event.target?.result as string);
        const parsed = FinanceStorageService.sanitizeImportedJson<any>(rawParsed);
        if (!parsed || typeof parsed !== 'object') {
          onError?.('Invalid JSON structure.');
          return;
        }

        if (parsed.backupVersion && parsed.budget && parsed.ledger) {
          const mergedBudget: YearBudgetData = parsed.templateData
            ? {
                ...parsed.budget,
                customCategories: parsed.templateData.customCategories || parsed.budget.customCategories,
                itemTemplates: parsed.templateData.itemTemplates || parsed.budget.itemTemplates,
                isPersonalizedTemplate:
                  parsed.templateData.isPersonalizedTemplate ?? parsed.budget.isPersonalizedTemplate,
              }
            : parsed.budget;

          const extraYears =
            parsed.budgetsByYear && typeof parsed.budgetsByYear === 'object'
              ? Object.keys(parsed.budgetsByYear)
                  .map((y) => parseInt(y, 10))
                  .filter((y) => !isNaN(y) && y !== mergedBudget.year)
              : [];

          const items: string[] = [
            `Overwrite Annual Budget (${mergedBudget.year}) — ${(mergedBudget.entries || []).length} entries`,
            ...extraYears.map(
              (yr) =>
                `Overwrite Annual Budget (${yr}) — ${(parsed.budgetsByYear[yr]?.entries || []).length} entries`
            ),
          ];
          if (parsed.templateData) {
            items.push(
              `Overwrite Estimate Budget Template — ${(parsed.templateData.itemTemplates || []).length} recurring items`
            );
          }
          if (parsed.ledger) {
            items.push(
              `Overwrite Funds & Loans Ledger — ${(parsed.ledger.accounts || []).length} accounts, ${(parsed.ledger.transactions || []).length} transactions`
            );
          }
          setPendingJsonRestore({
            fileName: uploadedFileName,
            affectedItems: items,
            onConfirm: () => {
              if (onImportFullBackupJson) {
                onImportFullBackupJson({
                  budget: mergedBudget,
                  budgetsByYear: parsed.budgetsByYear,
                  templateData: parsed.templateData,
                  ledger: parsed.ledger,
                });
              } else {
                onImportBudgetJson(mergedBudget);
                if (parsed.templateData && onImportTemplateJson) {
                  onImportTemplateJson(parsed.templateData);
                }
                if (parsed.ledger && onImportLedgerJson) {
                  onImportLedgerJson(parsed.ledger);
                }
              }
              setPendingJsonRestore(null);
            },
          });
        } else if (typeof parsed.year === 'number' && Array.isArray(parsed.entries)) {
          setPendingJsonRestore({
            fileName: uploadedFileName,
            affectedItems: [
              `Overwrite Annual Budget (${parsed.year}) — ${parsed.entries.length} entries`,
            ],
            onConfirm: () => {
              onImportBudgetJson(parsed as YearBudgetData);
              setPendingJsonRestore(null);
            },
          });
        } else if (Array.isArray(parsed.itemTemplates) && parsed.customCategories && onImportTemplateJson) {
          setPendingJsonRestore({
            fileName: uploadedFileName,
            affectedItems: [
              `Overwrite Estimate Budget Template — ${parsed.itemTemplates.length} recurring items`,
            ],
            onConfirm: () => {
              onImportTemplateJson(parsed as BudgetTemplateData);
              setPendingJsonRestore(null);
            },
          });
        } else if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions) && onImportLedgerJson) {
          setPendingJsonRestore({
            fileName: uploadedFileName,
            affectedItems: [
              `Overwrite Funds & Loans Ledger — ${parsed.accounts.length} accounts, ${parsed.transactions.length} transactions`,
            ],
            onConfirm: () => {
              onImportLedgerJson(parsed as SavingsLedgerData);
              setPendingJsonRestore(null);
            },
          });
        } else {
          onError?.('Invalid format. File must be a CapitalFlow Full Backup, Annual Budget, Estimate Template, or Funds Ledger JSON.');
        }
      } catch {
        onError?.('Failed to parse JSON file. Please verify the file is valid JSON.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const getViewerData = () => {
    if (activeJsonViewer === 'budget') return budget;
    if (activeJsonViewer === 'template') return templateData;
    return ledger;
  };

  const getViewerFileName = () => {
    if (activeJsonViewer === 'budget') return budgetFileName;
    if (activeJsonViewer === 'template') return BUDGET_TEMPLATE_FILE_NAME;
    return SAVINGS_LEDGER_FILE_NAME;
  };

  return (
    <div className="space-y-5">
      {/* 1. PRIMARY CLOUD DATABASE: FIREBASE FIRESTORE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border-2 border-emerald-500/30 dark:border-emerald-500/30 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
              <ShieldCheck className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Firebase Firestore Cloud Database
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-600 text-white shrink-0">
                  Primary Database
                </span>
                {driveStatus.isSignedIn ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>
                      {driveStatus.isFirebaseSyncing ? 'Saving CRUD...' : 'Direct CRUD Auto-Save'}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0">
                    <AlertCircle className="w-3 h-3" />
                    <span>Local Guest Mode</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-words leading-relaxed">
                {driveStatus.isSignedIn
                  ? `Signed in as ${driveStatus.userName || driveStatus.userEmail}. All changes to your Annual Budget (${currentYear}), Estimate Templates, Sinking Funds, Bank Accounts, and Loans save directly and automatically to Firebase Firestore.`
                  : 'Sign in with Google so every Create, Update, and Delete operation saves directly to your primary Firebase Firestore cloud database.'}
              </p>
            </div>
          </div>

          {!driveStatus.isSignedIn && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={onSignIn}
                disabled={driveStatus.isSyncing}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>{driveStatus.isSyncing ? 'Signing In...' : 'Sign In to Cloud DB'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Live Firestore Database Metrics Strip */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              {currentYear} Budget Records
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {budget.entries.length} entries
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Estimate Template
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {templateData.itemTemplates.length} items &bull; {totalCustomCategoriesCount} cats
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Funds &amp; Loans Ledger
            </span>
            <span className="font-mono font-bold text-slate-900 dark:text-white">
              {ledger.accounts.length} accts &bull; {ledger.transactions.length} txns
            </span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/60">
            <span className="text-[11px] text-slate-500 dark:text-slate-400 block">
              Cloud Database Status
            </span>
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {driveStatus.isSignedIn
                ? driveStatus.lastFirebaseSyncedAt
                  ? `Saved ${driveStatus.lastFirebaseSyncedAt}`
                  : 'Live Auto-Save'
                : 'Local Guest Mode'}
            </span>
          </div>
        </div>
      </div>

      {/* 2. SIMPLIFIED BACKUP & RESTORE (GOOGLE DRIVE + LOCAL FILE) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Option A: Google Drive Backup & Restore */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
                <Cloud className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Google Drive Backup
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                    Optional Cloud Backup
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Save a snapshot of your database to Google Drive (
                  <code className="font-mono text-indigo-600 dark:text-indigo-400">/{folderName}/</code>
                  ), or restore from your Google Drive backup to overwrite the current database.
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Backup Folder:</span>
                <div className="flex items-center gap-1.5 min-w-0">
                  {folderId ? (
                    <FolderCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  )}
                  <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 truncate">
                    /{folderName}/
                  </span>
                  {folderId && /^[a-zA-Z0-9_-]+$/.test(folderId) && (
                    <a
                      href={`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-600 dark:text-indigo-400 hover:underline inline-flex items-center gap-0.5 ml-1"
                      title="Open Backup Folder in Google Drive"
                    >
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Files in Drive Backup:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {driveFiles.length > 0 ? `${driveFiles.length} saved file(s)` : 'Not checked / None yet'}
                </span>
              </div>
              {driveStatus.lastSyncedAt && (
                <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 dark:text-slate-400">Last Drive Action:</span>
                  <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                    {driveStatus.lastSyncedAt}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={onSyncAll}
              disabled={driveStatus.isSyncing}
              className="flex-1 justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${driveStatus.isSyncing ? 'animate-spin' : ''}`} />
              <span>{driveStatus.isSyncing ? 'Working...' : 'Save Backup to Drive'}</span>
            </button>

            {onRestoreFromDrive && (
              <button
                type="button"
                onClick={onRestoreFromDrive}
                disabled={driveStatus.isSyncing || driveStatus.isFirebaseSyncing}
                className="flex-1 justify-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-slate-800 dark:text-slate-100 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 cursor-pointer"
                title="Overwrite current database with the backup saved in Google Drive (asks for confirmation first)"
              >
                <RotateCcw className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Restore from Drive Backup</span>
              </button>
            )}
          </div>
        </div>

        {/* Option B: Local JSON File Backup & Restore */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/70 border border-emerald-200 dark:border-emerald-800 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shrink-0">
                <HardDrive className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Offline File Backup (.json)
                  </h3>
                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    Local Snapshot
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                  Download a complete single-file <code className="font-mono">.json</code> backup to your device, or upload a backup file to restore and overwrite your database.
                </p>
              </div>
            </div>

            <div className="mt-4 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500 dark:text-slate-400">Included in Full Backup:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  Budget ({currentYear}) + Template + Ledger
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500 dark:text-slate-400">Restore Protection:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                  Confirms before overwriting DB
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <button
              type="button"
              onClick={handleDownloadFullBackup}
              className="flex-1 justify-center px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download Backup (.json)</span>
            </button>

            <label className="flex-1 justify-center px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-2 cursor-pointer">
              <Upload className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              <span>Restore from File (.json)</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>
      </div>

      {/* 3. COLLAPSIBLE ADVANCED SECTION: DATABASE JSON INSPECTOR & DRIVE FILE LIST */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowAdvancedFiles((prev) => !prev)}
          className="w-full p-4 sm:px-6 flex items-center justify-between gap-3 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
              <FileCode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Database JSON Inspector &amp; Drive File History
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Inspect raw JSON payloads or view saved files in your Google Drive backup folder.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
            <span>{showAdvancedFiles ? 'Hide Inspector' : 'Show Inspector'}</span>
            {showAdvancedFiles ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </div>
        </button>

        {showAdvancedFiles && (
          <div className="p-4 sm:p-6 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-5">
            {driveStatus.isSignedIn && unorganizedFilesCount > 0 && onOrganizeDriveFolder && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl p-3 border border-amber-200 dark:border-amber-800/70 text-xs">
                <span className="text-amber-800 dark:text-amber-300">
                  {unorganizedFilesCount} Drive backup file(s) found outside <code>/{folderName}/</code>.
                </span>
                <button
                  type="button"
                  onClick={onOrganizeDriveFolder}
                  disabled={driveStatus.isSyncing}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Move Files into Backup Folder
                </button>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setActiveJsonViewer('budget')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                      Annual Budget ({currentYear})
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {budget.entries.length} entries
                    </span>
                  </div>
                </div>
                <Eye className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveJsonViewer('template')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Sliders className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                      Estimate Template
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {templateData.itemTemplates.length} items
                    </span>
                  </div>
                </div>
                <Eye className="w-4 h-4 text-slate-400 shrink-0" />
              </button>

              <button
                type="button"
                onClick={() => setActiveJsonViewer('ledger')}
                className="p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/70 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <PiggyBank className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-xs font-bold text-slate-900 dark:text-white block truncate">
                      Funds &amp; Loans Ledger
                    </span>
                    <span className="text-[11px] text-slate-500 font-mono">
                      {ledger.transactions.length} txns
                    </span>
                  </div>
                </div>
                <Eye className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            </div>

            {/* Discovered Drive Files Table */}
            {driveFiles.length > 0 && (
              <div className="overflow-x-auto text-xs border border-slate-200 dark:border-slate-800 rounded-xl">
                <table className="w-full text-left min-w-[520px] whitespace-nowrap">
                  <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
                    <tr>
                      <th className="py-2.5 px-3">Backup File Name</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Last Modified in Drive</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {driveFiles.map((file) => {
                      const yearMatch = file.name.match(/capitalflow_budget_(\d{4})\.json/);
                      const isBudget = Boolean(yearMatch);
                      const isTemplate = file.name === BUDGET_TEMPLATE_FILE_NAME;
                      const fileYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
                      const isCurrentYear = fileYear === currentYear;

                      return (
                        <tr key={file.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="py-2.5 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                            {file.name}
                            {isCurrentYear && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-sans font-bold">
                                Active
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-slate-600 dark:text-slate-300">
                            {isBudget
                              ? `Annual Budget (${fileYear})`
                              : isTemplate
                              ? 'Estimate Template'
                              : 'Funds Ledger'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-500">
                            {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isBudget && fileYear ? (
                              <button
                                type="button"
                                onClick={() => onSelectYear(fileYear)}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                              >
                                Switch to {fileYear}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setActiveJsonViewer(isTemplate ? 'template' : 'ledger')}
                                className="px-2.5 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 cursor-pointer"
                              >
                                Inspect JSON
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. RESET DATABASE WORKSPACE */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white">
                Reset Database Workspace
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                Clear current budget entries, templates, and ledger records to start fresh from a blank state.
              </p>
            </div>
          </div>

          {onResetDataForGoLive && (
            <button
              type="button"
              onClick={onResetDataForGoLive}
              className="w-full sm:w-auto justify-center px-3.5 py-2 bg-rose-50 hover:bg-rose-600 hover:text-white dark:bg-rose-950/50 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-800 transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Reset Workspace</span>
            </button>
          )}
        </div>
      </div>

      {/* Confirmation Modal for Restoring from Local JSON Backup File */}
      {pendingJsonRestore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="p-4 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/80 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800">
                  <AlertCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white">
                    Restore Database from Backup File?
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate max-w-[240px]">
                    {pendingJsonRestore.fileName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingJsonRestore(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-3 text-xs">
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed">
                Restoring this backup file will <strong>overwrite your current database</strong> in Firebase Cloud DB with the records from this file:
              </p>
              <ul className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1.5 text-slate-700 dark:text-slate-200 font-medium">
                {pendingJsonRestore.affectedItems.map((item, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-amber-500 font-bold">&bull;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setPendingJsonRestore(null)}
                className="px-4 py-2 rounded-xl bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={pendingJsonRestore.onConfirm}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs cursor-pointer"
              >
                Restore &amp; Overwrite Database
              </button>
            </div>
          </div>
        </div>
      )}

      {/* JSON Viewer Modal */}
      {activeJsonViewer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-3.5 sm:p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <FileCode className="w-4 h-4 text-indigo-500 shrink-0" />
                <h3 className="font-bold text-xs sm:text-sm text-slate-900 dark:text-white truncate">
                  JSON Viewer: {getViewerFileName()}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(getViewerData(), null, 2))}
                  className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-lg"
                >
                  {copyFeedback ? 'Copied!' : 'Copy JSON'}
                </button>
                <button
                  onClick={() => setActiveJsonViewer(null)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto bg-slate-950 text-slate-200 font-mono text-xs flex-1 scrollbar-thin">
              <pre>{JSON.stringify(getViewerData(), null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
