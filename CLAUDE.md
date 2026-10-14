# CLAUDE.md

Context for Claude Code sessions in this repo. The full product spec (German)
is `docs/ANFORDERUNGEN.md` — read it before changing behaviour; when a
decision changes, update the spec in the same commit.

## What this is

A desktop app for students of the **M.Sc. Maschinenwesen at TUM**:

1. **Noten** – enter own grades; weighted average, certificate grade (cut
   after one decimal), predicate, structure check against the CP rules,
   deadline hint.
2. **Spielmodus** – real grades fixed, assumed grades for the open CP,
   resulting average. No back-calculation.
3. **Semesterplan / Katalog** – shared module catalog with descriptions,
   categories, TUMonline links, exam statistics ("Notenspiegel", several
   per module) and comments; modules are planned per exam semester.

Owner: Max (chat in German). Users: Max and friends in the same programme.

- **Stack:** Tauri 2 (Rust) + React 19 / TypeScript on Vite. Modelled on
  `C:\dev\pomodoro-app` (same structure and conventions).
- **Platforms:** Windows ARM64, Windows x64, macOS (universal). No mobile.
- **UI language is German.** Code, comments and commits are English.

## The two kinds of data — keep them apart

| | Private | Shared |
|---|---|---|
| What | Belegungen (grades + plan are the same records), Spielmodus rows, private notes, settings | manifest, regeln, tags, one JSON per module |
| Where | SQLite in the app data dir: `%APPDATA%\de.maxbergt.mwmaster\mwmaster.db` / `~/Library/Application Support/de.maxbergt.mwmaster/` | A folder the user links: Max' OneDrive `05_Master_App/shared/`, shared read-only with friends (synced or unpacked ZIP) |
| Who writes | the app | **only Claude in the claude.ai project "Master_App"** — never the app |
| Backups | JSON snapshot to a user-chosen folder after every change | — |

Rules that must not be broken:

- **The app never writes into the shared folder.** `crates/mwmaster-core/src/shared.rs`
  only reads. Don't add a write path, not even for Max.
- **No real data in this public repo.** No module catalog, no exam
  statistics, no grades. `examples/shared/` is invented sample data
  (codes `XX0001`…). Tests use invented numbers. `.gitignore` blocks the
  usual real-data folders.
- **Broken shared files never destroy good data.** `src/logic/shared.ts`
  validates file by file against `schema/*.schema.json`; an invalid or
  unreadable file keeps the cached previous version and produces a warning.
- **The shared data format is a contract** with the Claude project that
  maintains the data (`docs/ANFORDERUNGEN.md` §5). Change `schema/*.json`,
  `src/types.ts` and the spec together. Optional fields → bump MINOR of
  `schemaVersion`; anything incompatible → bump MAJOR and `APP_SCHEMA_MAJOR`
  in `src/logic/shared.ts` (older apps then keep their cache and ask for an update).
- **Rules live in `regeln.json`, not in code.** Categories, CP limits,
  grade steps, predicates, Auszeichnung, deadlines. `FALLBACK_REGELN` in
  `shared.ts` is only used before any folder is linked.

## Grade maths (don't "simplify" this)

- Grades are integers in **hundredths** (`note100`, 1,3 → 130), CP are
  weighted as integer **tenths**. Averages use exact integer division.
  Floating point gives wrong certificate grades: (1,0·3 + 1,0·5 + 1,3·4)/12
  is exactly 1,1 but naive float + floor gives 1,0 — there is a test for it.
- Certificate grade = average **cut** after the first decimal (§ 17 APSO).
  The "exact" value shown is also cut at two decimals so it never
  contradicts the certificate grade (1,2999 shows 1,29, not 1,30).
- Only categories with `zaehltZurNote` enter the average (§ 47 FPSO:
  Mastermodule, Hochschulpraktika, International Experience,
  Forschungspraxis, Thesis). Überfachliche Ergänzung counts for CP only.
- Recognised grades from abroad have one decimal (§ 16 APSO), status
  `anerkannt`; status `bestanden` only accepts the regular grade steps.
- Notenspiegel figures are computed from `verteilung` + `nichtErschienen`
  (definitions in the spec §5.5). They reproduce TUMonline's published
  averages exactly; `tumonline` values in the data are only for checking
  the extraction.

## Code structure

```
src/
  types.ts              Shared types (mirror schema/*.json)
  api.ts                Backend abstraction: Tauri invoke, or a localStorage
                        fake + examples/shared in a plain browser (isTauri)
  platform.ts           Dialogs, opener, updater wrappers with browser fallbacks
  store.tsx             Central React context: settings, Belegungen, shared
                        cache, Spielmodus, notes, auto-backup, hourly re-read
  logic/                PURE logic, unit-tested — put new logic here, not in components
    noten.ts            average, certificate grade, predicate, structure check, deadlines
    notenspiegel.ts     exam statistics key figures, pooling, main/repeat exam
    semester.ts         "WS 26/27"/"SS 27" parsing, order, Fachsemester, Termin → semester
    shared.ts           schema validation, merge with cache, FALLBACK_REGELN
    spiel.ts            Spielmodus: rows from plan, placeholders, result
    *.test.ts           node:test via tsx
  components/           Noten, Spielmodus, Plan, Katalog, ModulDetail, Charts,
                        BelegungDialog, Struktur, Einstellungen, Einrichtung, ui
crates/mwmaster-core/   Tauri-free Rust core (builds/tests anywhere)
  db.rs                 SQLite schema, Belegungen CRUD, kv, snapshot/restore
  backup.rs             atomic JSON backup write/read
  shared.rs             read-only access to the shared folder
src-tauri/              Tauri shell: lib.rs (plugins, DB in AppState), commands.rs
schema/                 JSON Schemas of the shared data (the contract)
examples/shared/        invented sample data (browser mode + tests)
docs/ANFORDERUNGEN.md   product spec (German)
```

kv keys: `settings`, `spiel`, `notizen`, `cache:shared`. Keys starting with
`cache:` are excluded from backups and survive a restore.

## Tests and checks

```bash
npm install                # once
npm run dev                # Vite only, browser fake backend; in the setup
                           # wizard type "beispieldaten" as folder
npm run tauri dev          # full app (Rust + Tauri prerequisites)
npm run build              # tsc --noEmit && vite build
npm test                   # logic tests (tsx --test)
cargo test -p mwmaster-core
```

CI (`.github/workflows/build.yml`) runs typecheck, `npm test` (TZ=Europe/Berlin)
and `cargo test -p mwmaster-core` on Ubuntu, then builds Windows ARM64,
Windows x64 and macOS universal.

## Releases and updates

Max asks Claude Code for releases ("mach ein Update", "neue Version").
**Always confirm the version number with Max before tagging** — a pushed
tag goes out to his friends as an update.

### How updates reach users

- Installed apps check
  `https://github.com/massimomassivo/mw-master-app/releases/latest/download/latest.json`
  on start (and via Einstellungen → "Nach Updates suchen").
- Only a **published GitHub release with a higher version** reaches
  installed apps. Pushes to `main` without a tag just build workflow
  artifacts (logged-in only, expire after 90 days) — nobody gets those.
- Shared data (catalog, Notenspiegel) never needs a release; it comes via
  the shared folder. Only app code/schema changes do.
- Not every commit needs a release; batch changes and release when useful.
- User data (SQLite in the app data dir) survives updates and reinstalls.

### Versioning (semver `MAJOR.MINOR.PATCH`)

- PATCH (0.1.0 → 0.1.1): bug fixes only.
- MINOR (0.1.x → 0.2.0): new features, visible UI changes, new optional
  shared-data fields, DB migrations.
- MAJOR: 1.0 when Max considers it stable, or breaking changes
  (e.g. shared-data schema MAJOR).
- Never reuse, move or delete a published tag. A broken release is fixed
  by the next PATCH release.

### Release procedure

1. `git pull` first — Max or Claude sometimes commit on github.com.
2. `npm test`, `cargo test -p mwmaster-core` and `npm run build` pass;
   last CI run on `main` is green.
3. Bump the version **identically in all three** places:
   `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`,
   then `npm install --package-lock-only` and `cargo check` to refresh
   `package-lock.json` and `Cargo.lock`.
4. Commit `Release vX.Y.Z`, then:
   ```bash
   git tag vX.Y.Z
   git push origin main
   git push origin vX.Y.Z
   ```
5. CI (`.github/workflows/build.yml`) on the tag: test → create-release
   (draft "MW Master vX.Y.Z") → build Windows ARM64, Windows x64, macOS
   universal, sign the update bundles, upload installers + `latest.json`
   → publish-release. Takes ~7 min. Watch it with `gh run watch` if
   `gh` is installed, otherwise GitHub → Actions.
6. Check the release (`gh release view vX.Y.Z` or the web page): two
   `*-setup.exe` (x64, arm64), the `.dmg`, the `.sig` files and
   `latest.json` with the new version.
7. Optional release notes: the workflow writes a fixed body (install
   hints). Add a short German changelog afterwards with
   `gh release edit vX.Y.Z --notes "..."` or on the web page.

**Never create a release in the GitHub web UI ("Draft a new release").**
That creates tag and release at once; the workflow's create-release job
then fails (only one release per tag) and no installers are built. Only
push the tag.

A local Windows build: `npm run tauri build` → installer in
`target/release/bundle/nsis/` (workspace root `target/`). With
`createUpdaterArtifacts: true` this needs `TAURI_SIGNING_PRIVATE_KEY`
(+ password) in the environment; for a quick local test without signing,
pass `--config '{"bundle":{"createUpdaterArtifacts":false}}'`.

### In-app updater and signing (enabled 2026-10-12)

- The signing key lives only on Max' machine: `~/.tauri/mw-master.key`
  (password protected) and `mw-master.key.pub`. **Never commit, print or
  copy the private key.** Max keeps a backup in his password manager.
- GitHub → Settings → Secrets → Actions: `TAURI_SIGNING_PRIVATE_KEY`
  (key file content) and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- `src-tauri/tauri.conf.json`: `plugins.updater.pubkey` = content of
  `mw-master.key.pub`, endpoint with `massimomassivo`,
  `bundle.createUpdaterArtifacts: true`. Don't change the pubkey —
  installed apps would reject every later update.
- **v0.2.0 is the first release with a working updater.** The v0.1.0 tag
  sits on a commit before the updater was enabled (placeholder endpoint
  `OWNER`, empty pubkey): v0.1.0 shows "Could not fetch a valid release
  JSON from the remote" and can never update itself. v0.1.0 installs must
  install v0.2.0 (or later) manually once; from then on the updater works.
- Troubleshooting: `failed to decode base64 secret key: Invalid symbol 10`
  in CI means the secret has a newline. Max re-copies it with
  `(Get-Content $HOME\.tauri\mw-master.key -Raw) -replace '\s','' | Set-Clipboard`,
  updates the secret, then re-run the failed jobs. A wrong password fails
  at the same signing step.
- If the key is ever lost: generate a new one, update secrets and pubkey;
  every user must install the next version manually once.

No paid code-signing certificates: Windows SmartScreen and macOS Gatekeeper
show a warning on first start (README explains the click path). The updater
signature is independent of that.

## Open / next steps

- First real release and a test install on Windows x64 and macOS.
- App icon is a placeholder (`assets/icon-source.png` → `npx tauri icon assets/icon-source.png -o src-tauri/icons`,
  then delete the generated `android/` and `ios/` folders).
- Not in V1 (spec §7): PDF import of the TUMonline transcript, exam attempts,
  timetable clashes, editing the catalog in the app.
