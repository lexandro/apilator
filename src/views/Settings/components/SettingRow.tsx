import { ReactNode } from 'react';

interface SettingRowProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function SettingRow({ label, hint, children }: SettingRowProps) {
  return (
    <div className="settings-setting-row">
      <div className="settings-setting-info">
        <span className="settings-setting-label">{label}</span>
        {hint && <span className="settings-setting-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}
