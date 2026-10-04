import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { existsSync, writeFileSync } from 'fs';
import { isDev } from './utils/env.js';
import { dataPathService } from './services/paths/index.js';
import { WingetProvider } from './services/providers/WingetProvider.js';
import { updateQueueService } from './services/UpdateQueueService.js';
import { SettingsStore } from './services/SettingsStore.js';
import { ExportService } from './services/ExportService.js';
import { configService } from './services/config/index.js';
import { migrationService } from './services/migration/index.js';
import { ProcessGuard } from './services/ProcessGuard.js';
import { registerIpcHandlers } from './ipc/index.js';
import type { 
  QueueItem, 
  LogEntry, 
  ProgressEvent, 
  InstalledApp, 
  BackupPackage, 
  RestorePreviewItem, 
  RestoreOptions, 
  RestoreResult, 
  RestoreReport,
  Collection,
  CollectionExport,
  SystemSnapshot,
  SnapshotComparisonResult,
  DriftSource,
  DriftReport,
  HealthStats,
} from './services/types.js';

let mainWindow: BrowserWindow | null = null;
const provider = new WingetProvider();

// P6 safe-shutdown state:
// - forceClose: bypass the close-interception dialog (set by the force-quit
//   path and by the close-when-idle watcher once the queue drains).
// - closeWhenIdle: user chose "Close After Updates Finish".
let forceClose = false;
let closeWhenIdle = false;

/**
 * PCC v2.2 one-time notice: set when the legacy data folder was migrated at
 * startup ("Legacy PCC data successfully migrated."). The renderer pulls it
 * once via `app:getStartupNotice` and shows a toast, then it is cleared — so
 * the notice is shown exactly one time, and only on the run that migrated.
 */
let pendingStartupNotice: string | null = null;

/** Consume the pending startup notice (null when there is nothing to show). */
export function takeStartupNotice(): string | null {
  const notice = pendingStartupNotice;
  pendingStartupNotice = null;
  return notice;
}

function requestCloseWhenIdle(): void {
  logStartup('close-when-idle: waiting for active operations to finish');
  if (!updateQueueService.hasActiveOperations()) {
    forceClose = true;
    mainWindow?.close();
    return;
  }
  closeWhenIdle = true;
}

function forceQuitApp(): void {
  logStartup('force quit: terminating winget and exiting');
  void (async () => {
    try {
      await ProcessGuard.killWingetProcesses();
    } catch (error) {
      logStartup(`force quit: winget kill error: ${(error as Error).message}`);
    }
    updateQueueService.markActiveAsInterrupted('Stopped by user (force exit)');
    updateQueueService.persistState();
    forceClose = true;
    app.quit();
  })();
}

// Register all ipcMain.handle backends for the window.electronAPI.* surface
// (see src/preload/index.ts and src/main/ipc/index.ts).
registerIpcHandlers(provider, () => mainWindow, {
  requestCloseWhenIdle,
  forceQuit: forceQuitApp,
  takeStartupNotice,
});

// --- Theme helpers ------------------------------------------------------------
// The persisted choice lives in ConfigService (theme.mode). Only two themes
// are supported (dark/light); legacy 'system' values resolve to dark.

function titleBarOverlayFor(dark: boolean): Electron.TitleBarOverlay {
  return dark
    ? { color: '#1A1A2E', symbolColor: '#FFFFFF', height: 32 }
    : { color: '#F5F7FA', symbolColor: '#1F2937', height: 32 };
}

function currentThemeIsDark(): boolean {
  return configService.get('theme').mode !== 'light';
}


function createWindow(): void {
  const dark = currentThemeIsDark();
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: titleBarOverlayFor(dark),
    backgroundColor: dark ? '#1a1a2e' : '#F5F7FA',
    show: true,
  });

  logStartup('createWindow() called');
  logStartup('BrowserWindow created');

  // BrowserWindow diagnostics
  mainWindow.webContents.on('did-finish-load', () => {
    logStartup('did-finish-load: window finished loading');

    // Runtime verification (env-gated): walk every route and dump the
    // rendered text so a packaged run can prove each page loads data.
    if (process.env.PCC_VERIFY) {
      const verifyRoutes = ['', '/installed', '/updates', '/pinned', '/ignored', '/collections', '/snapshots', '/drift', '/settings'];
      const dumpPage = async (label: string): Promise<void> => {
        try {
          const out = await mainWindow?.webContents.executeJavaScript(`JSON.stringify({
            hash: window.location.hash,
            bodyText: (document.body.innerText || '').slice(0, 500)
          })`);
          logStartup(`PCC_VERIFY[${label}]: ${out}`);
        } catch (e) {
          logStartup(`PCC_VERIFY[${label}]-ERR: ${String(e)}`);
        }
      };
      const step = async (i: number): Promise<void> => {
        if (!mainWindow || mainWindow.isDestroyed()) return;
        if (i > 0) {
          try {
            await mainWindow.webContents.executeJavaScript(`window.location.hash = '${verifyRoutes[i]}';`);
          } catch {
            return;
          }
        }
        await new Promise(r => setTimeout(r, 9000));
        await dumpPage(verifyRoutes[i] || 'home');
        if (i + 1 < verifyRoutes.length) {
          await step(i + 1);
        }
      };
      setTimeout(() => {
        void step(0);
      }, 15000);
    }

    // Env-gated drag-region check: prove the renderer's title-bar elements
    // actually carry -webkit-app-region in the packaged app, then exit.
    if (process.env.PCC_DRAGCHECK) {
      setTimeout(() => {
        void (async () => {
          try {
            const out = await mainWindow?.webContents.executeJavaScript(`JSON.stringify({
              header: getComputedStyle(document.querySelector('header')).getPropertyValue('-webkit-app-region'),
              sidebarBrand: getComputedStyle(document.querySelector('aside > div > div')).getPropertyValue('-webkit-app-region'),
              sidebarToggle: getComputedStyle(document.querySelector('aside button')).getPropertyValue('-webkit-app-region')
            })`);
            logStartup(`PCC_DRAGCHECK: ${out}`);
          } catch (e) {
            logStartup(`PCC_DRAGCHECK-ERR: ${String(e)}`);
          } finally {
            app.quit();
          }
        })();
      }, 8000);
    }
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    const msg = `did-fail-load: errorCode=${errorCode}, errorDescription=${errorDescription}`;
    logStartup(msg);
  });

  mainWindow.webContents.on('dom-ready', () => {
    logStartup('dom-ready: renderer DOM ready');
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    const msg = `render-process-gone: ${JSON.stringify(details)}`;
    logStartup(msg);
  });

  // Force visible window
  mainWindow.show();
  logStartup('mainWindow.show() called');

  // Diagnostics (blank-screen investigation): open DevTools and capture all
  // renderer console messages into the startup log.
  // Gated: enabled in dev builds or packaged builds launched with PCC_DIAGNOSTICS=1.
  if (isDev || process.env.PCC_DIAGNOSTICS) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    logStartup('DevTools opened (detach)');
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      logStartup(`RENDERER_CONSOLE[level=${level}]: ${message} @ ${sourceId}:${line}`);
    });
  }

  mainWindow.once('ready-to-show', () => {
    logStartup('ready-to-show: window revealed');
    mainWindow?.focus();
  });

  mainWindow.on('focus', () => {
    logStartup('window: focused');
  });

  mainWindow.on('blur', () => {
    logStartup('window: blurred');
  });

  // P6 safe shutdown: intercept every close path (X button, Alt+F4,
  // menu exit) while updates are running. The renderer shows the choice
  // dialog and answers via window:close-choice.
  mainWindow.on('close', (event) => {
    if (forceClose) {
      logStartup('close: allowed (forceClose)');
      return;
    }
    if (updateQueueService.hasActiveOperations()) {
      event.preventDefault();
      const active = updateQueueService.getActiveOperations();
      logStartup(`close: intercepted — ${active.length} active operation(s)`);
      sendToRenderer('window:close-requested', {
        active: active.map((item) => ({
          id: item.id,
          name: item.packageName || item.packageId || 'All Packages',
          status: item.status,
        })),
      });
    } else {
      logStartup('close: allowed (no active operations)');
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    logStartup('dev mode: loaded URL http://localhost:5173 with DevTools');
  } else {
    const rendererPath = join(__dirname, '../renderer/index.html');
    logStartup(`loadFile: ${rendererPath}`);
    mainWindow.loadFile(rendererPath);
    logStartup('loadFile initiated');
  }
}

app.whenReady().then(async () => {
  logStartup('app.whenReady() resolved');

  // Run migration before creating window (PCC v2.2: single data root).
  const migrationResult = await migrationService.migrateIfNeeded();
  if (!migrationResult.success) {
    logStartup('Migration failed: ' + migrationResult.errors);
    console.error('Migration failed:', migrationResult.errors);
  } else if (migrationResult.notice) {
    // One-time user notice, e.g. "Legacy PCC data successfully migrated."
    pendingStartupNotice = migrationResult.notice;
    logStartup('Migration completed: ' + migrationResult.migrated);
    console.log(migrationResult.notice);
  }

  // Production paths logging (after app.isPackaged is valid)
  logStartup(`app.isPackaged: ${app.isPackaged}`);
  logStartup(`__dirname: ${__dirname}`);
  logStartup(`process.resourcesPath: ${process.resourcesPath}`);
  logStartup(`app.getAppPath(): ${app.getAppPath()}`);
  logStartup(`preload path: ${join(__dirname, '../preload/index.js')}`);
  logStartup(`renderer path: ${join(__dirname, '../renderer/index.html')}`);

  // Verify preload file existence
  const preloadPath = join(__dirname, '../preload/index.js');
  logStartup(`preload exists: ${existsSync(preloadPath)}`);
  if (!existsSync(preloadPath)) {
    logStartup(`ERROR: Preload file not found at ${preloadPath}`);
  }

  // Verify renderer file existence
  const rendererPath = join(__dirname, '../renderer/index.html');
  logStartup(`renderer index.html exists: ${existsSync(rendererPath)}`);
  if (!existsSync(rendererPath)) {
    logStartup(`ERROR: Renderer index.html not found at ${rendererPath}`);
  }

  // Restore queue state from the previous session (P6). Items that were
  // running/pending when the app last closed are demoted to failed.
  const restoredItems = updateQueueService.restoreState();
  if (restoredItems > 0) {
    logStartup(`Queue state restored: ${restoredItems} item(s)`);
  }

  createWindow();

  updateQueueService.subscribe((queue) => {
    sendToRenderer('queue:updated', queue);
    // P6: "Close After Updates Finish" — close automatically once the
    // queue has drained.
    if (closeWhenIdle && !queue.some((q) => q.status === 'pending' || q.status === 'running')) {
      closeWhenIdle = false;
      logStartup('close-when-idle: queue drained, closing now');
      forceClose = true;
      mainWindow?.close();
    }
  });

  updateQueueService.subscribeProgress((event) => {
    sendToRenderer('queue:progress', event);
  });

  updateQueueService.subscribeLogs((log) => {
    sendToRenderer('queue:log', log);
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      logStartup('activate: no windows, creating new window');
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  logStartup('window-all-closed: quitting app');
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// P6: save queue state before every exit (clean or forced) so history is
// not lost after an unclean shutdown.
app.on('before-quit', () => {
  logStartup('before-quit: persisting queue state');
  updateQueueService.persistState();
});

// Capture ALL startup exceptions
process.on('uncaughtException', (error) => {
  const msg = `uncaughtException: ${(error as Error).stack || (error as Error).message}`;
  logStartup(msg);
});

process.on('unhandledRejection', (reason) => {
  const reasonMsg = reason && (typeof reason === 'object' ? (reason as Error).stack || (reason as Error).message : String(reason));
  const msg = `unhandledRejection: ${reasonMsg}`;
  logStartup(msg);
});

app.on('render-process-gone', (event, details) => {
  const msg = `render-process-gone: ${JSON.stringify(details)}`;
  logStartup(msg);
});

app.on('child-process-gone', (event, details) => {
  const msg = `child-process-gone: ${JSON.stringify(details)}`;
  logStartup(msg);
});

function sendToRenderer(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

function logStartup(message: string): void {
  // PCC v2.2: the log location comes from DataPathService (single data root).
  const startupLogPath = dataPathService.getStartupLogFile();
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}`;
  try {
    dataPathService.ensureDir('logs');
    writeFileSync(startupLogPath, logLine + '\n', { flag: 'a' });
  } catch {
    // If logging fails, continue - don't block app start
  }
}
