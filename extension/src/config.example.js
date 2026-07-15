// Template for extension/src/config.js.
//
// config.js IS committed (it holds only the public API base URL — no secrets),
// so you normally don't need to create it. This example documents the shape and
// exists as a reference / fallback. For local development, edit config.js and
// point API_BASE at your dev server; the build guard in vite.config.mjs prevents
// a localhost value from ever being shipped in a production build.
const API_BASE = 'https://clipmark.mithahara.com';

// Module and classic-script compatible global used across popup/side-panel pages.
if (typeof globalThis !== 'undefined') {
	globalThis.API_BASE = API_BASE;
}
