import { QueueItem, QueueItemStatus, LogEntry, ProgressEvent, BulkUpdateMeta, ProviderId } from './types.js';
import { randomUUID as uuidv4 } from 'crypto';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import { dataPathService } from './paths/index.js';
import { logger } from './logging/index.js';
import { AppError, ErrorCode, ErrorCategory } from './errors/index.js';

type QueueListener = (queue: QueueItem[]) => void;
type ProgressListener = (event: ProgressEvent) => void;
type LogListener = (log: LogEntry) => void;

const MAX_QUEUE_SIZE = 100;
const MAX_LOGS_PER_ITEM = 200;

/**
 * Queue state snapshot file (PCC v2.0.1 safe-shutdown: persisted before exit).
 * Resolved lazily through DataPathService (PCC v2.2) so the canonical data
 * root is the only queue-state location.
 */
function queueStateFile(): string {
  return dataPathService.getQueueStateFile();
}

/**
 * Central update queue (PCC v2.0.1):
 *  - One package = one active queue item = one winget attempt.
 *  - No automatic retries: a new item for the same package is only created
 *    when the user explicitly retries (addOperation with retryCount > 0).
 *  - Active operations are protected from duplicate starts via
 *    findActiveOperation() (called by the provider before spawning winget).
 */
export class UpdateQueueService {
  private queue: QueueItem[] = [];
  private listeners: Set<QueueListener> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();
  private logListeners: Set<LogListener> = new Set();
  private isProcessing = false;
  private destroyed = false;

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  subscribe(listener: QueueListener): () => void {
    if (this.destroyed) {
      return () => {};
    }
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeProgress(listener: ProgressListener): () => void {
    if (this.destroyed) {
      return () => {};
    }
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  subscribeLogs(listener: LogListener): () => void {
    if (this.destroyed) {
      return () => {};
    }
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private notify(): void {
    if (this.destroyed) return;
    const snapshot = [...this.queue];
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch (error) {
        logger.error('Queue listener error', error as Error);
      }
    }
  }

  private notifyProgress(event: ProgressEvent): void {
    if (this.destroyed) return;
    for (const listener of this.progressListeners) {
      try {
        listener(event);
      } catch (error) {
        logger.error('Progress listener error', error as Error);
      }
    }
  }

  private notifyLog(log: LogEntry): void {
    if (this.destroyed) return;
    for (const listener of this.logListeners) {
      try {
        listener(log);
      } catch (error) {
        logger.error('Log listener error', error as Error);
      }
    }
  }

  /**
   * Add a queue operation.
   *
   * NOTE (retry policy): pass `opts.retryCount` when the user explicitly
   * retries a failed operation. There is NO automatic retry anywhere in the
   * codebase — every item beyond retryCount 0 must have been requested by
   * the user through the Retry button.
   */
  addOperation(
    operationType: 'upgrade' | 'upgrade-all' | 'install' | 'uninstall' | 'restore' | 'collection-install',
    packageId?: string,
    packageName?: string,
    opts?: { retryCount?: number; provider?: ProviderId }
  ): string {
    if (this.destroyed) {
      throw new AppError({
        code: ErrorCode.QUEUE_OPERATION_FAILED,
        category: ErrorCategory.SYSTEM,
        message: 'Queue service has been destroyed',
      });
    }

    // Enforce queue size limit
    if (this.queue.length >= MAX_QUEUE_SIZE) {
      this.queue.shift(); // Remove oldest
    }

    const id = uuidv4();
    const item: QueueItem = {
      id,
      operationType,
      packageId,
      packageName,
      provider: opts?.provider,
      status: 'pending',
      progress: 0,
      currentStep: 'Queued',
      logs: [],
      retryCount: opts?.retryCount ?? 0,
      startedAt: undefined,
      completedAt: undefined,
    };
    this.queue.push(item);
    this.notify();
    logger.info('Queue operation added', { id, operationType, packageId, packageName, provider: item.provider, retryCount: item.retryCount });
    return id;
  }

  /**
   * Find an active (pending or running) operation.
   * - With operationType + packageId: exact-match active item for that package.
   * - With operationType only: any active item of that type.
   * - With neither: any active item.
   * - `provider` namespaces the match when given (PCC v2.1 multi-source),
   *   so the same package id in two providers never collides.
   */
  findActiveOperation(operationType?: string, packageId?: string, provider?: ProviderId): QueueItem | undefined {
    return this.queue.find(
      (q) =>
        (q.status === 'pending' || q.status === 'running') &&
        (operationType ? q.operationType === operationType : true) &&
        (packageId ? q.packageId === packageId : true) &&
        (provider ? q.provider === provider : true)
    );
  }

  getActiveOperations(): QueueItem[] {
    return this.queue.filter((q) => q.status === 'pending' || q.status === 'running');
  }

  hasActiveOperations(): boolean {
    return this.getActiveOperations().length > 0;
  }

  updateStatus(id: string, status: QueueItemStatus): void {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.status = status;
      if (status === 'running' && !item.startedAt) {
        item.startedAt = new Date();
      }
      if (status === 'success' || status === 'failed') {
        item.completedAt = new Date();
        item.progress = 100;
      }
      this.notify();
      logger.info('Queue status updated', { id, status });
    }
  }

  updateProgress(id: string, progress: number, step: string): void {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.progress = Math.min(100, Math.max(0, progress));
      item.currentStep = step;
      this.notify();
    }
  }

  addLog(id: string, log: Omit<LogEntry, 'id' | 'timestamp'>): void {
    const item = this.queue.find(q => q.id === id);
    const entry: LogEntry = {
      ...log,
      id: uuidv4().slice(0, 8),
      timestamp: new Date(),
      operationId: id,
    };
    if (item) {
      item.logs.push(entry);
      // Limit logs per item
      if (item.logs.length > MAX_LOGS_PER_ITEM) {
        item.logs = item.logs.slice(-MAX_LOGS_PER_ITEM);
      }
    }
    this.notifyLog(entry);
    this.notify();
  }

  addProgressEvent(event: ProgressEvent): void {
    const item = this.queue.find(q => q.id === event.operationId);
    if (item) {
      item.progress = event.progress;
      item.currentStep = event.step;
    }
    this.notifyProgress(event);
    this.notify();
  }

  /**
   * Record a failure. `error` should be the user-friendly message
   * (from ErrorTranslator); `detail` keeps the raw winget output.
   */
  setError(id: string, error: string, detail?: string): void {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.error = error;
      item.errorDetail = detail && detail.trim().length > 0 ? detail : item.errorDetail;
      item.status = 'failed';
      this.notify();
      logger.error('Queue operation failed', undefined, { id, error, detail: item.errorDetail });
    }
  }

  /** Attach detected blocking processes to an item (0x80070020 flow). */
  attachInUse(id: string, processes: string[]): void {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.inUseProcesses = processes;
      this.notify();
    }
  }

  /**
   * Attach the bulk-operation snapshot to an `upgrade-all` item
   * (total + package list captured before `winget upgrade --all` starts).
   */
  attachBulkMeta(id: string, meta: BulkUpdateMeta): void {
    const item = this.queue.find(q => q.id === id);
    if (item) {
      item.bulkMeta = meta;
      this.notify();
    }
  }

  /** Fill in the bulk-operation result summary after the command completes. */
  setBulkSummary(id: string, summary: { succeeded: string[]; failed: string[] }): void {
    const item = this.queue.find(q => q.id === id);
    if (item?.bulkMeta) {
      item.bulkMeta.summary = summary;
      this.notify();
      logger.info('Bulk summary recorded', {
        id,
        total: item.bulkMeta.total,
        succeeded: summary.succeeded.length,
        failed: summary.failed.length,
      });
    }
  }

  clearCompleted(): void {
    this.queue = this.queue.filter(q => q.status !== 'success' && q.status !== 'failed');
    this.notify();
  }

  clearAll(): void {
    this.queue = [];
    this.notify();
  }

  getOperation(id: string): QueueItem | undefined {
    return this.queue.find(q => q.id === id);
  }

  /** Remove a single finished item (queue UI "Dismiss"). Active items are protected. */
  removeOperation(id: string): boolean {
    const item = this.queue.find(q => q.id === id);
    if (!item) return false;
    if (item.status === 'pending' || item.status === 'running') return false;
    this.queue = this.queue.filter(q => q.id !== id);
    this.notify();
    logger.info('Queue operation removed', { id });
    return true;
  }

  isQueueProcessing(): boolean {
    return this.isProcessing;
  }

  setProcessing(processing: boolean): void {
    this.isProcessing = processing;
  }

  /**
   * Mark all active operations as failed with the given reason
   * (used when the user force-stops updates on exit).
   * Returns the number of items changed.
   */
  markActiveAsInterrupted(reason: string): number {
    const active = this.getActiveOperations();
    for (const item of active) {
      item.status = 'failed';
      item.error = reason;
      item.errorDetail = reason;
      item.completedAt = new Date();
    }
    if (active.length > 0) {
      this.notify();
      logger.warn(`Marked ${active.length} active queue operation(s) as interrupted`, { reason });
    }
    return active.length;
  }

  /**
   * Persist the queue to disk (safe shutdown). Running items are kept as-is;
   * restoreState() will demote them to failed on the next start.
   */
  persistState(): void {
    try {
      dataPathService.ensureDir();
      writeFileSync(queueStateFile(), JSON.stringify(this.queue, null, 2), 'utf-8');
      logger.info('Queue state persisted', { file: queueStateFile(), items: this.queue.length });
    } catch (error) {
      logger.error('Failed to persist queue state', error as Error);
    }
  }

  /**
   * Restore the queue from disk after an unclean exit.
   * Items that were running/pending are marked failed ("interrupted by
   * application exit") — nothing is ever auto-restarted.
   * Returns the number of restored items.
   */
  restoreState(): number {
    if (!existsSync(queueStateFile())) return 0;
    let restored: QueueItem[] = [];
    try {
      const raw = JSON.parse(readFileSync(queueStateFile(), 'utf-8')) as unknown;
      if (Array.isArray(raw)) {
        restored = (raw as QueueItem[]).map((item) => ({
          ...item,
          startedAt: item.startedAt ? new Date(item.startedAt) : undefined,
          completedAt: item.completedAt ? new Date(item.completedAt) : undefined,
          logs: (item.logs ?? []).map((log) => ({
            ...log,
            timestamp: new Date(log.timestamp),
          })),
        }));
        // Never resurrect active work: running/pending -> failed (interrupted).
        for (const item of restored) {
          if (item.status === 'running' || item.status === 'pending') {
            item.status = 'failed';
            item.error = 'Interrupted by application exit';
            item.errorDetail = 'The update was stopped because Package Control Center closed.';
            item.completedAt = item.completedAt ?? new Date();
          }
        }
      }
    } catch (error) {
      logger.error('Failed to restore queue state', error as Error);
      return 0;
    } finally {
      try {
        unlinkSync(queueStateFile());
      } catch {
        // best effort
      }
    }
    if (restored.length > 0) {
      // Restored history goes first (oldest), then any in-memory items.
      this.queue = [...restored, ...this.queue].slice(-MAX_QUEUE_SIZE);
      this.notify();
      logger.info('Queue state restored', { items: restored.length });
    }
    return restored.length;
  }

  destroy(): void {
    this.destroyed = true;
    this.queue = [];
    this.listeners.clear();
    this.progressListeners.clear();
    this.logListeners.clear();
    logger.info('Queue service destroyed');
  }
}

export const updateQueueService = new UpdateQueueService();


