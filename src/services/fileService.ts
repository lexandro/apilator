import { open, save } from '@tauri-apps/plugin-dialog';
import { readTextFile, writeTextFile } from '@tauri-apps/plugin-fs';

// ============================================================
// File Service
// ============================================================

interface SaveFileOptions {
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

/**
 * Show save file dialog and write content.
 * Returns true if file was saved, false if cancelled.
 */
async function saveTextFile(
  content: string,
  options?: SaveFileOptions
): Promise<boolean> {
  const filePath = await save({
    defaultPath: options?.defaultPath,
    filters: options?.filters ?? [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (!filePath) {
    return false;
  }

  await writeTextFile(filePath, content);
  return true;
}

/**
 * Get appropriate file extension based on content type.
 */
function getExtensionFromContentType(contentType: string): { ext: string; name: string } {
  const ct = contentType.toLowerCase();

  if (ct.includes('json')) {
    return { ext: 'json', name: 'JSON' };
  }
  if (ct.includes('xml')) {
    return { ext: 'xml', name: 'XML' };
  }
  if (ct.includes('html')) {
    return { ext: 'html', name: 'HTML' };
  }

  return { ext: 'txt', name: 'Text' };
}

// ============================================================
// Service Export
// ============================================================

/** Absolute path of the chosen file, or null when the dialog was dismissed. */
async function pickFile(
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<string | null> {
  try {
    const selected = await open({ multiple: false, directory: false, filters });
    return typeof selected === 'string' ? selected : null;
  } catch (error) {
    console.error('Failed to open the file picker:', error);
    return null;
  }
}

/** Opens a picker and returns the file's text, or null if dismissed or unreadable. */
async function pickAndReadText(
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<{ path: string; content: string } | null> {
  const path = await pickFile(filters);
  if (!path) return null;

  try {
    return { path, content: await readTextFile(path) };
  } catch (error) {
    console.error('Failed to read the chosen file:', error);
    return null;
  }
}

export const fileService = {
  saveTextFile,
  getExtensionFromContentType,
  pickFile,
  pickAndReadText,
};
