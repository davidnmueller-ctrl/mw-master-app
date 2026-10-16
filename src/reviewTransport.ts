import { getReviewIdToken, isDesktopReviewAvailable, reviewApiOrigin } from "./reviewAuth";

export async function reviewFetch(
  path: string,
  init: RequestInit = {},
  authenticated = false,
): Promise<Response> {
  const origin = reviewApiOrigin();
  if (!isDesktopReviewAvailable() || !origin) {
    throw new Error("Online-Bewertungen sind noch nicht eingerichtet.");
  }
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("Ungültiger Bewertungs-Endpunkt.");
  }
  const url = new URL(path, origin);
  if (url.origin !== origin) throw new Error("Ungültiger Bewertungs-Endpunkt.");
  const headers = new Headers(init.headers);
  if (authenticated) {
    const token = await getReviewIdToken();
    if (!token) throw new Error("Bitte zuerst mit Google anmelden.");
    headers.set("Authorization", `Bearer ${token}`);
  }
  const { fetch } = await import("@tauri-apps/plugin-http");
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (init.signal?.aborted) controller.abort();
  else init.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(url.toString(), { ...init, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onAbort);
  }
}
