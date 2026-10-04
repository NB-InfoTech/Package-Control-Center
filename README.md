<div align="center">

# Package Control Center

**A software lifecycle management platform for Windows.**

Unified package management across Winget, Chocolatey and Microsoft Store —
inventory, updates, collections, snapshots, migration and drift detection in
one local-first desktop application.

[![Release](https://img.shields.io/github/v/release/NB-InfoTech/Package-Control-Center?label=release)](https://github.com/NB-InfoTech/Package-Control-Center/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows-blue.svg)](https://learn.microsoft.com/windows)

</div>

---

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Building from Source](#building-from-source)
- [Where PCC Stores Your Data](#where-pcc-stores-your-data)
- [Providers](#providers)
- [Project Structure](#project-structure)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [Security](#security)
- [License](#license)

---

## Features

| Area | What PCC does |
|---|---|
| **Multi-provider updates** | One update queue across Winget, Chocolatey and Microsoft Store, each provider tracked separately. |
| **Software inventory** | Aggregated installed-package list, filterable and exportable to JSON/CSV. |
| **Package collections** | Curate groups of packages, export/import them, and install a whole collection in one action. |
| **System snapshots** | Capture a point-in-time inventory and compare any two snapshots. |
| **Drift detection** | Compare the current machine against a snapshot, backup or collection and see exactly what changed. |
| **Machine migration** | Restore a package set onto a new machine, with a preview before anything is installed. |
| **Backup & restore** | Inventory backups plus restore reports, written to a single well-known folder. |
| **Update queue** | Serialised updates with live progress, per-item logs, safe shutdown and manual retry. |
| **Ignore & pin rules** | Suppress noisy packages, or pin specific ones so bulk updates skip them. |
| **Application-in-use detection** | Detects blockers (`0x80070020`), terminates them and retries. |
| **Light & dark themes** | Persisted theme, applied before first paint. |

PCC is **local-first**: no account, no telemetry, no cloud service. Your data
never leaves your machine.

---

## Requirements

- **Windows 10 / 11** (PCC uses `winget`, Chocolatey and the Microsoft Store)
- At least one package provider:
  - [WinGet](https://learn.microsoft.com/windows/package-manager/winget/) — preinstalled on Windows 11
  - [Chocolatey](https://chocolatey.org/) — optional
  - Microsoft Store — via the built-in `winget` `msstore` source
- **Administrator rights** are required for Chocolatey install/upgrade/uninstall.
  PCC detects this and offers a one-click elevated relaunch.
---

## Installation

1. Go to **[Releases](https://github.com/NB-InfoTech/Package-Control-Center/releases/latest)**.
2. Download `PackageControlCenter-<version>-Setup.exe`.
3. Run the installer (NSIS). Desktop and Start Menu shortcuts are created.

Portable builds are published alongside the installer for machines where you
cannot install software.

On first launch PCC creates its data folder and, if you are upgrading from an
older release, automatically copies your previous data across. Nothing is ever
deleted without your say-so — see [Legacy data migration](#where-pcc-stores-your-data).

---

## Building from Source

### Prerequisites

- **Node.js 18+** and npm
- Windows (the provider CLIs are Windows-only)

### Steps

```bash
git clone https://github.com/NB-InfoTech/Package-Control-Center.git
cd Package-Control-Center
npm install

npm run dev          # run with hot reload
npm run typecheck    # strict TypeScript check (main + renderer)
npm run build        # compile main, preload and renderer
```

### Packaging

```powershell
.\generate-installer.ps1     # NSIS installer + portable build -> release/
```

### Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Run the app with hot reload. |
| `npm run build` | Type-check and build main, preload and renderer. |
| `npm run typecheck` | Type-check both TypeScript projects. |
| `npm run lint` | ESLint over `src`. |
| `npm run preview` | Preview the built renderer. |

---

## Where PCC Stores Your Data

Everything lives on your machine:

```
~/.package-control-center/
├── config.json                 # settings
├── ignored-packages.json       # ignore list
├── pinned-packages.json        # pin list
├── collections.json            # package collections
├── snapshots.json              # system snapshots
├── queue-state.json            # update queue (safe-shutdown restore)
├── logs/                       # application + startup logs
└── migration-complete.flag     # written after the one-time data migration

~/Documents/Package Control Center Backups/   # inventory backups
~/Documents/Package Control Center Reports/   # restore reports
```

### Legacy data migration

PCC was originally released as **Winget Control Center**. If you are upgrading
from that era, your data is migrated automatically and exactly once:

- Settings, collections, snapshots, backups, logs and queue state are **copied**
  into the new locations.
- A `migration-complete.flag` marker records that this happened.
- **Nothing is deleted.** The old folders stay on disk so you can inspect them
  and remove them yourself whenever you are satisfied.

Backup and report folders follow the same rule.

---

## Providers

PCC treats each package manager as a first-class **provider** and routes every
operation to the right one:

| Provider | Source | Elevation |
|---|---|---|
| Winget | Community repository | No (self-elevates via the Windows consent prompt) |
| Chocolatey | `choco` CLI | **Yes** — PCC must run as Administrator |
| Microsoft Store | `winget --source msstore` | No |

Providers can be enabled or disabled independently in Settings. The About page
shows each provider's **health** (`Ready` / `Unavailable` / `Disabled` /
`Error`) and its **installed version**, detected live.

---

## Project Structure

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # App lifecycle, window, safe shutdown
│   ├── ipc/               # IPC handlers (the only renderer-facing surface)
│   ├── services/
│   │   ├── paths/         # DataPathService / BackupPathService / ReportPathService
│   │   ├── providers/     # Winget, Chocolatey, Microsoft Store + registry
│   │   ├── config/        # ConfigService
│   │   ├── migration/     # Legacy folder migration
│   │   └── logging/       # Logger
│   └── utils/
├── preload/               # contextBridge API (contextIsolation + sandbox)
└── renderer/              # React UI (Tailwind + shadcn-style components)
```

**Architecture notes**

- `contextIsolation` and `sandbox` are both enabled; the renderer has no direct
  Node access and reaches the main process only through the preload bridge.
- Every persisted path resolves through a path service, so there is exactly one
  definition of where data lives.
- Provider-specific CLI parsing stays inside each provider implementation; the
  UI and queue engine depend only on the shared provider interface.

---

## Documentation

| Document | Contents |
|---|---|
| [CHANGELOG.md](CHANGELOG.md) | Release history. |
| [MULTI_PROVIDER_ARCHITECTURE.md](MULTI_PROVIDER_ARCHITECTURE.md) | How the provider layer is designed. |
| [PROVIDER_CAPABILITY_MATRIX.md](PROVIDER_CAPABILITY_MATRIX.md) | Per-provider feature support. |
| [V2_2_ROADMAP.md](V2_2_ROADMAP.md) | Planned work. |
| [LEGACY_REFERENCE_AUDIT.md](LEGACY_REFERENCE_AUDIT.md) | Legacy naming audit. |

---

## Contributing

Bug reports and pull requests are welcome. Please read
**[CONTRIBUTING.md](CONTRIBUTING.md)** first — it covers the dev workflow,
coding standards and what makes a good bug report.

---

## Security

Please do not open a public issue for security problems. Follow the process in
**[SECURITY.md](SECURITY.md)**.

---

## License

Released under the [MIT License](LICENSE).

<div align="center">

Copyright © 2024-2026 Package Control Center

</div>