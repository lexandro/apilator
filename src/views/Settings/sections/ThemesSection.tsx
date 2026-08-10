import { useSettingsStore } from '../../../stores';
import { THEMES, type ThemeId } from '../../../domain';
import { ThemePreview } from '../components/ThemePreview';
import { SunIcon, MoonIcon } from '../icons';

export function ThemesSection() {
  const theme = useSettingsStore((s) => s.theme);
  const setThemeMode = useSettingsStore((s) => s.setThemeMode);
  const setManualTheme = useSettingsStore((s) => s.setManualTheme);
  const setDayTheme = useSettingsStore((s) => s.setDayTheme);
  const setNightTheme = useSettingsStore((s) => s.setNightTheme);

  return (
    <div className="settings-section">
      <h2 className="settings-section-title">Themes</h2>
      <p className="settings-section-description">
        Personalize your experience with themes that match your style. Manually select a theme
        or sync with system settings and let the machine set your day and night themes.
      </p>

      <div className="theme-mode-selector">
        <span className="theme-mode-label">Theme selection</span>
        <div className="theme-mode-options">
          <label className="theme-mode-option">
            <input
              type="radio"
              name="themeMode"
              checked={theme.mode === 'system'}
              onChange={() => setThemeMode('system')}
            />
            <span>Sync with system</span>
          </label>
          <label className="theme-mode-option">
            <input
              type="radio"
              name="themeMode"
              checked={theme.mode === 'manual'}
              onChange={() => setThemeMode('manual')}
            />
            <span>Manual</span>
          </label>
        </div>
      </div>

      <div className="theme-mode-divider" />

      {theme.mode === 'manual' ? (
        <div className="theme-grid">
          {THEMES.map(t => (
            <ThemePreview
              key={t.id}
              themeId={t.id}
              isSelected={theme.manualTheme === t.id}
              onClick={() => setManualTheme(t.id)}
            />
          ))}
        </div>
      ) : (
        <div className="theme-system-settings">
          <div className="theme-system-row">
            <div className="theme-system-info">
              <span className="theme-system-icon"><SunIcon /></span>
              <span className="theme-system-label">Day theme</span>
            </div>
            <select
              className="theme-select"
              value={theme.dayTheme}
              onChange={(e) => setDayTheme(e.target.value as ThemeId)}
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="theme-system-row">
            <div className="theme-system-info">
              <span className="theme-system-icon"><MoonIcon /></span>
              <span className="theme-system-label">Night theme</span>
            </div>
            <select
              className="theme-select"
              value={theme.nightTheme}
              onChange={(e) => setNightTheme(e.target.value as ThemeId)}
            >
              {THEMES.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
