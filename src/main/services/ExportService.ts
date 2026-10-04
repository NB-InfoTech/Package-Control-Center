import { app } from 'electron';
import { join } from 'path';
import { homedir } from 'os';
import { writeFileSync } from 'fs';
import { backupPathService } from './paths/index.js';
import type { InstalledApp } from './providers/IUpdateProvider.js';

const APP_NAME = 'Package Control Center';
/**
 * Application version stamped into exports and backups.
 * Read from package.json at runtime (single source of truth) instead of a
 * hardcoded literal, so an export can never claim a stale version.
 */
const APP_VERSION = app.getVersion();

export class ExportService {
  static async exportToJson(apps: InstalledApp[], filePath: string): Promise<void> {
    const data = {
      application: APP_NAME,
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      totalPackages: apps.length,
      packages: apps.map(app => ({
        name: app.name,
        id: app.id,
        version: app.version,
        source: app.source,
      })),
    };
    writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  static async exportToCsv(apps: InstalledApp[], filePath: string): Promise<void> {
    const headers = ['Name', 'Id', 'Version', 'Source'];
    const rows = apps.map(app => [
      this.escapeCsv(app.name),
      this.escapeCsv(app.id),
      this.escapeCsv(app.version),
      this.escapeCsv(app.source),
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    writeFileSync(filePath, csv, 'utf-8');
  }

  /**
   * Write an inventory backup into the canonical backup folder
   * (`~/Documents/Package Control Center Backups`, resolved by
   * BackupPathService). Any pre-rebrand backups are migrated in first, so
   * this and drift detection always agree on one folder.
   */
  static async backupInstalledPackages(apps: InstalledApp[]): Promise<string> {
    backupPathService.migrateLegacyBackupsIfNeeded();
    const backupDir = backupPathService.ensureBackupRoot();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filePath = join(backupDir, `installed-packages-${timestamp}.json`);

    await this.exportToJson(apps, filePath);
    return filePath;
  }

  private static escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  static getDefaultExportPath(extension: 'json' | 'csv'): string {
    const timestamp = new Date().toISOString().split('T')[0];
    return join(homedir(), 'Documents', `package-control-center-inventory-${timestamp}.${extension}`);
  }
}