import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Package,
  RefreshCw,
  Cpu,
  HardDrive,
  Calendar,
  Monitor,
  Github,
  ExternalLink,
  BookOpen,
  FileText,
  Server,
  Layers,
  Camera,
  GitCompare,
  Boxes,
  Shield,
  Download,
  Upload,
  CheckCircle2,
  Ban,
  CircleSlash,
  Copy,
  Check,
  Palette,
  AppWindow,
  Globe,
  Terminal,
  AlertTriangle,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WingetService } from '@/services/winget';
import { providerLabel } from '@/types';
import type {
  AppInfo,
  AvailableUpdate,
  InstalledApp,
  ProviderHealth,
  ProviderHealthStatus,
  ProviderInfo,
  ThemeMode,
} from '@/types';
import { cn } from '@/utils/cn';

/**
 * About page for Package Control Center.
 *
 * Everything shown here is resolved live:
 *  - application / system information ........ main process (`app:getInfo`)
 *  - providers + status ..................... provider registry
 *  - package statistics ..................... aggregated installed/updates scan
 *
 * The only hardcoded content is the copyright line.
 */
const COPYRIGHT = 'Copyright © 2024-2026 Package Control Center';

/** Capability badges — a fixed description of what PCC ships with. */
const FEATURES: { label: string; icon: typeof Package }[] = [
  { label: 'Multi-Provider Updates', icon: RefreshCw },
  { label: 'Package Collections', icon: Boxes },
  { label: 'System Snapshots', icon: Camera },
  { label: 'Drift Detection', icon: GitCompare },
  { label: 'Machine Migration', icon: Layers },
  { label: 'Backup & Restore', icon: Download },
  { label: 'Update Queue', icon: Upload },
  { label: 'Ignore & Pin Rules', icon: Shield },
  { label: 'Theme Support', icon: Palette },
];

const LINKS: { label: string; href: string; icon: typeof Github }[] = [
  { label: 'GitHub Repository', href: 'https://github.com/package-control-center', icon: Github },
  {
    label: 'Source Code',
    href: 'https://github.com/package-control-center/package-control-center',
    icon: ExternalLink,
  },
  {
    label: 'Documentation',
    href: 'https://github.com/package-control-center/package-control-center#readme',
    icon: BookOpen,
  },
  {
    label: 'Release Notes',
    href: 'https://github.com/package-control-center/package-control-center/blob/main/CHANGELOG.md',
    icon: FileText,
  },
  {
    label: 'Provider Documentation',
    href: 'https://github.com/package-control-center/package-control-center/blob/main/MULTI_PROVIDER_ARCHITECTURE.md',
    icon: Server,
  },
];

const DESCRIPTION_PARAGRAPHS = [
  'Package Control Center (PCC) is a software lifecycle management platform for Windows.',
  'PCC provides unified package management across Winget, Chocolatey, and Microsoft Store through a single interface.',
  'Features include software inventory, update management, package collections, system snapshots, machine migration, drift detection, backup/restore, and automated update workflows.',
];

function formatDateTime(iso: string | undefined): string {
  if (!iso) return 'Unknown';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Compact labelled value tile used for application / system information. */
function InfoTile({
  icon: Icon,
  label,
  value,
  title,
  mono,
}: {
  icon: typeof Package;
  label: string;
  value: string;
  title?: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </div>
      <p
        className={cn('mt-1 truncate text-sm font-semibold', mono && 'font-mono text-[13px]')}
        title={title ?? value}
      >
        {value}
      </p>
    </div>
  );
}

/** Large statistics tile (Section 3). */
function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  isLoading,
}: {
  icon: typeof Package;
  label: string;
  value: number;
  hint: string;
  isLoading: boolean;
}) {
  return (
    <Card className="border-l-4 border-l-primary/60">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
        <div className="mt-2 text-3xl font-bold tabular-nums">
          {isLoading ? <span className="text-muted-foreground">—</span> : value}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </CardContent>
    </Card>
  );
}

/** Provider availability / enablement status pill. */
function ProviderStatus({ provider }: { provider: ProviderInfo }) {
  if (!provider.available) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-600">
        <Ban className="h-3 w-3" aria-hidden="true" />
        Unavailable
      </span>
    );
  }
  if (!provider.enabled) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-0.5 text-xs font-semibold text-muted-foreground">
        <CircleSlash className="h-3 w-3" aria-hidden="true" />
        Disabled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-600">
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      Ready
    </span>
  );
}

/**
 * Provider health badge (PCC v2.2).
 *
 * Four states map to distinct colors so a broken provider is obvious at a
 * glance: Ready / Unavailable / Disabled / Error.
 */
function ProviderHealthBadge({ status }: { status: ProviderHealthStatus }) {
  const styles: Record<ProviderHealthStatus, string> = {
    ready: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600',
    unavailable: 'border-red-500/30 bg-red-500/10 text-red-600',
    disabled: 'border bg-muted text-muted-foreground',
    error: 'border-amber-500/30 bg-amber-500/10 text-amber-600',
  };
  const icons: Record<ProviderHealthStatus, typeof Package> = {
    ready: CheckCircle2,
    unavailable: Ban,
    disabled: CircleSlash,
    error: AlertTriangle,
  };
  const Icon = icons[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold',
        styles[status]
      )}
    >
      <Icon className="h-3 w-3" aria-hidden="true" />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

/** One provider health card: name, status and detected version. */
function ProviderHealthCard({ health }: { health: ProviderHealth }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="truncate text-sm font-semibold" title={health.name}>
          {health.name}
        </p>
        <ProviderHealthBadge status={health.status} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {health.version ? (
          <span className="font-mono text-[13px]">{health.version}</span>
        ) : (
          <span className="italic">Version unavailable</span>
        )}
      </p>
    </div>
  );
}

export function AboutSection({ theme }: { theme: ThemeMode }) {
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [providerHealth, setProviderHealth] = useState<ProviderHealth[]>([]);
  const [installed, setInstalled] = useState<InstalledApp[]>([]);
  const [updates, setUpdates] = useState<AvailableUpdate[]>([]);
  const [isLoadingInfo, setIsLoadingInfo] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [copied, setCopied] = useState(false);

  // Application + provider information (fast).
  const loadInfo = useCallback(async () => {
    setIsLoadingInfo(true);
    try {
      const [info, providerList, health] = await Promise.all([
        WingetService.getAppInfo(),
        WingetService.getProviders(),
        WingetService.getProviderHealth(),
      ]);
      setAppInfo(info);
      setProviders(providerList);
      setProviderHealth(health);
    } catch {
      /* Leave defaults — the section renders placeholders. */
    } finally {
      setIsLoadingInfo(false);
    }
  }, []);

  // Package statistics (slow: triggers aggregating scans across providers).
  const loadStats = useCallback(async () => {
    setIsLoadingStats(true);
    try {
      const [installedApps, availableUpdates] = await Promise.all([
        WingetService.getInstalledApps(),
        WingetService.getAvailableUpdates(),
      ]);
      setInstalled(installedApps);
      setUpdates(availableUpdates);
    } catch {
      /* Statistics stay at their last known values. */
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    void loadInfo();
    void loadStats();
  }, [loadInfo, loadStats]);

  const handleCopyDataDir = useCallback(async () => {
    if (!appInfo?.dataDirectory) return;
    try {
      await navigator.clipboard.writeText(appInfo.dataDirectory);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* Clipboard unavailable — the path is still visible on screen. */
    }
  }, [appInfo?.dataDirectory]);

  // --- derived statistics ----------------------------------------------------

  const installedByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const app of installed) map.set(app.source, (map.get(app.source) ?? 0) + 1);
    return map;
  }, [installed]);

  const updatesByProvider = useMemo(() => {
    const map = new Map<string, number>();
    for (const update of updates) map.set(update.source, (map.get(update.source) ?? 0) + 1);
    return map;
  }, [updates]);

  /**
   * One row per registered provider (registry order), followed by any
   * source that reported packages but is not a known provider id.
   */
  const providerStats = useMemo(() => {
    const rows = providers.map((provider) => ({
      id: provider.id as string,
      name: provider.name,
      installed: installedByProvider.get(provider.id) ?? 0,
      updates: updatesByProvider.get(provider.id) ?? 0,
    }));
    const known = new Set(rows.map((row) => row.id));
    const extraSources = new Set<string>([...installedByProvider.keys(), ...updatesByProvider.keys()]);
    for (const source of extraSources) {
      if (known.has(source)) continue;
      rows.push({
        id: source,
        name: providerLabel(source),
        installed: installedByProvider.get(source) ?? 0,
        updates: updatesByProvider.get(source) ?? 0,
      });
    }
    return rows;
  }, [providers, installedByProvider, updatesByProvider]);

  const totalInstalled = installed.length;
  const totalUpdates = updates.length;

  /** Providers currently usable on this machine (PCC v2.2 health card). */
  const readyCount = useMemo(
    () => providerHealth.filter((health) => health.status === 'ready').length,
    [providerHealth]
  );

  return (
    <div className="space-y-6">
      {/* ---------------- Identity / hero ---------------------------------- */}
      <Card className="overflow-hidden">
        <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center">
          <div
            className="flex h-14 w-14 shrink-0 select-none items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[hsl(246_85%_45%)] shadow-md"
            aria-hidden="true"
          >
            <span className="text-sm font-extrabold tracking-wider text-white">PCC</span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-xl font-bold">{appInfo?.name ?? '—'}</h3>
              {appInfo && <Badge variant="secondary">v{appInfo.version}</Badge>}
              {appInfo && !appInfo.packaged && (
                <Badge variant="outline" className="text-xs">
                  Development build
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Software lifecycle management platform for Windows
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                <Monitor className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {appInfo?.platform ?? '—'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                <Cpu className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {appInfo?.architecture ?? '—'}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                <Palette className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                {theme === 'light' ? 'Light' : 'Dark'} theme
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Section 1: Application Information --------------- */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <AppWindow className="h-5 w-5" aria-hidden="true" />
            Application Information
          </CardTitle>
          <CardDescription>Live application identity and build details</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile icon={Package} label="Application Name" value={appInfo?.name ?? '—'} />
          <InfoTile
            icon={AppWindow}
            label="Version"
            value={isLoadingInfo ? 'Loading…' : appInfo ? `v${appInfo.version}` : '—'}
          />
          <InfoTile
            icon={Calendar}
            label="Build Date"
            value={isLoadingInfo ? 'Loading…' : formatDateTime(appInfo?.buildDate)}
          />
          <InfoTile icon={Cpu} label="Architecture" value={appInfo?.architecture ?? '—'} />
          <InfoTile icon={Monitor} label="Platform" value={appInfo?.platform ?? '—'} />
        </CardContent>
      </Card>

      {/* ---------------- Section 2: Provider Health ----------------------- */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Server className="h-5 w-5" aria-hidden="true" />
            Provider Health
          </CardTitle>
          <CardDescription>Status and installed version of every package provider</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-3xl font-bold tabular-nums">
              {isLoadingInfo ? '—' : providerHealth.length}
            </span>
            <span className="text-sm text-muted-foreground">providers registered</span>
            {!isLoadingInfo && readyCount > 0 && (
              <Badge variant="outline" className="text-xs">
                {readyCount} ready
              </Badge>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {providerHealth.length === 0 && !isLoadingInfo && (
              <p className="text-sm text-muted-foreground">No providers reported.</p>
            )}
            {providerHealth.map((health) => (
              <ProviderHealthCard key={health.id} health={health} />
            ))}
          </div>

          {/* Detail rows (elevation requirements + enablement per provider). */}
          {providers.length > 0 && (
            <div className="space-y-2 border-t pt-4">
              {providers.map((provider) => (
                <div
                  key={provider.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Package className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate text-sm font-medium">{provider.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {provider.requiresElevation && provider.available && provider.enabled && (
                      <Badge variant="secondary" className="text-xs">
                        Needs admin
                      </Badge>
                    )}
                    <ProviderStatus provider={provider} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------------- Section 3: Package Statistics -------------------- */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Layers className="h-5 w-5" aria-hidden="true" />
              Package Statistics
            </CardTitle>
            <CardDescription>Live counts across every active provider</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadStats()}
            disabled={isLoadingStats}
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', isLoadingStats && 'animate-spin')} />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatTile
              icon={Package}
              label="Installed Packages"
              value={totalInstalled}
              hint="Total packages tracked by PCC"
              isLoading={isLoadingStats}
            />
            <StatTile
              icon={RefreshCw}
              label="Updates Available"
              value={totalUpdates}
              hint="Pending upgrades across providers"
              isLoading={isLoadingStats}
            />
            <StatTile
              icon={Server}
              label="Providers"
              value={providers.length}
              hint="Registered package providers"
              isLoading={isLoadingInfo}
            />
          </div>

          <div className="rounded-lg border">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span>By Provider</span>
              <span className="w-20 text-right">Installed</span>
              <span className="w-20 text-right">Updates</span>
            </div>
            {providerStats.length === 0 && (
              <p className="px-4 py-3 text-sm text-muted-foreground">No provider data available.</p>
            )}
            {providerStats.map((row) => (
              <div
                key={row.id}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b px-4 py-2 text-sm last:border-b-0"
              >
                <span className="truncate font-medium">{row.name}</span>
                <span className="w-20 text-right tabular-nums">
                  {isLoadingStats ? '—' : row.installed}
                </span>
                <span
                  className={cn(
                    'w-20 text-right tabular-nums',
                    row.updates > 0 && 'font-semibold text-emerald-600'
                  )}
                >
                  {isLoadingStats ? '—' : row.updates}
                </span>
              </div>
            ))}
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-4 bg-muted/40 px-4 py-2 text-sm font-semibold">
              <span>Total Installed</span>
              <span className="w-20 text-right tabular-nums">
                {isLoadingStats ? '—' : totalInstalled}
              </span>
              <span className="w-20 text-right tabular-nums">
                {isLoadingStats ? '—' : totalUpdates}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Section 4: Features ------------------------------ */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Features
          </CardTitle>
          <CardDescription>Capabilities included in Package Control Center</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {FEATURES.map(({ label, icon: Icon }) => (
              <span
                key={label}
                className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-sm font-medium"
              >
                <CheckCircle2
                  className="h-3.5 w-3.5 shrink-0 text-emerald-600"
                  aria-hidden="true"
                />
                <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                {label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Section 5: Description --------------------------- */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            About
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {DESCRIPTION_PARAGRAPHS.map((paragraph) => (
            <p key={paragraph} className="text-sm leading-relaxed text-muted-foreground">
              {paragraph}
            </p>
          ))}
        </CardContent>
      </Card>

      {/* ---------------- Section 6: System Information -------------------- */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Terminal className="h-5 w-5" aria-hidden="true" />
            System Information
          </CardTitle>
          <CardDescription>Runtime versions and local storage paths</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <InfoTile
            icon={Server}
            label="Electron Version"
            value={isLoadingInfo ? 'Loading…' : appInfo?.electronVersion ?? '—'}
            mono
          />
          <InfoTile
            icon={Terminal}
            label="Node Version"
            value={isLoadingInfo ? 'Loading…' : appInfo?.nodeVersion ?? '—'}
            mono
          />
          <InfoTile
            icon={Globe}
            label="Chrome Version"
            value={isLoadingInfo ? 'Loading…' : appInfo?.chromeVersion ?? '—'}
            mono
          />

          <div className="rounded-lg border bg-muted/30 p-3 lg:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <HardDrive className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                PCC Data Directory
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => void handleCopyDataDir()}
                disabled={!appInfo?.dataDirectory}
              >
                {copied ? (
                  <Check className="mr-1 h-3 w-3" aria-hidden="true" />
                ) : (
                  <Copy className="mr-1 h-3 w-3" aria-hidden="true" />
                )}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p
              className="mt-1 break-all font-mono text-[13px] font-semibold"
              title={appInfo?.dataDirectory}
            >
              {isLoadingInfo ? 'Loading…' : appInfo?.dataDirectory ?? '—'}
            </p>
          </div>

          <InfoTile icon={Palette} label="Theme" value={theme === 'light' ? 'Light' : 'Dark'} />
        </CardContent>
      </Card>

      {/* ---------------- Section 7: Links --------------------------------- */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ExternalLink className="h-5 w-5" aria-hidden="true" />
            Links
          </CardTitle>
          <CardDescription>Project resources and documentation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {LINKS.map(({ label, href, icon: Icon }) => (
              <Button key={label} variant="outline" size="sm" asChild>
                <a href={href} target="_blank" rel="noopener noreferrer">
                  <Icon className="mr-2 h-4 w-4" aria-hidden="true" />
                  {label}
                </a>
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ---------------- Section 8: Copyright ----------------------------- */}
      <p className="pb-2 text-center text-xs text-muted-foreground">{COPYRIGHT}</p>
    </div>
  );
}





