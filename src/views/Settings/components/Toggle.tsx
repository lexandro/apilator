interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  hint?: string;
  className?: string;
}

export function Toggle({ checked, onChange, label, hint, className = '' }: ToggleProps) {
  return (
    <div className={`settings-toggle-row ${className}`}>
      <div className="settings-toggle-info">
        <span className="settings-toggle-label">{label}</span>
        {hint && <span className="settings-toggle-hint">{hint}</span>}
      </div>
      <label className="settings-toggle">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="settings-toggle-slider" />
      </label>
    </div>
  );
}
