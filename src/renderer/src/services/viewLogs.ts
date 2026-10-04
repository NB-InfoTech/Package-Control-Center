/**
 * "View Logs" navigation (PCC v2.0.1, Priority 5).
 *
 * LogPanel lives in <Layout /> and is a fixed bottom overlay, so any
 * component (QueuePanel, Dashboard, active-operation cards) can request
 * "show me the logs" by dispatching this event. Layout listens for it,
 * expands the collapsed LogPanel and focuses the latest entry.
 */
export const VIEW_LOGS_EVENT = 'pcc:view-logs';

/** Ask the Layout to open the LogPanel and focus the newest log entry. */
export function requestViewLogs(): void {
  window.dispatchEvent(new CustomEvent(VIEW_LOGS_EVENT));
}
