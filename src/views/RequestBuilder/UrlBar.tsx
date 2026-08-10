import type { HttpMethod } from '../../domain';
import { Input, SplitButton } from '../common';
import { MethodSelector } from './MethodSelector';
import './UrlBar.css';

// Download icon SVG component
const DownloadIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 2v8m0 0L5 7m3 3l3-3M3 12v1a1 1 0 001 1h8a1 1 0 001-1v-1"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

interface UrlBarProps {
  method: HttpMethod;
  url: string;
  onMethodChange: (method: HttpMethod) => void;
  onUrlChange: (url: string) => void;
  onSend: () => void;
  onSendAndDownload: () => void;
  onSave?: () => void;
  isLoading?: boolean;
}

export function UrlBar({
  method,
  url,
  onMethodChange,
  onUrlChange,
  onSend,
  onSendAndDownload,
  onSave,
  isLoading,
}: UrlBarProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isLoading) {
      onSend();
    }
  };

  const isDisabled = isLoading || !url.trim();

  return (
    <div className="url-bar">
      <MethodSelector
        value={method}
        onChange={onMethodChange}
        disabled={isLoading}
      />
      <Input
        className="url-input"
        type="url"
        value={url}
        onChange={(e) => onUrlChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Enter request URL"
        disabled={isLoading}
      />
      {onSave && (
        <button
          type="button"
          className="url-bar__save"
          onClick={onSave}
          title="Save this request to a collection"
        >
          Save
        </button>
      )}
      <SplitButton
        className="send-button"
        label={isLoading ? 'Sending...' : 'Send'}
        onClick={onSend}
        disabled={isDisabled}
        isLoading={isLoading}
        options={[
          {
            label: 'Send and Download',
            icon: <DownloadIcon />,
            onClick: onSendAndDownload,
          },
        ]}
      />
    </div>
  );
}
