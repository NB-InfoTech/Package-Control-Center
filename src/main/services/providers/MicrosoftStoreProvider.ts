import { CommandExecutor } from '../CommandExecutor.js';
import { WingetTableParser } from '../WingetParser.js';
import { updateQueueService } from '../UpdateQueueService.js';
import type {
  IPackageProvider,
  InstalledApp,
  AvailableUpdate,
  PackageDetails,
  UpgradeResult,
} from './IUpdateProvider.js';
import type { ProviderId, ProviderAvailability } from '../types.js';

/**
 * Microsoft Store provider (PCC v2.1 multi-source).
 *
 * SAFEST APPROACH (design decision, see MULTI_PROVIDER_ARCHITECTURE.md):
 * instead of integrating the MS Store / IPA APIs directly, this provider
 * drives the already-installed `winget` CLI with `--source msstore`.
 *  - No custom credential / token handling — winget uses the existing
 *    MS Store source the user already has (checked at startup).
 *  - Reuses winget's battle-tested install/uninstall/upgrade pipeline.
 *  - Source is always labeled "Microsoft Store" (provider id: msstore).
 *
 * Winget specifics that differ from the community source:
 *  - `winget list --source msstore`    -> 3 columns (Name | Id | Version)
 *  - `winget upgrade --source msstore` -> 4 columns (Name | Id | Version | Available)
 *  - Store package ids look like "XP8C9QZMS2PC1T"
 */
export class MicrosoftStoreProvider implements IPackageProvider {
  private static readonly WINGET_COMMAND = 'winget';
  private static readonly SOURCE = 'msstore';
  private static readonly LIST_TIMEOUT_MS = 300000;
  private static availabilityCache: { at: number; value: ProviderAvailability } | null = null;

  readonly id: ProviderId = 'msstore';
  readonly displayName = 'Microsoft Store';
  /** msstore rides on the winget CLI, which self-elevates via the consent UI. */
  readonly requiresElevation = false;

  async checkAvailability(): Promise<ProviderAvailability> {
    const TTL_MS = 60000;
    if (
      MicrosoftStoreProvider.availabilityCache &&
      Date.now() - MicrosoftStoreProvider.availabilityCache.at < TTL_MS
    ) {
      return MicrosoftStoreProvider.availabilityCache.value;
    }
    let value: ProviderAvailability;
    try {
      const result = await CommandExecutor.execute(
        MicrosoftStoreProvider.WINGET_COMMAND,
        ['source', 'list'],
        { timeout: 30000 }
      );
      const hasMsStore = result.stdout
        .split(/\r?\n/)
        .some((line) => line.trim().toLowerCase().startsWith('msstore'));
      if (result.exitCode === 0 && hasMsStore) {
        value = { available: true };
      } else {
        value = {
          available: false,
          reason: 'The Microsoft Store source is not enabled (run: winget source enable msstore)',
        };
      }
    } catch {
      value = { available: false, reason: 'winget is not installed or not on PATH' };
    }
    MicrosoftStoreProvider.availabilityCache = { at: Date.now(), value };
    return value;
  }

  /** Fail-fast guard shared by every operation. */
  private async ensureAvailable(): Promise<void> {
    const availability = await this.checkAvailability();
    if (!availability.available) {
      throw new Error(availability.reason ?? 'Microsoft Store source is unavailable');
    }
  }

  async getInstalledApps(): Promise<InstalledApp[]> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      MicrosoftStoreProvider.WINGET_COMMAND,
      ['list', '--source', MicrosoftStoreProvider.SOURCE],
      { timeout: MicrosoftStoreProvider.LIST_TIMEOUT_MS }
    );
    return WingetTableParser.parseListNoSource(result, this.id).rows;
  }

  async getAvailableUpdates(): Promise<AvailableUpdate[]> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      MicrosoftStoreProvider.WINGET_COMMAND,
      ['upgrade', '--source', MicrosoftStoreProvider.SOURCE],
      { timeout: MicrosoftStoreProvider.LIST_TIMEOUT_MS }
    );
    return WingetTableParser.parseUpgradeNoSource(result, this.id).rows;
  }

  async showPackage(id: string): Promise<PackageDetails> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      MicrosoftStoreProvider.WINGET_COMMAND,
      ['show', '--id', id, '--source', MicrosoftStoreProvider.SOURCE],
      { timeout: 120000 }
    );
    return parseWingetShowOutput(id, result.stdout, this.id);
  }

  async searchPackages(query: string): Promise<InstalledApp[]> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      MicrosoftStoreProvider.WINGET_COMMAND,
      ['search', query, '--source', MicrosoftStoreProvider.SOURCE],
      { timeout: MicrosoftStoreProvider.LIST_TIMEOUT_MS }
    );
    // `--source` filtering may drop the Source column: try the 4-column
    // layout first, fall back to the 3-column layout.
    const withSource = WingetTableParser.parseListOutput(result).filter(
      (a) => a.source.toLowerCase().includes('store')
    );
    if (withSource.length > 0) {
      return withSource.map((a) => ({ ...a, source: this.id }));
    }
    return WingetTableParser.parseListNoSource(result, this.id).rows;
  }

  async upgradePackage(id: string, packageName?: string, opts?: { retryCount?: number }): Promise<UpgradeResult> {
    await this.ensureAvailable();
    const activeSame = updateQueueService.findActiveOperation('upgrade', id, this.id);
    if (activeSame) {
      const msg = `Update for ${packageName || id} is already in progress (Microsoft Store).`;
      updateQueueService.addLog(activeSame.id, {
        level: 'warn',
        message: `Duplicate msstore upgrade request ignored (${id})`,
      });
      return { success: false, output: '', error: msg, duplicate: true };
    }

    const operationId = updateQueueService.addOperation('upgrade', id, packageName, {
      retryCount: opts?.retryCount ?? 0,
      provider: this.id,
    });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, {
      level: 'info',
      message: `Starting Store update for ${packageName || id} (Microsoft Store)`,
    });

    try {
      const result = await CommandExecutor.executeStreaming(
        MicrosoftStoreProvider.WINGET_COMMAND,
        ['upgrade', '--id', id, '--source', MicrosoftStoreProvider.SOURCE, '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data),
          onStderr: (data) => this.handleStreamOutput(operationId, data),
        },
        { timeout: 600000 }
      );
      const parsed = WingetTableParser.parseUpgradeResult(result);
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'Store update completed successfully' });
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

  async upgradeAll(): Promise<UpgradeResult> {
    await this.ensureAvailable();
    const activeUpgradeAll = updateQueueService.findActiveOperation('upgrade-all', undefined, this.id);
    if (activeUpgradeAll) {
      updateQueueService.addLog(activeUpgradeAll.id, {
        level: 'warn',
        message: 'Duplicate msstore upgrade-all request ignored',
      });
      return {
        success: false,
        output: '',
        error: 'Microsoft Store all-apps update is already in progress.',
        duplicate: true,
      };
    }

    const operationId = updateQueueService.addOperation('upgrade-all', undefined, 'All Store Apps (Microsoft Store)', {
      provider: this.id,
    });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: 'Upgrading all Microsoft Store apps' });

    try {
      const result = await CommandExecutor.executeStreaming(
        MicrosoftStoreProvider.WINGET_COMMAND,
        ['upgrade', '--source', MicrosoftStoreProvider.SOURCE, '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data),
          onStderr: (data) => this.handleStreamOutput(operationId, data),
        },
        { timeout: 3600000 }
      );
      const parsed = WingetTableParser.parseUpgradeResult(result);
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'All Microsoft Store apps upgraded' });
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

  async installPackage(id: string, name?: string): Promise<UpgradeResult> {
    await this.ensureAvailable();
    return this.runStoreOp('install', id, name);
  }

  async uninstallPackage(id: string, name?: string): Promise<UpgradeResult> {
    await this.ensureAvailable();
    return this.runStoreOp('uninstall', id, name);
  }

  private async runStoreOp(op: 'install' | 'uninstall', id: string, name?: string): Promise<UpgradeResult> {
    const verb = op === 'install' ? 'Install' : 'Uninstall';
    const activeSame = updateQueueService.findActiveOperation(op, id, this.id);
    if (activeSame) {
      const msg = `${verb} for ${name || id} is already in progress (Microsoft Store).`;
      updateQueueService.addLog(activeSame.id, {
        level: 'warn',
        message: `Duplicate msstore ${op} request ignored (${id})`,
      });
      return { success: false, output: '', error: msg, duplicate: true };
    }

    const operationId = updateQueueService.addOperation(op, id, name, { provider: this.id });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: `${verb}ing ${name || id} (Microsoft Store)` });

    try {
      const result = await CommandExecutor.executeStreaming(
        MicrosoftStoreProvider.WINGET_COMMAND,
        [op, '--id', id, '--source', MicrosoftStoreProvider.SOURCE, '--accept-source-agreements'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data),
          onStderr: (data) => this.handleStreamOutput(operationId, data),
        },
        { timeout: 600000 }
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

  /** Stream handler: log lines + derive progress steps from winget verbs. */
  private handleStreamOutput(operationId: string, data: string): void {
    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      updateQueueService.addLog(operationId, { level: 'debug', message: line });
      const lower = line.toLowerCase();
      let step: string | null = null;
      let progress = 0;
      const bar = line.match(/Progress:\s*\[(?:-|\s)*([#x]+)[#x\-\s]*\]/i) || line.match(/([0-9]{1,3})\s*%/);
      if (bar) {
        step = lower.includes('install') || lower.includes('setup') ? 'installing' : 'downloading';
        progress =
          bar[1].endsWith('%') || /\d\s*%/.test(line)
            ? parseInt(bar[1], 10)
            : Math.min(90, Math.round((bar[1].length / 20) * 100));
      } else if (lower.includes('downloading')) {
        step = 'downloading';
        progress = 30;
      } else if (lower.includes('install') || lower.includes('setup')) {
        step = 'installing';
        progress = 60;
      } else if (lower.includes('finished') || lower.includes('success')) {
        step = 'verifying';
        progress = 85;
      }
      if (step) {
        updateQueueService.updateProgress(operationId, progress, step);
      }
    }
  }
}

/**
 * Parse `winget show` output (lines of the form "Key: value") into
 * PackageDetails. Unknown fields are ignored; missing fields stay empty.
 */
export function parseWingetShowOutput(id: string, stdout: string, source: ProviderId): PackageDetails {
  const details: PackageDetails = {
    name: id,
    id,
    publisher: '',
    version: '',
    description: '',
    homepage: '',
    license: '',
    source,
  };
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes(':')) continue;
    const idx = line.indexOf(':');
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (!value) continue;
    switch (key) {
      case 'name':
        details.name = value;
        break;
      case 'id':
        if (value) details.id = value;
        break;
      case 'publisher':
        details.publisher = value;
        break;
      case 'version':
        if (!details.version) details.version = value;
        break;
      case 'description':
        if (!details.description) details.description = value;
        break;
      case 'homepage':
        details.homepage = value;
        break;
      case 'license':
        details.license = value;
        break;
      case 'source':
        if (value) details.source = value.toLowerCase().includes('store') ? 'msstore' : details.source;
        break;
      default:
        break;
    }
  }
  return details;
}