# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 2.1.x | ✅ |
| < 2.1 | ❌ |

Fixes are published to the latest release only. Please upgrade before
reporting an issue against an older version.

---

## Reporting a vulnerability

**Please do not open a public GitHub issue for security problems.**

Use GitHub's private reporting — *Security* → *Report a vulnerability* — on
the [repository](https://github.com/NB-InfoTech/Package-Control-Center/security/advisories/new).

Please include:

- A description of the issue and its impact.
- Steps to reproduce.
- Affected PCC version and Windows version.
- Any proof-of-concept or logs (redact personal paths).

### What to expect

- Acknowledgement within **7 days**.
- An assessment within **14 days**.
- A fix or mitigation plan as soon as practical; we will keep you updated.

Please give us a reasonable opportunity to release a fix before any public
disclosure.

---

## Security posture

PCC is local-first: no accounts, no telemetry, no network services.

**Good.** The app only executes package-manager CLIs already installed on your
machine.

Worth knowing:

- PCC can request **Administrator** elevation — required for Chocolatey. You will
  always see a Windows UAC prompt; PCC never elevates silently.
- **Backups, snapshots and inventory files are plain JSON** in your user
  profile. They list installed package names and versions — treat them as
  mildly sensitive if you share your machine.
- PCC **never deletes your data automatically**, including during the legacy
  data migration.
- Provider output (for example `winget`) is parsed defensively, but PCC does run
  commands from your installed package managers — keep those up to date.