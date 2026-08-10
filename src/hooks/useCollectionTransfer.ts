import { useCallback } from 'react';
import { collectionsService, fileService } from '../services';
import { useCollectionsStore } from '../stores';

const COLLECTION_FILTERS = [
  { name: 'Collections and OpenAPI', extensions: ['yaml', 'yml', 'json'] },
  { name: 'All Files', extensions: ['*'] },
];

export interface TransferOutcome {
  ok: boolean;
  message: string;
}

/** Export and import of collections, keeping the file dialogs out of the view layer. */
export function useCollectionTransfer() {
  const collections = useCollectionsStore((s) => s.collections);
  const replaceAll = useCollectionsStore((s) => s.replaceAll);

  const exportCollections = useCallback(async (): Promise<TransferOutcome> => {
    if (collections.length === 0) {
      return { ok: false, message: 'There is nothing to export yet.' };
    }

    try {
      const saved = await fileService.saveTextFile(collectionsService.serialize(collections), {
        defaultPath: 'apilator-collections.yaml',
        filters: [
          { name: 'YAML', extensions: ['yaml'] },
          { name: 'All Files', extensions: ['*'] },
        ],
      });

      return saved
        ? { ok: true, message: `Exported ${collections.length} collection(s).` }
        : { ok: false, message: '' };
    } catch (error) {
      console.error('Failed to export collections:', error);
      return { ok: false, message: 'Could not write the file.' };
    }
  }, [collections]);

  const importCollections = useCallback(async (): Promise<TransferOutcome> => {
    const file = await fileService.pickAndReadText(COLLECTION_FILTERS);
    if (!file) return { ok: false, message: '' };

    const result = collectionsService.importFromText(file.content);
    if (!result) {
      return {
        ok: false,
        message: 'That file is neither an Apilator export nor an OpenAPI 3 document.',
      };
    }

    // Imports are added alongside what is already there; replacing would be a silent
    // way to lose everything.
    replaceAll([...collections, ...result.collections]);

    const source = result.kind === 'openapi' ? 'OpenAPI' : 'Apilator export';
    return { ok: true, message: `Imported ${result.requestCount} request(s) from ${source}.` };
  }, [collections, replaceAll]);

  return { exportCollections, importCollections };
}
