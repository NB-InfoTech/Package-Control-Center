import { readFileSync } from 'fs';
import type { DriftSource, DriftItem, DriftReport, BackupPackage, SystemSnapshot, Collection } from './providers/IUpdateProvider.js';
import { SnapshotService } from './SnapshotService.js';
import { CollectionService } from './CollectionService.js';
import { SettingsStore } from './SettingsStore.js';
import { backupPathService } from './paths/index.js';

export class DriftDetectionService {
  static async detectDrift(sourceType: DriftSource, sourceId: string): Promise<DriftReport> {
    // PCC v2.1: drift is computed against the aggregated installed list
    // (all active providers), matching how snapshots are now captured.
    const { collectInstalledApps } = await import('./providers/index.js');
    const currentApps = await collectInstalledApps();
    const currentMap = new Map(currentApps.map(app => [app.id, app]));

    let expectedPackages: { id: string; name: string; version: string; source: string }[] = [];
    let sourceName = 'Unknown';

    switch (sourceType) {
      case 'snapshot': {
        const snapshot = SnapshotService.getById(sourceId);
        if (!snapshot) throw new Error('Snapshot not found');
        expectedPackages = snapshot.packages;
        sourceName = snapshot.name;
        break;
      }
      case 'backup': {
        // Read from the SAME folder ExportService writes to
        // (BackupPathService). Pre-rebrand backups are migrated in first, so
        // backups taken by older PCC builds are visible here too.
        backupPathService.migrateLegacyBackupsIfNeeded();
        const backupFiles = backupPathService.listBackupFiles();
        const backupFile =
          backupFiles.find(f => f.includes(sourceId)) || backupFiles.find(f => f === sourceId);
        if (!backupFile) throw new Error('Backup file not found');

        const content = readFileSync(backupPathService.getBackupFilePath(backupFile), 'utf-8');
        const backup = JSON.parse(content) as { packages: BackupPackage[]; totalPackages: number; exportedAt: string };
        expectedPackages = backup.packages.map(p => ({ id: p.id, name: p.name, version: p.version, source: p.source }));
        sourceName = backupFile;
        break;
      }
      case 'collection': {
        const collection = CollectionService.getById(sourceId);
        if (!collection) throw new Error('Collection not found');
        expectedPackages = collection.packages
          .filter(p => p.id)
          .map(p => ({ id: p.id!, name: p.name || '', version: p.version || '', source: p.source || '' }));
        sourceName = collection.name;
        break;
      }
    }

    const expectedMap = new Map(expectedPackages.map(p => [p.id, p]));
    const drifts: DriftItem[] = [];

    // Check for missing or version-changed packages
    for (const expected of expectedPackages) {
      const current = currentMap.get(expected.id);
      if (!current) {
        drifts.push({
          id: expected.id,
          name: expected.name || expected.id,
          type: 'removed',
          expected: { version: expected.version, source: expected.source },
        });
      } else {
        if (current.version !== expected.version) {
          drifts.push({
            id: expected.id,
            name: current.name,
            type: 'version-changed',
            current: { version: current.version, source: current.source },
            expected: { version: expected.version, source: expected.source },
          });
        }
        if (current.source !== expected.source) {
          drifts.push({
            id: expected.id,
            name: current.name,
            type: 'source-changed',
            current: { version: current.version, source: current.source },
            expected: { version: expected.version, source: expected.source },
          });
        }
      }
    }

    // Check for added packages (in current but not in expected)
    const ignoredPackages = SettingsStore.getIgnoredPackages();
    const ignoredIds = new Set(ignoredPackages.map(p => p.id));
    
    for (const current of currentApps) {
      if (ignoredIds.has(current.id)) continue;
      if (!expectedMap.has(current.id)) {
        drifts.push({
          id: current.id,
          name: current.name,
          type: 'added',
          current: { version: current.version, source: current.source },
        });
      }
    }

    return {
      generatedAt: new Date().toISOString(),
      sourceType,
      sourceId,
      sourceName,
      totalDrifts: drifts.length,
      drifts,
    };
  }
}