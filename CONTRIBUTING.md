# Contributing to Package Control Center

Thanks for your interest in PCC. Bug reports, ideas and pull requests are all
welcome.

---

## Quick start

```bash
git clone https://github.com/NB-InfoTech/Package-Control-Center.git
cd Package-Control-Center
npm install
npm run dev
```

Before opening a pull request:

```bash
npm run typecheck    # must pass
npm run build        # must pass
```

---

## Reporting a bug

A good bug report saves a lot of time. Please include:

1. **PCC version** (Help → About, or Settings → About).
2. **Windows version** (e.g. Windows 11 23H2).
3. **Provider and version** — Settings → About shows Winget / Chocolatey /
   Microsoft Store status and versions.
4. **What you did**, **what you expected**, and **what happened instead**.
5. **Steps to reproduce**, as a numbered list.
6. **Relevant log output** — `~/.package-control-center/logs/application.log`.

> Please redact your username and any personal paths before pasting logs.

### Provider-specific tips

- **Chocolatey failures** — most require PCC to run as Administrator. Check the
  "Needs admin" badge on the provider in Settings first.
- **Microsoft Store** — the source must be enabled:
  `winget source enable msstore`.
- **Winget** — run `winget --version` and confirm it works in a normal terminal.

---

## Development guidelines

### Architecture

- **The renderer must never touch the filesystem.** All disk access happens in
  the main process and is exposed through typed IPC handlers in
  `src/main/ipc/index.ts`, bridged in `src/preload/index.ts`.
- **All persisted paths go through a path service** in `src/main/services/paths/`
  (`DataPathService`, `BackupPathService`, `ReportPathService`). Never build a
  path with `homedir()` in another module.
- **Provider-specific parsing stays inside its provider.** UI code and the queue
  engine depend only on the shared `IPackageProvider` interface.
- New IPC channels need: a main handler, a preload bridge, a type in
  `services/electron.tsx`, and a wrapper in `services/winget.ts`.

### TypeScript

- `strict` is on. Do not weaken it or add `any` — use a precise type or `unknown`.
- Keep the existing import style and `.js` extensions on relative imports.
- Match the surrounding code style; run `npm run lint` before submitting.

### General

- Keep pull requests focused on one concern.
- Update `CHANGELOG.md` under `[Unreleased]` when behaviour changes.
- Add or update documentation in the same PR as the change it describes.

---

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add provider health dashboard
fix: keep existing files during backup migration
docs: clarify legacy data locations
refactor: route paths through BackupPathService
```

---

## Code of Conduct

Participation is governed by the [Code of Conduct](CODE_OF_CONDUCT.md).

---

## License

By contributing, you agree that your contributions are licensed under the
[MIT License](LICENSE).