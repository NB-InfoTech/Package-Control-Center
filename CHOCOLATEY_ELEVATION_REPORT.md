# Chocolatey Elevation / Non-Interactive Support — Report

Package Control Center (PCC) v2.1 · Chocolatey elevation fix
Status: **implemented, built, and verified (non-elevated path live-verified; elevated live checks opt-in)**

---

## 1. Problem summary

Chocolatey (`choco`) cannot elevate itself: its install/upgrade/uninstall
operations write to `C:\ProgramData\chocolatey`, which requires an
Administrator token. When PCC runs with standard privileges, every Chocolatey
mutating command fails with raw access-denied errors. Worse, on observed
Chocolatey 2.x behavior the process additionally **stopped on an interactive
prompt** ("…do you want to run this elevated?") that `-y` does **not**
suppress, so automated updates hung indefinitely in the queue.

Two things were needed:

1. Make every Chocolatey mutating command run **non-interactively** (no
   hanging prompts, fast failure instead of a stall).
2. Give the user a clear, actionable path to fix the situation: detect the
   lack of elevation **before** the operation, offer a **UAC relaunch** of PCC,
   and translate any residual admin failures into one friendly error.

## 2. Observed Chocolatey behavior

Observed on this machine (Chocolatey **2.7.3**, Windows 11, PowerShell 7):

- `choco install|upgrade|uninstall <pkg> -y --no-progress` started as a
  standard user **still prompted interactively** for elevation. The `-y`
  flag only answers the package confirmation, not the elevation question.
- Left unattended, the process **stalls on the prompt** until killed or the
  timeout fires — which is exactly what PCC's queue would experience.
- When the prompt is answered `y` **and** the process is not elevated, choco
  proceeds and fails fast with access-denied errors such as
  `Access to the path "C:\ProgramData\chocolatey\…" is denied.`
- `choco list`, `choco outdated`, `choco info` (read-only) work fine without
  elevation — only **mutating** commands are affected.

## 3. Stdin probe result

`scripts/probe-choco-stdin.cjs` (kept in the repo) proved the mechanics:

| Scenario | Result |
| --- | --- |
| `choco … -y --no-progress`, no stdin | **Stalls on the elevation prompt** (interactive) |
| `choco … -y --no-progress`, `y\r\n` pre-written to stdin | **Prompt resolved immediately**, command proceeds and fails fast when not elevated |

Conclusion: pre-answering `y\r\n` on the child process's stdin makes
Chocolatey mutating commands fully non-interactive.

## 4. Implemented flags / stdin

All Chocolatey mutating paths now run with:

- `-y` (accept package confirmation)
- `--no-progress` (quiet output)
- `stdinData: 'y\r\n'` — written to the child's stdin immediately after
  spawn, then stdin is closed (`CommandExecutor.executeStreaming` gained the
  `stdinData` option; it writes once on spawn and closes the stream, which
  also prevents the child from ever blocking on a TTY read).

Paths updated in `src/main/services/providers/ChocolateyProvider.ts`:
`upgradePackage`, `upgradeAll`, `installPackage`, `uninstallPackage`, and the
shared `runChocoOp` (which covers the latter two).

## 5. `requiresElevation` architecture

The capability flag is part of the provider abstraction, so **any future
provider that needs a privilege token** can declare it:

- `IPackageProvider.requiresElevation: boolean` (`IUpdateProvider.ts`)
  - `WingetProvider` = `false`
  - `MicrosoftStoreProvider` = `false`
  - `ChocolateyProvider` = `true`
- `ProviderInfo.requiresElevation` in main **and** renderer type definitions;
  populated by the registry's `getProviderInfos()` and sent to the renderer
  with the normal provider list payload.

The renderer gates operations off this flag (see §9), so the whole flow is
data-driven: flipping one provider's flag re-enables/disables all UI gating.

## 6. Admin detection

`src/main/services/admin.ts` (pure module, no Electron imports — directly
testable from Node):

- `isAdministrator()` runs `whoami /groups` and looks for
  `S-1-16-12288` / "High Mandatory Level" (the elevated integrity label).
- Result is **cached for 30 s** (cheap on repeated IPC calls);
  `clearAdminCache()` invalidates it.
- Non-Windows platforms report `true` (no UAC model).
- On any detection failure it reports **`false`** (fail-safe: the UI offers
  the elevation path instead of attempting privileged operations blind).

IPC: `system:isAdministrator` → renderer `electronAPI.system.isAdministrator()`.

## 7. UAC relaunch flow

IPC: `system:relaunchAsAdmin` → renderer `electronAPI.system.relaunchAsAdmin()`.

Main process (`src/main/ipc/index.ts`):

1. A short-lived PowerShell wrapper runs
   `Start-Process -FilePath '<exe>' [-ArgumentList …] -Verb RunAs -PassThru`.
   The original launch arguments are passed through, so **dev mode**
   (`electron <entry>`) relaunches the app correctly, while the packaged
   exe needs none.
2. **User accepts UAC** → the wrapper exits `0`; the current instance quits
   after a 500 ms grace period. Its `before-quit` handler persists queue and
   config state; the elevated instance (Electron boot takes well over a
   second) reads that state only after the old instance has written it.
3. **User cancels UAC** → the wrapper exits `1`; the current instance
   **keeps running**. A declined prompt never silently loses the app.

Design notes:

- `app.relaunch({ elevated: true })` was considered and rejected: it cannot
  report a UAC cancellation, so the app would quit even when the user
  declines. The PowerShell wrapper's exit code makes the flow cancel-safe.
- There is **no single-instance lock** in this codebase; the 500 ms grace
  plus the natural Electron boot delay of the new instance avoids both
  processes holding config/queue files at the same time.
- If the user accepts UAC while updates are still running, the existing P6
  close-interception dialog (in the old instance) asks what to do with the
  active operations before the handover completes — no new code needed.

## 8. Error mapping

`translateChocoError()` (exported from `ChocolateyProvider.ts`) maps raw
admin-style failures to one friendly, actionable message:

> Administrator privileges are required. Please restart Package Control
> Center as Administrator and try again.

Recognized patterns (case-insensitive): `access to the path … is denied`,
`access denied`, `UnauthorizedAccessException`, `admin(istrator)? rights
(are) required`, `you must (be|run) … admin`, `not running from an elevated`,
`from an (elevated|administrator) (prompt|terminal|command|shell)`,
`elevation is required`, `needs elevation`, `run this … as admin`, `EACCES`,
`permission denied`.

Applied on every Chocolatey mutating result: failed `UpgradeResult` objects
(`withFriendlyChocoError`) and thrown errors (the catch paths of
`upgradePackage` / `upgradeAll` / `runChocoOp`). Successful results pass
through untouched.

## 9. Renderer gating locations

Shared helper: `src/renderer/src/components/common/ElevationGuard.tsx`
— `useElevationGuard()` returns `{ ensure(sources), ui }`:

- `ensure('chocolatey' | ['winget','chocolatey', …])` resolves:
  - `'proceed'` — no elevation-requiring provider involved, or PCC is
    already elevated;
  - `'blocked'` — the user cancelled the dialog;
  - `'restarting'` — the user picked **Restart PCC as Administrator**
    (UAC relaunch; the app quits).
- The dialog text: *“Chocolatey updates require Administrator privileges.”*
  Buttons: **Restart PCC as Administrator** / **Cancel**.
- `ui` is rendered once per page (a portaled dialog; inert when closed).

Facade: `WingetService.isAdministrator()` and
`WingetService.relaunchAsAdmin()` in `src/renderer/src/services/winget.ts`.

Gated call sites:

| File | Operation |
| --- | --- |
| `pages/AvailableUpdates.tsx` | single-package update (`handleUpgrade`), update-all (`handleUpdateAll` — gates on the distinct sources of the pending list) |
| `pages/Collections.tsx` | collection install (`handleInstall` — gates on the collection's package provider tags) |
| `components/common/QueuePanel.tsx` | retry of queued install/upgrade/uninstall (`handleRetry`), stop-and-retry (`handleStopAndRetry`) — for any item whose `provider` requires elevation |
| `pages/Settings.tsx` | not gated, but shows the current privilege level (green/amber banner), a “Needs admin” badge on elevation-requiring providers, and a **Restart as Administrator** button when not elevated |

`InstalledApps.tsx` and `Dashboard.tsx` contain no mutating call sites
(read-only / navigation only), so no gating was needed there.

## 10. Verification results

Commands (from repo root, after `npm run build`):

- `npm run typecheck` — **PASS**
- `npm run build` — **PASS** (main + renderer)
- `node scripts/verify-multi-provider.cjs` — **ALL CHECKS PASSED** (no
  regression: 73 installed apps aggregated; winget 51 / chocolatey 19 /
  msstore 3; 4 chocolatey updates detected on this machine)
- `node scripts/verify-choco-elevation.cjs` — **ALL CHECKS PASSED** (see below)

### Non-elevated (verified live in this session)

- `requiresElevation` flags: winget `false`, chocolatey `true`, msstore `false`.
- `translateChocoError` unit cases: 7 positive + 4 negative — all correct.
- `isAdministrator()` (live): correctly reported **NOT elevated**.
- Provider-layer mutating probe —
  `choco install pcc-elevation-probe-does-not-exist -y --no-progress` through
  `ChocolateyProvider.installPackage` (guaranteed-nonexistent package, so
  strictly non-destructive):
  - completed in **2.4 s** (no interactive stall; without the stdin fix the
    same command hung on the prompt),
  - returned `success: false`,
  - error was exactly the friendly admin message.

### Elevated (opt-in, not exercised in this session)

The session this was written in is non-elevated, so the elevated live checks
were skipped by design. To run them from an **elevated terminal**:

- Chocolatey self-update: `node scripts/verify-choco-elevation.cjs` —
  automatically runs `provider.upgradePackage('chocolatey')` when choco
  itself has an available update (otherwise reported as up to date).
- One normal package:
  `node scripts/verify-choco-elevation.cjs --live <packageId>` — upgrades a
  user-approved package through the provider layer (the script prints
  candidate ids when updates exist).
- `--skip-live` disables the elevated live section.

In elevated mode the same probe is expected to fail fast with a normal
"package not found"-style error (and **not** the admin message), which the
script asserts.

## 11. Known limitations

- **Elevated live checks require an elevated terminal** — they cannot be
  exercised from a standard session; destructive live tests (self-update,
  package upgrade) need user approval, which is why the script takes an
  explicit `--live <packageId>` argument instead of picking a package.
- **UAC cancel leaves PCC running** (intentional). The renderer toast simply
  auto-dismisses; there is no follow-up notification that the relaunch was
  declined. The user can retry from the same dialog or from Settings.
- **Dev vs packaged relaunch:** both pass the original launch arguments, so
  both modes relaunch correctly. In dev mode the elevated instance connects
  to the same Vite dev server as the old one; in packaged mode the real
  executable is used. Without a single-instance lock, an accepted UAC prompt
  while active updates are running can briefly run two instances until the
  old one's P6 close-interception dialog resolves.
- **Admin state is cached 30 s** — a relaunch completes in seconds, so the
  new instance re-detects elevation fresh (the cache is per-process).
- The elevation prompt is answered with `y` regardless of the user's
  privilege state; when PCC **is** elevated the answer has no effect and the
  command runs normally.