import { useState, useRef } from 'react';
import type { HttpMethod } from '../../domain';
import { useClickOutside } from '../../hooks/useClickOutside';
import './MethodSelector.css';

const METHODS: HttpMethod[] = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

interface MethodSelectorProps {
  value: HttpMethod;
  onChange: (method: HttpMethod) => void;
  disabled?: boolean;
}

export function MethodSelector({ value, onChange, disabled }: MethodSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, () => setIsOpen(false), isOpen);

  const handleSelect = (method: HttpMethod) => {
    onChange(method);
    setIsOpen(false);
  };

  return (
    <div className="method-selector" ref={containerRef}>
      <button
        type="button"
        className={`method-selector__button method-${value.toLowerCase()}`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
      >
        {value}
      </button>
      {isOpen && (
        <div className="method-selector__dropdown">
          {METHODS.map((method) => (
            <button
              key={method}
              type="button"
              className={`method-selector__option method-${method.toLowerCase()} ${method === value ? 'active' : ''}`}
              onClick={() => handleSelect(method)}
            >
              {method}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
