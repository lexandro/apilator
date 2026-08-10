import { THEMES, type ThemeId } from '../../../domain';

const themePreviewColors: Record<ThemeId, { bg: string; secondary: string; text: string; accent: string }> = {
  'light': { bg: '#ffffff', secondary: '#f5f5f5', text: '#1a1a1a', accent: '#7c3aed' },
  'dark': { bg: '#1a1a2e', secondary: '#16213e', text: '#e8e8e8', accent: '#7c3aed' },
  'solarized-light': { bg: '#fdf6e3', secondary: '#eee8d5', text: '#657b83', accent: '#268bd2' },
  'solarized-dark': { bg: '#002b36', secondary: '#073642', text: '#839496', accent: '#268bd2' },
};

interface ThemePreviewProps {
  themeId: ThemeId;
  isSelected: boolean;
  onClick: () => void;
}

export function ThemePreview({ themeId, isSelected, onClick }: ThemePreviewProps) {
  const theme = THEMES.find(t => t.id === themeId)!;
  const colors = themePreviewColors[themeId];

  return (
    <div className={`theme-card ${isSelected ? 'selected' : ''}`} onClick={onClick}>
      <div className="theme-preview" style={{ backgroundColor: colors.bg }}>
        <div className="preview-titlebar" style={{ backgroundColor: colors.secondary }}>
          <div className="preview-tabs">
            <div className="preview-tab" style={{ backgroundColor: colors.bg }} />
            <div className="preview-tab-inactive" style={{ backgroundColor: colors.secondary, border: `1px solid ${colors.text}30` }} />
          </div>
          <div className="preview-dots">
            <span style={{ backgroundColor: '#ef4444' }} />
            <span style={{ backgroundColor: '#f59e0b' }} />
          </div>
        </div>
        <div className="preview-content">
          <div className="preview-sidebar" style={{ backgroundColor: colors.secondary }}>
            <div className="preview-line short" style={{ backgroundColor: colors.text + '40' }} />
            <div className="preview-line" style={{ backgroundColor: colors.text + '30' }} />
            <div className="preview-line" style={{ backgroundColor: colors.text + '30' }} />
          </div>
          <div className="preview-main">
            <div className="preview-url-bar" style={{ backgroundColor: colors.secondary }}>
              <div className="preview-line flex-1" style={{ backgroundColor: colors.text + '30' }} />
              <div className="preview-button" style={{ backgroundColor: colors.accent }} />
            </div>
            <div className="preview-tags">
              <div className="preview-tag" style={{ backgroundColor: colors.text + '30' }} />
              <div className="preview-tag" style={{ backgroundColor: colors.text + '30' }} />
              <div className="preview-tag" style={{ backgroundColor: colors.accent + '40' }} />
            </div>
          </div>
        </div>
      </div>
      <div className="theme-card-footer">
        <div className={`theme-radio ${isSelected ? 'checked' : ''}`}>
          {isSelected && <div className="theme-radio-dot" />}
        </div>
        <span className="theme-name">{theme.name}</span>
      </div>
    </div>
  );
}
