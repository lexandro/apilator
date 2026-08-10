import { useState } from 'react';
import { EyeIcon, EyeOffIcon } from '../icons';

interface SettingsPasswordInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SettingsPasswordInput({
  value,
  onChange,
  placeholder = 'Password',
  label,
}: SettingsPasswordInputProps) {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className="settings-input-group">
      {label && <label className="settings-input-label">{label}</label>}
      <div className="settings-password-input">
        <input
          type={showPassword ? 'text' : 'password'}
          className="settings-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="settings-password-toggle"
          onClick={() => setShowPassword(!showPassword)}
          title={showPassword ? 'Hide password' : 'Show password'}
        >
          {showPassword ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}
