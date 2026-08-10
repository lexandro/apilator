import { ReactNode } from 'react';
import './TabGroup.css';

export interface TabItem<T extends string = string> {
  value: T;
  label: string;
  count?: number;
  badge?: string;
  icon?: ReactNode;
}

interface TabGroupProps<T extends string = string> {
  items: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
  variant?: 'default' | 'pills' | 'underline';
}

export function TabGroup<T extends string = string>({
  items,
  value,
  onChange,
  className,
  variant = 'default',
}: TabGroupProps<T>) {
  const baseClass = 'tab-group';
  const variantClass = variant !== 'default' ? `${baseClass}--${variant}` : '';
  const classes = [baseClass, variantClass, className].filter(Boolean).join(' ');

  return (
    <div className={classes} role="tablist">
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          role="tab"
          aria-selected={value === item.value}
          className={`${baseClass}__tab ${value === item.value ? 'active' : ''}`}
          onClick={() => onChange(item.value)}
        >
          {item.icon && <span className={`${baseClass}__icon`}>{item.icon}</span>}
          <span className={`${baseClass}__label`}>{item.label}</span>
          {item.count !== undefined && item.count > 0 && (
            <span className={`${baseClass}__count`}>{item.count}</span>
          )}
          {item.badge && (
            <span className={`${baseClass}__badge`}>{item.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
