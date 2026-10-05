import { useCallback } from 'react';
import type { FormDataEntry } from '../../domain';
import { createFormDataEntry } from '../../domain';
import { Input } from './Input';
import { Button } from './Button';
import './KeyValueEditor.css';
import './FormDataEditor.css';

export interface FormDataEditorProps {
  items: FormDataEntry[];
  onChange: (items: FormDataEntry[]) => void;
  onPickFile: () => Promise<string | null>;
}

const PATH_SEPARATOR = /[/\\]/;

export function fileNameOf(path: string): string {
  const parts = path.split(PATH_SEPARATOR);
  return parts[parts.length - 1] || path;
}

export function FormDataEditor({ items, onChange, onPickFile }: FormDataEditorProps) {
  const update = useCallback(
    (id: string, patch: Partial<FormDataEntry>) => {
      onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    },
    [items, onChange]
  );

  const addRow = useCallback(() => {
    onChange([...items, createFormDataEntry()]);
  }, [items, onChange]);

  const removeRow = useCallback(
    (id: string) => {
      onChange(items.filter((item) => item.id !== id));
    },
    [items, onChange]
  );

  const toggleKind = useCallback(
    (item: FormDataEntry) => {
      const becomingFile = item.filePath === undefined;
      update(item.id, becomingFile ? { filePath: '', value: '' } : { filePath: undefined });
    },
    [update]
  );

  const chooseFile = useCallback(
    async (id: string) => {
      const path = await onPickFile();
      if (path) update(id, { filePath: path });
    },
    [onPickFile, update]
  );

  return (
    <div className="kv-editor">
      <div className="kv-editor__list">
        {items.map((item) => {
          const isFile = item.filePath !== undefined;

          return (
            <div
              key={item.id}
              className={`kv-editor__row ${!item.enabled ? 'kv-editor__row--disabled' : ''}`}
            >
              <input
                type="checkbox"
                className="kv-editor__checkbox"
                checked={item.enabled}
                onChange={(e) => update(item.id, { enabled: e.target.checked })}
                aria-label="Enabled"
              />

              <Input
                type="text"
                value={item.key}
                onChange={(e) => update(item.id, { key: e.target.value })}
                placeholder="Key"
                className="kv-editor__input"
              />

              {isFile ? (
                <div className="form-data-row__file">
                  <Button
                    variant="ghost"
                    size="sm"
                    type="button"
                    onClick={() => chooseFile(item.id)}
                    className="form-data-row__browse"
                  >
                    {item.filePath ? fileNameOf(item.filePath) : 'Choose file…'}
                  </Button>
                  {item.filePath && (
                    <span className="form-data-row__path" title={item.filePath}>
                      {item.filePath}
                    </span>
                  )}
                </div>
              ) : (
                <Input
                  type="text"
                  value={item.value}
                  onChange={(e) => update(item.id, { value: e.target.value })}
                  placeholder="Value"
                  className="kv-editor__input"
                />
              )}

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => toggleKind(item)}
                title={isFile ? 'Send as a text field' : 'Send as a file'}
                className="form-data-row__kind"
              >
                {isFile ? 'File' : 'Text'}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                type="button"
                onClick={() => removeRow(item.id)}
                title="Remove"
                className="kv-editor__remove"
              >
                ×
              </Button>
            </div>
          );
        })}
      </div>

      <Button variant="ghost" size="sm" type="button" onClick={addRow} className="kv-editor__add">
        + Add field
      </Button>
    </div>
  );
}
