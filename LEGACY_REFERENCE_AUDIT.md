# Legacy Reference Audit

**Scope:** PCC v2.2 final cleanup — `lastRestore` statistic, legacy folder
references, legacy product naming.

Searched for: `Winget Control Center`, `.winget-control-center`,
`Winget Control Center Reports`, `Winget Control Center Backups`.

---

## Investigation: the `lastRestore` statistic

`ipc/index.ts` previously called:

```ts
latestFileMtime(join(homedir(), 'Documents', 'Winget Control Center Reports'))
```

| Question | Finding |
|---|---|
| Intended folder | Where restore reports are written — `WingetProvider.generateRestoreReport()` |
| Actual folder used by PCC | `~/Documents/Winget Control Center Reports` |
| Effect on `lastRestore` | **None — the statistic was already correct.** Writer and reader referenced the same folder. |

**Conclusion:** this was not a functional bug. The defect was purely that the
folder carried retired pre-rebrand product naming (scope item 3).

> Correction to the earlier Backup Path Unification note, which flagged this
> line as "almost certainly wrong". That speculation was incorrect — both sides
> used the same folder. No user-visible statistic was ever wrong because of it.

---

## Fixes applied

| # | File | Change |
|---|---|---|
| 1 | `paths/ReportPathService.ts` | **New.** Single source of truth for `~/Documents/Package Control Center Reports`, with one-time legacy migration (`migration-complete.flag`, never overwrites, never deletes). |
| 2 | `providers/WingetProvider.ts` | `generateRestoreReport()` now writes via `reportPathService` instead of a hard-coded legacy folder. |
| 3 | `ipc/index.ts` | `lastRestore` now calls `reportPathService.getLastRestoreTimestamp()`. The generic `latestFileMtime('…Reports')` string is gone from operational code. |
| 4 | `config/ConfigService.ts` | Default `reports.location` no longer points at the legacy folder. |
| 5 | `providers/WingetProvider.ts` | `captureUpdateAudit()` used a hard-coded `~/.package-control-center/logs`; now `dataPathService.ensureDir('logs')` (correct name, but bypassed the single source of truth). |
| 6 | `resources/license.txt` | `Copyright (c) 2024 Winget Control Center` → `Copyright (c) 2024-2026 Package Control Center`. |
| 7 | `config/ConfigService.ts`, `ipc/index.ts`, `providers/WingetProvider.ts` | Removed imports left unused by the above (`homedir`, `mkdirSync`, `existsSync`). |

`ReportPathService.getLastRestoreTimestamp()` migrates before reading, so
existing users keep their restore-report history after the rename. Verified:
fresh install → `null`; legacy report present → migrated and returned; second
process → idempotent, no re-copy.

---

## Remaining references

### REQUIRED FOR MIGRATION

| Location | String | Reason retained |
|---|---|---|
| `paths/DataPathService.ts:36` | `'.winget-control-center'` | `LEGACY_DATA_ROOT_DIR_NAME` — source folder for the data-root migration. Removing it would strand existing users' settings, collections, snapshots, backups and queue state. |
| `paths/BackupPathService.ts:36` | `'Winget Control Center Backups'` | `LEGACY_BACKUP_DIR_NAME` — source folder for the backup migration. Removing it would strand users' inventory backups. |
| `paths/ReportPathService.ts:35` | `'Winget Control Center Reports'` | `LEGACY_REPORTS_DIR_NAME` — source folder for the report migration. Removing it would reset the `lastRestore` statistic to `null` for existing users. |

These three constants are the **only** place a legacy folder name is declared.
No operational logic resolves a legacy path; each is read exactly once, during a
guarded, one-time migration.

### DOCUMENTATION ONLY

| Location | Reason retained |
|---|---|
| `paths/DataPathService.ts:18,25` | Header comment explaining what the legacy folder was. |
| `paths/BackupPathService.ts:18` | Header comment explaining the writer/reader mismatch that caused the bug. |
| `paths/ReportPathService.ts:18` | Header comment explaining the pre-rebrand naming. |
| `CHANGELOG.md`, `RELEASE_ARTIFACT_REPORT.md`, `RELEASE_TEST_CHECKLIST.md`, `MULTI_PROVIDER_*.md`, `*_REPORT.md` | Historical records of shipped releases. Rewriting history would make the changelog inaccurate. |
| `window-proof-phase2.log`, `window-proof-phase3.log` | Captured diagnostic output containing the repository's own directory name. |

None of these affect runtime behaviour.

---

## Out of scope (noted, not changed)

- The project directory itself is named `Winget Control Center` — renaming it
  would break every path in the existing build/release output and is unrelated
  to application behaviour.
- `WingetProvider` / `winget` **product** references are correct: the package
  manager is genuinely named WinGet. Only PCC's own legacy naming was in scope.

---

## Result

**No operational code depends on old PCC names except migration compatibility.**

`npm run typecheck` ✅  `npm run build` ✅