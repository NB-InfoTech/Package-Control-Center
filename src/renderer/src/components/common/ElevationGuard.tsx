import { forwardRef, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ShieldAlert, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/cn';
import { WingetService } from '@/services/winget';

/**
 * Chocolatey elevation fix — renderer guard.
 *
 * Providers flagged `requiresElevation` (Chocolatey: choco writes to
 * C:\ProgramData\chocolatey and cannot self-elevate) can only perform
 * install/upgrade/uninstall when PCC itself runs as Administrator.
 * `useElevationGuard().ensure(sources)` gates mutating operations:
 *
 *   - returns 'proceed'    when no elevation-requiring provider is involved
 *                           or PCC already runs elevated;
 *   - opens the dialog and resolves 'blocked' when the user cancels;
 *   - resolves 'restarting' when the user picks
 *     "Restart PCC as Administrator" (UAC relaunch, app quits).
 *
 * Pages render `{guard.ui}` once (e.g. at the page root) and call
 * `guard.ensure([...])` before firing provider-routed mutating actions.
 */

export type ElevationGate = 'proceed' | 'blocked' | 'restarting';

export function useElevationGuard() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [providerName, setProviderName] = useState('Chocolatey');
  const resolverRef = useRef<((gate: ElevationGate) => void) | null>(null);

  const ensure = async (
    sources: string | null | undefined | Array<string | null | undefined>
  ): Promise<ElevationGate> => {
    const list: Array<string | null | undefined> = Array.isArray(sources) ? sources : [sources];
    const candidates = list
      .filter((s): s is string => typeof s === 'string' && s.length > 0)
      .filter((s) => s.toLowerCase() !== 'winget' && s.toLowerCase() !== 'msstore');
    if (candidates.length === 0) return 'proceed';
    try {
      const providers = await WingetService.getProviders().catch(() => []);
      const names = new Set<string>();
      let anyRequiresElevation = false;
      for (const s of candidates) {
        const normalized = s.toLowerCase();
        const info = providers.find(
          (p) => p.id.toLowerCase() === normalized || p.name.toLowerCase() === normalized
        );
        if (info) {
          if (info.requiresElevation) {
            anyRequiresElevation = true;
            names.add(info.name);
          }
        } else if (normalized.includes('choco')) {
          // Unknown provider tag that looks like chocolatey: stay conservative.
          anyRequiresElevation = true;
          names.add('Chocolatey');
        }
      }
      if (!anyRequiresElevation) return 'proceed';
      const admin = await WingetService.isAdministrator().catch(() => true);
      if (admin) return 'proceed';
      setProviderName([...names].join(', '));
      setOpen(true);
      return await new Promise<ElevationGate>((resolve) => {
        resolverRef.current = resolve;
      });
    } catch {
      // Never block an operation because of a guard failure.
      return 'proceed';
    }
  };

  const onRestart = async () => {
    setBusy(true);
    try {
      await WingetService.relaunchAsAdmin();
    } catch {
      // The app may quit before the invoke settles; treat as started.
    }
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.('restarting');
  };

  const onCancel = () => {
    setBusy(false);
    setOpen(false);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.('blocked');
  };

  const ui = (
    <DialogRoot open={open} onOpenChange={(v) => { if (!v && !busy) onCancel(); }}>
      <DialogContent>
        <div className="flex items-start gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-orange-500/15">
            <ShieldAlert className="h-5 w-5 text-orange-500" />
          </div>
          <div className="flex-1 space-y-2">
            <DialogTitle>Administrator privileges required</DialogTitle>
            <DialogDescription>
              {providerName} updates require Administrator privileges.
            </DialogDescription>
            <p className="text-sm text-muted-foreground">
              Package Control Center is not running as Administrator, so{' '}
              {providerName.toLowerCase()} install, update, and uninstall operations will fail.
              You can restart the app with elevated privileges and retry.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={onRestart} disabled={busy}>
            {busy ? 'Relaunching…' : 'Restart PCC as Administrator'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );

  return { ensure, ui };
}

// --- minimal shadcn-style Dialog primitives (mirrors Collections.tsx) -------

const DialogRoot = DialogPrimitive.Root;

const DialogOverlay = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
        className
      )}
      {...props}
    />
  )
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = forwardRef<HTMLDivElement, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(
  ({ className, children, ...props }, ref) => (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full max-w-md translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
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
    <DialogPrimitive.Title
      ref={ref}
      className={cn('text-lg font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  )
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = forwardRef<
  HTMLParagraphElement,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;