import { useSettingsStore } from '../../../stores';
import type { HttpVersion } from '../../../domain';
import { Toggle } from '../components/Toggle';
import { SettingRow } from '../components/SettingRow';

export function GeneralSection() {
  const general = useSettingsStore((s) => s.getGeneralSettings());
  const updateGeneralSettings = useSettingsStore((s) => s.updateGeneralSettings);

  return (
    <div className="settings-section general-section">
      <h2 className="settings-section-title">General</h2>

      {/* Security Settings */}
      <div className="settings-group">
        <h3 className="settings-group-title">Security</h3>

        <Toggle
          label="Verify TLS certificates"
          hint="Reject servers whose certificate is invalid, expired or self-signed. Turn this off only for development servers you trust — responses sent over an unverified connection are marked in the response header."
          checked={general.verifyTls}
          onChange={(v) => updateGeneralSettings({ verifyTls: v })}
        />

        {!general.verifyTls && (
          <p className="settings-warning" role="alert">
            Certificate verification is off. Connections can be intercepted without warning.
          </p>
        )}
      </div>

      {/* Request Settings */}
      <div className="settings-group">
        <h3 className="settings-group-title">Request</h3>

        <SettingRow label="HTTP version" hint="Select the HTTP version to use for sending the request.">
          <select
            className="settings-select"
            value={general.httpVersion}
            onChange={(e) => updateGeneralSettings({ httpVersion: e.target.value as HttpVersion })}
          >
            <option value="HTTP/1.1">HTTP/1.x</option>
            <option value="HTTP/2">HTTP/2</option>
          </select>
        </SettingRow>

        <SettingRow label="Request timeout" hint="How long to wait for a response before giving up. 0 means wait indefinitely.">
          <div className="settings-input-with-unit">
            <input
              type="number"
              className="settings-number-input"
              value={general.requestTimeout}
              onChange={(e) => updateGeneralSettings({ requestTimeout: Math.max(0, parseInt(e.target.value) || 0) })}
              min={0}
            />
            <span className="settings-input-unit">ms</span>
          </div>
        </SettingRow>

        <SettingRow label="Max response size" hint="Stop downloading once a response exceeds this size. 0 means no limit.">
          <div className="settings-input-with-unit">
            <input
              type="number"
              className="settings-number-input"
              value={general.maxResponseSize}
              onChange={(e) => updateGeneralSettings({ maxResponseSize: Math.max(0, parseInt(e.target.value) || 0) })}
              min={0}
            />
            <span className="settings-input-unit">MB</span>
          </div>
        </SettingRow>

        <Toggle
          label="Response format detection"
          hint="Pick the response viewer format from the Content-Type header. When off, responses open as raw text."
          checked={general.responseFormatDetection}
          onChange={(v) => updateGeneralSettings({ responseFormatDetection: v })}
        />
      </div>

      {/* Header Settings */}
      <div className="settings-group">
        <h3 className="settings-group-title">Headers</h3>

        <Toggle
          label="Send no-cache header"
          hint="Add Cache-Control: no-cache to every request."
          checked={general.sendNoCacheHeader}
          onChange={(v) => updateGeneralSettings({ sendNoCacheHeader: v })}
        />

        <Toggle
          label="Automatically follow redirects"
          hint="Follow 3xx responses, up to ten hops."
          checked={general.autoFollowRedirects}
          onChange={(v) => updateGeneralSettings({ autoFollowRedirects: v })}
        />
      </div>
    </div>
  );
}
