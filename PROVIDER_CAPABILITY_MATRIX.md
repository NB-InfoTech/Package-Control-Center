# PROVIDER CAPABILITY MATRIX (PCC v2.1)

Verified live on this machine on **2026-10-03** against: winget v1.29.380, Chocolatey 2.7.3,
Microsoft Store source available via `winget --source msstore`.

Legend: ✅ supported & live-verified · ◑ supported with caveats · ➖ not available · 🧭 routed elsewhere

## 1. Core capabilities (implemented by all three providers)

| Capability | Winget | Chocolatey | Microsoft Store | Notes |
|---|---|---|---|---|
| Availability detection | ✅ `winget --version` | ✅ `choco --version` | ✅ `winget source list` (msstore present) | 60 s cache; fail-fast `ensureAvailable()` guard on every operation. |
| Installed apps | ✅ `winget list` | ✅ `choco list` (19 pkgs verified) | ✅ `winget list --source msstore` (3 apps verified) | All rows tagged with `source`. |
| Available updates | ✅ `winget upgrade` | ✅ `choco outdated --local-only` (4 pkgs verified) | ✅ `winget upgrade --source msstore` | choco parser rejects its header row and excludes pinned rows. |
| Package details | ✅ `winget show` | ✅ `choco info` (Title/Summary/Software Site) | ✅ `winget show --source msstore` | |
| Search | ✅ `winget search` | ✅ `choco search` (316 results for "git" verified) | ✅ `winget search --source msstore` | Results reused by the shared search UI, source-tagged. |
| Upgrade one | ✅ `winget upgrade -h` | ✅ `choco upgrade <id> -y` | ✅ `winget upgrade --source msstore` | Queue-scoped per provider; duplicate requests deduped. |
| Upgrade all | ✅ `winget upgrade --all` | ✅ `choco upgrade all -y` | ✅ `winget upgrade --source msstore --all` | `provider:upgradeAll` returns one `UpgradeResult` per active provider. |
| Install | ✅ `winget install -h` | ✅ `choco install <id> -y` | ✅ `winget install --source msstore` | New `install` queue operation (v2.1). |
| Uninstall | ✅ `winget uninstall -h` | ✅ `choco uninstall <id> -y` | ✅ `winget uninstall --source msstore` | New `uninstall` queue operation (v2.1). |
| Queue operations | ✅ provider-scoped | ✅ provider-scoped | ✅ provider-scoped | `QueueItem.provider` drives dedup + `queue:retry` routing; provider chip in QueuePanel. |
| Enable/disable in UI | ✅ Settings → Package Sources | ✅ | ✅ | Persisted via `ConfigService.providers.enabled`. |

## 2. Extended / legacy capabilities (winget-centric)

| Capability | Winget | Chocolatey | Microsoft Store | Notes |
|---|---|---|---|---|
| Detailed updates (parse audit, process targets) | ✅ | ➖ | ➖ | `getAvailableUpdatesDetailed()` is winget-only. |
| Pin / unpin packages | ✅ `winget pin` / `unpin` | ◑ read-only: choco's pin state is surfaced via the `Pinned` column of `choco outdated` (pinned pkgs are excluded from updates; `choco upgrade all` skips them natively). UI pin actions are not wired for choco in v2.1. | ➖ | Pin management UI remains winget-scoped. |
| Ignore packages | ✅ | ➖ | ➖ | Winget-only. |
| Restore preview / apply / report | ✅ | ➖ (rows install via `installPackage`) | ➖ (rows install via `installPackage`) | Restore pipeline targets winget; non-winget snapshot rows are recorded but not restored in v2.1. |
| Collections CRUD / export / import | ✅ | ◑ collections can *reference* choco packages (`CollectionPackage.provider`) and are installed through `choco install` by the provider-routed `collection:install` handler | ◑ same, via `winget install --source msstore` | The Collections UI currently assigns one source per collection; mixed-provider collections are supported at the IPC level. |
| Snapshots (create) | ✅ multi-source capture since v2.1 | ◑ included in snapshot | ◑ included in snapshot | `snapshot:create` aggregates all active providers and preserves `source`. |
| Snapshots (compare) | ✅ | ◑ compared against aggregated state; tables show source labels | ◑ same | |
| Drift detection | ✅ | ◑ compares against aggregated installed apps | ◑ same | |
| Health stats | ✅ | ➖ | ➖ | Winget-only legacy feature. |

## 3. CLI output formats (verified)

| Provider | Command | Output shape | Parser notes |
|---|---|---|---|
| winget | `winget list` / `winget upgrade` | 5 columns: Name, Id, Version, Publisher, Source | Standard table split. |
| winget | `winget list/upgrade --source msstore` | 3–4 columns, **no Source column** | `WingetParser.parseListNoSource/parseUpgradeNoSource`; source stamped by the caller. |
| chocolatey | `choco list` | `name version` lines + `N Packages.` footer | `-localonly` removed in 2.x; plain `list` = installed. Header/footer lines filtered. |
| chocolatey | `choco outdated --local-only` | `id\|version\|available\|pinned` rows + header `Output is Id \| Version \| Available Version \| Pinned` | Strict 4-field, version-shaped match rejects the header; `pinned=true` rows excluded. |
| chocolatey | `choco info <id>` | key/value block: `Title:`, `Summary:`, `Software Site:` | |
| chocolatey | `choco search <q>` | `id version [Approved]` lines | |
| msstore | `winget source list` | table containing the `msstore` source row | Used for availability. |

## 4. Known limitations & risks

- **Chocolatey pinned packages**: excluded from update lists; if a user manually pins a
  package, it silently disappears from the Updates page until unpinned. (Documented choco 2.x
  behavior: `choco pin add/remove -n <id>`; no PCC UI for it yet.)
- **Chocolatey requires PATH access to `choco`** (system or per-user install). Missing choco
  → provider reported unavailable; all other providers unaffected.
- **Microsoft Store updates**: winget's `msstore` source coverage is limited to Store apps
  the user's account can see; "upgrade all" for msstore is bounded by that same coverage.
- **Store package IDs** (`9NBLG…`) are not human-readable; PCC shows them verbatim.
- **Bulk update UX**: `upgradeAll` now returns per-provider results; a failure in one source
  does not stop the others (each provider runs independently).
- **Snapshot restore** of choco/msstore rows is a roadmap item, not a v2.1 feature.