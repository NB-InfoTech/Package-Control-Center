import { join } from 'path';
import { homedir } from 'os';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  writeFileSync,
  type Dirent,
} from 'fs';

/**
 * PCC v2.2 — single source of truth for the **backup** folder.
 *
 * Backups live in the user's Documents folder (not the app data root), and two
 * different names were in play:
 *  - `ExportService` wrote to  "Package Control Center Backups"
 *  - `DriftDetectionService` read from "Winget Control Center Backups"
 *
 * Because the writer and the reader disagreed, backups created by PCC could
 * never be read back for drift detection. This service fixes that by being the
 * only place the path is declared:
 *
 *     ~/Documents/Package Control Center Backups
 *
 * Backwards compatibility (automatic, one time):
 *  - when the pre-rebrand folder exists, its contents are COPIED in,
 *  - `migration-complete.flag` is written inside the canonical folder,
 *  - existing files are never overwritten,
 *  - the legacy folder is NEVER deleted.
 *
 * The legacy folder name deliberately appears in exactly one place: this file.
 */

export const BACKUP_DIR_NAME = 'Package Control Center Backups';
export const LEGACY_BACKUP_DIR_NAME = 'Winget Control Center Backups';
export const BACKUP_MIGRATION_FLAG_FILE = 'migration-complete.flag';

/** Prefix used by backup files written by ExportService. */
export const BACKUP_FILE_PREFIX = 'installed-packages-';

export interface BackupPathMigrationResult {
  /** True when this call actually copied legacy backups across. */
  performed: boolean;
  /** File names that were copied. */
  migrated: string[];
  /** Files left untouched because the destination already had them. */
  skipped: string[];
  errors: string[];
}

/**
 * Resolves (and creates) the folder PCC stores package backups in.
 *
 * Path getters are lazy so the one-time legacy migration always completes
 * before any backup is written or read.
 */
export class BackupPathService {
  private static instance: BackupPathService;
  private migrationMemo: BackupPathMigrationResult | null = null;

  private constructor() {}

  public static getInstance(): BackupPathService {
    if (!BackupPathService.instance) {
      BackupPathService.instance = new BackupPathService();
    }
    return BackupPathService.instance;
  }

  /** Canonical backup folder (`~/Documents/Package Control Center Backups`). */
  public getBackupRoot(): string {
    return join(homedir(), 'Documents', BACKUP_DIR_NAME);
  }

  /** Pre-rebrand backup folder. Read once during migration, never written to. */
  public getLegacyBackupRoot(): string {
    return join(homedir(), 'Documents', LEGACY_BACKUP_DIR_NAME);
  }

  /** Create the backup folder if missing, and return it. */
  public ensureBackupRoot(): string {
    const root = this.getBackupRoot();
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true });
    }
    return root;
  }

  /** Absolute path to one backup file inside the canonical folder. */
  public getBackupFilePath(fileName: string): string {
    return join(this.getBackupRoot(), fileName);
  }

  /** Marker written after the legacy backup folder has been migrated once. */
  public getMigrationFlagFile(): string {
    return join(this.getBackupRoot(), BACKUP_MIGRATION_FLAG_FILE);
  }

  /** True once `migration-complete.flag` exists in the canonical folder. */
  public isMigrationComplete(): boolean {
    return existsSync(this.getMigrationFlagFile());
  }

  public hasLegacyBackups(): boolean {
    return existsSync(this.getLegacyBackupRoot());
  }

  /** Legacy migration is pending: legacy backups exist and were never migrated. */
  public isMigrationNeeded(): boolean {
    return this.hasLegacyBackups() && !this.isMigrationComplete();
  }

  /**
   * Copy the pre-rebrand backup folder into the canonical folder exactly once.
   *
   * Flat copy (backup files always sit directly in the folder), never
   * overwrites, never deletes the legacy folder, memoised per process.
   */
  public migrateLegacyBackupsIfNeeded(): BackupPathMigrationResult {
    if (this.migrationMemo) {
      return this.migrationMemo;
    }

    const result: BackupPathMigrationResult = {
      performed: false,
      migrated: [],
      skipped: [],
      errors: [],
    };

    try {
      this.ensureBackupRoot();

      if (this.isMigrationComplete()) {
        return (this.migrationMemo = result);
      }

      const legacyRoot = this.getLegacyBackupRoot();
      if (!existsSync(legacyRoot)) {
        // Fresh install: nothing to migrate.
        return (this.migrationMemo = result);
      }

      this.copyFiles(legacyRoot, this.getBackupRoot(), result);
      this.writeMigrationFlag(legacyRoot, result);

      result.performed = result.migrated.length > 0 && result.errors.length === 0;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown migration error');
    }

    return (this.migrationMemo = result);
  }

  /** Copy every file from source into destination without overwriting. */
  private copyFiles(source: string, destination: string, result: BackupPathMigrationResult): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(source, { withFileTypes: true });
    } catch (error) {
      result.errors.push(
        `Failed to read ${source}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue; // backup folders hold flat files only

      const target = join(destination, entry.name);
      try {
        if (existsSync(target)) {
          result.skipped.push(entry.name);
          continue;
        }
        copyFileSync(join(source, entry.name), target);
        result.migrated.push(entry.name);
      } catch (error) {
        result.errors.push(
          `Failed to migrate ${entry.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /** Record that the legacy backup folder has been handled (write-once). */
  private writeMigrationFlag(legacyRoot: string, result: BackupPathMigrationResult): void {
    const payload = {
      migratedAt: new Date().toISOString(),
      legacyRoot,
      backupRoot: this.getBackupRoot(),
      migrated: result.migrated,
      skipped: result.skipped,
    };
    writeFileSync(this.getMigrationFlagFile(), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }

  /**
   * Names of the backup files in the canonical folder (newest first).
   * Returns an empty list when the folder does not exist yet — callers treat
   * "no backups" as a normal state, never as an error.
   */
  public listBackupFiles(): string[] {
    if (!existsSync(this.getBackupRoot())) return [];
    try {
      return readdirSync(this.getBackupRoot())
        .filter(
          (file) =>
            file.startsWith(BACKUP_FILE_PREFIX) &&
            file.endsWith('.json') &&
            file !== BACKUP_MIGRATION_FLAG_FILE
        )
        .sort()
        .reverse();
    } catch {
      return [];
    }
  }
}

export const backupPathService = BackupPathService.getInstance();
