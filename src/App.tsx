import { useState } from "react";
import { Einrichtung } from "./components/Einrichtung";
import { Einstellungen } from "./components/Einstellungen";
import { Katalog } from "./components/Katalog";
import { Noten } from "./components/Noten";
import { Plan } from "./components/Plan";
import { Pruefungen } from "./components/Pruefungen";
import { Spielmodus } from "./components/Spielmodus";
import { formatDatum, Icon } from "./components/ui";
import { useStore } from "./store";

type Seite = "noten" | "spiel" | "plan" | "pruefungen" | "katalog" | "einstellungen";

const NAV: { id: Seite; label: string }[] = [
  { id: "noten", label: "Noten" },
  { id: "spiel", label: "Spielmodus" },
  { id: "plan", label: "Semesterplan" },
  { id: "pruefungen", label: "Prüfungen" },
  { id: "katalog", label: "Katalog" },
  { id: "einstellungen", label: "Einstellungen" },
];

export default function App() {
  const { bereit, settings, shared, einlesen } = useStore();
  const [seite, setSeite] = useState<Seite>("noten");

  if (!bereit) return null;
  if (!settings.einrichtungFertig) return <Einrichtung />;

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Hauptnavigation">
        <div className="brand">
          <div className="brand-mark">MW</div>
          <div className="brand-name">MW Master</div>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className="nav-btn" aria-current={seite === n.id ? "page" : undefined} onClick={() => setSeite(n.id)}>
            <Icon name={n.id} />
            {n.label}
          </button>
        ))}
        <div className="sidebar-foot small">
          {shared ? (
            <>
              <span className="muted">Datenstand</span>
              <span className="mono">{formatDatum(shared.manifest.updatedAt)}</span>
              <span className="faint">{shared.module.length} Module</span>
            </>
          ) : (
            <span className="faint">Kein Katalog verknüpft</span>
          )}
          {einlesen.fehler || einlesen.warnungen.length ? (
            <button className="ghost small" style={{ color: "var(--warn)", padding: "2px 0", textAlign: "left" }} onClick={() => setSeite("einstellungen")}>
              ⚠ Hinweise beim Einlesen
            </button>
          ) : null}
        </div>
      </nav>
      <main className="main">
        {seite === "noten" ? <Noten /> : null}
        {seite === "spiel" ? <Spielmodus /> : null}
        {seite === "plan" ? <Plan /> : null}
        {seite === "pruefungen" ? <Pruefungen zuEinstellungen={() => setSeite("einstellungen")} /> : null}
        {seite === "katalog" ? <Katalog zuEinstellungen={() => setSeite("einstellungen")} /> : null}
        {seite === "einstellungen" ? <Einstellungen /> : null}
      </main>
    </div>
  );
}
