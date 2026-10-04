<# 
.SYNOPSIS
    Package Control Center v2.0.0 - Manual Installer Generator

.DESCRIPTION
    Generates the NSIS installer and portable build for Package Control Center v2.0.0.
    All release artifacts are placed in the release\ folder.
    Must be run as Administrator due to winCodeSign symlink extraction.

.NOTES
    Version: 2.0.0
    Application: Package Control Center
    Author: Package Control Center Team
#>

param(
    [switch]$ClearCache
)

Write-Host "============================================" -ForegroundColor Cyan
Write-Host "Package Control Center v2.0.0" -ForegroundColor Cyan
Write-Host "Manual Installer Generator" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check for Administrator privileges
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "ERROR: This script must be run as Administrator"
    Write-Host ""
    Write-Host "Right-click PowerShell and select 'Run as Administrator'" -ForegroundColor Yellow
    Write-Host "Then run: .\generate-installer.ps1" -ForegroundColor Yellow
    exit 1
}

if ($ClearCache) {
    Write-Host "Clearing electron-builder winCodeSign cache..." -ForegroundColor Yellow
    $cachePath = "$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
    if (Test-Path $cachePath) {
        Remove-Item $cachePath -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "Cache cleared: $cachePath" -ForegroundColor Green
    }
}

# Step 1: Build the application
Write-Host "[1/2] Building application..." -ForegroundColor Cyan
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
    Write-Host "Build successful!" -ForegroundColor Green
} catch {
    Write-Error "Build failed: $_"
    exit 1
}

# Step 2: Ensure release folder exists
Write-Host ""
Write-Host "[2/2] Generating installer and organizing release artifacts..." -ForegroundColor Cyan

$releaseDir = Join-Path (Get-Location).Path "release"
if (-not (Test-Path $releaseDir)) {
    Write-Host "Creating release folder: $releaseDir" -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $releaseDir -Force | Out-Null
}

# Generate NSIS installer
Write-Host ""
Write-Host "Generating NSIS installer..." -ForegroundColor Cyan

try {
    npx electron-builder --win --x64 --config electron-builder.json
    if ($LASTEXITCODE -ne 0) { throw "NSIS installer generation failed with exit code $LASTEXITCODE" }
    Write-Host "NSIS installer generation completed!" -ForegroundColor Green
} catch {
    Write-Error "NSIS installer generation failed: $_"
    exit 1
}

# Note: the portable target is built in the same electron-builder run above
# (both targets are declared in electron-builder.json). No second build needed.

# Step 3: Organize release artifacts
Write-Host ""
Write-Host "Organizing release artifacts..." -ForegroundColor Cyan

# Verify the NSIS installer (electron-builder writes it directly with its final
# name via the per-target artifactName in electron-builder.json)
$setupArtifact = Join-Path $releaseDir "PackageControlCenter-2.0.0-Setup.exe"
if (Test-Path $setupArtifact) {
    Write-Host "NSIS installer ready: $setupArtifact" -ForegroundColor Green
} else {
    Write-Warning "NSIS installer not found: $setupArtifact"
}

# Verify the portable executable (electron-builder portable target)
$portableArtifact = Join-Path $releaseDir "PackageControlCenter-2.0.0-P.exe"
if (Test-Path $portableArtifact) {
    Write-Host "Portable executable ready: $portableArtifact" -ForegroundColor Green
} else {
    Write-Warning "Portable executable not found: $portableArtifact"
}

# Ensure latest.yml (auto-update feed) is present in the release folder.
# electron-builder writes it directly into release\ when a publish config is
# present; older/alternate layouts produced it under dist\electron instead.
$latestTarget = Join-Path -Path $releaseDir "latest.yml"
if (-not (Test-Path $latestTarget)) {
    $legacyLatest = Join-Path -Path (Join-Path (Get-Location).Path "dist/electron") "latest.yml"
    if (Test-Path $legacyLatest) {
        Write-Host "Copying latest.yml..." -ForegroundColor Cyan
        Copy-Item -Path $legacyLatest -Destination $latestTarget -Force -ErrorAction SilentlyContinue
        Write-Host "Copied: $latestTarget" -ForegroundColor Green
    } else {
        Write-Warning "latest.yml not found (auto-update feed unavailable)"
    }
} else {
    Write-Host "latest.yml ready: $latestTarget" -ForegroundColor Green
}

# The NSIS blockmap is already named PackageControlCenter-2.0.0-Setup.exe.blockmap
# (follows the installer's artifactName), so no rename is needed.

# Step 4: Display release folder contents
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "SUCCESS: Installer generated!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "Release artifacts:" -ForegroundColor Yellow
Get-ChildItem $releaseDir | Sort-Object Name | Format-Table Mode, LastWriteTime, Length, Name -AutoSize

Write-Host ""
Write-Host "Artifact summary:" -ForegroundColor Yellow

$setupArtifact = Join-Path $releaseDir "PackageControlCenter-2.0.0-Setup.exe"
$portableArtifact = Join-Path $releaseDir "PackageControlCenter-2.0.0-P.exe"

if (Test-Path $setupArtifact) {
    Write-Host "  [SETUP] $setupArtifact" -ForegroundColor Green
    $setupSize = (Get-Item $setupArtifact).Length
    Write-Host "    Size: $([math]::Round($setupSize / 1MB, 2)) MB" -ForegroundColor White
} else {
    Write-Host "  [SETUP] PackageControlCenter-2.0.0-Setup.exe: NOT FOUND" -ForegroundColor Red
}

if (Test-Path $portableArtifact) {
    Write-Host "  [PORTABLE] $portableArtifact" -ForegroundColor Green
    $portableSize = (Get-Item $portableArtifact).Length
    Write-Host "    Size: $([math]::Round($portableSize / 1MB, 2)) MB" -ForegroundColor White
} else {
    Write-Host "  [PORTABLE] PackageControlCenter-2.0.0-P.exe: NOT FOUND" -ForegroundColor Red
}

# Step 5: Cleanup temporary packaging files
Write-Host ""
Write-Host "Cleaning up temporary packaging files..." -ForegroundColor Cyan

$winUnpacked = Join-Path -Path $releaseDir "win-unpacked"
if (Test-Path $winUnpacked) {
    Write-Host "Removing: release/win-unpacked" -ForegroundColor Yellow
    Remove-Item $winUnpacked -Recurse -Force -ErrorAction SilentlyContinue
}

$configYaml = Join-Path -Path $releaseDir "builder-effective-config.yaml"
if (Test-Path $configYaml) {
    Write-Host "Removing: release/builder-effective-config.yaml" -ForegroundColor Yellow
    Remove-Item $configYaml -Force -ErrorAction SilentlyContinue
}

$debugYaml = Join-Path -Path $releaseDir "builder-debug.yml"
if (Test-Path $debugYaml) {
    Remove-Item $debugYaml -Force -ErrorAction SilentlyContinue
}

# Clean up stale leftovers from older runs (extensionless artifact + raw blockmap)
foreach ($stale in @("PackageControlCenter-2.0.0", "PackageControlCenter-2.0.0.blockmap")) {
    $stalePath = Join-Path -Path $releaseDir $stale
    if (Test-Path $stalePath) {
        Write-Host "Removing stale artifact: $stale" -ForegroundColor Yellow
        Remove-Item $stalePath -Force -ErrorAction SilentlyContinue
    }
}

Write-Host ""
Write-Host "Release packaging complete!" -ForegroundColor Green
Write-Host ""

pause