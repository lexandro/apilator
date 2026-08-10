// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SettingsModal } from './SettingsModal';
import type { UpdaterState } from '../../hooks';

afterEach(cleanup);

const SECTIONS = ['General', 'Themes', 'Proxy', 'Updates', 'Changelog', 'About'];

function stubUpdater(overrides: Partial<UpdaterState> = {}): UpdaterState {
  return {
    status: 'idle',
    update: null,
    message: '',
    progress: null,
    dismissed: false,
    check: vi.fn().mockResolvedValue(undefined),
    install: vi.fn().mockResolvedValue(undefined),
    dismiss: vi.fn(),
    ...overrides,
  };
}

function setup(props: Partial<Parameters<typeof SettingsModal>[0]> = {}) {
  const onClose = vi.fn();
  const { container } = render(
    <SettingsModal isOpen onClose={onClose} updater={stubUpdater()} {...props} />
  );
  return { onClose, container, user: userEvent.setup() };
}

describe('SettingsModal', () => {
  it('renders closed as nothing', () => {
    const onClose = vi.fn();
    const { container } = render(
      <SettingsModal isOpen={false} onClose={onClose} updater={stubUpdater()} />
    );

    expect(container.firstChild).toBeNull();
  });

  it('opens on General', () => {
    setup();

    expect(screen.getByRole('heading', { name: 'General' })).toBeDefined();
  });

  // Every section has to survive being rendered and stay rendered. Reaching any of them
  // used to spin React until it bailed out and unmounted the tree, leaving a blank window.
  it.each(SECTIONS)('renders the %s section and keeps it on screen', async (label) => {
    const { container, user } = setup();

    await user.click(screen.getByRole('button', { name: label }));

    const section = container.querySelector('.settings-section');
    expect(section).not.toBeNull();
    expect(section?.textContent?.trim()).not.toBe('');
  });

  it('opens straight into the section it was asked for', () => {
    setup({ initialSection: 'updates' });

    expect(screen.getByRole('heading', { name: 'Updates' })).toBeDefined();
  });

  // The modal stays mounted and only switches section from an effect, so opening it from
  // the update banner renders General for one pass first. That single pass was enough to
  // take the window down, which is why the update prompt looked like it killed the app.
  it('survives being opened into Updates from closed', () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <SettingsModal isOpen={false} onClose={onClose} updater={stubUpdater()} />
    );

    rerender(
      <SettingsModal isOpen onClose={onClose} updater={stubUpdater()} initialSection="updates" />
    );

    expect(screen.getByRole('heading', { name: 'Updates' })).toBeDefined();
  });

  it('shows the running version in About', () => {
    setup({ initialSection: 'about' });

    expect(screen.getByText('Version')).toBeDefined();
    expect(screen.getByText('Apilator')).toBeDefined();
  });

  it('does not repeat the Changelog title from the document itself', () => {
    setup({ initialSection: 'changelog' });

    expect(screen.getAllByRole('heading', { name: 'Changelog' })).toHaveLength(1);
  });

  it('closes on Escape', async () => {
    const { onClose, user } = setup();

    await user.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });
});
