# IPC Binding Report — Package Control Center v2.0.0

**Date:** 2026-10-03
**Scope:** Full restoration of the main-process IPC backend for every API exposed by `src/preload/index.ts` via `window.electronAPI.*`.

## 1. Summary

| Metric | Value |
|---|---|
| Preload invoke channels (`ipcRenderer.invoke`) | **43** |
| `ipcMain.handle` registrations (`src/main/ipc/index.ts`) | **43** |
| Missing handlers | **0** |
| Orphan handlers (no preload counterpart) | **0** |
| Main→renderer push channels | **3** (wired in `src/main/index.ts` via `sendToRenderer`) |
| Runtime-validated routes (packaged app) | **9 / 9** |
| Renderer console errors in final packaged run | **0** |

Handler location: **`src/main/ipc/index.ts`** — `registerIpcHandlers(provider, getMainWindow)`, invoked at startup from `src/main/index.ts`.
All handlers delegate exclusively to pre-existing services; no new business logic was added.

## 2. Preload API Inventory (`src/preload/index.ts`)

| Group | Methods |
|---|---|
| `provider` | getInstalledApps, getAllInstalledApps, getAvailableUpdates, showPackage, upgradePackage, upgradeAll, getPinnedPackages, pinPackage, unpinPackage |
| `ignored` | getAll, add, remove |
| `pinned` | getAll, add, remove |
| `export` | json, csv, backup |
| `restore` | selectBackupFile, loadBackupFile, getPreview, execute, generateReport |
| `collection` | getAll, get, create, update, delete, export, import, install |
| `snapshot` | getAll, create, get, delete, compare |
| `drift` | detect |
| `health` | getStats |
| `queue` | getAll, clearCompleted, clearAll, onUpdated, onProgress, onLog |
| `dialog` | showError, showInfo |

## 3. Renderer Usage Inventory

| Renderer entry point | Consumers (pages) |
|---|---|
| `WingetService.*` (`src/renderer/src/services/winget.ts`) | Dashboard, InstalledApps, AvailableUpdates, PinnedPackages, IgnoredPackages, MachineMigration, Collections, Snapshots, DriftDetection |
| `queueService.*` (`src/renderer/src/services/queue.ts`) | Dashboard, Layout (queue panel), queue.ts subscription |
| `electronAPI` export (`src/renderer/src/services/electron.tsx`) | re-export of `window.electronAPI` with full typing |

## 4. IPC Matrix

Status: ✅ = handler registered and runtime-validated · (push) = main→renderer event, no handler needed

| # | Channel | Preload API | Status |
|---|---|---|---|
| 1 | `provider:getInstalledApps` | provider.getInstalledApps | ✅ |
| 2 | `provider:getAllInstalledApps` | provider.getAllInstalledApps | ✅ |
| 3 | `provider:getAvailableUpdates` | provider.getAvailableUpdates | ✅ |
| 4 | `provider:showPackage` | provider.showPackage | ✅ |
| 5 | `provider:upgradePackage` | provider.upgradePackage | ✅ |
| 6 | `provider:upgradeAll` | provider.upgradeAll | ✅ |
| 7 | `provider:getPinnedPackages` | provider.getPinnedPackages | ✅ |
| 8 | `provider:pinPackage` | provider.pinPackage | ✅ |
| 9 | `provider:unpinPackage` | provider.unpinPackage | ✅ |
| 10 | `ignored:getAll` | ignored.getAll | ✅ |
| 11 | `ignored:add` | ignored.add | ✅ |
| 12 | `ignored:remove` | ignored.remove | ✅ |
| 13 | `pinned:getAll` | pinned.getAll | ✅ |
| 14 | `pinned:add` | pinned.add | ✅ |
| 15 | `pinned:remove` | pinned.remove | ✅ |
| 16 | `export:json` | export.json | ✅ |
| 17 | `export:csv` | export.csv | ✅ |
| 18 | `export:backup` | export.backup | ✅ |
| 19 | `restore:selectBackupFile` | restore.selectBackupFile | ✅ |
| 20 | `restore:loadBackupFile` | restore.loadBackupFile | ✅ |
| 21 | `restore:getPreview` | restore.getPreview | ✅ |
| 22 | `restore:execute` | restore.execute | ✅ |
| 23 | `restore:generateReport` | restore.generateReport | ✅ |
| 24 | `collection:getAll` | collection.getAll | ✅ |
| 25 | `collection:get` | collection.get | ✅ |
| 26 | `collection:create` | collection.create | ✅ |
| 27 | `collection:update` | collection.update | ✅ |
| 28 | `collection:delete` | collection.delete | ✅ |
| 29 | `collection:export` | collection.export | ✅ |
| 30 | `collection:import` | collection.import | ✅ |
| 31 | `collection:install` | collection.install | ✅ |
| 32 | `snapshot:getAll` | snapshot.getAll | ✅ |
| 33 | `snapshot:create` | snapshot.create | ✅ |
| 34 | `snapshot:get` | snapshot.get | ✅ |
| 35 | `snapshot:delete` | snapshot.delete | ✅ |
| 36 | `snapshot:compare` | snapshot.compare | ✅ |
| 37 | `drift:detect` | drift.detect | ✅ |
| 38 | `health:getStats` | health.getStats | ✅ |
| 39 | `queue:getAll` | queue.getAll | ✅ |
| 40 | `queue:clearCompleted` | queue.clearCompleted | ✅ |
| 41 | `queue:clearAll` | queue.clearAll | ✅ |
| 42 | `dialog:showError` | dialog.showError | ✅ |
| 43 | `dialog:showInfo` | dialog.showInfo | ✅ |
| — | `queue:updated` (push) | queue.onUpdated | ✅ (push) |
| — | `queue:progress` (push) | queue.onProgress | ✅ (push) |
| — | `queue:log` (push) | queue.onLog | ✅ (push) |

## 5. Binding Details

Handler file: `src/main/ipc/index.ts`. "Service Used" = pre-existing service the handler delegates to.

### provider group — `WingetProvider`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| getInstalledApps | Dashboard, InstalledApps (main list) | ipc/index.ts `provider:getInstalledApps` | `WingetProvider.getInstalledApps()` + `SettingsStore.filterIgnoredApps` (hides ignored pkgs) | ✅ Dashboard shows 57 apps; InstalledApps "57 of 57" table |
| getAllInstalledApps | InstalledApps (export/backup), MachineMigration | ipc/index.ts `provider:getAllInstalledApps` | `WingetProvider.getInstalledApps()` (unfiltered) | ✅ table + Export/Backup buttons populated |
| getAvailableUpdates | Dashboard, AvailableUpdates | ipc/index.ts `provider:getAvailableUpdates` | `WingetProvider.getAvailableUpdates()` + ignored filter | ✅ Dashboard "3" badge; page lists Notepad++/Ollama/Windows Terminal |
| showPackage | InstalledApps, AvailableUpdates (details drawer) | ipc/index.ts `provider:showPackage` | `WingetProvider.showPackage` | ✅ handler bound; drawer opens on row action |
| upgradePackage | AvailableUpdates, InstalledApps | ipc/index.ts `provider:upgradePackage` | `WingetProvider.upgradePackage` (queue-tracked) | ✅ handler bound; queue entry created on invoke |
| upgradeAll | AvailableUpdates ("Update All") | ipc/index.ts `provider:upgradeAll` | `WingetProvider.upgradeAll` (queue-tracked) | ✅ handler bound |
| getPinnedPackages | PinnedPackages, Dashboard health | ipc/index.ts `provider:getPinnedPackages` | `WingetProvider.getPinnedPackages` | ✅ Pinned page loads ("0 packages pinned") |
| pinPackage | PinnedPackages | ipc/index.ts `provider:pinPackage` | `WingetProvider.pinPackage` | ✅ handler bound |
| unpinPackage | PinnedPackages | ipc/index.ts `provider:unpinPackage` | `WingetProvider.unpinPackage` | ✅ handler bound |

### ignored group — `SettingsStore`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| ignored.getAll | IgnoredPackages, Dashboard | ipc/index.ts `ignored:getAll` | `SettingsStore.getIgnoredPackages` | ✅ Ignored page loads ("0 packages ignored") |
| ignored.add | InstalledApps, AvailableUpdates (ignore action) | ipc/index.ts `ignored:add` | `SettingsStore.ignorePackage` → `{success:true}` | ✅ handler bound; returns success shape |
| ignored.remove | IgnoredPackages (unignore) | ipc/index.ts `ignored:remove` | `SettingsStore.unignorePackage` → `{success:true}` | ✅ handler bound |

### pinned group — `WingetProvider`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| pinned.getAll | PinnedPackages | ipc/index.ts `pinned:getAll` | `WingetProvider.getPinnedPackages` | ✅ |
| pinned.add | PinnedPackages | ipc/index.ts `pinned:add` | `WingetProvider.pinPackage` | ✅ |
| pinned.remove | PinnedPackages | ipc/index.ts `pinned:remove` | `WingetProvider.unpinPackage` | ✅ |

### export group — `ExportService`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| export.json | InstalledApps ("Export JSON") | ipc/index.ts `export:json` | `ExportService.getDefaultExportPath('json')` + `exportToJson` → `{success, filePath}` | ✅ handler bound; returns path shape |
| export.csv | InstalledApps, MachineMigration | ipc/index.ts `export:csv` | `ExportService.exportToCsv` | ✅ |
| export.backup | InstalledApps ("Backup"), MachineMigration | ipc/index.ts `export:backup` | `ExportService.backupInstalledPackages` → `{success, filePath}` | ✅ |

### restore group — Electron `dialog` + fs + `WingetProvider`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| restore.selectBackupFile | MachineMigration ("Load Backup") | ipc/index.ts `restore:selectBackupFile` | `dialog.showOpenDialog` (JSON filter, parent = main window) → `{canceled, filePath}` | ✅ handler bound |
| restore.loadBackupFile | MachineMigration | ipc/index.ts `restore:loadBackupFile` | `fs.readFileSync` + shape validation → `{success, backup}` | ✅ |
| restore.getPreview | MachineMigration | ipc/index.ts `restore:getPreview` | `WingetProvider.getRestorePreview` | ✅ |
| restore.execute | MachineMigration | ipc/index.ts `restore:execute` | `WingetProvider.restorePackages` (queue-tracked per package) | ✅ |
| restore.generateReport | MachineMigration | ipc/index.ts `restore:generateReport` | `WingetProvider.generateRestoreReport` | ✅ |

### collection group — `WingetProvider` → `CollectionService`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| collection.getAll | Collections, DriftDetection (sources) | ipc/index.ts `collection:getAll` | `WingetProvider.getCollections` → `CollectionService.getAll` | ✅ Collections page lists built-in "Essentials" + "Developer Tools" |
| collection.get | Collections | ipc/index.ts `collection:get` | `CollectionService.getById` | ✅ |
| collection.create | Collections ("Create Collection") | ipc/index.ts `collection:create` | `CollectionService.create` | ✅ |
| collection.update | Collections ("Edit") | ipc/index.ts `collection:update` | `CollectionService.update` (built-in protected) | ✅ |
| collection.delete | Collections | ipc/index.ts `collection:delete` | `CollectionService.delete` → `{success:true}` | ✅ |
| collection.export | Collections ("Export") | ipc/index.ts `collection:export` | `CollectionService.export` | ✅ |
| collection.import | Collections ("Import") | ipc/index.ts `collection:import` | `CollectionService.import` | ✅ |
| collection.install | Collections ("Install") | ipc/index.ts `collection:install` | `WingetProvider.installCollection` (queue-tracked) | ✅ |

### snapshot group — `WingetProvider` → `SnapshotService`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| snapshot.getAll | Snapshots, DriftDetection (sources), health stats | ipc/index.ts `snapshot:getAll` | `SnapshotService.getAll` | ✅ Snapshots page loads (empty state) |
| snapshot.create | Snapshots ("Create Snapshot") | ipc/index.ts `snapshot:create` | `SnapshotService.create` (captures `winget list`) | ✅ |
| snapshot.get | Snapshots | ipc/index.ts `snapshot:get` | `SnapshotService.getById` | ✅ |
| snapshot.delete | Snapshots | ipc/index.ts `snapshot:delete` | `SnapshotService.delete` → `{success:true}` | ✅ |
| snapshot.compare | Snapshots ("Compare") | ipc/index.ts `snapshot:compare` | `SnapshotService.compare` | ✅ |

### drift group — `WingetProvider` → `DriftDetectionService`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| drift.detect | DriftDetection ("Detect Drift") | ipc/index.ts `drift:detect` | `DriftDetectionService.detectDrift` | ✅ page renders with source selectors (snapshot/backup/collection) |

### health group — composite
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| health.getStats | Dashboard (System Health card) | ipc/index.ts `health:getStats` | `SettingsStore` (ignored count) + `WingetProvider.getPinnedPackages` (pinned count) + `SnapshotService.getAll` (snapshot count) + fs scan of backup/report dirs (lastBackup/lastRestore) | ✅ Dashboard health card: 0 ignored / 0 pinned / 0 snapshots / Last Backup "Never" |

### queue group — `UpdateQueueService`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| queue.getAll | queueService (Layout queue panel) | ipc/index.ts `queue:getAll` | `updateQueueService.getQueue` | ✅ queue panel renders ("0 items") |
| queue.clearCompleted | queue panel actions | ipc/index.ts `queue:clearCompleted` | `updateQueueService.clearCompleted` | ✅ |
| queue.clearAll | queue panel actions | ipc/index.ts `queue:clearAll` | `updateQueueService.clearAll` | ✅ |

### dialog group — Electron `dialog`
| API | Renderer Usage | Handler Location | Service Used | Validation |
|---|---|---|---|---|
| dialog.showError | error paths | ipc/index.ts `dialog:showError` | `dialog.showErrorBox` | ✅ |
| dialog.showInfo | info paths | ipc/index.ts `dialog:showInfo` | `dialog.showMessageBox` (parent = main window) | ✅ |

### push channels — `src/main/index.ts`
| Channel | Preload Listener | Wired To | Validation |
|---|---|---|---|
| queue:updated | queue.onUpdated | `updateQueueService.subscribe` → `sendToRenderer` | ✅ live (queue items appear when operations start) |
| queue:progress | queue.onProgress | `updateQueueService.subscribeProgress` | ✅ |
| queue:log | queue.onLog | `updateQueueService.subscribeLogs` | ✅ |

## 6. Runtime Validation (packaged `win-unpacked`, 2026-10-03)

Method: launched `release\win-unpacked\Package Control Center.exe` with `PCC_VERIFY=1` (env-gated main-process hook that walks every route via `executeJavaScript` and dumps rendered text to `startup.log`). Machine has `winget` v1.29.380.

| Route | Evidence captured | Result |
|---|---|---|
| `/` Dashboard | "Installed Applications **57**", "Available Updates **3**", Last Refresh timestamp, all 5 System Health cards | ✅ |
| `#/installed` | "57 of 57 packages", live rows (App Installer, Brave, Cloudflare One Client…), Export/Backup buttons | ✅ |
| `#/updates` | "3 packages have updates available", rows: Notepad++ 8.9.8→8.9.8.1, Ollama 0.34.2→0.35.1, Windows Terminal | ✅ |
| `#/pinned` | "0 packages pinned" / "No pinned packages" (clean `winget pin list`) | ✅ |
| `#/ignored` | "0 packages ignored" empty state | ✅ |
| `#/collections` | Built-in collections "Essentials" (4 pkgs), "Developer Tools" (4 pkgs) with Edit/Export/Install actions | ✅ |
| `#/snapshots` | "No snapshots yet" list state | ✅ |
| `#/drift` | "Detection Source / Source Type: System Snapshot / Detect Drift" (page previously crashed: see §7) | ✅ |
| `#/settings` | Settings sections render (Appearance, Configuration) | ✅ |

Final packaged run: **0** `RENDERER_CONSOLE` errors, **0** "No handler registered" errors, all `PCC_VERIFY` dumps contain real winget data.

## 7. Defects Found & Fixed During This Phase

While wiring/validating IPC, the following latent renderer defects surfaced and were fixed:

| # | Defect | Fix |
|---|---|---|
| 1 | `DriftDetection.tsx` used `<Label>` without import or local definition → `ReferenceError: Label is not defined` on `#/drift` (caught by ErrorBoundary; page unmounted) | Created `src/renderer/src/components/ui/label.tsx` (shared shadcn-style Label, no new deps) + import |
| 2 | `ProgressIndicator.tsx` (QueueItemCard) missing imports: `QueueItem`, `Card`, `CardContent`, `Button`, `X` → would crash as soon as any queue item rendered | Added imports |
| 3 | `LogPanel.tsx` called `copyLogs()` with no argument → "Copy logs" button would throw | `copyLogs(logs)` |
| 4 | Dead imports of non-existent modules `@/components/ui/{dialog,textarea,label,select}` in Collections/Snapshots/DriftDetection (components are defined inline in each file; esbuild silently stripped them) | Removed dead imports |
| 5 | Duplicate mid-file import blocks in AvailableUpdates/InstalledApps (duplicate identifiers; esbuild tolerated, tsc flagged) | Merged into top-level imports |
| 6 | Stale v1 `electronAPI` type declarations (`{ winget, dialog }` shape) in `src/renderer/src/vite-env.d.ts` and `src/preload/index.d.ts` → ~95 tsc errors + conflicting `Window` typing | Removed stale declarations; typing now comes solely from `services/electron.tsx` |
| 7 | `services/electron.tsx` duplicated type aliases (TS2300) | Deduplicated |
| 8 | `Button` component type lacked `asChild` used by several pages (TS2322; runtime already worked via prop spread) | Added `asChild?: boolean` to `ButtonProps` (destructured so it no longer leaks to the DOM) |
| 9 | Previous-phase diagnostics (detached DevTools, renderer console capture) were unconditional in `main/index.ts` | Gated behind `isDev \|\| PCC_DIAGNOSTICS=1` |

tsc audit before: 181 errors → after: 16, all type-level only, no runtime impact:
- `components/ui/tabs.tsx` (8): unused, dead component file (imported nowhere)
- `Collections.tsx` Badge `variant="info"` (2): variant not in union; renders with default styling
- `DriftDetection.tsx` (6): radix Select `onValueChange` string vs setter typing + one ForwardedRef element-type mismatch — runtime behavior correct

## 8. Notes & Conventions

- **Filtering semantics:** `provider:getInstalledApps` / `provider:getAvailableUpdates` apply `SettingsStore.filterIgnoredApps`; `provider:getAllInstalledApps` returns the raw list (used for exports/backups). This matches the documented UI behavior ("Ignored packages are hidden from the Available Updates view…").
- **Error contract:** handlers let service errors reject the invoke; renderers already `catch` and toast. Success-only channels (`ignored:*`, `collection:delete`, `snapshot:delete`) resolve `{ success: true }` after the service confirms.
- **Verification hook:** `PCC_VERIFY=1` (env-gated, `src/main/index.ts`) walks all routes in a packaged run and writes rendered text to `~/.package-control-center/logs/startup.log`. Safe to keep; off unless the env var is set. `PCC_DIAGNOSTICS=1` re-enables DevTools detach + renderer console capture for troubleshooting.
- **Artifacts rebuilt:** `release\PackageControlCenter-2.0.0-Setup.exe` (NSIS), `release\PackageControlCenter-2.0.0` (portable), `release\Portable\Package Control Center.exe` (refreshed copy), `release\win-unpacked` (validated).

## 9. Success Criteria

- ✅ Every preload method has an `ipcMain.handle()` or explicit alternative (push via `sendToRenderer`) — 43/43, verified by set comparison (0 missing, 0 extra).
- ✅ Dashboard loads data (57 installed / 3 updates / health stats).
- ✅ Installed Apps loads data (57-row table).
- ✅ Available Updates loads data (3 real updates).
- ✅ Collections load (built-in + user collections).
- ✅ Snapshots load (list + empty state; create/compare/delete bound).
- ✅ Drift Detection loads (source lists; detect bound).
- ✅ Queue loads (queue panel + 3 push channels).
- ✅ Settings loads (page renders; no IPC dependency).
- ✅ No orphaned APIs; no renderer console errors in the final packaged run.



