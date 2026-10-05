import { useState, useRef, ReactNode, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useClickOutside } from '../../hooks/useClickOutside';
import './Dropdown.css';

export interface DropdownOption<T = string> {
  value: T;
  label: string;
  icon?: ReactNode;
}

interface DropdownProps<T = string> {
  options: DropdownOption<T>[];
  value: T;
  onChange: (value: T) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  renderTrigger?: (option: DropdownOption<T> | undefined, isOpen: boolean) => ReactNode;
}

export function Dropdown<T = string>({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled,
  className,
  renderTrigger,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0, width: 0 });
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside([containerRef, menuRef], () => setIsOpen(false), isOpen);

  // Update menu position when opened
  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  const handleSelect = (option: DropdownOption<T>) => {
    onChange(option.value);
    setIsOpen(false);
  };

  const classes = ['dropdown', className, disabled && 'dropdown--disabled']
    .filter(Boolean)
    .join(' ');

  const menu = isOpen && (
    <div
      ref={menuRef}
      className="dropdown__menu dropdown__menu--portal"
      style={{
        top: menuPosition.top,
        left: menuPosition.left,
        minWidth: menuPosition.width,
      }}
    >
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          className={`dropdown__option ${value === option.value ? 'active' : ''}`}
          onClick={() => handleSelect(option)}
        >
          {option.icon && (
            <span className="dropdown__option-icon">{option.icon}</span>
          )}
          <span className="dropdown__option-label">{option.label}</span>
          {value === option.value && (
            <span className="dropdown__check">✓</span>
          )}
        </button>
      ))}
    </div>
  );

  return (
    <div className={classes} ref={containerRef}>
      <button
        ref={triggerRef}
        type="button"
        className="dropdown__trigger"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {renderTrigger ? (
          renderTrigger(selectedOption, isOpen)
        ) : (
          <>
            {selectedOption?.icon && (
              <span className="dropdown__icon">{selectedOption.icon}</span>
            )}
            <span className="dropdown__label">
              {selectedOption?.label || placeholder}
            </span>
            <span className={`dropdown__arrow ${isOpen ? 'open' : ''}`}>▾</span>
          </>
        )}
      </button>

      {createPortal(menu, document.body)}
    </div>
  );
}
