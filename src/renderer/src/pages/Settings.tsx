import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Shield, Moon, Sun } from 'lucide-react';
import { cn } from '@/utils/cn';
import { electronAPI } from '@/services/electron';
import { applyTheme } from '@/services/theme';
import { WingetService } from '@/services/winget';
import { AboutSection } from '@/components/settings/AboutSection';
import type { ThemeMode, ProviderInfo } from '@/types';

const THEME_OPTIONS: { value: ThemeMode; label: string; description: string; icon: typeof Moon }[] = [
  { value: 'dark', label: 'Dark', description: 'Always dark', icon: Moon },
  { value: 'light', label: 'Light', description: 'Always light', icon: Sun },
];

export function Settings() {
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark');

  // Load the persisted choice (ConfigService via main process).
  useEffect(() => {
    electronAPI.config
      .getThemeMode()
      .then((mode) => {
        const safe: ThemeMode = mode === 'light' ? 'light' : 'dark';
        setThemeMode(safe);
      })
      .catch(() => {
        /* Keep the default state; theme still works for this session. */
      });
  }, []);

  const handleThemeSelect = async (mode: ThemeMode) => {
    // Apply immediately, then persist (survives restart via ConfigService).
    setThemeMode(mode);
    applyTheme(mode);
    try {
      await electronAPI.config.setThemeMode(mode);
    } catch {
      /* Persistence unavailable — theme still applies for this session. */
    }
  };

  const activeLabel = themeMode === 'light' ? 'Light' : 'Dark';

  // PCC v2.1 multi-source: provider availability + enablement (Phase 5).
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  // Track which providers are currently being auto-installed.
  const [installing, setInstalling] = useState<string[]>([]);
  const [installError, setInstallError] = useState<Record<string, string>>({});

  useEffect(() => {
    WingetService.getProviders()
      .then(setProviders)
      .catch(() => {
        /* Providers stay hidden — the card simply shows nothing. */
      });
  }, []);

  const handleProviderToggle = async (id: string, enabled: boolean) => {
    const target = providers.find((p) => p.id === id);
    // Optimistic update, reverted on failure.
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, enabled } : p)));
    setInstallError((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
    if (enabled) {
      // Start the spinner BEFORE awaiting — the main process is installing
      // the package manager right now and the invoke resolves only when the
      // installer actually finished (up to a few minutes for Chocolatey).
      setInstalling((prev) => (prev.includes(id) ? prev : [...prev, id]));
    }
    try {
      const result = await WingetService.setProviderEnabled(id, enabled, true);
      if (!result.ok) {
        setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !enabled } : p)));
      } else if (enabled && result.installOutcome) {
        // Surface what the installer actually did, then refresh availability
        // so the badge flips from "Unavailable" to "Active" on success.
        if (result.installOutcome === 'failed') {
          setInstallError((prev) => ({
            ...prev,
            [id]: `Couldn't set up ${target?.name ?? id} automatically — see the queue logs for details.`,
          }));
        } else if (result.installOutcome === 'needs-elevation') {
          setInstallError((prev) => ({
            ...prev,
            [id]: `${target?.name ?? id} needs Administrator rights — restart PCC as admin and the setup will finish automatically.`,
          }));
        }
        const refreshed = await WingetService.getProviders().catch(() => null);
        if (refreshed) setProviders(refreshed);
      }
    } catch {
      setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, enabled: !enabled } : p)));
    } finally {
      setInstalling((prev) => prev.filter((i) => i !== id));
    }
  };

  // Chocolatey elevation fix: show the current privilege level next to the
  // providers that need it (choco install/upgrade/uninstall fail without it).
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [relaunching, setRelaunching] = useState(false);

  useEffect(() => {
    WingetService.isAdministrator().then(setIsAdmin).catch(() => setIsAdmin(null));
  }, []);

  const handleRelaunchAsAdmin = async () => {
    setRelaunching(true);
    try {
      await WingetService.relaunchAsAdmin();
    } catch {
      /* The app may quit before the invoke settles. */
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-bold">Settings</h2>
        <p className="text-muted-foreground">Configure Package Control Center</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>Customize how the application looks</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Theme</p>
                <p className="text-sm text-muted-foreground">{activeLabel}</p>
              </div>
            </div>
            <div
              className="inline-flex w-fit rounded-lg border bg-muted/40 p-1"
              role="radiogroup"
              aria-label="Theme"
            >
              {THEME_OPTIONS.map(({ value, label, description, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={themeMode === value}
                  onClick={() => void handleThemeSelect(value)}
                  title={description}
                  className={cn(
                    'flex items-center gap-2 rounded-md px-4 py-1.5 text-sm transition-colors',
                    themeMode === value
                      ? 'bg-background font-medium text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {label}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              The choice is saved and restored on the next launch.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* PCC v2.1 multi-source: provider enable/disable (Phase 5) */}
      {providers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Package Sources</CardTitle>
            <CardDescription>
              Enable or disable package providers. Disabled sources are hidden from installed lists,
              updates, and bulk operations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {providers.some((p) => p.requiresElevation && p.enabled) && (
              <div
                className={cn(
                  'flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm',
                  isAdmin
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-600'
                )}
              >
                <span className="flex items-center gap-2">
                  <Shield className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {isAdmin === null
                    ? 'Checking privilege level…'
                    : isAdmin
                      ? 'Running as Administrator — Chocolatey operations will work.'
                      : 'Running with standard privileges — Chocolatey operations need elevation.'}
                </span>
                {isAdmin === false && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={relaunching}
                    onClick={() => void handleRelaunchAsAdmin()}
                    className="shrink-0"
                  >
                    {relaunching ? 'Relaunching…' : 'Restart as Administrator'}
                  </Button>
                )}
              </div>
            )}
            {providers.map((p) => {
              const on = p.enabled && p.available;
              return (
                <div key={p.id} className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{p.name}</p>
                      {p.available ? (
                        p.enabled ? (
                          <Badge variant="success" className="text-xs">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">
                            Disabled
                          </Badge>
                        )
                      ) : (
                        <Badge variant="destructive" className="text-xs">
                          Unavailable
                        </Badge>
                      )}
                      {p.requiresElevation && p.available && p.enabled && (
                        <Badge variant="outline" className="text-xs">
                          Needs admin
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {p.available
                        ? p.version
                          ? `${p.name} ${p.version} detected`
                          : `${p.name} detected`
                        : p.reason || 'Not detected on this machine'}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-3">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`Toggle ${p.name}`}
                      disabled={installing.includes(p.id)}
                      onClick={() => void handleProviderToggle(p.id, !on)}
                      className={cn(
                        'relative h-6 w-11 shrink-0 rounded-full border transition-colors',
                        on ? 'border-primary bg-primary' : 'bg-muted',
                        installing.includes(p.id) && 'opacity-60'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
                          on && 'translate-x-5'
                        )}
                      />
                    </button>
                    {installing.includes(p.id) && (
                      <span className="flex items-center gap-2 text-xs text-blue-600">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <circle className="opacity-75" cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="4" strokeDasharray="20 12" strokeLinecap="round" />
                        </svg>
                        Setting up {p.name}…
                      </span>
                    )}
                    {installError[p.id] && (
                      <span className="flex items-center gap-2 text-xs text-red-600" title={installError[p.id]}>
                        <span className="text-xs">⚠</span>
                        {installError[p.id]}
                      </span>
                    )}
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-muted-foreground">
              Changes are saved and apply immediately. Enabling a source also installs its package
              manager automatically when it is missing.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Package Control Center Configuration</CardTitle>
          <CardDescription>Configure Package Control Center behavior</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Auto-accept source agreements</p>
              <p className="text-sm text-muted-foreground">Automatically accept source agreements when running commands</p>
            </div>
            <Button variant="outline" disabled>
              <span className="text-xs">Enabled</span>
            </Button>
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Default source</p>
              <p className="text-sm text-muted-foreground">Use Winget default source</p>
            </div>
            <Button variant="outline" disabled>
              <span className="text-xs">Coming Soon</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* About page (modernized): live application, provider, statistics,
          system information, feature and link sections. */}
      <AboutSection theme={themeMode} />
    </div>
  );
}