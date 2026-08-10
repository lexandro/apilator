import type {
  AuthConfig,
  AuthType,
  BasicAuthConfig,
  BearerAuthConfig,
  JwtAuthConfig,
} from '../../../domain';
import {
  createNoAuth,
  createBasicAuth,
  createBearerAuth,
  createJwtAuth,
} from '../../../domain';
import { Dropdown, DropdownOption } from '../../common';
import { BasicAuthForm } from './BasicAuthForm';
import { BearerAuthForm } from './BearerAuthForm';
import { JwtAuthForm } from './JwtAuthForm';
import './AuthEditor.css';

interface AuthEditorProps {
  auth: AuthConfig;
  onChange: (auth: AuthConfig) => void;
}

const authTypeOptions: DropdownOption<AuthType>[] = [
  { value: 'none', label: 'No Auth' },
  { value: 'basic', label: 'Basic Auth' },
  { value: 'bearer', label: 'Bearer Token' },
  { value: 'jwt', label: 'JWT Bearer' },
];

const authDescriptions: Record<AuthType, string> = {
  none: 'This request does not use any authorization.',
  basic: 'The authorization header will be automatically generated when you send the request.',
  bearer: 'The token will be sent as a Bearer token in the Authorization header.',
  jwt: 'A JWT token will be generated and sent with the request.',
};

export function AuthEditor({ auth, onChange }: AuthEditorProps) {
  const handleTypeChange = (newType: AuthType) => {
    if (newType === auth.type) return;

    switch (newType) {
      case 'none':
        onChange(createNoAuth());
        break;
      case 'basic':
        onChange(createBasicAuth());
        break;
      case 'bearer':
        onChange(createBearerAuth());
        break;
      case 'jwt':
        onChange(createJwtAuth());
        break;
    }
  };

  const isSimpleAuth = auth.type === 'none' || auth.type === 'basic' || auth.type === 'bearer';

  return (
    <div className="auth-editor">
      {isSimpleAuth ? (
        // Compact layout: dropdown + form side by side
        <div className="auth-editor__compact">
          <div className="auth-editor__left">
            <label className="auth-editor__type-label">Auth Type</label>
            <Dropdown
              options={authTypeOptions}
              value={auth.type}
              onChange={handleTypeChange}
              className="auth-editor__dropdown"
            />
            <p className="auth-editor__description">
              {authDescriptions[auth.type]}
            </p>
          </div>

          <div className="auth-editor__right">
            {auth.type === 'basic' && (
              <BasicAuthForm
                config={auth as BasicAuthConfig}
                onChange={onChange}
              />
            )}

            {auth.type === 'bearer' && (
              <BearerAuthForm
                config={auth as BearerAuthConfig}
                onChange={onChange}
              />
            )}
          </div>
        </div>
      ) : (
        // JWT has more fields, use stacked layout
        <div className="auth-editor__stacked">
          <div className="auth-editor__header">
            <div className="auth-editor__type-section">
              <label className="auth-editor__type-label">Auth Type</label>
              <Dropdown
                options={authTypeOptions}
                value={auth.type}
                onChange={handleTypeChange}
                className="auth-editor__dropdown"
              />
            </div>
            <p className="auth-editor__description">
              {authDescriptions[auth.type]}
            </p>
          </div>

          <div className="auth-editor__content">
            <JwtAuthForm
              config={auth as JwtAuthConfig}
              onChange={onChange}
            />
          </div>
        </div>
      )}
    </div>
  );
}
