import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Loader2, Pin, PinOff, AlertTriangle } from 'lucide-react';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent } from '@/components/ui/card';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import type { PinnedPackage } from '@/types';
import { cn } from '@/utils/cn';

export function PinnedPackages() {
  const [pins, setPins] = useState<PinnedPackage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [pinningIds, setPinningIds] = useState<Set<string>>(new Set());
  const { addToast } = useToast();

  const fetchPins = async () => {
    setIsLoading(true);
    try {
      const data = await WingetService.getPinnedPackages();
      setPins(data);
    } catch (error) {
      addToast({
        title: 'Failed to load pinned packages',
        description: error instanceof Error ? error.message : 'Unknown error',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePin = async (id: string) => {
    setPinningIds(prev => new Set(prev).add(id));
    try {
      const result = await WingetService.pinPackage(id);
      if (result.success) {
        addToast({ title: 'Package pinned', variant: 'success' });
        fetchPins();
      } else {
        addToast({ title: 'Pin failed', description: result.error || result.output, variant: 'destructive' });
      }
    } catch (error) {
      addToast({ title: 'Pin failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPinningIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  const handleUnpin = async (id: string) => {
    setPinningIds(prev => new Set(prev).add(id));
    try {
      const result = await WingetService.unpinPackage(id);
      if (result.success) {
        addToast({ title: 'Package unpinned', variant: 'success' });
        fetchPins();
      } else {
        addToast({ title: 'Unpin failed', description: result.error || result.output, variant: 'destructive' });
      }
    } catch (error) {
      addToast({ title: 'Unpin failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setPinningIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    }
  };

  useEffect(() => {
    fetchPins();
  }, []);

  const isPinning = (id: string) => pinningIds.has(id);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Pinned Packages</h2>
          <p className="text-muted-foreground">{pins.length} packages pinned</p>
        </div>
        <Button onClick={fetchPins} disabled={isLoading}>
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
                  <TableHead>Pin Type</TableHead>
                  <TableHead>Pinned Version</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
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
                      <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    </TableRow>
                  ))
                ) : pins.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No pinned packages
                    </TableCell>
                  </TableRow>
                ) : (
                  pins.map(pin => (
                    <TableRow key={pin.id}>
                      <TableCell className="font-medium">{pin.name}</TableCell>
                      <TableCell className="font-mono text-sm">{pin.id}</TableCell>
                      <TableCell>
                        <Badge variant={pin.pinType === 'version' ? 'default' : 'destructive'}>
                          {pin.pinType === 'version' ? 'Version' : 'Block'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pin.pinnedVersion ? (
                          <Badge variant="secondary">{pin.pinnedVersion}</Badge>
                        ) : (
                          <span className="text-muted-foreground">N/A</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {isPinning(pin.id) ? (
                          <Button variant="ghost" size="icon" disabled>
                            <Loader2 className="h-4 w-4 animate-spin" />
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleUnpin(pin.id)}
                            title="Unpin package"
                          >
                            <PinOff className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {pins.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Pin className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Pinned Packages</h3>
            <p className="text-muted-foreground mb-4">
              Pinned packages are excluded from automatic updates. Pin a package to prevent it from being updated.
            </p>
            <Button variant="outline" asChild>
              <Link to="/installed">
                <Pin className="h-4 w-4 mr-2" />
                View Installed Apps
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}