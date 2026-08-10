// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary } from './ErrorBoundary';

beforeEach(() => {
  // React prints the caught error itself; that noise is not the test's business.
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Boom({ throws }: { throws: boolean }) {
  if (throws) throw new Error('the section exploded');
  return <p>section content</p>;
}

describe('ErrorBoundary', () => {
  it('renders its children when nothing goes wrong', () => {
    render(
      <ErrorBoundary>
        <Boom throws={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('section content')).toBeDefined();
  });

  it('shows the failure instead of unmounting the tree', () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('the section exploded')).toBeDefined();
  });

  it('names the part that failed when given a label', () => {
    render(
      <ErrorBoundary label="Settings could not load">
        <Boom throws />
      </ErrorBoundary>
    );

    expect(screen.getByText('Settings could not load')).toBeDefined();
  });

  it('offers the stack without putting it in the way', () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );

    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
  });

  it('recovers when Try again is pressed and the cause is gone', async () => {
    const user = userEvent.setup();
    // A component that threw never runs its effects, so the flag has to live outside it.
    let failing = true;

    function Flaky() {
      return <Boom throws={failing} />;
    }

    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeDefined();

    failing = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(screen.getByText('section content')).toBeDefined();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('hands the error to a custom fallback when one is given', () => {
    render(
      <ErrorBoundary fallback={(error) => <span>caught: {error.message}</span>}>
        <Boom throws />
      </ErrorBoundary>
    );

    expect(screen.getByText(/caught: the section exploded/)).toBeDefined();
  });

  it('logs the failure so it is not lost', () => {
    render(
      <ErrorBoundary>
        <Boom throws />
      </ErrorBoundary>
    );

    expect(console.error).toHaveBeenCalled();
  });
});
