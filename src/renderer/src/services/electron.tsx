import type { 
  InstalledApp, 
  AvailableUpdate, 
  UpgradeResult, 
  PackageDetails, 
  QueueItem, 
  LogEntry, 
  ProgressEvent, 
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
  ProcessTarget,
  ProcessTerminateRequest,
  ProcessTerminateResult,
  ProviderInfo,
  ProviderHealth,
  ThemeMode,
  AppInfo,
} from '@/types';

type BackupPackageArray = BackupPackage[];
type RestorePreviewItemArray = RestorePreviewItem[];
type RestoreResultArray = RestoreResult[];
type CollectionArray = Collection[];
type SystemSnapshotArray = SystemSnapshot[];
type SnapshotComparisonResultType = SnapshotComparisonResult;
type DriftReportType = DriftReport;
type HealthStatsType = HealthStats;
type IgnoredPackageArray = IgnoredPackage[];
type PinnedPackageArray = PinnedPackage[];
type QueueItemArray = QueueItem[];
type LogEntryType = LogEntry;
type ProgressEventType = ProgressEvent;
type InstalledAppArray = InstalledApp[];
type AvailableUpdateArray = AvailableUpdate[];
type UpgradeResultType = UpgradeResult;
type PackageDetailsType = PackageDetails;
type PinnedPackageType = PinnedPackage;
type IgnoredPackageType = IgnoredPackage;
type RestorePreviewItemType = RestorePreviewItem;
type RestoreOptionsType = RestoreOptions;
type RestoreResultType = RestoreResult;
type RestoreReportType = RestoreReport;
type CollectionType = Collection;
type CollectionExportType = CollectionExport;
type SystemSnapshotType = SystemSnapshot;
type DriftSourceType = DriftSource;
type QueueItemType = QueueItem;
type AppInfoType = AppInfo;

interface ElectronAPI {
  provider: {
    getInstalledApps: () => Promise<InstalledAppArray>;
    getAllInstalledApps: () => Promise<InstalledAppArray>;
    getAvailableUpdates: () => Promise<AvailableUpdateArray>;
    showPackage: (id: string, providerId?: string) => Promise<PackageDetailsType>;
    upgradePackage: (id: string, packageName?: string, providerId?: string) => Promise<UpgradeResultType>;
    /** Multi-source update-all (PCC v2.1): one UpgradeResult per active provider. */
    upgradeAll: () => Promise<UpgradeResultType[]>;
    install: (id: string, name?: string, providerId?: string) => Promise<UpgradeResultType>;
    uninstall: (id: string, name?: string, providerId?: string) => Promise<UpgradeResultType>;
    search: (providerId: string, query: string) => Promise<InstalledAppArray>;
    getPinnedPackages: () => Promise<PinnedPackageArray>;
    pinPackage: (id: string, version?: string) => Promise<UpgradeResultType>;
    unpinPackage: (id: string) => Promise<UpgradeResultType>;
  };
  /** PCC v2.1 multi-source: provider availability + enablement. */
  providers: {
    list: () => Promise<ProviderInfo[]>;
    /** PCC v2.2: provider health + installed version (About page cards). */
    getHealth: () => Promise<ProviderHealth[]>;
    setEnabled: (providerId: string, enabled: boolean) => Promise<boolean>;
  };
  /**
   * Chocolatey elevation fix: whether PCC runs elevated, plus the UAC
   * relaunch flow offered when an elevation-requiring provider is used.
   */
  system: {
    isAdministrator: () => Promise<boolean>;
    relaunchAsAdmin: () => Promise<{ started: boolean; reason?: string }>;
  };
  /** About page: live application + system information. */
  app: {
    getInfo: () => Promise<AppInfoType>;
    /** PCC v2.2: one-time startup notice (legacy data migration). */
    getStartupNotice: () => Promise<string | null>;
  };
  ignored: {
    getAll: () => Promise<IgnoredPackageArray>;
    add: (id: string, name: string) => Promise<{ success: boolean }>;
    remove: (id: string) => Promise<{ success: boolean }>;
  };
  pinned: {
    getAll: () => Promise<PinnedPackageArray>;
    add: (id: string, version?: string) => Promise<UpgradeResultType>;
    remove: (id: string) => Promise<UpgradeResultType>;
  };
  export: {
    json: (apps: InstalledAppArray) => Promise<{ success: boolean; filePath: string }>;
    csv: (apps: InstalledAppArray) => Promise<{ success: boolean; filePath: string }>;
    backup: (apps: InstalledAppArray) => Promise<{ success: boolean; filePath: string }>;
  };
  restore: {
    selectBackupFile: () => Promise<{ canceled: boolean; filePath: string }>;
    loadBackupFile: (filePath: string) => Promise<{ success: boolean; backup: { packages: BackupPackageArray; totalPackages: number; exportedAt: string } }>;
    getPreview: (backupPackages: BackupPackageArray) => Promise<RestorePreviewItemArray>;
    execute: (options: RestoreOptionsType) => Promise<RestoreResultArray>;
    generateReport: (report: RestoreReportType) => Promise<{ success: boolean; filePath: string }>;
  };
  collection: {
    getAll: () => Promise<CollectionArray>;
    get: (id: string) => Promise<CollectionType | null>;
    create: (data: Omit<CollectionType, 'id' | 'createdAt' | 'updatedAt'>) => Promise<CollectionType>;
    update: (id: string, updates: Partial<CollectionType>) => Promise<CollectionType>;
    delete: (id: string) => Promise<{ success: boolean }>;
    export: (id: string) => Promise<CollectionExportType>;
    import: (data: CollectionExportType) => Promise<CollectionType>;
    install: (id: string) => Promise<RestoreResultArray>;
  };
  snapshot: {
    getAll: () => Promise<SystemSnapshotArray>;
    create: (name: string, description?: string) => Promise<SystemSnapshotType>;
    get: (id: string) => Promise<SystemSnapshotType | null>;
    delete: (id: string) => Promise<{ success: boolean }>;
    compare: (id1: string, id2: string) => Promise<SnapshotComparisonResultType>;
  };
  drift: {
    detect: (sourceType: DriftSourceType, sourceId: string) => Promise<DriftReportType>;
  };
  health: {
    getStats: () => Promise<HealthStatsType>;
  };
  config: {
    getThemeMode: () => Promise<ThemeMode>;
    setThemeMode: (mode: ThemeMode) => Promise<ThemeMode>;
  };
  queue: {
    getAll: () => Promise<QueueItemArray>;
    clearCompleted: () => Promise<void>;
    clearAll: () => Promise<void>;
    removeItem: (id: string) => Promise<boolean>;
    retry: (id: string) => Promise<{ success: boolean; duplicate?: boolean; error?: string }>;
    onUpdated: (callback: (queue: QueueItemArray) => void) => () => void;
    onProgress: (callback: (event: ProgressEventType) => void) => () => void;
    onLog: (callback: (log: LogEntryType) => void) => () => void;
  };
  process: {
    findBlockers: (packageId: string, packageName?: string) => Promise<ProcessTarget[]>;
    terminate: (
      request: ProcessTerminateRequest
    ) => Promise<ProcessTerminateResult & { retryError?: string }>;
  };
  window: {
    closeChoice: (choice: 'stay' | 'wait' | 'force') => Promise<{ closed: boolean }>;
    onCloseRequested: (
      callback: (payload: { active: { id: string; name: string; status: string }[] }) => void
    ) => () => void;
    setTheme: (theme: 'light' | 'dark') => Promise<void>;
  };
  dialog: {
    showError: (title: string, content: string) => Promise<void>;
    showInfo: (title: string, content: string) => Promise<void>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export const electronAPI = window.electronAPI;