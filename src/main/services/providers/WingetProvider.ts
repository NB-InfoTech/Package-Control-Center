import { CommandExecutor, CommandResult } from '../CommandExecutor.js';
import { WingetTableParser, normalizeProviderId } from '../WingetParser.js';
import { updateQueueService } from '../UpdateQueueService.js';
import { CollectionService } from '../CollectionService.js';
import { SnapshotService } from '../SnapshotService.js';
import { DriftDetectionService } from '../DriftDetectionService.js';
import { SettingsStore } from '../SettingsStore.js';
import { ProcessGuard } from '../ProcessGuard.js';
import { translateWingetError } from '../ErrorTranslator.js';
import { reportPathService, dataPathService } from '../paths/index.js';
import { logger } from '../logging/index.js';
import {
  IUpdateProvider,
  InstalledApp,
  AvailableUpdate,
  AvailableUpdateDetailed,
  PackageDetails,
  UpgradeResult,
  PinnedPackage,
  LogEntry,
  ProgressStep,
  BackupPackage,
  RestorePreviewItem,
  RestoreOptions,
  RestoreResult,
  RestoreReport,
  Collection,
  CollectionPackage,
  CollectionExport,
  SystemSnapshot,
  SnapshotPackage,
  SnapshotComparisonResult,
  DriftSource,
  DriftReport,
} from './IUpdateProvider.js';
import { join } from 'path';
import { writeFileSync } from 'fs';
import type { ProviderId, ProviderAvailability } from '../types.js';

export class WingetProvider implements IUpdateProvider {
  private static readonly WINGET_COMMAND = 'winget';
  /** Slow source lookups can take a while — avoid cutting output mid-stream. */
  private static readonly LIST_TIMEOUT_MS = 300000;
  /** Availability cache (PCC v2.1 multi-source). */
  private static availabilityCache: { at: number; value: ProviderAvailability } | null = null;

  // --- PCC v2.1 multi-source: provider identity ---
  readonly id: ProviderId = 'winget';
  readonly displayName = 'Winget';
  /** winget self-elevates via the Windows consent UI when a package needs it. */
  readonly requiresElevation = false;

  async checkAvailability(): Promise<ProviderAvailability> {
    const TTL_MS = 60000;
    if (WingetProvider.availabilityCache && Date.now() - WingetProvider.availabilityCache.at < TTL_MS) {
      return WingetProvider.availabilityCache.value;
    }
    let value: ProviderAvailability;
    try {
      const result = await CommandExecutor.execute(WingetProvider.WINGET_COMMAND, ['--version'], { timeout: 15000 });
      if (result.exitCode === 0) {
        value = { available: true, version: result.stdout.split('\n')[0]?.trim() || undefined };
      } else {
        value = { available: false, reason: 'winget command failed' };
      }
    } catch {
      value = { available: false, reason: 'winget is not installed or not on PATH' };
    }
    WingetProvider.availabilityCache = { at: Date.now(), value };
    return value;
  }

  async getInstalledApps(): Promise<InstalledApp[]> {
    const result = await CommandExecutor.execute(
      WingetProvider.WINGET_COMMAND,
      ['list', '--accept-source-agreements'],
      { timeout: WingetProvider.LIST_TIMEOUT_MS }
    );
    const apps = WingetTableParser.parseListOutput(result);
    // PCC v2.1: the Winget provider owns the community source; msstore rows
    // belong to the MicrosoftStoreProvider.
    return apps.filter((a) => normalizeProviderId(a.source) === 'winget');
  }

  async getAvailableUpdates(): Promise<AvailableUpdate[]> {
    const detailed = await this.getAvailableUpdatesDetailed();
    // PCC v2.1: the Winget provider owns the community source; msstore
    // updates belong to the MicrosoftStoreProvider.
    return detailed.updates.filter((u) => u.source === 'winget');
  }

  /** Search the winget community source catalog (PCC v2.1 multi-source). */
  async searchPackages(query: string): Promise<InstalledApp[]> {
    const result = await CommandExecutor.execute(
      WingetProvider.WINGET_COMMAND,
      ['search', query, '--accept-source-agreements'],
      { timeout: WingetProvider.LIST_TIMEOUT_MS }
    );
    const apps = WingetTableParser.parseListOutput(result);
    return apps.filter((a) => normalizeProviderId(a.source) === 'winget');
  }

  /** Install a package from the winget community source (PCC v2.1). */
  async installPackage(id: string, name?: string): Promise<UpgradeResult> {
    return this.runInstallOrUninstall('install', id, name);
  }

  /** Uninstall a package installed from the winget community source. */
  async uninstallPackage(id: string, name?: string): Promise<UpgradeResult> {
    return this.runInstallOrUninstall('uninstall', id, name);
  }

  /**
   * Shared queue-tracked runner for install/uninstall winget operations.
   * Mirrors the upgradePackage lifecycle: duplicate guard -> queue item ->
   * streaming execution -> status + logs.
   */
  private async runInstallOrUninstall(
    op: 'install' | 'uninstall',
    id: string,
    name?: string
  ): Promise<UpgradeResult> {
    const verb = op === 'install' ? 'Install' : 'Uninstall';
    const activeSame = updateQueueService.findActiveOperation(op, id, this.id);
    if (activeSame) {
      const msg = `${verb} for ${name || id} is already in progress.`;
      updateQueueService.addLog(activeSame.id, {
        level: 'warn',
        message: `Duplicate ${op} request ignored (${id})`,
      });
      return { success: false, output: '', error: msg, duplicate: true };
    }

    const operationId = updateQueueService.addOperation(op, id, name, { provider: this.id });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: `${verb}ing ${name || id} (winget)` });

    try {
      const result = await CommandExecutor.executeStreaming(
        WingetProvider.WINGET_COMMAND,
        [op, '--id', id, '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data, 'stdout'),
          onStderr: (data) => this.handleStreamOutput(operationId, data, 'stderr'),
        },
        { timeout: 300000 }
      );
      const parsed = WingetTableParser.parseUpgradeResult(result);
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: `${verb} completed successfully` });
        updateQueueService.updateProgress(operationId, 100, 'completed');
      } else {
        updateQueueService.updateStatus(operationId, 'failed');
        updateQueueService.addLog(operationId, { level: 'error', message: parsed.error || parsed.output });
      }
      return parsed;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      updateQueueService.updateStatus(operationId, 'failed');
      updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      throw error;
    }
  }

  /**
   * Fetches available updates together with the raw winget output and the
   * parse audit trail. Powers the PCC_UPDATE_AUDIT=1 discovery funnel
   * (raw -> parsed -> ignored -> final display).
   */
  async getAvailableUpdatesDetailed(): Promise<AvailableUpdateDetailed> {
    const result = await CommandExecutor.execute(
      WingetProvider.WINGET_COMMAND,
      ['upgrade', '--accept-source-agreements'],
      { timeout: WingetProvider.LIST_TIMEOUT_MS }
    );
    const { rows, audit } = WingetTableParser.parseUpgradeOutputDetailed(result);
    const detailed: AvailableUpdateDetailed = {
      updates: rows,
      rawOutput: result.stdout,
      parseAudit: audit,
    };
    this.captureUpdateAudit(detailed);
    return detailed;
  }

  /**
   * PCC_UPDATE_AUDIT=1: dump the full discovery funnel to
   * ~/.package-control-center/logs/update-audit-<ts>.json so any count
   * mismatch against `winget upgrade` can be diagnosed offline.
   */
  private captureUpdateAudit(detailed: AvailableUpdateDetailed): void {
    if (process.env.PCC_UPDATE_AUDIT !== '1' && process.env.PCC_UPDATE_AUDIT !== 'true') return;
    try {
      const logsDir = dataPathService.ensureDir('logs');
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const ignored = SettingsStore.getIgnoredPackages();
      const report = {
        generatedAt: new Date().toISOString(),
        command: `${WingetProvider.WINGET_COMMAND} upgrade --accept-source-agreements`,
        rawOutput: detailed.rawOutput,
        parsedPackages: detailed.updates,
        parseAudit: detailed.parseAudit,
        ignoredPackages: ignored,
        finalDisplay: SettingsStore.filterIgnoredApps(detailed.updates),
        counts: {
          rawLines: detailed.rawOutput.split(/\r?\n/).length,
          parsed: detailed.updates.length,
          ignoredEntries: ignored.length,
          final: SettingsStore.filterIgnoredApps(detailed.updates).length,
        },
      };
      const file = join(logsDir, `update-audit-${ts}.json`);
      writeFileSync(file, JSON.stringify(report, null, 2), 'utf-8');
      logger.info('Update discovery audit written', { file, parsed: report.counts.parsed, final: report.counts.final });
    } catch (error) {
      logger.error('Failed to write update discovery audit', error as Error);
    }
  }

  async showPackage(id: string): Promise<PackageDetails> {
    const result = await CommandExecutor.execute(WingetProvider.WINGET_COMMAND, ['show', '--id', id, '--accept-source-agreements']);
    return this.parseShowOutput(result);
  }

  async upgradePackage(id: string, packageName?: string, opts?: { retryCount?: number }): Promise<UpgradeResult> {
    // --- duplicate-start guard (P2): one package = one active operation ---
    // A second winget process for the same package would race the first one
    // for the same install files and cause 0x80070020 on its own.
    const activeSamePackage = updateQueueService.findActiveOperation('upgrade', id, this.id);
    const activeUpgradeAll = updateQueueService.findActiveOperation('upgrade-all', undefined, this.id);
    if (activeSamePackage || activeUpgradeAll) {
      const busy = activeSamePackage ?? activeUpgradeAll!;
      const msg = activeSamePackage
        ? `Update for ${packageName || id} is already in progress.`
        : 'All-package update is in progress. Wait for it to finish before starting individual updates.';
      updateQueueService.addLog(busy.id, {
        level: 'warn',
        message: `Duplicate upgrade request ignored (${id})`,
      });
      return { success: false, output: '', error: msg, duplicate: true };
    }

    const operationId = updateQueueService.addOperation('upgrade', id, packageName, {
      retryCount: opts?.retryCount ?? 0,
      provider: this.id,
    });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(
      operationId,
      { level: 'info', message: `Starting upgrade for ${packageName || id}` }
    );

    try {
      const result = await CommandExecutor.executeStreaming(
        WingetProvider.WINGET_COMMAND,
        ['upgrade', '--id', id, '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data, 'stdout'),
          onStderr: (data) => this.handleStreamOutput(operationId, data, 'stderr'),
        },
        { timeout: 300000 }
      );

      const parsed = WingetTableParser.parseUpgradeResult(result);

      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'Upgrade completed successfully' });
        updateQueueService.updateProgress(operationId, 100, 'completed');
      } else {
        await this.recordUpgradeFailure(operationId, id, packageName, parsed.output, parsed.error || parsed.output);
      }

      return parsed;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.recordUpgradeFailure(operationId, id, packageName, errorMsg, errorMsg);
      throw error;
    }
  }

  /**
   * Translate a failed upgrade into a friendly error (ErrorTranslator),
   * detect application-in-use (0x80070020) and attach the blocking
   * processes so the UI can offer "Stop Process & Retry".
   */
  private async recordUpgradeFailure(
    operationId: string,
    packageId: string,
    packageName: string | undefined,
    rawError: string,
    rawDetail: string
  ): Promise<void> {
    const translated = translateWingetError(rawError);
    updateQueueService.setError(operationId, translated.friendly, rawDetail);
    updateQueueService.addLog(operationId, { level: 'error', message: translated.friendly });
    if (translated.detail && translated.detail !== rawDetail) {
      updateQueueService.addLog(operationId, { level: 'debug', message: translated.detail });
    }

    if (translated.inUse) {
      try {
        const blockers = await ProcessGuard.findBlockers(packageId, packageName);
        if (blockers.length > 0) {
          updateQueueService.attachInUse(operationId, blockers.map((b) => b.name));
          updateQueueService.addLog(operationId, {
            level: 'warn',
            message: `These may be holding the package files: ${blockers.map((b) => b.name).join(', ')}`,
          });
        }
      } catch (error) {
        logger.error('In-use detection failed', error as Error);
      }
    }
  }

  async upgradeAll(): Promise<UpgradeResult> {
    // --- duplicate-start guard (P2): only one bulk upgrade at a time ---
    const activeUpgradeAll = updateQueueService.findActiveOperation('upgrade-all');
    if (activeUpgradeAll) {
      updateQueueService.addLog(activeUpgradeAll.id, {
        level: 'warn',
        message: 'Duplicate upgrade-all request ignored',
      });
      return { success: false, output: '', error: 'All-package update is already in progress.', duplicate: true };
    }

    // --- bulk-state audit step 1: snapshot the batch BEFORE starting ---
    // The queue item stores { total, packages } so the UI can later prove
    // "3 were processed" even though the live update list has changed.
    let snapshot: AvailableUpdate[];
    try {
      snapshot = await this.getAvailableUpdates();
    } catch {
      return { success: false, output: '', error: 'Could not scan available updates. Try again.' };
    }
    if (snapshot.length === 0) {
      return { success: false, output: '', error: 'No updates available.' };
    }

    const operationId = updateQueueService.addOperation(
      'upgrade-all',
      undefined,
      `All Packages (${snapshot.length})`,
      { provider: this.id }
    );
    updateQueueService.attachBulkMeta(operationId, {
      total: snapshot.length,
      packages: snapshot.map((u) => ({ id: u.id, name: u.name })),
    });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, {
      level: 'info',
      message: `Starting bulk upgrade for ${snapshot.length} package(s): ${snapshot.map((u) => u.name).join(', ')}`,
    });

    try {
      const result = await CommandExecutor.executeStreaming(
        WingetProvider.WINGET_COMMAND,
        ['upgrade', '--all', '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data, 'stdout'),
          onStderr: (data) => this.handleStreamOutput(operationId, data, 'stderr'),
        },
        { timeout: 600000 }
      );

      const parsed = WingetTableParser.parseUpgradeResult(result);

      // --- bulk-state audit step 2: post-scan diff for the summary ---
      // A snapshot package that no longer appears in `winget upgrade` was
      // updated; one that still does was not. If the post-scan itself fails
      // we attach NO summary rather than misclassifying every package.
      let post: AvailableUpdate[] | null = null;
      try {
        post = await this.getAvailableUpdates();
      } catch {
        post = null;
      }

      let succeeded: string[] = [];
      let failed: string[] = [];
      if (post) {
        const postIds = new Set(post.map((u) => u.id));
        succeeded = snapshot.filter((u) => !postIds.has(u.id)).map((u) => u.id);
        failed = snapshot.filter((u) => postIds.has(u.id)).map((u) => u.id);
        updateQueueService.setBulkSummary(operationId, { succeeded, failed });
      }

      const idsToNames = new Map(snapshot.map((u) => [u.id, u.name]));
      const names = (ids: string[]) => ids.map((id) => idsToNames.get(id) ?? id);

      const fullySucceeded = parsed.success && post !== null && failed.length === 0;

      if (fullySucceeded) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, {
          level: 'info',
          message: `All ${succeeded.length} upgrade(s) completed successfully`,
        });
        updateQueueService.updateProgress(operationId, 100, 'completed');
        return parsed;
      }

      // Partial / failed bulk update: one friendly message for both the
      // queue item and the returned result, so toasts and the
      // "Update Summary" section always agree.
      const friendly = !parsed.success
        ? translateWingetError(parsed.error || parsed.output).friendly
        : post
          ? `Bulk update finished: ${succeeded.length} succeeded, ${failed.length} still need an update${failed.length > 0 ? ` (${names(failed).join(', ')})` : ''}.`
          : 'Bulk update finished; results could not be verified (post-scan failed).';
      const raw = parsed.success
        ? failed.length > 0
          ? names(failed).join(', ')
          : 'post-scan unavailable'
        : parsed.error || parsed.output;
      if (parsed.success) {
        updateQueueService.addLog(operationId, { level: 'info', message: friendly });
      }
      await this.recordUpgradeFailure(operationId, '', undefined, friendly, raw);
      return { ...parsed, success: false, error: friendly };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      await this.recordUpgradeFailure(operationId, '', undefined, errorMsg, errorMsg);
      throw error;
    }
  }

  async getPinnedPackages(): Promise<PinnedPackage[]> {
    const result = await CommandExecutor.execute(WingetProvider.WINGET_COMMAND, ['pin', 'list']);
    return this.parsePinListOutput(result);
  }

  async pinPackage(id: string, version?: string): Promise<UpgradeResult> {
    const args = ['pin', 'add', '--id', id];
    if (version) {
      args.push('--version', version);
    }
    args.push('--accept-source-agreements');
    
    const result = await CommandExecutor.execute(WingetProvider.WINGET_COMMAND, args);
    return WingetTableParser.parseUpgradeResult(result);
  }

  async unpinPackage(id: string): Promise<UpgradeResult> {
    const result = await CommandExecutor.execute(WingetProvider.WINGET_COMMAND, ['pin', 'remove', '--id', id, '--accept-source-agreements']);
    return WingetTableParser.parseUpgradeResult(result);
  }

  async getRestorePreview(backupPackages: BackupPackage[]): Promise<RestorePreviewItem[]> {
    const [installedApps, availableUpdates] = await Promise.all([
      this.getInstalledApps(),
      this.getAvailableUpdates(),
    ]);

    const installedMap = new Map(installedApps.map(app => [app.id, app]));
    const updatesMap = new Map(availableUpdates.map(update => [update.id, update]));

    return backupPackages.map(pkg => {
      const installed = installedMap.get(pkg.id);
      if (installed) {
        return {
          name: pkg.name,
          id: pkg.id,
          version: pkg.version,
          source: pkg.source,
          status: 'already-installed' as const,
          installedVersion: installed.version,
        };
      }

      const update = updatesMap.get(pkg.id);
      if (update) {
        return {
          name: pkg.name,
          id: pkg.id,
          version: pkg.version,
          source: pkg.source,
          status: 'install-available' as const,
          availableVersion: update.availableVersion,
        };
      }

      return {
        name: pkg.name,
        id: pkg.id,
        version: pkg.version,
        source: pkg.source,
        status: 'missing-package' as const,
      };
    });
  }

  async restorePackages(options: RestoreOptions): Promise<RestoreResult[]> {
    const results: RestoreResult[] = [];
    const { packageIds, source, acceptSourceAgreements = true } = options;

    for (const packageId of packageIds) {
      const operationId = updateQueueService.addOperation('restore', packageId);
      updateQueueService.updateStatus(operationId, 'running');
      updateQueueService.addLog(operationId, { level: 'info', message: `Starting restore for ${packageId}` });

      try {
        const args = ['install', '--id', packageId];
        if (source) {
          args.push('--source', source);
        }
        if (acceptSourceAgreements) {
          args.push('--accept-source-agreements');
        }

        const result = await CommandExecutor.executeStreaming(
          WingetProvider.WINGET_COMMAND,
          args,
          {
            onStdout: (data) => this.handleStreamOutput(operationId, data, 'stdout'),
            onStderr: (data) => this.handleStreamOutput(operationId, data, 'stderr'),
          },
          { timeout: 300000 }
        );

        const parsed = WingetTableParser.parseUpgradeResult(result);
        
        const restoreResult: RestoreResult = {
          success: parsed.success,
          packageId,
          packageName: packageId,
          output: parsed.output,
          error: parsed.error,
        };

        results.push(restoreResult);

        if (parsed.success) {
          updateQueueService.updateStatus(operationId, 'success');
          updateQueueService.addLog(operationId, { level: 'info', message: 'Restore completed successfully' });
          updateQueueService.updateProgress(operationId, 100, 'completed');
        } else {
          updateQueueService.setError(operationId, parsed.error || parsed.output);
          updateQueueService.addLog(operationId, { level: 'error', message: parsed.error || parsed.output });
        }

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        const restoreResult: RestoreResult = {
          success: false,
          packageId,
          packageName: packageId,
          output: '',
          error: errorMsg,
        };
        results.push(restoreResult);
        updateQueueService.setError(operationId, errorMsg);
        updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      }
    }

    return results;
  }

  async generateRestoreReport(report: RestoreReport): Promise<{ success: boolean; filePath: string }> {
    // Folder is owned by ReportPathService (PCC v2.2); it also migrates any
    // pre-rebrand reports in so `lastRestore` keeps its history.
    reportPathService.migrateLegacyReportsIfNeeded();
    const reportsDir = reportPathService.ensureReportsRoot();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(reportsDir, `restore-report-${timestamp}.json`);
    
    writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    return { success: true, filePath };
  }

  // Collection methods
  async getCollections(): Promise<Collection[]> {
    return CollectionService.getAll();
  }

  async getCollection(id: string): Promise<Collection | null> {
    return CollectionService.getById(id);
  }

  async createCollection(data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> {
    return CollectionService.create(data);
  }

  async updateCollection(id: string, updates: Partial<Collection>): Promise<Collection> {
    const updated = CollectionService.update(id, updates);
    if (!updated) throw new Error('Collection not found or cannot be modified');
    return updated;
  }

  async deleteCollection(id: string): Promise<void> {
    const deleted = CollectionService.delete(id);
    if (!deleted) throw new Error('Collection not found or cannot be deleted');
  }

  async exportCollection(id: string): Promise<CollectionExport> {
    const exported = CollectionService.export(id);
    if (!exported) throw new Error('Collection not found');
    return exported;
  }

  async importCollection(data: CollectionExport): Promise<Collection> {
    return CollectionService.import(data);
  }

  async installCollection(id: string): Promise<RestoreResult[]> {
    const collection = CollectionService.getById(id);
    if (!collection) throw new Error('Collection not found');

    const packages = CollectionService.getInstallablePackages(collection);
    const options: RestoreOptions = {
      packageIds: packages.map(p => p.id),
      acceptSourceAgreements: true,
    };

    return this.restorePackages(options);
  }

  // Snapshot methods
  async getSnapshots(): Promise<SystemSnapshot[]> {
    return SnapshotService.getAll();
  }

  async createSnapshot(name: string, description?: string): Promise<SystemSnapshot> {
    return SnapshotService.create(name, description);
  }

  async getSnapshot(id: string): Promise<SystemSnapshot | null> {
    return SnapshotService.getById(id);
  }

  async deleteSnapshot(id: string): Promise<void> {
    const deleted = SnapshotService.delete(id);
    if (!deleted) throw new Error('Snapshot not found');
  }

  async compareSnapshots(id1: string, id2: string): Promise<SnapshotComparisonResult> {
    return SnapshotService.compare(id1, id2);
  }

  // Drift detection methods
  async detectDrift(sourceType: DriftSource, sourceId: string): Promise<DriftReport> {
    return DriftDetectionService.detectDrift(sourceType, sourceId);
  }

  private handleStreamOutput(operationId: string, data: string, stream: 'stdout' | 'stderr'): void {
    const lines = data.split('\n').filter(line => line.trim());
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const level: LogEntry['level'] = stream === 'stderr' ? 'warn' : 'info';
      updateQueueService.addLog(operationId, { level, message: trimmed });

      const step = this.detectProgressStep(trimmed);
      if (step) {
        const progress = this.stepToProgress(step);
        updateQueueService.addProgressEvent({
          operationId,
          step,
          progress,
          message: trimmed,
        });
      }
    }
  }

  private detectProgressStep(line: string): ProgressStep | null {
    const lower = line.toLowerCase();
    // Order matters: "Successfully installed" must match 'completed',
    // not the generic 'install' check below.
    if (
      lower.includes('successfully installed') ||
      lower.includes('upgrade completed') ||
      lower.includes('operation completed')
    ) {
      return 'completed';
    }
    if (
      lower.includes('starting upgrade') ||
      lower.includes('preparing') ||
      lower.includes('checking') ||
      lower.includes('acquiring')
    ) {
      return 'preparing';
    }
    if (lower.includes('downloading') || lower.includes('download')) {
      return 'downloading';
    }
    if (lower.includes('installing') || lower.includes('install')) {
      return 'installing';
    }
    if (lower.includes('verifying') || lower.includes('verify')) {
      return 'verifying';
    }
    return null;
  }

  private stepToProgress(step: ProgressStep): number {
    switch (step) {
      case 'preparing': return 10;
      case 'downloading': return 30;
      case 'installing': return 60;
      case 'verifying': return 85;
      case 'completed': return 100;
    }
    // Exhaustiveness check
    const _exhaustive: never = step;
    return 0;
  }

  private parseShowOutput(result: CommandResult): PackageDetails {
    const lines = result.stdout.split('\n');
    const details: PackageDetails = {
      name: '',
      id: '',
      publisher: '',
      version: '',
      description: '',
      homepage: '',
      license: '',
      source: '',
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (trimmed.startsWith('Name:')) details.name = trimmed.slice(5).trim();
      else if (trimmed.startsWith('Id:')) details.id = trimmed.slice(3).trim();
      else if (trimmed.startsWith('Publisher:')) details.publisher = trimmed.slice(10).trim();
      else if (trimmed.startsWith('Version:')) details.version = trimmed.slice(8).trim();
      else if (trimmed.startsWith('Description:')) details.description = trimmed.slice(12).trim();
      else if (trimmed.startsWith('Homepage:')) details.homepage = trimmed.slice(9).trim();
      else if (trimmed.startsWith('License:')) details.license = trimmed.slice(8).trim();
      else if (trimmed.startsWith('Source:')) details.source = trimmed.slice(7).trim();
    }

    return details;
  }

  private parsePinListOutput(result: CommandResult): PinnedPackage[] {
    const lines = result.stdout.split('\n');
    const pins: PinnedPackage[] = [];

    let headerFound = false;
    let separatorFound = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!headerFound && trimmed.startsWith('Name')) {
        headerFound = true;
        continue;
      }

      if (headerFound && !separatorFound && (trimmed.startsWith('---') || trimmed.startsWith('==='))) {
        separatorFound = true;
        continue;
      }

      if (headerFound && separatorFound) {
        const parsed = this.parsePinLine(trimmed);
        if (parsed) {
          pins.push(parsed);
        }
      }
    }

    return pins;
  }

  private parsePinLine(line: string): PinnedPackage | null {
    const parts = line.split(/\s{2,}/).filter(p => p.length > 0);
    if (parts.length < 3) {
      return null;
    }

    const name = parts[0].trim();
    const id = parts[1].trim();
    const pinInfo = parts[2].trim();

    let pinType: 'version' | 'block' = 'block';
    let pinnedVersion: string | undefined;

    if (pinInfo.toLowerCase() === 'block') {
      pinType = 'block';
    } else {
      pinType = 'version';
      pinnedVersion = pinInfo;
    }

    return { name, id, pinType, pinnedVersion };
  }
}