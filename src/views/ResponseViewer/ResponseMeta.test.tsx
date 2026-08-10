// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ResponseMeta } from './ResponseMeta';
import type { NetworkInfo } from '../../domain';

afterEach(cleanup);

const verified: NetworkInfo = {
  httpVersion: 'HTTP/2',
  remoteAddr: '93.184.216.34:443',
  tlsVerified: true,
};

/**
 * networkInfo is nullable rather than optional here on purpose: passing `undefined` to a
 * defaulted parameter would silently fall back to the default and test nothing.
 */
function renderMeta(status = 200, networkInfo: NetworkInfo | null = verified, size = 1024) {
  render(
    <ResponseMeta
      status={status}
      statusText="OK"
      time={42}
      size={size}
      networkInfo={networkInfo ?? undefined}
    />
  );
}

describe('status', () => {
  it('shows the code and reason', () => {
    renderMeta();
    expect(screen.getByText('200 OK')).toBeDefined();
  });

  it.each([
    [200, 'status-2xx'],
    [301, 'status-3xx'],
    [404, 'status-4xx'],
    [500, 'status-5xx'],
  ])('classifies %i as %s', (status, expected) => {
    renderMeta(status);
    expect(document.querySelector(`.${expected}`)).not.toBeNull();
  });
});

describe('size formatting', () => {
  it.each([
    [512, '512 B'],
    [2048, '2.0 KB'],
    [5 * 1024 * 1024, '5.00 MB'],
  ])('renders %i bytes as %s', (bytes, expected) => {
    renderMeta(200, verified, bytes);
    expect(screen.getByText(expected)).toBeDefined();
  });
});

// B1: an unverified connection must be visible, not buried in a tooltip.
describe('TLS verification badge', () => {
  it('is absent when the certificate was verified', () => {
    renderMeta();
    expect(screen.queryByText(/unverified TLS/)).toBeNull();
  });

  it('is shown when verification was off', () => {
    renderMeta(200, { ...verified, tlsVerified: false });
    expect(screen.getByText(/unverified TLS/)).toBeDefined();
  });

  it('reports the verification state in the tooltip either way', () => {
    renderMeta();
    expect(screen.getByText('yes')).toBeDefined();

    cleanup();
    renderMeta(200, { ...verified, tlsVerified: false });
    expect(screen.getByText('no')).toBeDefined();
  });

  it('shows nothing network related without network info', () => {
    renderMeta(200, null);
    expect(screen.queryByText(/unverified TLS/)).toBeNull();
    expect(screen.queryByText('HTTP Version:')).toBeNull();
  });

  it('falls back to N/A for a missing remote address', () => {
    renderMeta(200, { ...verified, remoteAddr: null });
    expect(screen.getByText('N/A')).toBeDefined();
  });
});
