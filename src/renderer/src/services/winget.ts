import { electronAPI } from '@/services/electron';
import type { 
  InstalledApp, 
  AvailableUpdate, 
  UpgradeResult, 
  PackageDetails, 
  PinnedPackage, 
  IgnoredPackage, 
  BackupPackage, 
  RestorePreviewItem, 
  RestoreOptions, 
  RestoreResult, 
  RestoreReport,
  Collection,
  CollectionExport,
  SystemSnapshot,
  SnapshotComparisonResult,
  DriftSource,
  DriftReport,
  HealthStats,
  ProviderInfo,
  AppInfo,
  ProviderHealth,
} from '@/types';

export class WingetService {
  static async getInstalledApps(): Promise<InstalledApp[]> {
    return electronAPI.provider.getInstalledApps();
  }

  static async getAllInstalledApps(): Promise<InstalledApp[]> {
    return electronAPI.provider.getAllInstalledApps();
  }

  static async getAvailableUpdates(): Promise<AvailableUpdate[]> {
    return electronAPI.provider.getAvailableUpdates();
  }

  static async showPackage(id: string, providerId?: string): Promise<PackageDetails> {
    return electronAPI.provider.showPackage(id, providerId);
  }

  static async upgradePackage(id: string, packageName?: string, providerId?: string): Promise<UpgradeResult> {
    return electronAPI.provider.upgradePackage(id, packageName, providerId);
  }

  /** Multi-source update-all (PCC v2.1): one UpgradeResult per active provider. */
  static async upgradeAll(): Promise<UpgradeResult[]> {
    return electronAPI.provider.upgradeAll();
  }

  // --- PCC v2.1 multi-source: providers -------------------------------------

  static async getProviders(): Promise<ProviderInfo[]> {
    return electronAPI.providers.list();
  }

  /**
   * Provider health + installed version (PCC v2.2 About page).
   * Each entry is { id, name, status, version }.
   */
  static async getProviderHealth(): Promise<ProviderHealth[]> {
    return electronAPI.providers.getHealth();
  }

  static async setProviderEnabled(providerId: string, enabled: boolean): Promise<boolean> {
    return electronAPI.providers.setEnabled(providerId, enabled);
  }

  // --- Chocolatey elevation fix: elevation state + UAC relaunch --------------

  /** Is PCC running with an elevated (Administrator) token? */
  static async isAdministrator(): Promise<boolean> {
    return electronAPI.system.isAdministrator();
  }

  /** Trigger the UAC relaunch; PCC quits and restarts elevated. */
  static async relaunchAsAdmin(): Promise<{ started: boolean; reason?: string }> {
    return electronAPI.system.relaunchAsAdmin();
  }

  // --- About page: live application + system information --------------------

  static async getAppInfo(): Promise<AppInfo> {
    return electronAPI.app.getInfo();
  }

  /**
   * PCC v2.2: consume the one-time startup notice (e.g. "Legacy PCC data
   * successfully migrated."). Returns null once it has been shown.
   */
  static async getStartupNotice(): Promise<string | null> {
    return electronAPI.app.getStartupNotice();
  }

  static async searchPackages(providerId: string, query: string): Promise<InstalledApp[]> {
    return electronAPI.provider.search(providerId, query);
  }

  static async installPackage(id: string, name?: string, providerId?: string): Promise<UpgradeResult> {
    return electronAPI.provider.install(id, name, providerId);
  }

  static async uninstallPackage(id: string, name?: string, providerId?: string): Promise<UpgradeResult> {
    return electronAPI.provider.uninstall(id, name, providerId);
  }

  static async getPinnedPackages(): Promise<PinnedPackage[]> {
    return electronAPI.provider.getPinnedPackages();
  }

  static async pinPackage(id: string, version?: string): Promise<UpgradeResult> {
    return electronAPI.provider.pinPackage(id, version);
  }

  static async unpinPackage(id: string): Promise<UpgradeResult> {
    return electronAPI.provider.unpinPackage(id);
  }

  static async getIgnoredPackages(): Promise<IgnoredPackage[]> {
    return electronAPI.ignored.getAll();
  }

  static async ignorePackage(id: string, name: string): Promise<{ success: boolean }> {
    return electronAPI.ignored.add(id, name);
  }

  static async unignorePackage(id: string): Promise<{ success: boolean }> {
    return electronAPI.ignored.remove(id);
  }

  static async exportJson(apps: InstalledApp[]): Promise<{ success: boolean; filePath: string }> {
    return electronAPI.export.json(apps);
  }

  static async exportCsv(apps: InstalledApp[]): Promise<{ success: boolean; filePath: string }> {
    return electronAPI.export.csv(apps);
  }

  static async backupPackages(apps: InstalledApp[]): Promise<{ success: boolean; filePath: string }> {
    return electronAPI.export.backup(apps);
  }

  // Restore methods
  static async selectBackupFile(): Promise<{ canceled: boolean; filePath: string }> {
    return electronAPI.restore.selectBackupFile();
  }

  static async loadBackupFile(filePath: string): Promise<{ success: boolean; backup: { packages: BackupPackage[]; totalPackages: number; exportedAt: string } }> {
    return electronAPI.restore.loadBackupFile(filePath);
  }

  static async getRestorePreview(backupPackages: BackupPackage[]): Promise<RestorePreviewItem[]> {
    return electronAPI.restore.getPreview(backupPackages);
  }

  static async executeRestore(options: RestoreOptions): Promise<RestoreResult[]> {
    return electronAPI.restore.execute(options);
  }

  static async generateRestoreReport(report: RestoreReport): Promise<{ success: boolean; filePath: string }> {
    return electronAPI.restore.generateReport(report);
  }

  // Collection methods
  static async getCollections(): Promise<Collection[]> {
    return electronAPI.collection.getAll();
  }

  static async getCollection(id: string): Promise<Collection | null> {
    return electronAPI.collection.get(id);
  }

  static async createCollection(data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> {
    return electronAPI.collection.create(data);
  }

  static async updateCollection(id: string, updates: Partial<Collection>): Promise<Collection> {
    return electronAPI.collection.update(id, updates);
  }

  static async deleteCollection(id: string): Promise<{ success: boolean }> {
    return electronAPI.collection.delete(id);
  }

  static async exportCollection(id: string): Promise<CollectionExport> {
    return electronAPI.collection.export(id);
  }

  static async importCollection(data: CollectionExport): Promise<Collection> {
    return electronAPI.collection.import(data);
  }

  static async installCollection(id: string): Promise<RestoreResult[]> {
    return electronAPI.collection.install(id);
  }

  // Snapshot methods
  static async getSnapshots(): Promise<SystemSnapshot[]> {
    return electronAPI.snapshot.getAll();
  }

  static async createSnapshot(name: string, description?: string): Promise<SystemSnapshot> {
    return electronAPI.snapshot.create(name, description);
  }

  static async getSnapshot(id: string): Promise<SystemSnapshot | null> {
    return electronAPI.snapshot.get(id);
  }

  static async deleteSnapshot(id: string): Promise<{ success: boolean }> {
    return electronAPI.snapshot.delete(id);
  }

  static async compareSnapshots(id1: string, id2: string): Promise<SnapshotComparisonResult> {
    return electronAPI.snapshot.compare(id1, id2);
  }

  // Drift detection methods
  static async detectDrift(sourceType: DriftSource, sourceId: string): Promise<DriftReport> {
    return electronAPI.drift.detect(sourceType, sourceId);
  }

  // Health stats
  static async getHealthStats(): Promise<HealthStats> {
    return electronAPI.health.getStats();
  }
}