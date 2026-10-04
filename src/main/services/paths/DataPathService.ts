import { join } from 'path';
import { homedir } from 'os';
import {
  existsSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  type Dirent,
} from 'fs';

/**
 * PCC v2.2 — single source of truth for every on-disk PCC location.
 *
 * Before this service existed the data root was declared independently in
 * seven different places, and two folder names were in play
 * (`~/.winget-control-center` for the pre-rebrand stores,
 * `~/.package-control-center` for the rest). Every store now resolves its
 * path through this class, so the canonical location is stated exactly once:
 *
 *     ~/.package-control-center      <- the only folder PCC reads or writes
 *
 * Backwards compatibility (automatic, one time):
 *  - when `~/.winget-control-center` exists and no migration has been
 *    performed, its content is COPIED into the canonical root (settings,
 *    collections, snapshots, backups, logs, queue state and any other user
 *    data),
 *  - `migration-complete.flag` is written inside the new directory,
 *  - the legacy folder is NEVER deleted — the user can inspect or remove it.
 *
 * The legacy folder name deliberately appears in exactly one place: this file.
 */

export const DATA_ROOT_DIR_NAME = '.package-control-center';
export const LEGACY_DATA_ROOT_DIR_NAME = '.winget-control-center';
export const MIGRATION_FLAG_FILE = 'migration-complete.flag';

/** One-time user-facing notice shown after a successful legacy migration. */
export const LEGACY_MIGRATION_NOTICE = 'Legacy PCC data successfully migrated.';

export interface DataPathMigrationResult {
  /** True when this call actually copied legacy data into the canonical root. */
  performed: boolean;
  /** Relative paths (inside the data root) that were copied. */
  migrated: string[];
  /** Already-present files left untouched (never overwritten). */
  skipped: string[];
  errors: string[];
  /** Set once, when a legacy migration succeeded — drives the notice. */
  notice?: string;
}

/**
 * Resolves and creates every path PCC persists data to.
 *
 * All path getters are lazy (never module-level constants) so the one-time
 * legacy migration always runs before a store touches the disk.
 */
export class DataPathService {
  private static instance: DataPathService;
  private migrationMemo: DataPathMigrationResult | null = null;

  private constructor() {}

  public static getInstance(): DataPathService {
    if (!DataPathService.instance) {
      DataPathService.instance = new DataPathService();
    }
    return DataPathService.instance;
  }

  // --- roots -----------------------------------------------------------------

  /** Canonical PCC data root (`~/.package-control-center`). */
  public getDataRoot(): string {
    return join(homedir(), DATA_ROOT_DIR_NAME);
  }

  /** Pre-rebrand data root. Read once during migration, never written to. */
  public getLegacyDataRoot(): string {
    return join(homedir(), LEGACY_DATA_ROOT_DIR_NAME);
  }

  /** Absolute path inside the canonical root, e.g. `file('logs')`. */
  public getPath(...segments: string[]): string {
    return join(this.getDataRoot(), ...segments);
  }

  /** Create the canonical root (and any nested directory) if missing. */
  public ensureDir(...segments: string[]): string {
    const target = segments.length ? this.getPath(...segments) : this.getDataRoot();
    if (!existsSync(target)) {
      mkdirSync(target, { recursive: true });
    }
    return target;
  }

  // --- well-known store files ------------------------------------------------

  /** AppConfig (settings). */
  public getConfigFile(): string {
    return this.getPath('config.json');
  }

  /** Ignore-list store. */
  public getIgnoredPackagesFile(): string {
    return this.getPath('ignored-packages.json');
  }

  /** Pin-list store. */
  public getPinnedPackagesFile(): string {
    return this.getPath('pinned-packages.json');
  }

  /** Package collections store. */
  public getCollectionsFile(): string {
    return this.getPath('collections.json');
  }

  /** System snapshots store. */
  public getSnapshotsFile(): string {
    return this.getPath('snapshots.json');
  }

  /** Persisted update-queue state (safe-shutdown snapshot). */
  public getQueueStateFile(): string {
    return this.getPath('queue-state.json');
  }

  /** Application + startup logs. */
  public getLogsDir(): string {
    return this.getPath('logs');
  }

  public getApplicationLogFile(): string {
    return join(this.getLogsDir(), 'application.log');
  }

  public getStartupLogFile(): string {
    return join(this.getLogsDir(), 'startup.log');
  }

  /** Automatic package backups kept inside the data root. */
  public getBackupsDir(): string {
    return this.getPath('backups');
  }

  /** Marker written after the legacy folder has been migrated once. */
  public getMigrationFlagFile(): string {
    return this.getPath(MIGRATION_FLAG_FILE);
  }

  // --- legacy migration ------------------------------------------------------

  /** True once `migration-complete.flag` exists inside the canonical root. */
  public isMigrationComplete(): boolean {
    return existsSync(this.getMigrationFlagFile());
  }

  /** True when a pre-rebrand folder is still present on disk. */
  public hasLegacyData(): boolean {
    return existsSync(this.getLegacyDataRoot());
  }

  /** Legacy migration is pending: legacy data exists and was never migrated. */
  public isMigrationNeeded(): boolean {
    return this.hasLegacyData() && !this.isMigrationComplete();
  }
/**
   * Copy the pre-rebrand data folder into the canonical root exactly once.
   *
   * Rules:
   *  - never runs when `migration-complete.flag` exists (and is memoised per
   *    process, so repeated calls are free),
   *  - never overwrites a file that already exists in the canonical root,
   *  - never deletes or renames the legacy folder,
   *  - runs at most once per process (later calls return the memo).
   */
  public migrateLegacyDataIfNeeded(): DataPathMigrationResult {
    if (this.migrationMemo) {
      return this.migrationMemo;
    }

    const result: DataPathMigrationResult = {
      performed: false,
      migrated: [],
      skipped: [],
      errors: [],
    };

    try {
      // The canonical root must exist before the flag can be written into it.
      this.ensureDir();

      if (this.isMigrationComplete()) {
        return (this.migrationMemo = result);
      }

      const legacyRoot = this.getLegacyDataRoot();
      if (!existsSync(legacyRoot)) {
        // Fresh install: nothing to migrate, nothing to remember.
        return (this.migrationMemo = result);
      }

      this.copyTree(legacyRoot, this.getDataRoot(), result);
      this.writeMigrationFlag(legacyRoot, result);

      if (result.errors.length === 0) {
        result.performed = result.migrated.length > 0;
        if (result.performed) {
          result.notice = LEGACY_MIGRATION_NOTICE;
        }
      }
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : 'Unknown migration error');
    }

    return (this.migrationMemo = result);
  }

  /**
   * Recursively copy `source` into `destination`.
   *
   * Existing destination files are left untouched (the canonical root always
   * wins), so a partially-populated new folder is never clobbered.
   */
  private copyTree(
    source: string,
    destination: string,
    result: DataPathMigrationResult,
    relative = ''
  ): void {
    let entries: Dirent[];
    try {
      entries = readdirSync(source, { withFileTypes: true });
    } catch (error) {
      result.errors.push(
        `Failed to read ${relative || source}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return;
    }

    for (const entry of entries) {
      const sourcePath = join(source, entry.name);
      const destinationPath = join(destination, entry.name);
      const relativePath = relative ? `${relative}/${entry.name}` : entry.name;

      try {
        if (entry.isDirectory()) {
          if (!existsSync(destinationPath)) {
            mkdirSync(destinationPath, { recursive: true });
          }
          this.copyTree(sourcePath, destinationPath, result, relativePath);
          continue;
        }

        if (!entry.isFile()) {
          // Symlinks / sockets are not PCC data — skip them deliberately.
          continue;
        }

        if (existsSync(destinationPath)) {
          result.skipped.push(relativePath);
          continue;
        }

        copyFileSync(sourcePath, destinationPath);
        result.migrated.push(relativePath);
      } catch (error) {
        result.errors.push(
          `Failed to migrate ${relativePath}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
  }

  /** Record that the legacy folder has been handled (write-once). */
  private writeMigrationFlag(legacyRoot: string, result: DataPathMigrationResult): void {
    const payload = {
      migratedAt: new Date().toISOString(),
      legacyRoot,
      dataRoot: this.getDataRoot(),
      migrated: result.migrated,
      skipped: result.skipped,
    };
    writeFileSync(this.getMigrationFlagFile(), `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    result.migrated.push(MIGRATION_FLAG_FILE);
  }

  /**
   * Contents of `migration-complete.flag`, or null when the migration has
   * never run. Lets the About page surface where user data lives.
   */
  public readMigrationFlag(): { migratedAt: string; legacyRoot: string } | null {
    try {
      const raw = readFileSync(this.getMigrationFlagFile(), 'utf-8');
      const parsed = JSON.parse(raw) as { migratedAt?: string; legacyRoot?: string };
      if (!parsed.migratedAt) return null;
      return { migratedAt: parsed.migratedAt, legacyRoot: parsed.legacyRoot ?? '' };
    } catch {
      return null;
    }
  }
}

export const dataPathService = DataPathService.getInstance();