import { useState, useEffect } from 'react';
import { Search, RefreshCw, Eye, Download, FileText, Shield, ShieldOff, X, ExternalLink, Copy, Github } from 'lucide-react';
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
import type { InstalledApp, PackageDetails } from '@/types';
import { providerLabel } from '@/types';
import { cn } from '@/utils/cn';

export function InstalledApps() {
  const [apps, setApps] = useState<InstalledApp[]>([]);
  const [filteredApps, setFilteredApps] = useState<InstalledApp[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedPackage, setSelectedPackage] = useState<PackageDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const { addToast } = useToast();

  const fetchApps = async () => {
    setIsLoading(true);
    try {
      const data = await WingetService.getInstalledApps();
      setApps(data);
      setFilteredApps(data);
    } catch (error) {
      addToast({
        title: 'Failed to load installed apps',
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

  const handleExportJson = async () => {
    try {
      const allApps = await WingetService.getAllInstalledApps();
      const result = await WingetService.exportJson(allApps);
      if (result.success) {
        addToast({
          title: 'Export successful',
          description: `Exported to ${result.filePath}`,
          variant: 'success',
        });
      }
    } catch (error) {
      addToast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleExportCsv = async () => {
    try {
      const allApps = await WingetService.getAllInstalledApps();
      const result = await WingetService.exportCsv(allApps);
      if (result.success) {
        addToast({
          title: 'Export successful',
          description: `Exported to ${result.filePath}`,
          variant: 'success',
        });
      }
    } catch (error) {
      addToast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  const handleBackup = async () => {
    try {
      const allApps = await WingetService.getAllInstalledApps();
      const result = await WingetService.backupPackages(allApps);
      if (result.success) {
        addToast({
          title: 'Backup successful',
          description: `Backed up to ${result.filePath}`,
          variant: 'success',
        });
      }
    } catch (error) {
      addToast({
        title: 'Backup failed',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    fetchApps();
  }, []);

  useEffect(() => {
    const filtered = apps.filter(app =>
      app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.version.toLowerCase().includes(searchQuery.toLowerCase()) ||
      app.source.toLowerCase().includes(searchQuery.toLowerCase()) ||
      providerLabel(app.source).toLowerCase().includes(searchQuery.toLowerCase())
    );
    setFilteredApps(filtered);
  }, [searchQuery, apps]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Installed Apps</h2>
          <p className="text-muted-foreground">{filteredApps.length} of {apps.length} packages</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleExportJson} disabled={isLoading}>
            <FileText className="h-4 w-4 mr-2" />
            Export JSON
          </Button>
          <Button variant="outline" onClick={handleExportCsv} disabled={isLoading}>
            <FileText className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={handleBackup} disabled={isLoading}>
            <Download className="h-4 w-4 mr-2" />
            Backup
          </Button>
          <Button onClick={fetchApps} disabled={isLoading}>
            <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search apps..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  ))
                ) : filteredApps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No apps found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredApps.map(app => (
                    <TableRow key={app.id}>
                      <TableCell className="font-medium">{app.name}</TableCell>
                      <TableCell className="font-mono text-sm">{app.id}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">{app.version}</Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{providerLabel(app.source)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleViewDetails(app.id, app.source)}
                            disabled={detailsLoading}
                            title="View details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={async () => {
                              try {
                                await WingetService.ignorePackage(app.id, app.name);
                                addToast({ title: 'Package ignored', variant: 'success' });
                                fetchApps();
                              } catch (error) {
                                addToast({ title: 'Failed to ignore', variant: 'destructive' });
                              }
                            }}
                            title="Ignore updates for this package"
                          >
                            <ShieldOff className="h-4 w-4" />
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

      <PackageDetailsDrawer
        packageDetails={selectedPackage}
        isOpen={!!selectedPackage}
        onClose={() => setSelectedPackage(null)}
        isLoading={detailsLoading}
      />
    </div>
  );
}

// Inline PackageDetailsDrawer

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