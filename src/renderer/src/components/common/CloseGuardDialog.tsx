import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { electronAPI } from '@/services/electron';

interface ActiveOp {
  id: string;
  name: string;
  status: string;
}

interface CloseRequest {
  active: ActiveOp[];
}

/**
 * PCC v2.0.1 P6 — safe shutdown dialog.
 *
 * The main process intercepts every close attempt (X button, Alt+F4,
 * menu exit) while operations are active and pushes
 * `window:close-requested`. This component renders the choice dialog:
 *
 *   [Stay Open]  [Close After Updates Finish]  [Force Stop Updates & Exit]
 *
 * "Force" additionally gets a native confirm ("Terminate Winget
 * processes?") from the main process before winget.exe is killed.
 */
export function CloseGuardDialog() {
  const [request, setRequest] = useState<CloseRequest | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => electronAPI.window.onCloseRequested(setRequest), []);

  if (!request) return null;

  const choose = async (choice: 'stay' | 'wait' | 'force') => {
    setBusy(true);
    try {
      await electronAPI.window.closeChoice(choice);
      // "stay" and "wait" keep the window; close the dialog.
      if (choice !== 'force') setRequest(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" aria-hidden="true" />
      <Card className="relative w-full max-w-md mx-4 shadow-xl">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <CardTitle className="text-base">Updates are currently running</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Closing may interrupt:
          </p>
          <ul className="max-h-40 overflow-y-auto rounded border border-border bg-muted/40 p-3 space-y-1">
            {request.active.map((op) => (
              <li key={op.id} className="flex items-center justify-between text-sm">
                <span className="truncate">{op.name}</span>
                <span className="ml-3 shrink-0 text-xs text-muted-foreground uppercase">
                  {op.status}
                </span>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2">
            <Button onClick={() => choose('stay')} disabled={busy}>
              Stay Open
            </Button>
            <Button variant="outline" onClick={() => choose('wait')} disabled={busy}>
              Close After Updates Finish
            </Button>
            <Button
              variant="destructive"
              onClick={() => choose('force')}
              disabled={busy}
              aria-label="Force stop updates and exit"
            >
              {busy ? 'Working…' : 'Force Stop Updates & Exit'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
