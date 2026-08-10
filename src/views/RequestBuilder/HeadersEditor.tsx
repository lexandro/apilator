import { useState, useMemo } from 'react';
import type { KeyValuePair, AuthConfig } from '../../domain';
import { computeAuthHeader } from '../../domain';
import { KeyValueEditor } from '../common';
import './HeadersEditor.css';

// Default header keys that are auto-generated
const AUTO_HEADER_KEYS = ['user-agent', 'accept', 'accept-encoding', 'connection'];

interface HeadersEditorProps {
  headers: KeyValuePair[];
  onChange: (headers: KeyValuePair[]) => void;
  auth?: AuthConfig;
  url?: string;
}

function getHostFromUrl(url: string): string | null {
  if (!url.trim()) return null;
  try {
    const urlWithProtocol = url.includes('://') ? url : `https://${url}`;
    const parsed = new URL(urlWithProtocol);
    return parsed.host || null;
  } catch {
    return null;
  }
}

export function HeadersEditor({ headers, onChange, auth, url }: HeadersEditorProps) {
  const [showAutoHeaders, setShowAutoHeaders] = useState(false);

  const authHeader = auth ? computeAuthHeader(auth) : null;
  const hostHeader = url ? getHostFromUrl(url) : null;

  // Identify which headers are auto-generated (for badge display)
  const autoHeaderIds = useMemo(() => {
    const ids = new Set<string>();
    for (const header of headers) {
      if (AUTO_HEADER_KEYS.includes(header.key.toLowerCase())) {
        ids.add(header.id);
      }
    }
    return ids;
  }, [headers]);

  // Filter headers based on showAutoHeaders toggle
  const visibleHeaders = useMemo(() => {
    if (showAutoHeaders) {
      return headers;
    }
    return headers.filter(h => !autoHeaderIds.has(h.id));
  }, [headers, autoHeaderIds, showAutoHeaders]);

  const hasAutoHeaders = hostHeader || authHeader || autoHeaderIds.size > 0;

  return (
    <div className="headers-editor">
      {hasAutoHeaders && (
        <button
          className="auto-headers-toggle"
          onClick={() => setShowAutoHeaders(!showAutoHeaders)}
        >
          <svg className="auto-headers-toggle__icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            {showAutoHeaders ? (
              <>
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </>
            ) : (
              <>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </>
            )}
          </svg>
          {showAutoHeaders ? 'Hide' : 'Show'} auto-generated headers
        </button>
      )}
      {showAutoHeaders && (
        <>
          {hostHeader && (
            <div className="auto-header-readonly">
              <span className="auto-header-readonly__key">Host</span>
              <span className="auto-header-readonly__value" title={hostHeader}>
                {hostHeader}
              </span>
              <span className="auto-header-readonly__badge">auto</span>
            </div>
          )}
          {authHeader && (
            <div className="auto-header-readonly">
              <span className="auto-header-readonly__key">Authorization</span>
              <span className="auto-header-readonly__value" title={authHeader}>
                {authHeader}
              </span>
              <span className="auto-header-readonly__badge">from Auth</span>
            </div>
          )}
        </>
      )}
      <KeyValueEditor
        items={visibleHeaders}
        onChange={onChange}
        keyPlaceholder="Header name"
        valuePlaceholder="Header value"
        badgeItems={autoHeaderIds}
        badgeText="default"
      />
    </div>
  );
}
