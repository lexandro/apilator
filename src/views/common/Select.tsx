import { SelectHTMLAttributes, forwardRef } from 'react';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: SelectOption[];
  error?: string;
  fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, options, error, fullWidth, className, id, ...props }, ref) => {
    const selectId = id || label?.toLowerCase().replace(/\s+/g, '-');

    const wrapperClasses = [
      'select-wrapper',
      fullWidth && 'select-wrapper--full',
      error && 'select-wrapper--error',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <div className={wrapperClasses}>
        {label && (
          <label htmlFor={selectId} className="select__label">
            {label}
          </label>
        )}
        <div className="select__container">
          <select ref={ref} id={selectId} className="select" {...props}>
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <span className="select__arrow" />
        </div>
        {error && <span className="select__error">{error}</span>}
      </div>
    );
  }
);

Select.displayName = 'Select';
