# MULTI-PROVIDER ROADMAP (PCC)

Package Control Center's plan to become a **multi-source package control center**: Winget
today, Chocolatey and Microsoft Store in v2.1, with a clear path toward deeper parity and
further sources.

---

## v2.1 — "Multi-source core" (DELIVERED, 2026-10-03)

### Delivered

- **Provider abstraction**
  - `ProviderId` / `ProviderInfo` / `ProviderAvailability` types.
  - `IPackageProvider` shared interface (availability, installed, updates, details,
    search, upgrade one/all, install, uninstall).
  - `WingetProvider`, `ChocolateyProvider` (choco 2.x formats), `MicrosoftStoreProvider`
    (`winget --source msstore`).
  - Provider registry with enablement-aware aggregation
    (`providers/index.ts`): `getProvider`, `getActiveProviders`, `collectInstalledApps`,
    `collectAvailableUpdates`, `resolveProviderForPackage`, `getProviderInfos`.
- **Data model**
  - `source`/`provider` tags on installed apps, updates, queue items, and collection
    packages; source preserved in snapshots and drift reports.
- **IPC**
  - Aggregated installed/updates across active providers.
  - Provider-routed `show` / `upgrade` / `install` / `uninstall` / `search` /
    `queue:retry` / `collection:install`.
  - `provider:upgradeAll` returns one `UpgradeResult` per active provider.
  - `providers:list` + `providers:setEnabled` (persisted in `ConfigService.providers.enabled`).
- **Queue**
  - Provider-scoped duplicate detection (`UpdateQueueService.findActiveOperation`).
  - New `install` / `uninstall` operations; provider chip in `QueuePanel` (QueueItemCard).
- **UI**
  - Source column + provider-routed actions in AvailableUpdates; source labels in
    InstalledApps; "By Source" counts on the Dashboard; Package Sources card with
    availability + enable/disable toggles in Settings; source labels in snapshot
    comparisons; source selector in the Collections create/edit dialog.
- **Quality**
  - `npm run typecheck` + `npm run build` green.
  - `scripts/verify-multi-provider.cjs`: live 15/15 checks against the real CLIs
    (winget v1.29.380, choco 2.7.3, msstore source available).
  - Chocolatey `outdated` parser hardened (header-row rejection, pinned-row exclusion,
    strict `id|version|available|pinned` shape).

### Known limitations carried forward

- Snapshot restore/apply remains winget-scoped (non-winget rows are recorded, not restored).
- Chocolatey pin/unpin has no PCC UI (pin state is respected, not managed).
- Collections UI assigns one source per collection (IPC already supports mixed-provider).
- msstore "upgrade all" bounded by winget's msstore source coverage.

## v2.2 — "Parity & ergonomics" (NEXT)

Priority order:

1. **Snapshot restore for all sources** — route restore/apply per row `source`
   (`choco install <id> -y` / `winget install --source msstore`), reusing the
   provider-routed `collection:install` pattern. Restore report gains a per-source section.
2. **Chocolatey pin management UI** — list pins (`choco pin list`), pin/unpin
   (`choco pin add/remove -n <id>`); show pinned packages as a visible "Pinned" state on
   the updates page instead of hiding them.
3. **Per-provider bulk update UX** — dedicated "Update all (Winget)" /
   "Update all (Chocolatey)" entries alongside the existing all-sources button; per-source
   progress summaries in the toast/queue.
4. **Search results → install** — search results already carry a source tag; add direct
   "Install" / "Uninstall" actions on result rows routed through the provider.
5. **Collections: mixed sources** — per-row source selector (or auto-detect) so one
   collection can mix winget + choco + store packages; group install results by source.
6. **Availability health panel** — Settings shows last-checked time and a "recheck now"
   button; startup banner when a provider is enabled but unavailable.

## v2.3 — "Broader sources" (CANDIDATES)

- **Scoop / appx / MSIX** — evaluate `IPackageProvider` fit; scoop's per-app data model
  differs (local JSON), likely needs its own adapter with the same core surface.
- **winget source management** — view/enable/disable winget's own sources (community,
  mstore, winget, …) from PCC Settings.
- **Update policies** — per-provider auto-update on app start (opt-in), per-source
  exclusion lists.
- **Telemetry-free usage analytics** — per-provider install/update counters for the
  Dashboard.

## Non-goals (explicit)

- No Microsoft Store API / account credential handling — msstore support stays on
  `winget --source msstore` by design.
- No Linux/macOS port of the provider layer (Windows-only CLIs).
- No replacement of choco/winget's own package *definition* systems; PCC is an orchestrator
  and viewer, not a repository.

## Validation gates

Every multi-provider change must pass before release:

1. `npm run typecheck` and `npm run build`.
2. `node scripts/verify-multi-provider.cjs` (live CLI checks for all enabled providers).
3. Manual pass: mixed-provider queue execution, `upgradeAll`, collection install with a
   non-winget source, snapshot create → compare with source labels.

## Related documents

- `MULTI_PROVIDER_ARCHITECTURE.md` — layering, data shapes, routing rules, constraints.
- `PROVIDER_CAPABILITY_MATRIX.md` — feature × provider support table with verified CLI
  output formats and known limitations.