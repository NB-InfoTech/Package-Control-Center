import { dataPathService } from '../paths/index.js';
import { logger } from '../logging/index.js';

export interface MigrationResult {
  success: boolean;
  migrated: string[];
  errors: string[];
  skipped: string[];
  /**
   * One-time notice shown to the user after a successful legacy migration
   * ("Legacy PCC data successfully migrated."). Undefined otherwise.
   */
  notice?: string;
}

/**
 * Legacy data-folder migration (PCC v2.2).
 *
 * The copy itself lives in DataPathService — this service is the thin,
 * app-level wrapper: it runs the one-time migration at startup, reports the
 * result and exposes where the data lives. The legacy folder is never deleted.
 */
export class MigrationService {
  private static instance: MigrationService;
  private migrationDone = false;

  private constructor() {}

  public static getInstance(): MigrationService {
    if (!MigrationService.instance) {
      MigrationService.instance = new MigrationService();
    }
    return MigrationService.instance;
  }

  public async migrateIfNeeded(): Promise<MigrationResult> {
    if (this.migrationDone) {
      return { success: true, migrated: [], errors: [], skipped: ['Already migrated'] };
    }

    const result = dataPathService.migrateLegacyDataIfNeeded();

    const mapped: MigrationResult = {
      success: result.errors.length === 0,
      migrated: result.migrated,
      errors: result.errors,
      skipped: result.skipped,
      notice: result.notice,
    };

    if (mapped.success) {
      this.migrationDone = true;
      if (mapped.notice) {
        logger.info('Legacy PCC data successfully migrated', { migrated: mapped.migrated });
      }
    } else {
      logger.error('Legacy data migration failed', new Error(mapped.errors.join('; ')), {
        errors: mapped.errors,
      });
    }

    return mapped;
  }

  /** Canonical data root (`~/.package-control-center`). */
  public getNewConfigDir(): string {
    return dataPathService.getDataRoot();
  }

  /** Pre-rebrand folder, kept for reference only — never written or deleted. */
  public getOldConfigDir(): string {
    return dataPathService.getLegacyDataRoot();
  }

  public isMigrationNeeded(): boolean {
    return dataPathService.isMigrationNeeded();
  }
}

export const migrationService = MigrationService.getInstance();