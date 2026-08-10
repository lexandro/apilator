import { useState } from 'react';
import type { JwtAuthConfig, JwtAlgorithm, JwtTarget } from '../../../domain';
import { JWT_ALGORITHMS } from '../../../domain';
import { Input, Select, FormRow, PasswordInput } from '../../common';
import './AuthEditor.css';

interface JwtAuthFormProps {
  config: JwtAuthConfig;
  onChange: (config: JwtAuthConfig) => void;
}

const algorithmOptions = JWT_ALGORITHMS.map((value) => ({ value, label: value }));

const targetOptions: { value: JwtTarget; label: string }[] = [
  { value: 'header', label: 'Request Header' },
  { value: 'query', label: 'Query Param' },
];

export function JwtAuthForm({ config, onChange }: JwtAuthFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const handleChange = <K extends keyof JwtAuthConfig>(
    field: K,
    value: JwtAuthConfig[K]
  ) => {
    onChange({ ...config, [field]: value });
  };

  return (
    <div className="auth-form">
      <FormRow label="Algorithm">
        <Select
          options={algorithmOptions}
          value={config.algorithm}
          onChange={(e) => handleChange('algorithm', e.target.value as JwtAlgorithm)}
        />
      </FormRow>

      <FormRow label="Secret">
        <PasswordInput
          value={config.secret}
          onChange={(value) => handleChange('secret', value)}
          placeholder="Enter secret key"
        />
      </FormRow>

      <div className="auth-form__row auth-form__row--checkbox">
        <label className="auth-form__checkbox-label">
          <input
            type="checkbox"
            checked={config.secretBase64Encoded}
            onChange={(e) => handleChange('secretBase64Encoded', e.target.checked)}
            className="auth-form__checkbox"
          />
          Secret Base64 encoded
        </label>
      </div>

      <FormRow label="Payload">
        <textarea
          value={config.payload}
          onChange={(e) => handleChange('payload', e.target.value)}
          placeholder="{}"
          className="auth-form__textarea"
          rows={4}
        />
      </FormRow>

      <FormRow label="Add JWT token to">
        <Select
          options={targetOptions}
          value={config.target}
          onChange={(e) => handleChange('target', e.target.value as JwtTarget)}
        />
      </FormRow>

      {config.target === 'query' && (
        <FormRow label="Query Param Name">
          <Input
            type="text"
            value={config.queryParamName}
            onChange={(e) => handleChange('queryParamName', e.target.value)}
            placeholder="token"
          />
        </FormRow>
      )}

      <div className="auth-form__advanced">
        <button
          type="button"
          className="auth-form__advanced-toggle"
          onClick={() => setShowAdvanced(!showAdvanced)}
        >
          <span className={`auth-form__advanced-arrow ${showAdvanced ? 'open' : ''}`}>
            &#9656;
          </span>
          Advanced
        </button>

        {showAdvanced && (
          <div className="auth-form__advanced-content">
            <FormRow label="Request Header Prefix">
              <Input
                type="text"
                value={config.headerPrefix}
                onChange={(e) => handleChange('headerPrefix', e.target.value)}
                placeholder="Bearer"
              />
            </FormRow>

            <FormRow label="JWT Headers">
              <textarea
                value={config.jwtHeaders}
                onChange={(e) => handleChange('jwtHeaders', e.target.value)}
                placeholder="{}"
                className="auth-form__textarea"
                rows={3}
              />
            </FormRow>
          </div>
        )}
      </div>
    </div>
  );
}
