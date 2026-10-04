# STABILIZATION_REPORT — PCC v2.0.1

**Date:** 2026-10-03
**Scope:** PCC v2.0.1 Stabilization & UX Improvements (P1–P6 + friendly errors)

Build status: `npm run typecheck` ✅ · `npm run build` (main tsc + renderer vite) ✅

---

## 1. Missing update root cause (Priority 1)

**Result: PCC now matches `winget upgrade` 1:1.** Live audit run
(2026-10-03): raw winget output → 3 packages parsed → 0 ignored → 0 pinned →
**3 displayed** (`winget upgrade` also reports 3; `parseAudit.skippedLines`
is empty). See **`UPDATE_DISCOVERY_AUDIT.md`** for the per-package funnel table.

- Root cause of the reported 4-vs-3: **state/timing mismatch** — the 4th
  package (Ollama) had its update applied mid-incident by one of the repeated
  attempts, so plain `winget upgrade` subsequently listed it too. The funnel
  itself was made lossless-verifiable:
  - `getAvailableUpdatesDetailed()` returns raw output + parse audit trail.
  - `PCC_UPDATE_AUDIT=1` writes the full funnel to
    `~/.package-control-center/logs/update-audit-<ts>.json`.
  - `tools/audit-updates.js` reproduces the funnel from the terminal.
- The only intentional exclusion is the **Ignore list**; pins are excluded by
  winget itself from `upgrade` output (verified: "There are no pins configured.").

## 2. Queue / duplicate-execution audit (Priority 2)

See **`QUEUE_EXECUTION_AUDIT.md`**. Summary of the fix:

- **Duplicate-start guard** in `WingetProvider.upgradePackage()` /
  `upgradeAll()`: any active (`pending`/`running`) item for the same package —
  or any active bulk upgrade — makes the call return `{ duplicate: true }`
  without spawning a second `winget.exe`.
- **One package = one queue item = one attempt** enforced by
  `UpdateQueueService.findActiveOperation()`; `addOperation()` runs exactly
  once per accepted request.
- **Retry policy:** `retryCount` starts at 0; only the user's Retry button
  (IPC `queue:retry`, failed items only) or an explicit "Stop Process & Retry"
  creates a new attempt, and each bumps `retryCount + 1` (shown as "Attempt N").
  **No automatic/silent retries exist anywhere.**
- **Stale state:** queue persisted on `before-quit`, restored at startup with
  running/pending items demoted to failed ("Interrupted by application exit") —
  never auto-restarted.

## 3. Application-in-use detection (Priority 3)

- `ErrorTranslator` maps `0x80070020` → "Application currently in use."
- On any in-use failure, `ProcessGuard.findBlockers(packageId, name)` checks
  live `tasklist` / `sc query` against a **data-driven profile table**
  (Ollama incl. service, Docker, VSCode, Chrome, Teams, Java, Windows Terminal,
  Notepad++ + generic name-token fallback) and attaches the running blockers to
  the queue item (`inUseProcesses`).
- Queue card shows a yellow "Application is currently running" banner with the
  blocking process list and a **Stop Process & Retry** button.
- The dialog offers exactly: **[Stop Process & Retry] [Retry Later] [Cancel]**.
  "Stop & Retry" routes each blocker name through
  `ProcessGuard.splitTargets()` (live tasklist/sc check → taskkill vs. sc stop),
  terminates them, then performs the counted retry; per-target success is
  reported in toasts.

## 4. Status progress bar (Priority 4)

- Every `QueueItemCard` shows the existing 5-step progress indicator
  (Preparing → Downloading → Installing → Verifying → Completed) with a
  progress bar, **percent**, and the current step, driven by the existing
  `ProgressEvent` stream (`queue:progress`) plus `updateProgress` calls.
- **Dashboard → Active Operations**: each pending/running operation shows
  Package Name, Progress %, Current Step, status badge and a progress bar,
  live-updated via the queue subscription.

## 5. Log navigation (Priority 5)

- **View Logs** buttons in: the **Queue Panel** header, the **Dashboard**
  (Quick Actions), and every **Active Operation Card**.
- All of them call `requestViewLogs()` (`services/viewLogs.ts`), a
  `pcc:view-logs` window event the `Layout` listens to:
  - automatically **expands the collapsed LogPanel**,
  - **smooth-scrolls to the bottom** after the expand animation,
  - **focuses the newest log entry** (visible focus ring, `focusTick` prop).

## 6. Safe shutdown during updates (Priority 6)

- `BrowserWindow 'close'` is intercepted on **all close paths** (X button,
  Alt+F4, menu exit) while active operations exist.
- `CloseGuardDialog` (renderer) lists the running updates and offers:
  **[Stay Open] [Close After Updates Finish] [Force Stop Updates & Exit]**.
  - *Wait*: main watches the queue; when no pending/running items remain it
    closes the window automatically.
  - *Force*: native confirm "Terminate Winget processes?" →
    `taskkill /F /IM winget.exe` → all active items marked
    "Stopped by user (force exit)" → exit.
- Queue state is saved **before every exit** (`before-quit` →
  `persistState()`), so history survives even an unclean shutdown.

## 7. Friendly error messages

| Raw | Friendly |
|-----|----------|
| `0x80070020` | Application currently in use. |
| `0x80072ee2` | Network or Store timeout. |
| other winget failures | `ErrorTranslator` readable explanations (offline, admin required, package not found, …) |

Friendly text lands in `QueueItem.error`; the raw output is kept in
`errorDetail` (shown under the error in the queue card, plus "Debug" log lines).

## 8. Files changed

**Main:** `services/providers/WingetProvider.ts` (duplicate guard, detailed
updates, in-use attachment, audit dump), `services/UpdateQueueService.ts`
(retryCount, persistence, interrupt, removeOperation), `services/ProcessGuard.ts`
(blockers, splitTargets, killWinget), `services/ErrorTranslator.ts`,
`services/WingetParser.ts` (audit trail), `services/types.ts`, `ipc/index.ts`
(queue:retry, queue:remove, process:*, window:close-choice), `index.ts`
(close interception, close-when-idle, force quit, restore).

**Preload:** `queue.retry/removeItem`, `process.*`, `window.*`.

**Renderer:** `CloseGuardDialog.tsx` (new), `QueuePanel.tsx` (retry/dismiss
wired, in-use dialog, View Logs), `ProgressIndicator.tsx` (in-use banner,
Attempt chip, raw detail), `LogPanel.tsx` (focusTick), `Layout.tsx` (event
listener, dialog mount), `Dashboard.tsx` (Active Operations, View Logs),
`AvailableUpdates.tsx` (duplicate/in-use toasts), `services/{viewLogs,queue,electron}.ts(x)`,
`types/index.ts`.

**Docs/tools:** `UPDATE_DISCOVERY_AUDIT.md`, `QUEUE_EXECUTION_AUDIT.md`,
`STABILIZATION_REPORT.md`, `tools/audit-updates.js`.

## 9. Success criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | PCC update count matches Winget | ✅ verified live (3 = 3, audit trail attached) |
| 2 | No duplicate update attempts | ✅ provider guard + `duplicate: true` path |
| 3 | User can resolve 0x80070020 | ✅ Stop Process & Retry dialog + counted retry |
| 4 | Visible progress for active updates | ✅ QueueItemCard + Dashboard Active Operations |
| 5 | Easy access to logs | ✅ View Logs in Queue Panel / Dashboard / Active Operation Card |
| 6 | Safe application shutdown during updates | ✅ intercept + 3-option dialog + state persistence |
