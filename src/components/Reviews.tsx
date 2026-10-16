import { useEffect, useRef, useState } from "react";
import { bestaetigen } from "../platform";
import {
  cancelReviewSignIn,
  isDesktopReviewAvailable,
  signInForReviews,
  signOutOfReviews,
  subscribeReviewAuth,
} from "../reviewAuth";
import {
  createModuleReview,
  deleteModuleReview,
  getModuleRating,
  getMyModuleReview,
  getRecentModuleReviews,
  reviewErrorMessage,
  updateModuleReview,
  type ModuleRating,
  type ModuleReview,
} from "../reviews";

type AuthState = { status: "loading" | "signed-out" | "signed-in"; displayName?: string };
type PublicState =
  | { code: string; status: "loading" }
  | { code: string; status: "error"; message: string }
  | { code: string; status: "ready"; rating: ModuleRating; reviews: ModuleReview[] };
type OwnState =
  | { code: string; status: "loading" }
  | { code: string; status: "error"; message: string }
  | { code: string; status: "ready"; review: ModuleReview | null };

const MAX_COMMENT_LENGTH = 2000;

export function Reviews({ code }: { code: string }) {
  const available = isDesktopReviewAvailable();
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });
  const [publicState, setPublicState] = useState<PublicState>({ code, status: "loading" });
  const [ownState, setOwnState] = useState<OwnState>({ code, status: "loading" });
  const [reload, setReload] = useState(0);
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [pending, setPending] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const signInCancelled = useRef(false);
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!available) return;
    return subscribeReviewAuth(setAuth);
  }, [available]);

  useEffect(() => {
    if (!available) return;
    let active = true;
    setPublicState({ code, status: "loading" });
    void Promise.all([getModuleRating(code), getRecentModuleReviews(code)])
      .then(([nextRating, reviews]) => {
        if (active) setPublicState({ code, status: "ready", rating: nextRating, reviews });
      })
      .catch((error: unknown) => {
        if (active) setPublicState({ code, status: "error", message: reviewErrorMessage(error) });
      });
    return () => { active = false; };
  }, [available, code, reload]);

  useEffect(() => {
    if (!available || auth.status !== "signed-in") return;
    let active = true;
    setOwnState({ code, status: "loading" });
    void getMyModuleReview(code)
      .then((review) => {
        if (!active) return;
        setOwnState({ code, status: "ready", review });
        setRating(review?.rating ?? 5);
        setComment(review?.comment ?? "");
      })
      .catch((error: unknown) => {
        if (active) setOwnState({ code, status: "error", message: reviewErrorMessage(error) });
      });
    return () => { active = false; };
  }, [available, auth.status, code, reload]);

  useEffect(() => {
    setActionError("");
    setNotice("");
  }, [code]);

  if (!available) {
    return (
      <section className="stack reviews" aria-label="Online-Bewertungen">
        <h3>Bewertungen</h3>
        <p className="small muted">Online-Bewertungen sind nur in einer eingerichteten Desktop-App verfügbar.</p>
      </section>
    );
  }

  const shownPublic = publicState.code === code ? publicState : { code, status: "loading" as const };
  const shownOwn = ownState.code === code ? ownState : { code, status: "loading" as const };
  const comments = shownPublic.status === "ready" ? shownPublic.reviews.filter((review) => review.comment?.trim()) : [];

  async function signIn() {
    setActionError("");
    setPending(true);
    setSigningIn(true);
    signInCancelled.current = false;
    try {
      await signInForReviews();
    } catch (error) {
      if (!signInCancelled.current) setActionError(error instanceof Error ? error.message : reviewErrorMessage(error));
    } finally {
      setSigningIn(false);
      setPending(false);
    }
  }

  async function cancelSignIn() {
    signInCancelled.current = true;
    try {
      await cancelReviewSignIn();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : reviewErrorMessage(error));
    }
  }

  async function signOut() {
    setActionError("");
    setPending(true);
    try {
      await signOutOfReviews();
      setOwnState({ code, status: "loading" });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : reviewErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (auth.status !== "signed-in" || shownOwn.status !== "ready") return;
    setActionError("");
    setNotice("");
    setPending(true);
    try {
      const draft = { rating, comment: comment.trim() || null };
      if (shownOwn.review) await updateModuleReview(code, draft);
      else await createModuleReview(code, draft);
      setNotice("Deine Bewertung wurde gespeichert.");
      setOwnState({ code, status: "loading" });
      setReload((value) => value + 1);
    } catch (error) {
      setActionError(reviewErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (auth.status !== "signed-in" || shownOwn.status !== "ready" || !shownOwn.review) return;
    if (!(await bestaetigen("Deine Bewertung für dieses Modul wirklich löschen?", "Bewertung löschen"))) return;
    setActionError("");
    setNotice("");
    setPending(true);
    try {
      await deleteModuleReview(code);
      setNotice("Deine Bewertung wurde gelöscht.");
      setOwnState({ code, status: "loading" });
      setReload((value) => value + 1);
    } catch (error) {
      setActionError(reviewErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="stack reviews" aria-label="Online-Bewertungen">
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h3>Bewertungen</h3>
          <span className="small muted">Erfahrungen von Studierenden · 5 Sterne sind am besten</span>
        </div>
        <button className="ghost" onClick={() => setReload((value) => value + 1)} disabled={pending || shownPublic.status === "loading"}>
          Aktualisieren
        </button>
      </div>

      {shownPublic.status === "loading" ? <p className="small muted" role="status">Bewertungen werden geladen …</p> : null}
      {shownPublic.status === "error" ? (
        <div className="notice warn" role="alert">
          <span>{shownPublic.message}</span>
          <button onClick={() => setReload((value) => value + 1)}>Erneut versuchen</button>
        </div>
      ) : null}
      {shownPublic.status === "ready" ? (
        <>
          <div className="review-summary" role="group" aria-label={shownPublic.rating.rating_count
            ? `${formatRating(shownPublic.rating.average_rating)} von 5 Sternen bei ${shownPublic.rating.rating_count} Bewertungen`
            : "Noch keine Bewertungen"}>
            {shownPublic.rating.rating_count ? (
              <>
                <strong className="review-average">{formatRating(shownPublic.rating.average_rating)}</strong>
                <span className="review-summary-star" aria-hidden="true">★</span>
                <span className="small muted">von 5 · {shownPublic.rating.rating_count} {shownPublic.rating.rating_count === 1 ? "Bewertung" : "Bewertungen"}</span>
              </>
            ) : <span className="small muted">Noch keine Bewertungen.</span>}
          </div>

          <div className="stack" aria-label="Neueste Kommentare">
            <strong className="small">Neueste Kommentare</strong>
            {comments.length ? comments.map((review, index) => (
              <article className="comment review-comment" key={`${review.created_at}-${index}`}>
                <div className="row small muted">
                  <span aria-label={`${review.rating} von 5 Sternen`}>{review.rating} ★</span>
                  <span>· Anonym · {formatReviewDate(review.updated_at)}</span>
                </div>
                <p>{review.comment}</p>
              </article>
            )) : <p className="small muted">Unter den neuesten Bewertungen gibt es keine Kommentare.</p>}
          </div>
        </>
      ) : null}

      <div className="review-editor stack">
        {auth.status === "loading" ? <p className="small muted" role="status">Anmeldung wird geladen …</p> : null}
        {auth.status === "signed-out" ? (
          <div className="row between">
            <span className="small muted">Du kannst mit einem Google-Konto selbst bewerten.</span>
            {signingIn ? <button onClick={() => void cancelSignIn()}>Anmeldung abbrechen</button>
              : <button onClick={() => void signIn()} disabled={pending}>Bewertung schreiben</button>}
          </div>
        ) : null}
        {auth.status === "signed-in" ? (
          <>
            <div className="row between">
              <strong>Deine Bewertung</strong>
              <div className="row small muted">
                {auth.displayName ? <span>{auth.displayName}</span> : null}
                <button className="ghost" onClick={() => void signOut()} disabled={pending}>Abmelden</button>
              </div>
            </div>
            {shownOwn.status === "loading" ? <p className="small muted" role="status">Deine Bewertung wird geladen …</p> : null}
            {shownOwn.status === "error" ? (
              <div className="notice warn" role="alert">
                <span>{shownOwn.message}</span>
                <button onClick={() => setReload((value) => value + 1)}>Erneut versuchen</button>
              </div>
            ) : null}
            {shownOwn.status === "ready" ? (
              <>
                <fieldset className="review-stars" disabled={pending}>
                  <legend>Sterne</legend>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <label key={value} className={rating === value ? "selected" : ""}>
                      <input type="radio" name={`rating-${code}`} value={value} checked={rating === value} onChange={() => setRating(value)} aria-label={`${value} ${value === 1 ? "Stern" : "Sterne"}`} />
                      {value} ★
                    </label>
                  ))}
                </fieldset>
                <label className="field">
                  Kommentar (optional)
                  <textarea value={comment} maxLength={MAX_COMMENT_LENGTH} onChange={(event) => setComment(event.target.value)} placeholder="Wie war das Modul für dich?" />
                </label>
                <p className="small faint">Deine Bewertung erscheint öffentlich ohne deinen Namen. Bitte teile hier keine privaten Daten.</p>
                <div className="row">
                  <button className="primary" onClick={() => void save()} disabled={pending || (shownOwn.review?.rating === rating && (shownOwn.review.comment ?? "").trim() === comment.trim())}>
                    {shownOwn.review ? "Änderungen speichern" : "Bewertung veröffentlichen"}
                  </button>
                  {shownOwn.review ? <button className="danger" onClick={() => void remove()} disabled={pending}>Bewertung löschen</button> : null}
                </div>
              </>
            ) : null}
          </>
        ) : null}
        {actionError ? <p className="notice bad" role="alert">{actionError}</p> : null}
        {notice ? <p className="notice ok" role="status">{notice}</p> : null}
      </div>
    </section>
  );
}

function formatRating(value: number | null): string {
  return value?.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) ?? "–";
}

function formatReviewDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString("de-DE");
}
