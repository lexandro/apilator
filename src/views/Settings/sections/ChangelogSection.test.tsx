// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ChangelogSection, toBlocks } from './ChangelogSection';

afterEach(cleanup);

describe('toBlocks', () => {
  // The whole point: the file is hard-wrapped, the panel is not. A bullet that spans three
  // source lines has to arrive as one block, or it renders as three paragraphs with breaks
  // in places that have nothing to do with the window width.
  it('folds a hard-wrapped bullet back into one block', () => {
    const source = ['- first line of the bullet', '  second line', '  third line'].join('\n');

    expect(toBlocks(source)).toEqual(['- first line of the bullet second line third line']);
  });

  it('keeps separate bullets separate', () => {
    const source = ['- one', '  wrapped', '- two'].join('\n');

    expect(toBlocks(source)).toEqual(['- one wrapped', '- two']);
  });

  it('does not fold across a blank line', () => {
    const source = ['- one', '', '  indented after a gap'].join('\n');

    expect(toBlocks(source)).toEqual(['- one', '', 'indented after a gap']);
  });

  it('leaves headings alone', () => {
    const source = ['## [0.9.2] - 2026-08-10', '', '### Fixed'].join('\n');

    expect(toBlocks(source)).toEqual(['## [0.9.2] - 2026-08-10', '', '### Fixed']);
  });

  it('folds a wrapped paragraph too', () => {
    const source = ['Some prose that runs on', '  and continues here'].join('\n');

    expect(toBlocks(source)).toEqual(['Some prose that runs on and continues here']);
  });

  // Prose in the changelog is wrapped at column 0, not indented like a bullet's
  // continuation, so "is it indented" is not enough to decide what continues what.
  it('folds a paragraph wrapped without indentation', () => {
    const source = ['The format follows a convention and this', 'project adheres to it.'].join('\n');

    expect(toBlocks(source)).toEqual(['The format follows a convention and this project adheres to it.']);
  });

  it('does not swallow a heading that follows prose', () => {
    const source = ['Some prose.', '## [0.9.2] - 2026-08-10'].join('\n');

    expect(toBlocks(source)).toEqual(['Some prose.', '## [0.9.2] - 2026-08-10']);
  });

  it('does not swallow prose that follows a heading', () => {
    const source = ['## [0.9.2] - 2026-08-10', 'Some prose.'].join('\n');

    expect(toBlocks(source)).toEqual(['## [0.9.2] - 2026-08-10', 'Some prose.']);
  });
});

describe('ChangelogSection', () => {
  it('renders the real changelog without leaving raw markup on screen', () => {
    const { container } = render(<ChangelogSection />);
    const body = container.querySelector('.changelog-section__body');
    const text = body?.textContent ?? '';

    expect(text.length).toBeGreaterThan(0);
    expect(text).not.toContain('`');
    expect(text).not.toMatch(/\]\(http/);
  });

  it('renders code spans as code, not backticks', () => {
    const { container } = render(<ChangelogSection />);

    const codes = [...container.querySelectorAll('.changelog-section__body code')];
    expect(codes.length).toBeGreaterThan(0);
    expect(codes.some((c) => c.textContent?.includes('('))).toBe(true);
  });

  it('shows link text without an anchor that would navigate the webview away', () => {
    const { container } = render(<ChangelogSection />);

    expect(screen.getByText('Keep a Changelog')).toBeDefined();
    expect(container.querySelector('.changelog-section__body a')).toBeNull();
  });

  it('does not repeat the document title', () => {
    render(<ChangelogSection />);

    expect(screen.getAllByRole('heading', { name: 'Changelog' })).toHaveLength(1);
  });

  it('renders each bullet as a single list item', () => {
    const { container } = render(<ChangelogSection />);

    const items = [...container.querySelectorAll('.changelog-section__body li')];
    expect(items.length).toBeGreaterThan(3);
    // A folded bullet is long; a broken one would have been split into fragments.
    expect(items.some((li) => (li.textContent ?? '').length > 120)).toBe(true);
  });
});
