// Multi-source package management (PCC v2.1): package providers.
// A ProviderId identifies which package manager owns a package/source.
export type ProviderId = 'winget' | 'chocolatey' | 'msstore';

export interface ProviderAvailability {
  available: boolean;
  version?: string;
  /** Why the provider is unavailable (e.g. "Chocolatey is not installed"). */
  reason?: string;
}

export interface ProviderInfo {
  id: ProviderId;
  name: string;
  enabled: boolean;
  available: boolean;
  version?: string;
  reason?: string;
  /**
   * Chocolatey elevation fix: true when mutating operations (install /
   * upgrade / uninstall) require the PCC process itself to run elevated.
   * The UI shows a "Restart as Administrator" dialog for these providers
   * when the app is not running as admin.
   */
  requiresElevation: boolean;
}

/**
 * Provider health + installed version (PCC v2.2).
 *
 * Replaces the bare "Provider Count" on the About page: every provider now
 * reports whether it is usable and which version is installed.
 */
export type ProviderHealthStatus = 'ready' | 'unavailable' | 'disabled' | 'error';

export interface ProviderHealth {
  /** Provider identity (winget / chocolatey / msstore). */
  id: ProviderId;
  /** Display name, e.g. "Microsoft Store". */
  name: string;
  /**
   *  - `ready`       enabled in settings and usable on this machine
   *  - `unavailable` enabled, but the package manager / source is missing
   *  - `disabled`    switched off in PCC settings
   *  - `error`       the health probe failed unexpectedly
   */
  status: ProviderHealthStatus;
  /**
   * Detected version (`winget --version`, `choco --version`), or
   * "Provider Available" for the Microsoft Store, which has no standalone CLI.
   */
  version?: string;
}

/**
 * Outcome of the automatic package-manager install triggered when a provider
 * is enabled in Settings (PCC auto-install):
 *  - `success`           the installer ran to completion successfully
 *  - `failed`            the installer ran and reported an error
 *  - `needs-elevation`   the tool requires Administrator rights (Chocolatey)
 *                        and PCC is not elevated — the renderer offers the
 *                        UAC relaunch flow
 *  - `already-available` nothing to install, the tool is already present
 *  - `not-requested`     provider unknown or disabled in settings, or no
 *                        scriptable installer exists (winget)
 */
export type ProviderInstallOutcome =
  | 'success'
  | 'failed'
  | 'needs-elevation'
  | 'already-available'
  | 'not-requested';

/** Result of the `providers:setEnabled` IPC call (PCC auto-install). */
export interface ProviderSetEnabledResult {
  /** True when the enabled/disabled flag was persisted successfully. */
  ok: boolean;
  /** Present when `autoInstall` was requested — what the installer reported. */
  installOutcome?: ProviderInstallOutcome;
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

export interface WingetListOutput {
  apps: InstalledApp[];
  rawOutput: string;
}

export interface WingetUpgradeOutput {
  updates: AvailableUpdate[];
  rawOutput: string;
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
 * Bulk (upgrade-all) operation metadata (PCC v2.0.1 bulk-state audit):
 * a snapshot of the batch taken BEFORE the bulk command starts, plus a
 * summary computed AFTER it finishes by diffing a fresh `winget upgrade`
 * scan against the snapshot.
 */
export interface BulkUpdateMeta {
  /** Number of packages that needed an update at start. */
  total: number;
  /** Snapshot of the batch (package ids + display names). */
  packages: { id: string; name: string }[];
  /**
   * Filled when the bulk command completes:
   *  - succeeded: snapshot ids no longer reported by `winget upgrade`
   *  - failed:    snapshot ids still reported by `winget upgrade`
   */
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

export interface StreamOutput {
  stdout: string;
  stderr: string;
}

// Collection types
export interface CollectionPackage {
  id: string;
  name?: string;
  version?: string;
  source?: string;
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

// Health dashboard types
export interface HealthStats {
  ignoredPackagesCount: number;
  pinnedPackagesCount: number;
  lastBackup: string | null;
  lastRestore: string | null;
  snapshotCount: number;
}

/**
 * Runtime application/system information for the About page.
 *
 * Every field is resolved live in the main process at call time (app
 * metadata, process.versions, the resolved user-data directory and the
 * build artifact timestamp) — the renderer never hardcodes these values.
 */
export interface AppInfo {
  /** Product name (app.getName(), sourced from package.json productName). */
  name: string;
  /** Application version (app.getVersion()). */
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
  /** Absolute path of the PCC user data directory. */
  dataDirectory: string;
  /** True when running from a packaged build (asar), false in dev. */
  packaged: boolean;
}

// Update discovery audit types (PCC_UPDATE_AUDIT=1)
export interface ParseAudit {
  headerFound: boolean;
  expectedColumns: string[];
  dataRows: number;
  skippedLines: string[];
}

export interface AvailableUpdateDetailed {
  updates: AvailableUpdate[];
  rawOutput: string;
  parseAudit: ParseAudit;
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

// Theme selection persisted via ConfigService (theme.mode).
// Only two themes are supported: dark and light. Legacy 'system' values
// stored by older builds resolve to dark everywhere they are read.
export type ThemeMode = 'light' | 'dark';
