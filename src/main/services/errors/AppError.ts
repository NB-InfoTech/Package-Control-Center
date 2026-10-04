export enum ErrorCategory {
  SYSTEM = 'SYSTEM',
  WINGET = 'WINGET',
  FILE_SYSTEM = 'FILE_SYSTEM',
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  PERMISSION = 'PERMISSION',
  UNKNOWN = 'UNKNOWN',
}

export enum ErrorCode {
  // System errors
  WINGET_NOT_FOUND = 'WINGET_NOT_FOUND',
  WINGET_VERSION_UNSUPPORTED = 'WINGET_VERSION_UNSUPPORTED',
  PROCESS_SPAWN_FAILED = 'PROCESS_SPAWN_FAILED',
  PROCESS_TIMEOUT = 'PROCESS_TIMEOUT',
  
  // Winget operation errors
  INSTALL_FAILED = 'INSTALL_FAILED',
  UPGRADE_FAILED = 'UPGRADE_FAILED',
  UNINSTALL_FAILED = 'UNINSTALL_FAILED',
  PIN_FAILED = 'PIN_FAILED',
  UNPIN_FAILED = 'UNPIN_FAILED',
  LIST_FAILED = 'LIST_FAILED',
  SHOW_FAILED = 'SHOW_FAILED',
  SEARCH_FAILED = 'SEARCH_FAILED',
  
  // File system errors
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_READ_FAILED = 'FILE_READ_FAILED',
  FILE_WRITE_FAILED = 'FILE_WRITE_FAILED',
  DIRECTORY_CREATE_FAILED = 'DIRECTORY_CREATE_FAILED',
  INVALID_BACKUP_FILE = 'INVALID_BACKUP_FILE',
  INVALID_COLLECTION_FILE = 'INVALID_COLLECTION_FILE',
  INVALID_SNAPSHOT_FILE = 'INVALID_SNAPSHOT_FILE',
  INVALID_RESTORE_FILE = 'INVALID_RESTORE_FILE',
  BACKUP_CORRUPTED = 'BACKUP_CORRUPTED',
  
  // Network errors
  NETWORK_UNAVAILABLE = 'NETWORK_UNAVAILABLE',
  DOWNLOAD_FAILED = 'DOWNLOAD_FAILED',
  SOURCE_UNREACHABLE = 'SOURCE_UNREACHABLE',
  
  // Validation errors
  INVALID_JSON = 'INVALID_JSON',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_FIELD_FORMAT = 'INVALID_FIELD_FORMAT',
  SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED',
  DUPLICATE_ENTRY = 'DUPLICATE_ENTRY',
  
  // Permission errors
  ACCESS_DENIED = 'ACCESS_DENIED',
  ADMIN_REQUIRED = 'ADMIN_REQUIRED',
  SOURCE_AGREEMENT_REQUIRED = 'SOURCE_AGREEMENT_REQUIRED',
  
  // Queue errors
  QUEUE_OPERATION_FAILED = 'QUEUE_OPERATION_FAILED',
  QUEUE_ALREADY_RUNNING = 'QUEUE_ALREADY_RUNNING',
  
  // Unknown
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppErrorOptions {
  code: ErrorCode;
  category: ErrorCategory;
  message: string;
  originalError?: Error;
  context?: Record<string, unknown>;
  recoverable?: boolean;
  userMessage?: string;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly category: ErrorCategory;
  public readonly originalError?: Error;
  public readonly context: Record<string, unknown>;
  public readonly recoverable: boolean;
  public readonly userMessage: string;
  public readonly timestamp: Date;
  public readonly stack?: string;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.category = options.category;
    this.originalError = options.originalError;
    this.context = options.context || {};
    this.recoverable = options.recoverable ?? true;
    this.userMessage = options.userMessage || this.generateUserMessage();
    this.timestamp = new Date();
    
    // Capture stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  private generateUserMessage(): string {
    const userMessages: Record<ErrorCode, string> = {
      [ErrorCode.WINGET_NOT_FOUND]: 'Winget is not installed or not in PATH. Please install Winget from the Microsoft Store.',
      [ErrorCode.WINGET_VERSION_UNSUPPORTED]: 'Your Winget version is not supported. Please update to the latest version.',
      [ErrorCode.PROCESS_SPAWN_FAILED]: 'Failed to start the operation. Please try again.',
      [ErrorCode.PROCESS_TIMEOUT]: 'The operation timed out. Please try again with a longer timeout.',
      [ErrorCode.INSTALL_FAILED]: 'Failed to install the package. Check the logs for details.',
      [ErrorCode.UPGRADE_FAILED]: 'Failed to upgrade the package. Check the logs for details.',
      [ErrorCode.UNINSTALL_FAILED]: 'Failed to uninstall the package. Check the logs for details.',
      [ErrorCode.PIN_FAILED]: 'Failed to pin the package. Check the logs for details.',
      [ErrorCode.UNPIN_FAILED]: 'Failed to unpin the package. Check the logs for details.',
      [ErrorCode.LIST_FAILED]: 'Failed to list packages. Check the logs for details.',
      [ErrorCode.SHOW_FAILED]: 'Failed to show package details. Check the logs for details.',
      [ErrorCode.SEARCH_FAILED]: 'Failed to search for packages. Check the logs for details.',
      [ErrorCode.FILE_NOT_FOUND]: 'The specified file was not found.',
      [ErrorCode.FILE_READ_FAILED]: 'Failed to read the file. Check permissions.',
      [ErrorCode.FILE_WRITE_FAILED]: 'Failed to write the file. Check permissions and disk space.',
      [ErrorCode.DIRECTORY_CREATE_FAILED]: 'Failed to create directory. Check permissions.',
      [ErrorCode.INVALID_BACKUP_FILE]: 'The backup file is invalid or corrupted.',
      [ErrorCode.INVALID_COLLECTION_FILE]: 'The collection file is invalid or corrupted.',
      [ErrorCode.INVALID_SNAPSHOT_FILE]: 'The snapshot file is invalid or corrupted.',
      [ErrorCode.INVALID_RESTORE_FILE]: 'The restore file is invalid or corrupted.',
      [ErrorCode.BACKUP_CORRUPTED]: 'The backup file appears to be corrupted.',
      [ErrorCode.NETWORK_UNAVAILABLE]: 'Network is unavailable. Please check your connection.',
      [ErrorCode.DOWNLOAD_FAILED]: 'Failed to download the package. Check your connection.',
      [ErrorCode.SOURCE_UNREACHABLE]: 'The package source is unreachable. Try a different source.',
      [ErrorCode.INVALID_JSON]: 'The file contains invalid JSON.',
      [ErrorCode.MISSING_REQUIRED_FIELD]: 'A required field is missing from the file.',
      [ErrorCode.INVALID_FIELD_FORMAT]: 'A field has an invalid format.',
      [ErrorCode.SCHEMA_VALIDATION_FAILED]: 'The file does not match the expected schema.',
      [ErrorCode.DUPLICATE_ENTRY]: 'This entry already exists.',
      [ErrorCode.ACCESS_DENIED]: 'Access denied. Please run as administrator.',
      [ErrorCode.ADMIN_REQUIRED]: 'This operation requires administrator privileges.',
      [ErrorCode.SOURCE_AGREEMENT_REQUIRED]: 'Source agreement required. Use --accept-source-agreements.',
      [ErrorCode.QUEUE_OPERATION_FAILED]: 'Queue operation failed. Check the logs for details.',
      [ErrorCode.QUEUE_ALREADY_RUNNING]: 'An operation is already running in the queue.',
      [ErrorCode.UNKNOWN_ERROR]: 'An unknown error occurred. Check the logs for details.',
    };

    return userMessages[this.code] || this.message;
  }

  public toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      category: this.category,
      message: this.message,
      userMessage: this.userMessage,
      context: this.context,
      recoverable: this.recoverable,
      timestamp: this.timestamp.toISOString(),
      originalError: this.originalError?.message,
      stack: this.stack,
    };
  }

  public static isAppError(error: unknown): error is AppError {
    return error instanceof AppError;
  }

  public static fromUnknown(error: unknown, defaultCode: ErrorCode = ErrorCode.UNKNOWN_ERROR, defaultCategory: ErrorCategory = ErrorCategory.UNKNOWN): AppError {
    if (AppError.isAppError(error)) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError({
        code: defaultCode,
        category: defaultCategory,
        message: error.message,
        originalError: error,
      });
    }

    return new AppError({
      code: defaultCode,
      category: defaultCategory,
      message: String(error),
    });
  }
}