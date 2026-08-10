import type { RequestBody, BodyType, RawFormat, KeyValuePair, FormDataEntry } from '../../domain';
import { useFilePicker } from '../../hooks';
import { FormDataEditor, KeyValueEditor, TabGroup, TabItem } from '../common';
import './BodyEditor.css';

const BODY_TYPES: TabItem<BodyType>[] = [
  { value: 'none', label: 'None' },
  { value: 'raw', label: 'Raw' },
  { value: 'form-data', label: 'Form Data' },
  { value: 'x-www-form-urlencoded', label: 'URL Encoded' },
];

const RAW_FORMATS: TabItem<RawFormat>[] = [
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'text', label: 'Text' },
  { value: 'html', label: 'HTML' },
];

interface BodyEditorProps {
  body: RequestBody;
  onChange: (body: RequestBody) => void;
}

export function BodyEditor({ body, onChange }: BodyEditorProps) {
  const handleTypeChange = (type: BodyType) => {
    onChange({ ...body, type });
  };

  const handleRawContentChange = (content: string) => {
    onChange({
      ...body,
      raw: { ...body.raw, content },
    });
  };

  const handleRawFormatChange = (format: RawFormat) => {
    onChange({
      ...body,
      raw: { ...body.raw, format },
    });
  };

  const pickFile = useFilePicker();

  const handleFormDataChange = (formData: FormDataEntry[]) => {
    onChange({ ...body, formData });
  };

  const handleUrlencodedChange = (urlencoded: KeyValuePair[]) => {
    onChange({ ...body, urlencoded });
  };

  return (
    <div className="body-editor">
      <TabGroup
        items={BODY_TYPES}
        value={body.type}
        onChange={handleTypeChange}
        className="body-type-tabs"
      />

      <div className="body-content">
        {body.type === 'none' && (
          <div className="body-none-message">
            This request does not have a body
          </div>
        )}

        {body.type === 'raw' && (
          <div className="body-raw">
            <TabGroup
              items={RAW_FORMATS}
              value={body.raw.format}
              onChange={handleRawFormatChange}
              className="raw-format-selector"
              variant="pills"
            />
            <textarea
              className="raw-content-input"
              value={body.raw.content}
              onChange={(e) => handleRawContentChange(e.target.value)}
              placeholder={`Enter ${body.raw.format.toUpperCase()} content...`}
              spellCheck={false}
            />
          </div>
        )}

        {body.type === 'form-data' && (
          <FormDataEditor
            items={body.formData}
            onChange={handleFormDataChange}
            onPickFile={pickFile}
          />
        )}

        {body.type === 'x-www-form-urlencoded' && (
          <KeyValueEditor
            items={body.urlencoded}
            onChange={handleUrlencodedChange}
            keyPlaceholder="Key"
            valuePlaceholder="Value"
          />
        )}
      </div>
    </div>
  );
}
