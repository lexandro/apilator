import { useCallback } from 'react';
import { fileService } from '../services';

/** Keeps the file dialog out of the view layer. */
export function useFilePicker() {
  return useCallback(() => fileService.pickFile(), []);
}
