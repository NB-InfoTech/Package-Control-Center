import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dataPathService } from './paths/index.js';
import type { IgnoredPackage } from './providers/IUpdateProvider.js';

function ignoredFilePath(): string {
  return dataPathService.getIgnoredPackagesFile();
}

function pinnedFilePath(): string {
  return dataPathService.getPinnedPackagesFile();
}

function ensureConfigDir(): void {
  dataPathService.ensureDir();
}

export class SettingsStore {
  private static ignoredCache: IgnoredPackage[] | null = null;
  private static pinnedCache: Map<string, IgnoredPackage> | null = null;

  static getIgnoredPackages(): IgnoredPackage[] {
    if (this.ignoredCache !== null) {
      return this.ignoredCache;
    }
    ensureConfigDir();
    if (existsSync(ignoredFilePath())) {
      try {
        const data = readFileSync(ignoredFilePath(), 'utf-8');
        this.ignoredCache = JSON.parse(data) as IgnoredPackage[];
        return this.ignoredCache;
      } catch {
        this.ignoredCache = [];
        return [];
      }
    }
    this.ignoredCache = [];
    return [];
  }

  static saveIgnoredPackages(packages: IgnoredPackage[]): void {
    ensureConfigDir();
    this.ignoredCache = packages;
    writeFileSync(ignoredFilePath(), JSON.stringify(packages, null, 2), 'utf-8');
  }

  static ignorePackage(id: string, name: string): void {
    const ignored = this.getIgnoredPackages();
    if (!ignored.find(p => p.id === id)) {
      ignored.push({
        id,
        name,
        ignoredAt: new Date().toISOString(),
      });
      this.saveIgnoredPackages(ignored);
    }
  }

  static unignorePackage(id: string): void {
    const ignored = this.getIgnoredPackages();
    const filtered = ignored.filter(p => p.id !== id);
    this.saveIgnoredPackages(filtered);
  }

  static isIgnored(id: string): boolean {
    return this.getIgnoredPackages().some(p => p.id === id);
  }

  static filterIgnoredApps<T extends { id: string }>(apps: T[]): T[] {
    const ignored = this.getIgnoredPackages();
    const ignoredIds = new Set(ignored.map(p => p.id));
    return apps.filter(app => !ignoredIds.has(app.id));
  }
}