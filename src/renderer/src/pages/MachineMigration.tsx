import { useState, useEffect } from 'react';
import { Download, Upload, FileText, Package, RefreshCw, CheckCircle, AlertCircle, MinusCircle, Settings, Save, FolderOpen, ArrowRight, Check, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import type { InstalledApp, BackupPackage, RestorePreviewItem, RestoreOptions, RestoreResult, RestoreReport } from '@/types';
import { cn } from '@/utils/cn';

export function MachineMigration() {
  const { addToast } = useToast();
  
  // Export/Backup state
  const [exporting, setExporting] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  
  // Restore state
  const [backupFile, setBackupFile] = useState<{ packages: BackupPackage[]; totalPackages: number; exportedAt: string } | null>(null);
  const [preview, setPreview] = useState<RestorePreviewItem[]>([]);
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set());
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreResults, setRestoreResults] = useState<RestoreResult[] | null>(null);
  const [restoreSource, setRestoreSource] = useState('');
  const [acceptSourceAgreements, setAcceptSourceAgreements] = useState(true);

  const handleExportJson = async () => {
    setExporting(true);
    try {
      const apps = await WingetService.getAllInstalledApps();
      const result = await WingetService.exportJson(apps);
      if (result.success) {
        addToast({ title: 'Export successful', description: `Exported to ${result.filePath}`, variant: 'success' });
      }
    } catch (error) {
      addToast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const apps = await WingetService.getAllInstalledApps();
      const result = await WingetService.exportCsv(apps);
      if (result.success) {
        addToast({ title: 'Export successful', description: `Exported to ${result.filePath}`, variant: 'success' });
      }
    } catch (error) {
      addToast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const handleBackup = async () => {
    setBackingUp(true);
    try {
      const apps = await WingetService.getAllInstalledApps();
      const result = await WingetService.backupPackages(apps);
      if (result.success) {
        addToast({ title: 'Backup successful', description: `Backed up to ${result.filePath}`, variant: 'success' });
      }
    } catch (error) {
      addToast({ title: 'Backup failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setBackingUp(false);
    }
  };

  const handleSelectBackupFile = async () => {
    const result = await WingetService.selectBackupFile();
    if (!result.canceled && result.filePath) {
      const loadResult = await WingetService.loadBackupFile(result.filePath);
      if (loadResult.success && loadResult.backup) {
        setBackupFile(loadResult.backup);
        setPreview([]);
        setSelectedPackages(new Set());
        setRestoreResults(null);
        addToast({ title: 'Backup loaded', description: `${loadResult.backup.totalPackages} packages found`, variant: 'success' });
      }
    }
  };

  const handleGeneratePreview = async () => {
    if (!backupFile) return;
    setLoadingPreview(true);
    try {
      const previewData = await WingetService.getRestorePreview(backupFile.packages);
      setPreview(previewData);
      // Auto-select packages that are install-available
      const autoSelect = new Set(previewData.filter(p => p.status === 'install-available').map(p => p.id));
      setSelectedPackages(autoSelect);
    } catch (error) {
      addToast({ title: 'Preview failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setLoadingPreview(false);
    }
  };

  const togglePackageSelection = (id: string) => {
    setSelectedPackages(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedPackages.size === preview.length) {
      setSelectedPackages(new Set());
    } else {
      setSelectedPackages(new Set(preview.map(p => p.id)));
    }
  };

  const handleExecuteRestore = async () => {
    if (selectedPackages.size === 0) {
      addToast({ title: 'No packages selected', variant: 'destructive' });
      return;
    }

    setRestoring(true);
    try {
      const options: RestoreOptions = {
        packageIds: Array.from(selectedPackages),
        source: restoreSource || undefined,
        acceptSourceAgreements,
      };
      const results = await WingetService.executeRestore(options);
      setRestoreResults(results);

      const success = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      // Generate report
      const report: RestoreReport = {
        generatedAt: new Date().toISOString(),
        totalRequested: options.packageIds.length,
        success,
        failed,
        skipped: 0,
        results,
      };
      await WingetService.generateRestoreReport(report);

      addToast({ 
        title: 'Restore completed', 
        description: `${success} succeeded, ${failed} failed`, 
        variant: failed > 0 ? 'destructive' : 'success' 
      });
    } catch (error) {
      addToast({ title: 'Restore failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setRestoring(false);
    }
  };

  const getStatusBadge = (status: RestorePreviewItem['status']) => {
    switch (status) {
      case 'already-installed':
        return <Badge variant="secondary">Already Installed</Badge>;
      case 'install-available':
        return <Badge variant="success">Install Available</Badge>;
      case 'missing-package':
        return <Badge variant="destructive">Missing Package</Badge>;
    }
  };

  const getStatusIcon = (status: RestorePreviewItem['status']) => {
    switch (status) {
      case 'already-installed':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'install-available':
        return <Download className="h-4 w-4 text-blue-500" />;
      case 'missing-package':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Machine Migration</h2>
        <p className="text-muted-foreground">Export, backup, and restore Winget packages across machines</p>
      </div>

      {/* Section 1: Export Inventory */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Export Inventory
              </CardTitle>
              <CardDescription>Export installed packages to JSON or CSV for documentation</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-4">
            <Button onClick={handleExportJson} disabled={exporting}>
              <Download className="h-4 w-4 mr-2" />
              Export JSON
            </Button>
            <Button onClick={handleExportCsv} disabled={exporting} variant="outline">
              <FileText className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Section 2: Create Backup */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Save className="h-5 w-5" />
                Create Backup
              </CardTitle>
              <CardDescription>Create a timestamped backup file for machine migration</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Button onClick={handleBackup} disabled={backingUp}>
            <Save className="h-4 w-4 mr-2" />
            {backingUp ? 'Creating Backup...' : 'Create Backup'}
          </Button>
          <p className="text-sm text-muted-foreground mt-2">
            Backups are saved to{' '}
            <code className="bg-muted px-1.5 py-0.5 rounded">
              ~/Documents/Package Control Center Backups/
            </code>
          </p>
        </CardContent>
      </Card>

      {/* Section 3: Restore Backup */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Restore Backup
          </CardTitle>
          <CardDescription>Select a backup file and restore packages to this machine</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {!backupFile ? (
            <div className="text-center py-12">
              <FolderOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No backup file selected</h3>
              <p className="text-muted-foreground mb-4">Select a backup file to begin the restore process</p>
              <Button onClick={handleSelectBackupFile}>
                <FolderOpen className="h-4 w-4 mr-2" />
                Select Backup File
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{backupFile.totalPackages} packages in backup</p>
                  <p className="text-sm text-muted-foreground">Exported: {new Date(backupFile.exportedAt).toLocaleString()}</p>
                </div>
                <Button variant="outline" onClick={() => { setBackupFile(null); setPreview([]); setSelectedPackages(new Set()); setRestoreResults(null); }}>
                  <X className="h-4 w-4 mr-2" />
                  Change File
                </Button>
              </div>

              {preview.length === 0 ? (
                <div className="text-center py-8">
                  <Button onClick={handleGeneratePreview} disabled={loadingPreview}>
                    <RefreshCw className={cn('h-4 w-4 mr-2', loadingPreview && 'animate-spin')} />
                    {loadingPreview ? 'Generating Preview...' : 'Generate Preview'}
                  </Button>
                  <p className="text-sm text-muted-foreground mt-2">Compare backup packages with current machine state</p>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Restore Preview ({preview.length} packages)</h3>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={selectedPackages.size === preview.length && preview.length > 0}
                          onChange={toggleSelectAll}
                        />
                        Select All
                      </label>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 py-2 border-t border-b">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Source (optional)"
                        value={restoreSource}
                        onChange={e => setRestoreSource(e.target.value)}
                        className="flex-1 max-w-xs px-2 py-1 text-sm border rounded bg-background"
                      />
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={acceptSourceAgreements}
                        onChange={e => setAcceptSourceAgreements(e.target.checked)}
                      />
                      Accept source agreements
                    </label>
                  </div>

                  <ScrollArea className="max-h-96">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-12"></TableHead>
                          <TableHead>Package Name</TableHead>
                          <TableHead>Package ID</TableHead>
                          <TableHead>Backup Version</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {preview.map(item => (
                          <TableRow key={item.id}>
                            <TableCell>
                              <input
                                type="checkbox"
                                checked={selectedPackages.has(item.id)}
                                onChange={() => togglePackageSelection(item.id)}
                                disabled={item.status === 'already-installed'}
                              />
                            </TableCell>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="font-mono text-sm">{item.id}</TableCell>
                            <TableCell>
                              <Badge variant="secondary">{item.version}</Badge>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                {getStatusIcon(item.status)}
                                {getStatusBadge(item.status)}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm">
                              {item.status === 'already-installed' && (
                                <>Installed: <span className="font-mono">{item.installedVersion}</span></>
                              )}
                              {item.status === 'install-available' && (
                                <>Available: <span className="font-mono">{item.availableVersion}</span></>
                              )}
                              {item.status === 'missing-package' && (
                                <>Not found in winget sources</>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <Button 
                      onClick={handleExecuteRestore} 
                      disabled={restoring || selectedPackages.size === 0}
                      className="w-full sm:w-auto"
                    >
                      <ArrowRight className="h-4 w-4 mr-2" />
                      {restoring ? `Restoring ${selectedPackages.size} packages...` : `Restore Selected (${selectedPackages.size})`}
                    </Button>
                  </div>
                </>
              )}

              {restoreResults && (
                <div className="pt-4 border-t">
                  <h3 className="font-medium mb-4">Restore Results</h3>
                  <ScrollArea className="max-h-64">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Package</TableHead>
                          <TableHead>Result</TableHead>
                          <TableHead>Details</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {restoreResults.map((result, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-sm">{result.packageName}</TableCell>
                            <TableCell>
                              {result.success ? (
                                <Badge variant="success">Success</Badge>
                              ) : (
                                <Badge variant="destructive">Failed</Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {result.error || result.output || 'Completed'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}