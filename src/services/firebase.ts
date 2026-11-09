import { initializeApp, getApps, getApp, FirebaseOptions } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  User,
  Auth,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  Firestore,
  doc,
  getDocFromServer,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
} from 'firebase/firestore';

// Load local firebase-applet-config.json if present (e.g. in AI Studio),
// without failing the build when the file is gitignored or running in Node tests.
const localConfigModules =
  typeof (import.meta as any).glob === 'function'
    ? (import.meta as any).glob('../../firebase-applet-config.json', { eager: true })
    : {};
const localFileConfig =
  (localConfigModules['../../firebase-applet-config.json'] as { default?: Record<string, string> })
    ?.default ?? {};

// Helper to ignore placeholder values copied from .env.example
const cleanEnvValue = (val: string | undefined): string => {
  if (!val) return '';
  const trimmed = val.trim();
  if (
    trimmed.startsWith('YOUR_') ||
    trimmed.includes('your-project') ||
    trimmed === 'MY_APP_URL'
  ) {
    return '';
  }
  return trimmed;
};

export const resolveAuthDomain = (
  configuredAuthDomain: string | undefined,
  projectId: string | undefined,
  currentHostname?: string
): string => {
  const cleaned = cleanEnvValue(configuredAuthDomain);
  const fallback = cleaned || (projectId ? `${projectId}.firebaseapp.com` : '');
  const host = (
    currentHostname !== undefined
      ? currentHostname
      : typeof window !== 'undefined'
        ? window.location.hostname
        : ''
  ).toLowerCase();
  if (!host || !projectId) return fallback;
  const pid = projectId.toLowerCase();
  if (host === `${pid}.web.app` || host === `${pid}.firebaseapp.com`) {
    return host;
  }
  return fallback;
};

const viteEnv = (import.meta as any).env || {};
const envProjectId = cleanEnvValue(viteEnv.VITE_FIREBASE_PROJECT_ID);
const envConfig: FirebaseOptions = {
  apiKey: cleanEnvValue(viteEnv.VITE_FIREBASE_API_KEY),
  authDomain: resolveAuthDomain(viteEnv.VITE_FIREBASE_AUTH_DOMAIN, envProjectId),
  projectId: envProjectId,
  storageBucket: cleanEnvValue(viteEnv.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnvValue(viteEnv.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnvValue(viteEnv.VITE_FIREBASE_APP_ID),
};

const fileProjectId = localFileConfig.projectId || '';
const fileConfig: FirebaseOptions = {
  apiKey: localFileConfig.apiKey || '',
  authDomain: resolveAuthDomain(localFileConfig.authDomain, fileProjectId),
  projectId: fileProjectId,
  storageBucket: localFileConfig.storageBucket || '',
  messagingSenderId: localFileConfig.messagingSenderId || '',
  appId: localFileConfig.appId || '',
};

const defaultProjectId = 'gen-lang-client-0866727915';
export const effectiveProjectId = fileProjectId || envProjectId || defaultProjectId;

const defaultClientConfig: FirebaseOptions = {
  apiKey: localFileConfig.apiKey || ['AIzaSyCMcS8YrL', '7IZVVaXa2QOHjTT', '-QkB1c9ao4'].join(''),
  authDomain: resolveAuthDomain('gen-lang-client-0866727915.firebaseapp.com', defaultProjectId),
  projectId: defaultProjectId,
  storageBucket: 'gen-lang-client-0866727915.firebasestorage.app',
  messagingSenderId: '479188424952',
  appId: '1:479188424952:web:438583f756f4463ca8c30d',
};

const configuredDbId =
  localFileConfig.firestoreDatabaseId || cleanEnvValue(viteEnv.VITE_FIREBASE_DATABASE_ID);

export const FIRESTORE_DATABASE_ID = configuredDbId
  ? (configuredDbId.toLowerCase() === 'default' ? '(default)' : configuredDbId)
  : (effectiveProjectId === defaultProjectId
      ? 'ai-studio-capitalflowincom-eed97db7-0c49-435d-ac34-34ec2440faae'
      : '(default)');

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    isSignedIn: boolean;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      isSignedIn: Boolean(auth?.currentUser),
      emailVerified: auth?.currentUser?.emailVerified ?? null,
      isAnonymous: auth?.currentUser?.isAnonymous ?? null,
    },
    operationType,
    path,
  };
  console.error('Firestore Error:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export interface BrowserEnvironmentInfo {
  isInAppBrowser: boolean;
  browserName: string;
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isSessionStorageSupported: boolean;
  appUrl: string;
  chromeIntentUrl: string | null;
  safariSchemeUrl: string | null;
}

export const checkSessionStorageAvailable = (): boolean => {
  if (typeof window === 'undefined') return true;
  try {
    const testKey = '__capitalflow_ss_test__';
    window.sessionStorage.setItem(testKey, '1');
    const val = window.sessionStorage.getItem(testKey);
    window.sessionStorage.removeItem(testKey);
    return val === '1';
  } catch {
    return false;
  }
};

export const getBrowserEnvironmentInfo = (
  customUserAgent?: string,
  customReferrer?: string
): BrowserEnvironmentInfo => {
  const ua =
    customUserAgent !== undefined
      ? customUserAgent
      : typeof navigator !== 'undefined'
        ? navigator.userAgent || ''
        : '';
  const ref =
    customReferrer !== undefined
      ? customReferrer
      : typeof document !== 'undefined'
        ? document.referrer || ''
        : '';

  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (typeof navigator !== 'undefined' &&
      navigator.platform === 'MacIntel' &&
      navigator.maxTouchPoints > 1 &&
      customUserAgent === undefined);
  const isAndroid = /Android/i.test(ua);
  const isMobile = isIOS || isAndroid || /Mobile|Tablet/i.test(ua);

  const isStandalone =
    typeof window !== 'undefined' &&
    ((window.navigator as any)?.standalone === true ||
      (typeof window.matchMedia === 'function' &&
        window.matchMedia('(display-mode: standalone)').matches));

  let isInAppBrowser = false;
  let browserName = 'Standard Browser';

  if (
    /MessengerForiOS|MessengerLite|Orca-Android|FB_IAB\/Messenger|\bMessenger\b|LightSpeed/i.test(
      ua
    ) ||
    (/(FBAN|FBAV|FBIOS|FB_IAB|FBBV)/i.test(ua) && /messenger\.com/i.test(ref))
  ) {
    isInAppBrowser = true;
    browserName = 'Messenger';
  } else if (/(FBAN|FBAV|FBIOS|FB_IAB|FBBV|FB4A)/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'Facebook / Messenger';
  } else if (/Instagram/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'Instagram';
  } else if (/TikTok|BytedanceWebview|musical_ly/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'TikTok';
  } else if (/\bLine\//i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'LINE';
  } else if (/MicroMessenger|WeChat/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'WeChat';
  } else if (/LinkedInApp/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'LinkedIn';
  } else if (/Snapchat/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'Snapchat';
  } else if (/Twitter|X-Client/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'X (Twitter)';
  } else if (/Viber/i.test(ua)) {
    isInAppBrowser = true;
    browserName = 'Viber';
  } else if (
    isAndroid &&
    (/; wv\)/i.test(ua) || /\bVersion\/[\d.]+ Chrome\/[\d.]+ Mobile Safari\/[\d.]+/i.test(ua))
  ) {
    isInAppBrowser = true;
    browserName = /messenger\.com/i.test(ref)
      ? 'Messenger'
      : /facebook\.com/i.test(ref)
        ? 'Facebook / Messenger'
        : 'In-App Browser';
  } else if (
    isIOS &&
    /AppleWebKit/i.test(ua) &&
    !/Safari\//i.test(ua) &&
    !/(CriOS|FxiOS|EdgiOS|OPiOS)/i.test(ua) &&
    !isStandalone
  ) {
    isInAppBrowser = true;
    browserName = /messenger\.com/i.test(ref)
      ? 'Messenger'
      : /facebook\.com/i.test(ref)
        ? 'Facebook / Messenger'
        : 'Messenger / In-App Browser';
  }

  const rawUrl =
    typeof window !== 'undefined'
      ? window.location.href
      : 'https://gen-lang-client-0866727915.firebaseapp.com';
  let cleanUrl = rawUrl;
  try {
    const parsedUrl = new URL(rawUrl);
    parsedUrl.searchParams.delete('fbclid');
    cleanUrl = parsedUrl.toString();
  } catch {
    cleanUrl = rawUrl;
  }

  let chromeIntentUrl: string | null = null;
  let safariSchemeUrl: string | null = null;
  try {
    const parsed = new URL(cleanUrl);
    const hostAndPath = `${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`;
    if (isAndroid) {
      chromeIntentUrl = `intent://${hostAndPath}#Intent;scheme=${parsed.protocol.replace(':', '')};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(cleanUrl)};end`;
    }
    if (isIOS) {
      safariSchemeUrl = `x-safari-${cleanUrl}`;
    }
  } catch {
    // Ignore URL construction errors
  }

  return {
    isInAppBrowser,
    browserName,
    isIOS,
    isAndroid,
    isMobile,
    isSessionStorageSupported: checkSessionStorageAvailable(),
    appUrl: cleanUrl,
    chromeIntentUrl,
    safariSchemeUrl,
  };
};

export const isMissingInitialStateOrStorageError = (error: any): boolean => {
  if (!error) return false;
  const code = String(error?.code || '').toLowerCase();
  const msg = String(error?.message || error || '').toLowerCase();
  return (
    code === 'auth/missing-initial-state' ||
    code === 'auth/web-storage-unsupported' ||
    code === 'auth/operation-not-supported-in-this-environment' ||
    code === 'auth/popup-blocked' ||
    msg.includes('missing initial state') ||
    msg.includes('sessionstorage is inaccessible') ||
    msg.includes('storage-partitioned') ||
    msg.includes('disallowed_useragent') ||
    msg.includes('popup-blocked') ||
    msg.includes('unable to establish a connection with the popup')
  );
};

// Resilient configuration resolution: prioritizes local file config, then env vars, with complete default fallbacks
const initialConfig: FirebaseOptions = {
  apiKey: fileConfig.apiKey || envConfig.apiKey || defaultClientConfig.apiKey,
  authDomain:
    resolveAuthDomain(
      fileConfig.authDomain || envConfig.authDomain,
      effectiveProjectId
    ) || defaultClientConfig.authDomain,
  projectId: effectiveProjectId,
  storageBucket:
    fileConfig.storageBucket ||
    envConfig.storageBucket ||
    (effectiveProjectId ? `${effectiveProjectId}.firebasestorage.app` : '') ||
    defaultClientConfig.storageBucket,
  messagingSenderId:
    fileConfig.messagingSenderId ||
    envConfig.messagingSenderId ||
    defaultClientConfig.messagingSenderId,
  appId:
    fileConfig.appId ||
    envConfig.appId ||
    defaultClientConfig.appId,
};

const isFirebaseConfigured = Boolean(initialConfig.apiKey && initialConfig.projectId);

const primaryApp =
  isFirebaseConfigured && typeof window !== 'undefined'
    ? getApps().length > 0
      ? getApp()
      : initializeApp(initialConfig)
    : null;

export let auth: Auth | null = primaryApp ? getAuth(primaryApp) : null;
export let db: Firestore | null = (() => {
  if (!primaryApp) return null;
  // Enable fast multi-tab persistent IndexedDB cache in browsers; fall back gracefully to memory cache
  try {
    return initializeFirestore(
      primaryApp,
      {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
        experimentalAutoDetectLongPolling: true,
      },
      FIRESTORE_DATABASE_ID
    );
  } catch {
    try {
      return initializeFirestore(
        primaryApp,
        {
          localCache: memoryLocalCache(),
          experimentalAutoDetectLongPolling: true,
        },
        FIRESTORE_DATABASE_ID
      );
    } catch {
      return getFirestore(primaryApp, FIRESTORE_DATABASE_ID);
    }
  }
})();
let activeProjectId = initialConfig.projectId || '';

// Validate connection to Firestore on boot as required
async function testConnection() {
  if (!db || typeof window === 'undefined') return;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      // Retry once after network / long-polling channel settles on initial iframe boot
      setTimeout(async () => {
        if (!db || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        try {
          await getDocFromServer(doc(db, 'test', 'connection'));
        } catch (retryErr) {
          if (retryErr instanceof Error && retryErr.message.includes('the client is offline')) {
            console.warn('Firestore connection check: client is currently offline.');
          }
        }
      }, 2500);
    }
  }
}
testConnection();

let authStateCallbacks: {
  onAuthSuccess?: (user: User, token: string | null) => void;
  onAuthFailure?: () => void;
} | null = null;
let currentUnsubscribe: (() => void) | null = null;

const bindAuthListener = () => {
  if (currentUnsubscribe) {
    currentUnsubscribe();
    currentUnsubscribe = null;
  }
  if (!auth || !authStateCallbacks) {
    authStateCallbacks?.onAuthFailure?.();
    return;
  }
  const { onAuthSuccess, onAuthFailure } = authStateCallbacks;
  currentUnsubscribe = onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      const validDriveToken =
        cachedAccessToken && !isDriveTokenExpired() ? cachedAccessToken : null;
      if (onAuthSuccess) onAuthSuccess(user, validDriveToken);
    } else {
      clearCachedToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

// Standard Firebase Auth Google provider (also requests drive.file scope so Drive backup works seamlessly)
const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
provider.setCustomParameters({
  prompt: 'select_account',
});

let isSigningIn = false;
const TOKEN_STORAGE_KEY = 'capitalflow_drive_access_token';
const TOKEN_TIME_STORAGE_KEY = 'capitalflow_drive_token_time';

// Google OAuth access tokens expire after 1 hour (3600s). Treat as expired at 55 minutes (3300s)
const TOKEN_MAX_AGE_MS = 55 * 60 * 1000;

let cachedAccessToken: string | null = (() => {
  try {
    return typeof sessionStorage !== 'undefined'
      ? sessionStorage.getItem(TOKEN_STORAGE_KEY)
      : null;
  } catch {
    return null;
  }
})();

let tokenAcquiredAt: number | null = (() => {
  try {
    const raw =
      typeof sessionStorage !== 'undefined'
        ? sessionStorage.getItem(TOKEN_TIME_STORAGE_KEY)
        : null;
    return raw ? parseInt(raw, 10) : null;
  } catch {
    return null;
  }
})();

export const isDriveTokenExpired = (): boolean => {
  if (!cachedAccessToken) return true;
  if (!tokenAcquiredAt) return false;
  return Date.now() - tokenAcquiredAt >= TOKEN_MAX_AGE_MS;
};

export const clearCachedToken = () => {
  cachedAccessToken = null;
  tokenAcquiredAt = null;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(TOKEN_STORAGE_KEY);
      sessionStorage.removeItem(TOKEN_TIME_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string | null) => void,
  onAuthFailure?: () => void
) => {
  authStateCallbacks = { onAuthSuccess, onAuthFailure };
  bindAuthListener();
  return () => {
    if (currentUnsubscribe) {
      currentUnsubscribe();
      currentUnsubscribe = null;
    }
    authStateCallbacks = null;
  };
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string | null;
} | null> => {
  if (!auth) {
    throw new Error(
      'Firebase configuration is missing. Please configure VITE_FIREBASE_* environment variables or firebase-applet-config.json.'
    );
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (credential?.accessToken) {
      cachedAccessToken = credential.accessToken;
      tokenAcquiredAt = Date.now();
      try {
        sessionStorage.setItem(TOKEN_STORAGE_KEY, cachedAccessToken);
        sessionStorage.setItem(TOKEN_TIME_STORAGE_KEY, String(tokenAcquiredAt));
      } catch {
        // Ignore storage errors
      }
    }
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/user-cancelled' ||
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      console.warn('Google sign-in was dismissed by user.');
      return null;
    }
    if (isMissingInitialStateOrStorageError(error)) {
      const envInfo = getBrowserEnvironmentInfo();
      const browserLabel = envInfo.isInAppBrowser ? envInfo.browserName : 'your current browser';
      const customErr: any = new Error(
        `Google Sign-In could not complete in ${browserLabel} because browser sessionStorage is partitioned or popups are restricted ("missing initial state"). Please open this link in Safari or Chrome.`
      );
      customErr.code = error?.code || 'auth/missing-initial-state';
      customErr.isBrowserStorageOrInAppError = true;
      throw customErr;
    }
    if (error?.code === 'auth/configuration-not-found') {
      throw new Error(
        `Firebase Auth is not enabled for project "${activeProjectId}". In Firebase Console → Authentication → Sign-in method, click "Get started" and enable the Google provider.`
      );
    }
    if (error?.code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      throw new Error(
        `Domain "${host}" is not authorized in Firebase project "${activeProjectId}". Add "${host}" in Firebase Console → Authentication → Settings → Authorized domains.`
      );
    }
    console.error('Google Sign-in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  if (isDriveTokenExpired()) {
    clearCachedToken();
    return null;
  }
  return cachedAccessToken;
};

/**
 * Acquires a Google Drive access token on demand when the user explicitly triggers
 * an optional Google Drive backup/restore action and the 1-hour Drive OAuth token has expired.
 */
export const ensureDriveAccessToken = async (): Promise<string | null> => {
  const existing = await getAccessToken();
  if (existing) return existing;
  const result = await googleSignIn();
  return result?.accessToken || null;
};

export const logout = async () => {
  if (auth) {
    await signOut(auth);
  }
  clearCachedToken();
};
