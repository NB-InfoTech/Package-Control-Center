import { useState, useEffect } from 'react';
import { ChevronDown, ChevronUp, Trash2, CheckCircle2, ScrollText, AlertCircle, X, Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { QueueItemCard, StatusChip } from './ProgressIndicator';
import { queueService } from '@/services/queue';
import { requestViewLogs } from '@/services/viewLogs';
import { useToast } from '@/hooks/useToast';
import { useElevationGuard } from '@/components/common/ElevationGuard';
import type { QueueItem } from '@/types';

interface QueuePanelProps {
  isOpen: boolean;
  onToggle: () => void;
}

export function QueuePanel({ isOpen, onToggle }: QueuePanelProps) {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // P3: item whose in-use dialog ("Stop Process & Retry" / "Retry Later" /
  // "Cancel") is open.
  const [inUseItem, setInUseItem] = useState<QueueItem | null>(null);
  const [resolving, setResolving] = useState(false);
  const { addToast } = useToast();
  // Chocolatey elevation fix: gate retries for elevation-requiring providers.
  const elevation = useElevationGuard();

  useEffect(() => {
    const unsubscribe = queueService.subscribe(setQueue);
    queueService.getAll().then(setQueue);
    return unsubscribe;
  }, []);

  const runningCount = queue.filter(q => q.status === 'running').length;
  const pendingCount = queue.filter(q => q.status === 'pending').length;
  const completedCount = queue.filter(q => q.status === 'success').length;
  const failedCount = queue.filter(q => q.status === 'failed').length;

  const toggleExpanded = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // P2 retry policy: the Retry button is the ONLY retry entry point.
  // It asks the main process for a single new winget attempt; retryCount
  // is bumped there. No automatic/silent retries exist.
  const handleRetry = async (item: QueueItem) => {
    try {
      // Chocolatey elevation fix: retrying a choco install/upgrade/uninstall
      // needs an elevated PCC instance.
      const gate = await elevation.ensure(item.provider);
      if (gate === 'blocked') return;
      if (gate === 'restarting') {
        addToast({ title: 'Relaunching as Administrator…', description: 'PCC will restart with elevated privileges.' });
        return;
      }
      const result = await queueService.retry(item.id);
      if (result.success) {
        addToast({
          title: 'Update restarted',
          description: `${item.packageName || item.packageId} retry queued.`,
          variant: 'success',
        });
      } else if (result.duplicate) {
        addToast({
          title: 'Already in progress',
          description: result.error || 'An update for this package is already running.',
        });
      } else {
        addToast({
          title: 'Retry failed',
          description: result.error || 'This item cannot be retried.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      addToast({
        title: 'Retry failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleDismiss = async (id: string) => {
    await queueService.removeItem(id);
  };

  const handleClearCompleted = async () => {
    await queueService.clearCompleted();
  };

  const handleClearAll = async () => {
    await queueService.clearAll();
  };

  /** P3: terminate the blocking processes/services, then retry the update. */
  const handleStopAndRetry = async (item: QueueItem) => {
    const blockers = item.inUseProcesses ?? [];
    setResolving(true);
    try {
      // Chocolatey elevation fix: the follow-up retry would fail without
      // elevation on chocolatey items.
      const gate = await elevation.ensure(item.provider);
      if (gate === 'blocked') {
        setInUseItem(null);
        return;
      }
      if (gate === 'restarting') {
        setInUseItem(null);
        addToast({ title: 'Relaunching as Administrator…', description: 'PCC will restart with elevated privileges.' });
        return;
      }
      const result = await queueService.terminateProcesses(blockers, undefined, item.id);
      const failed = result.results.filter((r) => !r.success).map((r) => r.name);
      if (failed.length > 0) {
        addToast({
          title: 'Some processes could not be stopped',
          description: failed.join(', '),
          variant: 'destructive',
        });
      }
      if (result.retryError) {
        addToast({
          title: 'Update still failing',
          description: result.retryError,
          variant: 'destructive',
        });
      } else if (result.retriedOperationId) {
        addToast({
          title: 'Processes stopped, update restarted',
          description: `${item.packageName || item.packageId} is being updated again.`,
          variant: 'success',
        });
      }
    } catch (error) {
      addToast({
        title: 'Failed to stop processes',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setResolving(false);
      setInUseItem(null);
    }
  };

  return (
    <div className={cn(
      'fixed bottom-0 right-0 left-0 z-40 bg-card border-t border-border transition-all duration-300',
      isOpen ? 'h-[400px]' : 'h-10'
    )}>
      {elevation.ui}
      <div className="flex h-full flex-col">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 px-3 justify-between w-full border-b"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse queue panel' : 'Expand queue panel'}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">QUEUE</span>
            <span className="px-2 py-0.5 text-xs bg-muted rounded">
              {queue.length} {queue.length === 1 ? 'item' : 'items'}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <StatusChip status="running" />
            <StatusChip status="pending" />
            <StatusChip status="success" />
            <StatusChip status="failed" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 gap-1"
              onClick={(e) => { e.stopPropagation(); requestViewLogs(); }}
              title="View logs"
            >
              <ScrollText className="h-3 w-3" />
              View Logs
            </Button>
            {queue.length > 0 && (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); handleClearCompleted(); }}
                  title="Clear completed"
                  disabled={completedCount === 0 && failedCount === 0}
                >
                  <CheckCircle2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => { e.stopPropagation(); handleClearAll(); }}
                  title="Clear all"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </>
            )}
            <span className="w-6" />
          </div>
        </Button>

        {isOpen && queue.length > 0 && (
          <ScrollArea className="flex-1 overflow-hidden">
            <div className="p-3 space-y-3">
              {queue.map(item => (
                <QueueItemCard
                  key={item.id}
                  item={item}
                  onViewLogs={() => toggleExpanded(item.id)}
                  onRetry={() => handleRetry(item)}
                  onDismiss={() => handleDismiss(item.id)}
                  onInUseRetry={(inUse) => setInUseItem(inUse)}
                />
              ))}
            </div>
          </ScrollArea>
        )}

        {isOpen && queue.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <p className="text-sm">No operations in queue</p>
          </div>
        )}

        {inUseItem && (
          <InUseDialog
            item={inUseItem}
            resolving={resolving}
            onConfirm={() => handleStopAndRetry(inUseItem)}
            onLater={() => setInUseItem(null)}
            onCancel={() => setInUseItem(null)}
          />
        )}
      </div>
    </div>
  );
}

/**
 * P3 "Application is currently running" dialog.
 * Options: [Stop Process & Retry] [Retry Later] [Cancel]
 */
function InUseDialog({
  item,
  resolving,
  onConfirm,
  onLater,
  onCancel,
}: {
  item: QueueItem;
  resolving: boolean;
  onConfirm: () => void;
  onLater: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <Card className="relative w-full max-w-md mx-4 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-400" />
            <CardTitle className="text-base">Application is currently running</CardTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 ml-auto"
              onClick={onCancel}
              aria-label="Close"
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-muted-foreground">
              The update for <span className="text-foreground font-medium">{item.packageName || item.packageId}</span> could not be installed (0x80070020). The following processes may prevent updating:
            </p>
            <ul className="mt-2 max-h-40 overflow-y-auto rounded border border-border bg-muted/40 p-3 space-y-1">
              {(item.inUseProcesses ?? []).map((proc) => (
                <li key={proc} className="text-sm font-mono">{proc}</li>
              ))}
            </ul>
          </div>
          <Separator />
          <div className="flex flex-col gap-2">
            <Button onClick={onConfirm} disabled={resolving}>
              {resolving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {resolving ? 'Stopping processes…' : 'Stop Process & Retry'}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onLater} disabled={resolving}>
                Retry Later
              </Button>
              <Button variant="ghost" className="flex-1" onClick={onCancel} disabled={resolving}>
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}