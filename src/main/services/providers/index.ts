export {
  IUpdateProvider,
  IPackageProvider,
  InstalledApp,
  AvailableUpdate,
  PackageDetails,
  UpgradeResult,
  PinnedPackage,
  IgnoredPackage,
  LogEntry,
  ProgressStep,
  BackupPackage,
  BackupFile,
  RestoreStatus,
  RestorePreviewItem,
  RestoreOptions,
  RestoreResult,
  RestoreReport,
  CollectionPackage,
  Collection,
  CollectionExport,
  SnapshotPackage,
  SystemSnapshot,
  SnapshotComparisonResult,
  DriftSource,
  DriftItem,
  DriftReport,
  HealthStats,
} from './IUpdateProvider.js';
export { WingetProvider } from './WingetProvider.js';
export { ChocolateyProvider } from './ChocolateyProvider.js';
export { MicrosoftStoreProvider, parseWingetShowOutput } from './MicrosoftStoreProvider.js';
export type { ProviderId, ProviderInfo, ProviderAvailability } from '../types.js';

import { WingetProvider } from './WingetProvider.js';
import { ChocolateyProvider } from './ChocolateyProvider.js';
import { MicrosoftStoreProvider } from './MicrosoftStoreProvider.js';
import type { IPackageProvider, InstalledApp, AvailableUpdate } from './IUpdateProvider.js';
import type { ProviderId, ProviderInfo } from '../types.js';
import type { InstallOutcome } from './InstallService.js';
import { installService } from './InstallService.js';
import { configService } from '../config/ConfigService.js';
import { logger } from '../logging/index.js';

/**
 * PCC v2.1 multi-source registry.
 *
 * The registry is the single place where providers are registered and
 * where "which providers are active right now" is answered. UI/IPC code
 * never instantiates providers directly — it asks the registry.
 */

export const wingetProvider = new WingetProvider();
export const chocolateyProvider = new ChocolateyProvider();
export const microsoftStoreProvider = new MicrosoftStoreProvider();

export const providerRegistry: readonly IPackageProvider[] = [
  wingetProvider,
  chocolateyProvider,
  microsoftStoreProvider,
];

export const PROVIDER_NAMES: Record<ProviderId, string> = {
  winget: 'Winget',
  chocolatey: 'Chocolatey',
  msstore: 'Microsoft Store',
};

/** Look up a provider by id (case-insensitive, display names tolerated). */
export function getProvider(id: string | ProviderId | undefined | null): IPackageProvider | undefined {
  if (!id) return undefined;
  const normalized = id.toLowerCase();
  return providerRegistry.find(
    (p) => p.id === normalized || p.displayName.toLowerCase() === normalized
  );
}

/** Providers enabled in settings (regardless of availability). */
export function getEnabledProviders(): IPackageProvider[] {
  const enabled = configService.getConfig().providers?.enabled ?? {};
  return providerRegistry.filter((p) => enabled[p.id] !== false);
}

/**
 * Providers that are BOTH enabled in settings AND available on this
 * machine. Individual availability failures are tolerated — one broken
 * provider never takes the others down.
 */
export async function getActiveProviders(): Promise<IPackageProvider[]> {
  const enabled = getEnabledProviders();
  const results = await Promise.all(
    enabled.map(async (p) => {
      try {
        const availability = await p.checkAvailability();
        return availability.available ? p : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter((p): p is IPackageProvider => p !== null);
}

/**
 * Aggregated installed apps across all active providers, each row tagged
 * with its owning provider. Used by the Installed page, dashboard,
 * snapshots and drift detection.
 */
export async function collectInstalledApps(): Promise<InstalledApp[]> {
  const providers = await getActiveProviders();
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        return (await p.getInstalledApps()).map((a) => ({ ...a, source: p.id }));
      } catch {
        return [] as InstalledApp[];
      }
    })
  );
  return results.flat();
}

/**
 * Aggregated available updates across all active providers, each row
 * tagged with its owning provider. Used by the Available Updates page
 * and dashboard.
 */
export async function collectAvailableUpdates(): Promise<AvailableUpdate[]> {
  const providers = await getActiveProviders();
  const results = await Promise.all(
    providers.map(async (p) => {
      try {
        return await p.getAvailableUpdates();
      } catch {
        return [] as AvailableUpdate[];
      }
    })
  );
  return results.flat();
}

/**
 * Resolve which provider should handle a package id when the caller did
 * not specify one. The id is looked up in each active provider's update
 * list; registry order wins on ties (winget first = legacy default).
 */
export async function resolveProviderForPackage(id: string): Promise<IPackageProvider | undefined> {
  const providers = await getActiveProviders();
  for (const p of providers) {
    try {
      const updates = await p.getAvailableUpdates();
      if (updates.some((u) => u.id === id)) return p;
    } catch {
      // keep looking
    }
  }
  return undefined;
}

/** One ProviderInfo per registered provider (for Settings / dashboard). */
export async function getProviderInfos(): Promise<ProviderInfo[]> {
  const enabled = configService.getConfig().providers?.enabled ?? {};
  const results = await Promise.all(
    providerRegistry.map(async (p) => {
      let available = false;
      let version: string | undefined;
      let reason: string | undefined;
      try {
        const availability = await p.checkAvailability();
        available = availability.available;
        version = availability.version;
        reason = availability.reason;
      } catch {
        reason = 'Availability check failed';
      }
      return {
        id: p.id,
        name: p.displayName,
        enabled: enabled[p.id] !== false,
        available,
        version,
        reason,
        requiresElevation: p.requiresElevation,
      };
    })
  );
  return results;
}


/**
 * Auto-install the package manager behind `providerId` — but only when the
 * provider is enabled in Settings and not yet available on this machine.
 *
 * This is the piece that turns "Enable" in Settings into a real install
 * instead of leaving the user to run the Chocolatey / Microsoft Store
 * bootstrappers by hand. Never throws: problems come back as an
 * InstallOutcome so the IPC caller can show honest feedback in the UI.
 */
export async function installProviderIfUnavailable(
  providerId: string | ProviderId
): Promise<InstallOutcome> {
  const provider = getProvider(providerId);
  if (!provider) return 'not-requested';

  // Never start an install for a provider the user has explicitly disabled.
  const enabled = configService.getConfig().providers?.enabled ?? {};
  if (enabled[provider.id] === false) return 'not-requested';

  try {
    const availability = await provider.checkAvailability();
    if (availability.available) return 'already-available';
  } catch (error) {
    // A broken availability probe must not block the install attempt below —
    // the installer itself will report a definitive result.
    logger.warn('Provider availability check failed before install', {
      provider: provider.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return installService.install({ providerId: provider.id });
}

/**
 * One-shot sweep: install every enabled provider whose package manager is
 * still missing. Runs once at module load (startup) so a provider that
 * needed elevation or failed mid-install last run finishes on the next
 * launch, and is also driven per-provider from the `providers:setEnabled`
 * IPC handler when the user flips a toggle in Settings.
 * Sequential on purpose — installers compete badly for the machine.
 */
export async function autoInstallNewlyEnabledProviders(): Promise<void> {
  for (const provider of getEnabledProviders()) {
    try {
      await installProviderIfUnavailable(provider.id);
    } catch (error) {
      logger.warn('Provider auto-install sweep failed', {
        provider: provider.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

// Kick off one-shot auto-install of any newly-enabled-but-not-yet-installed
// provider immediately on module load. This is what makes "Enable" in Settings
// actually install the package manager rather than leaving the user to run the
// installers by hand. Errors are logged inside installService and never
// propagated here - one broken installer must never take the registry down.
void autoInstallNewlyEnabledProviders().catch(() => {
  /* The sweep logs its own failures; a startup install must never crash the registry module. */
});
