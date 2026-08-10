import { useState } from 'react';
import { useAppInfo } from '../../../hooks';
import { CopyIcon, CheckIcon } from '../icons';

export function AboutSection() {
  const info = useAppInfo();
  const [copySuccess, setCopySuccess] = useState(false);

  const appVersion = info?.appVersion ?? '';
  const tauriVersion = info?.tauriVersion ?? '';
  const architecture = info?.architecture ?? '';
  const systemInfo = info?.system ?? null;

  const formatBuildTime = (isoString: string): string => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString('hu-HU', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return isoString;
    }
  };

  const handleCopyDebugInfo = async () => {
    const debugInfo = [
      'Apilator Debug Info',
      '==================',
      `Version: ${appVersion}`,
      `Build: ${__GIT_HASH__}`,
      `Build time: ${__BUILD_TIME__}`,
      `Platform: ${systemInfo?.osName || 'Unknown'} ${architecture}`,
      `OS: ${systemInfo?.osName || 'Unknown'} ${systemInfo?.osVersion || ''}`,
      `Tauri: ${tauriVersion}`,
    ].join('\n');

    try {
      await navigator.clipboard.writeText(debugInfo);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Failed to copy debug info:', error);
    }
  };

  return (
    <div className="settings-section about-section">
      <div className="about-header">
        <img src="/icon.png" alt="Apilator" className="about-logo-img" />
        <div className="about-title">
          <h1 className="about-app-name">Apilator</h1>
          <p className="about-tagline">RESTful API Tester</p>
        </div>
      </div>

      <div className="about-info-group">
        <InfoRow label="Version" value={appVersion || '...'} />
        <InfoRow label="Build" value={__GIT_HASH__} mono />
        <InfoRow label="Build time" value={formatBuildTime(__BUILD_TIME__)} />
      </div>

      <div className="about-info-group">
        <InfoRow label="Platform" value={`${systemInfo?.osName || '...'} ${architecture}`} />
        <InfoRow label="OS" value={systemInfo ? `${systemInfo.osName} (${systemInfo.osVersion})` : '...'} />
        <InfoRow label="Tauri" value={tauriVersion || '...'} />
      </div>

      <div className="about-info-group">
        {/* Plain text, not a link: there is no opener plugin, so an anchor would
            navigate the app's own webview away from the UI. */}
        <InfoRow label="GitHub" value="github.com/lexandro/apilator" />
        <InfoRow label="License" value="MIT" />
      </div>

      <div className="about-actions">
        <button className="about-copy-button" onClick={handleCopyDebugInfo}>
          {copySuccess ? <><CheckIcon /> Copied!</> : <><CopyIcon /> Copy debug info</>}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="about-info-row">
      <span className="about-info-label">{label}</span>
      <span className={`about-info-value ${mono ? 'about-mono' : ''}`}>{value}</span>
    </div>
  );
}
