import { join } from 'path';
import { homedir } from 'os';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  type Dirent,
} from 'fs';

/**
 * PCC v2.2 — single source of truth for the **reports** folder.
 *
 * Restore reports are written by `WingetProvider.generateRestoreReport()` and
 * read back by the `lastRestore` health statistic. Both sides previously hard-
 * coded the same pre-rebrand folder name ("Winget Control Center Reports"),
 * which meant the statistic was correct but the folder carried retired product
 * naming. This service owns the location in one place:
 *
 *     ~/Documents/Package Control Center Reports
 *
 * Backwards compatibility (automatic, one time):
 *  - when the pre-rebrand folder exists, its contents are COPIED in,
 *  - `migration-complete.flag` is written inside the canonical folder,
 *  - existing files are never overwritten,
 *  - the legacy folder is NEVER deleted — so a user who has never restored
 *    anything still sees the same (empty) result as before.
 *
 * The legacy folder name deliberately appears in exactly one place: this file.
 */

export const REPORTS_DIR_NAME = 'Package Control Center Reports';
export const LEGACY_REPORTS_DIR_NAME = 'Winget Control Center Reports';
export const REPORTS_MIGRATION_FLAG_FILE = 'migration-complete.flag';

export interface ReportPathMigrationResult {
  /** True when this call actually copied legacy reports across. */
  performed: boolean;
  /** File names that were copied. */
  migrated: string[];
  /** Files left untouched because the destination already had them. */
  skipped: string[];
  errors: string[];
}

/**
 * Resolves (and creates) the folder PCC writes restore reports to.
 *
 * Path getters are lazy so the one-time legacy migration always completes
 * before a report is written or the `lastRestore` stat is computed.
 */
export class ReportPathService {
  private static instance: ReportPathService;
  private migrationMemo: ReportPathMigrationResult | null = null;

  private constructor() {}

  public static getInstance(): ReportPathService {
    if (!ReportPathService.instance) {
      ReportPathService.instance = new ReportPathService();
    }
    return ReportPathService.instance;
  }

  /** Canonical reports folder (`~/Documents/Package Control Center Reports`). */
  public getReportsRoot(): string {
    return join(homedir(), 'Documents', REPORTS_DIR_NAME);
  }

  /** Pre-rebrand reports folder. Read once during migration, never written to. */
  public getLegacyReportsRoot(): string {
    return join(homedir(), 'Documents', LEGACY_REPORTS_DIR_NAME);
  }

  /** Create the reports folder if missing, and return it. */
  public ensureReportsRoot(): string {
    const root = this.getReportsRoot();
    if (!existsSync(root)) {
      mkdirSync(root, { recursive: true });
    }
    return root;
  }

  /** Absolute path to one report file inside the canonical folder. */
  public getReportFilePath(fileName: string): string {
    return join(this.getReportsRoot(), fileName);
  }

  /** Marker written after the legacy reports folder has been migrated once. */
  public getMigrationFlagFile(): string {
    return join(this.getReportsRoot(), REPORTS_MIGRATION_FLAG_FILE);
  }

  /** True once `migration-complete.flag` exists in the canonical folder. */
  public isMigrationComplete(): boolean {
    return existsSync(this.getMigrationFlagFile());
  }

  public hasLegacyReports(): boolean {
    return existsSync(this.getLegacyReportsRoot());
  }

  /** Legacy migration is pending: legacy reports exist and were never migrated. */
  public isMigrationNeeded(): boolean {
    return this.hasLegacyReports() && !this.isMigrationComplete();
  }


  /**
   * Copy the pre-rebrand reports folder into the canonical folder exactly once.
   *
   * Flat copy (restore reports sit directly in the folder), never overwrites,
   * never deletes the legacy folder, memoised per process.
   */
  public migrateLegacyReportsIfNeeded(): ReportPathMigrationResult {
    if (this.migrationMemo) {
      return this.migrationMemo;
    }

    const result: ReportPathMigrationResult = {
      performed: false,
      migrated: [],
      skipped: [],
      errors: [],
    };

    try {
      this.ensureReportsRoot();

      if (this.isMigrationComplete()) {
        return (this.migrationMemo = result);
      }

      const legacyRoot = this.getLegacyReportsRoot();
      if (!existsSync(legacyRoot)) {
        // Fresh install: nothing to migrate.
        return (this.migrationMemo = result);
      }

      this.copyFiles(legacyRoot, this.getReportsRoot(), result);
      this.writeMigrationFlag(legacyRoot, result);

      result.performed = result.migrated.length > 0 && result.errors.length === 0;
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown migration error');
    }

    return (this.migrationMemo = result);
  }

  /** Copy every file from source into destination without overwriting. */
  private copyFiles(source: string, destination: string, result: ReportPathMigrationResult): void {
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
      if (!entry.isFile()) continue; // reports folders hold flat files only

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

  /** Record that the legacy reports folder has been handled (write-once). */
  private writeMigrationFlag(legacyRoot: string, result: ReportPathMigrationResult): void {
    const payload = {
      migratedAt: new Date().toISOString(),
      legacyRoot,
      reportsRoot: this.getReportsRoot(),
      migrated: result.migrated,
      skipped: result.skipped,
    };
    writeFileSync(this.getMigrationFlagFile(), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  }

  /**
   * ISO timestamp of the most recent restore report, or null when the user
   * has never restored anything / the folder does not exist.
   *
   * This is the authoritative source for the `lastRestore` health statistic —
   * it reads the same folder `generateRestoreReport()` writes to, so the
   * statistic can never drift from reality.
   */
  public getLastRestoreTimestamp(): string | null {
    // Migrate first so reports written by older builds still count.
    this.migrateLegacyReportsIfNeeded();

    const root = this.getReportsRoot();
    if (!existsSync(root)) return null;

    let latest: Date | null = null;
    try {
      for (const entry of readdirSync(root)) {
        if (entry === REPORTS_MIGRATION_FLAG_FILE) continue;
        const st = statSync(join(root, entry));
        if (st.isFile() && (!latest || st.mtime > latest)) {
          latest = st.mtime;
        }
      }
    } catch {
      return null;
    }
    return latest ? latest.toISOString() : null;
  }
}

export const reportPathService = ReportPathService.getInstance();
