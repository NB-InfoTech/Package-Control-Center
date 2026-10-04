/**
 * Translates raw winget / Windows error strings into friendly,
 * actionable messages for the UI (PCC v2.0.1).
 *
 * Used by the update queue so that queue items and toasts show
 * human-readable explanations instead of raw HRESULTs.
 */

export interface TranslatedError {
  /** Short, user-friendly one-line message. */
  friendly: string;
  /** Longer explanation of what happened and what to do. */
  detail: string;
  /** Extracted HRESULT/code when present, e.g. "0x80070020". */
  code?: string;
  /** True when the failure is "file in use" (0x80070020). */
  inUse: boolean;
  /** True when the failure is network / store related. */
  network: boolean;
}

const IN_USE_RE = /0x80070020|ERROR_SHARING_VIOLATION|being used by another process/i;
const NETWORK_CODE_RE = /0x80072ee2|0x80072f7d|0x80072ee7/i;
const ELEVATION_RE = /0x800704c7|ELEVATION_REQUIRED|elevation required/i;
const ACCESS_DENIED_RE = /0x80070005|access is denied|access denied/i;
const NOT_FOUND_RE = /no winget package found|no package found|unable to find|not found in the specified/i;
const NO_UPGRADE_RE = /no upgrade available|no upgrades available/i;
const WORKER_RE = /a worker died unexpectedly|worker process/i;
const TIMEOUT_RE = /timed out after|command timed out|operation timed out|store timeout|network timeout/i;
const SOURCE_RE = /0x800f081f|could not verify the source|source list/i;
const PATH_RE = /0x80070643|path not found/i;
const SPAWN_RE = /failed to spawn|cannot find the file specified|is not recognized/i;

function extractCode(raw: string): string | undefined {
  const m = raw.match(/0x[0-9a-f]{8}/i);
  return m ? m[0].toUpperCase() : undefined;
}

/** First meaningful line of a raw winget error block. */
function firstMeaningfulLine(raw: string): string {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !/^[\\\-|/ .]+$/.test(l));
  for (const line of lines) {
    if (/^\d+$/.test(line)) continue; // progress numbers
    return line.length > 180 ? line.slice(0, 180) + '…' : line;
  }
  return raw.trim() || 'Unknown error';
}

/**
 * Translate a raw error string (winget stdout/stderr or our own
 * executor message) into a friendly representation.
 */
export function translateWingetError(raw: string | undefined | null): TranslatedError {
  const text = raw ?? '';
  const code = extractCode(text);

  if (IN_USE_RE.test(text)) {
    return {
      friendly: 'Application currently in use',
      detail:
        'The package files are locked by a running program. Close the application (or use ' +
        '“Stop & Retry”) and try again.',
      code: code ?? '0x80070020',
      inUse: true,
      network: false,
    };
  }

  if (NETWORK_CODE_RE.test(text)) {
    return {
      friendly: 'Network or Store timeout',
      detail: 'Winget could not reach the network or the package source in time. Check your connection and retry.',
      code: code ?? '0x80072ee2',
      inUse: false,
      network: true,
    };
  }

  if (ELEVATION_RE.test(text)) {
    return {
      friendly: 'Administrator rights required',
      detail: 'This update requires elevation. Run Package Control Center as administrator and retry.',
      code: code ?? '0x800704C7',
      inUse: false,
      network: false,
    };
  }

  if (ACCESS_DENIED_RE.test(text)) {
    return {
      friendly: 'Access denied',
      detail: 'Windows blocked the update. Try running Package Control Center as administrator.',
      code: code ?? '0x80070005',
      inUse: false,
      network: false,
    };
  }

  if (NO_UPGRADE_RE.test(text)) {
    return {
      friendly: 'No update available',
      detail: 'The package is already up to date (winget reported no upgrade for it).',
      code,
      inUse: false,
      network: false,
    };
  }

  if (NOT_FOUND_RE.test(text)) {
    return {
      friendly: 'Package not found in sources',
      detail: 'Winget could not find the package in the configured sources. Try refreshing sources (winget source update).',
      code,
      inUse: false,
      network: false,
    };
  }

  if (WORKER_RE.test(text)) {
    return {
      friendly: 'Winget internal error',
      detail: 'A winget worker process crashed. Retry the update, or run it manually from a terminal (winget upgrade --id …).',
      code,
      inUse: false,
      network: false,
    };
  }

  if (TIMEOUT_RE.test(text)) {
    return {
      friendly: 'Operation timed out',
      detail: 'The download or installation took too long. Your connection may be slow, or the source may be unreachable. Retry when convenient.',
      code,
      inUse: false,
      network: true,
    };
  }

  if (SOURCE_RE.test(text)) {
    return {
      friendly: 'Source list could not be verified',
      detail: 'Winget could not verify its source list. Run “winget source update” in a terminal, then retry.',
      code,
      inUse: false,
      network: true,
    };
  }

  if (PATH_RE.test(text)) {
    return {
      friendly: 'Source path not found',
      detail: 'The package source location does not exist anymore. Refresh sources and retry.',
      code,
      inUse: false,
      network: false,
    };
  }

  if (SPAWN_RE.test(text)) {
    return {
      friendly: 'Winget could not be started',
      detail: 'Package Control Center could not launch the winget executable. Verify that Winget is installed and in your PATH.',
      code,
      inUse: false,
      network: false,
    };
  }

  return {
    friendly: firstMeaningfulLine(text) || 'Update failed',
    detail: text.trim(),
    code,
    inUse: false,
    network: false,
  };
}
