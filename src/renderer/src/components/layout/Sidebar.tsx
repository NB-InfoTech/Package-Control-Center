import { NavLink, useLocation } from 'react-router-dom';
import { Home, Package, ArrowUpCircle, Settings, ChevronLeft, Pin, Shield, Database, Box, HardDrive, GitCompare } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';

interface SidebarProps {
  isCollapsed: boolean;
  onToggle: () => void;
}

const navigation = [
  { path: '/', label: 'Dashboard', icon: Home },
  { path: '/installed', label: 'Installed Apps', icon: Package },
  { path: '/updates', label: 'Available Updates', icon: ArrowUpCircle },
  { path: '/pinned', label: 'Pinned Packages', icon: Pin },
  { path: '/ignored', label: 'Ignored Packages', icon: Shield },
  { path: '/migration', label: 'Machine Migration', icon: Database },
  { path: '/collections', label: 'Package Collections', icon: Box },
  { path: '/snapshots', label: 'System Snapshots', icon: HardDrive },
  { path: '/drift', label: 'Drift Detection', icon: GitCompare },
  { path: '/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar({ isCollapsed, onToggle }: SidebarProps) {
  const location = useLocation();

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 z-40 h-screen border-r bg-sidebar transition-all duration-300',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      <div className="flex h-full flex-col">
        {/* PCC branding header: badge + title when expanded, badge only when
            collapsed (the bottom button still toggles in both states). */}
        <div
          className={cn(
            'titlebar-drag flex h-16 items-center border-b',
            isCollapsed ? 'justify-center px-2' : 'gap-3 px-4'
          )}
        >
          <div
            className="flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-lg bg-gradient-to-br from-primary to-[hsl(246_85%_45%)] shadow-md"
            aria-hidden="true"
          >
            <span className="text-[11px] font-extrabold tracking-wider text-white">PCC</span>
          </div>

          {!isCollapsed && (
            <>
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold">Package Control Center</div>
                <div className="text-[11px] font-medium tracking-wide text-muted-foreground">
                  PCC
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="titlebar-no-drag ml-auto h-8 w-8"
                onClick={onToggle}
                aria-label="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4 transition-transform" />
              </Button>
            </>
          )}
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Main navigation">
          {navigation.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  isCollapsed && 'justify-center'
                )
              }
              title={isCollapsed ? label : undefined}
              aria-label={label}
            >
              <Icon className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
              {!isCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="border-t p-3">
          <Button
            variant="ghost"
            className={cn('w-full justify-start', isCollapsed && 'justify-center')}
            onClick={onToggle}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={cn('h-4 w-4 transition-transform', isCollapsed && 'rotate-180')} />
            {!isCollapsed && <span className="ml-2">Collapse</span>}
          </Button>
        </div>
      </div>
    </aside>
  );
}