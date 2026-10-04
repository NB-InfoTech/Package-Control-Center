import type { ProviderId, ProviderAvailability } from '../types.js';

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

export interface ProcessTerminateResult {
  results: { name: string; kind: string; success: boolean }[];
  retriedOperationId?: string;
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

export type ProgressStep = 'preparing' | 'downloading' | 'installing' | 'verifying' | 'completed';

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

export interface IUpdateProvider {
  getInstalledApps(): Promise<InstalledApp[]>;
  getAvailableUpdates(): Promise<AvailableUpdate[]>;
  /** Detailed variant for the PCC_UPDATE_AUDIT=1 discovery funnel. */
  getAvailableUpdatesDetailed(): Promise<AvailableUpdateDetailed>;
  showPackage(id: string): Promise<PackageDetails>;
  upgradePackage(id: string, packageName?: string, opts?: { retryCount?: number }): Promise<UpgradeResult>;
  upgradeAll(): Promise<UpgradeResult>;
  getPinnedPackages(): Promise<PinnedPackage[]>;
  pinPackage(id: string, version?: string): Promise<UpgradeResult>;
  unpinPackage(id: string): Promise<UpgradeResult>;
  // Restore methods
  getRestorePreview(backupPackages: BackupPackage[]): Promise<RestorePreviewItem[]>;
  restorePackages(options: RestoreOptions): Promise<RestoreResult[]>;
  generateRestoreReport(report: RestoreReport): Promise<{ success: boolean; filePath: string }>;
  // Collection methods
  getCollections(): Promise<Collection[]>;
  getCollection(id: string): Promise<Collection | null>;
  createCollection(collection: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection>;
  updateCollection(id: string, updates: Partial<Collection>): Promise<Collection>;
  deleteCollection(id: string): Promise<void>;
  exportCollection(id: string): Promise<CollectionExport>;
  importCollection(data: CollectionExport): Promise<Collection>;
  installCollection(id: string): Promise<RestoreResult[]>;
  // Snapshot methods
  getSnapshots(): Promise<SystemSnapshot[]>;
  createSnapshot(name: string, description?: string): Promise<SystemSnapshot>;
  getSnapshot(id: string): Promise<SystemSnapshot | null>;
  deleteSnapshot(id: string): Promise<void>;
  compareSnapshots(id1: string, id2: string): Promise<SnapshotComparisonResult>;
  // Drift detection methods
  detectDrift(sourceType: DriftSource, sourceId: string): Promise<DriftReport>;
}

/**
 * Core package-provider capabilities (PCC v2.1 multi-source).
 *
 * This is the minimal surface every package manager integration must
 * implement. UI code and the queue engine only ever depend on this
 * interface — provider-specific CLI details (winget tables, choco text
 * output, ...) stay inside each provider.
 *
 * The legacy IUpdateProvider extends these capabilities with
 * winget-specific extras (pins, restore, collections, snapshots, drift).
 */
export interface IPackageProvider {
  readonly id: ProviderId;
  readonly displayName: string;
  /**
   * Whether mutating operations require the PCC process to run elevated.
   * Chocolatey writes to machine-wide locations (C:\ProgramData\chocolatey)
   * and cannot self-elevate, so it reports true; winget handles its own
   * elevation through the Windows consent UI and reports false.
   */
  readonly requiresElevation: boolean;

  /** Detect whether the underlying package manager is usable. */
  checkAvailability(): Promise<ProviderAvailability>;

  /** All packages installed from this provider's source(s). */
  getInstalledApps(): Promise<InstalledApp[]>;

  /** Packages of this provider with a newer version available. */
  getAvailableUpdates(): Promise<AvailableUpdate[]>;

  /** Details for one package by its provider-specific id. */
  showPackage(id: string): Promise<PackageDetails>;

  /** Search the provider's source catalog. */
  searchPackages(query: string): Promise<InstalledApp[]>;

  /** Update a single package. */
  upgradePackage(id: string, packageName?: string, opts?: { retryCount?: number }): Promise<UpgradeResult>;

  /** Update every package of this provider that has an update. */
  upgradeAll(): Promise<UpgradeResult>;

  /** Install a package from the provider's catalog. */
  installPackage(id: string, name?: string): Promise<UpgradeResult>;

  /** Uninstall a package. */
  uninstallPackage(id: string, name?: string): Promise<UpgradeResult>;
}