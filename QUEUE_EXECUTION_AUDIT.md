# QUEUE_EXECUTION_AUDIT — PCC v2.0.1

**Date:** 2026-10-03
**Scope:** Root-cause audit of the "Ollama update started multiple times" incident
(timestamps observed in the log: 11:06:53, 11:07:33, 11:08:00, 11:09:38, 11:10:07)
and the enforcement of the rule:

> **One package = one queue item = one update attempt** (unless the user explicitly retries)

---

## 1. What the incident log shows

| Time   | Observed                     |
| ------ | ---------------------------- |
| 11:06:53 | Ollama upgrade started      |
| 11:07:33 | Ollama upgrade started again |
| 11:08:00 | Ollama upgrade started again |
| 11:09:38 | Ollama upgrade started again |
| 11:10:07 | Ollama upgrade started again |

Five separate `winget upgrade` executions for the **same package within ~3.5 minutes**,
i.e. multiple racing winget processes for one update.

## 2. Root-cause audit (pre-fix code)

| # | Defect | Evidence / Mechanism |
|---|--------|----------------------|
| 1 | **No duplicate-start guard** | `WingetProvider.upgradePackage()` spawned `winget upgrade --id <pkg>` unconditionally. Nothing checked whether a `pending`/`running` queue item for the same package already existed. Every click/trigger started a second winget process. |
| 2 | **Duplicate queue items** | `updateQueueService.addOperation()` was called on every attempt with no de-duplication — one package could produce N queue items, each with its own winget child process. |
| 3 | **Stale queue state** | No persistence of the queue. After a crash/close the in-memory "running" flag vanished, so the next attempt looked clean while the previous `winget.exe` was still alive → two writers to the same install files → 0x80070020. |
| 4 | **No retry policy** | Re-runs happened through whatever path the UI took (button re-clicks, event re-fires); there was no `retryCount` and no distinction between "user retry" and "accidental re-trigger". |
| 5 | **Race window in the UI** | The Available Updates page tracked `updatingIds` locally, but that state was reset on navigation/re-render, so the same package could be re-requested while a previous attempt was still in flight. |

The recurring ~30–90 s spacing is consistent with re-clicking **Update** while the
previous attempt was still running: each attempt started a *new* queue item instead
of being rejected as a duplicate.

## 3. Fix implemented (v2.0.1)

### 3.1 Duplicate-start guard (provider level)

`WingetProvider.upgradePackage(id, name, { retryCount })` now begins with:

```ts
const activeSamePackage = updateQueueService.findActiveOperation('upgrade', id);
const activeUpgradeAll  = updateQueueService.findActiveOperation('upgrade-all');
if (activeSamePackage || activeUpgradeAll) {
  updateQueueService.addLog(busy.id, { level: 'warn', message: `Duplicate upgrade request ignored (${id})` });
  return { success: false, output: '', error: msg, duplicate: true };
}
```

`findActiveOperation('upgrade', packageId)` matches any `pending` **or** `running`
item for that exact package; `findActiveOperation('upgrade-all')` protects
individual updates while a bulk upgrade is in flight.
`WingetProvider.upgradeAll()` has the same guard for bulk operations.

Effect: **a second `winget upgrade` for a package that already has an active
queue item is never spawned.** The call returns `{ duplicate: true }` and the UI
shows "Update already in progress" instead of starting another process.

### 3.2 One queue item per attempt, one attempt per queue item

- `addOperation()` is called exactly **once** per `upgradePackage()` invocation,
  immediately after the guard passes.
- The guard makes `addOperation()` for the same package unreachable while the
  first item is `pending`/`running`.

### 3.3 Retry policy (explicit, counted, user-driven only)

| Rule | Implementation |
|------|----------------|
| `retryCount` starts at `0` | `addOperation(..., { retryCount: 0 })` default |
| Only a user action creates a new attempt | The **Retry** button on a failed `QueueItemCard` → `queueService.retry(id)` → IPC `queue:retry` → main process checks `status === 'failed' && operationType === 'upgrade'`, then calls `upgradePackage(id, name, { retryCount: item.retryCount + 1 })` |
| No automatic retries | No timer, backoff or event re-invokes `upgradePackage` without user input. The only non-click path is `process:terminate` "Stop & Retry" — itself an explicit user confirmation of "Stop Process & Retry" in the 0x80070020 dialog |
| Retries are visible | The queue item shows an **Attempt N** chip (`retryCount + 1`); log entries record `retryCount` on `addOperation` |

### 3.4 Stale state protection (persistence)

- `persistState()` writes `~/.package-control-center/queue-state.json` on
  `before-quit` (clean **and** forced exit).
- `restoreState()` runs at startup: restored items that were `running`/`pending`
  are demoted to `failed` ("Interrupted by application exit") — they are never
  auto-restarted, so no zombie winget process is ever paired with a "running"
  item after a crash/close.
- `markActiveAsInterrupted(reason)` force-fails all active items when the user
  force-stops updates on exit.

### 3.5 Stale-process protection (force-stop path)

"Force Stop Updates & Exit" (close dialog) runs
`ProcessGuard.killWingetProcesses()` (`taskkill /F /IM winget.exe`) with a
native "Terminate Winget processes?" confirmation before exiting, so no orphan
winget survives to collide with the next session.

## 4. Resulting invariants

1. **One package → one active queue item** (guard in `upgradePackage`/`upgradeAll`).
2. **One queue item → one winget process** (spawned exactly once, in `executeStreaming`).
3. **Zero automatic retries** (retries only via user Retry button or explicit
   "Stop Process & Retry", both of which increment `retryCount`).
4. **No cross-session zombies** (persist on exit, demote-on-restore, kill
   winget on force-stop).

## 5. Verification checklist

- [ ] Click Update on a package, then click it again immediately → second call
      returns `duplicate: true`, toast "Update already in progress", no second
      `winget.exe` process (check Task Manager).
- [ ] Fail an update (e.g. app in use), press **Retry** → new attempt shows
      "Attempt 2" chip and log entry `retryCount: 1`.
- [ ] Close PCC mid-update → restart → item shows `failed / Interrupted by
      application exit`, no winget running.
- [ ] Close PCC mid-update via **Force Stop** → winget.exe terminated, item
      `failed / Stopped by user (force exit)`.