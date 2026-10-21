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
  Sparkles,
  Folder,
  FolderCheck,
  FolderOpen,
  Sliders,
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
  onError,
  onResetDataForGoLive,
  onOrganizeDriveFolder,
}) => {
  const [activeJsonViewer, setActiveJsonViewer] = useState<'budget' | 'ledger' | 'template' | null>(null);
  const [copyFeedback, setCopyFeedback] = useState(false);

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
    const fullBackup = {
      backupVersion: '1.0',
      exportedAt: new Date().toISOString(),
      appVersion: APP_VERSION,
      budget,
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
          onImportBudgetJson(parsed.budget);
          if (parsed.templateData && onImportTemplateJson) {
            onImportTemplateJson(parsed.templateData);
          }
          if (parsed.ledger && onImportLedgerJson) {
            onImportLedgerJson(parsed.ledger);
          }
        } else if (typeof parsed.year === 'number' && Array.isArray(parsed.entries)) {
          onImportBudgetJson(parsed as YearBudgetData);
        } else if (Array.isArray(parsed.itemTemplates) && parsed.customCategories && onImportTemplateJson) {
          onImportTemplateJson(parsed as BudgetTemplateData);
        } else if (Array.isArray(parsed.accounts) && Array.isArray(parsed.transactions) && onImportLedgerJson) {
          onImportLedgerJson(parsed as SavingsLedgerData);
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
    <div className="space-y-6">
      
      {/* Drive Connection Status Header */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-indigo-50 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400 shrink-0">
              <Cloud className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white">
                  Google Drive Database Storage
                </h2>
                {driveStatus.isSignedIn ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 shrink-0">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Connected</span>
                  </span>
                ) : driveStatus.isSessionExpired ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-800 shrink-0">
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                    <span>Session Expired</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800 shrink-0">
                    <AlertCircle className="w-3 h-3" />
                    <span>Not Connected</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 break-words leading-relaxed">
                {driveStatus.isSignedIn
                  ? `Authenticated as ${driveStatus.userName || driveStatus.userEmail}. All JSON database files (Annual Budget, Estimate Template, and Funds Ledger) are organized inside "${folderName}" in your Google Drive.`
                  : driveStatus.isSessionExpired
                  ? 'Your Google Drive session has expired. Sign in again to renew cloud synchronization.'
                  : `Connect your Google Drive to enable cloud persistence and automatic file organization inside a dedicated "${folderName}" folder.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {driveStatus.isSignedIn ? (
              <button
                onClick={onSyncAll}
                disabled={driveStatus.isSyncing}
                className="w-full sm:w-auto justify-center px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${driveStatus.isSyncing ? 'animate-spin' : ''}`} />
                <span>{driveStatus.isSyncing ? 'Syncing to Drive...' : 'Save & Sync All'}</span>
              </button>
            ) : driveStatus.isSessionExpired ? (
              <button
                onClick={onSignIn}
                className="w-full sm:w-auto justify-center px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reconnect Google Drive</span>
              </button>
            ) : (
              <button
                onClick={onSignIn}
                className="w-full sm:w-auto justify-center px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer"
              >
                <span>Connect Google Drive</span>
              </button>
            )}
          </div>
        </div>

        {/* Dedicated Google Drive Folder Organization Bar */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-3 sm:px-4 border border-slate-200/60 dark:border-slate-700/50">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/70 text-amber-600 dark:text-amber-400 border border-amber-200/80 dark:border-amber-800/80 shrink-0">
              {folderId ? <FolderCheck className="w-4 h-4" /> : <Folder className="w-4 h-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                  Dedicated Drive Folder:
                </span>
                <code className="px-2 py-0.5 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono font-semibold text-indigo-600 dark:text-indigo-400 break-all">
                  /{folderName}/
                </code>
                {folderId ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>Active Folder</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    <span>Auto-created on sync</span>
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {folderId
                  ? unorganizedFilesCount > 0
                    ? `${unorganizedFilesCount} existing file(s) found outside this folder. Click "Organize Files into Folder" or "Save & Sync All" to move them inside.`
                    : `All CapitalFlow JSON database files are neatly organized inside "${folderName}" in your Google Drive.`
                  : `Keeps your Google Drive clean by saving your annual budget, standalone estimate template, and funds ledger JSON files inside "${folderName}".`}
              </p>
            </div>
          </div>

          {driveStatus.isSignedIn && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {(!folderId || unorganizedFilesCount > 0) && onOrganizeDriveFolder && (
                <button
                  onClick={onOrganizeDriveFolder}
                  disabled={driveStatus.isSyncing}
                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5" />
                  <span>{folderId ? `Move ${unorganizedFilesCount} File(s) to Folder` : 'Create Folder Now'}</span>
                </button>
              )}
              {folderId && /^[a-zA-Z0-9_-]+$/.test(folderId) && (
                <a
                  href={`https://drive.google.com/drive/folders/${encodeURIComponent(folderId)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3 py-1.5 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-xs rounded-xl border border-slate-200 dark:border-slate-700 transition-colors flex items-center gap-1.5"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Open Folder in Drive</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Database Files Architecture (3 Separate JSON Files) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Card 1: Annual Budget File */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 shrink-0">
                  <Calendar className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Annual Budget ({currentYear})
                  </h3>
                  <code className="text-[11px] font-mono text-indigo-600 dark:text-indigo-400 break-all block mt-0.5">
                    {folderName}/{budgetFileName}
                  </code>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                1 Year Only
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Stores all monthly/bi-weekly income, expense, and fund entries recorded for {currentYear} in Google Drive.
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2.5 mb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Records in File:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{budget.entries.length} entries</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500">Entry Frequency:</span>
                <span className="font-semibold text-slate-700 dark:text-slate-300 capitalize">
                  {budget.entryMode}
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500 shrink-0">Drive Status:</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 sm:text-right">
                  {!budgetDriveFile ? (
                    <span className="text-amber-600 dark:text-amber-400">Cached locally (Sync pending)</span>
                  ) : budgetTimestampStatus === 'local_newer' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 font-semibold text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Local is latest</span>
                    </span>
                  ) : budgetTimestampStatus === 'drive_newer' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 font-semibold text-[11px]">
                      <span>Drive backup is newer</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>In sync with Drive</span>
                    </span>
                  )}
                </div>
              </div>
              {budgetDriveFile && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 shrink-0">Drive File ID:</span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px] ml-auto">
                    {budgetDriveFile.id}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <button
              onClick={onSaveBudgetToDrive}
              disabled={!driveStatus.isSignedIn || driveStatus.isSyncing}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-center transition-colors cursor-pointer"
            >
              Push to Drive
            </button>
            <button
              onClick={() => onPullBudget(currentYear)}
              disabled={!driveStatus.isSignedIn || driveStatus.isSyncing}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Pull latest version from Google Drive"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveJsonViewer('budget')}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Inspect JSON"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDownload(budget, budgetFileName)}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Download local JSON copy"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 2: Separate Estimate Budget & Categories Template File */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-600 dark:text-amber-400 shrink-0">
                  <Sliders className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Estimate Budget Template
                  </h3>
                  <code className="text-[11px] font-mono text-amber-600 dark:text-amber-400 break-all block mt-0.5">
                    {folderName}/{BUDGET_TEMPLATE_FILE_NAME}
                  </code>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 shrink-0">
                Separate File
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Dedicated file for your personalized Categories and recurring Estimated Budget Item Templates, reusable across all years.
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2.5 mb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Template Mode:</span>
                <span className="font-semibold text-amber-700 dark:text-amber-300">
                  {templateData.isPersonalizedTemplate ? 'Personalized' : 'Default Starter'}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500">Saved Items &amp; Cats:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">
                  {templateData.itemTemplates.length} items &bull; {totalCustomCategoriesCount} categories
                </span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500 shrink-0">Drive Status:</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 sm:text-right">
                  {!templateDriveFile ? (
                    <span className="text-amber-600 dark:text-amber-400">Cached locally (Sync pending)</span>
                  ) : templateTimestampStatus === 'local_newer' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 font-semibold text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Local is latest</span>
                    </span>
                  ) : templateTimestampStatus === 'drive_newer' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 font-semibold text-[11px]">
                      <span>Drive backup is newer</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>In sync with Drive</span>
                    </span>
                  )}
                </div>
              </div>
              {templateDriveFile && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 shrink-0">Drive File ID:</span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px] ml-auto">
                    {templateDriveFile.id}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <button
              onClick={onSaveTemplateToDrive}
              disabled={!driveStatus.isSignedIn || driveStatus.isSyncing}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-center transition-colors cursor-pointer"
            >
              Push to Drive
            </button>
            <button
              onClick={onPullTemplate}
              disabled={!driveStatus.isSignedIn || driveStatus.isSyncing}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Pull latest template from Google Drive"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveJsonViewer('template')}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Inspect Template JSON"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDownload(templateData, BUDGET_TEMPLATE_FILE_NAME)}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Download local Template JSON copy"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Card 3: Separate Savings Ledger File */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col justify-between min-w-0">
          <div>
            <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 shrink-0">
                  <PiggyBank className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Funds &amp; Capital Ledger
                  </h3>
                  <code className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400 break-all block mt-0.5">
                    {folderName}/{SAVINGS_LEDGER_FILE_NAME}
                  </code>
                </div>
              </div>
              <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 shrink-0">
                Multi-Year
              </span>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
              Maintains the permanent accumulation of funds transferred from all annual budget entries, compound interest yields, and total capital growth.
            </p>

            <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-xs space-y-2.5 mb-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-slate-500">Total Transactions:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ledger.transactions.length} transfers</span>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500">Tracked Accounts:</span>
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-200">{ledger.accounts.length} accounts</span>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-slate-500 shrink-0">Drive Status:</span>
                <div className="font-medium text-slate-800 dark:text-slate-200 sm:text-right">
                  {!ledgerDriveFile ? (
                    <span className="text-amber-600 dark:text-amber-400">Cached locally (Sync pending)</span>
                  ) : ledgerTimestampStatus === 'local_newer' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/80 font-semibold text-[11px]">
                      <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
                      <span>Local is latest</span>
                    </span>
                  ) : ledgerTimestampStatus === 'drive_newer' ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 border border-blue-200/80 dark:border-blue-800/80 font-semibold text-[11px]">
                      <span>Drive backup is newer</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>In sync with Drive</span>
                    </span>
                  )}
                </div>
              </div>
              {ledgerDriveFile && (
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                  <span className="text-slate-500 shrink-0">Drive File ID:</span>
                  <span className="font-mono text-[10px] text-slate-400 truncate max-w-[140px] ml-auto">
                    {ledgerDriveFile.id}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
            <button
              onClick={onSaveLedgerToDrive}
              disabled={!driveStatus.isSignedIn || driveStatus.isSyncing}
              className="flex-1 py-2 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-xl text-center transition-colors cursor-pointer"
            >
              Push to Drive
            </button>
            <button
              onClick={onPullLedger}
              disabled={!driveStatus.isSignedIn || driveStatus.isSyncing}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Pull latest version from Google Drive"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setActiveJsonViewer('ledger')}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Inspect JSON"
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleDownload(ledger, SAVINGS_LEDGER_FILE_NAME)}
              className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors shrink-0 cursor-pointer"
              title="Download local JSON copy"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

      </div>

      {/* Discovered Drive Files Table & Multi-Year Management */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-indigo-500 shrink-0" />
              <span>CapitalFlow Files in Google Drive</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Switch years to view historical databases or initialize a new year.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleDownloadFullBackup}
              className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950 dark:hover:bg-emerald-900 text-emerald-700 dark:text-emerald-300 font-semibold text-xs rounded-xl border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Download complete offline backup bundle (Budget, Template, and Funds Ledger in one JSON file)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Full Backup (.json)</span>
            </button>

            <button
              onClick={onAddNewYear}
              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:hover:bg-indigo-900 text-indigo-600 dark:text-indigo-400 font-semibold text-xs rounded-xl border border-indigo-200 dark:border-indigo-800 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Initialize New Year</span>
            </button>

            <label className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-xs rounded-xl border border-slate-200 dark:border-slate-700 flex items-center gap-1.5 cursor-pointer transition-colors" title="Import Budget, Template, Ledger, or Full Backup JSON">
              <Upload className="w-3.5 h-3.5" />
              <span>Import JSON</span>
              <input
                type="file"
                accept=".json"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="overflow-x-auto text-xs">
          <table className="w-full text-left min-w-[580px] whitespace-nowrap">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 uppercase tracking-wider font-semibold border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="py-3 px-4">File Name</th>
                <th className="py-3 px-4">Database Type</th>
                <th className="py-3 px-4">Drive File ID</th>
                <th className="py-3 px-4">Last Modified in Drive</th>
                <th className="py-3 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {driveFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 px-4 text-center text-slate-400 whitespace-normal">
                    {driveStatus.isSignedIn
                      ? 'No files found in Google Drive yet. Click "Save & Sync All" above to write your annual budget, estimate template, and funds ledger to Drive.'
                      : 'Connect Google Drive to view and synchronize your files.'}
                  </td>
                </tr>
              ) : (
                driveFiles.map((file) => {
                  const yearMatch = file.name.match(/capitalflow_budget_(\d{4})\.json/);
                  const isBudget = Boolean(yearMatch);
                  const isTemplate = file.name === BUDGET_TEMPLATE_FILE_NAME;
                  const fileYear = yearMatch ? parseInt(yearMatch[1], 10) : null;
                  const isCurrentYear = fileYear === currentYear;

                  return (
                    <tr
                      key={file.id}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        isCurrentYear ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                      }`}
                    >
                      <td className="py-3 px-4 font-mono font-medium text-slate-800 dark:text-slate-200">
                        <div className="flex items-center gap-1.5">
                          <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span className="text-slate-400 text-[11px]">{folderName}/</span>
                          <span>{file.name}</span>
                          {isCurrentYear && (
                            <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 font-sans font-bold">
                              Active
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        {isBudget ? (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">
                            Annual Budget ({fileYear})
                          </span>
                        ) : isTemplate ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200/70 dark:border-amber-800/70 font-medium">
                            Estimate Template (All Years)
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 font-medium">
                            Funds Ledger
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono text-[10px] text-slate-400">
                        {file.id}
                      </td>
                      <td className="py-3 px-4 text-slate-500 whitespace-nowrap">
                        {file.modifiedTime
                          ? new Date(file.modifiedTime).toLocaleString()
                          : '—'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {isBudget && fileYear ? (
                          <button
                            onClick={() => onSelectYear(fileYear)}
                            className="px-3 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-indigo-600 dark:text-indigo-400 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            Open Year
                          </button>
                        ) : isTemplate ? (
                          <button
                            onClick={() => setActiveJsonViewer('template')}
                            className="px-3 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-amber-600 dark:text-amber-400 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            Inspect Template
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveJsonViewer('ledger')}
                            className="px-3 py-1 bg-white hover:bg-slate-100 dark:bg-slate-800 dark:hover:bg-slate-700 text-emerald-600 dark:text-emerald-400 font-semibold rounded-lg border border-slate-200 dark:border-slate-700 transition-colors cursor-pointer"
                          >
                            Inspect Ledger
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Reset Local Device Data */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-6 border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-800 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Reset Local Device Data
                </h3>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300 border border-rose-200 dark:border-rose-800 shrink-0">
                  Local Storage Reset
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Delete all local data stored in this browser — including all annual budget records, your local Estimate Budget Template, custom categories, and local Funds ledger transactions — to start from a completely blank local state or pull fresh copies from Google Drive.
              </p>
            </div>
          </div>

          {onResetDataForGoLive && (
            <button
              onClick={onResetDataForGoLive}
              className="w-full sm:w-auto justify-center px-4 py-2.5 bg-rose-50 hover:bg-rose-600 hover:text-white dark:bg-rose-950/50 dark:hover:bg-rose-600 text-rose-700 dark:text-rose-300 text-xs font-semibold rounded-xl border border-rose-200 dark:border-rose-800 transition-colors flex items-center gap-2 shrink-0 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete All Local Data</span>
            </button>
          )}
        </div>
      </div>

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
                  onClick={() =>
                    copyToClipboard(
                      JSON.stringify(getViewerData(), null, 2)
                    )
                  }
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

