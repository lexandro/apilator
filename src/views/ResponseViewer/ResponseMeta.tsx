import type { NetworkInfo } from '../../domain';
import './ResponseMeta.css';

interface ResponseMetaProps {
  status: number;
  statusText: string;
  time: number;
  size: number;
  networkInfo?: NetworkInfo;
}

function getStatusClass(status: number): string {
  if (status >= 200 && status < 300) return 'status-2xx';
  if (status >= 300 && status < 400) return 'status-3xx';
  if (status >= 400 && status < 500) return 'status-4xx';
  return 'status-5xx';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ResponseMeta({ status, statusText, time, size, networkInfo }: ResponseMetaProps) {
  return (
    <div className="response-meta">
      <span className={`response-status ${getStatusClass(status)}`}>
        {status} {statusText}
      </span>
      <span className="response-time">{time} ms</span>
      <span className="response-size">{formatSize(size)}</span>
      {networkInfo && networkInfo.tlsVerified === false && (
        <span
          className="response-tls-warning"
          title="TLS certificate verification is turned off, so this connection was not authenticated."
        >
          ⚠ unverified TLS
        </span>
      )}
      {networkInfo && (
        <span className="network-info">
          <span className="network-info__icon">🌐</span>
          <div className="network-tooltip">
            <div className="network-tooltip__row">
              <span className="network-tooltip__label">HTTP Version:</span>
              <span className="network-tooltip__value">{networkInfo.httpVersion}</span>
            </div>
            <div className="network-tooltip__row">
              <span className="network-tooltip__label">Remote Address:</span>
              <span className="network-tooltip__value">{networkInfo.remoteAddr ?? 'N/A'}</span>
            </div>
            <div className="network-tooltip__row">
              <span className="network-tooltip__label">TLS verified:</span>
              <span className="network-tooltip__value">
                {networkInfo.tlsVerified ? 'yes' : 'no'}
              </span>
            </div>
          </div>
        </span>
      )}
    </div>
  );
}
