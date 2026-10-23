import { DriveFileInfo } from '../types/finance';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

export const CAPITALFLOW_DRIVE_FOLDER_NAME = 'CapitalFlow Financial Database';
export const LEGACY_CAPITALFLOW_DRIVE_FOLDER_NAME = 'CapitalFlow';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';
export const DRIVE_FOLDER_CACHE_KEY = 'capitalflow_drive_folder_id';

export const getBudgetFileName = (year: number) => `capitalflow_budget_${year}.json`;
export const SAVINGS_LEDGER_FILE_NAME = 'capitalflow_savings_ledger.json';
export const BUDGET_TEMPLATE_FILE_NAME = 'capitalflow_budget_template.json';

/**
 * Custom error thrown when a Google Drive OAuth session has expired or is unauthorized (HTTP 401)
 */
export class DriveSessionExpiredError extends Error {
  constructor(message: string = 'Google Drive session has expired. Please sign in again.') {
    super(message);
    this.name = 'DriveSessionExpiredError';
  }
}

/**
 * Checks if an error is due to an expired or invalid Google Drive session
 */
export function isSessionExpiredError(error: any): boolean {
  if (!error) return false;
  if (error instanceof DriveSessionExpiredError || error?.name === 'DriveSessionExpiredError') {
    return true;
  }
  const msg = typeof error === 'string' ? error : error?.message || '';
  return (
    msg.includes('401') ||
    msg.includes('UNAUTHENTICATED') ||
    msg.includes('Invalid Credentials') ||
    msg.includes('invalid_grant') ||
    msg.includes('auth/expired-action-code') ||
    msg.includes('session has expired') ||
    msg.includes('token expired')
  );
}

/**
 * Proactively verifies if the current access token is valid and not expired
 */
export async function validateDriveToken(accessToken: string): Promise<boolean> {
  if (!accessToken) return false;
  try {
    const response = await fetch(`${DRIVE_API_URL}/about?fields=user`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (response.status === 401 || response.status === 403) {
      return false;
    }
    return response.ok;
  } catch {
    return false;
  }
}

// In-memory cache & Promise mutex lock across concurrent callers
let cachedFolder: DriveFileInfo | null = null;
let pendingEnsureFolderPromise: Promise<DriveFileInfo> | null = null;

export function getCachedFolder(): DriveFileInfo | null {
  return cachedFolder;
}

export function clearDriveFolderCache(): void {
  cachedFolder = null;
  pendingEnsureFolderPromise = null;
  try {
    localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * Directly looks up a folder in Google Drive by ID.
 * This is strongly consistent and instant (bypasses Google Drive query search index propagation latency).
 */
export async function getFolderById(accessToken: string, folderId: string): Promise<DriveFileInfo | null> {
  if (!folderId) return null;
  try {
    const response = await fetch(
      `${DRIVE_API_URL}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed,webViewLink,modifiedTime,parents`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );
    if (response.status === 401) {
      throw new DriveSessionExpiredError();
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      return null;
    }
    const file = await response.json();
    if (file && file.mimeType === FOLDER_MIME_TYPE && !file.trashed) {
      return file as DriveFileInfo;
    }
    return null;
  } catch (err) {
    if (err instanceof DriveSessionExpiredError) throw err;
    return null;
  }
}

/**
 * Searches for all CapitalFlow folders in Google Drive (including duplicates and legacy names)
 */
export async function findAllCapitalFlowFolders(accessToken: string): Promise<DriveFileInfo[]> {
  const query = encodeURIComponent(
    `(name = '${CAPITALFLOW_DRIVE_FOLDER_NAME}' or name = '${LEGACY_CAPITALFLOW_DRIVE_FOLDER_NAME}') and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`
  );
  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime,createdTime,webViewLink,parents)&orderBy=createdTime asc`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to query CapitalFlow folder in Google Drive: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  return (result.files || []) as DriveFileInfo[];
}

/**
 * Lists all active files located inside a specific Drive folder
 */
export async function listFilesInFolder(accessToken: string, folderId: string): Promise<DriveFileInfo[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${query}&fields=files(id,name,mimeType,modifiedTime,size,parents,webViewLink)&pageSize=100`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }
  if (!response.ok) {
    return [];
  }
  const result = await response.json();
  return (result.files || []) as DriveFileInfo[];
}

/**
 * Safely moves a Drive file or folder to Trash
 */
export async function trashDriveFileOrFolder(accessToken: string, fileOrFolderId: string): Promise<boolean> {
  const response = await fetch(`${DRIVE_API_URL}/files/${encodeURIComponent(fileOrFolderId)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify({ trashed: true }),
  });
  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }
  return response.ok;
}

/**
 * Consolidates multiple folders with the same name into a single primary folder:
 * - Selects the most populated / established folder as primary
 * - Moves any files from duplicate folders into the primary folder
 * - Safely trashes the now-empty duplicate folders
 */
export async function deduplicateCapitalFlowFolders(
  accessToken: string,
  folders: DriveFileInfo[]
): Promise<{
  primaryFolder: DriveFileInfo;
  cleanedDuplicateCount: number;
  movedFileCount: number;
}> {
  if (folders.length <= 1) {
    return {
      primaryFolder: folders[0],
      cleanedDuplicateCount: 0,
      movedFileCount: 0,
    };
  }

  // Inspect files inside each candidate folder
  const folderDetails = await Promise.all(
    folders.map(async (folder) => {
      const files = await listFilesInFolder(accessToken, folder.id);
      const capitalFiles = files.filter((f) => f.name.startsWith('capitalflow_'));
      return {
        folder,
        files,
        capitalFilesCount: capitalFiles.length,
        isStandardName: folder.name === CAPITALFLOW_DRIVE_FOLDER_NAME,
      };
    })
  );

  // Score candidates: folder with most capitalflow files wins; tie-break on standard name and oldest createdTime
  folderDetails.sort((a, b) => {
    if (b.capitalFilesCount !== a.capitalFilesCount) {
      return b.capitalFilesCount - a.capitalFilesCount;
    }
    if (a.isStandardName && !b.isStandardName) return -1;
    if (!a.isStandardName && b.isStandardName) return 1;
    return 0; // retain createdTime asc order from query
  });

  const primary = folderDetails[0];
  const duplicates = folderDetails.slice(1);

  let movedFileCount = 0;
  let cleanedDuplicateCount = 0;

  for (const dup of duplicates) {
    // Move any files residing in this duplicate folder into the primary folder
    for (const file of dup.files) {
      try {
        const existingInPrimary = primary.files.find((pf) => pf.name === file.name);
        if (existingInPrimary) {
          // Both folders contain a file with the exact same name (e.g. capitalflow_general_ledger.json)
          const dupModified = new Date(file.modifiedTime || 0).getTime();
          const primaryModified = new Date(existingInPrimary.modifiedTime || 0).getTime();
          if (dupModified > primaryModified) {
            // Duplicate's file is newer: move duplicate file to primary, and trash older primary file
            await moveFileToFolder(accessToken, file.id, primary.folder.id, file.parents);
            await trashDriveFileOrFolder(accessToken, existingInPrimary.id);
            const pIdx = primary.files.indexOf(existingInPrimary);
            if (pIdx >= 0) primary.files[pIdx] = file;
            movedFileCount++;
          } else {
            // Primary folder already has the newer or equal copy: trash redundant duplicate file
            await trashDriveFileOrFolder(accessToken, file.id);
          }
        } else {
          await moveFileToFolder(accessToken, file.id, primary.folder.id, file.parents);
          primary.files.push(file);
          movedFileCount++;
        }
      } catch (err) {
        console.warn(`Could not move file ${file.name} to primary folder:`, err);
      }
    }

    // Now that files are moved, move duplicate folder to Trash
    try {
      const trashed = await trashDriveFileOrFolder(accessToken, dup.folder.id);
      if (trashed) {
        cleanedDuplicateCount++;
      }
    } catch (err) {
      console.warn(`Could not trash duplicate folder ${dup.folder.id}:`, err);
    }
  }

  // Ensure primary folder is named properly
  if (primary.folder.name !== CAPITALFLOW_DRIVE_FOLDER_NAME) {
    try {
      const renameRes = await fetch(
        `${DRIVE_API_URL}/files/${encodeURIComponent(primary.folder.id)}?fields=id,name,mimeType,modifiedTime,webViewLink`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify({ name: CAPITALFLOW_DRIVE_FOLDER_NAME }),
        }
      );
      if (renameRes.ok) {
        const renamed = await renameRes.json();
        primary.folder = renamed as DriveFileInfo;
      }
    } catch {
      // Ignore rename failure
    }
  }

  cachedFolder = primary.folder;
  try {
    localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, primary.folder.id);
  } catch {}

  return {
    primaryFolder: primary.folder,
    cleanedDuplicateCount,
    movedFileCount,
  };
}

/**
 * Finds the dedicated CapitalFlow folder in Google Drive if it already exists.
 * Uses cached folder ID (in-memory and localStorage) to avoid Google Drive search indexing latency.
 * Automatically resolves and cleans duplicate folders if found.
 */
export async function findCapitalFlowFolder(accessToken: string): Promise<DriveFileInfo | null> {
  // 1. Check in-memory cached folder first
  if (cachedFolder) {
    return cachedFolder;
  }

  // 2. Check localStorage cached ID with direct GET (Strongly consistent, instant)
  try {
    const storedId = localStorage.getItem(DRIVE_FOLDER_CACHE_KEY);
    if (storedId) {
      const directFolder = await getFolderById(accessToken, storedId);
      if (directFolder) {
        cachedFolder = directFolder;
        return directFolder;
      }
      // If no longer exists (trashed/deleted), clear stale ID
      localStorage.removeItem(DRIVE_FOLDER_CACHE_KEY);
    }
  } catch {
    // Ignore localStorage read errors
  }

  // 3. Query Google Drive search index
  const folders = await findAllCapitalFlowFolders(accessToken);
  if (folders.length === 0) {
    // Defense-in-depth for cross-device switching:
    // If the folder name query hasn't indexed yet on a new device,
    // look up existing capitalflow files and resolve their parent folder directly.
    try {
      const fileQuery = encodeURIComponent(
        `name contains 'capitalflow_' and trashed = false and mimeType != '${FOLDER_MIME_TYPE}'`
      );
      const fileRes = await fetch(
        `${DRIVE_API_URL}/files?q=${fileQuery}&fields=files(id,parents)&pageSize=5`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        }
      );
      if (fileRes.ok) {
        const fileData = await fileRes.json();
        const files = (fileData.files || []) as { id: string; parents?: string[] }[];
        const parentIds = new Set<string>();
        for (const f of files) {
          if (f.parents && f.parents.length > 0) {
            for (const p of f.parents) parentIds.add(p);
          }
        }
        for (const pId of parentIds) {
          const parentFolder = await getFolderById(accessToken, pId);
          if (
            parentFolder &&
            (parentFolder.name === CAPITALFLOW_DRIVE_FOLDER_NAME ||
              parentFolder.name === LEGACY_CAPITALFLOW_DRIVE_FOLDER_NAME)
          ) {
            cachedFolder = parentFolder;
            try {
              localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, parentFolder.id);
            } catch {}
            return parentFolder;
          }
        }
      }
    } catch {
      // Non-blocking fallback
    }

    return null;
  }

  if (folders.length === 1) {
    cachedFolder = folders[0];
    try {
      localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, folders[0].id);
    } catch {}
    return folders[0];
  }

  // Multiple folders with the same name found! Consolidate and deduplicate them
  const { primaryFolder } = await deduplicateCapitalFlowFolders(accessToken, folders);
  return primaryFolder;
}

/**
 * Ensures the dedicated CapitalFlow folder exists in Google Drive; creates it if missing.
 * Prevents race conditions and multiple folder creation via an in-flight Promise mutex lock.
 */
export async function ensureCapitalFlowFolder(accessToken: string): Promise<DriveFileInfo> {
  // 1. Return cached folder immediately if already resolved
  if (cachedFolder) {
    return cachedFolder;
  }

  // 2. If another folder resolution/creation is in-flight, await the exact same promise
  if (pendingEnsureFolderPromise) {
    return pendingEnsureFolderPromise;
  }

  pendingEnsureFolderPromise = (async () => {
    try {
      const existingFolder = await findCapitalFlowFolder(accessToken);
      if (existingFolder) {
        cachedFolder = existingFolder;
        try {
          localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, existingFolder.id);
        } catch {}
        return existingFolder;
      }

      // 3. Folder does not exist -> Create exactly ONE dedicated folder in Google Drive
      const metadata = {
        name: CAPITALFLOW_DRIVE_FOLDER_NAME,
        mimeType: FOLDER_MIME_TYPE,
        description: 'Dedicated folder for CapitalFlow annual budget and funds ledger JSON database files.',
      };

      const response = await fetch(
        `${DRIVE_API_URL}/files?fields=id,name,mimeType,modifiedTime,webViewLink`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify(metadata),
        }
      );

      if (response.status === 401) {
        throw new DriveSessionExpiredError();
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create dedicated folder in Google Drive: ${errText}`);
      }

      const created = (await response.json()) as DriveFileInfo;
      cachedFolder = created;
      try {
        localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, created.id);
      } catch {}
      return created;
    } finally {
      pendingEnsureFolderPromise = null;
    }
  })();

  return pendingEnsureFolderPromise;
}

/**
 * Moves a Drive file into the dedicated CapitalFlow folder if it is not already inside it
 */
export async function moveFileToFolder(
  accessToken: string,
  fileId: string,
  targetFolderId: string,
  currentParents?: string[]
): Promise<void> {
  if (currentParents && currentParents.includes(targetFolderId)) {
    return; // Already in the dedicated folder
  }

  let parentsToRemove = currentParents;
  if (!parentsToRemove) {
    // Fetch current parents from Drive metadata
    const metaRes = await fetch(`${DRIVE_API_URL}/files/${fileId}?fields=parents`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (metaRes.status === 401) {
      throw new DriveSessionExpiredError();
    }
    if (metaRes.ok) {
      const meta = await metaRes.json();
      parentsToRemove = meta.parents || [];
    }
  }

  if (parentsToRemove && parentsToRemove.includes(targetFolderId)) {
    return;
  }

  const removeParam =
    parentsToRemove && parentsToRemove.length > 0
      ? `&removeParents=${encodeURIComponent(parentsToRemove.join(','))}`
      : '';

  const moveRes = await fetch(
    `${DRIVE_API_URL}/files/${fileId}?addParents=${encodeURIComponent(targetFolderId)}${removeParam}&fields=id,parents`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (moveRes.status === 401) {
    throw new DriveSessionExpiredError();
  }
}

/**
 * Searches for a file by exact name in Google Drive (prioritizing files inside the dedicated folder)
 */
export async function findDriveFile(
  accessToken: string,
  fileName: string,
  preferredFolderId?: string | null
): Promise<DriveFileInfo | null> {
  const safeFileName = fileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const query = encodeURIComponent(
    `name = '${safeFileName}' and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false`
  );
  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${query}&fields=files(id, name, mimeType, modifiedTime, size, parents, webViewLink)&orderBy=modifiedTime desc`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to query Google Drive files: ${response.status} ${errorText}`);
  }

  const result = await response.json();
  const files: DriveFileInfo[] = result.files || [];
  if (files.length === 0) {
    return null;
  }

  const targetFolderId = preferredFolderId || cachedFolder?.id;
  if (targetFolderId) {
    const inFolder = files.find((f) => f.parents?.includes(targetFolderId));
    if (inFolder) return inFolder;
  }

  return files[0];
}

/**
 * List all CapitalFlow budget & ledger files in Drive
 */
export async function listCapitalFlowFiles(accessToken: string): Promise<DriveFileInfo[]> {
  const query = encodeURIComponent(
    `name contains 'capitalflow_' and mimeType != '${FOLDER_MIME_TYPE}' and trashed = false`
  );
  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${query}&fields=files(id, name, mimeType, modifiedTime, size, parents, webViewLink)&orderBy=name desc`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }

  if (!response.ok) {
    throw new Error(`Failed to list files from Google Drive: ${response.statusText}`);
  }

  const result = await response.json();
  return (result.files || []) as DriveFileInfo[];
}

/**
 * Ensures the dedicated folder exists, cleans duplicate folders, and moves any existing CapitalFlow JSON files into it
 */
export async function organizeCapitalFlowFilesInFolder(accessToken: string): Promise<{
  folder: DriveFileInfo;
  movedCount: number;
  files: DriveFileInfo[];
  cleanedDuplicatesCount: number;
}> {
  // Deduplicate and consolidate any multiple folders in Drive first
  const allFolders = await findAllCapitalFlowFolders(accessToken);
  let cleanedDuplicatesCount = 0;
  let folder: DriveFileInfo;

  if (allFolders.length > 1) {
    const dedup = await deduplicateCapitalFlowFolders(accessToken, allFolders);
    folder = dedup.primaryFolder;
    cleanedDuplicatesCount = dedup.cleanedDuplicateCount;
  } else if (allFolders.length === 1) {
    folder = allFolders[0];
    cachedFolder = folder;
    try {
      localStorage.setItem(DRIVE_FOLDER_CACHE_KEY, folder.id);
    } catch {}
  } else {
    folder = await ensureCapitalFlowFolder(accessToken);
  }

  const existingFiles = await listCapitalFlowFiles(accessToken);
  let movedCount = 0;

  for (const file of existingFiles) {
    if (!file.parents || !file.parents.includes(folder.id)) {
      await moveFileToFolder(accessToken, file.id, folder.id, file.parents);
      movedCount++;
    }
  }

  const updatedFiles = movedCount > 0 ? await listCapitalFlowFiles(accessToken) : existingFiles;
  return { folder, movedCount, files: updatedFiles, cleanedDuplicatesCount };
}

/**
 * Downloads and parses JSON content from a file ID
 */
export async function downloadJsonFile<T>(accessToken: string, fileId: string): Promise<T> {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }

  if (!response.ok) {
    throw new Error(`Failed to download file from Google Drive: ${response.statusText}`);
  }

  return (await response.json()) as T;
}

/**
 * Creates or updates a JSON file inside the dedicated CapitalFlow folder in Google Drive
 */
export async function saveJsonToDrive<T>(
  accessToken: string,
  fileName: string,
  data: T,
  existingFileId?: string | null
): Promise<{ id: string; name: string; modifiedTime: string; folderId: string }> {
  const content = JSON.stringify(data, null, 2);

  // Ensure the dedicated folder exists in Google Drive
  const folder = await ensureCapitalFlowFolder(accessToken);

  // If we already have the fileId, perform a PATCH update and ensure it's inside the dedicated folder
  if (existingFileId) {
    const response = await fetch(
      `${DRIVE_UPLOAD_URL}/files/${existingFileId}?uploadType=media&fields=id,name,modifiedTime,parents`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: content,
      }
    );

    if (response.status === 401) {
      throw new DriveSessionExpiredError();
    }

    if (response.ok) {
      const updatedMeta = await response.json();
      await moveFileToFolder(accessToken, updatedMeta.id, folder.id, updatedMeta.parents);
      return {
        id: updatedMeta.id,
        name: updatedMeta.name || fileName,
        modifiedTime: updatedMeta.modifiedTime || new Date().toISOString(),
        folderId: folder.id,
      };
    }
    // If not found or error, fallback to searching or recreating
  }

  // Check if file already exists in Drive by name
  const existing = await findDriveFile(accessToken, fileName, folder.id);
  if (existing) {
    const response = await fetch(
      `${DRIVE_UPLOAD_URL}/files/${existing.id}?uploadType=media&fields=id,name,modifiedTime,parents`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json; charset=UTF-8',
        },
        body: content,
      }
    );

    if (response.status === 401) {
      throw new DriveSessionExpiredError();
    }

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to update Drive file: ${err}`);
    }

    const updated = await response.json();
    await moveFileToFolder(accessToken, updated.id, folder.id, updated.parents || existing.parents);
    return {
      id: updated.id,
      name: updated.name || fileName,
      modifiedTime: updated.modifiedTime || new Date().toISOString(),
      folderId: folder.id,
    };
  }

  // File does not exist: create directly inside the dedicated CapitalFlow folder via multipart upload
  const metadata = {
    name: fileName,
    mimeType: 'application/json',
    description: 'CapitalFlow Financial Database File',
    parents: [folder.id],
  };

  const boundary = '-------314159265358979323846';
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const multipartRequestBody =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    content +
    closeDelimiter;

  const createResponse = await fetch(
    `${DRIVE_UPLOAD_URL}/files?uploadType=multipart&fields=id,name,mimeType,modifiedTime,parents`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: multipartRequestBody,
    }
  );

  if (createResponse.status === 401) {
    throw new DriveSessionExpiredError();
  }

  if (!createResponse.ok) {
    const err = await createResponse.text();
    throw new Error(`Failed to create new file in Google Drive: ${err}`);
  }

  const createdFile = await createResponse.json();
  return {
    id: createdFile.id,
    name: createdFile.name,
    modifiedTime: createdFile.modifiedTime || new Date().toISOString(),
    folderId: folder.id,
  };
}

/**
 * Delete a file from Google Drive (Requires user confirmation prior to calling)
 */
export async function deleteDriveFile(accessToken: string, fileId: string): Promise<boolean> {
  const response = await fetch(`${DRIVE_API_URL}/files/${fileId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401) {
    throw new DriveSessionExpiredError();
  }

  return response.ok;
}

