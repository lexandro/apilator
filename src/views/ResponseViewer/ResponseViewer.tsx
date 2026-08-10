import { useState, useRef } from 'react';
import type { RequestState, HttpResponse } from '../../domain';
import { TabGroup, TabItem, EmptyState } from '../common';
import { ResponseMeta } from './ResponseMeta';
import { ResponseHeaders } from './ResponseHeaders';
import { ResponseBody } from './ResponseBody';
import { useClickOutside } from '../../hooks/useClickOutside';
import './ResponseViewer.css';

type ResponseTab = 'body' | 'headers';

interface ResponseViewerProps {
  requestState: RequestState;
  onClear?: () => void;
  onCancel?: () => void;
  onSaveResponse?: (response: HttpResponse) => void;
}

export function ResponseViewer({
  requestState,
  onClear,
  onCancel,
  onSaveResponse,
}: ResponseViewerProps) {
  const [activeTab, setActiveTab] = useState<ResponseTab>('body');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);

  const handleSaveResponse = async () => {
    setMenuOpen(false);
    if (requestState.status !== 'success') return;

    onSaveResponse?.(requestState.response);
  };

  const handleClear = () => {
    setMenuOpen(false);
    onClear?.();
  };

  // Idle state
  if (requestState.status === 'idle') {
    return (
      <div className="response-viewer response-viewer--idle">
        <EmptyState icon="📨" message="Send a request to see the response" />
      </div>
    );
  }

  // Loading state
  if (requestState.status === 'loading') {
    return (
      <div className="response-viewer response-viewer--loading">
        <div className="response-loading">
          <span className="loading-spinner" />
          <p>Sending request...</p>
          {onCancel && (
            <button className="response-cancel-btn" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (requestState.status === 'error') {
    const { error } = requestState;
    return (
      <div className="response-viewer response-viewer--error">
        <div className="response-error">
          <span className="response-error-icon">⚠️</span>
          <p className="error-type">{error.type ?? 'error'}</p>
          <p className="error-message">{error.message}</p>
          {error.code && <p className="error-code">Code: {error.code}</p>}
        </div>
      </div>
    );
  }

  // Success state
  const { response } = requestState;
  const tabs: TabItem<ResponseTab>[] = [
    { value: 'body', label: 'Body' },
    { value: 'headers', label: `Headers (${response.headers.length})` },
  ];

  return (
    <div className="response-viewer response-viewer--success">
      <div className="response-header">
        <TabGroup
          items={tabs}
          value={activeTab}
          onChange={setActiveTab}
          className="response-tabs"
        />

        <div className="response-header__right">
          <ResponseMeta
            status={response.status}
            statusText={response.statusText}
            time={response.time}
            size={response.size}
            networkInfo={response.networkInfo}
          />
          <div className="response-menu" ref={menuRef}>
            <button
              className="response-menu__trigger"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Response options"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
            {menuOpen && (
              <div className="response-menu__dropdown">
                <button className="response-menu__item" onClick={handleClear}>
                  Clear response
                </button>
                <button className="response-menu__item" onClick={handleSaveResponse}>
                  Save response to file
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="response-tab-content">
        {activeTab === 'body' && (
          <ResponseBody
            body={response.body}
            headers={response.headers}
            bodyEncoding={response.bodyEncoding}
            truncated={response.truncated}
          />
        )}
        {activeTab === 'headers' && (
          <ResponseHeaders headers={response.headers} />
        )}
      </div>
    </div>
  );
}
