import { app } from 'electron';
import { join } from 'path';
import { statSync } from 'fs';
import { dataPathService } from './paths/index.js';
import type { AppInfo } from './types.js';

/**
 * About-page app/system information (main process).
 *
 * Everything here is resolved at call time so the About page can never
 * show stale values:
 *  - name / version ......... Electron app metadata (package.json)
 *  - build date ............. mtime of the compiled main bundle (or the
 *                             packaged app / executable as a fallback)
 *  - architecture / platform  process.arch / process.platform
 *  - Electron/Node/Chrome ... process.versions
 *  - data directory ......... the PCC user-data folder, resolved from disk
 */

/**
 * The folder PCC keeps its user data in. After the PCC v2.2 unification this
 * is always the canonical root — the one-time legacy migration guarantees any
 * pre-rebrand data was copied there, so there is no second candidate.
 */
function resolveDataDirectory(): string {
  return dataPathService.getDataRoot();
}

/** Human-readable CPU architecture, auto-detected from process.arch. */
function resolveArchitecture(): string {
  switch (process.arch) {
    case 'x64':
      return 'x64';
    case 'arm64':
      return 'ARM64';
    case 'ia32':
      return 'x86';
    default:
      return process.arch;
  }
}

/** Human-readable platform name, auto-detected from process.platform. */
function resolvePlatform(): string {
  switch (process.platform) {
    case 'win32':
      return 'Windows';
    case 'darwin':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return process.platform;
  }
}

/**
 * Build timestamp (ISO). Prefers the compiled main bundle, then the
 * packaged app path, then the running executable; falls back to "now"
 * if none of them can be stat-ed.
 */
function resolveBuildDate(): string {
  const candidates: string[] = [join(__dirname, '../index.js')];
  if (app.isPackaged) {
    candidates.push(app.getAppPath());
  }
  candidates.push(process.execPath);

  for (const candidate of candidates) {
    try {
      return statSync(candidate).mtime.toISOString();
    } catch {
      // Candidate is missing on this platform/build — try the next one.
    }
  }
  return new Date().toISOString();
}

/** Collect the live application/system information for the About page. */
export function getAppInfo(): AppInfo {
  return {
    name: app.getName(),
    version: app.getVersion(),
    buildDate: resolveBuildDate(),
    architecture: resolveArchitecture(),
    platform: resolvePlatform(),
    electronVersion: process.versions.electron ?? 'unknown',
    nodeVersion: process.versions.node ?? 'unknown',
    chromeVersion: process.versions.chrome ?? 'unknown',
    dataDirectory: resolveDataDirectory(),
    packaged: app.isPackaged,
  };
}
