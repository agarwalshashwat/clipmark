/**
 * The pre-paint theme resolver.
 *
 * These run the ACTUAL script string that ships in <head> (app/lib/theme-script.ts)
 * rather than a restatement of its rules, so the test cannot quietly agree with
 * a copy while the shipped script says something else.
 *
 * The behaviour worth protecting is the precedence: an explicit user choice
 * beats the OS. Get that backwards and someone who deliberately picked light on
 * a dark-OS machine is overridden on every page load.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { THEME_SCRIPT } from '../../app/lib/theme-script';

/** Run THEME_SCRIPT against stubbed globals; returns what it set on <html>. */
function resolve({
  stored,
  prefersDark,
  matchMediaAvailable = true,
  storageThrows = false,
}: {
  stored?: string | null;
  prefersDark?: boolean;
  matchMediaAvailable?: boolean;
  storageThrows?: boolean;
}): string | null {
  let applied: string | null = null;

  const documentStub = {
    documentElement: {
      setAttribute(name: string, value: string) {
        if (name === 'data-theme') applied = value;
      },
    },
  };

  const localStorageStub = {
    getItem(_key: string) {
      if (storageThrows) throw new Error('storage blocked');
      return stored ?? null;
    },
  };

  const windowStub: Record<string, unknown> = {};
  if (matchMediaAvailable) {
    windowStub.matchMedia = (query: string) => ({
      matches: query.includes('dark') ? Boolean(prefersDark) : false,
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  new Function('window', 'document', 'localStorage', THEME_SCRIPT)(
    windowStub,
    documentStub,
    localStorageStub,
  );

  return applied;
}

describe('pre-paint theme resolution', () => {
  test('no stored choice, OS prefers dark → dark', () => {
    assert.equal(resolve({ stored: null, prefersDark: true }), 'dark');
  });

  test('no stored choice, OS prefers light → light', () => {
    assert.equal(resolve({ stored: null, prefersDark: false }), 'light');
  });

  test('no stored choice, no OS preference → light (unchanged default)', () => {
    assert.equal(resolve({ stored: null, prefersDark: undefined }), 'light');
  });

  test('stored light beats OS dark — an explicit choice is not overridden', () => {
    assert.equal(resolve({ stored: 'light', prefersDark: true }), 'light');
  });

  test('stored dark beats OS light', () => {
    assert.equal(resolve({ stored: 'dark', prefersDark: false }), 'dark');
  });

  test('a junk stored value falls through to the OS rather than being trusted', () => {
    assert.equal(resolve({ stored: 'chartreuse', prefersDark: true }), 'dark');
    assert.equal(resolve({ stored: '', prefersDark: false }), 'light');
  });

  test('no matchMedia (old browser) → light, never throws', () => {
    assert.equal(resolve({ stored: null, matchMediaAvailable: false }), 'light');
  });

  test('localStorage throwing (privacy mode) never breaks the page', () => {
    // The whole body is wrapped in try/catch, so nothing is applied and, more
    // importantly, no exception escapes into <head>.
    assert.doesNotThrow(() => resolve({ storageThrows: true, prefersDark: true }));
  });
});
