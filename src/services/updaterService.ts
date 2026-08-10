import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Wraps the updater plugin. The pending Update object is held here rather than in a store,
 * because it carries methods that a state proxy would break.
 */
let pending: Update | null = null;

export interface UpdateInfo {
  version: string;
  notes: string | null;
  date: string | null;
}

/** Returns the offered update, or null when the app is already current. */
async function checkForUpdate(): Promise<UpdateInfo | null> {
  const update = await check();

  if (!update) {
    pending = null;
    return null;
  }

  pending = update;
  return {
    version: update.version,
    notes: update.body ?? null,
    date: update.date ?? null,
  };
}

/** Downloads and installs the offered update, then restarts the app. */
async function installUpdate(onProgress?: (downloaded: number, total: number | null) => void) {
  if (!pending) throw new Error('No update has been offered');

  let downloaded = 0;
  let total: number | null = null;

  await pending.downloadAndInstall((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength ?? null;
      downloaded = 0;
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength;
    }
    onProgress?.(downloaded, total);
  });

  await relaunch();
}

function hasPendingUpdate(): boolean {
  return pending !== null;
}

export const updaterService = {
  checkForUpdate,
  installUpdate,
  hasPendingUpdate,
};
