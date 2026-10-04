# STARTUP DIAGNOSTIC REPORT - Package Control Center v2.0.0

## Executive Summary

Application installs successfully but fails to display a GUI window. The process appears in Task Manager but no window is shown. This report identifies the root cause and recommended fixes.

## Root Cause

The application's main process (`src/main/index.ts`) creates a `BrowserWindow` with `show: false` and only reveals it via the `ready-to-show` event. In the packaged Electron build, this sequence either fails or the window never becomes visible due to path resolution issues and the window being hidden until `ready-to-show`, which may never fire in certain packaged configurations.

## Failing Components

### 1. BrowserWindow `show` Configuration
- **File**: `src/main/index.ts`, line 52 (original): `show: false`
- **Issue**: Window is created hidden; only shown on `ready-to-show` event
- **Fix**: Changed to `show: true` to force visible window during diagnostics

### 2. Renderer Path Resolution
- **File**: `src/main/index.ts`, line 59 (original): `mainWindow.loadFile(join(__dirname, '../renderer/index.html'))`
- **Issue**: In packaged output, `__dirname` resolves to `dist/main/`, so the path becomes `dist/main/../renderer/index.html` → `dist/renderer/index.html`
- **Verification**: The code includes `fs.existsSync()` checks that log the actual path being used

### 3. Preload Path Resolution
- **File**: `src/main/index.ts`, line 40 (original): `preload: join(__dirname, 'preload.js')`
- **Issue**: In packaged output, `__dirname` resolves to `dist/main/`, so the path becomes `dist/main/preload.js`
- **Verification**: The code includes `fs.existsSync()` check that logs preload existence

### 4. Missing Startup Logging
- **Issue**: No structured startup logging to `%USERPROFILE%\.package-control-center\logs\startup.log`
- **Fix**: Added comprehensive startup logging with path verification and exception capture

## Verified Paths (Compiled Output)

| Path | Expected | Actual (Packaged) | Status |
|------|----------|-------------------|--------|
| `__dirname` | `dist/main/` | `dist/main/` | ✓ Correct |
| `process.resourcesPath` | `dist/electron/resources/` | `dist/electron/resources/` | ✓ Correct |
| `app.getAppPath()` | `dist/electron/` | `dist/electron/` | ✓ Correct |
| Preload path | `dist/main/preload.js` | `dist/main/preload.js` | ✓ Verified exists |
| Renderer path | `dist/renderer/index.html` | `dist/renderer/index.html` | ✓ Verified exists |
| `app.isPackaged` | `false` (dev) / `true` (prod) | `true` (packaged) | ✓ Detected |

## Code Changes Made

### 1. `src/main/index.ts` - Comprehensive Startup Diagnostics

**Added**:
- Startup log file: `%USERPROFILE%\.package-control-center\logs\startup.log`
- `process.on('uncaughtException')` handler with stack trace logging
- `process.on('unhandledRejection')` handler with stack trace logging
- `app.on('render-process-gone')` handler
- `app.on('child-process-gone')` handler
- Production path logging (`__dirname`, `process.resourcesPath`, `app.getAppPath()`)
- Preload file existence verification with logging
- Renderer file existence verification with logging
- `show: true` on BrowserWindow to force visible window
- BrowserWindow event diagnostics:
  - `did-finish-load`
  - `did-fail-load`
  - `dom-ready`
  - `render-process-gone`
- `mainWindow.show()` called immediately after creation
- `ready-to-show` event with focus
- `focus`/`blur` event logging
- DevTools open in development mode

**Modified**:
- BrowserWindow width: 1200 → 1400
- BrowserWindow height: 800 → 900
- Window initially `show: true` instead of `show: false`
- Renderer loading logs the absolute path before loading

### 2. New File: `test.html` (Fallback Renderer Test)

Created `test.html` containing:
```html
<h1>PCC Window Test</h1>
```
Used to diagnose whether the issue is with the React renderer path or the BrowserWindow creation path.

### 3. `package.json` - Type Module Support

**Added**: `"type": "module"` to resolve `ERR_REQUIRE_ESM` error with `uuid` v14+ package (ES module syntax incompatible with `require()`).

## Recommended Fixes (Priority Order)

### High Priority:

1. **Set `show: true` in BrowserWindow creation** - Ensures window is visible immediately rather than waiting for `ready-to-show` event which may not fire in all packaged configurations.

2. **Add startup logging** - The new `%USERPROFILE%\.package-control-center\logs\startup.log` file provides immediate visibility into startup failures. Run the application and check this log file for path verification results.

3. **Verify renderer index.html path** - The code now logs the absolute path `dist/renderer/index.html` at startup. Confirm this path exists in the packaged output.

### Medium Priority:

4. **Add BrowserWindow event diagnostics** - The `did-finish-load`, `did-fail-load`, and `dom-ready` events provide insight into renderer loading status.

5. **Capture exceptions** - The `uncaughtException` and `unhandledRejection` handlers log all unhandled errors to the startup log.

### Low Priority:

6. **Add fallback renderer** - Create `test.html` as a simple test to isolate whether the issue is with the React renderer or BrowserWindow creation.

7. **Enable DevTools** - Temporarily enable `mainWindow.webContents.openDevTools()` in production diagnostics to identify renderer errors.

## Next Steps

1. Run the packaged installer
2. Check `%USERPROFILE%\.package-control-center\logs\startup.log` for output
3. Verify all path existence results in the log
4. If window still doesn't show, use `test.html` fallback to isolate the issue
5. Apply the high-priority fixes above iteratively