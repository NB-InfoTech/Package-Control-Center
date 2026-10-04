import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Package, ArrowUpCircle, RefreshCw, Clock, Shield, Pin, Download, Database, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { WingetService } from '@/services/winget';
import { queueService } from '@/services/queue';
import { useToast } from '@/hooks/useToast';
import type { DashboardStats, HealthStats, QueueItem } from '@/types';
import { providerLabel } from '@/types';
import { requestViewLogs } from '@/services/viewLogs';
import { cn } from '@/utils/cn';

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    installedAppsCount: 0,
    availableUpdatesCount: 0,
    lastRefresh: null,
  });
  const [health, setHealth] = useState<HealthStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // PCC v2.1 multi-source: per-provider counts for the "By Source" strip.
  const [byProvider, setByProvider] = useState<{ source: string; installed: number; updates: number }[]>([]);
  // P4: active operations shown with name / progress % / current step.
  const [activeOps, setActiveOps] = useState<QueueItem[]>([]);
  // Bulk-state audit: last `upgrade-all` operation (snapshot + summary),
  // shown as "Last Bulk Update" so the batch result never gets lost.
  const [lastBulk, setLastBulk] = useState<QueueItem | null>(null);
  const { addToast } = useToast();
  
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isMountedRef = useRef(true);

  const fetchStats = useCallback(async () => {
    if (!isMountedRef.current) return;
    setIsLoading(true);
    try {
      const [installedApps, availableUpdates] = await Promise.all([
        WingetService.getInstalledApps(),
        WingetService.getAvailableUpdates(),
      ]);

      if (!isMountedRef.current) return;
      
      setStats({
        installedAppsCount: installedApps.length,
        availableUpdatesCount: availableUpdates.length,
        lastRefresh: new Date(),
      });

      // PCC v2.1: group the merged lists by owning provider.
      const installedBySource = new Map<string, number>();
      const updatesBySource = new Map<string, number>();
      for (const a of installedApps) installedBySource.set(a.source, (installedBySource.get(a.source) ?? 0) + 1);
      for (const u of availableUpdates) updatesBySource.set(u.source, (updatesBySource.get(u.source) ?? 0) + 1);
      const sources = Array.from(new Set([...installedBySource.keys(), ...updatesBySource.keys()]));
      setByProvider(
        sources.map((s) => ({
          source: s,
          installed: installedBySource.get(s) ?? 0,
          updates: updatesBySource.get(s) ?? 0,
        }))
      );
    } catch (error) {
      if (!isMountedRef.current) return;
      addToast({
        title: 'Failed to load dashboard',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [addToast]);

  const fetchHealth = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const healthData = await WingetService.getHealthStats();
      if (isMountedRef.current) {
        setHealth(healthData);
      }
    } catch (error) {
      console.error('Failed to load health stats:', error);
    }
  }, []);

  const debouncedRefresh = useCallback(() => {
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
    }
    refreshTimeoutRef.current = setTimeout(() => {
      if (isMountedRef.current) {
        fetchStats();
        fetchHealth();
      }
    }, 1000);
  }, [fetchStats, fetchHealth]);

  // P4: track active (pending/running) queue operations for the
  // "Active Operations" section.
  useEffect(() => {
    const filterActive = (queue: QueueItem[]) =>
      queue.filter((item) => item.status === 'pending' || item.status === 'running');
    const findLastBulk = (queue: QueueItem[]) =>
      [...queue].reverse().find((item) => item.operationType === 'upgrade-all' && item.bulkMeta) ?? null;
    const apply = (queue: QueueItem[]) => {
      if (!isMountedRef.current) return;
      setActiveOps(filterActive(queue));
      setLastBulk(findLastBulk(queue));
    };
    const unsubscribe = queueService.subscribe(apply);
    queueService.getAll().then(apply);
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    fetchStats();
    fetchHealth();

    const unsubscribe = queueService.subscribe((queue) => {
      if (!isMountedRef.current) return;
      
      // Only refresh on upgrade/restore/collection-install completion
      const hasRelevantCompletion = queue.some(
        item => item.status === 'success' && 
        (item.operationType === 'upgrade' || 
         item.operationType === 'upgrade-all' ||
         item.operationType === 'restore' ||
         item.operationType === 'collection-install')
      );
      
      if (hasRelevantCompletion) {
        debouncedRefresh();
      }
    });

    return () => {
      isMountedRef.current = false;
      unsubscribe();
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current);
      }
    };
  }, [fetchStats, fetchHealth, debouncedRefresh]);

  const formatTime = (date: Date | null) => {
    if (!date) return 'Never';
    return date.toLocaleString();
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString();
  };

  const healthCards = health ? [
    {
      title: 'Ignored Packages',
      value: health.ignoredPackagesCount,
      icon: Shield,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      borderColor: 'border-yellow-500/20',
      description: 'Packages excluded from updates',
      link: '/ignored',
    },
    {
      title: 'Pinned Packages',
      value: health.pinnedPackagesCount,
      icon: Pin,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      description: 'Packages pinned from updates',
      link: '/pinned',
    },
    {
      title: 'Last Backup',
      value: formatDate(health.lastBackup),
      icon: Download,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      description: 'Last system backup created',
      link: '/migration',
    },
    {
      title: 'Last Restore',
      value: formatDate(health.lastRestore),
      icon: Database,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      borderColor: 'border-purple-500/20',
      description: 'Last restore operation',
      link: '/migration',
    },
    {
      title: 'System Snapshots',
      value: health.snapshotCount,
      icon: Database,
      color: 'text-indigo-500',
      bgColor: 'bg-indigo-500/10',
      borderColor: 'border-indigo-500/20',
      description: 'Captured system states',
      link: '/snapshots',
    },
  ] : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Dashboard</h2>
          <p className="text-muted-foreground">Overview of your packages across all sources</p>
        </div>
        <Button onClick={fetchStats} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {activeOps.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Active Operations</h3>
          <div className="space-y-3">
            {activeOps.map((op) => (
              <Card key={op.id}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {op.packageName || op.packageId || 'All Packages'}
                        </span>
                        <Badge variant="secondary" className="text-xs uppercase">
                          {op.status}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        Step: {op.currentStep || 'Preparing'}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className="font-mono text-sm text-primary w-12 text-right">
                        {Math.round(op.progress)}%
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => requestViewLogs()}>
                        View Logs
                      </Button>
                    </div>
                  </div>
                  <div className="mt-3 h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all duration-300 rounded-full"
                      style={{ width: `${Math.min(100, Math.max(0, op.progress))}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {lastBulk?.bulkMeta && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Last Bulk Update</h3>
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="text-sm">
                  <span className="text-muted-foreground">Processed </span>
                  <span className="font-medium">{lastBulk.bulkMeta.total} packages</span>
                  {lastBulk.completedAt && (
                    <span className="text-xs text-muted-foreground ml-2">
                      ({lastBulk.completedAt.toLocaleString()})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {lastBulk.bulkMeta.summary ? (
                    <>
                      <Badge variant="success">
                        Success: {lastBulk.bulkMeta.summary.succeeded.length}
                      </Badge>
                      <Badge variant="destructive">
                        Failed: {lastBulk.bulkMeta.summary.failed.length}
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="secondary">{lastBulk.status}</Badge>
                  )}
                </div>
              </div>
              {lastBulk.bulkMeta.summary && lastBulk.bulkMeta.summary.failed.length > 0 && (
                <p className="text-xs text-red-400">
                  Still need an update:{' '}
                  {lastBulk.bulkMeta.summary.failed
                    .map((id) => lastBulk.bulkMeta!.packages.find((p) => p.id === id)?.name ?? id)
                    .join(', ')}
                </p>
              )}
              <div className="flex flex-wrap gap-1.5">
                {lastBulk.bulkMeta.packages.map((pkg) => {
                  const failedId = lastBulk.bulkMeta?.summary?.failed.includes(pkg.id);
                  return (
                    <span
                      key={pkg.id}
                      className={cn(
                        'px-2 py-0.5 text-xs rounded border',
                        failedId
                          ? 'bg-red-500/10 text-red-400 border-red-500/20'
                          : 'bg-muted text-muted-foreground border-border'
                      )}
                      title={pkg.id}
                    >
                      {pkg.name}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Installed Applications</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-24" /> : stats.installedAppsCount}
            </div>
            <p className="text-xs text-muted-foreground">Total packages installed</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Available Updates</CardTitle>
            <ArrowUpCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <>
                  {stats.availableUpdatesCount}
                  {stats.availableUpdatesCount > 0 && (
                    <Badge variant="success" className="ml-2">Update available</Badge>
                  )}
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">Packages with updates available</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Refresh</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? <Skeleton className="h-8 w-32" /> : formatTime(stats.lastRefresh)}
            </div>
            <p className="text-xs text-muted-foreground">Data last updated</p>
          </CardContent>
        </Card>
      </div>

      {byProvider.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">By Source</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {byProvider.map((p) => (
              <div
                key={p.source}
                className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-1.5 text-sm"
              >
                <span className="font-medium">{providerLabel(p.source)}</span>
                <Badge variant="secondary" className="text-xs">{p.installed} installed</Badge>
                <Badge variant={p.updates > 0 ? 'success' : 'secondary'} className="text-xs">
                  {p.updates} {p.updates === 1 ? 'update' : 'updates'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {health && (
        <div>
          <h3 className="text-lg font-semibold mb-4">System Health</h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {healthCards.map((card, index) => (
              <Card key={index} className={cn('border-l-4', card.borderColor)}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                  <card.icon className={cn('h-4 w-4', card.color)} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{card.value}</div>
                  <p className="text-xs text-muted-foreground">{card.description}</p>
                  <Button asChild variant="ghost" size="sm" className="mt-2 h-7">
                    <a href={card.link}>View</a>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button asChild>
            <Link to="/installed">View Installed Apps</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/updates">Check for Updates</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/migration">Machine Migration</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/collections">Package Collections</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/snapshots">System Snapshots</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/drift">Drift Detection</Link>
          </Button>
          <Button variant="ghost" onClick={() => requestViewLogs()}>
            View Logs
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function formatTime(date: Date | null) {
  if (!date) return 'Never';
  return date.toLocaleString();
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}