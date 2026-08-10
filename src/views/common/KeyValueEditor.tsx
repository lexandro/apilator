import { useCallback } from 'react';
import { Input } from './Input';
import { Button } from './Button';
import './KeyValueEditor.css';

export interface KeyValuePair {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
}

export interface KeyValueEditorProps {
  items: KeyValuePair[];
  onChange: (items: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  badgeItems?: Set<string>;
  badgeText?: string;
}

let idCounter = 0;
const generateId = () => `kv-${++idCounter}-${Date.now()}`;

export function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
  badgeItems,
  badgeText = 'default',
}: KeyValueEditorProps) {
  const handleAdd = useCallback(() => {
    onChange([...items, { id: generateId(), key: '', value: '', enabled: true }]);
  }, [items, onChange]);

  const handleRemove = useCallback(
    (id: string) => {
      onChange(items.filter((item) => item.id !== id));
    },
    [items, onChange]
  );

  const handleChange = useCallback(
    (id: string, field: 'key' | 'value', newValue: string) => {
      onChange(
        items.map((item) => (item.id === id ? { ...item, [field]: newValue } : item))
      );
    },
    [items, onChange]
  );

  const handleToggle = useCallback(
    (id: string) => {
      onChange(
        items.map((item) => (item.id === id ? { ...item, enabled: !item.enabled } : item))
      );
    },
    [items, onChange]
  );

  return (
    <div className="kv-editor">
      <div className="kv-editor__list">
        {items.map((item) => (
          <div key={item.id} className={`kv-editor__row ${!item.enabled ? 'kv-editor__row--disabled' : ''}`}>
            <input
              type="checkbox"
              checked={item.enabled}
              onChange={() => handleToggle(item.id)}
              className="kv-editor__checkbox"
              aria-label="Enable/disable"
            />
            <Input
              value={item.key}
              onChange={(e) => handleChange(item.id, 'key', e.target.value)}
              placeholder={keyPlaceholder}
              className="kv-editor__input"
            />
            <Input
              value={item.value}
              onChange={(e) => handleChange(item.id, 'value', e.target.value)}
              placeholder={valuePlaceholder}
              className="kv-editor__input"
            />
            {badgeItems?.has(item.id) && (
              <span className="kv-editor__badge">{badgeText}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleRemove(item.id)}
              aria-label="Remove"
              className="kv-editor__remove"
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" onClick={handleAdd} className="kv-editor__add">
        + Add
      </Button>
    </div>
  );
}
