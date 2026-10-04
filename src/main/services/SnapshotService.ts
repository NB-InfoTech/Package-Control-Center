import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID as uuidv4 } from 'crypto';
import { dataPathService } from './paths/index.js';
import type { SystemSnapshot, SnapshotPackage, SnapshotComparisonResult, InstalledApp } from './providers/IUpdateProvider.js';
import { WingetProvider } from './providers/WingetProvider.js';

function snapshotsFilePath(): string {
  return dataPathService.getSnapshotsFile();
}

function ensureConfigDir(): void {
  dataPathService.ensureDir();
}

function loadSnapshots(): SystemSnapshot[] {
  ensureConfigDir();
  if (existsSync(snapshotsFilePath())) {
    try {
      const data = readFileSync(snapshotsFilePath(), 'utf-8');
      return JSON.parse(data) as SystemSnapshot[];
    } catch {
      return [];
    }
  }
  return [];
}

function saveSnapshots(snapshots: SystemSnapshot[]): void {
  ensureConfigDir();
  writeFileSync(snapshotsFilePath(), JSON.stringify(snapshots, null, 2), 'utf-8');
}

export class SnapshotService {
  static getAll(): SystemSnapshot[] {
    return loadSnapshots().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  static getById(id: string): SystemSnapshot | null {
    const snapshots = loadSnapshots();
    return snapshots.find(s => s.id === id) || null;
  }

  /**
   * Create a snapshot of installed packages.
   *
   * PCC v2.1: the caller passes the aggregated installed list (all active
   * providers, each row tagged with its provider) so snapshots preserve
   * source information across winget / chocolatey / msstore. When no list
   * is passed we fall back to the winget-only list (legacy behavior).
   */
  static async create(name: string, description?: string, apps?: InstalledApp[]): Promise<SystemSnapshot> {
    let list = apps;
    if (!list) {
      const provider = new WingetProvider();
      list = await provider.getInstalledApps();
    }

    const packages: SnapshotPackage[] = list.map(app => ({
      name: app.name,
      id: app.id,
      version: app.version,
      source: app.source,
    }));

    const now = new Date().toISOString();
    const snapshot: SystemSnapshot = {
      id: uuidv4(),
      name,
      description,
      createdAt: now,
      totalPackages: packages.length,
      packages,
    };

    const snapshots = loadSnapshots();
    snapshots.push(snapshot);
    saveSnapshots(snapshots);

    return snapshot;
  }

  static delete(id: string): boolean {
    const snapshots = loadSnapshots();
    const index = snapshots.findIndex(s => s.id === id);
    if (index === -1) return false;

    snapshots.splice(index, 1);
    saveSnapshots(snapshots);
    return true;
  }

  static compare(id1: string, id2: string): SnapshotComparisonResult {
    const snap1 = this.getById(id1);
    const snap2 = this.getById(id2);

    if (!snap1 || !snap2) {
      throw new Error('One or both snapshots not found');
    }

    const map1 = new Map(snap1.packages.map(p => [p.id, p]));
    const map2 = new Map(snap2.packages.map(p => [p.id, p]));

    const added: SnapshotPackage[] = [];
    const removed: SnapshotPackage[] = [];
    const versionChanged: { id: string; name: string; oldVersion: string; newVersion: string }[] = [];
    let unchanged = 0;

    // Check snap2 against snap1
    for (const pkg of snap2.packages) {
      const existing = map1.get(pkg.id);
      if (!existing) {
        added.push(pkg);
      } else if (existing.version !== pkg.version) {
        versionChanged.push({
          id: pkg.id,
          name: pkg.name,
          oldVersion: existing.version,
          newVersion: pkg.version,
        });
      } else if (existing.source !== pkg.source) {
        // Source changed - treat as version changed for tracking
        versionChanged.push({
          id: pkg.id,
          name: pkg.name,
          oldVersion: `${existing.version} (${existing.source})`,
          newVersion: `${pkg.version} (${pkg.source})`,
        });
      } else {
        unchanged++;
      }
    }

    // Check for removed packages
    for (const pkg of snap1.packages) {
      if (!map2.has(pkg.id)) {
        removed.push(pkg);
      }
    }

    return { added, removed, versionChanged, unchanged };
  }
}