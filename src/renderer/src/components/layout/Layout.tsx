import { Outlet } from 'react-router-dom';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { LogPanel } from '@/components/common/LogPanel';
import { QueuePanel } from '@/components/common/QueuePanel';
import { CloseGuardDialog } from '@/components/common/CloseGuardDialog';
import { queueService } from '@/services/queue';
import { WingetService } from '@/services/winget';
import { useToast } from '@/hooks/useToast';
import { VIEW_LOGS_EVENT } from '@/services/viewLogs';
import type { LogEntry } from '@/types';
import { cn } from '@/utils/cn';

const MAX_LOGS = 500;

export function Layout() {
  const { addToast } = useToast();
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  // P5: "View Logs" requests from anywhere in the app increment this tick;
  // LogPanel reacts by expanding, scrolling to the bottom and focusing the
  // newest entry.
  const [logFocusTick, setLogFocusTick] = useState(0);
  const unsubscribeRef = useRef<() => void>();

  useEffect(() => {
    const onViewLogs = () => {
      setIsLogOpen(true);
      setLogFocusTick((tick) => tick + 1);
    };
    window.addEventListener(VIEW_LOGS_EVENT, onViewLogs);
    return () => window.removeEventListener(VIEW_LOGS_EVENT, onViewLogs);
  }, []);

  const handleLog = useCallback((log: LogEntry) => {
    setLogs(prev => {
      const next = [...prev, log];
      if (next.length > MAX_LOGS) {
        return next.slice(-MAX_LOGS);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    unsubscribeRef.current = queueService.subscribeLogs(handleLog);
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, [handleLog]);

  const handleClearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  // PCC v2.2: show the one-time startup notice (e.g. "Legacy PCC data
  // successfully migrated."). The main process clears it after the first
  // pull, so this toast can appear exactly once per migration.
  useEffect(() => {
    let cancelled = false;
    WingetService.getStartupNotice()
      .then((notice) => {
        if (cancelled || !notice) return;
        addToast({ title: notice, variant: 'success' });
      })
      .catch(() => {
        /* No notice available — nothing to show. */
      });
    return () => {
      cancelled = true;
    };
  }, [addToast]);

  return (
    <div className="min-h-screen bg-background">
      <Sidebar isCollapsed={isSidebarCollapsed} onToggle={() => setIsSidebarCollapsed(!isSidebarCollapsed)} />
      <div className={cn('transition-all duration-300', isSidebarCollapsed ? 'ml-16' : 'ml-64')}>
        <Header />
        <main className={cn('p-6 transition-all duration-300', `pb-${isLogOpen ? 300 : isQueueOpen ? 400 : 0}`)}>
          <Outlet />
        </main>
        <LogPanel
          logs={logs}
          isOpen={isLogOpen}
          onToggle={() => setIsLogOpen(!isLogOpen)}
          onClear={handleClearLogs}
          focusTick={logFocusTick}
        />
        <QueuePanel
          isOpen={isQueueOpen}
          onToggle={() => setIsQueueOpen(!isQueueOpen)}
        />
        <CloseGuardDialog />
      </div>
    </div>
  );
}