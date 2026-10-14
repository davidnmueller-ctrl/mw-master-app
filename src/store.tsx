// Central state: settings, private records, the cached shared data and the
// Spielmodus. Components read it via useStore(); all writes go through the
// actions here so persistence and auto-backup stay in one place.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { backend } from "./api";
import { berichtAusCache, verarbeitePruefungen, zuLesendePruefungen } from "./logic/pruefungsdaten";
import { FALLBACK_REGELN, manifestGeaendert, verarbeite } from "./logic/shared";
import type {
  Belegung,
  Modul,
  PruefungsAnsicht,
  PruefungsBericht,
  PruefungsCache,
  Regeln,
  Settings,
  SharedData,
  SpielZeile,
} from "./types";
import { DEFAULT_PRUEFUNGS_ANSICHT, DEFAULT_SETTINGS } from "./types";

const KEY_SETTINGS = "settings";
const KEY_SPIEL = "spiel";
const KEY_NOTIZEN = "notizen";
const KEY_ANSICHT = "pruefungsansicht";
/** "cache:" keys are left out of backups (see crates/mwmaster-core/src/db.rs). */
const KEY_CACHE = "cache:shared";
const KEY_PRUEF_CACHE = "cache:pruefungen";

/** Re-check the shared folder at most once per hour while the app runs. */
const AUTO_INTERVALL_MS = 60 * 60 * 1000;
const BACKUP_VERZOEGERUNG_MS = 3000;

export interface EinleseStatus {
  laeuft: boolean;
  fehler: string | null;
  warnungen: string[];
  zuletztVersucht: string | null;
}

interface Store {
  bereit: boolean;
  settings: Settings;
  belegungen: Belegung[];
  shared: SharedData | null;
  /** Rules from the shared folder, or built-in fallback before one is linked. */
  regeln: Regeln;
  modulMap: Map<string, Modul>;
  /** Exam dates per semester (cache of pruefungen/*.json); empty without exam data. */
  pruefungen: PruefungsCache;
  /** Per-semester state of the exam data (Einstellungen). */
  pruefungsBericht: PruefungsBericht[];
  /** Saved filters of the "Prüfungen" view. */
  pruefungsAnsicht: PruefungsAnsicht;
  einlesen: EinleseStatus;
  spiel: SpielZeile[];
  notizen: Record<string, string>;
  backupInfo: { zuletzt: string | null; pfad: string | null; fehler: string | null };

  setSettings(patch: Partial<Settings>): Promise<void>;
  speichereBelegung(b: Belegung): Promise<Belegung>;
  loescheBelegung(id: number): Promise<void>;
  /** Read the shared folder. With `nurWennGeaendert`, only if manifest.updatedAt moved. */
  leseShared(opts?: { nurWennGeaendert?: boolean; pfad?: string }): Promise<void>;
  setSpiel(zeilen: SpielZeile[]): Promise<void>;
  setNotiz(code: string, text: string): Promise<void>;
  setPruefungsAnsicht(patch: Partial<PruefungsAnsicht>): Promise<void>;
  backupJetzt(): Promise<void>;
  wiederherstellen(pfad: string): Promise<number>;
}

const Ctx = createContext<Store | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [bereit, setBereit] = useState(false);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [belegungen, setBelegungen] = useState<Belegung[]>([]);
  const [shared, setShared] = useState<SharedData | null>(null);
  const [pruefungen, setPruefungen] = useState<PruefungsCache>({});
  const [pruefungsBericht, setPruefungsBericht] = useState<PruefungsBericht[]>([]);
  const [pruefungsAnsicht, setPruefungsAnsichtState] = useState<PruefungsAnsicht>(DEFAULT_PRUEFUNGS_ANSICHT);
  const [einlesen, setEinlesen] = useState<EinleseStatus>({ laeuft: false, fehler: null, warnungen: [], zuletztVersucht: null });
  const [spiel, setSpielState] = useState<SpielZeile[]>([]);
  const [notizen, setNotizen] = useState<Record<string, string>>({});
  const [backupInfo, setBackupInfo] = useState<Store["backupInfo"]>({ zuletzt: null, pfad: null, fehler: null });

  // Refs so callbacks always see the latest values without re-subscribing.
  const sharedRef = useRef<SharedData | null>(null);
  sharedRef.current = shared;
  const pruefRef = useRef<PruefungsCache>({});
  pruefRef.current = pruefungen;
  const ansichtRef = useRef(pruefungsAnsicht);
  ansichtRef.current = pruefungsAnsicht;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const notizenRef = useRef(notizen);
  notizenRef.current = notizen;
  const dirty = useRef(0);
  const [dirtyTick, setDirtyTick] = useState(0);
  const markDirty = () => {
    dirty.current += 1;
    setDirtyTick(dirty.current);
  };

  // ---------------- shared folder ----------------

  const leseShared = useCallback<Store["leseShared"]>(async (opts = {}) => {
    const pfad = opts.pfad ?? settingsRef.current.sharedPath;
    if (!pfad) return;
    const be = await backend();
    const jetzt = new Date().toISOString();
    setEinlesen((s) => ({ ...s, laeuft: true }));
    try {
      if (opts.nurWennGeaendert) {
        const mf = await be.sharedManifest(pfad);
        if (!manifestGeaendert(mf, sharedRef.current)) {
          setEinlesen((s) => ({ ...s, laeuft: false, zuletztVersucht: jetzt }));
          return;
        }
      }
      const read = await be.sharedRead(pfad);
      const r = verarbeite(read, sharedRef.current, jetzt);
      const warnungen = [...r.warnungen];
      if (r.daten && r.fehler == null) {
        setShared(r.daten);
        await be.kvSet(KEY_CACHE, JSON.stringify(r.daten));

        // Exam dates (schema 1.3): only files whose updatedAt changed are read.
        const zuLesen = zuLesendePruefungen(r.daten.manifest, pruefRef.current);
        const pr = zuLesen.length ? await be.sharedReadFiles(pfad, zuLesen.map((e) => e.datei)) : { files: [], errors: [] };
        const p = verarbeitePruefungen(r.daten.manifest, pr, pruefRef.current, r.daten.module, jetzt);
        warnungen.push(...p.warnungen);
        setPruefungsBericht(p.bericht);
        if (p.geaendert) {
          pruefRef.current = p.cache;
          setPruefungen(p.cache);
          await be.kvSet(KEY_PRUEF_CACHE, JSON.stringify(p.cache));
        }
      }
      setEinlesen({ laeuft: false, fehler: r.fehler, warnungen, zuletztVersucht: jetzt });
    } catch (e) {
      setEinlesen((s) => ({ ...s, laeuft: false, fehler: String(e instanceof Error ? e.message : e), zuletztVersucht: jetzt }));
    }
  }, []);

  // ---------------- initial load ----------------

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const be = await backend();
      const [s, bs, cache, sp, nz, pc, an] = await Promise.all([
        be.kvGet(KEY_SETTINGS),
        be.belegungenList(),
        be.kvGet(KEY_CACHE),
        be.kvGet(KEY_SPIEL),
        be.kvGet(KEY_NOTIZEN),
        be.kvGet(KEY_PRUEF_CACHE),
        be.kvGet(KEY_ANSICHT),
      ]);
      if (cancelled) return;
      const st = { ...DEFAULT_SETTINGS, ...parseJson<Partial<Settings>>(s, {}) };
      settingsRef.current = st;
      setSettingsState(st);
      setBelegungen(bs);
      const c = parseJson<SharedData | null>(cache, null);
      sharedRef.current = c;
      setShared(c);
      const p = parseJson<PruefungsCache>(pc, {});
      pruefRef.current = p;
      setPruefungen(p);
      setPruefungsBericht(berichtAusCache(p, c?.module ?? []));
      setPruefungsAnsichtState({ ...DEFAULT_PRUEFUNGS_ANSICHT, ...parseJson<Partial<PruefungsAnsicht>>(an, {}) });
      setSpielState(parseJson<SpielZeile[]>(sp, []));
      setNotizen(parseJson<Record<string, string>>(nz, {}));
      setBereit(true);
      // Always read the shared folder on start (cheap: local files only).
      if (st.sharedPath) void leseShared();
    })();
    return () => {
      cancelled = true;
    };
  }, [leseShared]);

  // Hourly check while the app is open.
  useEffect(() => {
    const t = window.setInterval(() => void leseShared({ nurWennGeaendert: true }), AUTO_INTERVALL_MS);
    return () => window.clearInterval(t);
  }, [leseShared]);

  // ---------------- private data ----------------

  const setSettings = useCallback<Store["setSettings"]>(async (patch) => {
    const next = { ...settingsRef.current, ...patch };
    settingsRef.current = next;
    setSettingsState(next);
    await (await backend()).kvSet(KEY_SETTINGS, JSON.stringify(next));
    markDirty();
  }, []);

  const speichereBelegung = useCallback<Store["speichereBelegung"]>(async (b) => {
    const saved = await (await backend()).belegungUpsert(b);
    setBelegungen((all) => (all.some((x) => x.id === saved.id) ? all.map((x) => (x.id === saved.id ? saved : x)) : [...all, saved]));
    markDirty();
    return saved;
  }, []);

  const loescheBelegung = useCallback<Store["loescheBelegung"]>(async (id) => {
    await (await backend()).belegungDelete(id);
    setBelegungen((all) => all.filter((x) => x.id !== id));
    markDirty();
  }, []);

  const setSpiel = useCallback<Store["setSpiel"]>(async (zeilen) => {
    setSpielState(zeilen);
    await (await backend()).kvSet(KEY_SPIEL, JSON.stringify(zeilen));
    markDirty();
  }, []);

  const setNotiz = useCallback<Store["setNotiz"]>(async (code, text) => {
    const next = { ...notizenRef.current };
    if (text.trim()) next[code] = text;
    else delete next[code];
    notizenRef.current = next;
    setNotizen(next);
    await (await backend()).kvSet(KEY_NOTIZEN, JSON.stringify(next));
    markDirty();
  }, []);

  const setPruefungsAnsicht = useCallback<Store["setPruefungsAnsicht"]>(async (patch) => {
    const next = { ...ansichtRef.current, ...patch };
    ansichtRef.current = next;
    setPruefungsAnsichtState(next);
    await (await backend()).kvSet(KEY_ANSICHT, JSON.stringify(next));
    markDirty();
  }, []);

  // ---------------- backup ----------------

  const backupJetzt = useCallback<Store["backupJetzt"]>(async () => {
    const dir = settingsRef.current.backupDir;
    if (!dir) return;
    try {
      const pfad = await (await backend()).backupWrite(dir);
      setBackupInfo({ zuletzt: new Date().toISOString(), pfad, fehler: null });
    } catch (e) {
      setBackupInfo((b) => ({ ...b, fehler: String(e instanceof Error ? e.message : e) }));
    }
  }, []);

  // Automatic backup a few seconds after the last change.
  useEffect(() => {
    if (!bereit || dirtyTick === 0 || !settings.backupDir) return;
    const t = window.setTimeout(() => void backupJetzt(), BACKUP_VERZOEGERUNG_MS);
    return () => window.clearTimeout(t);
  }, [dirtyTick, bereit, settings.backupDir, backupJetzt]);

  const wiederherstellen = useCallback<Store["wiederherstellen"]>(async (pfad) => {
    const be = await backend();
    const n = await be.backupRestore(pfad);
    const [s, bs, sp, nz, an] = await Promise.all([
      be.kvGet(KEY_SETTINGS),
      be.belegungenList(),
      be.kvGet(KEY_SPIEL),
      be.kvGet(KEY_NOTIZEN),
      be.kvGet(KEY_ANSICHT),
    ]);
    // A backup from another computer may carry different folder paths; keep this computer's.
    const st = {
      ...DEFAULT_SETTINGS,
      ...parseJson<Partial<Settings>>(s, {}),
      sharedPath: settingsRef.current.sharedPath,
      backupDir: settingsRef.current.backupDir,
      einrichtungFertig: true,
    };
    settingsRef.current = st;
    setSettingsState(st);
    await be.kvSet(KEY_SETTINGS, JSON.stringify(st));
    setBelegungen(bs);
    setSpielState(parseJson<SpielZeile[]>(sp, []));
    setNotizen(parseJson<Record<string, string>>(nz, {}));
    setPruefungsAnsichtState({ ...DEFAULT_PRUEFUNGS_ANSICHT, ...parseJson<Partial<PruefungsAnsicht>>(an, {}) });
    return n;
  }, []);

  const regeln = shared?.regeln ?? FALLBACK_REGELN;
  const modulMap = useMemo(() => new Map((shared?.module ?? []).map((m) => [m.code, m])), [shared]);

  const value: Store = {
    bereit,
    settings,
    belegungen,
    shared,
    regeln,
    modulMap,
    pruefungen,
    pruefungsBericht,
    pruefungsAnsicht,
    einlesen,
    spiel,
    notizen,
    backupInfo,
    setSettings,
    speichereBelegung,
    loescheBelegung,
    leseShared,
    setSpiel,
    setNotiz,
    setPruefungsAnsicht,
    backupJetzt,
    wiederherstellen,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
