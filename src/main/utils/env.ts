import { app } from 'electron';

// Canonical production check: `app.isPackaged` is true when running from
// the packaged app (asar), false when running `electron .` from source.
export const isDev = !app.isPackaged;