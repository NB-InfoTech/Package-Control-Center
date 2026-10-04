import { join } from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataPathService, backupPathService, reportPathService } from '../paths/index.js';
import type { ProviderId } from '../types.js';

export interface BackupConfig {
  location: string;
  autoBackup: boolean;
  maxBackups: number;
}

export interface ReportConfig {
  location: string;
  autoGenerate: boolean;
}

export interface ThemeConfig {
  mode: 'dark' | 'light';
  accentColor: string;
}

export interface LogConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  maxFileSize: number; // MB
  maxFiles: number;
}

export interface WingetConfig {
  defaultSource: string;
  acceptSourceAgreements: boolean;
  timeout: number; // ms
}

export interface ProvidersConfig {
  enabled: Record<ProviderId, boolean>;
}

export interface AppConfig {
  backup: BackupConfig;
  reports: ReportConfig;
  theme: ThemeConfig;
  log: LogConfig;
  winget: WingetConfig;
  providers: ProvidersConfig;
  version: string;
}

const DEFAULT_CONFIG: AppConfig = {
  backup: {
    // Backup folder is owned by BackupPathService (PCC v2.2) — keep this
    // default in sync so a fresh install points at the canonical folder.
    location: backupPathService.getBackupRoot(),
    autoBackup: false,
    maxBackups: 10,
  },
  reports: {
    // Reports folder is owned by ReportPathService (PCC v2.2).
    location: reportPathService.getReportsRoot(),
    autoGenerate: true,
  },
  theme: {
    mode: 'dark',
    accentColor: '#3b82f6',
  },
  log: {
    level: 'info',
    maxFileSize: 10,
    maxFiles: 5,
  },
  winget: {
    defaultSource: 'winget',
    acceptSourceAgreements: true,
    timeout: 300000,
  },
  providers: {
    enabled: {
      winget: true,
      chocolatey: true,
      msstore: true,
    },
  },
  version: '1.0.0',
};

/** Resolve the config file through the canonical data root (PCC v2.2). */
function ensureConfigDir(): void {
  dataPathService.ensureDir();
}

function configFilePath(): string {
  return dataPathService.getConfigFile();
}

export class ConfigService {
  private static instance: ConfigService;
  private config: AppConfig;
  private listeners: Set<(config: AppConfig) => void> = new Set();

  private constructor() {
    this.config = this.loadConfig();
  }

  public static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  private loadConfig(): AppConfig {
    ensureConfigDir();

    if (existsSync(configFilePath())) {
      try {
        const data = readFileSync(configFilePath(), 'utf-8');
        const loaded = JSON.parse(data) as Partial<AppConfig>;
        return this.mergeConfig(DEFAULT_CONFIG, loaded);
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    
    return DEFAULT_CONFIG;
  }

  private mergeConfig(defaults: AppConfig, loaded: Partial<AppConfig>): AppConfig {
    return {
      backup: { ...defaults.backup, ...loaded.backup },
      reports: { ...defaults.reports, ...loaded.reports },
      theme: { ...defaults.theme, ...loaded.theme },
      log: { ...defaults.log, ...loaded.log },
      winget: { ...defaults.winget, ...loaded.winget },
      providers: {
        enabled: {
          ...defaults.providers.enabled,
          ...(loaded.providers?.enabled ?? {}),
        },
      },
      version: loaded.version || defaults.version,
    };
  }

  private saveConfig(): void {
    ensureConfigDir();
    writeFileSync(configFilePath(), JSON.stringify(this.config, null, 2), 'utf-8');
  }

  public getConfig(): AppConfig {
    return { ...this.config };
  }

  public get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return this.config[key];
  }

  public set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): void {
    this.config[key] = value;
    this.saveConfig();
    this.notifyListeners();
  }

  public update<K extends keyof AppConfig>(key: K, updates: Partial<AppConfig[K]>): void {
    if (typeof this.config[key] === 'object' && !Array.isArray(this.config[key])) {
      this.config[key] = { ...this.config[key], ...updates };
      this.saveConfig();
      this.notifyListeners();
    }
  }

  public subscribe(listener: (config: AppConfig) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.getConfig());
    }
  }

  public resetToDefaults(): void {
    this.config = { ...DEFAULT_CONFIG };
    this.saveConfig();
    this.notifyListeners();
  }
}

export const configService = ConfigService.getInstance();