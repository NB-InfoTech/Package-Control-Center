import { useState, useEffect } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle, MinusCircle, GitCompare, Download, Search, Filter } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import type { DriftReport, DriftItem, DriftSource, SystemSnapshot, Collection } from '@/types';
import { cn } from '@/utils/cn';
import { Label } from '@/components/ui/label';

export function DriftDetection() {
  const [report, setReport] = useState<DriftReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceType, setSourceType] = useState<DriftSource>('snapshot');
  const [sourceId, setSourceId] = useState('');
  const [snapshots, setSnapshots] = useState<SystemSnapshot[]>([]);
  const [collections, setCollections] = useState<Collection[]>([]);
  const [filter, setFilter] = useState<'all' | 'added' | 'removed' | 'version-changed' | 'source-changed'>('all');
  const { addToast } = useToast();

  const fetchSources = async () => {
    try {
      const [snaps, cols] = await Promise.all([
        WingetService.getSnapshots(),
        WingetService.getCollections(),
      ]);
      setSnapshots(snaps);
      setCollections(cols);
    } catch (error) {
      console.error('Failed to fetch sources:', error);
    }
  };

  useEffect(() => { fetchSources(); }, []);

  const handleDetect = async () => {
    if (!sourceId) {
      addToast({ title: 'Select a source', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      const result = await WingetService.detectDrift(sourceType, sourceId);
      setReport(result);
    } catch (error) {
      addToast({ title: 'Drift detection failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredDrifts = () => {
    if (!report) return [];
    if (filter === 'all') return report.drifts;
    return report.drifts.filter(d => d.type === filter);
  };

  const getTypeBadge = (type: DriftItem['type']) => {
    switch (type) {
      case 'added': return <Badge variant="success">Added</Badge>;
      case 'removed': return <Badge variant="destructive">Removed</Badge>;
      case 'version-changed': return <Badge variant="secondary">Version Changed</Badge>;
      case 'source-changed': return <Badge variant="outline">Source Changed</Badge>;
    }
  };

  const getTypeIcon = (type: DriftItem['type']) => {
    switch (type) {
      case 'added': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'removed': return <MinusCircle className="h-4 w-4 text-red-500" />;
      case 'version-changed': return <GitCompare className="h-4 w-4 text-yellow-500" />;
      case 'source-changed': return <GitCompare className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Drift Detection</h2>
          <p className="text-muted-foreground">Compare current system against snapshots, backups, or collections</p>
        </div>
        <Button onClick={handleDetect} disabled={isLoading || !sourceId}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          {isLoading ? 'Detecting...' : 'Detect Drift'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Detection Source</CardTitle>
          <CardDescription>Choose what to compare the current system against</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label>Source Type</Label>
              <Select value={sourceType} onValueChange={(value) => setSourceType(value as DriftSource)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="snapshot">System Snapshot</SelectItem>
                  <SelectItem value="backup">Backup File</SelectItem>
                  <SelectItem value="collection">Package Collection</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={sourceId} onValueChange={setSourceId} disabled={!sourceType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select source" />
                </SelectTrigger>
                <SelectContent>
                  {sourceType === 'snapshot' && snapshots.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name} ({new Date(s.createdAt).toLocaleDateString()})</SelectItem>
                  ))}
                  {sourceType === 'collection' && collections.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name} ({c.packages.length} packages) {c.isBuiltIn && '(Built-in)'}</SelectItem>
                  ))}
                  {sourceType === 'backup' && (
                    <SelectItem value="" disabled>Backups are auto-detected from backup folder</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>&nbsp;</Label>
              <Button onClick={handleDetect} disabled={isLoading || !sourceId} className="w-full">
                <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
                {isLoading ? 'Detecting...' : 'Detect Drift'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {report && (
        <>
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Drift Report</CardTitle>
                  <CardDescription>
                    Source: {report.sourceName} ({report.sourceType}) • {report.totalDrifts} drifts detected
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All ({report.totalDrifts})</SelectItem>
                      <SelectItem value="added">Added ({report.drifts.filter(d => d.type === 'added').length})</SelectItem>
                      <SelectItem value="removed">Removed ({report.drifts.filter(d => d.type === 'removed').length})</SelectItem>
                      <SelectItem value="version-changed">Version Changed ({report.drifts.filter(d => d.type === 'version-changed').length})</SelectItem>
                      <SelectItem value="source-changed">Source Changed ({report.drifts.filter(d => d.type === 'source-changed').length})</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex gap-4 text-sm text-muted-foreground mb-4">
                <span className="flex items-center gap-1"><CheckCircle className="h-3 w-3 text-green-500" /> Added: {report.drifts.filter(d => d.type === 'added').length}</span>
                <span className="flex items-center gap-1"><MinusCircle className="h-3 w-3 text-red-500" /> Removed: {report.drifts.filter(d => d.type === 'removed').length}</span>
                <span className="flex items-center gap-1"><GitCompare className="h-3 w-3 text-yellow-500" /> Version: {report.drifts.filter(d => d.type === 'version-changed').length}</span>
                <span className="flex items-center gap-1"><GitCompare className="h-3 w-3 text-blue-500" /> Source: {report.drifts.filter(d => d.type === 'source-changed').length}</span>
              </div>

              <ScrollArea className="max-h-96">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Package</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Drift Type</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>Expected</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {getFilteredDrifts().length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          No drifts found for this filter
                        </TableCell>
                      </TableRow>
                    ) : (
                      getFilteredDrifts().map((drift, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{drift.name}</TableCell>
                          <TableCell className="font-mono text-sm">{drift.id}</TableCell>
                          <TableCell>{getTypeBadge(drift.type)}</TableCell>
                          <TableCell className="font-mono text-sm">
                            {drift.current ? `${drift.current.version} (${drift.current.source})` : '—'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {drift.expected ? `${drift.expected.version} (${drift.expected.source})` : '—'}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-4">
              <div className="p-4 bg-green-500/10 rounded-lg border border-green-500/20">
                <p className="text-2xl font-bold text-green-500">{report.drifts.filter(d => d.type === 'added').length}</p>
                <p className="text-sm text-muted-foreground">Packages Added</p>
              </div>
              <div className="p-4 bg-red-500/10 rounded-lg border border-red-500/20">
                <p className="text-2xl font-bold text-red-500">{report.drifts.filter(d => d.type === 'removed').length}</p>
                <p className="text-sm text-muted-foreground">Packages Removed</p>
              </div>
              <div className="p-4 bg-yellow-500/10 rounded-lg border border-yellow-500/20">
                <p className="text-2xl font-bold text-yellow-500">{report.drifts.filter(d => d.type === 'version-changed').length}</p>
                <p className="text-sm text-muted-foreground">Version Changes</p>
              </div>
              <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500/20">
                <p className="text-2xl font-bold text-blue-500">{report.drifts.filter(d => d.type === 'source-changed').length}</p>
                <p className="text-sm text-muted-foreground">Source Changes</p>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {!report && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <GitCompare className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Drift Detection Run</h3>
            <p className="text-muted-foreground mb-4">Select a source and click "Detect Drift" to compare your current system</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Re-export minimal Select components
import * as SelectPrimitive from '@radix-ui/react-select';
import { forwardRef } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const Select = SelectPrimitive.Root;
const SelectGroup = SelectPrimitive.Group;
const SelectValue = SelectPrimitive.Value;

const SelectTrigger = forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Trigger
      ref={ref}
      className={cn('flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1', className)}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDown className="h-4 w-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
);
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

const SelectScrollUpButton = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollUpButton>>(
  ({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollUpButton
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronUp className="h-4 w-4" />
    </SelectPrimitive.ScrollUpButton>
  )
);
SelectScrollUpButton.displayName = SelectPrimitive.ScrollUpButton.displayName;

const SelectScrollDownButton = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.ScrollDownButton>>(
  ({ className, ...props }, ref) => (
    <SelectPrimitive.ScrollDownButton
      ref={ref}
      className={cn('flex cursor-default items-center justify-center py-1', className)}
      {...props}
    >
      <ChevronDown className="h-4 w-4" />
    </SelectPrimitive.ScrollDownButton>
  )
);
SelectScrollDownButton.displayName = SelectPrimitive.ScrollDownButton.displayName;

const SelectContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>>(
  ({ className, children, position = 'popper', ...props }, ref) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={cn('relative z-50 max-h-96 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2', position === 'popper' && 'data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1', className)}
        position={position}
        {...props}
      >
        <SelectPrimitive.Viewport className={cn('p-1', position === 'popper' && 'h-[var(--radix-select-trigger-height)] w-full min-w-[var(--radix-select-trigger-width)]')}>
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollUpButton />
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

const SelectLabel = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>>(
  ({ className, ...props }, ref) => (
    <SelectPrimitive.Label ref={ref} className={cn('py-1.5 text-sm font-semibold', className)} {...props} />
  )
);
SelectLabel.displayName = SelectPrimitive.Label.displayName;

const SelectItem = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>>(
  ({ className, children, ...props }, ref) => (
    <SelectPrimitive.Item
      ref={ref}
      className={cn('relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50', className)}
      {...props}
    >
      <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <Check className="h-4 w-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
);
SelectItem.displayName = SelectPrimitive.Item.displayName;

const SelectSeparator = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>>(
  ({ className, ...props }, ref) => (
    <SelectPrimitive.Separator ref={ref} className={cn('-mx-1 my-1 h-px bg-muted', className)} {...props} />
  )
);
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

import { Check } from 'lucide-react';