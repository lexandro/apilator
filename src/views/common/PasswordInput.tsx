import { useState } from 'react';
import { Input } from './Input';
import { Button } from './Button';
import './PasswordInput.css';

interface PasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function PasswordInput({
  value,
  onChange,
  placeholder = 'Enter password',
  className,
  id,
}: PasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  const classes = ['password-input', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <Input
        id={id}
        type={showPassword ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="password-input__field"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowPassword(!showPassword)}
        className="password-input__toggle"
        type="button"
        title={showPassword ? 'Hide' : 'Show'}
      >
        {showPassword ? 'Hide' : 'Show'}
      </Button>
    </div>
  );
}
