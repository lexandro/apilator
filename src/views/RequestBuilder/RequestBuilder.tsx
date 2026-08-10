import { useState } from 'react';
import type { HttpRequest, HttpMethod, KeyValuePair, RequestBody, AuthConfig } from '../../domain';
import { TabGroup, TabItem } from '../common';
import { UrlBar } from './UrlBar';
import { HeadersEditor } from './HeadersEditor';
import { BodyEditor } from './BodyEditor';
import { AuthEditor } from './AuthEditor';
import './RequestBuilder.css';

type RequestTab = 'params' | 'auth' | 'headers' | 'body';

interface RequestBuilderProps {
  request: HttpRequest;
  onChange: (request: HttpRequest) => void;
  onSend: () => void;
  onSendAndDownload: () => void;
  onSave?: () => void;
  isLoading?: boolean;
}

export function RequestBuilder({
  request,
  onChange,
  onSend,
  onSendAndDownload,
  onSave,
  isLoading,
}: RequestBuilderProps) {
  const [activeTab, setActiveTab] = useState<RequestTab>('headers');

  const handleMethodChange = (method: HttpMethod) => {
    onChange({ ...request, method });
  };

  const handleUrlChange = (url: string) => {
    onChange({ ...request, url });
  };

  const handleHeadersChange = (headers: KeyValuePair[]) => {
    onChange({ ...request, headers });
  };

  const handleBodyChange = (body: RequestBody) => {
    onChange({ ...request, body });
  };

  const handleParamsChange = (params: KeyValuePair[]) => {
    onChange({ ...request, params });
  };

  const handleAuthChange = (auth: AuthConfig) => {
    onChange({ ...request, auth });
  };

  const getAuthLabel = (): string | undefined => {
    if (!request.auth || request.auth.type === 'none') return undefined;
    switch (request.auth.type) {
      case 'basic': return 'Basic';
      case 'bearer': return 'Bearer';
      case 'jwt': return 'JWT';
      default: return undefined;
    }
  };

  const tabs: TabItem<RequestTab>[] = [
    { value: 'params', label: 'Params', count: request.params.filter(p => p.enabled && p.key).length },
    { value: 'auth', label: 'Auth', badge: getAuthLabel() },
    { value: 'headers', label: 'Headers', count: request.headers.filter(h => h.enabled && h.key).length },
    { value: 'body', label: 'Body' },
  ];

  return (
    <div className="request-builder">
      <UrlBar
        method={request.method}
        url={request.url}
        onMethodChange={handleMethodChange}
        onUrlChange={handleUrlChange}
        onSend={onSend}
        onSendAndDownload={onSendAndDownload}
        onSave={onSave}
        isLoading={isLoading}
      />

      <TabGroup
        items={tabs}
        value={activeTab}
        onChange={setActiveTab}
        className="request-tabs"
      />

      <div className="request-tab-content">
        {activeTab === 'params' && (
          <div className="params-editor">
            <HeadersEditor
              headers={request.params}
              onChange={handleParamsChange}
            />
          </div>
        )}

        {activeTab === 'auth' && (
          <AuthEditor
            auth={request.auth}
            onChange={handleAuthChange}
          />
        )}

        {activeTab === 'headers' && (
          <HeadersEditor
            headers={request.headers}
            onChange={handleHeadersChange}
            auth={request.auth}
            url={request.url}
          />
        )}

        {activeTab === 'body' && (
          <BodyEditor
            body={request.body}
            onChange={handleBodyChange}
          />
        )}
      </div>
    </div>
  );
}
