import { CommandExecutor } from './CommandExecutor.js';

/**
 * Elevation detection for PCC (Chocolatey elevation fix).
 *
 * Pure module — no electron imports — so it can be exercised from plain
 * Node verification scripts as well as the main process.
 *
 * Windows integrity levels:
 *  - elevated (admin) token  -> "High Mandatory Level" (S-1-16-12288)
 *  - standard user token     -> "Medium Mandatory Level" (S-1-16-8192)
 *
 * `whoami /groups` reports the integrity label of the current process,
 * which is a reliable, dependency-free elevation check.
 */

const CACHE_TTL_MS = 30000;

let cache: { at: number; value: boolean } | null = null;

/**
 * True when the current process runs with an elevated (administrator)
 * token. Non-Windows platforms report true (no UAC model there).
 */
export async function isAdministrator(): Promise<boolean> {
  if (process.platform !== 'win32') return true;
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.value;
  try {
    const result = await CommandExecutor.execute('whoami', ['/groups'], { timeout: 10000 });
    const elevated = /S-1-16-12288|High Mandatory Level/i.test(result.stdout);
    cache = { at: Date.now(), value: elevated };
    return elevated;
  } catch {
    // Could not verify: report NOT elevated so the UI offers the safe path
    // (restart as admin) instead of attempting privileged operations blind.
    return false;
  }
}

/** Invalidate the cache (e.g. after a relaunch flow completes). */
export function clearAdminCache(): void {
  cache = null;
}