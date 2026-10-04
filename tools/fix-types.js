/* One-shot repair script for src/main/services/types.ts (duplicate entries from bad edit). */
const fs = require('fs');
const path = require('path');

const p = path.join(__dirname, '..', 'src', 'main', 'services', 'types.ts');
let s = fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');

// 1) Keep only the first QueueItemStatus declaration
const statusLine = "export type QueueItemStatus = 'pending' | 'running' | 'success' | 'failed';";
let seenStatus = false;
s = s
  .split('\n')
  .filter((line) => {
    if (line.trim() === statusLine) {
      if (seenStatus) return false;
      seenStatus = true;
    }
    return true;
  })
  .join('\n');

// 2) Drop the stale QueueItem interface (the one WITHOUT errorDetail)
const stale = [
  'export interface QueueItem {',
  '  id: string;',
  "  operationType: 'upgrade' | 'upgrade-all' | 'restore' | 'collection-install';",
  '  packageId?: string;',
  '  packageName?: string;',
  '  status: QueueItemStatus;',
  '  progress: number;',
  '  currentStep: string;',
  '  logs: LogEntry[];',
  '  error?: string;',
  '  startedAt?: Date;',
  '  completedAt?: Date;',
  '}',
].join('\n');
if (!s.includes(stale)) throw new Error('stale QueueItem block not found');
s = s.replace('\n\n' + stale + '\n', '\n');

// 3) Extend UpgradeResult with duplicate/inUse/blockers
const oldResult = [
  'export interface UpgradeResult {',
  '  success: boolean;',
  '  output: string;',
  '  error?: string;',
  '}',
].join('\n');
const newResult = [
  'export interface UpgradeResult {',
  '  success: boolean;',
  '  output: string;',
  '  error?: string;',
  "  /** True when the request was rejected because an update for the same package is already active. */",
  '  duplicate?: boolean;',
  "  /** True when the failure was caused by the application being in use (0x80070020). */",
  '  inUse?: boolean;',
  "  /** Processes detected as holding the package's files. */",
  '  blockers?: string[];',
  '}',
].join('\n');
if (!s.includes(oldResult)) throw new Error('UpgradeResult block not found');
s = s.replace(oldResult, newResult);

// 4) Append the new audit + process-guard types
const additions = `
// Update discovery audit types (PCC_UPDATE_AUDIT=1)
export interface ParseAudit {
  headerFound: boolean;
  expectedColumns: string[];
  dataRows: number;
  skippedLines: string[];
}

export interface AvailableUpdateDetailed {
  updates: AvailableUpdate[];
  rawOutput: string;
  parseAudit: ParseAudit;
}

// Process guard types (application-in-use detection, 0x80070020)
export interface ProcessTarget {
  name: string;
  kind: 'process' | 'service';
  running: boolean;
}

export interface ProcessTerminateRequest {
  processes: string[];
  services?: string[];
  retryItemId?: string;
}

export interface ProcessTerminateResult {
  results: { name: string; kind: string; success: boolean }[];
  retriedOperationId?: string;
}
`;
if (s.includes('export interface ParseAudit')) throw new Error('ParseAudit already present');
s = s.replace(/\s+$/, '') + '\n' + additions;

// Sanity checks
const qCount = (s.match(/export interface QueueItem \{/g) || []).length;
const stCount = (s.match(/export type QueueItemStatus/g) || []).length;
if (qCount !== 1 || stCount !== 1) throw new Error(`sanity failed: QueueItem=${qCount} status=${stCount}`);

fs.writeFileSync(p, s, 'utf8');
console.log('types.ts repaired OK; lines:', s.split('\n').length);
