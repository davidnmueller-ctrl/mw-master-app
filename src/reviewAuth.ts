import { invoke } from "@tauri-apps/api/core";
import type { Auth } from "firebase/auth";
import { isTauri } from "./api";

export type ReviewAuthState = {
  status: "loading" | "signed-in" | "signed-out";
  displayName?: string;
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim(),
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim(),
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim(),
};
const desktopClientId = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_ID?.trim();
const desktopClientSecret = import.meta.env.VITE_GOOGLE_DESKTOP_CLIENT_SECRET?.trim();
const apiBaseUrl = import.meta.env.VITE_REVIEWS_API_BASE_URL?.trim();

function configured(value: string | undefined): value is string {
  return Boolean(value && !value.includes("YOUR_") && !value.includes("example.invalid"));
}

export function reviewApiOrigin(): string | null {
  if (!configured(apiBaseUrl)) return null;
  try {
    const url = new URL(apiBaseUrl);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (
      (url.protocol !== "https:" && !(import.meta.env.DEV && loopback && url.protocol === "http:")) ||
      url.pathname !== "/" || url.search || url.hash || url.username || url.password
    ) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isDesktopReviewAvailable(): boolean {
  return isTauri && Boolean(
    reviewApiOrigin() &&
    configured(firebaseConfig.apiKey) &&
    configured(firebaseConfig.projectId) &&
    configured(firebaseConfig.appId) &&
    configured(desktopClientId) &&
    configured(desktopClientSecret) &&
    desktopClientId?.endsWith(".apps.googleusercontent.com"),
  );
}

const listeners = new Set<(state: ReviewAuthState) => void>();
let current: ReviewAuthState = {
  status: isDesktopReviewAvailable() ? "loading" : "signed-out",
};
let authPromise: Promise<Auth> | null = null;
let signInCancelled = false;

function publish(state: ReviewAuthState) {
  current = state;
  for (const listener of listeners) listener(state);
}

async function ensureAuth(): Promise<Auth> {
  if (!isDesktopReviewAvailable()) {
    throw new Error("Online-Bewertungen sind noch nicht eingerichtet.");
  }
  if (!authPromise) {
    authPromise = (async () => {
      const [{ getApps, initializeApp }, authModule] = await Promise.all([
        import("firebase/app"),
        import("firebase/auth"),
      ]);
      const app = getApps().find((candidate) => candidate.name === "mw-reviews") ??
        initializeApp(firebaseConfig, "mw-reviews");
      let auth: Auth;
      try {
        auth = authModule.initializeAuth(app, {
          persistence: [authModule.indexedDBLocalPersistence, authModule.browserLocalPersistence],
        });
      } catch (error) {
        if ((error as { code?: string }).code !== "auth/already-initialized") throw error;
        auth = authModule.getAuth(app);
      }
      authModule.onAuthStateChanged(
        auth,
        (user) => publish(user
          ? { status: "signed-in", displayName: user.displayName || undefined }
          : { status: "signed-out" }),
        () => publish({ status: "signed-out" }),
      );
      await auth.authStateReady();
      return auth;
    })().catch((error) => {
      authPromise = null;
      publish({ status: "signed-out" });
      throw error;
    });
  }
  return authPromise;
}

export function subscribeReviewAuth(listener: (state: ReviewAuthState) => void): () => void {
  listeners.add(listener);
  listener(current);
  if (isDesktopReviewAvailable()) void ensureAuth().catch(() => {});
  return () => listeners.delete(listener);
}

export async function signInForReviews(): Promise<void> {
  const auth = await ensureAuth();
  signInCancelled = false;
  let googleIdToken: string;
  try {
    googleIdToken = await invoke<string>("google_oauth_sign_in", { clientId: desktopClientId, clientSecret: desktopClientSecret });
  } catch (error) {
    throw new Error(typeof error === "string" ? error : "Google-Anmeldung konnte nicht gestartet werden.");
  }
  if (signInCancelled) throw new Error("Anmeldung abgebrochen.");
  try {
    const { GoogleAuthProvider, signInWithCredential } = await import("firebase/auth");
    await signInWithCredential(auth, GoogleAuthProvider.credential(googleIdToken));
    if (signInCancelled) {
      await auth.signOut();
      throw new Error("Anmeldung abgebrochen.");
    }
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "auth/network-request-failed") {
      throw new Error("Keine Verbindung zu Firebase. Bitte später erneut versuchen.");
    }
    if (code === "auth/invalid-credential" || code === "auth/account-exists-with-different-credential") {
      throw new Error("Google-Anmeldung konnte nicht bestätigt werden.");
    }
    throw error;
  }
}

export async function cancelReviewSignIn(): Promise<void> {
  signInCancelled = true;
  if (isTauri) await invoke("google_oauth_cancel");
}

export async function signOutOfReviews(): Promise<void> {
  const auth = await ensureAuth();
  const { signOut } = await import("firebase/auth");
  await signOut(auth);
}

export async function getReviewIdToken(): Promise<string | null> {
  const auth = await ensureAuth();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}
