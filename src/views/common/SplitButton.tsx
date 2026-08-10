import { useState, useRef, useEffect, ReactNode } from 'react';
import { Button } from './Button';
import { useClickOutside } from '../../hooks/useClickOutside';
import './SplitButton.css';

export interface SplitButtonOption {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
}

export interface SplitButtonProps {
  label: string;
  onClick: () => void;
  options: SplitButtonOption[];
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
}

export function SplitButton({
  label,
  onClick,
  options,
  disabled,
  isLoading,
  className,
}: SplitButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  const handleOptionClick = (option: SplitButtonOption) => {
    option.onClick();
    setIsOpen(false);
  };

  const handleDropdownToggle = () => {
    if (!disabled && !isLoading) {
      setIsOpen(!isOpen);
    }
  };

  const classNames = ['split-button', className].filter(Boolean).join(' ');

  return (
    <div className={classNames} ref={containerRef}>
      <Button
        className="split-button__main"
        variant="primary"
        onClick={onClick}
        disabled={disabled}
        isLoading={isLoading}
      >
        {label}
      </Button>
      <button
        className="split-button__trigger"
        onClick={handleDropdownToggle}
        disabled={disabled || isLoading}
        aria-haspopup="true"
        aria-expanded={isOpen}
      >
        <svg
          width="10"
          height="6"
          viewBox="0 0 10 6"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M1 1L5 5L9 1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {isOpen && (
        <div className="split-button__dropdown" ref={dropdownRef}>
          {options.map((option, index) => (
            <button
              key={index}
              className="split-button__option"
              onClick={() => handleOptionClick(option)}
            >
              {option.icon && <span className="split-button__option-icon">{option.icon}</span>}
              <span className="split-button__option-label">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
