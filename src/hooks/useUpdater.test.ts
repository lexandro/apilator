// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

vi.mock('../services/updaterService', () => ({
  updaterService: {
    checkForUpdate: vi.fn(),
    installUpdate: vi.fn(),
    hasPendingUpdate: vi.fn(),
  },
}));

import { useUpdater } from './useUpdater';
import { updaterService } from '../services';

const checkForUpdate = vi.mocked(updaterService.checkForUpdate);
const installUpdate = vi.mocked(updaterService.installUpdate);
const hasPendingUpdate = vi.mocked(updaterService.hasPendingUpdate);

const OFFERED = { version: '1.2.3', notes: 'Fixed things', date: null };

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  checkForUpdate.mockReset().mockResolvedValue(null);
  installUpdate.mockReset().mockResolvedValue(undefined);
  hasPendingUpdate.mockReset().mockReturnValue(false);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('checking', () => {
  it('starts idle and does not check immediately', () => {
    const { result } = renderHook(() => useUpdater(false));

    expect(result.current.status).toBe('idle');
    expect(checkForUpdate).not.toHaveBeenCalled();
  });

  it('reports an offered update', async () => {
    checkForUpdate.mockResolvedValue(OFFERED);
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(true);
    });

    expect(result.current.status).toBe('available');
    expect(result.current.update).toEqual(OFFERED);
  });

  it('says up to date after a manual check that found nothing', async () => {
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(true);
    });

    expect(result.current.status).toBe('uptodate');
  });

  // A background check that finds nothing must not put anything on screen.
  it('stays silent after an automatic check that found nothing', async () => {
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(false);
    });

    expect(result.current.status).toBe('idle');
  });

  it('surfaces an error from a manual check', async () => {
    checkForUpdate.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(true);
    });

    expect(result.current.status).toBe('error');
    expect(result.current.message).toBe('network down');
  });

  it('swallows an error from an automatic check', async () => {
    checkForUpdate.mockRejectedValue(new Error('network down'));
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(false);
    });

    expect(result.current.status).toBe('idle');
  });

  it('does not start a second check while one is running', async () => {
    let release!: () => void;
    checkForUpdate.mockImplementation(
      () => new Promise((resolve) => (release = () => resolve(null)))
    );

    const { result } = renderHook(() => useUpdater(false));

    let first!: Promise<void>;
    act(() => {
      first = result.current.check(true);
    });
    await act(async () => {
      await result.current.check(true);
    });

    expect(checkForUpdate).toHaveBeenCalledTimes(1);

    await act(async () => {
      release();
      await first;
    });
  });
});

describe('automatic checking', () => {
  it('checks shortly after mounting', async () => {
    renderHook(() => useUpdater(true));
    expect(checkForUpdate).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('keeps checking periodically', async () => {
    renderHook(() => useUpdater(true));

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    await act(async () => {
      vi.advanceTimersByTime(6 * 60 * 60 * 1000);
    });

    expect(checkForUpdate).toHaveBeenCalledTimes(2);
  });

  it('stops checking once unmounted', async () => {
    const hook = renderHook(() => useUpdater(true));
    hook.unmount();

    await act(async () => {
      vi.advanceTimersByTime(6 * 60 * 60 * 1000 * 2);
    });

    expect(checkForUpdate).not.toHaveBeenCalled();
  });
});

describe('installing', () => {
  it('does nothing when no update was offered', async () => {
    hasPendingUpdate.mockReturnValue(false);
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.install();
    });

    expect(installUpdate).not.toHaveBeenCalled();
  });

  it('installs the offered update', async () => {
    hasPendingUpdate.mockReturnValue(true);
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.install();
    });

    expect(installUpdate).toHaveBeenCalled();
  });

  it('reports download progress as a percentage', async () => {
    hasPendingUpdate.mockReturnValue(true);
    installUpdate.mockImplementation(async (onProgress) => {
      onProgress?.(50, 200);
    });

    const { result } = renderHook(() => useUpdater(false));
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.progress).toBe(25);
  });

  it('leaves progress null when the total size is unknown', async () => {
    hasPendingUpdate.mockReturnValue(true);
    installUpdate.mockImplementation(async (onProgress) => {
      onProgress?.(50, null);
    });

    const { result } = renderHook(() => useUpdater(false));
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.progress).toBeNull();
  });

  it('surfaces an install failure', async () => {
    hasPendingUpdate.mockReturnValue(true);
    installUpdate.mockRejectedValue(new Error('signature mismatch'));

    const { result } = renderHook(() => useUpdater(false));
    await act(async () => {
      await result.current.install();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.message).toBe('signature mismatch');
  });
});

describe('dismissing', () => {
  it('hides the offer without forgetting the update', async () => {
    checkForUpdate.mockResolvedValue(OFFERED);
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(true);
    });
    act(() => {
      result.current.dismiss();
    });

    expect(result.current.dismissed).toBe(true);
    expect(result.current.update).toEqual(OFFERED);
  });

  it('un-dismisses when a later check offers something again', async () => {
    checkForUpdate.mockResolvedValue(OFFERED);
    const { result } = renderHook(() => useUpdater(false));

    await act(async () => {
      await result.current.check(true);
    });
    act(() => {
      result.current.dismiss();
    });
    await act(async () => {
      await result.current.check(false);
    });

    expect(result.current.dismissed).toBe(false);
  });
});

describe('settle helper is not vacuous', () => {
  it('flushes the promise queue', async () => {
    let done = false;
    void Promise.resolve().then(() => {
      done = true;
    });

    await settle();

    expect(done).toBe(true);
  });
});
