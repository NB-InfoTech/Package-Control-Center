import { createWriteStream, existsSync, statSync, renameSync, unlinkSync } from 'fs';
import { dataPathService } from '../paths/index.js';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  levelName: string;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const MAX_LOG_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_LOG_FILES = 5;
const DEFAULT_LOG_LEVEL = LogLevel.INFO;

// Resolved lazily through DataPathService (PCC v2.2) so the canonical data
// root is the only log location and the one-time legacy migration has already
// run by the time the first log line is written.
function logDir(): string {
  return dataPathService.getLogsDir();
}

function logFile(): string {
  return dataPathService.getApplicationLogFile();
}

function ensureLogDir(): void {
  dataPathService.ensureDir('logs');
}

function rotateLogs(): void {
  const LOG_FILE = logFile();
  try {
    if (!existsSync(LOG_FILE)) return;
    
    const stats = statSync(LOG_FILE);
    if (stats.size < MAX_LOG_SIZE) return;

    // Rotate existing logs
    for (let i = MAX_LOG_FILES - 1; i >= 1; i--) {
      const oldFile = `${LOG_FILE}.${i}`;
      const newFile = `${LOG_FILE}.${i + 1}`;
      
      if (existsSync(oldFile)) {
        if (i === MAX_LOG_FILES - 1) {
          unlinkSync(oldFile); // Delete oldest
        } else {
          renameSync(oldFile, newFile);
        }
      }
    }
    
    // Rotate current log
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch (error) {
    // Silently fail rotation to not break logging
    console.error('Log rotation failed:', error);
  }
}

function formatLogEntry(entry: LogEntry): string {
  const parts = [
    entry.timestamp,
    `[${entry.levelName}]`,
    entry.message,
  ];
  
  if (entry.context && Object.keys(entry.context).length > 0) {
    parts.push(JSON.stringify(entry.context));
  }
  
  if (entry.error) {
    parts.push(`Error: ${entry.error.name}: ${entry.error.message}`);
    if (entry.error.stack) {
      parts.push(entry.error.stack);
    }
  }
  
  return parts.join(' | ');
}

export class Logger {
  private static instance: Logger;
  private logLevel: LogLevel;
  private writeStream?: NodeJS.WritableStream;
  private buffer: LogEntry[] = [];
  private flushInterval?: NodeJS.Timeout;

  private constructor() {
    this.logLevel = DEFAULT_LOG_LEVEL;
    this.initialize();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private initialize(): void {
    ensureLogDir();
    rotateLogs();
    this.writeStream = createWriteStream(logFile(), { flags: 'a', encoding: 'utf-8' });
    
    // Flush buffer every 5 seconds
    this.flushInterval = setInterval(() => this.flush(), 5000);
    
    // Flush on exit
    process.on('exit', () => this.flush());
    process.on('beforeExit', () => this.flush());
  }

  public setLogLevel(level: LogLevel): void {
    this.logLevel = level;
  }

  public getLogLevel(): LogLevel {
    return this.logLevel;
  }

  public debug(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, context);
  }

  public info(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, 'INFO', message, context);
  }

  public warn(message: string, context?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, 'WARN', message, context);
  }

  public error(message: string, error?: Error, context?: Record<string, unknown>): void {
    this.log(LogLevel.ERROR, 'ERROR', message, context, error);
  }

  private log(level: LogLevel, levelName: string, message: string, context?: Record<string, unknown>, error?: Error): void {
    if (level < this.logLevel) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      levelName,
      message,
      context,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
    };

    this.buffer.push(entry);
    
    // Also log to console in development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === LogLevel.ERROR ? 'error' : level === LogLevel.WARN ? 'warn' : 'log';
      console[consoleMethod](formatLogEntry(entry));
    }
  }

  private flush(): void {
    if (this.buffer.length === 0 || !this.writeStream) return;

    const entries = this.buffer.splice(0, this.buffer.length);
    const output = entries.map(formatLogEntry).join('\n') + '\n';
    
    try {
      this.writeStream.write(output);
    } catch (error) {
      // Put entries back in buffer
      this.buffer.unshift(...entries);
      console.error('Failed to write log:', error);
    }
  }

  public destroy(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }
    this.flush();
    if (this.writeStream) {
      this.writeStream.end();
    }
  }
}

// Export a convenience function
export const logger = Logger.getInstance();