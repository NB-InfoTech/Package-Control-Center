import { ipcMain, dialog, BrowserWindow, app } from 'electron';
import { spawn } from 'child_process';
import { readFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join } from 'path';
import { isAdministrator } from '../services/admin.js';
import { ExportService } from '../services/ExportService.js';
import { SettingsStore } from '../services/SettingsStore.js';
import { SnapshotService } from '../services/SnapshotService.js';
import { configService } from '../services/config/index.js';
import { getAppInfo } from '../services/AppInfoService.js';
import { ProviderHealthService } from '../services/ProviderHealthService.js';
import { backupPathService, reportPathService } from '../services/paths/index.js';
import { CollectionService } from '../services/CollectionService.js';
import { ProcessGuard } from '../services/ProcessGuard.js';
import { updateQueueService } from '../services/UpdateQueueService.js';
import type { WingetProvider } from '../services/providers/WingetProvider.js';
import {
  collectInstalledApps,
  collectAvailableUpdates,
  getProvider,
  getActiveProviders,
  resolveProviderForPackage,
  getProviderInfos,
  installProviderIfUnavailable,
  PROVIDER_NAMES,
} from '../services/providers/index.js';
import type {
  InstalledApp,
  PackageDetails,
  UpgradeResult,
  ProviderInfo,
  ProviderHealth,
  RestoreResult,
  BackupPackage,
  RestoreOptions,
  RestoreReport,
  Collection,
  CollectionExport,
  DriftSource,
  ProcessTerminateRequest,
  ProcessTerminateResult,
  ThemeMode,
  AppInfo,
  ProviderInstallOutcome,
  ProviderSetEnabledResult,
} from '../services/types.js';

/** Close-interception hooks provided by the main entry (P6 safe shutdown). */
export interface CloseHooks {
  requestCloseWhenIdle: () => void;
  forceQuit: () => void;
  /** Consume the one-time startup notice (PCC v2.2 legacy migration). */
  takeStartupNotice: () => string | null;
}

/**
 * Registers every ipcMain.handle() backend for the channels exposed by
 * src/preload/index.ts (window.electronAPI.*).
 *
 * All handlers only delegate to already-existing services:
 *   - WingetProvider (winget CLI, restore, collections, snapshots, drift)
 *   - SettingsStore (ignored packages)
 *   - ExportService (JSON/CSV export, backups)
 *   - SnapshotService (health stats)
 *   - UpdateQueueService (queue state)
 *   - ProcessGuard (application-in-use detection / terminate, P3)
 */
export function registerIpcHandlers(
  provider: WingetProvider,
  getMainWindow: () => BrowserWindow | null,
  closeHooks?: CloseHooks
): void {
  // Fallback used when the entry point does not inject a notice reader (tests,
  // scripts). Always returns "nothing to show" rather than throwing.
  const readStartupNotice = closeHooks?.takeStartupNotice ?? ((): string | null => null);
  // --- provider group (multi-source aware, PCC v2.1) ------------------------
  //
  // Aggregate operations (installed / updates / upgrade-all) run across ALL
  // active providers. Package-scoped operations are routed to the owning
  // provider: an explicit provider id when the UI knows it, otherwise
  // resolution by package id (winget wins ties = legacy default).

  ipcMain.handle('provider:getInstalledApps', async (): Promise<InstalledApp[]> => {
    const apps = await collectInstalledApps();
    // Hide ignored packages from the main list.
    return SettingsStore.filterIgnoredApps(apps);
  });

  ipcMain.handle('provider:getAllInstalledApps', async (): Promise<InstalledApp[]> => {
    // Full list including ignored packages (used for exports/backups).
    return collectInstalledApps();
  });

  ipcMain.handle('provider:getAvailableUpdates', async () => {
    const updates = await collectAvailableUpdates();
    // Ignored packages are excluded from the updates view.
    return SettingsStore.filterIgnoredApps(updates);
  });

  ipcMain.handle(
    'provider:showPackage',
    async (_event, id: string, providerId?: string): Promise<PackageDetails> => {
      const target = getProvider(providerId) ?? (await resolveProviderForPackage(id)) ?? provider;
      return target.showPackage(id);
    }
  );

  ipcMain.handle(
    'provider:upgradePackage',
    async (_event, id: string, packageName?: string, providerId?: string): Promise<UpgradeResult> => {
      const target = getProvider(providerId) ?? (await resolveProviderForPackage(id)) ?? provider;
      return target.upgradePackage(id, packageName);
    }
  );

  /**
   * Multi-source "update all" (PCC v2.1): runs upgrade-all sequentially for
   * every active provider. Each provider tracks its own queue item, so the
   * UI can show per-provider progress; results come back as an array.
   */
  ipcMain.handle('provider:upgradeAll', async (): Promise<UpgradeResult[]> => {
    const providers = await getActiveProviders();
    const results: UpgradeResult[] = [];
    for (const p of providers) {
      try {
        results.push(await p.upgradeAll());
      } catch (error) {
        results.push({
          success: false,
          output: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    return results;
  });

  // PCC v2.1: install / uninstall / search — provider-routed.
  ipcMain.handle(
    'provider:install',
    async (_event, id: string, name?: string, providerId?: string): Promise<UpgradeResult> => {
      const target = getProvider(providerId) ?? (await resolveProviderForPackage(id)) ?? provider;
      return target.installPackage(id, name);
    }
  );

  ipcMain.handle(
    'provider:uninstall',
    async (_event, id: string, name?: string, providerId?: string): Promise<UpgradeResult> => {
      const target = getProvider(providerId) ?? (await resolveProviderForPackage(id)) ?? provider;
      return target.uninstallPackage(id, name);
    }
  );

  ipcMain.handle(
    'provider:search',
    async (_event, providerId: string, query: string): Promise<InstalledApp[]> => {
      const target = getProvider(providerId);
      if (!target || !query.trim()) return [];
      return target.searchPackages(query.trim());
    }
  );

  // --- providers group (PCC v2.1 multi-source settings) ---------------------

  /** Availability + enablement for every registered provider. */
  ipcMain.handle('providers:list', async (): Promise<ProviderInfo[]> => {
    return getProviderInfos();
  });

  /**
   * Provider health + installed version (PCC v2.2 About page).
   * Returns { id, name, status, version } per registered provider.
   */
  ipcMain.handle('providers:getHealth', async (): Promise<ProviderHealth[]> => {
    return ProviderHealthService.getProviderHealth();
  });

  /** Persist the enabled/disabled state of a provider (Settings page). */
  ipcMain.handle(
    'providers:setEnabled',
    async (
      _event,
      providerId: string,
      enabled: boolean,
      autoInstall: boolean = false
    ): Promise<ProviderSetEnabledResult> => {
      const id = (providerId ?? '').toLowerCase();
      if (!(id in PROVIDER_NAMES)) return { ok: false };
      const config = configService.getConfig();
      const current = config.providers?.enabled ?? {};
      configService.update('providers', { enabled: { ...current, [id]: enabled } });

      // Auto-install: enabling a provider in Settings installs the underlying
      // package manager when it is missing, rather than leaving the user to
      // run the Chocolatey / Microsoft Store bootstrappers by hand. Awaited
      // so the renderer's spinner ends exactly when the installer does and
      // can show an honest outcome (success / failure / needs-elevation).
      if (enabled && autoInstall) {
        let installOutcome: ProviderInstallOutcome | undefined;
        try {
          installOutcome = await installProviderIfUnavailable(id);
        } catch {
          installOutcome = 'failed';
        }
        return { ok: true, installOutcome };
      }
      return { ok: true };
    }
  );

  // --- system group (Chocolatey elevation fix) --------------------------------
  //
  // Providers flagged `requiresElevation` (Chocolatey) cannot perform
  // install/upgrade/uninstall unless PCC itself runs elevated. The renderer
  // checks `system:isAdministrator` before launching such operations and
  // offers `system:relaunchAsAdmin` (UAC) when the app is not elevated.

  /** Is the PCC main process running with an elevated (admin) token? */
  ipcMain.handle('system:isAdministrator', (): Promise<boolean> => isAdministrator());

  /**
   * Relaunch PCC elevated through the Windows UAC prompt.
   *
   * Flow:
   *  1. A short-lived PowerShell wrapper runs `Start-Process -Verb RunAs
   *     -PassThru` for this executable, passing the original launch
   *     arguments (so dev-mode `electron <entry>` relaunches the app, not a
   *     bare node/electron process; packaged exe needs no arguments).
   *  2. User accepts UAC  -> wrapper exits 0 and this instance quits shortly
   *     after (500 ms grace). Its `before-quit` persists queue/config state;
   *     the elevated instance (Electron boot takes well over a second) reads
   *     that state only after the old instance has written it.
   *  3. User cancels UAC   -> wrapper exits 1 and this instance keeps
   *     running, so a declined prompt never silently loses the app.
   */
  ipcMain.handle(
    'system:relaunchAsAdmin',
    (): { started: boolean; reason?: string } => {
      if (process.platform !== 'win32') {
        return { started: false, reason: 'Elevation is only supported on Windows.' };
      }
      try {
        const exe = process.execPath.replace(/'/g, "''");
        const launchArgs = process.argv
          .slice(1)
          .map((a) => `"${a.replace(/"/g, '""')}"`)
          .join(' ');
        const argClause = launchArgs ? ` -ArgumentList ${launchArgs}` : '';
        const psScript = [
          `$p = Start-Process -FilePath '${exe}'${argClause} -Verb RunAs -PassThru -ErrorAction SilentlyContinue`,
          'if ($null -eq $p) { exit 1 } else { exit 0 }',
        ].join('; ');
        const child = spawn(
          'powershell.exe',
          ['-NoProfile', '-NonInteractive', '-Command', psScript],
          { stdio: 'ignore', windowsHide: true }
        );
        let settled = false;
        const onDone = (code: number | null) => {
          if (settled) return;
          settled = true;
          if (code === 0) {
            // Elevated instance is starting; give the renderer a beat to
            // flush UI, then quit so state is persisted before handover.
            setTimeout(() => app.quit(), 500);
          } else {
            // UAC declined: stay up. The renderer toast auto-dismisses; the
            // user can retry from the same dialog or from Settings.
            console.log(`[system] relaunchAsAdmin: UAC declined (wrapper exit ${code}), staying up`);
          }
        };
        child.on('close', (code) => onDone(code));
        child.on('error', () => onDone(null));
        return { started: true };
      } catch (error) {
        return {
          started: false,
          reason: error instanceof Error ? error.message : 'Failed to start elevated relaunch',
        };
      }
    }
  );

  ipcMain.handle('provider:getPinnedPackages', () => provider.getPinnedPackages());

  ipcMain.handle('provider:pinPackage', (_event, id: string, version?: string) =>
    provider.pinPackage(id, version)
  );

  ipcMain.handle('provider:unpinPackage', (_event, id: string) => provider.unpinPackage(id));

  // --- ignored group (SettingsStore) --------------------------------------

  ipcMain.handle('ignored:getAll', () => SettingsStore.getIgnoredPackages());

  ipcMain.handle('ignored:add', (_event, id: string, name: string) => {
    SettingsStore.ignorePackage(id, name);
    return { success: true };
  });

  ipcMain.handle('ignored:remove', (_event, id: string) => {
    SettingsStore.unignorePackage(id);
    return { success: true };
  });

  // --- pinned group (WingetProvider winget pin) ----------------------------

  ipcMain.handle('pinned:getAll', () => provider.getPinnedPackages());

  ipcMain.handle('pinned:add', (_event, id: string, version?: string) =>
    provider.pinPackage(id, version)
  );

  ipcMain.handle('pinned:remove', (_event, id: string) => provider.unpinPackage(id));

  // --- export group (ExportService) ----------------------------------------

  ipcMain.handle('export:json', async (_event, apps: InstalledApp[]) => {
    const filePath = ExportService.getDefaultExportPath('json');
    await ExportService.exportToJson(apps, filePath);
    return { success: true, filePath };
  });

  ipcMain.handle('export:csv', async (_event, apps: InstalledApp[]) => {
    const filePath = ExportService.getDefaultExportPath('csv');
    await ExportService.exportToCsv(apps, filePath);
    return { success: true, filePath };
  });

  ipcMain.handle('export:backup', async (_event, apps: InstalledApp[]) => {
    const filePath = await ExportService.backupInstalledPackages(apps);
    return { success: true, filePath };
  });

  // --- restore group -------------------------------------------------------

  ipcMain.handle('restore:selectBackupFile', async () => {
    const win = getMainWindow();
    const options: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
      title: 'Select backup file',
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    return { canceled: result.canceled, filePath: result.filePaths[0] ?? '' };
  });

  ipcMain.handle('restore:loadBackupFile', (_event, filePath: string) => {
    try {
      const data = JSON.parse(readFileSync(filePath, 'utf-8')) as {
        packages: BackupPackage[];
        totalPackages: number;
        exportedAt: string;
      };
      if (!Array.isArray(data.packages)) {
        throw new Error('Invalid backup file: missing packages array');
      }
      return {
        success: true,
        backup: {
          packages: data.packages,
          totalPackages: data.totalPackages ?? data.packages.length,
          exportedAt: data.exportedAt ?? new Date().toISOString(),
        },
      };
    } catch {
      return {
        success: false,
        backup: { packages: [], totalPackages: 0, exportedAt: '' },
      };
    }
  });

  ipcMain.handle('restore:getPreview', (_event, backupPackages: BackupPackage[]) =>
    provider.getRestorePreview(backupPackages)
  );

  ipcMain.handle('restore:execute', (_event, options: RestoreOptions) =>
    provider.restorePackages(options)
  );

  ipcMain.handle('restore:generateReport', (_event, report: RestoreReport) =>
    provider.generateRestoreReport(report)
  );

  // --- collection group (WingetProvider -> CollectionService) --------------

  ipcMain.handle('collection:getAll', () => provider.getCollections());

  ipcMain.handle('collection:get', (_event, id: string) => provider.getCollection(id));

  ipcMain.handle(
    'collection:create',
    (_event, data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) =>
      provider.createCollection(data)
  );

  ipcMain.handle('collection:update', (_event, id: string, updates: Partial<Collection>) =>
    provider.updateCollection(id, updates)
  );

  ipcMain.handle('collection:delete', async (_event, id: string) => {
    await provider.deleteCollection(id);
    return { success: true };
  });

  ipcMain.handle('collection:export', (_event, id: string) =>
    provider.exportCollection(id)
  );

  ipcMain.handle('collection:import', (_event, data: CollectionExport) =>
    provider.importCollection(data)
  );

  /**
   * Install a collection (PCC v2.1 multi-source). Packages that carry an
   * explicit provider tag are routed to that provider; the rest fall back
   * to the legacy winget restore flow (mixed-provider collections work).
   */
  ipcMain.handle('collection:install', async (_event, id: string): Promise<RestoreResult[]> => {
    const collection = CollectionService.getById(id);
    if (!collection) throw new Error('Collection not found');
    const installable = CollectionService.getInstallablePackages(collection);
    const results: RestoreResult[] = [];

    const wingetIds = installable
      .filter((p) => !p.provider || p.provider === 'winget')
      .map((p) => p.id);
    if (wingetIds.length > 0) {
      results.push(
        ...(await provider.restorePackages({
          packageIds: wingetIds,
          acceptSourceAgreements: true,
        }))
      );
    }

    for (const p of installable.filter((x) => x.provider && x.provider !== 'winget')) {
      const target = getProvider(p.provider);
      const label = p.name ?? p.id;
      if (!target) {
        results.push({
          success: false,
          packageId: p.id,
          packageName: label,
          output: '',
          error: `Unknown provider: ${p.provider}`,
        });
        continue;
      }
      try {
        const r = await target.installPackage(p.id, label);
        results.push({
          success: r.success,
          packageId: p.id,
          packageName: label,
          output: r.output,
          error: r.error,
        });
      } catch (error) {
        results.push({
          success: false,
          packageId: p.id,
          packageName: label,
          output: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    return results;
  });

  // --- snapshot group (WingetProvider -> SnapshotService) ------------------

  ipcMain.handle('snapshot:getAll', () => provider.getSnapshots());

  ipcMain.handle(
    'snapshot:create',
    async (_event, name: string, description?: string) => {
      // PCC v2.1: snapshots capture ALL active providers so source
      // information survives in the snapshot (mixed-provider restore/apply).
      const apps = await collectInstalledApps();
      return SnapshotService.create(name, description, apps);
    }
  );

  ipcMain.handle('snapshot:get', (_event, id: string) => provider.getSnapshot(id));

  ipcMain.handle('snapshot:delete', async (_event, id: string) => {
    await provider.deleteSnapshot(id);
    return { success: true };
  });

  ipcMain.handle('snapshot:compare', (_event, id1: string, id2: string) =>
    provider.compareSnapshots(id1, id2)
  );

  // --- drift group ----------------------------------------------------------

  ipcMain.handle('drift:detect', (_event, sourceType: DriftSource, sourceId: string) =>
    provider.detectDrift(sourceType, sourceId)
  );

  // --- health group ---------------------------------------------------------

  ipcMain.handle('health:getStats', async () => {
    const [pinned, lastBackup, lastRestore] = await Promise.all([
      provider.getPinnedPackages(),
      // Backup + report folders come from their path services (single source
      // of truth), so these stats can never point at a stale folder.
      latestFileMtime(backupPathService.getBackupRoot()),
      reportPathService.getLastRestoreTimestamp(),
    ]);
    return {
      ignoredPackagesCount: SettingsStore.getIgnoredPackages().length,
      pinnedPackagesCount: pinned.length,
      lastBackup: lastBackup,
      lastRestore: lastRestore,
      snapshotCount: SnapshotService.getAll().length,
    };
  });

  // --- config group (theme) ---------------------------------------------------

  ipcMain.handle('config:getThemeMode', (): ThemeMode => {
    return configService.get('theme').mode;
  });

  ipcMain.handle('config:setThemeMode', (_event, mode: ThemeMode): ThemeMode => {
    // Only two themes are supported; anything else (including legacy
    // 'system' values from older builds) falls back to dark.
    const safe: ThemeMode = mode === 'light' ? 'light' : 'dark';
    configService.update('theme', { mode: safe });
    return safe;
  });

  // --- app group (About page: live application + system information) --------

  ipcMain.handle('app:getInfo', (): AppInfo => getAppInfo());

  /**
   * PCC v2.2: consume the one-time startup notice (e.g. "Legacy PCC data
   * successfully migrated."). Returns null once it has been shown.
   */
  ipcMain.handle('app:getStartupNotice', (): string | null => readStartupNotice());

  // --- queue group (UpdateQueueService) ------------------------------------

  ipcMain.handle('queue:getAll', () => updateQueueService.getQueue());

  ipcMain.handle('queue:clearCompleted', () => {
    updateQueueService.clearCompleted();
  });

  ipcMain.handle('queue:clearAll', () => {
    updateQueueService.clearAll();
  });

  ipcMain.handle('queue:remove', (event, id: string): boolean => {
    return updateQueueService.removeOperation(id);
  });

  /**
   * Explicit user retry (P2 retry policy). Only failed items can be
   * retried; each retry bumps retryCount by exactly 1. There are no
   * automatic retries anywhere in the app.
   */
  ipcMain.handle('queue:retry', async (_event, id: string) => {
    const item = updateQueueService.getOperation(id);
    if (!item) {
      return { success: false, error: 'Queue item not found.' };
    }
    if (item.status !== 'failed') {
      return { success: false, error: 'Only failed operations can be retried.' };
    }
    if (!['upgrade', 'install', 'uninstall'].includes(item.operationType) || !item.packageId) {
      return { success: false, error: 'This operation type does not support retry.' };
    }
    // PCC v2.1: route the retry to the provider that owns the package.
    const target = getProvider(item.provider) ?? provider;
    const result =
      item.operationType === 'install'
        ? await target.installPackage(item.packageId, item.packageName)
        : item.operationType === 'uninstall'
          ? await target.uninstallPackage(item.packageId, item.packageName)
          : await target.upgradePackage(item.packageId, item.packageName, {
              retryCount: (item.retryCount ?? 0) + 1,
            });
    return { success: result.success, duplicate: result.duplicate, error: result.error };
  });

  // --- process group (application-in-use detection, P3) ---------------------

  ipcMain.handle('process:findBlockers', (_event, packageId: string, packageName?: string) =>
    ProcessGuard.findBlockers(packageId, packageName)
  );

  ipcMain.handle(
    'process:terminate',
    async (_event, request: ProcessTerminateRequest): Promise<ProcessTerminateResult & { retryError?: string }> => {
      const { processes, services, retryItemId } = request;
      // The UI passes a flat list of blocker names (processes + services
      // mixed) — route each one to the right termination mechanism.
      const routed = await ProcessGuard.splitTargets([...(processes ?? []), ...(services ?? [])]);
      const terminateResult = await ProcessGuard.terminate({
        processes: routed.processes,
        services: routed.services,
      });

      // Optional: retry the failed operation right after the blockers are gone.
      let retriedOperationId: string | undefined;
      let retryError: string | undefined;
      if (retryItemId) {
        const item = updateQueueService.getOperation(retryItemId);
        if (item && item.status === 'failed' && item.operationType === 'upgrade' && item.packageId) {
          const target = getProvider(item.provider) ?? provider;
          const result = await target.upgradePackage(item.packageId, item.packageName, {
            retryCount: (item.retryCount ?? 0) + 1,
          });
          retriedOperationId = updateQueueService
            .getQueue()
            .filter((q) => q.operationType === 'upgrade' && q.packageId === item.packageId)
            .pop()
            ?.id;
          if (!result.success && !result.duplicate) {
            retryError = result.error;
          }
        }
      }

      return { ...terminateResult, retriedOperationId, retryError };
    }
  );

  // --- window group (safe shutdown, P6) --------------------------------------

  /**
   * Keep the native (Windows 11) title-bar overlay in step with the app
   * theme so the hidden-titlebar chrome matches theme-light / theme-dark.
   */
  ipcMain.handle('window:setTheme', (_event, theme: 'light' | 'dark') => {
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      win.setTitleBarOverlay(
        theme === 'light'
          ? { color: '#F5F7FA', symbolColor: '#1F2937', height: 32 }
          : { color: '#1A1A2E', symbolColor: '#FFFFFF', height: 32 }
      );
    }
  });

  /**
   * Renderer's answer to the "updates are running" close dialog:
   *  - stay:  do nothing
   *  - wait:  close automatically once no active operations remain
   *  - force: confirm natively, terminate winget.exe, mark items failed, exit
   */
  ipcMain.handle('window:close-choice', async (_event, choice: 'stay' | 'wait' | 'force') => {
    if (choice === 'stay') {
      return { closed: false };
    }
    if (choice === 'wait') {
      closeHooks?.requestCloseWhenIdle();
      return { closed: false };
    }
    const win = getMainWindow();
    if (win && !win.isDestroyed()) {
      const answer = await dialog.showMessageBox(win, {
        type: 'warning',
        title: 'Terminate Winget processes?',
        message: 'Force stop updates and exit?',
        detail:
          'All running Winget processes will be terminated. Partial updates may need to be re-run later.',
        buttons: ['Terminate & Exit', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
      });
      if (answer.response === 1) {
        return { closed: false };
      }
    }
    closeHooks?.forceQuit();
    return { closed: true };
  });

  // --- dialog group ----------------------------------------------------------

  ipcMain.handle('dialog:showError', (_event, title: string, content: string) => {
    dialog.showErrorBox(title || 'Error', content || '');
  });

  ipcMain.handle('dialog:showInfo', async (_event, title: string, content: string) => {
    const win = getMainWindow();
    const options: Electron.MessageBoxOptions = {
      type: 'info',
      title: title || 'Information',
      message: content || '',
      buttons: ['OK'],
    };
    if (win && !win.isDestroyed()) {
      await dialog.showMessageBox(win, options);
    } else {
      await dialog.showMessageBox(options);
    }
  });
}

/** ISO timestamp of the most recent file in dir, or null. */
function latestFileMtime(dir: string): string | null {
  if (!existsSync(dir)) return null;
  let latest: Date | null = null;
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isFile() && (!latest || st.mtime > latest)) {
        latest = st.mtime;
      }
    }
  } catch {
    return null;
  }
  return latest ? latest.toISOString() : null;
}
