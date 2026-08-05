/**
 * Saved Searches (Pro) — webapp twin of the extension's savedSearches slice
 * of chrome.storage.sync (extension/src/popup/dashboard.js's
 * getSavedSearches/saveSavedSearch/deleteSavedSearch/renderSavedFilterPills).
 *
 * The webapp has no per-user chrome.storage.sync equivalent for this kind of
 * lightweight, device-local UI preference, so it uses localStorage instead —
 * same trade-off already made for `dash_cardSize` in DashboardContent.tsx.
 * Pro users are unlimited and callers must short-circuit on isPro before
 * consulting any of this, same as the Anki export usage cap.
 */

export interface SavedSearch {
  id: number;
  name: string;
  query: string;
  sort: 'newest' | 'oldest' | 'timestamp';
}

const STORAGE_KEY = 'clipmark_saved_searches';

export function getSavedSearches(): SavedSearch[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveSavedSearch(name: string, query: string, sort: SavedSearch['sort']): SavedSearch[] {
  const searches = getSavedSearches();
  searches.push({ id: Date.now(), name, query, sort });
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Best-effort; a write failure just means the filter won't persist.
  }
  return searches;
}

export function deleteSavedSearch(id: number): SavedSearch[] {
  const searches = getSavedSearches().filter(s => s.id !== id);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(searches));
  } catch {
    // Best-effort.
  }
  return searches;
}
