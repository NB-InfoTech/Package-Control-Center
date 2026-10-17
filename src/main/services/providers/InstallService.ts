import { CommandExecutor, CommandResult } from '../CommandExecutor.js';
import { updateQueueService } from '../UpdateQueueService.js';
import { isAdministrator } from '../admin.js';
import type { ProviderId, ProviderInstallOutcome } from '../types.js';
import { getProvider } from './index.js';

/**
 * InstallService — automatically install the underlying package managers when a
 * provider is enabled in Settings and is not already available on the machine.
 *
 * This is the missing piece you identified: currently the user has to manually
 * run the Chocolatey / Winget installers themselves. Once this is wired up,
 * simply enabling a provider in Settings triggers the automatic install.
 */

/** Shared with the renderer contract (see ProviderInstallOutcome in types.ts). */
export type InstallOutcome = ProviderInstallOutcome;

export interface InstallRequest {
  providerId: ProviderId;
  /** How long (ms) to allow the installer to run before it is aborted. */
  timeoutMs?: number;
}

export interface InstallService {
  /** Install the tool behind providerId if it is not already present. */
  install(request: InstallRequest): Promise<InstallOutcome>;
}

/** Chocolatey bootstrap URL (official, from chocolatey.org). */
const CHOCOLATEY_BOOTSTRAP_URL =
  'https://community.chocolatey.org/install.ps1';

/** Timeout for a stalled installer (a few minutes each, plenty for a first run). */
const DEFAULT_INSTALL_TIMEOUT_MS = 600000;

/**
 * Drive the official Chocolatey installer using its official bootstrap script.
 *
 * The bootstrap creates C:\ProgramData\chocolatey, sets up PATH, and installs
 * the `choco` CLI. It is non-interactive (`-y`) and a no-op if Chocolatey is
 * already installed, so repeated calls are safe.
 */
async function installChocolatey(): Promise<{ success: boolean; output: string; error?: string }> {
  const PS1 = `
    $ErrorActionPreference = 'Stop'
    $url = '${CHOCOLATEY_BOOTSTRAP_URL}'
    try {
      $tmp = Join-Path $env:TEMP ([System.Guid]::NewGuid().ToString())
      Invoke-WebRequest -Uri $url -OutFile $tmp -UseBasicParsing
      & powershell -ExecutionPolicy Bypass -File $tmp
      Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: CommandResult) => {
      if (finished) return;
      finished = true;
      const success = result.exitCode === 0;
      resolve({
        success,
        output: result.stdout || result.stderr,
        error: success ? undefined : result.stderr || result.stdout,
      });
    };

    const child = CommandExecutor.executeStreaming(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', PS1],
      {
        onStdout: (data) => updateQueueService.addLog('chocolatey-install', { level: 'debug', message: data.trim() }),
        onStderr: (data) => updateQueueService.addLog('chocolatey-install', { level: 'debug', message: data.trim() }),
      },
      { timeout: DEFAULT_INSTALL_TIMEOUT_MS }
    );

    child.then(
      finish,
      (error) => {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        finish({ stdout: '', stderr: msg, exitCode: -1 });
      }
    );
  });
}

/**
 * Enable the Microsoft Store source in winget.
 *
 * Microsoft Store has no standalone CLI — it rides on winget with
 * `--source msstore`. Enabling the source makes it available for the
 * MicrosoftStoreProvider (availability-checked via `winget source list`).
 *
 * `winget source enable msstore` is safe to run repeatedly; it becomes a no-op
 * if the source is already enabled.
 */
async function enableMsStoreSource(): Promise<{ success: boolean; output: string; error?: string }> {
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: CommandResult) => {
      if (finished) return;
      finished = true;
      const success = result.exitCode === 0;
      resolve({
        success,
        output: result.stdout || result.stderr,
        error: success ? undefined : result.stderr || result.stdout,
      });
    };

    const child = CommandExecutor.executeStreaming(
      'winget',
      ['source', 'enable', 'msstore'],
      {
        onStdout: (data) => updateQueueService.addLog('msstore-install', { level: 'debug', message: data.trim() }),
        onStderr: (data) => updateQueueService.addLog('msstore-install', { level: 'debug', message: data.trim() }),
      },
      { timeout: DEFAULT_INSTALL_TIMEOUT_MS }
    );

    child.then(
      finish,
      (error) => {
        const msg = error instanceof Error ? error.message : 'Unknown error';
        finish({ stdout: '', stderr: msg, exitCode: -1 });
      }
    );
  });
}

function providerRequiresElevation(id: ProviderId): boolean {
  const provider = getProvider(id);
  return provider?.requiresElevation ?? false;
}

export class InstallServiceImpl implements InstallService {
  /**
   * In-flight installs per provider id. Guards against two triggers racing
   * (the startup sweep and a Settings toggle in the same second) — two
   * concurrent Chocolatey bootstraps would corrupt each other's install.
   */
  private readonly inFlight = new Map<ProviderId, Promise<InstallOutcome>>();

  install(request: InstallRequest): Promise<InstallOutcome> {
    const existing = this.inFlight.get(request.providerId);
    if (existing) return existing;
    const run = this.run(request).finally(() => {
      this.inFlight.delete(request.providerId);
    });
    this.inFlight.set(request.providerId, run);
    return run;
  }

  private async run(request: InstallRequest): Promise<InstallOutcome> {
    const { providerId } = request;

    // Idempotent: if already available, nothing to do (and we do NOT start an
    // install for a provider the user has explicitly left disabled).
    const availability = await getProvider(providerId)?.checkAvailability() ?? { available: true };
    if (availability.available) {
      updateQueueService.addLog(`install-${providerId}`, { level: 'info', message: `${getProvider(providerId)?.displayName} is already installed` });
      return 'already-available';
    }

    // Chocolatey requires elevation. Offer the existing UAC flow instead of
    // failing the enable toggle.
    if (providerRequiresElevation(providerId)) {
      const elevated = await isAdministrator();
      if (!elevated) {
        updateQueueService.addLog(`install-${providerId}`, {
          level: 'warn',
          message: `${getProvider(providerId)?.displayName} requires Administrator privileges to install. Re-launch Package Control Center as Administrator and re-enable it.`,
        });
        return 'needs-elevation';
      }
    }

    updateQueueService.addLog(`install-${providerId}`, {
      level: 'info',
      message: `Installing ${getProvider(providerId)?.displayName}...`,
    });

    try {
      if (providerId === 'chocolatey') {
        const result = await installChocolatey();
        if (result.success) {
          updateQueueService.addLog(`install-${providerId}`, {
            level: 'info',
            message: `${getProvider(providerId)?.displayName} installed successfully`,
          });
          return 'success';
        }
        updateQueueService.addLog(`install-${providerId}`, {
          level: 'error',
          message: `Chocolatey install failed: ${result.error ?? result.output}`,
        });
        return 'failed';
      }

      if (providerId === 'msstore') {
        const result = await enableMsStoreSource();
        if (result.success) {
          updateQueueService.addLog(`install-${providerId}`, {
            level: 'info',
            message: `Microsoft Store source enabled`,
          });
          return 'success';
        }
        updateQueueService.addLog(`install-${providerId}`, {
          level: 'error',
          message: `Microsoft Store source enable failed: ${result.error ?? result.output}`,
        });
        return 'failed';
      }

      // Winget (App Installer) and any future provider without a scriptable
      // bootstrap PCC can drive: report "not-requested" rather than a fake
      // failure — nothing was attempted.
      updateQueueService.addLog(`install-${providerId}`, {
        level: 'warn',
        message: `No automatic installer is available for ${getProvider(providerId)?.displayName ?? providerId}`,
      });
      return 'not-requested';
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      updateQueueService.addLog(`install-${providerId}`, { level: 'error', message: `Installer threw: ${msg}` });
      return 'failed';
    }
  }
}

export const installService = new InstallServiceImpl();

