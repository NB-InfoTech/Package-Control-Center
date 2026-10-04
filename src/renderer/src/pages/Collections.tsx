import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit, Download, Upload, Package, Save, Play, FileText, Eye } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import { useElevationGuard } from '@/components/common/ElevationGuard';
import type { Collection, CollectionPackage, CollectionExport, ProviderId } from '@/types';
import { cn } from '@/utils/cn';

export function Collections() {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCollection, setSelectedCollection] = useState<Collection | null>(null);
  const [showDialog, setShowDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', packages: '', source: '' as ProviderId | '' });
  const [importDialog, setImportDialog] = useState(false);
  const [importJson, setImportJson] = useState('');
  const { addToast } = useToast();
  // Chocolatey elevation fix: gate collection installs by provider tags.
  const elevation = useElevationGuard();

  const fetchCollections = async () => {
    setIsLoading(true);
    try {
      const data = await WingetService.getCollections();
      setCollections(data);
    } catch (error) {
      addToast({ title: 'Failed to load collections', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchCollections(); }, []);

  const handleCreate = async () => {
    try {
      const packages: CollectionPackage[] = formData.packages
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(id => ({ id, provider: formData.source || undefined }));
      
      await WingetService.createCollection({
        name: formData.name,
        description: formData.description,
        isBuiltIn: false,
        packages,
      });
      addToast({ title: 'Collection created', variant: 'success' });
      setShowDialog(false);
      setFormData({ name: '', description: '', packages: '', source: '' });
      fetchCollections();
    } catch (error) {
      addToast({ title: 'Failed to create collection', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleUpdate = async () => {
    if (!selectedCollection) return;
    try {
      const packages: CollectionPackage[] = formData.packages
        .split('\n')
        .map(line => line.trim())
        .filter(line => line)
        .map(id => ({ id, provider: formData.source || undefined }));
      
      await WingetService.updateCollection(selectedCollection.id, {
        name: formData.name,
        description: formData.description,
        packages,
      });
      addToast({ title: 'Collection updated', variant: 'success' });
      setShowDialog(false);
      setFormData({ name: '', description: '', packages: '', source: '' });
      setSelectedCollection(null);
      setIsEditing(false);
      fetchCollections();
    } catch (error) {
      addToast({ title: 'Failed to update collection', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this collection?')) return;
    try {
      await WingetService.deleteCollection(id);
      addToast({ title: 'Collection deleted', variant: 'success' });
      fetchCollections();
    } catch (error) {
      addToast({ title: 'Failed to delete collection', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleExport = async (collection: Collection) => {
    try {
      const exportData = await WingetService.exportCollection(collection.id);
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${collection.name.replace(/\s+/g, '-').toLowerCase()}-collection.json`;
      a.click();
      URL.revokeObjectURL(url);
      addToast({ title: 'Collection exported', variant: 'success' });
    } catch (error) {
      addToast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleImport = async () => {
    try {
      const data = JSON.parse(importJson) as CollectionExport;
      await WingetService.importCollection(data);
      addToast({ title: 'Collection imported', variant: 'success' });
      setImportDialog(false);
      setImportJson('');
      fetchCollections();
    } catch (error) {
      addToast({ title: 'Import failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const handleInstall = async (collection: Collection) => {
    try {
      // Chocolatey elevation fix: gate by the collection's provider tags.
      const gate = await elevation.ensure(collection.packages.map((p) => p.provider));
      if (gate === 'blocked') return;
      if (gate === 'restarting') {
        addToast({ title: 'Relaunching as Administrator…', description: 'PCC will restart with elevated privileges.' });
        return;
      }
      addToast({ title: 'Installing collection...', variant: 'default' });
      const results = await WingetService.installCollection(collection.id);
      const success = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      addToast({ title: 'Installation complete', description: `${success} succeeded, ${failed} failed`, variant: failed > 0 ? 'destructive' : 'success' });
    } catch (error) {
      addToast({ title: 'Installation failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    }
  };

  const openCreateDialog = () => {
    setIsEditing(false);
    setSelectedCollection(null);
    setFormData({ name: '', description: '', packages: '', source: '' });
    setShowDialog(true);
  };

  const openEditDialog = (collection: Collection) => {
    setIsEditing(true);
    setSelectedCollection(collection);
    const tagged = collection.packages.find((p) => p.provider);
    setFormData({
      name: collection.name,
      description: collection.description || '',
      packages: collection.packages.map(p => p.id).join('\n'),
      source: (tagged?.provider as ProviderId | undefined) || '',
    });
    setShowDialog(true);
  };

  return (
    <div className="space-y-6">
      {elevation.ui}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Package Collections</h2>
          <p className="text-muted-foreground">Manage curated package collections</p>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className="h-4 w-4 mr-2" />
          Create Collection
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {collections.map(collection => (
          <Card key={collection.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {collection.name}
                    {collection.isBuiltIn && <Badge variant="secondary" className="text-xs">Built-in</Badge>}
                  </CardTitle>
                  <CardDescription>{collection.description || 'No description'}</CardDescription>
                </div>
                <Badge variant={collection.isBuiltIn ? 'secondary' : 'outline'}>
                  {collection.packages.length} packages
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => openEditDialog(collection)} disabled={collection.isBuiltIn}>
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleExport(collection)}>
                  <Download className="h-3 w-3 mr-1" />
                  Export
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleInstall(collection)}>
                  <Play className="h-3 w-3 mr-1" />
                  Install
                </Button>
                {!collection.isBuiltIn && (
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(collection.id)}>
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete
                  </Button>
                )}
              </div>
              <Separator />
              <div className="text-sm text-muted-foreground">
                {collection.isBuiltIn ? 'Built-in collection' : `Created: ${new Date(collection.createdAt).toLocaleDateString()}`}
                {' • Updated: '}{new Date(collection.updatedAt).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {collections.length === 0 && !isLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Collections</h3>
            <p className="text-muted-foreground mb-4">Create your first package collection</p>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Create Collection
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{isEditing ? 'Edit Collection' : 'Create Collection'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="My Collection"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Description of this collection"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="packages">Package IDs (one per line)</Label>
              <Textarea
                id="packages"
                value={formData.packages}
                onChange={e => setFormData(prev => ({ ...prev, packages: e.target.value }))}
                placeholder="Git.Git&#10;Microsoft.VisualStudioCode&#10;7zip.7zip"
                rows={6}
                className="font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">Enter package IDs, one per line (Winget, Chocolatey, or Store)</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="source">Package source</Label>
              <select
                id="source"
                value={formData.source}
                onChange={e => setFormData(prev => ({ ...prev, source: e.target.value as ProviderId | '' }))}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="">Winget (default)</option>
                <option value="chocolatey">Chocolatey</option>
                <option value="msstore">Microsoft Store</option>
              </select>
              <p className="text-xs text-muted-foreground">Where the package IDs above will be installed from. Each collection uses a single source.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>Cancel</Button>
            <Button onClick={isEditing ? handleUpdate : handleCreate}>{isEditing ? 'Update' : 'Create'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Dialog */}
      <Dialog open={importDialog} onOpenChange={setImportDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import Collection</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="importJson">Collection JSON</Label>
              <Textarea
                id="importJson"
                value={importJson}
                onChange={e => setImportJson(e.target.value)}
                placeholder="Paste exported collection JSON here"
                rows={10}
                className="font-mono text-sm"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setImportDialog(false); setImportJson(''); }}>Cancel</Button>
            <Button onClick={handleImport}>Import</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Minimal Dialog components for this page
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

// Minimal Textarea, Label
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