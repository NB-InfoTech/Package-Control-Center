// PCC v2.1 multi-source: provider identity (mirrors src/main/services/types.ts).
export type ProviderId = 'winget' | 'chocolatey' | 'msstore';

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  enabled: boolean;
  available: boolean;
  version?: string;
  reason?: string;
  /**
   * Chocolatey elevation fix: true when install/upgrade/uninstall through
   * this provider require PCC itself to run as Administrator.
   */
  requiresElevation: boolean;
}

/** Human-friendly label for any source value (PCC v2.1 multi-source UI). */
export function providerLabel(source?: string | null): string {
  const s = (source ?? '').toLowerCase();
  if (s.includes('store')) return 'Microsoft Store';
  if (s === 'chocolatey' || s === 'choco') return 'Chocolatey';
  if (s === 'winget') return 'Winget';
  return source || 'Unknown';
}

/**
 * Provider health + installed version (mirrors src/main/services/types.ts).
 * Shown as cards on the About page: Provider / Status / Version.
 */
export type ProviderHealthStatus = 'ready' | 'unavailable' | 'disabled' | 'error';

export interface ProviderHealth {
  id: ProviderId;
  name: string;
  /** ready / unavailable / disabled / error. */
  status: ProviderHealthStatus;
  /** `winget --version`, `choco --version`, or "Provider Available" for Store. */
  version?: string;
}

export interface InstalledApp {
  name: string;
  id: string;
  version: string;
  source: string;
}

export interface AvailableUpdate {
  name: string;
  id: string;
  currentVersion: string;
  availableVersion: string;
  /** Provider that owns this package (PCC v2.1 multi-source). */
  source: ProviderId;
}

export interface UpgradeResult {
  success: boolean;
  output: string;
  error?: string;
  /** True when the request was rejected because an update for the same package is already active. */
  duplicate?: boolean;
  /** True when the failure was caused by the application being in use (0x80070020). */
  inUse?: boolean;
  /** Processes detected as holding the package's files. */
  blockers?: string[];
}

export interface PackageDetails {
  name: string;
  id: string;
  publisher: string;
  version: string;
  description: string;
  homepage: string;
  license: string;
  source: string;
}

export interface PinnedPackage {
  name: string;
  id: string;
  pinType: 'version' | 'block';
  pinnedVersion?: string;
}

export interface IgnoredPackage {
  id: string;
  name: string;
  ignoredAt: string;
}

export interface LogEntry {
  id: string;
  timestamp: Date;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  operationId?: string;
}

export type QueueItemStatus = 'pending' | 'running' | 'success' | 'failed';

/**
 * Bulk (upgrade-all) operation metadata: batch snapshot taken before the
 * bulk command starts + summary computed afterwards (post-scan diff).
 */
export interface BulkUpdateMeta {
  total: number;
  packages: { id: string; name: string }[];
  summary?: { succeeded: string[]; failed: string[] };
}

export interface QueueItem {
  id: string;
  operationType: 'upgrade' | 'upgrade-all' | 'install' | 'uninstall' | 'restore' | 'collection-install';
  packageId?: string;
  packageName?: string;
  /** Provider that owns the operation (PCC v2.1 multi-source). */
  provider?: ProviderId;
  status: QueueItemStatus;
  progress: number;
  currentStep: string;
  logs: LogEntry[];
  error?: string;
  /** Raw error text (kept separate from the user-friendly `error`). */
  errorDetail?: string;
  /** Number of explicit user retries already performed for this attempt chain. */
  retryCount?: number;
  /** Processes detected as holding the package's files (0x80070020). */
  inUseProcesses?: string[];
  /** Batch snapshot + result summary for `upgrade-all` operations. */
  bulkMeta?: BulkUpdateMeta;
  startedAt?: Date;
  completedAt?: Date;
}

export type ProgressStep = 'preparing' | 'downloading' | 'installing' | 'verifying' | 'completed';

export interface ProgressEvent {
  operationId: string;
  step: ProgressStep;
  progress: number;
  message: string;
}

// Process guard types (application-in-use detection, 0x80070020)
export interface ProcessTarget {
  name: string;
  kind: 'process' | 'service';
  running: boolean;
}

export interface ProcessTerminateRequest {
  processes: string[];
  services?: string[];
  retryItemId?: string;
}

export interface ProcessTerminateResult {
  results: { name: string; kind: string; success: boolean }[];
  retriedOperationId?: string;
}

export interface DashboardStats {
  installedAppsCount: number;
  availableUpdatesCount: number;
  lastRefresh: Date | null;
}

export type PageType = 'dashboard' | 'installed' | 'updates' | 'pinned' | 'ignored' | 'settings' | 'migration' | 'collections' | 'snapshots' | 'drift';

// Restore types
export interface BackupPackage {
  name: string;
  id: string;
  version: string;
  source: string;
}

export interface BackupFile {
  exportedAt: string;
  totalPackages: number;
  packages: BackupPackage[];
}

export type RestoreStatus = 'already-installed' | 'install-available' | 'missing-package';

export interface RestorePreviewItem {
  name: string;
  id: string;
  version: string;
  source: string;
  status: RestoreStatus;
  installedVersion?: string;
  availableVersion?: string;
}

export interface RestoreOptions {
  packageIds: string[];
  source?: string;
  acceptSourceAgreements?: boolean;
}

export interface RestoreResult {
  success: boolean;
  packageId: string;
  packageName: string;
  output: string;
  error?: string;
}

export interface RestoreReport {
  generatedAt: string;
  totalRequested: number;
  success: number;
  failed: number;
  skipped: number;
  results: RestoreResult[];
}

// Collection types
export interface CollectionPackage {
  id: string;
  name?: string;
  version?: string;
  source?: string;
  /** Provider that owns the package (PCC v2.1 multi-source). */
  provider?: ProviderId;
}

export interface Collection {
  id: string;
  name: string;
  description?: string;
  isBuiltIn: boolean;
  createdAt: string;
  updatedAt: string;
  packages: CollectionPackage[];
}

export interface CollectionExport {
  version: string;
  exportedAt: string;
  collection: Collection;
}

// Snapshot types
export interface SnapshotPackage {
  name: string;
  id: string;
  version: string;
  source: string;
}

export interface SystemSnapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  totalPackages: number;
  packages: SnapshotPackage[];
}

export interface SnapshotComparisonResult {
  added: SnapshotPackage[];
  removed: SnapshotPackage[];
  versionChanged: {
    id: string;
    name: string;
    oldVersion: string;
    newVersion: string;
  }[];
  unchanged: number;
}

// Drift detection types
export type DriftSource = 'snapshot' | 'backup' | 'collection';

export interface DriftItem {
  id: string;
  name: string;
  type: 'added' | 'removed' | 'version-changed' | 'source-changed';
  current?: { version: string; source: string };
  expected?: { version: string; source: string };
}

export interface DriftReport {
  generatedAt: string;
  sourceType: DriftSource;
  sourceId: string;
  sourceName: string;
  totalDrifts: number;
  drifts: DriftItem[];
}

// Health dashboard types
export interface HealthStats {
  ignoredPackagesCount: number;
  pinnedPackagesCount: number;
  lastBackup: string | null;
  lastRestore: string | null;
  snapshotCount: number;
}

/**
 * Live application/system information for the About page (mirrors
 * src/main/services/types.ts). Resolved in the main process — the UI
 * never hardcodes these values.
 */
export interface AppInfo {
  name: string;
  version: string;
  /** ISO timestamp taken from the newest build artifact on disk. */
  buildDate: string;
  /** Auto-detected CPU architecture: x64 / ARM64 / x86. */
  architecture: string;
  /** Auto-detected platform name, e.g. "Windows". */
  platform: string;
  electronVersion: string;
  nodeVersion: string;
  chromeVersion: string;
  dataDirectory: string;
  packaged: boolean;
}

// Theme selection persisted via ConfigService (theme.mode).
// Only two themes are supported: dark and light. Legacy 'system' values
// stored by older builds resolve to dark everywhere they are read.
export type ThemeMode = 'light' | 'dark';