/**
 * PCC theme service (renderer).
 *
 * Applies the persisted theme choice as `theme-light` / `theme-dark` on
 * <html>. The authoritative copy of the choice lives in the main process
 * (ConfigService, theme.mode); this service also mirrors it to
 * localStorage so the inline bootstrap script in index.html can paint the
 * correct palette on the very first frame (before React and before the
 * IPC round-trip complete).
 *
 * Only two themes are supported: dark and light. Legacy 'system' values
 * written by older builds are normalized to dark.
 */
import type { ThemeMode } from '@/types';

const STORAGE_KEY = 'pcc-theme-mode';

let currentMode: ThemeMode = 'dark';

/** The mode currently in effect (used by the Settings page). */
export function getThemeMode(): ThemeMode {
  return currentMode;
}

/**
 * Apply a theme mode immediately: root class, localStorage mirror,
 * and the native Windows title-bar overlay.
 */
export function applyTheme(mode: ThemeMode): void {
  currentMode = mode;

  const root = document.documentElement;
  root.classList.remove('theme-light', 'theme-dark');
  root.classList.add(`theme-${mode}`);

  try {
    window.localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // Storage unavailable — the theme still works for this session.
  }

  const setTheme = window.electronAPI?.window?.setTheme;
  if (setTheme) {
    setTheme(mode).catch(() => {
      /* Non-fatal: native chrome stays on its previous palette. */
    });
  }
}

function normalizeMode(value: unknown): ThemeMode {
  // Only light/dark are valid; legacy 'system' (older builds) maps to dark.
  return value === 'light' ? 'light' : 'dark';
}

/**
 * Load the persisted theme choice from the main process and apply it.
 * Called once from main.tsx before the app renders.
 */
export function initTheme(): Promise<ThemeMode> {
  const api = window.electronAPI;
  if (api?.config?.getThemeMode) {
    return api.config
      .getThemeMode()
      .then((mode) => applyTheme(normalizeMode(mode)))
      .catch(() => applyTheme('dark'))
      .then(() => currentMode);
  }
  applyTheme('dark');
  return Promise.resolve(currentMode);
}