import type { ReactNode } from 'react';
// Inlined at build time, so what you read always matches the version you are running.
import changelog from '../../../../CHANGELOG.md?raw';

/**
 * The file is hard-wrapped at a fixed column, but the panel wraps to whatever width it has.
 * A source line break inside a bullet must not survive as a break on screen, so continuation
 * lines are folded back into the block they belong to.
 */
function startsBlock(line: string): boolean {
  return line.startsWith('#') || line.startsWith('- ');
}

export function toBlocks(source: string): string[] {
  const blocks: string[] = [];

  for (const raw of source.split('\n')) {
    const line = raw.trim();
    const previous = blocks[blocks.length - 1];
    const continues =
      Boolean(line) && Boolean(previous) && !startsBlock(line) && !previous.startsWith('#');

    if (continues) {
      blocks[blocks.length - 1] = `${previous} ${line}`;
    } else {
      blocks.push(line);
    }
  }

  return blocks;
}

const INLINE = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)]+)\)$/;

/** Handles the only inline markup the changelog uses: code spans and links. */
function renderInline(text: string): ReactNode[] {
  return text.split(INLINE).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }

    const link = LINK.exec(part);
    // Deliberately not an anchor: there is no opener plugin, so a click would navigate the
    // app's own webview away from the UI and leave no way back.
    if (link) return <span key={index} className="changelog-section__link">{link[1]}</span>;

    return part;
  });
}

function renderBlock(block: string, index: number) {
  if (block.startsWith('### ')) return <h4 key={index}>{renderInline(block.slice(4))}</h4>;
  if (block.startsWith('## ')) return <h3 key={index}>{renderInline(block.slice(3))}</h3>;
  // The section supplies its own title, so the document's H1 would just repeat it.
  if (block.startsWith('# ')) return null;
  if (block.startsWith('- ')) return <li key={index}>{renderInline(block.slice(2))}</li>;
  if (!block) return null;
  return <p key={index}>{renderInline(block)}</p>;
}

export function ChangelogSection() {
  const blocks = toBlocks(changelog);

  return (
    <div className="settings-section changelog-section">
      <h2 className="settings-section-title">Changelog</h2>
      <div className="changelog-section__body">{blocks.map(renderBlock)}</div>
    </div>
  );
}
