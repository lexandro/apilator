// Inlined at build time, so what you read always matches the version you are running.
import changelog from '../../../../CHANGELOG.md?raw';

/** Minimal renderer: the changelog only uses headings, lists, links and inline code. */
function renderLine(line: string, index: number) {
  if (line.startsWith('### ')) return <h4 key={index}>{line.slice(4)}</h4>;
  if (line.startsWith('## ')) return <h3 key={index}>{line.slice(3)}</h3>;
  // The section supplies its own title, so the document's H1 would just repeat it.
  if (line.startsWith('# ')) return null;
  if (line.startsWith('- ')) return <li key={index}>{line.slice(2)}</li>;
  if (!line.trim()) return null;
  return <p key={index}>{line}</p>;
}

export function ChangelogSection() {
  const lines = changelog.split('\n');

  return (
    <div className="settings-section changelog-section">
      <h2 className="settings-section-title">Changelog</h2>
      <div className="changelog-section__body">{lines.map(renderLine)}</div>
    </div>
  );
}
