import type { UpdaterState } from '../../../hooks';

interface UpdatesSectionProps {
  updater: UpdaterState;
}

export function UpdatesSection({ updater }: UpdatesSectionProps) {
  const { status, update, message, progress, check, install } = updater;
  const busy = status === 'checking' || status === 'downloading';

  return (
    <div className="settings-section updates-section">
      <h2 className="settings-section-title">Updates</h2>

      <div className="settings-group">
        <p className="updates-section__state">
          {status === 'checking' && 'Checking for updates…'}
          {status === 'downloading' &&
            (progress === null ? 'Downloading…' : `Downloading… ${progress}%`)}
          {status === 'uptodate' && 'Apilator is up to date.'}
          {status === 'available' && update && `Version ${update.version} is available.`}
          {status === 'error' && `Could not check for updates: ${message}`}
          {status === 'idle' && !update && 'Apilator checks for updates in the background.'}
          {status === 'idle' && update && `Version ${update.version} is available.`}
        </p>

        {update?.notes && (
          <pre className="updates-section__notes">{update.notes}</pre>
        )}

        <div className="updates-section__actions">
          <button
            className="updates-section__button"
            onClick={() => void check(true)}
            disabled={busy}
          >
            Check now
          </button>

          {update && (
            <button
              className="updates-section__button updates-section__button--primary"
              onClick={() => void install()}
              disabled={busy}
            >
              Install and restart
            </button>
          )}
        </div>

        <p className="settings-hint">
          Updates are downloaded from GitHub releases and verified against the signing key
          built into this app. Nothing is installed without you asking.
        </p>
      </div>
    </div>
  );
}
