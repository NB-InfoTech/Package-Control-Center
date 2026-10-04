import { ErrorCode, ErrorCategory, AppError } from '../errors/index.js';

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: ValidationError[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface CollectionSchema {
  version: string;
  exportedAt: string;
  collection: {
    name: string;
    description?: string;
    isBuiltIn: boolean;
    createdAt: string;
    updatedAt: string;
    packages: Array<{
      id: string;
      name?: string;
      version?: string;
      source?: string;
    }>;
  };
}

export interface SnapshotSchema {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  totalPackages: number;
  packages: Array<{
    name: string;
    id: string;
    version: string;
    source: string;
  }>;
}

export interface BackupSchema {
  exportedAt: string;
  totalPackages: number;
  packages: Array<{
    name: string;
    id: string;
    version: string;
    source: string;
  }>;
}

export interface RestoreSchema {
  packageIds: string[];
  source?: string;
  acceptSourceAgreements?: boolean;
}

export class Validator {
  static validateCollection(data: unknown): ValidationResult<CollectionSchema> {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', message: 'Data must be an object', code: 'INVALID_TYPE' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    // Validate version
    if (!obj.version || typeof obj.version !== 'string') {
      errors.push({ field: 'version', message: 'Missing or invalid version', code: 'MISSING_VERSION' });
    }

    // Validate exportedAt
    if (!obj.exportedAt || typeof obj.exportedAt !== 'string' || !this.isValidISODate(obj.exportedAt)) {
      errors.push({ field: 'exportedAt', message: 'Missing or invalid exportedAt date', code: 'INVALID_DATE' });
    }

    // Validate collection
    if (!obj.collection || typeof obj.collection !== 'object') {
      errors.push({ field: 'collection', message: 'Missing or invalid collection object', code: 'MISSING_COLLECTION' });
    } else {
      const collection = obj.collection as Record<string, unknown>;
      
      if (!collection.name || typeof collection.name !== 'string') {
        errors.push({ field: 'collection.name', message: 'Missing or invalid collection name', code: 'MISSING_NAME' });
      }

      if (typeof collection.isBuiltIn !== 'boolean') {
        errors.push({ field: 'collection.isBuiltIn', message: 'Missing or invalid isBuiltIn flag', code: 'INVALID_BUILTIN' });
      }

      if (!collection.createdAt || typeof collection.createdAt !== 'string' || !this.isValidISODate(collection.createdAt)) {
        errors.push({ field: 'collection.createdAt', message: 'Missing or invalid createdAt date', code: 'INVALID_DATE' });
      }

      if (!collection.updatedAt || typeof collection.updatedAt !== 'string' || !this.isValidISODate(collection.updatedAt)) {
        errors.push({ field: 'collection.updatedAt', message: 'Missing or invalid updatedAt date', code: 'INVALID_DATE' });
      }

      if (!Array.isArray(collection.packages)) {
        errors.push({ field: 'collection.packages', message: 'Packages must be an array', code: 'INVALID_PACKAGES' });
      } else {
        collection.packages.forEach((pkg, index) => {
          if (!pkg || typeof pkg !== 'object') {
            errors.push({ field: `collection.packages[${index}]`, message: 'Package must be an object', code: 'INVALID_PACKAGE' });
          } else {
            const pkgObj = pkg as Record<string, unknown>;
            if (!pkgObj.id || typeof pkgObj.id !== 'string') {
              errors.push({ field: `collection.packages[${index}].id`, message: 'Missing or invalid package ID', code: 'MISSING_PACKAGE_ID' });
            }
            if (pkgObj.name !== undefined && typeof pkgObj.name !== 'string') {
              errors.push({ field: `collection.packages[${index}].name`, message: 'Package name must be a string', code: 'INVALID_NAME' });
            }
            if (pkgObj.version !== undefined && typeof pkgObj.version !== 'string') {
              errors.push({ field: `collection.packages[${index}].version`, message: 'Package version must be a string', code: 'INVALID_VERSION' });
            }
            if (pkgObj.source !== undefined && typeof pkgObj.source !== 'string') {
              errors.push({ field: `collection.packages[${index}].source`, message: 'Package source must be a string', code: 'INVALID_SOURCE' });
            }
          }
        });
      }
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? data as CollectionSchema : undefined,
      errors,
    };
  }

  static validateSnapshot(data: unknown): ValidationResult<SnapshotSchema> {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', message: 'Data must be an object', code: 'INVALID_TYPE' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    if (!obj.id || typeof obj.id !== 'string') {
      errors.push({ field: 'id', message: 'Missing or invalid snapshot ID', code: 'MISSING_ID' });
    }

    if (!obj.name || typeof obj.name !== 'string') {
      errors.push({ field: 'name', message: 'Missing or invalid snapshot name', code: 'MISSING_NAME' });
    }

    if (!obj.createdAt || typeof obj.createdAt !== 'string' || !this.isValidISODate(obj.createdAt)) {
      errors.push({ field: 'createdAt', message: 'Missing or invalid createdAt date', code: 'INVALID_DATE' });
    }

    if (typeof obj.totalPackages !== 'number' || obj.totalPackages < 0) {
      errors.push({ field: 'totalPackages', message: 'Invalid totalPackages', code: 'INVALID_COUNT' });
    }

    if (!Array.isArray(obj.packages)) {
      errors.push({ field: 'packages', message: 'Packages must be an array', code: 'INVALID_PACKAGES' });
    } else {
      obj.packages.forEach((pkg, index) => {
        if (!pkg || typeof pkg !== 'object') {
          errors.push({ field: `packages[${index}]`, message: 'Package must be an object', code: 'INVALID_PACKAGE' });
        } else {
          const pkgObj = pkg as Record<string, unknown>;
          if (!pkgObj.id || typeof pkgObj.id !== 'string') {
            errors.push({ field: `packages[${index}].id`, message: 'Missing or invalid package ID', code: 'MISSING_PACKAGE_ID' });
          }
          if (!pkgObj.name || typeof pkgObj.name !== 'string') {
            errors.push({ field: `packages[${index}].name`, message: 'Missing or invalid package name', code: 'MISSING_NAME' });
          }
          if (!pkgObj.version || typeof pkgObj.version !== 'string') {
            errors.push({ field: `packages[${index}].version`, message: 'Missing or invalid package version', code: 'MISSING_VERSION' });
          }
          if (!pkgObj.source || typeof pkgObj.source !== 'string') {
            errors.push({ field: `packages[${index}].source`, message: 'Missing or invalid package source', code: 'MISSING_SOURCE' });
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? data as SnapshotSchema : undefined,
      errors,
    };
  }

  static validateBackup(data: unknown): ValidationResult<BackupSchema> {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', message: 'Data must be an object', code: 'INVALID_TYPE' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    if (!obj.exportedAt || typeof obj.exportedAt !== 'string' || !this.isValidISODate(obj.exportedAt)) {
      errors.push({ field: 'exportedAt', message: 'Missing or invalid exportedAt date', code: 'INVALID_DATE' });
    }

    if (typeof obj.totalPackages !== 'number' || obj.totalPackages < 0) {
      errors.push({ field: 'totalPackages', message: 'Invalid totalPackages', code: 'INVALID_COUNT' });
    }

    if (!Array.isArray(obj.packages)) {
      errors.push({ field: 'packages', message: 'Packages must be an array', code: 'INVALID_PACKAGES' });
    } else {
      obj.packages.forEach((pkg, index) => {
        if (!pkg || typeof pkg !== 'object') {
          errors.push({ field: `packages[${index}]`, message: 'Package must be an object', code: 'INVALID_PACKAGE' });
        } else {
          const pkgObj = pkg as Record<string, unknown>;
          if (!pkgObj.id || typeof pkgObj.id !== 'string') {
            errors.push({ field: `packages[${index}].id`, message: 'Missing or invalid package ID', code: 'MISSING_PACKAGE_ID' });
          }
          if (!pkgObj.name || typeof pkgObj.name !== 'string') {
            errors.push({ field: `packages[${index}].name`, message: 'Missing or invalid package name', code: 'MISSING_NAME' });
          }
          if (!pkgObj.version || typeof pkgObj.version !== 'string') {
            errors.push({ field: `packages[${index}].version`, message: 'Missing or invalid package version', code: 'MISSING_VERSION' });
          }
          if (!pkgObj.source || typeof pkgObj.source !== 'string') {
            errors.push({ field: `packages[${index}].source`, message: 'Missing or invalid package source', code: 'MISSING_SOURCE' });
          }
        }
      });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? data as BackupSchema : undefined,
      errors,
    };
  }

  static validateRestoreOptions(data: unknown): ValidationResult<RestoreSchema> {
    const errors: ValidationError[] = [];

    if (!data || typeof data !== 'object') {
      errors.push({ field: 'root', message: 'Data must be an object', code: 'INVALID_TYPE' });
      return { valid: false, errors };
    }

    const obj = data as Record<string, unknown>;

    if (!Array.isArray(obj.packageIds)) {
      errors.push({ field: 'packageIds', message: 'packageIds must be an array', code: 'INVALID_PACKAGE_IDS' });
    } else {
      obj.packageIds.forEach((id, index) => {
        if (typeof id !== 'string' || !id.trim()) {
          errors.push({ field: `packageIds[${index}]`, message: 'Package ID must be a non-empty string', code: 'INVALID_PACKAGE_ID' });
        }
      });
    }

    if (obj.source !== undefined && typeof obj.source !== 'string') {
      errors.push({ field: 'source', message: 'Source must be a string', code: 'INVALID_SOURCE' });
    }

    if (obj.acceptSourceAgreements !== undefined && typeof obj.acceptSourceAgreements !== 'boolean') {
      errors.push({ field: 'acceptSourceAgreements', message: 'acceptSourceAgreements must be a boolean', code: 'INVALID_BOOLEAN' });
    }

    return {
      valid: errors.length === 0,
      data: errors.length === 0 ? data as RestoreSchema : undefined,
      errors,
    };
  }

  static validateJSON<T>(jsonString: string): ValidationResult<T> {
    try {
      const parsed = JSON.parse(jsonString);
      return { valid: true, data: parsed as T, errors: [] };
    } catch (error) {
      return {
        valid: false,
        errors: [{ field: 'root', message: 'Invalid JSON format', code: 'INVALID_JSON' }],
      };
    }
  }

  private static isValidISODate(dateString: string): boolean {
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString === date.toISOString();
  }

  static assertValid<T>(result: ValidationResult<T>, context: string = 'Validation'): T {
    if (!result.valid) {
      const messages = result.errors.map(e => `${e.field}: ${e.message}`).join('; ');
      throw new AppError({
        code: ErrorCode.SCHEMA_VALIDATION_FAILED,
        category: ErrorCategory.VALIDATION,
        message: `${context} failed: ${messages}`,
        context: { errors: result.errors },
        userMessage: `Invalid data format: ${messages}`,
      });
    }
    return result.data!;
  }
}