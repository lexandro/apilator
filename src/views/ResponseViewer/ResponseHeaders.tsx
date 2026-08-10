import type { KeyValuePair } from '../../domain';
import { EmptyState } from '../common';
import './ResponseHeaders.css';

interface ResponseHeadersProps {
  headers: KeyValuePair[];
}

export function ResponseHeaders({ headers }: ResponseHeadersProps) {
  if (headers.length === 0) {
    return <EmptyState message="No headers received" className="response-headers-empty" />;
  }

  return (
    <div className="response-headers">
      <table className="headers-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Value</th>
          </tr>
        </thead>
        <tbody>
          {headers.map((header) => (
            <tr key={header.id}>
              <td className="header-name">{header.key}</td>
              <td className="header-value">{header.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
