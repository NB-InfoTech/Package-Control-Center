# Package Control Center — v2.2 Roadmap

**Status:** Draft
**Scope:** Local-only, offline, single-machine software lifecycle management.

This roadmap builds on the existing architecture (provider registry, update
queue, snapshots, drift detection) and adds **observability**: what happened to
my packages, how healthy is my machine, and why did an update fail.

---

## Foundation shipped in v2.2

| Deliverable | Description |
|---|---|
| `DataPathService` | Single source of truth for all persisted data (`~/.package-control-center`). Legacy folder migration is automatic and one-time. |
| `ProviderHealthService` | Per-provider status + installed version (`winget --version`, `choco --version`). |
| About page provider cards | Provider / Status / Version rendered as cards. |
| `InstallService` | Auto-installs the package manager behind a provider when it is enabled in Settings (official Chocolatey bootstrap), with typed outcomes (`success` / `failed` / `needs-elevation` / `already-available` / `not-requested`) surfaced in the UI, plus a startup sweep that retries missing installers. |

---

## 1. Update History

A durable, queryable record of every package state change.

**Tracked event types**

| Event | Meaning |
|---|---|
| `Installed` | Package newly installed through PCC. |
| `Upgraded` | Existing package moved to a newer version. |
| `Failed` | Attempt did not complete successfully. |
| `Ignored` | Package added to the ignore list. |
| `Pinned` | Package added to the pin list. |

**Record shape (proposed)**

```ts
interface UpdateHistoryEntry {
  id: string;
  timestamp: string;        // ISO 8601
  packageId: string;
  packageName: string;
  provider: ProviderId;    // winget | chocolatey | msstore
  event: 'installed' | 'upgraded' | 'failed' | 'ignored' | 'pinned';
  fromVersion?: string;
  toVersion?: string;
  error?: string;
  exitCode?: number;
}
```

**Notes**

- Persisted under the data root (`history.json`), rotated by size.
- `Failed` entries are the input for §6 — store `error` + `exitCode` + `retryCount`.
- The queue already captures most of this in memory; v2.2 makes it durable.

---

## 2. Update Analytics

Aggregate counters derived from Update History.

- **Success rate** — `successful / total attempted`, per provider and overall.
- **Failure rate** — `failed / total attempted`, per provider and overall.
- **Last update** — timestamp of the most recent completed operation.

Suggested surface: the Dashboard, per-provider breakdown with a rolling window
(7 / 30 / all time).

---

## 3. Package Age

How far behind a package is, in **days**, relative to the latest available
version.

- Derived from the "days since last successful upgrade" of a package that
  still has an update pending.
- Highlights long-neglected packages (e.g. 90+ days behind) as a maintenance
  signal.
- Depends on: Update History (§1) + Available Updates scan.

---

## 4. System Health Score

A single 0–100 score summarising machine state.

```
94/100
```

**Proposed weighting**

| Component | Weight |
|---|---|
| Provider health (all providers ready) | 30 |
| Pending updates cleared | 30 |
| Snapshot recency | 15 |
| Backup recency | 15 |
| Failed operations (penalty) | 10 |

**Rules**

- Read-only and explainable — every deduction names its cause.
- Never blocks functionality; advisory only.
- Complements (does not replace) the existing Health dashboard.

---

## 5. Provider Health Dashboard

Extends the About page provider cards into a first-class dashboard.

- Per-provider **status** and **version**, live.
- Status states: `Ready` / `Unavailable` / `Disabled` / `Error`.
- Surface provider-specific remediation hints (e.g. Chocolatey requires an
  elevated process; Store requires `winget source enable msstore`).

**Foundation already in place:** `ProviderHealthService.getProviderHealth()`
returns `{ id, name, status, version }`; §5 adds history, trend and alerting.

---

## 6. Failed Update Investigation

For every failed operation, capture enough detail to diagnose it later.

| Field | Purpose |
|---|---|
| `error` | Translated, user-facing error message. |
| `errorDetail` | Raw provider output (unmodified). |
| `exitCode` | Process exit code from the provider CLI. |
| `retryCount` | Number of explicit user retries performed. |

**Surface:** a "Failed Updates" view with filters (provider, package), plus
"Retry" that reuses the existing queue retry path.

---

## 7. Software Timeline

A chronological, human-readable history of the machine's software lifecycle.

- Merges Update History, snapshots, backups and restores into one timeline.
- Answers: *when did this app get installed? when was it last updated? what
  changed between snapshots?*
- Reuses existing `SystemSnapshot` data rather than introducing a new store.

---

## Out of scope for v2.2

Explicitly **not** planned:

- Cloud sync
- Telemetry
- User accounts / sign-in
- Internet services / hosted backends

PCC remains a fully local, offline, single-machine tool.

---

## Risks and open questions

1. **History growth** — needs retention/size limits from day one.
2. **Score credibility** — a health score users don't trust is worse than none;
   every deduction must be explainable.
3. **Version comparability** — Store has no standalone version; the "Provider
   Available" convention must be respected consistently.
4. **Elevation** — Chocolatey failures frequently stem from a non-elevated
   process; §6 must surface that cause distinctly.

---

## Deliverables checklist

- [x] Unified data root (`DataPathService`) + automatic legacy migration
- [x] Provider health + version detection (`ProviderHealthService`)
- [x] About page provider health cards
- [ ] Update History store + Timeline view
- [ ] Analytics counters (success/failure rate, last update)
- [ ] Package age computation
- [ ] System Health Score
- [ ] Failed Update Investigation view