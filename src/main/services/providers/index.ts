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
import { configService } from '../config/ConfigService.js';

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