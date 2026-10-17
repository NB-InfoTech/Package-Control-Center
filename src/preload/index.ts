import { contextBridge, ipcRenderer } from 'electron';

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
  ProviderSetEnabledResult,
  ThemeMode,
  AppInfo,
} from '../main/services/types.js';

contextBridge.exposeInMainWorld('electronAPI', {
  provider: {
    getInstalledApps: (): Promise<InstalledApp[]> =>
      ipcRenderer.invoke('provider:getInstalledApps'),
    getAllInstalledApps: (): Promise<InstalledApp[]> =>
      ipcRenderer.invoke('provider:getAllInstalledApps'),
    getAvailableUpdates: (): Promise<AvailableUpdate[]> =>
      ipcRenderer.invoke('provider:getAvailableUpdates'),
    showPackage: (id: string, providerId?: string): Promise<PackageDetails> =>
      ipcRenderer.invoke('provider:showPackage', id, providerId),
    upgradePackage: (id: string, packageName?: string, providerId?: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('provider:upgradePackage', id, packageName, providerId),
    /** Multi-source update-all (PCC v2.1): one UpgradeResult per active provider. */
    upgradeAll: (): Promise<UpgradeResult[]> =>
      ipcRenderer.invoke('provider:upgradeAll'),
    install: (id: string, name?: string, providerId?: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('provider:install', id, name, providerId),
    uninstall: (id: string, name?: string, providerId?: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('provider:uninstall', id, name, providerId),
    search: (providerId: string, query: string): Promise<InstalledApp[]> =>
      ipcRenderer.invoke('provider:search', providerId, query),
    getPinnedPackages: (): Promise<PinnedPackage[]> =>
      ipcRenderer.invoke('provider:getPinnedPackages'),
    pinPackage: (id: string, version?: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('provider:pinPackage', id, version),
    unpinPackage: (id: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('provider:unpinPackage', id),
  },
  /** PCC v2.1 multi-source: provider availability + enablement. */
  providers: {
    list: (): Promise<ProviderInfo[]> =>
      ipcRenderer.invoke('providers:list'),
    /** PCC v2.2: provider health + installed version (About page cards). */
    getHealth: (): Promise<ProviderHealth[]> =>
      ipcRenderer.invoke('providers:getHealth'),
    setEnabled: (
      providerId: string,
      enabled: boolean,
      autoInstall: boolean = false
    ): Promise<ProviderSetEnabledResult> =>
      ipcRenderer.invoke('providers:setEnabled', providerId, enabled, autoInstall),
  },
  /**
   * Chocolatey elevation fix: elevation state of the PCC process plus the
   * UAC relaunch flow.
   */
  system: {
    isAdministrator: (): Promise<boolean> => ipcRenderer.invoke('system:isAdministrator'),
    relaunchAsAdmin: (): Promise<{ started: boolean; reason?: string }> =>
      ipcRenderer.invoke('system:relaunchAsAdmin'),
  },
  /** About page: live application + system information (PCC 2.1). */
  app: {
    getInfo: (): Promise<AppInfo> => ipcRenderer.invoke('app:getInfo'),
    /** PCC v2.2: one-time startup notice (legacy data migration). */
    getStartupNotice: (): Promise<string | null> =>
      ipcRenderer.invoke('app:getStartupNotice'),
  },
  ignored: {
    getAll: (): Promise<IgnoredPackage[]> =>
      ipcRenderer.invoke('ignored:getAll'),
    add: (id: string, name: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('ignored:add', id, name),
    remove: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('ignored:remove', id),
  },
  pinned: {
    getAll: (): Promise<PinnedPackage[]> =>
      ipcRenderer.invoke('pinned:getAll'),
    add: (id: string, version?: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('pinned:add', id, version),
    remove: (id: string): Promise<UpgradeResult> =>
      ipcRenderer.invoke('pinned:remove', id),
  },
  export: {
    json: (apps: InstalledApp[]): Promise<{ success: boolean; filePath: string }> =>
      ipcRenderer.invoke('export:json', apps),
    csv: (apps: InstalledApp[]): Promise<{ success: boolean; filePath: string }> =>
      ipcRenderer.invoke('export:csv', apps),
    backup: (apps: InstalledApp[]): Promise<{ success: boolean; filePath: string }> =>
      ipcRenderer.invoke('export:backup', apps),
  },
  restore: {
    selectBackupFile: (): Promise<{ canceled: boolean; filePath: string }> =>
      ipcRenderer.invoke('restore:selectBackupFile'),
    loadBackupFile: (filePath: string): Promise<{ success: boolean; backup: { packages: BackupPackage[]; totalPackages: number; exportedAt: string } }> =>
      ipcRenderer.invoke('restore:loadBackupFile', filePath),
    getPreview: (backupPackages: BackupPackage[]): Promise<RestorePreviewItem[]> =>
      ipcRenderer.invoke('restore:getPreview', backupPackages),
    execute: (options: RestoreOptions): Promise<RestoreResult[]> =>
      ipcRenderer.invoke('restore:execute', options),
    generateReport: (report: RestoreReport): Promise<{ success: boolean; filePath: string }> =>
      ipcRenderer.invoke('restore:generateReport', report),
  },
  collection: {
    getAll: (): Promise<Collection[]> =>
      ipcRenderer.invoke('collection:getAll'),
    get: (id: string): Promise<Collection | null> =>
      ipcRenderer.invoke('collection:get', id),
    create: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>): Promise<Collection> =>
      ipcRenderer.invoke('collection:create', data),
    update: (id: string, updates: Partial<Collection>): Promise<Collection> =>
      ipcRenderer.invoke('collection:update', id, updates),
    delete: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('collection:delete', id),
    export: (id: string): Promise<CollectionExport> =>
      ipcRenderer.invoke('collection:export', id),
    import: (data: CollectionExport): Promise<Collection> =>
      ipcRenderer.invoke('collection:import', data),
    install: (id: string): Promise<RestoreResult[]> =>
      ipcRenderer.invoke('collection:install', id),
  },
  snapshot: {
    getAll: (): Promise<SystemSnapshot[]> =>
      ipcRenderer.invoke('snapshot:getAll'),
    create: (name: string, description?: string): Promise<SystemSnapshot> =>
      ipcRenderer.invoke('snapshot:create', name, description),
    get: (id: string): Promise<SystemSnapshot | null> =>
      ipcRenderer.invoke('snapshot:get', id),
    delete: (id: string): Promise<{ success: boolean }> =>
      ipcRenderer.invoke('snapshot:delete', id),
    compare: (id1: string, id2: string): Promise<SnapshotComparisonResult> =>
      ipcRenderer.invoke('snapshot:compare', id1, id2),
  },
  drift: {
    detect: (sourceType: DriftSource, sourceId: string): Promise<DriftReport> =>
      ipcRenderer.invoke('drift:detect', sourceType, sourceId),
  },
  health: {
    getStats: (): Promise<HealthStats> =>
      ipcRenderer.invoke('health:getStats'),
  },
  config: {
    getThemeMode: (): Promise<ThemeMode> =>
      ipcRenderer.invoke('config:getThemeMode'),
    setThemeMode: (mode: ThemeMode): Promise<ThemeMode> =>
      ipcRenderer.invoke('config:setThemeMode', mode),
  },
  queue: {
    getAll: (): Promise<QueueItem[]> =>
      ipcRenderer.invoke('queue:getAll'),
    clearCompleted: (): Promise<void> =>
      ipcRenderer.invoke('queue:clearCompleted'),
    clearAll: (): Promise<void> =>
      ipcRenderer.invoke('queue:clearAll'),
    removeItem: (id: string): Promise<boolean> =>
      ipcRenderer.invoke('queue:remove', id),
    retry: (id: string): Promise<{ success: boolean; duplicate?: boolean; error?: string }> =>
      ipcRenderer.invoke('queue:retry', id),
    onUpdated: (callback: (queue: QueueItem[]) => void) => {
      ipcRenderer.on('queue:updated', (_event, queue: QueueItem[]) => callback(queue));
      return () => ipcRenderer.removeAllListeners('queue:updated');
    },
    onProgress: (callback: (event: ProgressEvent) => void) => {
      ipcRenderer.on('queue:progress', (_event, event: ProgressEvent) => callback(event));
      return () => ipcRenderer.removeAllListeners('queue:progress');
    },
    onLog: (callback: (log: LogEntry) => void) => {
      ipcRenderer.on('queue:log', (_event, log: LogEntry) => callback(log));
      return () => ipcRenderer.removeAllListeners('queue:log');
    },
  },
  process: {
    findBlockers: (packageId: string, packageName?: string): Promise<ProcessTarget[]> =>
      ipcRenderer.invoke('process:findBlockers', packageId, packageName),
    terminate: (
      request: ProcessTerminateRequest
    ): Promise<ProcessTerminateResult & { retryError?: string }> =>
      ipcRenderer.invoke('process:terminate', request),
  },
  window: {
    closeChoice: (choice: 'stay' | 'wait' | 'force'): Promise<{ closed: boolean }> =>
      ipcRenderer.invoke('window:close-choice', choice),
    onCloseRequested: (
      callback: (payload: { active: { id: string; name: string; status: string }[] }) => void
    ) => {
      ipcRenderer.on(
        'window:close-requested',
        (_event, payload: { active: { id: string; name: string; status: string }[] }) =>
          callback(payload)
      );
      return () => ipcRenderer.removeAllListeners('window:close-requested');
    },
    setTheme: (theme: 'light' | 'dark'): Promise<void> =>
      ipcRenderer.invoke('window:setTheme', theme),
  },
  dialog: {
    showError: (title: string, content: string): Promise<void> =>
      ipcRenderer.invoke('dialog:showError', title, content),
    showInfo: (title: string, content: string): Promise<void> =>
      ipcRenderer.invoke('dialog:showInfo', title, content),
  },
});

declare global {
  interface Window {
    electronAPI: {
      provider: {
        getInstalledApps: () => Promise<InstalledApp[]>;
        getAllInstalledApps: () => Promise<InstalledApp[]>;
        getAvailableUpdates: () => Promise<AvailableUpdate[]>;
        showPackage: (id: string) => Promise<PackageDetails>;
        upgradePackage: (id: string, packageName?: string) => Promise<UpgradeResult>;
        upgradeAll: () => Promise<UpgradeResult>;
        getPinnedPackages: () => Promise<PinnedPackage[]>;
        pinPackage: (id: string, version?: string) => Promise<UpgradeResult>;
        unpinPackage: (id: string) => Promise<UpgradeResult>;
      };
      ignored: {
        getAll: () => Promise<IgnoredPackage[]>;
        add: (id: string, name: string) => Promise<{ success: boolean }>;
        remove: (id: string) => Promise<{ success: boolean }>;
      };
      pinned: {
        getAll: () => Promise<PinnedPackage[]>;
        add: (id: string, version?: string) => Promise<UpgradeResult>;
        remove: (id: string) => Promise<UpgradeResult>;
      };
      export: {
        json: (apps: InstalledApp[]) => Promise<{ success: boolean; filePath: string }>;
        csv: (apps: InstalledApp[]) => Promise<{ success: boolean; filePath: string }>;
        backup: (apps: InstalledApp[]) => Promise<{ success: boolean; filePath: string }>;
      };
      restore: {
        selectBackupFile: () => Promise<{ canceled: boolean; filePath: string }>;
        loadBackupFile: (filePath: string) => Promise<{ success: boolean; backup: { packages: BackupPackage[]; totalPackages: number; exportedAt: string } }>;
        getPreview: (backupPackages: BackupPackage[]) => Promise<RestorePreviewItem[]>;
        execute: (options: RestoreOptions) => Promise<RestoreResult[]>;
        generateReport: (report: RestoreReport) => Promise<{ success: boolean; filePath: string }>;
      };
      collection: {
        getAll: () => Promise<Collection[]>;
        get: (id: string) => Promise<Collection | null>;
        create: (data: Omit<Collection, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Collection>;
        update: (id: string, updates: Partial<Collection>) => Promise<Collection>;
        delete: (id: string) => Promise<{ success: boolean }>;
        export: (id: string) => Promise<CollectionExport>;
        import: (data: CollectionExport) => Promise<Collection>;
        install: (id: string) => Promise<RestoreResult[]>;
      };
      snapshot: {
        getAll: () => Promise<SystemSnapshot[]>;
        create: (name: string, description?: string) => Promise<SystemSnapshot>;
        get: (id: string) => Promise<SystemSnapshot | null>;
        delete: (id: string) => Promise<{ success: boolean }>;
        compare: (id1: string, id2: string) => Promise<SnapshotComparisonResult>;
      };
      drift: {
        detect: (sourceType: DriftSource, sourceId: string) => Promise<DriftReport>;
      };
      health: {
        getStats: () => Promise<HealthStats>;
      };
      config: {
        getThemeMode: () => Promise<ThemeMode>;
        setThemeMode: (mode: ThemeMode) => Promise<ThemeMode>;
      };
      queue: {
        getAll: () => Promise<QueueItem[]>;
        clearCompleted: () => Promise<void>;
        clearAll: () => Promise<void>;
        removeItem: (id: string) => Promise<boolean>;
        retry: (id: string) => Promise<{ success: boolean; duplicate?: boolean; error?: string }>;
        onUpdated: (callback: (queue: QueueItem[]) => void) => () => void;
        onProgress: (callback: (event: ProgressEvent) => void) => () => void;
        onLog: (callback: (log: LogEntry) => void) => () => void;
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
      app: {
        getInfo: () => Promise<AppInfo>;
      };
      dialog: {
        showError: (title: string, content: string) => Promise<void>;
        showInfo: (title: string, content: string) => Promise<void>;
      };
    };
  }
}