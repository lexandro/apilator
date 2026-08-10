import type { BasicAuthConfig } from '../../../domain';
import { Input, PasswordInput } from '../../common';

interface BasicAuthFormProps {
  config: BasicAuthConfig;
  onChange: (config: BasicAuthConfig) => void;
}

export function BasicAuthForm({ config, onChange }: BasicAuthFormProps) {
  return (
    <div className="auth-form--inline">
      <div className="auth-form__inline-row">
        <label className="auth-form__inline-label">Username</label>
        <div className="auth-form__inline-input">
          <Input
            type="text"
            value={config.username}
            onChange={(e) => onChange({ ...config, username: e.target.value })}
            placeholder="Enter username"
          />
        </div>
      </div>

      <div className="auth-form__inline-row">
        <label className="auth-form__inline-label">Password</label>
        <div className="auth-form__inline-input">
          <PasswordInput
            value={config.password}
            onChange={(password) => onChange({ ...config, password })}
            placeholder="Enter password"
          />
        </div>
      </div>
    </div>
  );
}
