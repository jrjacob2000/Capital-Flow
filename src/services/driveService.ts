import { DriveFileInfo } from '../types/finance';

const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3';

export const CAPITALFLOW_DRIVE_FOLDER_NAME = 'CapitalFlow Financial Database';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

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

/**
 * Finds the dedicated CapitalFlow folder in Google Drive if it already exists
 */
export async function findCapitalFlowFolder(accessToken: string): Promise<DriveFileInfo | null> {
  const query = encodeURIComponent(
    `name = '${CAPITALFLOW_DRIVE_FOLDER_NAME}' and mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`
  );
  const response = await fetch(
    `${DRIVE_API_URL}/files?q=${query}&fields=files(id, name, mimeType, modifiedTime, webViewLink)&orderBy=createdTime asc`,
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
  if (result.files && result.files.length > 0) {
    return result.files[0] as DriveFileInfo;
  }
  return null;
}

/**
 * Ensures the dedicated CapitalFlow folder exists in Google Drive; creates it if missing
 */
export async function ensureCapitalFlowFolder(accessToken: string): Promise<DriveFileInfo> {
  const existingFolder = await findCapitalFlowFolder(accessToken);
  if (existingFolder) {
    return existingFolder;
  }

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

  return (await response.json()) as DriveFileInfo;
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

  if (preferredFolderId) {
    const inFolder = files.find((f) => f.parents?.includes(preferredFolderId));
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
 * Ensures the dedicated folder exists and moves any existing CapitalFlow JSON files into it
 */
export async function organizeCapitalFlowFilesInFolder(accessToken: string): Promise<{
  folder: DriveFileInfo;
  movedCount: number;
  files: DriveFileInfo[];
}> {
  const folder = await ensureCapitalFlowFolder(accessToken);
  const existingFiles = await listCapitalFlowFiles(accessToken);
  let movedCount = 0;

  for (const file of existingFiles) {
    if (!file.parents || !file.parents.includes(folder.id)) {
      await moveFileToFolder(accessToken, file.id, folder.id, file.parents);
      movedCount++;
    }
  }

  const updatedFiles = movedCount > 0 ? await listCapitalFlowFiles(accessToken) : existingFiles;
  return { folder, movedCount, files: updatedFiles };
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

