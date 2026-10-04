import { Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Dashboard } from '@/pages/Dashboard';
import { InstalledApps } from '@/pages/InstalledApps';
import { AvailableUpdates } from '@/pages/AvailableUpdates';
import { PinnedPackages } from '@/pages/PinnedPackages';
import { IgnoredPackages } from '@/pages/IgnoredPackages';
import { MachineMigration } from '@/pages/MachineMigration';
import { Collections } from '@/pages/Collections';
import { Snapshots } from '@/pages/Snapshots';
import { DriftDetection } from '@/pages/DriftDetection';
import { Settings } from '@/pages/Settings';

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="installed" element={<InstalledApps />} />
        <Route path="updates" element={<AvailableUpdates />} />
        <Route path="pinned" element={<PinnedPackages />} />
        <Route path="ignored" element={<IgnoredPackages />} />
        <Route path="migration" element={<MachineMigration />} />
        <Route path="collections" element={<Collections />} />
        <Route path="snapshots" element={<Snapshots />} />
        <Route path="drift" element={<DriftDetection />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  // ToastProvider is provided in main.tsx (it must also cover <Toaster />).
  return <AppRoutes />;
}