import { useRef } from 'react';
import { FORMAT_OPTIONS, type FormatType } from '../../utils/formatters';
import { useClickOutside } from '../../hooks/useClickOutside';

interface FormatSelectorProps {
  format: FormatType;
  onFormatChange: (format: FormatType) => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function FormatSelector({
  format,
  onFormatChange,
  isOpen,
  onToggle,
  onClose,
}: FormatSelectorProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, onClose, isOpen);

  const currentOption = FORMAT_OPTIONS.find(o => o.value === format) || FORMAT_OPTIONS[0];

  const handleSelect = (value: FormatType) => {
    onFormatChange(value);
    onClose();
  };

  return (
    <div className="format-selector" ref={menuRef}>
      <button className="format-selector-btn" onClick={onToggle}>
        <span className="format-icon">{currentOption.icon}</span>
        <span className="format-label">{currentOption.label}</span>
        <span className="format-arrow">▾</span>
      </button>
      {isOpen && (
        <div className="format-menu">
          {FORMAT_OPTIONS.slice(0, 4).map((option) => (
            <button
              key={option.value}
              className={`format-menu-item ${format === option.value ? 'active' : ''}`}
              onClick={() => handleSelect(option.value)}
            >
              <span className="format-menu-icon">{option.icon}</span>
              <span>{option.label}</span>
              {format === option.value && <span className="format-check">✓</span>}
            </button>
          ))}
          <div className="format-menu-divider" />
          {FORMAT_OPTIONS.slice(4).map((option) => (
            <button
              key={option.value}
              className={`format-menu-item ${format === option.value ? 'active' : ''}`}
              onClick={() => handleSelect(option.value)}
            >
              <span className="format-menu-icon">{option.icon}</span>
              <span>{option.label}</span>
              {format === option.value && <span className="format-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
