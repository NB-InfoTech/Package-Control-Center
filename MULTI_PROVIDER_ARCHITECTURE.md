# MULTI-PROVIDER ARCHITECTURE (PCC v2.1)

Package Control Center is now a **multi-source package control center**. Winget remains the
reference provider; Chocolatey and Microsoft Store are first-class providers behind a shared
abstraction. This document describes the layering, data shapes, routing rules, and the
constraints that keep the system correct end-to-end.

---

## 1. Goals

- One UI, multiple package sources: installed apps, available updates, queue, collections,
  and snapshots all aggregate across enabled providers.
- Every package carries its **source of truth** (`source` / `provider` tag) so that any
  later action (show / upgrade / install / uninstall / restore) executes on the correct CLI.
- Providers are **independently enable-able** in Settings; disabling one never breaks the
  others.
- The existing winget feature set (pinning, restore, snapshots, drift, health) keeps working
  unchanged.

## 2. Layer overview

```
Renderer (React)
  AvailableUpdates / InstalledApps / Dashboard / Settings / Collections
  Snapshots / QueuePanel (ProgressIndicator)
  services/winget.ts facade  ->  services/electron.tsx (typed bridge)
        |  window.api (preload)
src/preload/index.ts
        |  ipcRenderer.invoke / ipcRenderer.on
src/main/ipc/index.ts
  aggregation handlers (installed, updates, upgradeAll)
  provider-routed handlers (show, upgrade, install, uninstall, search,
                            collection:install, queue:retry)
  providers:list / providers:setEnabled
  legacy winget-only handlers (pin, ignore, restore, snapshots, drift)
        |
src/main/services/providers/index.ts  (registry)
  getProvider(id) · getEnabledProviders() · getActiveProviders()
  collectInstalledApps() · collectAvailableUpdates()
  resolveProviderForPackage() · getProviderInfos()
        |                       |                        |
  WingetProvider        ChocolateyProvider     MicrosoftStoreProvider
  id: winget            id: chocolatey         id: msstore
  winget CLI            choco CLI (2.x)        winget --source msstore
  + legacy IUpdateProvider surface
```

## 3. Core types (`src/main/services/types.ts` + `providers/IUpdateProvider.ts`)

| Type | Purpose |
|---|---|
| `ProviderId = 'winget' \| 'chocolatey' \| 'msstore'` | Closed union of source identifiers. |
| `ProviderAvailability` | `{ available, version?, reason? }` from `checkAvailability()`. |
| `ProviderInfo` | `ProviderId` + `displayName` + `enabled` + availability — drives the Settings card. |
| `InstalledApp.source: ProviderId` | Tags every installed-app row. |
| `AvailableUpdate.source: ProviderId` | Tags every update row. |
| `QueueItem.provider?: ProviderId` | Queue operations are provider-scoped (dedup + routing). |
| `CollectionPackage.provider?: ProviderId` | Optional per-package source for collections. |

Legacy winget-only shapes (`PinnedPackage`, `RestoreOptions`, `SystemSnapshot`, `DriftReport`, …)
remain in `IUpdateProvider.ts` and are implemented by `WingetProvider` alone.

## 4. Provider abstraction

### 4.1 `IPackageProvider` (shared core)

```ts
interface IPackageProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  checkAvailability(): Promise<ProviderAvailability>;
  getInstalledApps(): Promise<InstalledApp[]>;
  getAvailableUpdates(): Promise<AvailableUpdate[]>;
  showPackage(id: string): Promise<PackageDetails>;
  searchPackages(query: string): Promise<InstalledApp[]>;
  upgradePackage(id: string, packageName?: string, opts?): Promise<UpgradeResult>;
  upgradeAll(): Promise<UpgradeResult>;
  installPackage(id: string, name?: string): Promise<UpgradeResult>;
  uninstallPackage(id: string, name?: string): Promise<UpgradeResult>;
}
```

All three providers implement this. `WingetProvider` additionally implements the legacy
`IUpdateProvider` surface (detailed updates, pinning, ignore, restore preview/apply/report,
collections CRUD, snapshots, drift, health).

### 4.2 CLI behavior per provider

**Winget** (`winget`, verified v1.29.380)
- `winget list` / `winget upgrade` → 5-column table including the Source column.
- Source-specific calls (`winget list --source msstore`, `winget upgrade --source msstore`)
  emit a 3/4-column table **without** the Source column — `WingetParser` handles both shapes
  and stamps the source explicitly.

**Chocolatey** (`choco`, verified 2.7.3)
- `choco list` → `name version` lines + `N Packages.` footer
  (note: `-localonly` was **removed** in choco 2.x; plain `list` = installed packages).
- `choco outdated --local-only` → pipe-delimited `id|version|available|pinned`, plus a header
  line `Output is Id | Version | Available Version | Pinned` that the parser rejects via a
  strict 4-field, version-shaped match. Pinned rows (`|true`) are excluded from update lists;
  `choco upgrade all` natively skips pinned packages (no flag needed — `--ignore-pinned` would
  *override* pin protection and is therefore not used).
- `choco info <id>` → `Title:` / `Summary:` / `Software Site:` fields.
- `choco search <q>` → `id version [Approved]` lines.
- `choco upgrade <id> -y` / `choco upgrade all -y` / `choco install <id> -y` /
  `choco uninstall <id> -y`.

**Microsoft Store** (`winget --source msstore`)
- Deliberately built on the existing winget CLI with the `msstore` source pinned, so no
  Store API/credential handling is required. `id` values are `9NBLG…` store package IDs.
- `checkAvailability()` verifies the `msstore` source is present via `winget source list`.

### 4.3 Failure model

Every provider caches availability (TTL 60 s) and exposes `ensureAvailable()`; every
operation fails fast with a clear reason instead of producing half-parsed output when its
CLI is missing.

## 5. Registry and aggregation (`providers/index.ts`)

- `getProvider(id)` — case-insensitive lookup; unknown/missing ids fall back to `winget`
  (the default source for untagged, legacy packages).
- `getEnabledProviders()` — providers enabled in `configService.providers.enabled`
  (persisted; default: all enabled).
- `getActiveProviders()` — enabled **and** available.
- `collectInstalledApps()` / `collectAvailableUpdates()` — fan out over active providers in
  parallel, merge results, guarantee the `source` tag on every row. Per-provider failures are
  logged and skipped, so one broken source never blocks the others.
- `resolveProviderForPackage(provider?)` — maps an optional tag to a provider instance
  (defaults to winget).

## 6. IPC routing (`src/main/ipc/index.ts`)

| Channel | Mode | Notes |
|---|---|---|
| `installed:getAll` | aggregate | merged across active providers, source-tagged. |
| `updates:getAll` | aggregate | same. |
| `package:show` / `package:upgrade` / `package:install` / `package:uninstall` / `package:search` | routed | optional `provider` arg; defaults to winget. |
| `provider:upgradeAll` | multi | runs `upgradeAll()` on every active provider, returns `UpgradeResult[]` (one entry per provider) so the UI can report bulk status per source. |
| `providers:list` | registry | `ProviderInfo[]` (name, enabled, availability, version). |
| `providers:setEnabled` | registry | `{ id, enabled, autoInstall? }` persisted via ConfigService; with `autoInstall` it awaits `InstallService` and returns `{ ok, installOutcome? }` (v2.2 — was a bare boolean). |
| `queue:retry` | routed | provider-aware for upgrade / install / uninstall items. |
| `collection:install` | routed | packages with a non-winget `provider` tag run through that provider's `installPackage`; winget/untagged packages use the legacy `restorePackages` flow. Mixed-provider collections work. |
| `snapshot:create` | aggregate | captures installed apps from all active providers, preserving `source`. |
| `pin:*`, `ignore:*`, `restore:*`, `collection:*` (CRUD/export/import), `snapshot:*` (get/compare/delete), `drift:*`, `health:*` | winget-only | legacy features stay on `WingetProvider`; snapshots *created* in v2.1+ contain multi-source data, but snapshot compare/restore remains winget-scoped by design (see roadmap). |

## 7. Queue semantics

`UpdateQueueService` namespaces duplicate detection **by provider**:
`findActiveOperation(operation, packageId?, provider?)`. The same package id in two sources
(e.g. a package that exists in both winget and chocolatey) can therefore run in parallel
without false "already in progress" collisions, while a second request for the *same*
provider+package is still deduped. `QueueItem.provider` is set by providers at enqueue time
and drives both `queue:retry` routing and the provider chip in `QueuePanel` (QueueItemCard).

## 8. Configuration

`ConfigService` persists `providers.enabled: { winget, chocolatey, msstore }` (default: all
`true`) under the standard PCC config file. Toggles live on the **Settings → Package
Sources** card, which also shows each provider's availability and detected version.

## 9. UI integration

| Area | Behavior |
|---|---|
| AvailableUpdates | Source column; Show/Update/Install/Uninstall route by `update.source`; "Update all" reports per-provider results. |
| InstalledApps | Source label per row; detail view routes by source. |
| Dashboard | "By Source" card with installed + update counts per provider. |
| Settings | Package Sources card: availability, version, enable/disable toggle. Enabling a missing source auto-installs its package manager (spinner → outcome, incl. `needs-elevation` hint). |
| QueuePanel / QueueItemCard | Provider chip next to the package name for mixed-provider queues. |
| Collections | Create/edit dialog has a **Package source** selector (Winget default / Chocolatey / Microsoft Store) written into `CollectionPackage.provider`; install routes per package. |
| Snapshots | Comparison tables render `providerLabel(source)` for added/removed packages. |

`providerLabel()` (renderer `types`) maps `winget → Winget`, `chocolatey → Chocolatey`,
`msstore → Microsoft Store` (unknown → `Winget`).

## 10. Constraints & edge cases

- **ID collisions across sources are expected.** Routing always uses the stored
  `source`/`provider` tag; the UI never assumes a bare id implies winget except when the tag
  is absent (legacy data).
- **`upgradeAll` is per-provider.** Chocolatey skips pinned packages natively; winget and
  msstore follow their CLI semantics. The UI surfaces one result row per provider.
- **Microsoft Store has no native "pin" equivalent** in this build; pin management stays
  winget-only.
- **Collections are single-source per collection** in the current UI (one source selector),
  though the IPC layer accepts mixed-provider collections for forward compatibility.
- **Chocolatey requires the `choco` binary on PATH**; availability is checked with
  `choco --version` and cached.
- Snapshot *restore/apply* of non-winget rows is intentionally out of scope for v2.1 —
  snapshots record multi-source state (and drift detection compares against aggregated
  installed apps), but apply still targets the winget restore pipeline. See the roadmap.

## 11. Validation

- `npm run typecheck` (main + renderer) — passing.
- `npm run build` — passing.
- `node scripts/verify-multi-provider.cjs` — live exercise of all three providers against the
  real CLIs: availability, installed lists, update lists, `showPackage`, search, registry
  aggregation and provider resolution. Latest run: 15/15 checks passed
  (winget v1.29.380, choco 2.7.3, msstore available; 73 installed apps aggregated as
  winget 51 / chocolatey 19 / msstore 3).