import { cn } from '@/utils/cn';
import { Loader2, CheckCircle, AlertCircle, Package, Download, HardDrive, ShieldCheck, Check, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ProgressStep, QueueItemStatus, QueueItem } from '@/types';
import { providerLabel } from '@/types';

interface ProgressIndicatorProps {
  step: ProgressStep;
  status: QueueItemStatus;
  progress: number;
  className?: string;
}

const steps: { step: ProgressStep; label: string; icon: React.ReactNode }[] = [
  { step: 'preparing', label: 'Preparing', icon: <Package className="h-4 w-4" /> },
  { step: 'downloading', label: 'Downloading', icon: <Download className="h-4 w-4" /> },
  { step: 'installing', label: 'Installing', icon: <HardDrive className="h-4 w-4" /> },
  { step: 'verifying', label: 'Verifying', icon: <ShieldCheck className="h-4 w-4" /> },
  { step: 'completed', label: 'Completed', icon: <Check className="h-4 w-4" /> },
];

export function ProgressIndicator({ step, status, progress, className }: ProgressIndicatorProps) {
  const currentStepIndex = steps.findIndex(s => s.step === step);
  const isCompleted = status === 'success';
  const isFailed = status === 'failed';
  const isRunning = status === 'running';

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300 rounded-full',
              isFailed ? 'bg-red-500' : isCompleted ? 'bg-green-500' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
        </div>
        <span className="text-sm font-mono text-muted-foreground w-10 text-right">
          {progress}%
        </span>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        {steps.map(({ step: s, label, icon }, index) => {
          const isCurrent = index === currentStepIndex;
          const isPast = index < currentStepIndex || (isCurrent && (isCompleted || isFailed));
          const isFuture = index > currentStepIndex || (isCurrent && isRunning && !isPast);

          return (
            <div
              key={s}
              className={cn(
                'flex flex-col items-center gap-1 flex-shrink-0 transition-all duration-300',
                isCurrent && isRunning && 'animate-pulse'
              )}
            >
              <div className={cn(
                'relative flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors',
                isPast ? 'bg-green-500 border-green-500 text-green-500' :
                isCurrent && isRunning ? 'bg-primary/10 border-primary text-primary' :
                isFailed && index === currentStepIndex ? 'bg-red-500/10 border-red-500 text-red-500' :
                'bg-muted border-border text-muted-foreground'
              )}>
                {isPast ? (
                  <CheckCircle className="h-5 w-5" />
                ) : isFailed && index === currentStepIndex ? (
                  <AlertCircle className="h-5 w-5" />
                ) : isCurrent && isRunning ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  icon
                )}
              </div>
              <span className={cn(
                'text-xs font-medium text-center whitespace-nowrap transition-colors',
                isPast ? 'text-green-500' :
                isCurrent && isRunning ? 'text-primary' :
                isFailed && index === currentStepIndex ? 'text-red-500' :
                'text-muted-foreground'
              )}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="text-sm text-muted-foreground text-center">
        {isCompleted && 'Operation completed successfully'}
        {isFailed && 'Operation failed'}
        {isRunning && `Current step: ${steps[currentStepIndex]?.label || step}`}
        {status === 'pending' && 'Queued...'}
      </div>
    </div>
  );
}

interface StatusChipProps {
  status: QueueItemStatus;
  className?: string;
}

export function StatusChip({ status, className }: StatusChipProps) {
  const configs = {
    pending: { label: 'Pending', className: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20', icon: <span className="h-1.5 w-1.5 rounded-full bg-yellow-400 animate-pulse" /> },
    running: { label: 'Running', className: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    success: { label: 'Success', className: 'bg-green-500/10 text-green-400 border-green-500/20', icon: <CheckCircle className="h-3 w-3" /> },
    failed: { label: 'Failed', className: 'bg-red-500/10 text-red-400 border-red-500/20', icon: <AlertCircle className="h-3 w-3" /> },
  };

  const config = configs[status];

  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
      config.className,
      className
    )}>
      {config.icon}
      {config.label}
    </span>
  );
}

interface QueueItemCardProps {
  item: QueueItem;
  onViewLogs?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
  /**
   * P3: open the "Application is currently running" dialog with the
   * [Stop Process & Retry] / [Retry Later] / [Cancel] options.
   */
  onInUseRetry?: (item: QueueItem) => void;
}

export function QueueItemCard({ item, onViewLogs, onRetry, onDismiss, onInUseRetry }: QueueItemCardProps) {
  const inUse = item.status === 'failed' && (item.inUseProcesses?.length ?? 0) > 0;

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-medium truncate">{item.packageName || item.packageId || 'All Packages'}</span>
              <StatusChip status={item.status} />
              {item.provider && (
                <span className="shrink-0 px-2 py-0.5 text-xs bg-muted border border-border rounded-full text-muted-foreground">
                  {providerLabel(item.provider)}
                </span>
              )}
              {(item.retryCount ?? 0) > 0 && (
                <span className="px-2 py-0.5 text-xs bg-orange-500/10 text-orange-400 border border-orange-500/20 rounded-full">
                  Attempt {(item.retryCount ?? 0) + 1}
                </span>
              )}
              {item.packageId && (
                <span className="text-xs font-mono text-muted-foreground px-2 py-0.5 bg-muted rounded">
                  {item.packageId}
                </span>
              )}
            </div>
            <div className="mt-2 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
              {item.startedAt && (
                <span>Started: {item.startedAt.toLocaleTimeString()}</span>
              )}
              {item.completedAt && (
                <span>Completed: {item.completedAt.toLocaleTimeString()}</span>
              )}
            </div>
            {item.bulkMeta && (
              <div className="mt-1 text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="px-2 py-0.5 bg-muted rounded">
                  Batch: {item.bulkMeta.total} packages
                </span>
                {item.bulkMeta.summary && (
                  <>
                    <span className="px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded">
                      {item.bulkMeta.summary.succeeded.length} success
                    </span>
                    <span className="px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded">
                      {item.bulkMeta.summary.failed.length} failed
                    </span>
                  </>
                )}
              </div>
            )}
            {item.error && (
              <div className="mt-1">
                <p className="text-xs text-red-400">Error: {item.error}</p>
                {item.errorDetail && item.errorDetail !== item.error && (
                  <p className="text-[11px] text-muted-foreground font-mono break-all line-clamp-2" title={item.errorDetail}>
                    {item.errorDetail}
                  </p>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {item.status === 'failed' && onInUseRetry && inUse && (
              <Button variant="outline" size="sm" onClick={() => onInUseRetry(item)}>
                <AlertCircle className="h-3 w-3 mr-1 text-yellow-400" />
                Stop Process &amp; Retry
              </Button>
            )}
            {item.status === 'failed' && onRetry && (
              <Button variant="ghost" size="sm" onClick={onRetry}>
                Retry
              </Button>
            )}
            {onViewLogs && (
              <Button variant="ghost" size="sm" onClick={onViewLogs}>
                Logs ({item.logs.length})
              </Button>
            )}
            {onDismiss && (item.status === 'success' || item.status === 'failed') && (
              <Button variant="ghost" size="icon" onClick={onDismiss} className="h-7 w-7">
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {inUse && (
          <div className="mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-3 text-xs space-y-1">
            <p className="font-medium text-yellow-300">Application is currently running</p>
            <p className="text-muted-foreground">The following processes may prevent updating:</p>
            <ul className="list-disc list-inside">
              {item.inUseProcesses?.map((proc) => (
                <li key={proc} className="font-mono text-foreground">{proc}</li>
              ))}
            </ul>
          </div>
        )}

        <ProgressIndicator
          step={item.currentStep as ProgressStep}
          status={item.status}
          progress={item.progress}
          className="mt-4"
        />
      </CardContent>
    </Card>
  );
}