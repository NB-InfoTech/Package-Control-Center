import { useLocation } from 'react-router-dom';
import { cn } from '@/utils/cn';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/installed': 'Installed Apps',
  '/updates': 'Available Updates',
  '/pinned': 'Pinned Packages',
  '/ignored': 'Ignored Packages',
  '/migration': 'Machine Migration',
  '/collections': 'Package Collections',
  '/snapshots': 'System Snapshots',
  '/drift': 'Drift Detection',
  '/settings': 'Settings',
};

export function Header() {
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Package Control Center';

  return (
    <header className={cn('titlebar-drag h-16 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 sticky top-0 z-30')}>
      <div className="flex h-full items-center px-6">
        <h1 className="text-xl font-semibold">{title}</h1>
      </div>
    </header>
  );
}