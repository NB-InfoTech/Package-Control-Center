import { CommandExecutor, CommandResult } from '../CommandExecutor.js';
import { updateQueueService } from '../UpdateQueueService.js';
import type {
  IPackageProvider,
  InstalledApp,
  AvailableUpdate,
  PackageDetails,
  UpgradeResult,
  ProgressStep,
} from './IUpdateProvider.js';
import type { ProviderId, ProviderAvailability } from '../types.js';

/**
 * Chocolatey provider (PCC v2.1 multi-source).
 *
 * Targets Chocolatey 2.x CLI (verified against 2.7.3):
 *  - `choco list`        -> "name version" lines + "N Packages." footer
 *                           (note: `-localonly` was REMOVED in 2.x; a plain
 *                            `list` already returns installed packages)
 *  - `choco outdated`    -> pipe-delimited "id|version|available|pinned"
 *  - `choco info <id>`   -> "Title: ..." / "Summary: ..." / "Software Site:"
 *  - `choco search <q>`  -> "id version [Approved]" lines
 *  - `choco upgrade <id> -y` / `choco upgrade all -y`
 *  - `choco install <id> -y` / `choco uninstall <id> -y`
 *
 * Availability: detected with `choco --version`. When Chocolatey is not
 * installed the provider reports itself unavailable and every operation
 * fails fast with a clear reason — no crashes, no half-built output.
 */
export class ChocolateyProvider implements IPackageProvider {
  private static readonly CHOCO_COMMAND = 'choco';
  private static readonly LIST_TIMEOUT_MS = 300000;
  private static availabilityCache: { at: number; value: ProviderAvailability } | null = null;

  readonly id: ProviderId = 'chocolatey';
  readonly displayName = 'Chocolatey';
  /**
   * Chocolatey writes to machine-wide locations (C:\ProgramData\chocolatey)
   * and cannot self-elevate — PCC must run elevated for install/upgrade/
   * uninstall. The UI detects this via `requiresElevation` and offers a
   * "Restart as Administrator" flow when the app is not elevated.
   */
  readonly requiresElevation = true;
  /**
   * choco asks "Do you want to continue?" when run from a non-elevated
   * shell — and `-y` does NOT suppress that question (verified on 2.7.3:
   * the command stalls 20 s waiting for input). Pre-answering "y" on
   * stdin makes every mutating call non-interactive (verified: 23 s → 2 s).
   */
  private static readonly NON_INTERACTIVE_STDIN = 'y\r\n';

  async checkAvailability(): Promise<ProviderAvailability> {
    const TTL_MS = 60000;
    if (ChocolateyProvider.availabilityCache && Date.now() - ChocolateyProvider.availabilityCache.at < TTL_MS) {
      return ChocolateyProvider.availabilityCache.value;
    }
    let value: ProviderAvailability;
    try {
      const result = await CommandExecutor.execute(ChocolateyProvider.CHOCO_COMMAND, ['--version'], { timeout: 15000 });
      if (result.exitCode === 0) {
        value = { available: true, version: result.stdout.split('\n')[0]?.trim() || undefined };
      } else {
        value = { available: false, reason: 'Chocolatey responded with an error' };
      }
    } catch {
      value = { available: false, reason: 'Chocolatey is not installed (choco not found on PATH)' };
    }
    ChocolateyProvider.availabilityCache = { at: Date.now(), value };
    return value;
  }

  /** Fail-fast guard shared by every operation. */
  private async ensureAvailable(): Promise<void> {
    const availability = await this.checkAvailability();
    if (!availability.available) {
      throw new Error(availability.reason ?? 'Chocolatey is unavailable');
    }
  }

  async getInstalledApps(): Promise<InstalledApp[]> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      ChocolateyProvider.CHOCO_COMMAND,
      ['list'],
      { timeout: ChocolateyProvider.LIST_TIMEOUT_MS }
    );
    return parseChocoListOutput(result.stdout);
  }

  async getAvailableUpdates(): Promise<AvailableUpdate[]> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      ChocolateyProvider.CHOCO_COMMAND,
      ['outdated', '--local-only'],
      { timeout: ChocolateyProvider.LIST_TIMEOUT_MS }
    );
    return parseChocoOutdatedOutput(result.stdout).map((row) => ({
      name: row.id,
      id: row.id,
      currentVersion: row.version,
      availableVersion: row.available,
      source: 'chocolatey' as const,
    }));
  }

  async showPackage(id: string): Promise<PackageDetails> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      ChocolateyProvider.CHOCO_COMMAND,
      ['info', id],
      { timeout: 120000 }
    );
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || `choco info ${id} failed`);
    }
    return parseChocoInfoOutput(id, result.stdout);
  }

  async searchPackages(query: string): Promise<InstalledApp[]> {
    await this.ensureAvailable();
    const result = await CommandExecutor.execute(
      ChocolateyProvider.CHOCO_COMMAND,
      ['search', query],
      { timeout: ChocolateyProvider.LIST_TIMEOUT_MS }
    );
    const apps: InstalledApp[] = [];
    for (const raw of result.stdout.split(/\r?\n/)) {
      const line = raw.trim();
      const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s+([0-9][0-9A-Za-z.\-+]*)\s+\[Approved\]/);
      if (m) {
        apps.push({ name: m[1], id: m[1], version: m[2], source: this.id });
      }
    }
    return apps;
  }

  async upgradePackage(id: string, packageName?: string, opts?: { retryCount?: number }): Promise<UpgradeResult> {
    await this.ensureAvailable();
    // One package = one active choco upgrade (mirrors the winget P2 guard).
    const activeSame = updateQueueService.findActiveOperation('upgrade', id, this.id);
    if (activeSame) {
      const msg = `Update for ${packageName || id} is already in progress (Chocolatey).`;
      updateQueueService.addLog(activeSame.id, {
        level: 'warn',
        message: `Duplicate choco upgrade request ignored (${id})`,
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
      message: `Starting upgrade for ${packageName || id} (Chocolatey)`,
    });

    try {
      const result = await CommandExecutor.executeStreaming(
        ChocolateyProvider.CHOCO_COMMAND,
        ['upgrade', id, '-y', '--no-progress'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data),
          onStderr: (data) => this.handleStreamOutput(operationId, data),
        },
        { timeout: 600000, stdinData: ChocolateyProvider.NON_INTERACTIVE_STDIN }
      );
      const parsed = this.withFriendlyChocoError(parseChocoCommandResult(result));
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'Upgrade completed successfully' });
        updateQueueService.updateProgress(operationId, 100, 'completed');
      } else {
        updateQueueService.updateStatus(operationId, 'failed');
        updateQueueService.addLog(operationId, { level: 'error', message: parsed.error || parsed.output });
      }
      return parsed;
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg = translateChocoError(rawMsg) ?? rawMsg;
      updateQueueService.updateStatus(operationId, 'failed');
      updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      if (errorMsg !== rawMsg) throw new Error(errorMsg);
      throw error;
    }
  }

  async upgradeAll(): Promise<UpgradeResult> {
    await this.ensureAvailable();
    const activeUpgradeAll = updateQueueService.findActiveOperation('upgrade-all', undefined, this.id);
    if (activeUpgradeAll) {
      updateQueueService.addLog(activeUpgradeAll.id, {
        level: 'warn',
        message: 'Duplicate choco upgrade-all request ignored',
      });
      return { success: false, output: '', error: 'Chocolatey all-packages update is already in progress.', duplicate: true };
    }

    const operationId = updateQueueService.addOperation('upgrade-all', undefined, 'All Packages (Chocolatey)', {
      provider: this.id,
    });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: 'Upgrading all Chocolatey packages' });

    try {
      const result = await CommandExecutor.executeStreaming(
        ChocolateyProvider.CHOCO_COMMAND,
        ['upgrade', 'all', '-y', '--no-progress'],
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data),
          onStderr: (data) => this.handleStreamOutput(operationId, data),
        },
        { timeout: 3600000, stdinData: ChocolateyProvider.NON_INTERACTIVE_STDIN }
      );
      const parsed = this.withFriendlyChocoError(parseChocoCommandResult(result));
      if (parsed.success) {
        updateQueueService.updateStatus(operationId, 'success');
        updateQueueService.addLog(operationId, { level: 'info', message: 'All Chocolatey packages upgraded' });
        updateQueueService.updateProgress(operationId, 100, 'completed');
      } else {
        updateQueueService.updateStatus(operationId, 'failed');
        updateQueueService.addLog(operationId, { level: 'error', message: parsed.error || parsed.output });
      }
      return parsed;
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg = translateChocoError(rawMsg) ?? rawMsg;
      updateQueueService.updateStatus(operationId, 'failed');
      updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      if (errorMsg !== rawMsg) throw new Error(errorMsg);
      throw error;
    }
  }

  async installPackage(id: string, name?: string): Promise<UpgradeResult> {
    await this.ensureAvailable();
    return this.runChocoOp('install', ['install', id, '-y', '--no-progress'], id, name);
  }

  async uninstallPackage(id: string, name?: string): Promise<UpgradeResult> {
    await this.ensureAvailable();
    return this.runChocoOp('uninstall', ['uninstall', id, '-y', '--no-progress'], id, name);
  }

  private async runChocoOp(
    op: 'install' | 'uninstall',
    args: string[],
    id: string,
    name?: string
  ): Promise<UpgradeResult> {
    const verb = op === 'install' ? 'Install' : 'Uninstall';
    const activeSame = updateQueueService.findActiveOperation(op, id, this.id);
    if (activeSame) {
      const msg = `${verb} for ${name || id} is already in progress (Chocolatey).`;
      updateQueueService.addLog(activeSame.id, {
        level: 'warn',
        message: `Duplicate choco ${op} request ignored (${id})`,
      });
      return { success: false, output: '', error: msg, duplicate: true };
    }

    const operationId = updateQueueService.addOperation(op, id, name, { provider: this.id });
    updateQueueService.updateStatus(operationId, 'running');
    updateQueueService.addLog(operationId, { level: 'info', message: `${verb}ing ${name || id} (Chocolatey)` });

    try {
      const result = await CommandExecutor.executeStreaming(
        ChocolateyProvider.CHOCO_COMMAND,
        args,
        {
          onStdout: (data) => this.handleStreamOutput(operationId, data),
          onStderr: (data) => this.handleStreamOutput(operationId, data),
        },
        { timeout: 600000, stdinData: ChocolateyProvider.NON_INTERACTIVE_STDIN }
      );
      const parsed = this.withFriendlyChocoError(parseChocoCommandResult(result));
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
      const rawMsg = error instanceof Error ? error.message : 'Unknown error';
      const errorMsg = translateChocoError(rawMsg) ?? rawMsg;
      updateQueueService.updateStatus(operationId, 'failed');
      updateQueueService.addLog(operationId, { level: 'error', message: errorMsg });
      if (errorMsg !== rawMsg) throw new Error(errorMsg);
      throw error;
    }
  }

  /**
   * Stream handler: forward lines to the queue log and derive progress
   * steps from choco's well-known verbs (downloading / installing / ...).
   */
  private handleStreamOutput(operationId: string, data: string): void {
    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      updateQueueService.addLog(operationId, { level: 'debug', message: line });
      const step = extractChocoStep(line);
      if (step) {
        updateQueueService.updateProgress(operationId, chocoStepToProgress(step), step);
      }
    }
  }

  /**
   * Elevation error mapping (elevation fix): when a mutating command fails,
   * translate raw access/admin failures into the friendly
   * "Administrator privileges are required." message. Successful results
   * pass through untouched.
   */
  private withFriendlyChocoError(result: UpgradeResult): UpgradeResult {
    if (result.success) return result;
    const friendly = translateChocoError(`${result.output ?? ''} ${result.error ?? ''}`);
    if (!friendly) return result;
    return { ...result, error: friendly };
  }
}

// ---------------------------------------------------------------------------
// Output parsers (choco 2.x text formats)
// ---------------------------------------------------------------------------

const CHOCO_HEADER_RE = /^chocolatey v/i;
const CHOCO_LIST_FOOTER_RE = /^\d+\s+Packages?\.?$/i;
const CHOCO_LIST_LINE_RE = /^([A-Za-z0-9][A-Za-z0-9._-]*)\s+([0-9][0-9A-Za-z.\-+]*)$/;

/** `choco list` -> installed apps. */
export function parseChocoListOutput(stdout: string): InstalledApp[] {
  const apps: InstalledApp[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || CHOCO_HEADER_RE.test(line) || CHOCO_LIST_FOOTER_RE.test(line)) continue;
    const m = line.match(CHOCO_LIST_LINE_RE);
    if (m) {
      apps.push({ name: m[1], id: m[1], version: m[2], source: 'chocolatey' });
    }
  }
  return apps;
}

/** `choco outdated` -> pipe-delimited "id|version|available|pinned". */
export function parseChocoOutdatedOutput(
  stdout: string
): { id: string; version: string; available: string; pinned: boolean }[] {
  const rows: { id: string; version: string; available: string; pinned: boolean }[] = [];
  const versionLike = (v: string) => /^[0-9][0-9A-Za-z.\-+]*$/.test(v);
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || !line.includes('|')) continue;
    const parts = line.split('|').map((p) => p.trim());
    // Strict shape: exactly id|version|available|pinned, versions look numeric.
    // This rejects the header row "Output is Id | Version | Available Version | Pinned".
    if (parts.length !== 4) continue;
    const [id, version, available, pinned] = parts;
    if (!id || !versionLike(version) || !versionLike(available)) continue;
    if (pinned === 'true') continue; // pinned packages are excluded from updates
    rows.push({ id, version, available, pinned: pinned === 'true' });
  }
  return rows;
}

/** `choco info <id>` -> package details. */
export function parseChocoInfoOutput(id: string, stdout: string): PackageDetails {
  const details: PackageDetails = {
    name: id,
    id,
    publisher: '',
    version: '',
    description: '',
    homepage: '',
    license: '',
    source: 'chocolatey',
  };
  let sawHeader = false;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (CHOCO_HEADER_RE.test(line)) {
      sawHeader = true;
      continue;
    }
    // First content line after the header: "chocolatey 2.7.4 [Approved]"
    if (sawHeader && !details.version) {
      const m = line.match(/^([A-Za-z0-9][A-Za-z0-9._-]*)\s+([0-9][0-9A-Za-z.\-+]*)/);
      if (m) {
        details.version = m[2];
      }
      continue;
    }
    if (line.startsWith('Title:')) {
      details.name = line.slice(6).trim().split('|')[0].trim();
    } else if (line.startsWith('Summary:')) {
      details.description = line.slice(8).trim();
    } else if (line.startsWith('Software Site:')) {
      details.homepage = line.slice(14).trim();
    } else if (line.startsWith('Software License:')) {
      details.license = line.slice(17).trim();
    } else if (line.startsWith('Description:') && !details.description) {
      details.description = line.slice(12).trim();
    }
  }
  return details;
}

/** Any choco mutating command -> success from exit code. */
export function parseChocoCommandResult(result: CommandResult): UpgradeResult {
  const success = result.exitCode === 0;
  const output = result.stdout || result.stderr;
  return {
    success,
    output,
    error: success ? undefined : result.stderr || result.stdout,
  };
}

/**
 * Chocolatey elevation error mapping (elevation fix).
 *
 * When a mutating command fails while PCC is not running elevated, choco
 * reports raw access failures ("Access to the path 'C:\ProgramData\chocolatey\...'
 * is denied", "UnauthorizedAccessException", "Admin rights required").
 * This maps all of those — plus the spawn-level equivalents (EACCES /
 * "Permission denied") — to ONE friendly, actionable message so the UI can
 * prompt the user to restart PCC as Administrator.
 */
const CHOCO_ADMIN_ERROR_RES: RegExp[] = [
  /access to the path[^\r\n]*is denied/i,
  /access denied/i,
  /unauthorizedaccessexception/i,
  /admin(istrator)? rights? are required/i,
  /admin(istrator)? rights? required/i,
  /you must (be|run)( an? )?admin/i,
  /not running from an elevated/i,
  /from an (elevated|admin(istrator)?) (prompt|terminal|command|shell)/i,
  /elevation is required/i,
  /needs? elevation/i,
  /run this (command|application|program) as admin/i,
  /\beacces\b/i,
  /permission denied/i,
];

export function translateChocoError(output: string): string | undefined {
  if (!output) return undefined;
  for (const re of CHOCO_ADMIN_ERROR_RES) {
    if (re.test(output)) {
      return 'Administrator privileges are required. Please restart Package Control Center as Administrator and try again.';
    }
  }
  return undefined;
}

export function extractChocoStep(line: string): ProgressStep | null {
  const lower = line.toLowerCase();
  if (lower.includes('downloading')) return 'downloading';
  if (lower.includes('uninstalling')) return 'installing';
  if (lower.includes('installing')) return 'installing';
  if (lower.includes('finished') || lower.includes('success')) return 'verifying';
  return null;
}

export function chocoStepToProgress(step: ProgressStep): number {
  switch (step) {
    case 'preparing':
      return 10;
    case 'downloading':
      return 30;
    case 'installing':
      return 60;
    case 'verifying':
      return 85;
    case 'completed':
      return 100;
  }
  const _exhaustive: never = step;
  return 0;
}