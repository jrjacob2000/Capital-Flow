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

// Optionally load local firebase-applet-config.json if present (e.g. in AI Studio),
// without failing the build when the file is gitignored in a public repository.
const localConfigModules = import.meta.glob<{ default: Record<string, string> }>(
  '../../firebase-applet-config.json',
  { eager: true }
);
const localFileConfig = localConfigModules['../../firebase-applet-config.json']?.default ?? {};

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

const envConfig: FirebaseOptions = {
  apiKey: cleanEnvValue(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: cleanEnvValue(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: cleanEnvValue(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: cleanEnvValue(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: cleanEnvValue(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: cleanEnvValue(import.meta.env.VITE_FIREBASE_APP_ID),
};

const fileConfig: FirebaseOptions = {
  apiKey: localFileConfig.apiKey || '',
  authDomain: localFileConfig.authDomain || '',
  projectId: localFileConfig.projectId || '',
  storageBucket: localFileConfig.storageBucket || '',
  messagingSenderId: localFileConfig.messagingSenderId || '',
  appId: localFileConfig.appId || '',
};

const hasEnvConfig = Boolean(envConfig.apiKey && envConfig.projectId);
const hasFileConfig = Boolean(fileConfig.apiKey && fileConfig.projectId);
const isDifferentProject =
  hasEnvConfig && hasFileConfig && envConfig.projectId !== fileConfig.projectId;

// Prioritize VITE_FIREBASE_* environment variables when configured.
const initialConfig: FirebaseOptions = hasEnvConfig ? envConfig : fileConfig;

const isFirebaseConfigured = Boolean(initialConfig.apiKey && initialConfig.projectId);

const primaryApp = isFirebaseConfigured
  ? getApps().length > 0
    ? getApp()
    : initializeApp(initialConfig)
  : null;

const fallbackApp =
  isDifferentProject && fileConfig.apiKey && fileConfig.projectId
    ? initializeApp(
        fileConfig,
        initialConfig.projectId === fileConfig.projectId ? 'fallback-local' : 'local-applet-config'
      )
    : null;

export let auth: Auth | null = primaryApp ? getAuth(primaryApp) : null;
let activeProjectId = initialConfig.projectId || '';

let authStateCallbacks: {
  onAuthSuccess?: (user: User, token: string) => void;
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
      if (cachedAccessToken && !isDriveTokenExpired()) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      clearCachedToken();
      if (onAuthFailure) onAuthFailure();
    }
  });
};

const isDomainAuthorized = (hostname: string, authorizedDomains: string[]): boolean => {
  const lowerHost = hostname.toLowerCase();
  return authorizedDomains.some((domain) => {
    const d = domain.trim().toLowerCase();
    if (!d) return false;
    return lowerHost === d || lowerHost.endsWith(`.${d}`);
  });
};

// If both envConfig and fileConfig exist for different projects, probe envConfig's Identity Toolkit setup
if (isDifferentProject && typeof window !== 'undefined') {
  fetch(
    `https://www.googleapis.com/identitytoolkit/v3/relyingparty/getProjectConfig?key=${encodeURIComponent(
      envConfig.apiKey || ''
    )}`
  )
    .then((res) => res.json())
    .then((data) => {
      const domains: string[] = Array.isArray(data?.authorizedDomains)
        ? data.authorizedDomains
        : [];
      const currentHost = window.location.hostname;
      if (data?.error?.message === 'CONFIGURATION_NOT_FOUND') {
        console.warn(
          `[Firebase Auth] Project "${envConfig.projectId}" does not have Firebase Authentication enabled yet (CONFIGURATION_NOT_FOUND). Using "${fileConfig.projectId}" from firebase-applet-config.json.`
        );
        if (fallbackApp && activeProjectId !== fileConfig.projectId) {
          auth = getAuth(fallbackApp);
          activeProjectId = fileConfig.projectId || '';
          bindAuthListener();
        }
      } else if (domains.length > 0 && !isDomainAuthorized(currentHost, domains)) {
        console.warn(
          `[Firebase Auth] Hostname "${currentHost}" is not yet matched by authorizedDomains (${domains.join(', ')}) for project "${envConfig.projectId}". Using "${fileConfig.projectId}" for this preview session.`
        );
        if (fallbackApp && activeProjectId !== fileConfig.projectId) {
          auth = getAuth(fallbackApp);
          activeProjectId = fileConfig.projectId || '';
          bindAuthListener();
        }
      } else if (isDomainAuthorized(currentHost, domains) && activeProjectId !== envConfig.projectId) {
        const envApp = initializeApp(envConfig, 'verified-env-config');
        auth = getAuth(envApp);
        activeProjectId = envConfig.projectId || '';
        bindAuthListener();
      }
    })
    .catch(() => {
      // Ignore network probe errors
    });
}

export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));
// Standard Google Account selection prompt
provider.setCustomParameters({
  prompt: 'select_account',
});

// Flag to indicate if we are in the middle of a sign-in flow
let isSigningIn = false;
// Cache the access token in memory only (NEVER in localStorage/sessionStorage)
let cachedAccessToken: string | null = null;
let tokenAcquiredAt: number | null = null;

// Google OAuth access tokens expire after 1 hour (3600s). Treat as expired at 55 minutes (3300s)
const TOKEN_MAX_AGE_MS = 55 * 60 * 1000;

export const isDriveTokenExpired = (): boolean => {
  if (!cachedAccessToken) return true;
  if (!tokenAcquiredAt) return false;
  return Date.now() - tokenAcquiredAt >= TOKEN_MAX_AGE_MS;
};

export const clearCachedToken = () => {
  cachedAccessToken = null;
  tokenAcquiredAt = null;
};

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
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

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  if (!auth) {
    throw new Error(
      'Firebase configuration is missing. Please configure VITE_FIREBASE_* environment variables or firebase-applet-config.json.'
    );
  }
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get Google Drive access token from authentication');
    }

    cachedAccessToken = credential.accessToken;
    tokenAcquiredAt = Date.now();
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    // If the user cancelled or closed the popup window, handle gracefully
    if (
      error?.code === 'auth/user-cancelled' ||
      error?.code === 'auth/popup-closed-by-user' ||
      error?.code === 'auth/cancelled-popup-request'
    ) {
      console.warn('Google sign-in was dismissed by user.');
      return null;
    }
    if (error?.code === 'auth/configuration-not-found') {
      if (fallbackApp && activeProjectId !== fileConfig.projectId) {
        auth = getAuth(fallbackApp);
        activeProjectId = fileConfig.projectId || '';
        bindAuthListener();
      }
      throw new Error(
        `Firebase Auth is not enabled for project "${activeProjectId}". In Firebase Console → Authentication → Sign-in method, click "Get started" and enable the Google provider.`
      );
    }
    if (error?.code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      if (fallbackApp && activeProjectId !== fileConfig.projectId) {
        auth = getAuth(fallbackApp);
        activeProjectId = fileConfig.projectId || '';
        bindAuthListener();
      }
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

export const logout = async () => {
  if (auth) {
    await signOut(auth);
  }
  clearCachedToken();
};
