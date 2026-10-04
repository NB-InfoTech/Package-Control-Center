import { useState, useEffect, useRef } from 'react';
import { ChevronUp, ChevronDown, X, Trash2, Copy } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { LogEntry } from '@/types';

interface LogPanelProps {
  logs: LogEntry[];
  isOpen: boolean;
  onToggle: () => void;
  onClear: () => void;
  /**
   * PCC v2.0.1 P5 — "View Logs" request tick. When this number increases,
   * the panel re-enables auto-scroll, smooth-scrolls to the bottom and
   * focuses the newest log entry (used by requestViewLogs()).
   */
  focusTick?: number;
}

export function LogPanel({ logs, isOpen, onToggle, onClear, focusTick = 0 }: LogPanelProps) {
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lastEntryRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && endRef.current) {
      endRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);

  // "View Logs" request: wait for the expand animation (300ms), then jump
  // to the newest entry and move focus onto it.
  useEffect(() => {
    if (focusTick <= 0) return;
    setAutoScroll(true);
    const timer = setTimeout(() => {
      endRef.current?.scrollIntoView({ behavior: 'smooth' });
      lastEntryRef.current?.focus({ preventScroll: true });
    }, 350);
    return () => clearTimeout(timer);
  }, [focusTick]);

  const levelColors = {
    info: 'text-foreground',
    warn: 'text-yellow-400',
    error: 'text-red-400',
    debug: 'text-muted-foreground',
  };

  const levelIcons = {
    info: '○',
    warn: '△',
    error: '✕',
    debug: '◆',
  };

  return (
    <div className={cn(
      'fixed bottom-0 right-0 left-0 z-50 bg-card border-t border-border transition-all duration-300',
      isOpen ? 'h-[300px]' : 'h-10'
    )}>
      <div className="flex h-full flex-col">
        <Button
          variant="ghost"
          size="sm"
          className="h-10 px-3 justify-between w-full border-b"
          onClick={onToggle}
          aria-label={isOpen ? 'Collapse log panel' : 'Expand log panel'}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">LOG</span>
            <span className="px-2 py-0.5 text-xs bg-muted rounded">
              {logs.length} {logs.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              title="Clear logs"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); setAutoScroll(!autoScroll); }}
              title={autoScroll ? 'Disable auto-scroll' : 'Enable auto-scroll'}
            >
              {autoScroll ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => { e.stopPropagation(); copyLogs(logs); }}
              title="Copy logs"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <span className="w-6" />
          </div>
        </Button>

        {isOpen && (
          <ScrollArea className="flex-1 overflow-hidden" ref={scrollAreaRef}>
            <div className="p-3 font-mono text-xs space-y-1">
              {logs.map((log, index) => (
                <div
                  key={log.id}
                  ref={index === logs.length - 1 ? lastEntryRef : undefined}
                  tabIndex={index === logs.length - 1 ? -1 : undefined}
                  className={cn(
                    'flex gap-2 whitespace-pre-wrap break-all rounded focus:outline-none focus:ring-1 focus:ring-primary/60',
                    levelColors[log.level]
                  )}
                >
                  <span className="text-muted-foreground shrink-0">
                    {log.timestamp.toLocaleTimeString()}
                  </span>
                  <span className="shrink-0 px-1">
                    {levelIcons[log.level]}
                  </span>
                  <span>{log.message}</span>
                  {log.operationId && (
                    <span className="text-muted-foreground shrink-0 ml-auto">
                      [{log.operationId.slice(0, 8)}]
                    </span>
                  )}
                </div>
              ))}
              <div ref={endRef} />
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function copyLogs(logs: LogEntry[]): void {
  const text = logs
    .map(log => `[${log.timestamp.toLocaleTimeString()}] ${log.level.toUpperCase()}: ${log.message}`)
    .join('\n');
  navigator.clipboard.writeText(text);
}