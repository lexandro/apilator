import { ButtonHTMLAttributes, forwardRef } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', isLoading, className, children, disabled, ...props }, ref) => {
    const classNames = [
      'btn',
      `btn--${variant}`,
      `btn--${size}`,
      isLoading && 'btn--loading',
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button ref={ref} className={classNames} disabled={disabled || isLoading} {...props}>
        {isLoading && <span className="btn__spinner" />}
        <span className={isLoading ? 'btn__content--hidden' : ''}>{children}</span>
      </button>
    );
  }
);

Button.displayName = 'Button';
