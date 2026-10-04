import { CommandResult } from './CommandExecutor.js';
import { InstalledApp, AvailableUpdate, UpgradeResult, ParseAudit, ProviderId } from './types.js';

/**
 * Normalize any winget source column value to a PCC provider id.
 * Unknown / empty sources default to 'winget' (the community source).
 */
export function normalizeProviderId(source: string | undefined | null): ProviderId {
  const s = (source ?? '').trim().toLowerCase();
  if (s === 'msstore' || s === 'microsoftstore' || s === 'store') return 'msstore';
  return 'winget';
}

/**
 * Winget Output Parsers (PCC v2.0.1 — hardened).
 *
 * NOTE: As of winget v1.29.380, the `list` and `upgrade` commands do not
 * support `--output json`. Output is a fixed-width table.
 *
 * Robustness rules (lessons from the 2.0.0 "missing update" incident):
 *  1. Normalization: CRLF -> LF, remaining CR (spinner frames) -> LF,
 *     ANSI escape sequences stripped, control chars removed. Each
 *     spinner frame becomes its own (ignored) line instead of corrupting
 *     the header row.
 *  2. Column extraction is offset-based: column start positions are read
 *     from the header row itself, so names containing extra spaces can
 *     no longer shift columns.
 *  3. No silent drops: every non-table line after the separator is
 *     recorded in ParseAudit.skippedLines for diagnostics
 *     (PCC_UPDATE_AUDIT=1).
 *
 * Table Format Example:
 *
 * Name                                    Id                                   Version          Available        Source
 * --------------------------------------------------------------------------------------------------------------------
 * 7-Zip                                   7zip.7zip                            24.07            24.08            winget
 */

export interface ParsedTable<T> {
  rows: T[];
  audit: ParseAudit;
}

/**
 * Normalize raw winget stdout into clean lines.
 * - CRLF -> LF
 * - leftover CR (busy-spinner frames written with \r) -> LF
 * - ANSI escape sequences removed
 * - other control characters removed
 */
export function normalizeWingetOutput(raw: string): string[] {
  const cleaned = raw
    .replace(/\r\n/g, '\n')
    .replace(/\u001b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/[\u0000-\u0008\u000B-\u001F]/g, '')
    .replace(/\r/g, '\n');
  return cleaned
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);
}

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._\-]*$/;

function isSeparatorLine(line: string): boolean {
  return /^[\s\-_=]+$/u.test(line.trim());
}

function isFooterLine(line: string): boolean {
  const t = line.trim();
  return (
    /^(\d+)\s+upgrad(es)?\s+available/i.test(t) ||
    /^no (upgrade|upgrades) (is )?available/i.test(t) ||
    /^no apps? (are|is) available/i.test(t) ||
    /^there are no (apps|upgrades|packages)/i.test(t) ||
    /^found \d+/i.test(t) ||
    /^\d+ (upgrades|packages|apps) available\.$/i.test(t)
  );
}

/**
 * Find the header line and the start offset (in the trimmed line) of each
 * expected column. Returns null when no suitable header exists.
 */
function findHeaderOffsets(
  lines: string[],
  expectedColumns: string[]
): { headerIndex: number; offsets: number[]; header: string } | null {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line.startsWith('Name')) continue;
    const tokens = line.split(/\s+/);
    if (!tokens.includes('Id')) continue;
    const offsets: number[] = [];
    let ok = true;
    for (const col of expectedColumns) {
      const idx = line.indexOf(col);
      if (idx < 0) {
        ok = false;
        break;
      }
      offsets.push(idx);
    }
    if (ok && offsets.length === expectedColumns.length) {
      return { headerIndex: i, offsets, header: line };
    }
  }
  return null;
}

/**
 * Core table parser: given normalized lines and the expected columns
 * (in order, starting with "Name"), extract rows by header offsets with a
 * token-split fallback.
 */
function parseTableCore<T>(
  lines: string[],
  expectedColumns: string[],
  rowFromCells: (cells: string[]) => T | null,
  requireIdPattern: boolean
): ParsedTable<T> {
  const audit: ParseAudit = {
    headerFound: false,
    expectedColumns,
    dataRows: 0,
    skippedLines: [],
  };

  const header = findHeaderOffsets(lines, expectedColumns);
  if (!header) {
    // No header found at all — record the first few lines for diagnostics.
    audit.skippedLines = lines.slice(0, 10);
    return { rows: [], audit };
  }
  audit.headerFound = true;

  const rows: T[] = [];
  for (let i = header.headerIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    if (isSeparatorLine(line)) continue;
    if (isFooterLine(line)) break; // footers end the table

    let cells: string[];
    if (line.length >= header.offsets[header.offsets.length - 1]) {
      // Primary path: slice at header offsets.
      cells = header.offsets.map((off, k) => {
        const next = k + 1 < header.offsets.length ? header.offsets[k + 1] : line.length;
        return line.slice(off, next).trim();
      });
    } else {
      // Line is shorter than the last column (narrow output): fall back to
      // token splitting so we still recover what is present.
      const parts = line.trim().split(/\s{2,}/).filter((p) => p.length > 0);
      cells = expectedColumns.map((_, k) => parts[k] ?? '');
    }

    if (cells[0] === '' || cells[1] === '') {
      audit.skippedLines.push(line.trim());
      continue;
    }
    if (requireIdPattern && !ID_RE.test(cells[1])) {
      // Second-chance: token split (names with double spaces may have
      // shifted the offset slice).
      const parts = line.trim().split(/\s{2,}/).filter((p) => p.length > 0);
      if (parts.length >= 2 && ID_RE.test(parts[1])) {
        cells = expectedColumns.map((_, k) => parts[k] ?? '');
      } else {
        audit.skippedLines.push(line.trim());
        continue;
      }
    }

    const row = rowFromCells(cells);
    if (row) {
      rows.push(row);
      audit.dataRows++;
    } else {
      audit.skippedLines.push(line.trim());
    }
  }

  return { rows, audit };
}

export class WingetTableParser {
  /**
   * Parses the output of `winget list` (Name | Id | Version | Source).
   * Kept for backward compatibility; delegates to the hardened core.
   */
  static parseListOutput(result: CommandResult): InstalledApp[] {
    return this.parseListOutputDetailed(result).rows;
  }

  /** Detailed variant: rows plus audit trail (skipped lines, header state). */
  static parseListOutputDetailed(result: CommandResult): ParsedTable<InstalledApp> {
    const lines = normalizeWingetOutput(result.stdout);
    return parseTableCore(
      lines,
      ['Name', 'Id', 'Version', 'Source'],
      (cells) => {
        const [name, id, version, source] = cells;
        if (!name || !id || !ID_RE.test(id)) return null;
        return { name, id, version: version ?? '', source: source ?? '' };
      },
      true
    );
  }

  /**
   * Parses the output of `winget upgrade` (list mode):
   * Name | Id | Version | Available | Source.
   */
  static parseUpgradeOutput(result: CommandResult): AvailableUpdate[] {
    return this.parseUpgradeOutputDetailed(result).rows;
  }

  /**
   * Detailed variant of parseUpgradeOutput. The audit trail powers the
   * PCC_UPDATE_AUDIT=1 discovery funnel report.
   */
  static parseUpgradeOutputDetailed(result: CommandResult): ParsedTable<AvailableUpdate> {
    const lines = normalizeWingetOutput(result.stdout);
    return parseTableCore(
      lines,
      ['Name', 'Id', 'Version', 'Available', 'Source'],
      (cells) => {
        const [name, id, version, available, source] = cells;
        if (!name || !id || !ID_RE.test(id)) return null;
        return {
          name,
          id,
          currentVersion: version ?? '',
          availableVersion: available ?? '',
          source: normalizeProviderId(source),
        };
      },
      true
    );
  }

  /**
   * Parses `winget list --source <x>` (Name | Id | Version — the Source
   * column is dropped when a specific source is requested). The provider
   * supplies the fixed source tag.
   */
  static parseListNoSource(result: CommandResult, source: ProviderId): ParsedTable<InstalledApp> {
    const lines = normalizeWingetOutput(result.stdout);
    return parseTableCore(
      lines,
      ['Name', 'Id', 'Version'],
      (cells) => {
        const [name, id, version] = cells;
        if (!name || !id || !ID_RE.test(id)) return null;
        return { name, id, version: version ?? '', source };
      },
      true
    );
  }

  /**
   * Parses `winget upgrade --source <x>` (Name | Id | Version | Available —
   * the Source column is dropped when a specific source is requested).
   */
  static parseUpgradeNoSource(result: CommandResult, source: ProviderId): ParsedTable<AvailableUpdate> {
    const lines = normalizeWingetOutput(result.stdout);
    return parseTableCore(
      lines,
      ['Name', 'Id', 'Version', 'Available'],
      (cells) => {
        const [name, id, version, available] = cells;
        if (!name || !id || !ID_RE.test(id)) return null;
        return {
          name,
          id,
          currentVersion: version ?? '',
          availableVersion: available ?? '',
          source,
        };
      },
      true
    );
  }

  /**
   * Parses the result of an upgrade operation (install/upgrade command).
   * Returns success status and output/error message.
   */
  static parseUpgradeResult(result: CommandResult): UpgradeResult {
    const success = result.exitCode === 0;
    const output = result.stdout || result.stderr;

    return {
      success,
      output,
      error: success ? undefined : result.stderr || result.stdout,
    };
  }
}

