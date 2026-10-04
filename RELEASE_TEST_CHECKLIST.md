# Package Control Center v2.0.0 - Release Test Checklist

## Build Information
- **Application**: Package Control Center (PCC)
- **Version**: 2.0.0
- **Build Date**: 2024-09-30
- **Platform**: Windows x64
- **Electron**: 31.7.7

---

## Known Build Limitation
**Windows Installer Generation Requires Admin Privileges**

The electron-builder tool downloads `winCodeSign` (contains macOS binaries with symlinks) which cannot be extracted on Windows without administrator privileges. This is a known limitation of electron-builder on Windows.

**Workaround**: Run the installer generation in an elevated PowerShell session, or use the provided manual installer scripts.

---

## Pre-Release Verification

### ✅ Build Validation
- [x] `npm run build` - Main process compiles successfully
- [x] `npm run build` - Renderer process compiles successfully  
- [x] TypeScript strict mode passes
- [x] All dependencies resolve correctly

### ✅ Resources Verified
- [x] `resources/icon.ico` - Multi-resolution (16, 32, 48, 64, 128, 256)
- [x] `resources/icon.svg` - Source vector icon
- [x] `resources/license.txt` - MIT license
- [x] `resources/installer.nsh` - NSIS installer script

### ✅ Configuration Verified
- [x] `package.json` - name: `package-control-center`, version: `2.0.0`
- [x] `electron-builder.json` - productName, appId, NSIS config
- [x] `installer.nsh` - Updated branding, paths, shortcuts

---

## Manual Installer Generation (Required)

Due to the winCodeSign symlink extraction issue on Windows (requires admin), the installer must be generated in an **elevated PowerShell session**:

```powershell
# Run as Administrator
cd "C:\path\to\Package Control Center"

# Option 1: Generate NSIS installer
npx electron-builder --win --x64

# Option 2: Generate portable version (no admin required for portable)
npx electron-builder --win --x64 --config.win.target=portable
```

**Expected Output**:
- `release/PackageControlCenter-2.0.0-Setup.exe` (NSIS installer)
- `release/Package Control Center-win32-x64/` (portable directory)

---

## Post-Installation Verification

### 📦 Installation
- [ ] Installer launches without errors
- [ ] License agreement displays correctly
- [ ] Installation directory can be changed
- [ ] Desktop shortcut created: "Package Control Center"
- [ ] Start Menu shortcut created: "Package Control Center"
- [ ] Installation completes without errors
- [ ] Uninstaller entry appears in "Add/Remove Programs"

### 🚀 Application Launch
- [ ] Application launches from Start Menu shortcut
- [ ] Application launches from Desktop shortcut
- [ ] Window title shows "Package Control Center"
- [ ] Dark mode theme loads correctly
- [ ] No console errors on startup

### 📋 Core Features

#### Installed Apps Page (`/installed`)
- [ ] Page loads and displays package list
- [ ] Search filters packages in real-time
- [ ] "View Details" drawer opens/closes correctly
- [ ] Package details show: Name, ID, Publisher, Version, Description, Homepage, License, Source
- [ ] "Ignore" button hides package from updates
- [ ] Export JSON / Export CSV / Backup buttons work
- [ ] Refresh button reloads package list

#### Available Updates Page (`/updates`)
- [ ] Page loads and displays available updates
- [ ] Shows: Name, ID, Current Version, Available Version
- [ ] "Update" button per package works
- [ ] "Update All" button works
- [ ] Queue panel shows progress (Preparing → Downloading → Installing → Verifying → Completed)
- [ ] Log panel shows real-time output
- [ ] Toast notifications on success/failure

#### Package Collections (`/collections`)
- [ ] Built-in collections displayed: Essentials, Developer Tools, Media & Entertainment
- [ ] Create new collection dialog works
- [ ] Edit collection dialog works
- [ ] Delete collection works (not for built-in)
- [ ] Export collection to JSON works
- [ ] Import collection from JSON works
- [ ] Install collection queues all packages

#### Machine Migration (`/migration`)
- [ ] Export Inventory: JSON / CSV / Backup buttons work
- [ ] Create Backup creates timestamped file
- [ ] Restore Backup: File selector works
- [ ] Restore Preview shows: Already Installed, Install Available, Missing Package
- [ ] Checkbox selection works (Select All / individual)
- [ ] Source override field works
- [ ] Execute Restore queues packages
- [ ] Restore Report generated with success/failed counts

#### System Snapshots (`/snapshots`)
- [ ] Create Snapshot dialog works
- [ ] Snapshot list displays: Name, Description, Package Count, Date
- [ ] Export Snapshot to JSON works
- [ ] Compare two snapshots shows: Added, Removed, Version Changed, Unchanged
- [ ] Color-coded badges: Green=Added, Red=Removed, Yellow=Version Changed

#### Drift Detection (`/drift`)
- [ ] Source type selector: Snapshot / Backup / Collection
- [ ] Source selector populates correctly
- [ ] Detect Drift runs and shows results
- [ ] Filter by drift type: Added / Removed / Version Changed / Source Changed
- [ ] Summary cards show counts
- [ ] Drift table shows: Package, ID, Type, Current, Expected

#### Settings Page (`/settings`)
- [ ] Dark mode note displayed
- [ ] Theme setting displayed
- [ ] Auto-accept source agreements displayed
- [ ] Default source displayed
- [ ] About section shows: Version 2.0.0, Build Date, Provider Count (1), Installed Providers (WingetProvider)
- [ ] Description text matches specification
- [ ] Copyright: "Copyright © 2024 Package Control Center"
- [ ] Links: Winget Repository, Source Code

#### Dashboard (`/`)
- [ ] Stats cards: Installed Apps, Available Updates, Last Refresh
- [ ] Health cards: Ignored Packages, Pinned Packages, Last Backup, Last Restore, Snapshot Count
- [ ] Quick Actions navigate to correct pages
- [ ] Auto-refresh after queue completion works

### 🔄 Queue & Logging System
- [ ] Queue panel shows pending/running/success/failed items
- [ ] Progress bar shows percentage
- [ ] Step indicator: Preparing → Downloading → Installing → Verifying → Completed
- [ ] Log panel: auto-scroll, filter by level, copy/clear buttons
- [ ] Log entries show timestamp, level icon, message, operation ID
- [ ] Clear completed / Clear all buttons work

### ⚙️ Pinned & Ignored Packages
- [ ] Pinned Packages page (`/pinned`) shows: Name, ID, Pin Type, Pinned Version
- [ ] Unpin button works
- [ ] Ignored Packages page (`/ignored`) shows: Name, ID, Ignored At
- [ ] Unignore button works
- [ ] Ignored packages hidden from Available Updates
- [ ] Ignored packages excluded from dashboard counts

### 📤 Export & Backup
- [ ] Export JSON creates valid JSON with metadata
- [ ] Export CSV creates valid CSV with headers
- [ ] Backup creates timestamped file in `~/Documents/Package Control Center Backups/`
- [ ] Backup file contains: application name, version, exportedAt, packages

### 🔄 Migration Workflow
- [ ] First launch detects `~/.winget-control-center` and migrates to `~/.package-control-center`
- [ ] Migrates: config.json, ignored-packages.json, pinned-packages.json, collections.json, snapshots.json
- [ ] Migrates logs and backups directories
- [ ] Updates config.json paths automatically
- [ ] Original data preserved (non-destructive)

### 🔍 Error Handling
- [ ] Network errors show user-friendly toast messages
- [ ] Invalid JSON imports show validation errors
- [ ] Missing winget shows "WINGET_NOT_FOUND" error
- [ ] Permission errors show "Run as Administrator" guidance
- [ ] Failed operations show in queue with error details

---

## Installer Artifacts

### Target Output
```
release/
├── PackageControlCenter-2.0.0-Setup.exe      # NSIS Installer
└── Package Control Center-win32-x64/         # Portable (optional)
    ├── Package Control Center.exe
    ├── resources/
    └── ...
```

### Installer Properties
- **Name**: PackageControlCenter-2.0.0-Setup.exe
- **Product Name**: Package Control Center
- **Publisher**: Package Control Center
- **Version**: 2.0.0
- **Icon**: Embedded icon.ico
- **License**: MIT (license.txt)
- **Shortcuts**: Desktop + Start Menu
- **Uninstaller**: Creates uninstall entry

---

## Signing (Optional)
- [ ] Code signing certificate configured
- [ ] Timestamp server configured
- [ ] Installer signed and timestamped

---

## Distribution
- [ ] Upload to GitHub Releases
- [ ] Update download page
- [ ] Update documentation
- [ ] Announce release

---

## Sign-off
- [ ] All critical tests pass
- [ ] No blocking issues
- [ ] Release approved

**Tested by**: _______________ **Date**: _______________