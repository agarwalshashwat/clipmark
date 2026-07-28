// Production configuration — committed on purpose (contains no secrets, only
// the public API base URL). For local development, edit API_BASE below to point
// at your dev server (e.g. http://localhost:3000). The extension build guard in
// vite.config.mjs fails `vite build` if API_BASE contains localhost/127.0.0.1,
// so a dev value can never be shipped to the Chrome Web Store.
//
// See config.example.js for the template.
const API_BASE = 'https://clipmark.mithahara.com';

// Module and classic-script compatible global used across popup/side-panel pages.
if (typeof globalThis !== 'undefined') {
	globalThis.API_BASE = API_BASE;
}
