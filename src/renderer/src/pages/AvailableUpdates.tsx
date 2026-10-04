import { useState, useEffect, useRef, Fragment } from 'react';
import {
  RefreshCw,
  Loader2,
  ArrowUp,
  Eye,
  ShieldOff,
  X,
  ExternalLink,
  Copy,
  Github,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import type { AvailableUpdate, QueueItem, PackageDetails, UpgradeResult, ProgressStep } from '@/types';
import { providerLabel } from '@/types';
import { queueService } from '@/services/queue';
import { requestViewLogs } from '@/services/viewLogs';
import { ProgressIndicator } from '@/components/common/ProgressIndicator';
import { useElevationGuard } from '@/components/common/ElevationGuard';
import { cn } from '@/utils/cn';

export function AvailableUpdates() {
  const [updates, setUpdates] = useState<AvailableUpdate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<PackageDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { addToast } = useToast();

  // P4: active (pending/running) queue operations — drives live per-row
  // status so a bulk update never looks like a no-op from this page.
  const [activeOps, setActiveOps] = useState<QueueItem[]>([]);
  // Bulk-state audit: most recent bulk operation (snapshot + summary) for
  // the "Update Summary" section. Kept separate from the live pending
  // count so "1 available" is never confused with "3 were processed".
  const [lastBulk, setLastBulk] = useState<QueueItem | null>(null);
  // Chocolatey elevation fix: gate provider-routed mutating operations.
  const elevation = useElevationGuard();
  const isMountedRef = useRef(true);

  const fetchUpdates = async () => {
    setIsLoading(true);
    try {
      const data = await WingetService.getAvailableUpdates();
      setUpdates(data);
    } catch (error) {
      addToast({
        title: 'Failed to load updates',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewDetails = async (id: string, source?: string) => {
    setDetailsLoading(true);
    try {
      const details = await WingetService.showPackage(id, source);
      setSelectedPackage(details);
    } catch (error) {
      addToast({
        title: 'Failed to load package details',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setDetailsLoading(false);
    }
  };

  const handleIgnore = async (id: string, name: string) => {
    try {
      await WingetService.ignorePackage(id, name);
      addToast({ title: 'Package ignored', variant: 'success' });
      fetchUpdates();
    } catch (error) {
      addToast({ title: 'Failed to ignore', variant: 'destructive' });
    }
  };

  /** Active queue operation affecting this package (individual or bulk). */
  const activeOperationFor = (id: string): QueueItem | undefined =>
    activeOps.find(
      (op) =>
        op.operationType === 'upgrade-all' ||
        (op.operationType === 'upgrade' && op.packageId === id)
    );

  const isUpdating = (id: string) =>
    activeOps.some((op) => op.operationType === 'upgrade' && op.packageId === id);

  const handleUpgrade = async (id: string, name?: string, source?: string) => {
    if (activeOperationFor(id)) {
      addToast({
        title: 'Update already in progress',
        description: `${name ?? id} is already queued or running.`,
      });
      return;
    }
    // Chocolatey elevation fix: offer the UAC relaunch when needed.
    const gate = await elevation.ensure(source);
    if (gate === 'blocked') return;
    if (gate === 'restarting') {
      addToast({ title: 'Relaunching as Administrator…', description: 'PCC will restart with elevated privileges.' });
      return;
    }
    const result: UpgradeResult = await WingetService.upgradePackage(id, name, source).catch((error) => ({
      success: false,
      output: '',
      error: error instanceof Error ? error.message : 'Unknown error',
    }));
    if (result.success) {
      addToast({ title: 'Update successful', variant: 'success' });
      fetchUpdates();
    } else if (result.duplicate) {
      addToast({ title: 'Update already in progress', description: result.error });
    } else if (result.inUse) {
      addToast({
        title: 'Application currently in use',
        description: result.error || 'Close the application, or stop it and retry from the update queue.',
        variant: 'destructive',
      });
    } else {
      addToast({
        title: 'Update failed',
        description: result.error || result.output,
        variant: 'destructive',
      });
    }
  };

  const handleUpdateAll = async () => {
    if (activeOps.length > 0) {
      addToast({
        title: 'Updates already in progress',
        description: 'Wait for the current operation(s) to finish, or stop them from the update queue.',
      });
      return;
    }
    if (updates.length === 0) {
      addToast({ title: 'No updates available' });
      return;
    }
    // Chocolatey elevation fix: gate the whole bulk run by the sources it
    // will touch (one dialog covers every elevation-requiring provider).
    const gate = await elevation.ensure(Array.from(new Set(updates.map((u) => u.source))));
    if (gate === 'blocked') return;
    if (gate === 'restarting') {
      addToast({ title: 'Relaunching as Administrator…', description: 'PCC will restart with elevated privileges.' });
      return;
    }
    // PCC v2.1 multi-source: one result per active provider.
    const results: UpgradeResult[] = await WingetService.upgradeAll().catch((error) => [
      {
        success: false,
        output: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    ]);
    const ok = results.filter((r) => r.success).length;
    const dup = results.find((r) => r.duplicate);
    if (dup && ok === 0) {
      addToast({ title: 'Update already in progress', description: dup.error });
    } else if (results.length > 0 && ok === results.length) {
      addToast({
        title: 'All updates applied',
        description: results.length > 1 ? `Across ${results.length} sources.` : undefined,
        variant: 'success',
      });
    } else {
      addToast({
        title: 'Bulk update did not fully succeed',
        description:
          results.map((r, i) => `${i + 1}. ${r.success ? 'OK' : r.error || 'failed'}`).join(' · '),
        variant: 'destructive',
      });
    }
    fetchUpdates();
  };

  /** P3: terminate the blocker processes for an in-use item, then retry. */
  const handleStopAndRetry = async (item: QueueItem) => {
    const blockers = item.inUseProcesses ?? [];
    if (blockers.length === 0) return;
    try {
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
          description: `${item.packageName ?? item.packageId} is being updated again.`,
          variant: 'success',
        });
      }
      fetchUpdates();
    } catch (error) {
      addToast({
        title: 'Failed to stop processes',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchUpdates();
    const apply = (queue: QueueItem[]) => {
      if (!isMountedRef.current) return;
      setActiveOps(queue.filter((item) => item.status === 'pending' || item.status === 'running'));
      setLastBulk(
        [...queue].reverse().find((item) => item.operationType === 'upgrade-all' && item.bulkMeta) ?? null
      );
    };
    const unsubscribe = queueService.subscribe(apply);
    queueService.getAll().then(apply);
    return () => {
      unsubscribe();
      isMountedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      {elevation.ui}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Available Updates</h2>
          <p className="text-muted-foreground">
            {updates.length} {updates.length === 1 ? 'package' : 'packages'} have updates available right now
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchUpdates} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
          {updates.length > 0 && (
            <Button onClick={handleUpdateAll} disabled={activeOps.length > 0}>
              <ArrowUp className="h-4 w-4 mr-2" />
              Update All ({updates.length})
            </Button>
          )}
        </div>
      </div>

      {/* Bulk-state audit: "3 were processed" — separate from the live
          "1 available" count above, and kept after the list changes. */}
      {lastBulk?.bulkMeta && (() => {
        const { total, packages, summary } = lastBulk.bulkMeta;
        const succeededCount = summary?.succeeded.length ?? 0;
        const failedCount = summary?.failed.length ?? 0;
        const skippedCount = Math.max(0, total - succeededCount - failedCount);
        const nameOf = (id: string) => packages.find((p) => p.id === id)?.name ?? id;
        const running = lastBulk.status === 'running' || lastBulk.status === 'pending';
        return (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <CardTitle className="text-base">Update Summary</CardTitle>
                  <CardDescription>
                    Last bulk update
                    {lastBulk.completedAt ? ` · ${lastBulk.completedAt.toLocaleString()}` : ''}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {running ? (
                    <Badge variant="secondary">In progress ({total} packages)</Badge>
                  ) : summary ? (
                    <>
                      <Badge variant="success">Success: {succeededCount}</Badge>
                      <Badge variant="destructive">Failed: {failedCount}</Badge>
                      {skippedCount > 0 && <Badge variant="secondary">Skipped: {skippedCount}</Badge>}
                    </>
                  ) : (
                    <Badge variant="secondary">{lastBulk.status}</Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              <p className="text-sm text-muted-foreground">
                {running
                  ? `Updating ${total} package(s)…`
                  : `Processed ${total} package(s): ${succeededCount} succeeded${failedCount > 0 ? `, ${failedCount} failed` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}.`}
              </p>
              {summary && failedCount > 0 && (
                <p className="text-sm text-red-400">
                  Still need an update: {summary.failed.map(nameOf).join(', ')}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {packages.map((pkg) => {
                  const failedId = summary?.failed.includes(pkg.id);
                  return (
                    <span
                      key={pkg.id}
                      title={pkg.id}
                      className={cn(
                        'px-2 py-0.5 text-xs rounded border',
                        failedId
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                    >
                      {pkg.name}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {activeOps.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Active Operations</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {activeOps.map((item) => (
              <Card key={item.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium text-sm truncate" title={item.packageName ?? item.packageId}>
                      {item.packageName ?? item.packageId ?? item.id}
                    </span>
                    {item.bulkMeta && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        batch of {item.bulkMeta.total}
                      </span>
                    )}
                  </div>
                  <ProgressIndicator
                      step={item.currentStep as ProgressStep}
                      status={item.status}
                      progress={item.progress}
                    />
                  <div className="mt-2 flex justify-end">
                    <button
                      onClick={() => requestViewLogs()}
                      className="text-xs text-primary hover:underline"
                    >
                      View Logs
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Current Version</TableHead>
                  <TableHead>Available Version</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : updates.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      All packages are up to date
                    </TableCell>
                  </TableRow>
                ) : (
                  updates.map(update => {
                    const op = activeOperationFor(update.id);
                    const inUse = op?.inUseProcesses;
                    return (
                      <Fragment key={update.id}>
                        <TableRow>
                          <TableCell className="font-medium">{update.name}</TableCell>
                          <TableCell className="font-mono text-sm">{update.id}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{providerLabel(update.source)}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{update.currentVersion}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="success">{update.availableVersion}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewDetails(update.id, update.source)}
                                disabled={detailsLoading}
                                title="View details"
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleIgnore(update.id, update.name)}
                                title="Ignore updates for this package"
                              >
                                <ShieldOff className="h-4 w-4" />
                              </Button>
                              {isUpdating(update.id) ? (
                                <Button variant="ghost" size="icon" disabled>
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  onClick={() => handleUpgrade(update.id, update.name, update.source)}
                                  disabled={activeOps.length > 0}
                                  title={activeOps.length > 0 ? 'Wait for the active operation(s) to finish' : undefined}
                                >
                                  <ArrowUp className="h-4 w-4 mr-1" />
                                  Update
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                        {op && (
                          <TableRow className="bg-muted/20">
                            <TableCell colSpan={6} className="py-2">
                              <div className="flex items-center gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                                    <RowStatusChip status={op.status} step={op.currentStep} />
                                    {op.progress > 0 && (
                                      <span className="text-xs text-muted-foreground">{Math.round(op.progress)}%</span>
                                    )}
                                    {inUse && inUse.length > 0 && op.status === 'failed' && (
                                      <button
                                        onClick={() => handleStopAndRetry(op)}
                                        className="text-xs text-primary hover:underline"
                                      >
                                        Stop {inUse.length} process(es) & retry
                                      </button>
                                    )}
                                    <button
                                      onClick={() => requestViewLogs()}
                                      className="text-xs text-primary hover:underline"
                                    >
                                      View Logs
                                    </button>
                                  </div>
                                  {op.error && op.status === 'failed' && (
                                    <p className="text-xs text-red-400 truncate" title={op.error}>
                                      {op.error}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      <PackageDetailsDrawer
        packageDetails={selectedPackage}
        isOpen={!!selectedPackage}
        onClose={() => setSelectedPackage(null)}
        isLoading={detailsLoading}
      />
    </div>
  );
}

/** Human label for a winget progress step (e.g. "downloading" → "Downloading"). */
function formatStepLabel(step?: string): string {
  if (!step) return 'Starting…';
  if (step === 'completed') return 'Finishing…';
  return step.charAt(0).toUpperCase() + step.slice(1);
}

/** Compact status pill for a live queue operation row. */
function RowStatusChip({ status, step }: { status: string; step?: string }) {
  if (status === 'running' || status === 'pending') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded">
        <Loader2 className="h-3 w-3 animate-spin" />
        {status === 'pending' ? 'Queued' : formatStepLabel(step)}
      </span>
    );
  }
  if (status === 'success') {
    return (
      <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-green-500/10 text-green-400 border border-green-500/20 rounded">
        <CheckCircle2 className="h-3 w-3" />
        Succeeded
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded">
      <XCircle className="h-3 w-3" />
      Failed
    </span>
  );
}

// Inline PackageDetailsDrawer to avoid circular imports for now

interface PackageDetailsDrawerProps {
  packageDetails: PackageDetails | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

function PackageDetailsDrawer({ packageDetails, isOpen, onClose, isLoading }: PackageDetailsDrawerProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !packageDetails) return null;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const renderField = (label: string, value: string | undefined, copyable = false) => {
    if (!value) return null;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono break-all">{value}</span>
          {copyable && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => copyToClipboard(value)}
              title={`Copy ${label.toLowerCase()}`}
            >
              <Copy className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
    );
  };

  const renderLink = (label: string, url: string | undefined, icon: React.ReactNode) => {
    if (!url) return null;
    return (
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</span>
        <Button variant="ghost" className="justify-start gap-2 h-auto px-3 py-2" asChild>
          <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2">
            {icon}
            <span className="text-sm break-all">{url}</span>
          </a>
        </Button>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className={cn(
        'relative flex flex-col w-full max-w-md bg-card border-l border-border shadow-xl',
        'animate-in slide-in-from-right duration-300'
      )}>
        <div className="flex items-center justify-between border-b p-4">
          <div>
            <CardTitle className="text-lg">{packageDetails.name}</CardTitle>
            <CardDescription className="font-mono text-xs">{packageDetails.id}</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-6">
            {isLoading ? (
              <div className="space-y-4">
                <div className="h-4 w-3/4 animate-pulse bg-muted rounded" />
                <div className="h-4 w-1/2 animate-pulse bg-muted rounded" />
                <div className="h-4 w-full animate-pulse bg-muted rounded" />
                <div className="h-4 w-full animate-pulse bg-muted rounded" />
                <div className="h-4 w-full animate-pulse bg-muted rounded" />
              </div>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {renderField('Version', packageDetails.version, true)}
                    {renderField('Publisher', packageDetails.publisher, true)}
                    {renderField('Source', providerLabel(packageDetails.source))}
                    <Separator />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</span>
                      <p className="text-sm text-foreground whitespace-pre-wrap">
                        {packageDetails.description || 'No description available'}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Links</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {renderLink('Homepage', packageDetails.homepage, <ExternalLink className="h-3 w-3" />)}
                    {renderLink('License', packageDetails.license, <Github className="h-3 w-3" />)}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}