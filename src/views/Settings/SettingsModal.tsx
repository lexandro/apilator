import { useState, useEffect, useCallback } from 'react';
import { SettingsIcon, ThemesIcon, ProxyIcon, AboutIcon, CloseIcon } from './icons';
import type { UpdaterState } from '../../hooks';
import { GeneralSection } from './sections/GeneralSection';
import { ThemesSection } from './sections/ThemesSection';
import { ProxySection } from './sections/ProxySection';
import { AboutSection } from './sections/AboutSection';
import { UpdatesSection } from './sections/UpdatesSection';
import { ChangelogSection } from './sections/ChangelogSection';
import './SettingsModal.css';

type SettingsSection = 'general' | 'themes' | 'proxy' | 'updates' | 'changelog' | 'about';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  updater: UpdaterState;
  initialSection?: SettingsSection;
}

const sidebarItems = [
  { id: 'general' as const, label: 'General', icon: <SettingsIcon /> },
  { id: 'themes' as const, label: 'Themes', icon: <ThemesIcon /> },
  { id: 'proxy' as const, label: 'Proxy', icon: <ProxyIcon /> },
  { id: 'updates' as const, label: 'Updates', icon: <AboutIcon /> },
  { id: 'changelog' as const, label: 'Changelog', icon: <AboutIcon /> },
  { id: 'about' as const, label: 'About', icon: <AboutIcon /> },
];

export function SettingsModal({
  isOpen,
  onClose,
  updater,
  initialSection = 'general',
}: SettingsModalProps) {
  const [activeSection, setActiveSection] = useState<SettingsSection>(initialSection);

  // Opening straight into a section (from the update banner) must actually land there.
  useEffect(() => {
    if (isOpen) setActiveSection(initialSection);
  }, [isOpen, initialSection]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose]
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return <GeneralSection />;
      case 'themes': return <ThemesSection />;
      case 'proxy': return <ProxySection />;
      case 'updates': return <UpdatesSection updater={updater} />;
      case 'changelog': return <ChangelogSection />;
      case 'about': return <AboutSection />;
    }
  };

  return (
    <div className="settings-modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-sidebar">
          <nav className="settings-nav">
            {sidebarItems.map((item) => (
              <button
                key={item.id}
                className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
                onClick={() => setActiveSection(item.id)}
              >
                <span className="settings-nav-icon">{item.icon}</span>
                <span className="settings-nav-label">{item.label}</span>
              </button>
            ))}
          </nav>
        </div>
        <div className="settings-content">
          <button className="settings-modal-close" onClick={onClose} title="Close">
            <CloseIcon />
          </button>
          <div className="settings-content-inner">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
}
