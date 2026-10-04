import { CommandExecutor } from './CommandExecutor.js';
import { providerRegistry, PROVIDER_NAMES } from './providers/index.js';
import { configService } from './config/index.js';
import type { ProviderHealth, ProviderHealthStatus, ProviderId } from './types.js';

/**
 * Provider health + version reporting (PCC v2.2).
 *
 * The About page used to show a bare "Provider Count". This service answers
 * the question users actually ask: *is each package manager usable here, and
 * which version is installed?*
 *
 * Version detection is provider-specific:
 *  - Winget     -> `winget --version`
 *  - Chocolatey -> `choco --version`
 *  - Microsoft Store -> rides on the winget `msstore` source, which has no
 *    independent version string, so it reports "Provider Available".
 *
 * Every probe is isolated: one provider that throws never takes down the
 * report for the others (each becomes `Error` instead).
 */
export class ProviderHealthService {
  /** Milliseconds allowed for a single `--version` probe. */
  private static readonly PROBE_TIMEOUT_MS = 15000;

  /**
   * Health for every registered provider, in registry order.
   *
   * Status precedence:
   *   Disabled   -> switched off in PCC settings
   *   Unavailable-> enabled, but the package manager is not installed / the
   *                 source is not enabled
   *   Error      -> the probe threw (unexpected failure, not "not installed")
   *   Ready      -> enabled and usable
   */
  public static async getProviderHealth(): Promise<ProviderHealth[]> {
    const enabled = configService.getConfig().providers?.enabled ?? {};

    const results = await Promise.all(
      providerRegistry.map(async (provider): Promise<ProviderHealth> => {
        const base: ProviderHealth = {
          id: provider.id,
          name: PROVIDER_NAMES[provider.id] ?? provider.displayName,
          status: 'unavailable',
          version: undefined,
        };

        if (enabled[provider.id] === false) {
          return { ...base, status: 'disabled' };
        }

        try {
          const availability = await provider.checkAvailability();
          if (!availability.available) {
            return { ...base, status: 'unavailable' };
          }
          return {
            ...base,
            status: 'ready',
            version: ProviderHealthService.resolveVersion(
              provider.id,
              availability.version
            ),
          };
        } catch {
          return { ...base, status: 'error' };
        }
      })
    );

    return results;
  }

  /**
   * Version string shown on the About page.
   *
   * The Microsoft Store has no standalone CLI version (it is a winget source),
   * so a usable provider reports "Provider Available" instead.
   */
  private static resolveVersion(id: ProviderId, detected?: string): string {
    if (id === 'msstore') {
      return 'Provider Available';
    }
    const cleaned = detected?.trim().replace(/^v/i, '');
    return cleaned ? cleaned : 'Unknown';
  }

  /**
   * Version probe used when a caller wants the raw CLI version for a single
   * provider (Settings / diagnostics): `winget --version`, `choco --version`.
   * Returns null when the CLI is missing or errors.
   */
  public static async probeVersion(id: ProviderId): Promise<string | null> {
    const command = id === 'chocolatey' ? 'choco' : 'winget';
    if (id === 'msstore') {
      return 'Provider Available';
    }
    try {
      const result = await CommandExecutor.execute(command, ['--version'], {
        timeout: ProviderHealthService.PROBE_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) return null;
      return result.stdout.split('\n')[0]?.trim() || null;
    } catch {
      return null;
    }
  }

  /** Human-readable label for a health status (About page badges). */
  public static statusLabel(status: ProviderHealthStatus): string {
    switch (status) {
      case 'ready':
        return 'Ready';
      case 'unavailable':
        return 'Unavailable';
      case 'disabled':
        return 'Disabled';
      case 'error':
        return 'Error';
    }
  }
}

export const providerHealthService = ProviderHealthService;