# Changelog

All notable changes to Package Control Center (PCC) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.1.0] - 2026-10-04

### 🧭 Storage Path Unification

Every on-disk location is now resolved through a dedicated path service instead
of being declared independently in each module. This removes the split-brain
behaviour that previously meant backups written by PCC could not be read back.

- **DataPathService** — single source of truth for the application data root
  (`~/.package-control-center`). Path getters are lazy, so the one-time
  migration always completes before any store touches disk.
- **BackupPathService** — single source of truth for
  `~/Documents/Package Control Center Backups`.
  - *Fixed*: `ExportService` wrote backups to one folder while
    `DriftDetectionService` read from a differently-named one, so
    backup-based drift detection could never find a backup PCC had just
    written.
- **ReportPathService** — single source of truth for
  `~/Documents/Package Control Center Reports`.
- All three migrate any pre-rebrand folder automatically and exactly once:
  contents are **copied**, existing files are **never overwritten**, a
  `migration-complete.flag` marker is written, and the **old folders are never
  deleted**.
- `ConfigService` defaults, the About page, and the Machine Migration page now
  point at the canonical locations.

### 🎨 About Page Modernization

The About section (Settings page) now reflects PCC's real capabilities instead of
legacy values.

- **Application Information**: application name, version, build date, architecture
  and platform — all resolved live in the main process via `app:getInfo`.
- **Package Statistics**: installed packages, updates available and a per-provider
  breakdown with a total, refreshed on demand.
- **Features**: capability chips (multi-provider updates, collections, snapshots,
  drift detection, migration, backup/restore, update queue, ignore/pin rules, themes).
- **Description**: updated to describe PCC as a multi-provider software lifecycle
  management platform.
- **System Information**: Electron / Node / Chrome versions, PCC data directory
  (copyable) and current theme.
- **Links**: GitHub repository, source code, documentation, release notes and
  provider documentation.
- Replaced every hardcoded value on the page; UI is card/tile/chip based and
  theme aware.

### 🩺 Provider Health & Versions

The About page previously showed only a provider *count*. It now reports the
health of each provider.

- **New**: `ProviderHealthService.getProviderHealth()` returns
  `{ id, name, status, version }` per provider.
- **New**: health states `Ready` / `Unavailable` / `Disabled` / `Error`, each
  with distinct styling on the About page.
- **New**: live version detection — `winget --version`, `choco --version`; the
  Microsoft Store reports "Provider Available" (it has no standalone CLI).
- Probes are isolated: one provider failing never breaks the report for others.
- Added a "N ready" summary badge alongside the provider cards.

### 📚 v2.2 Roadmap

Added `V2_2_ROADMAP.md` covering update history, update analytics, package age,
a system health score, a provider health dashboard, failed-update investigation
and a software timeline — with cloud sync, telemetry, accounts and internet
services explicitly out of scope.

### 🔍 Legacy naming cleanup

- Retired product naming removed from all operational code. The only remaining
  occurrences are the three `LEGACY_*` constants required for migration.
- `resources/license.txt` copyright updated to Package Control Center.
- `LEGACY_REFERENCE_AUDIT.md` documents the audit and every retained reference.
- Fixed a stale hardcoded application version in export/backup metadata; the
  version is now read from `package.json` at runtime.

### 🐛 Fixes

- Export and backup metadata no longer reports a stale PCC version.
- `health:getStats` "Last Backup" now reads the canonical backup folder.

---

## [2.0.0] - 2024-09-30

### 🎉 Major Release - Platform Rebrand & Architecture Evolution

This release marks the evolution from "Winget Control Center" to **Package Control Center (PCC)** - a comprehensive software lifecycle management platform for Windows.

### 🔄 Branding & Identity
- **Application renamed** from "Winget Control Center" to "Package Control Center (PCC)"
- **Short name**: PCC
- **New application icons**: Modern package box + control dashboard design (SVG, ICO, PNG)
- **Updated installer**: NSIS installer with new branding
- **Window title & document title**: "Package Control Center"
- **About page**: Complete redesign with version, build date, provider count, installed providers
- **Copyright**: Updated to "Copyright © 2024 Package Control Center"

### 📁 Configuration Migration
- **Automatic migration** from `~/.winget-control-center` to `~/.package-control-center`
- **Migrates**: config.json, ignored-packages.json, pinned-packages.json, collections.json, snapshots.json
- **Migrates**: logs directory, backups directory
- **Path updates**: Automatically updates config.json paths to new directory
- **Non-destructive**: Original data never deleted automatically
- **Run once**: Migration executes on first launch after upgrade

### 📦 Package Collections (New Feature)
- **Built-in collections**: Essentials, Developer Tools, Media & Entertainment
- **User collections**: Full CRUD (Create, Read, Update, Delete)
- **Import/Export**: JSON format with version metadata
- **Install through queue**: Each package becomes queue item with progress tracking
- **Collections page**: Grid layout with create/edit/delete/export/import/install actions

### 📸 System Snapshots (New Feature)
- **Capture**: Installed packages, versions, sources, timestamp
- **Storage**: Local JSON at `~/.package-control-center/snapshots.json`
- **Snapshot page**: Create, delete, export, compare snapshots
- **Comparison view**: Added, removed, version-changed, unchanged packages
- **Color-coded badges**: Green=added, Red=removed, Yellow=version changed

### 🔍 Drift Detection (New Feature)
- **Compare against**: Snapshot, Backup, or Package Collection
- **Detects**: Added packages, removed packages, version changes, source changes
- **Filterable results** with summary cards
- **Drift page**: Source selector with real-time detection

### 🏥 Health Dashboard (Enhanced)
- **New health cards**:
  - Ignored Packages count → links to `/ignored`
  - Pinned Packages count → links to `/pinned`
  - Last Backup timestamp → links to `/migration`
  - Last Restore timestamp → links to `/migration`
  - Snapshot Count → links to `/snapshots`
- **Quick Actions**: Direct navigation to all major features

### 🛡️ Production Hardening
- **Central Error Framework**: AppError class with 32 error codes (WINGET_NOT_FOUND, INSTALL_FAILED, ACCESS_DENIED, NETWORK_UNAVAILABLE, INVALID_BACKUP_FILE, etc.)
- **Error Categories**: SYSTEM, WINGET, FILE_SYSTEM, NETWORK, VALIDATION, PERMISSION, UNKNOWN
- **Structured Logging**: Logger singleton with rotation (10MB max, 5 files), DEBUG/INFO/WARN/ERROR levels
- **Configuration Service**: Single source of truth for backup location, report location, theme, log level, winget options
- **Validation Layer**: Schema validation for collections, snapshots, backups, restore options
- **Performance Fixes**: Debounced refresh, mounted ref guards, log capping (500 entries), queue limits (100 items, 200 logs/item)

### 📤 Export & Backup Metadata
- **All exports** now include: `{"application": "Package Control Center", "version": "2.0.0"}`
- **Backup location**: `~/Documents/Package Control Center Backups/`
- **Export filenames**: `package-control-center-inventory-{date}.json/csv`

### 🔧 Internal Architecture (Preserved)
- **Provider abstraction**: `IUpdateProvider` + `WingetProvider` unchanged
- **Queue processing** with progress tracking
- **Logging system** with real-time streaming
- **Migration workflows** with queue integration
- **No breaking changes** to internal architecture

### 🔒 Security & Privacy
- No cloud sync
- No user accounts
- No telemetry
- No background services
- No database (SQLite) - all local JSON

---

## [1.0.0] - 2024-09-30

### Initial Release - Winget Control Center
- Modern Windows desktop GUI for Winget package management
- Electron + React + TypeScript + Vite + Tailwind CSS + shadcn/ui
- Dark mode by default
- Package management: Installed apps, available updates, update workflows
- Real-time logging with collapsible log panel
- Update queue with progress tracking (Preparing → Downloading → Installing → Verifying → Completed)
- Package details drawer with slide-out animation
- Package pinning (winget pin add/remove/list)
- Package ignoring (hide from updates)
- Export inventory (JSON/CSV)
- Backup installed packages
- Restore from backup with preview
- Machine migration workflow
- Drift detection
- System snapshots with comparison
- Package collections (built-in + user)
- Health dashboard
- Settings page with appearance, winget config, about

---

**Full Changelog**: https://github.com/package-control-center/package-control-center/commits/main