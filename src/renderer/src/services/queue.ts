import { electronAPI } from '@/services/electron';
import type { QueueItem, LogEntry, ProgressEvent } from '@/types';

class QueueService {
  private listeners: Set<(queue: QueueItem[]) => void> = new Set();
  private progressListeners: Set<(event: ProgressEvent) => void> = new Set();
  private logListeners: Set<(log: LogEntry) => void> = new Set();
  private unsubscribers: (() => void)[] = [];
  private queue: QueueItem[] = [];

  constructor() {
    this.initSubscriptions();
  }

  private initSubscriptions(): void {
    this.unsubscribers.push(
      electronAPI.queue.onUpdated((queue) => {
        this.queue = queue;
        this.notifyListeners();
      })
    );
    this.unsubscribers.push(
      electronAPI.queue.onProgress((event) => {
        this.notifyProgressListeners(event);
      })
    );
    this.unsubscribers.push(
      electronAPI.queue.onLog((log) => {
        this.notifyLogListeners(log);
      })
    );
  }

  async getAll(): Promise<QueueItem[]> {
    this.queue = await electronAPI.queue.getAll();
    return this.queue;
  }

  async clearCompleted(): Promise<void> {
    await electronAPI.queue.clearCompleted();
  }

  async clearAll(): Promise<void> {
    await electronAPI.queue.clearAll();
  }

  /** Remove a single finished queue item (active items are protected). */
  async removeItem(id: string): Promise<boolean> {
    return electronAPI.queue.removeItem(id);
  }

  /**
   * Explicit user retry for a failed queue item (P2 retry policy).
   * Only failed upgrade items can be retried; the main process bumps
   * retryCount by 1 and spawns a single new winget attempt.
   */
  async retry(id: string): Promise<{ success: boolean; duplicate?: boolean; error?: string }> {
    return electronAPI.queue.retry(id);
  }

  /**
   * Terminate the processes/services holding a package's files, then
   * optionally retry the failed operation (P3 application-in-use flow).
   */
  async terminateProcesses(
    processes: string[],
    services: string[] | undefined,
    retryItemId?: string
  ): Promise<import('@/types').ProcessTerminateResult & { retryError?: string }> {
    return electronAPI.process.terminate({ processes, services, retryItemId });
  }

  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  subscribe(listener: (queue: QueueItem[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  subscribeProgress(listener: (event: ProgressEvent) => void): () => void {
    this.progressListeners.add(listener);
    return () => this.progressListeners.delete(listener);
  }

  subscribeLogs(listener: (log: LogEntry) => void): () => void {
    this.logListeners.add(listener);
    return () => this.logListeners.delete(listener);
  }

  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener([...this.queue]);
    }
  }

  private notifyProgressListeners(event: ProgressEvent): void {
    for (const listener of this.progressListeners) {
      listener(event);
    }
  }

  private notifyLogListeners(log: LogEntry): void {
    for (const listener of this.logListeners) {
      listener(log);
    }
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers) {
      unsubscribe();
    }
    this.unsubscribers = [];
    this.listeners.clear();
    this.progressListeners.clear();
    this.logListeners.clear();
  }
}

export const queueService = new QueueService();