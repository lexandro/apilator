import { useSettingsStore } from '../../../stores';
import { Toggle } from '../components/Toggle';
import { SettingsPasswordInput } from '../components/SettingsPasswordInput';

export function ProxySection() {
  const proxy = useSettingsStore((s) => s.proxy);
  const updateProxySettings = useSettingsStore((s) => s.updateProxySettings);
  const updateCustomProxy = useSettingsStore((s) => s.updateCustomProxy);

  return (
    <div className="settings-section proxy-section">
      <h2 className="settings-section-title">Proxy</h2>

      {/* Default proxy configuration */}
      <div className="settings-group">
        <h3 className="settings-group-title">Default proxy configuration</h3>
        <p className="settings-group-description">
          Apilator uses the system's proxy configurations by default to connect to any online
          services, or to send API requests.
        </p>

        <label className="settings-checkbox-row">
          <input
            type="checkbox"
            checked={proxy.defaultProxyAuth}
            onChange={(e) => updateProxySettings({ defaultProxyAuth: e.target.checked })}
          />
          <span>This proxy requires authentication</span>
        </label>

        {proxy.defaultProxyAuth && (
          <div className="settings-auth-fields">
            <div className="settings-auth-row">
              <div className="settings-input-group">
                <label className="settings-input-label">Username</label>
                <input
                  type="text"
                  className="settings-input"
                  value={proxy.defaultProxyUsername}
                  onChange={(e) => updateProxySettings({ defaultProxyUsername: e.target.value })}
                  placeholder="Username"
                />
              </div>
              <SettingsPasswordInput
                label="Password"
                value={proxy.defaultProxyPassword}
                onChange={(v) => updateProxySettings({ defaultProxyPassword: v })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Proxy configurations for sending requests */}
      <div className="settings-group">
        <h3 className="settings-group-title">Proxy configurations for sending requests</h3>
        <p className="settings-group-description">
          Specify a proxy setting to act as an intermediary for requests sent through the Builder in
          Apilator. These configurations do not apply to any Apilator services.
        </p>

        <div className="settings-toggle-list">
          <Toggle
            label="Use system proxy"
            checked={proxy.useSystemProxy}
            onChange={(v) => updateProxySettings({ useSystemProxy: v })}
          />
          <Toggle
            label="Respect HTTP_PROXY, HTTPS_PROXY, and NO_PROXY environment variables"
            checked={proxy.respectEnvVariables}
            onChange={(v) => updateProxySettings({ respectEnvVariables: v })}
          />
          <Toggle
            label="Use custom proxy configuration"
            checked={proxy.useCustomProxy}
            onChange={(v) => updateProxySettings({ useCustomProxy: v })}
          />
        </div>

        {proxy.useCustomProxy && (
          <div className="proxy-custom-config">
            {/* Use proxy for */}
            <div className="proxy-config-row">
              <div className="proxy-config-label">
                <span className="proxy-config-title">Use proxy for</span>
                <span className="proxy-config-hint">Choose which request types use the proxy.</span>
              </div>
              <div className="settings-checkbox-group">
                <label className="settings-checkbox-item">
                  <input
                    type="checkbox"
                    checked={proxy.customProxy.useForHttp}
                    onChange={(e) => updateCustomProxy({ useForHttp: e.target.checked })}
                  />
                  <span>HTTP</span>
                </label>
                <label className="settings-checkbox-item">
                  <input
                    type="checkbox"
                    checked={proxy.customProxy.useForHttps}
                    onChange={(e) => updateCustomProxy({ useForHttps: e.target.checked })}
                  />
                  <span>HTTPS</span>
                </label>
              </div>
            </div>

            {/* Proxy server */}
            <div className="proxy-config-row">
              <span className="proxy-config-title">Proxy server</span>
              <div className="proxy-server-input">
                <select
                  className="proxy-protocol-select"
                  value={proxy.customProxy.protocol}
                  onChange={(e) => updateCustomProxy({ protocol: e.target.value as 'http' | 'https' })}
                >
                  <option value="http">http</option>
                  <option value="https">https</option>
                </select>
                <span className="proxy-separator">://</span>
                <input
                  type="text"
                  className="proxy-host-input"
                  value={proxy.customProxy.host}
                  onChange={(e) => updateCustomProxy({ host: e.target.value })}
                  placeholder="127.0.0.1"
                />
                <span className="proxy-separator">:</span>
                <input
                  type="text"
                  className="proxy-port-input"
                  value={proxy.customProxy.port}
                  onChange={(e) => updateCustomProxy({ port: e.target.value })}
                  placeholder="8080"
                />
              </div>
            </div>

            {/* Proxy auth */}
            <Toggle
              label="Proxy auth"
              hint="Uses basic authentication method."
              checked={proxy.customProxy.auth}
              onChange={(v) => updateCustomProxy({ auth: v })}
              className="proxy-auth-toggle"
            />

            {proxy.customProxy.auth && (
              <div className="settings-auth-fields">
                <div className="settings-auth-row">
                  <div className="settings-input-group">
                    <label className="settings-input-label">Username</label>
                    <input
                      type="text"
                      className="settings-input"
                      value={proxy.customProxy.username}
                      onChange={(e) => updateCustomProxy({ username: e.target.value })}
                      placeholder="Username"
                    />
                  </div>
                  <SettingsPasswordInput
                    label="Password"
                    value={proxy.customProxy.password}
                    onChange={(v) => updateCustomProxy({ password: v })}
                  />
                </div>
              </div>
            )}

            {/* Proxy bypass */}
            <div className="proxy-bypass-row">
              <div className="proxy-bypass-label">
                <span className="proxy-config-title">Proxy bypass</span>
                <span className="proxy-config-hint">
                  Enter comma separated hosts to bypass proxy settings.
                </span>
              </div>
              <textarea
                className="proxy-bypass-input"
                value={proxy.customProxy.bypass}
                onChange={(e) => updateCustomProxy({ bypass: e.target.value })}
                placeholder="E.g. 127.0.0.1, localhost, *.example.com"
                rows={3}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
