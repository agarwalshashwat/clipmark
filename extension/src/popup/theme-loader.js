/* ClipMark theme resolver.
 *
 * Loaded as a CLASSIC script from the <head> of side-panel.html and
 * dashboard.html, before the stylesheet that paints. That is the whole point:
 * `data-theme` has to be on <html> before the first paint, and only
 * synchronous APIs can run that early.
 *
 *   matchMedia('(prefers-color-scheme: dark)')  synchronous → the source of truth
 *   localStorage                                synchronous → pre-paint cache of the override
 *   chrome.storage.sync                         ASYNC       → the durable override
 *
 * The previous version of this file read `chrome.storage.local` and claimed to
 * prevent a flash; the callback lands after first paint, so it guaranteed one.
 * Here the system theme is resolved synchronously and the stored override is
 * mirrored into localStorage, so the async reconcile in init() normally finds
 * nothing to change.
 *
 * Registers `globalThis.ClipMarkTheme` — side-panel.js and dashboard.js are ESM
 * modules (deferred), so they run after this and can rely on it existing.
 */
(function () {
  'use strict';

  var SYNC_KEY = 'theme';               // chrome.storage.sync — follows the user across devices
  var CACHE_KEY = 'clipmark.theme';     // localStorage mirror, read pre-paint
  var YT_CACHE_KEY = 'clipmark.ytDark'; // last-known YouTube theme (side panel only)

  function isPreference(v) {
    return v === 'system' || v === 'light' || v === 'dark';
  }

  var mql = typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

  // side-panel.html declares data-theme-follow="youtube" on <html>; the
  // dashboard does not. Read declaratively rather than sniffing the URL, and
  // read it here because <body> does not exist yet at head-parse time.
  var followYouTube =
    document.documentElement.getAttribute('data-theme-follow') === 'youtube';

  var preference = 'system';
  var youtubeDark = false;
  var listeners = [];
  var lastResolved = null;
  var lastPreference = null;

  function cacheGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null; // storage can be denied; the system theme still resolves
    }
  }

  function cacheSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* non-fatal — we lose only the pre-paint cache, not the preference */
    }
  }

  function systemDark() {
    return !!(mql && mql.matches);
  }

  /* Write through SYNC_KEY rather than a literal, so the constant stays the one
   * place the storage key is spelled. */
  function writeSync(value) {
    var patch = {};
    patch[SYNC_KEY] = value;
    chrome.storage.sync.set(patch);
  }

  /* The contract, in one place.
   *
   *   explicit light/dark  → honoured verbatim
   *   system               → dark if the OS is dark
   *   system + panel       → dark if the OS is dark OR YouTube is dark
   *
   * That last line is the PANEL RULE ("either-is-dark"): a light panel docked
   * beside a dark YouTube page is the exact eye-strain case this exists to fix,
   * and a user who darkens only YouTube on a light OS should still get a
   * matching panel. The dashboard has no page to match, so it follows the OS
   * alone — `followYouTube` is false there and this branch never fires.
   */
  function resolve() {
    if (preference === 'light' || preference === 'dark') return preference;
    if (followYouTube && youtubeDark) return 'dark';
    return systemDark() ? 'dark' : 'light';
  }

  function apply() {
    var resolved = resolve();
    if (document.documentElement.getAttribute('data-theme') !== resolved) {
      document.documentElement.setAttribute('data-theme', resolved);
    }
    // Notify on a preference change too, not just a resolved one: picking
    // "Light" while the OS is already light changes nothing on screen but must
    // still re-label the toggle on every surface listening.
    if (resolved !== lastResolved || preference !== lastPreference) {
      lastResolved = resolved;
      lastPreference = preference;
      for (var i = 0; i < listeners.length; i++) {
        try {
          listeners[i](resolved, preference);
        } catch (e) {
          /* a broken subscriber must not break the theme */
        }
      }
    }
    return resolved;
  }

  // ── pre-paint ──────────────────────────────────────────────────────────────
  // Hydrate from the synchronous mirrors, then stamp <html>. Everything below
  // this line runs later and only ever corrects.
  var cached = cacheGet(CACHE_KEY);
  if (isPreference(cached)) preference = cached;
  if (followYouTube) youtubeDark = cacheGet(YT_CACHE_KEY) === '1';
  apply();

  var initialised = false;

  /* Called by the page's module once it is running. Reconciles the durable
   * override out of chrome.storage.sync and wires the live listeners. */
  function init() {
    if (initialised) return;
    initialised = true;

    if (mql) {
      var onSystemChange = function () {
        // Always re-apply: resolve() ignores the OS when an explicit override is
        // set, so this is a no-op then — and switching back to "system" picks up
        // the current OS value with no extra bookkeeping.
        apply();
      };
      if (typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', onSystemChange);
      } else if (typeof mql.addListener === 'function') {
        mql.addListener(onSystemChange); // older Chrome
      }
    }

    var storage = typeof chrome !== 'undefined' && chrome.storage;
    if (!storage) return;

    // Read the override, migrating the pre-1.0.4 storage.local key on the way.
    // Every other ClipMark preference lives in storage.sync (see CLAUDE.md), so
    // a theme pick should follow the user across devices too.
    try {
      chrome.storage.sync.get([SYNC_KEY], function (synced) {
        var fromSync = synced && synced[SYNC_KEY];
        if (isPreference(fromSync)) {
          preference = fromSync;
          cacheSet(CACHE_KEY, preference);
          apply();
          return;
        }
        chrome.storage.local.get([SYNC_KEY], function (local) {
          var legacy = local && local[SYNC_KEY];
          if (!isPreference(legacy)) {
            // Nothing stored in either place. storage.sync is AUTHORITATIVE, so a
            // localStorage mirror left over from a pick that has since been
            // cleared (on this device or another) must not outlive it — that
            // would pin the surface to an override the user no longer has.
            if (preference !== 'system') {
              preference = 'system';
              cacheSet(CACHE_KEY, 'system');
              apply();
            }
            return;
          }
          preference = legacy;
          cacheSet(CACHE_KEY, preference);
          try {
            writeSync(legacy);
            chrome.storage.local.remove(SYNC_KEY);
          } catch (e) {
            /* the migration is best-effort; the value is already applied */
          }
          apply();
        });
      });
    } catch (e) {
      /* extension context invalidated mid-reload — the system theme stands */
    }

    // A pick made on one surface reflects on the other without a reload.
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'sync' || !changes[SYNC_KEY]) return;
        var next = changes[SYNC_KEY].newValue;
        preference = isPreference(next) ? next : 'system';
        cacheSet(CACHE_KEY, preference);
        apply();
      });
    } catch (e) {
      /* ditto */
    }
  }

  globalThis.ClipMarkTheme = {
    /** 'system' | 'light' | 'dark' — what the user chose. */
    getPreference: function () {
      return preference;
    },
    /** 'light' | 'dark' — what is actually on <html> right now. */
    getResolved: function () {
      return lastResolved || resolve();
    },
    systemDark: systemDark,
    /** Persist an override. Writes the synchronous mirror first so the next
     *  open of this page pre-paints correctly even if sync is slow. */
    setPreference: function (next) {
      if (!isPreference(next)) return apply();
      preference = next;
      cacheSet(CACHE_KEY, next);
      try {
        writeSync(next);
      } catch (e) {
        /* applied locally regardless */
      }
      return apply();
    },
    /** System → Light → Dark → System. Three states because "System" has to be
     *  expressible, and has to be the default. */
    cyclePreference: function () {
      var order = ['system', 'light', 'dark'];
      var at = order.indexOf(preference);
      return globalThis.ClipMarkTheme.setPreference(order[(at + 1) % order.length]);
    },
    /** Side panel only: report whether the YouTube tab is in its dark theme. */
    setYouTubeDark: function (dark) {
      if (!followYouTube) return apply();
      youtubeDark = !!dark;
      cacheSet(YT_CACHE_KEY, youtubeDark ? '1' : '0');
      return apply();
    },
    followsYouTube: function () {
      return followYouTube;
    },
    /** fn(resolved, preference) on every change. Returns an unsubscribe. */
    subscribe: function (fn) {
      if (typeof fn !== 'function') return function () {};
      listeners.push(fn);
      return function () {
        var at = listeners.indexOf(fn);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
    init: init,
  };
})();
