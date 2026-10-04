import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Shield, ShieldOff, Trash2 } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import type { IgnoredPackage } from '@/types';
import { cn } from '@/utils/cn';

export function IgnoredPackages() {
  const [ignored, setIgnored] = useState<IgnoredPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { addToast } = useToast();

  const fetchIgnored = async () => {
    setIsLoading(true);
    try {
      const data = await WingetService.getIgnoredPackages();
      setIgnored(data);
    } catch (error) {
      addToast({
        title: 'Failed to load ignored packages',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnignore = async (id: string) => {
    try {
      await WingetService.unignorePackage(id);
      addToast({ title: 'Package unignored', variant: 'success' });
      fetchIgnored();
    } catch (error) {
      addToast({ title: 'Failed to unignore', variant: 'destructive' });
    }
  };

  useEffect(() => {
    fetchIgnored();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Ignored Packages</h2>
          <p className="text-muted-foreground">{ignored.length} packages ignored from updates</p>
        </div>
        <Button onClick={fetchIgnored} disabled={isLoading}>
          <RefreshCw className={cn('h-4 w-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <ScrollArea>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>ID</TableHead>
                  <TableHead>Ignored At</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : ignored.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No ignored packages
                    </TableCell>
                  </TableRow>
                ) : (
                  ignored.map(pkg => (
                    <TableRow key={pkg.id}>
                      <TableCell className="font-medium">{pkg.name}</TableCell>
                      <TableCell className="font-mono text-sm">{pkg.id}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(pkg.ignoredAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleUnignore(pkg.id)}
                          title="Unignore package"
                        >
                          <Shield className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {ignored.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Ignored Packages</h3>
            <p className="text-muted-foreground mb-4">
              Ignored packages are hidden from the Available Updates view and excluded from dashboard counts.
            </p>
            <Button variant="outline" asChild>
              <Link to="/updates">
                <ShieldOff className="h-4 w-4 mr-2" />
                View Available Updates
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}