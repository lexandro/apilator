import { ReactNode } from 'react';
import './FormRow.css';

interface FormRowProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function FormRow({
  label,
  htmlFor,
  hint,
  children,
  className,
}: FormRowProps) {
  const classes = ['form-row', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <label className="form-row__label" htmlFor={htmlFor}>
        {label}
        {hint && <span className="form-row__hint">{hint}</span>}
      </label>
      <div className="form-row__content">
        {children}
      </div>
    </div>
  );
}
