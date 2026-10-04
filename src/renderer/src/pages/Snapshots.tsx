import { useState, useEffect } from 'react';
import { Plus, Trash2, RefreshCw, Eye, GitCompare, Download, FileText } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import type { SystemSnapshot, SnapshotComparisonResult } from '@/types';
import { providerLabel } from '@/types';
import { cn } from '@/utils/cn';

export function Snapshots() {
  const [snapshots, setSnapshots] = useState<SystemSnapshot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '' });
  const [compareDialog, setCompareDialog] = useState(false);
  const [selectedSnapshot1, setSelectedSnapshot1] = useState<SystemSnapshot | null>(null);
  const [selectedSnapshot2, setSelectedSnapshot2] = useState<SystemSnapshot | null>(null);
  const [comparison, setComparison] = useState<SnapshotComparisonResult | null>(null);
  const [comparing, setComparing] = useState(false);
  const { addToast } = useToast();

  const fetchSnapshots = async () => {
    setIsLoading(true);
    try {
      const data = await WingetService.getSnapshots();
      setSnapshots(data);
    } catch (error) {
      addToast({ title: 'Failed to load snapshots', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchSnapshots(); }, []);

  const handleCreate = async () => {
    try {
      await WingetService.createSnapshot(formData.name, formData.description);
      addToast({ title: 'Snapshot created', variant: 'success' });
      setShowDialog(false);
      setFormData({ name: '', description: '' });
      fetchSnapshots();
    } catch (error) {
      addToast({ title: 'Failed to create snapshot', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this snapshot?')) return;
    try {
      await WingetService.deleteSnapshot(id);
      addToast({ title: 'Snapshot deleted', variant: 'success' });
      fetchSnapshots();
    } catch (error) {
      addToast({ title: 'Failed to delete snapshot', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleCompare = async () => {
    if (!selectedSnapshot1 || !selectedSnapshot2) return;
    setComparing(true);
    try {
      const result = await WingetService.compareSnapshots(selectedSnapshot1.id, selectedSnapshot2.id);
      setComparison(result);
    } catch (error) {
      addToast({ title: 'Comparison failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setComparing(false);
    }
  };

  const handleExportSnapshot = async (snapshot: SystemSnapshot) => {
    try {
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${snapshot.name.replace(/\s+/g, '-').toLowerCase()}-snapshot.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ title: 'Snapshot exported', variant: 'success' });
    } catch (error) {
      addToast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">System Snapshots</h2>
          <p className="text-muted-foreground">Capture and compare system state over time</p>
        </div>
        <Button onClick={() => setShowDialog(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Snapshot
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Packages</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-48">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-48" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    </TableRow>
                  ))
                ) : snapshots.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No snapshots yet. Create your first snapshot to capture the current system state.
                    </TableCell>
                  </TableRow>
                ) : (
                  snapshots.map(snapshot => (
                    <TableRow key={snapshot.id}>
                      <TableCell className="font-medium">{snapshot.name}</TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {snapshot.description || '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{snapshot.totalPackages}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(snapshot.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button variant="ghost" size="icon" onClick={() => handleExportSnapshot(snapshot)} title="Export JSON">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => { setSelectedSnapshot1(snapshot); setCompareDialog(true); }} title="Compare">
                            <GitCompare className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => handleDelete(snapshot.id)} title="Delete">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Create Snapshot Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Snapshot</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Snapshot name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description of this snapshot"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDialog(false); setFormData({ name: '', description: '' }); }}>Cancel</Button>
            <Button onClick={handleCreate} disabled={!formData.name}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Compare Dialog */}
      <Dialog open={compareDialog} onOpenChange={setCompareDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Compare Snapshots</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>First Snapshot</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedSnapshot1?.id || ''}
                onChange={e => { const snap = snapshots.find(s => s.id === e.target.value); setSelectedSnapshot1(snap || null); }}
              >
                <option value="">Select first snapshot</option>
                {snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({new Date(s.createdAt).toLocaleDateString()})</option>)}
              </select>
            </div>
            <div className="space-y-2">
              <Label>Second Snapshot</Label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedSnapshot2?.id || ''}
                onChange={e => { const snap = snapshots.find(s => s.id === e.target.value); setSelectedSnapshot2(snap || null); }}
              >
                <option value="">Select second snapshot</option>
                {snapshots.map(s => <option key={s.id} value={s.id}>{s.name} ({new Date(s.createdAt).toLocaleDateString()})</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCompareDialog(false); setSelectedSnapshot1(null); setSelectedSnapshot2(null); setComparison(null); }}>Cancel</Button>
            <Button onClick={handleCompare} disabled={comparing || !selectedSnapshot1 || !selectedSnapshot2}>
              {comparing ? 'Comparing...' : 'Compare'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Comparison Results */}
      {comparison && (
        <Card>
          <CardHeader>
            <CardTitle>Comparison Results</CardTitle>
            <CardDescription>
              {comparison.added.length} added, {comparison.removed.length} removed, {comparison.versionChanged.length} version changed, {comparison.unchanged} unchanged
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {comparison.added.length > 0 && (
              <div>
                <h4 className="font-medium text-green-500 mb-2">Added Packages ({comparison.added.length})</h4>
                <ScrollArea className="max-h-48">
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>ID</TableHead><TableHead>Version</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {comparison.added.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium text-green-500">{p.name}</TableCell>
                          <TableCell className="font-mono text-sm">{p.id}</TableCell>
                          <TableCell><Badge variant="success">{p.version}</Badge></TableCell>
                          <TableCell>{providerLabel(p.source)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {comparison.removed.length > 0 && (
              <div>
                <h4 className="font-medium text-red-500 mb-2">Removed Packages ({comparison.removed.length})</h4>
                <ScrollArea className="max-h-48">
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>ID</TableHead><TableHead>Version</TableHead><TableHead>Source</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {comparison.removed.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium text-red-500">{p.name}</TableCell>
                          <TableCell className="font-mono text-sm">{p.id}</TableCell>
                          <TableCell><Badge variant="destructive">{p.version}</Badge></TableCell>
                          <TableCell>{providerLabel(p.source)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}

            {comparison.versionChanged.length > 0 && (
              <div>
                <h4 className="font-medium text-yellow-500 mb-2">Version Changes ({comparison.versionChanged.length})</h4>
                <ScrollArea className="max-h-48">
                  <Table>
                    <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>ID</TableHead><TableHead>Old Version</TableHead><TableHead>New Version</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {comparison.versionChanged.map(p => (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell className="font-mono text-sm">{p.id}</TableCell>
                          <TableCell><Badge variant="destructive">{p.oldVersion}</Badge></TableCell>
                          <TableCell><Badge variant="success">{p.newVersion}</Badge></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </ScrollArea>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Re-export minimal dialog components
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { forwardRef } from 'react';
import { X } from 'lucide-react';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0', className)}
      {...props}
    />
  )
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn('fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg', className)}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)} {...props} />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = forwardRef<HTMLHeadingElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold leading-none tracking-tight', className)} {...props} />
  )
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<HTMLParagraphElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-muted-foreground', className)} {...props} />
  )
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn('flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', className)}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

const Label = forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label ref={ref} className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)} {...props} />
  )
);
Label.displayName = 'Label';