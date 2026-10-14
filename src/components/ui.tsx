// Small shared UI pieces.
import { useEffect, type ReactNode } from "react";
import { useStore } from "../store";
import type { Modul, Status } from "../types";
import { STATUS_LABEL } from "../types";
import { referenztermin, type Referenztermin } from "../logic/notenspiegel";

export function KategorieBadge({ id, unterbereich }: { id: string; unterbereich?: string | null }) {
  const { regeln } = useStore();
  const k = regeln.kategorien.find((x) => x.id === id);
  const u = k?.unterbereiche?.find((x) => x.id === unterbereich);
  const farbe = regeln.farben?.[id] ?? "var(--faint)";
  return (
    <span className="badge" title={k ? `${k.name}${u ? ` · ${u.name}` : ""}` : id}>
      <span className="dot" style={{ background: farbe }} />
      {k?.kurz ?? id}
      {u ? <span className="faint">· {u.id === "UE-ETHIK" ? "Ethik" : u.id === "UE-WEITERE" ? "Weitere" : u.name}</span> : null}
    </span>
  );
}

export function kategorieFarbe(regeln: { farben?: Record<string, string> }, id: string): string {
  return regeln.farben?.[id] ?? "var(--faint)";
}

const STATUS_KLASSE: Record<Status, string> = {
  idee: "",
  geplant: "accent",
  angemeldet: "warn",
  bestanden: "ok",
  anerkannt: "ok",
  nicht_bestanden: "bad",
};

export function StatusPill({ status }: { status: Status }) {
  return <span className={`pill ${STATUS_KLASSE[status]}`}>{STATUS_LABEL[status]}</span>;
}

export function Modal({ titel, onClose, children, footer }: { titel: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titel}>
        <div className="modal-head">
          <h2>{titel}</h2>
          <button className="ghost icon" onClick={onClose} aria-label="Schließen">
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function formatDatum(iso: string | null | undefined, mitZeit = false): string {
  if (!iso) return "–";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return mitZeit
    ? d.toLocaleString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const wenigText = (r: Referenztermin) => `Nur ${r.kennzahlen.angetreten} Angetretene, wenig aussagekräftig`;

/** A key figure; in the warning colour with a tooltip when the reference exam has too few Angetretene. */
export function Kennwert({ r, children }: { r: Referenztermin; children: ReactNode }) {
  return r.kleineStichprobe ? (
    <span className="wenig" title={wenigText(r)}>
      {children}
    </span>
  ) : (
    <>{children}</>
  );
}

/** Where a table value comes from: semester of the reference exam, "Wdh." for the fallback, warning for small samples. */
export function TerminHinweis({ r, ohneWarnung = false }: { r: Referenztermin; ohneWarnung?: boolean }) {
  const text = wenigText(r);
  return (
    <span className="faint small termin-hinweis">
      {" · "}
      {r.ns.semester}
      {r.istHaupttermin ? null : <span title="Kein Haupttermin vorhanden, es gilt der neueste Termin"> · Wdh.</span>}
      {r.kleineStichprobe && !ohneWarnung ? (
        <span className="warn-icon" role="img" aria-label={text} title={text}>
          {" ⚠"}
        </span>
      ) : null}
    </span>
  );
}

export function formatProzent(x: number | null): string {
  return x == null ? "–" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} %`;
}

export function formatSchnitt(x: number | null): string {
  return x == null ? "–" : x.toFixed(2).replace(".", ",");
}

const PATHS: Record<string, string> = {
  noten: "M4 19V9m6 10V5m6 14v-7m4 7H2",
  spiel: "M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6",
  plan: "M4 5h16v15H4zM4 9h16M9 3v4m6-4v4",
  katalog: "M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10",
  pruefungen: "M4 6h16v14H4zM4 10h16M8 3v5m8-5v5M8 14h3v3H8z",
  einstellungen: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-2-1.2L14.5 2h-5l-.4 2.6a7.5 7.5 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7.5 7.5 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2z",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  refresh: "M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7",
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name] ?? ""} />
    </svg>
  );
}

export interface InfoProps {
  /** Code of the module whose detail is open. */
  offen: string | null;
  oeffnen: (code: string) => void;
}

/** Button that opens the catalog detail; shows Ø bestanden if there is a Notenspiegel. Empty cell for rows without a catalog module. */
export function ModulInfo({ modul, info, label }: { modul?: Modul; info: InfoProps; label?: ReactNode }) {
  if (!modul) return <span />;
  const ref = referenztermin(modul);
  const title = ref
    ? `Beschreibung und Prüfungsstatistik öffnen · Ø bestanden ${formatSchnitt(ref.kennzahlen.schnittBestanden)} · Durchfall ${formatProzent(ref.kennzahlen.durchfallquote)} · ${ref.ns.semester}${ref.anzahlTermine > 1 ? ` (${ref.anzahlTermine} Termine)` : ""}${ref.kleineStichprobe ? ` · nur ${ref.kennzahlen.angetreten} Angetretene` : ""}`
    : "Beschreibung öffnen · noch keine Prüfungsstatistik";
  return (
    <button
      className={`ghost modul-info ${ref ? "hat-stat" : ""}`}
      aria-pressed={info.offen === modul.code}
      onClick={(e) => {
        e.stopPropagation();
        info.oeffnen(modul.code);
      }}
      title={title}
      aria-label={`${modul.titel}: ${title}`}
    >
      {label ?? (ref ? <Kennwert r={ref}>Ø {formatSchnitt(ref.kennzahlen.schnittBestanden)}</Kennwert> : "ⓘ")}
    </button>
  );
}
