import type { BearerAuthConfig } from '../../../domain';
import { PasswordInput } from '../../common';

interface BearerAuthFormProps {
  config: BearerAuthConfig;
  onChange: (config: BearerAuthConfig) => void;
}

export function BearerAuthForm({ config, onChange }: BearerAuthFormProps) {
  return (
    <div className="auth-form--inline">
      <div className="auth-form__inline-row">
        <label className="auth-form__inline-label">Token</label>
        <div className="auth-form__inline-input">
          <PasswordInput
            value={config.token}
            onChange={(token) => onChange({ ...config, token })}
            placeholder="Enter bearer token"
          />
        </div>
      </div>
    </div>
  );
}
