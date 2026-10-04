import { useEffect } from 'react';
import { X, ExternalLink, Copy, Github } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import type { PackageDetails } from '@/types';

interface PackageDetailsDrawerProps {
  packageDetails: PackageDetails | null;
  isOpen: boolean;
  onClose: () => void;
  isLoading?: boolean;
}

export function PackageDetailsDrawer({ packageDetails, isOpen, onClose, isLoading }: PackageDetailsDrawerProps) {
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

  const copyToClipboard = (text: string, label: string) => {
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
              onClick={() => copyToClipboard(value, label)}
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
                    {renderField('Source', packageDetails.source)}
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