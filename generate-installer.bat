@echo off
REM Package Control Center v2.0.0 - Manual Installer Generator
REM Run this script as Administrator to generate the NSIS installer

echo ============================================
echo Package Control Center v2.0.0
REM Manual Installer Generator
echo ============================================
echo.

REM Check if running as Administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo ERROR: This script must be run as Administrator
    echo.
    echo Right-click this script and select "Run as administrator"
    echo.
    pause
    exit /b 1
)

echo Building Package Control Center v2.0.0...
echo.

REM Build the application first
echo [1/2] Building application...
npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo [2/2] Generating NSIS installer (requires admin for winCodeSign)...
echo.

REM Generate the NSIS installer
npx electron-builder --win --x64

if %errorlevel% neq 0 (
    echo.
    echo ERROR: Installer generation failed
    echo.
    echo Common issues:
    echo   - winCodeSign extraction requires admin (you are admin)
    echo   - Check C:\Users\%USERNAME%\AppData\Local\electron-builder\Cache\winCodeSign
    echo   - Try clearing the cache: rmdir /s /q "%LOCALAPPDATA%\electron-builder\Cache\winCodeSign"
    pause
    exit /b 1
fi

echo.
echo ============================================
echo SUCCESS: Installer generated!
echo ============================================
echo.
echo Output location: release\
echo.
dir release\
echo.
pause