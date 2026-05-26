// Copy this file to config.js and set your API base URL.
// config.js is gitignored — never commit it.
const API_BASE = 'https://clipmark.mithahara.com';

// Module and classic-script compatible global used across popup pages.
if (typeof globalThis !== 'undefined') {
	globalThis.API_BASE = API_BASE;
}
