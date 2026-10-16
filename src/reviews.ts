// Online module ratings live only in the review service, never in the local
// grades database, backup, or OneDrive catalog.
import { reviewFetch } from "./reviewTransport";

export interface ModuleRating {
  course_id: string;
  average_rating: number | null;
  rating_count: number;
}

export interface ModuleReview {
  course_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReviewDraft {
  rating: number;
  comment: string | null;
}

export class ReviewRequestError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ReviewRequestError";
  }
}

function pathFor(code: string): string {
  return `/courses/${encodeURIComponent(code)}`;
}

async function jsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) throw requestError(response.status);
  return response.json() as Promise<T>;
}

function requestError(status: number): ReviewRequestError {
  const message = status === 401 ? "Die Anmeldung ist abgelaufen. Bitte melde dich erneut an."
    : status === 403 ? "Für diese Bewertung fehlt die Berechtigung."
      : status === 404 ? "Dieses Modul ist für Online-Bewertungen noch nicht freigeschaltet."
        : status === 409 ? "Du hast dieses Modul bereits bewertet. Bitte lade deine Bewertung neu."
          : status === 422 ? "Die Bewertung ist ungültig. Bitte prüfe Sterne und Kommentar."
            : status === 429 ? "Zu viele Änderungen heute. Bitte versuche es morgen wieder."
              : status >= 500 ? "Der Bewertungsdienst ist gerade nicht erreichbar. Bitte versuche es später erneut."
                : "Die Bewertung konnte nicht geladen oder gespeichert werden.";
  return new ReviewRequestError(status, message);
}

export function reviewErrorMessage(error: unknown): string {
  if (error instanceof ReviewRequestError) return error.message;
  if (error instanceof Error && error.message === "Bitte zuerst mit Google anmelden.") return error.message;
  return "Keine Verbindung zum Bewertungsdienst. Prüfe deine Internetverbindung und versuche es erneut.";
}

export async function getModuleRating(code: string): Promise<ModuleRating> {
  return jsonResponse<ModuleRating>(await reviewFetch(`${pathFor(code)}/rating`));
}

export async function getRecentModuleReviews(code: string): Promise<ModuleReview[]> {
  return jsonResponse<ModuleReview[]>(await reviewFetch(`${pathFor(code)}/reviews?limit=20`));
}

export async function getMyModuleReview(code: string): Promise<ModuleReview | null> {
  const response = await reviewFetch(`${pathFor(code)}/reviews/me`, undefined, true);
  if (response.status === 404) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && "detail" in body && body.detail === "Review not found") {
      return null;
    }
  }
  return jsonResponse<ModuleReview>(response);
}

export async function createModuleReview(code: string, draft: ReviewDraft): Promise<ModuleReview> {
  return jsonResponse<ModuleReview>(await reviewFetch(`${pathFor(code)}/reviews`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  }, true));
}

export async function updateModuleReview(code: string, draft: ReviewDraft): Promise<ModuleReview> {
  return jsonResponse<ModuleReview>(await reviewFetch(`${pathFor(code)}/reviews/me`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(draft),
  }, true));
}

export async function deleteModuleReview(code: string): Promise<void> {
  const response = await reviewFetch(`${pathFor(code)}/reviews/me`, { method: "DELETE" }, true);
  if (!response.ok) throw requestError(response.status);
}
