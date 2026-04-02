// API_BASE is defined in config.js (loaded via <script> tag before this file)

// Returns a fresh access token, auto-refreshing via /api/refresh if expired.
async function getValidToken() {
  const { bmUser } = await new Promise(resolve =>
    chrome.storage.sync.get({ bmUser: null }, resolve)
  );
  if (!bmUser?.accessToken) return null;
  try {
    const payload = JSON.parse(atob(bmUser.accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (payload.exp * 1000 > Date.now() + 60_000) return bmUser.accessToken;
  } catch { /* fall through to refresh */ }
  if (!bmUser.refreshToken) return null;
  try {
    const res = await fetch(`${API_BASE}/api/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: bmUser.refreshToken }),
    });
    if (!res.ok) return null;
    const { access_token, refresh_token } = await res.json();
    await new Promise(resolve =>
      chrome.storage.sync.set({ bmUser: { ...bmUser, accessToken: access_token, refreshToken: refresh_token } }, resolve)
    );
    return access_token;
  } catch {
    return null;
  }
}

// ─── Tag colours (must match popup.js / content.js) ──────────────────────────
const TAG_COLORS = {
  important: '#ef4444',
  review:    '#f97316',
  note:      '#3b82f6',
  question:  '#22c55e',
  todo:      '#a855f7',
  key:       '#ec4899',
};

function stringToColor(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 55%, 45%)`;
}

function getTagColor(tags) {
  if (!tags || tags.length === 0) return '#4da1ee';
  return TAG_COLORS[tags[0]] || stringToColor(tags[0]);
}

function bmKey(videoId) { return `bm_${videoId}`; }

// ─── Utilities ────────────────────────────────────────────────────────────────
function formatTimestamp(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function relativeTime(ts) {
  const diff   = Date.now() - ts;
  const mins   = Math.floor(diff / 60000);
  const hrs    = Math.floor(diff / 3600000);
  const days   = Math.floor(diff / 86400000);
  const months = Math.floor(days / 30);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return `${mins}m ago`;
  if (hrs < 24)    return `${hrs}h ago`;
  if (days < 30)   return `${days}d ago`;
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function showToast(message, type = 'error') {
  const toast = document.getElementById(`${type}-toast`);
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ─── Pro gate ─────────────────────────────────────────────────────────────────
async function checkPro() {
  return new Promise(resolve =>
    chrome.storage.sync.get({ bmUser: null }, r => resolve(r.bmUser?.isPro === true))
  );
}

// ─── Storage helpers ──────────────────────────────────────────────────────────
async function getAllBookmarks() {
  return new Promise((resolve, reject) => {
    chrome.storage.sync.get(null, result => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const bookmarks = [];
      for (const [key, val] of Object.entries(result)) {
        if (key.startsWith('bm_') && Array.isArray(val)) bookmarks.push(...val);
      }
      resolve(bookmarks);
    });
  });
}

async function getVideoTitles() {
  return new Promise(resolve =>
    chrome.storage.sync.get({ videoTitles: {} }, r => resolve(r.videoTitles || {}))
  );
}

async function getVideoDurations() {
  return new Promise(resolve =>
    chrome.storage.sync.get({ videoDurations: {} }, r => resolve(r.videoDurations || {}))
  );
}

async function deleteBookmark(videoId, bookmarkId) {
  return new Promise((resolve, reject) => {
    const key = bmKey(videoId);
    chrome.storage.sync.get({ [key]: [] }, result => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const updated = result[key].filter(b => b.id !== bookmarkId);
      chrome.storage.sync.set({ [key]: updated }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  });
}

async function updateBookmark(videoId, bookmarkId, patch) {
  return new Promise((resolve, reject) => {
    const key = bmKey(videoId);
    chrome.storage.sync.get({ [key]: [] }, result => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      const updated = result[key].map(b => b.id === bookmarkId ? { ...b, ...patch } : b);
      chrome.storage.sync.set({ [key]: updated }, () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
  });
}

// ─── Saved Searches (Pro) ─────────────────────────────────────────────────────
async function getSavedSearches() {
  return new Promise(resolve =>
    chrome.storage.sync.get({ savedSearches: [] }, r => resolve(r.savedSearches))
  );
}

async function saveSavedSearch(name, query, sort) {
  const searches = await getSavedSearches();
  searches.push({ id: Date.now(), name, query, sort });
  return new Promise(resolve => chrome.storage.sync.set({ savedSearches: searches }, resolve));
}

async function deleteSavedSearch(id) {
  const searches = await getSavedSearches();
  return new Promise(resolve =>
    chrome.storage.sync.set({ savedSearches: searches.filter(s => s.id !== id) }, resolve)
  );
}

async function renderSavedFilterPills() {
  const row = document.getElementById('saved-filters-row');
  if (!row) return;
  const searches = await getSavedSearches();
  if (searches.length === 0) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  row.innerHTML = searches.map(s => `
    <div class="saved-filter-pill" data-query="${s.query}" data-sort="${s.sort || 'newest'}" data-id="${s.id}">
      <span class="saved-filter-pill__name">${s.name}</span>
      <button class="saved-filter-pill__del" data-id="${s.id}" title="Remove">×</button>
    </div>`).join('');

  row.querySelectorAll('.saved-filter-pill').forEach(pill => {
    pill.addEventListener('click', e => {
      if (e.target.closest('.saved-filter-pill__del')) return;
      filterQuery = pill.dataset.query;
      sortOrder   = pill.dataset.sort;
      const searchInput = document.getElementById('search-input');
      const sortSelect  = document.getElementById('sort-select');
      if (searchInput) searchInput.value = filterQuery;
      if (sortSelect)  sortSelect.value  = sortOrder;
      renderBookmarks();
    });
  });

  row.querySelectorAll('.saved-filter-pill__del').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      await deleteSavedSearch(parseInt(btn.dataset.id));
      renderSavedFilterPills();
    });
  });
}

// ─── State ────────────────────────────────────────────────────────────────────
let allBookmarks  = [];
let filterQuery   = '';
let filterVideoId = null;
let sortOrder     = 'newest';
let viewMode      = localStorage.getItem('bm_viewMode') || 'cards';
let cardSize      = localStorage.getItem('bm_cardSize') || 'large';
let selectedIds   = new Set();
let revisitIndex  = 0;

// ─── Sort & filter ────────────────────────────────────────────────────────────
function applyFiltersAndSort(bookmarks) {
  let result = [...bookmarks];

  if (filterVideoId) {
    result = result.filter(b => b.videoId === filterVideoId);
  }

  if (filterQuery) {
    const q = filterQuery.toLowerCase();
    result = result.filter(b =>
      (b.description || '').toLowerCase().includes(q) ||
      (b.videoTitle  || '').toLowerCase().includes(q) ||
      (b.tags || []).some(t => t.includes(q))
    );
  }

  switch (sortOrder) {
    case 'newest':    result.sort((a, b) => b.id - a.id); break;
    case 'oldest':    result.sort((a, b) => a.id - b.id); break;
    case 'timestamp': result.sort((a, b) => a.timestamp - b.timestamp); break;
  }

  return result;
}

function groupByVideo(bookmarks) {
  const groups = {};
  bookmarks.forEach(b => {
    if (!groups[b.videoId]) groups[b.videoId] = [];
    groups[b.videoId].push(b);
  });
  return groups;
}

// Groups bookmarks by videoId only — all bookmarks for the same video
// appear as a single card, regardless of which day they were saved.
// Returns an ordered array of { key, videoId, bookmarks }.
function groupByVideoAndDay(bookmarks) {
  const map = new Map();
  bookmarks.forEach(b => {
    const key = b.videoId;
    if (!map.has(key)) map.set(key, { key, videoId: b.videoId, bookmarks: [] });
    map.get(key).bookmarks.push(b);
  });
  return Array.from(map.values());
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function renderStatsBar() {
  const bar = document.getElementById('stats-bar');
  if (!bar || allBookmarks.length === 0) {
    if (bar) bar.style.display = 'none';
    return;
  }
  const totalBm   = allBookmarks.length;
  const totalVids = new Set(allBookmarks.map(b => b.videoId)).size;
  const totalTags = new Set(allBookmarks.flatMap(b => b.tags || [])).size;
  const lastTs    = Math.max(...allBookmarks.map(b => b.id));

  bar.style.display = 'flex';
  bar.innerHTML = `
    <div class="stat-item">
      <span class="stat-value">${totalBm}</span>
      <span class="stat-label">Bookmarks</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${totalVids}</span>
      <span class="stat-label">Videos</span>
    </div>
    <div class="stat-item">
      <span class="stat-value">${totalTags}</span>
      <span class="stat-label">Unique tags</span>
    </div>
    <div class="stat-item stat-item--last">
      <span class="stat-value stat-value--sm">${relativeTime(lastTs)}</span>
      <span class="stat-label">Last saved</span>
    </div>`;
}

// ─── Build timeline dots HTML for a video group ───────────────────────────────
function buildTimeline(bookmarks, trackMax) {
  return bookmarks.map(b => {
    const pct   = ((b.timestamp / trackMax) * 95).toFixed(2);
    const color = b.color || '#14B8A6';
    const label = `${formatTimestamp(b.timestamp)} — ${b.description || 'No note'}`;
    return `<div class="vc-dot" style="left:${pct}%;background:${color}" data-label="${label.replace(/"/g, '&quot;')}" title="${label}"></div>`;
  }).join('');
}

// ─── Render ───────────────────────────────────────────────────────────────────
async function renderBookmarks() {
  const container = document.getElementById('bookmarks-container');

  // Let CSS show/hide the heading, toolbar, and stats bar per view
  document.querySelector('.bm-main')?.setAttribute('data-view', viewMode);

  updateSaveFilterBtn();

  // Groups, analytics, revisit, and videos manage their own container
  if (viewMode === 'groups') {
    await renderGroupsView();
    return;
  }

  if (viewMode === 'analytics') {
    container.className = '';
    container.innerHTML = '';
    selectedIds.clear();
    await renderAnalyticsView(container);
    return;
  }

  if (viewMode === 'revisit') {
    selectedIds.clear();
    await renderRevisitView(container);
    return;
  }

  if (viewMode === 'videos') {
    selectedIds.clear();
    await renderVideosView(container);
    return;
  }

  // Only card/timeline views need the stats bar
  renderStatsBar();

  const filtered = applyFiltersAndSort(allBookmarks);

  // Apply card-size class for card/timeline views
  container.className = cardSize === 'large' ? '' : `card-size-${cardSize}`;

  if (filtered.length === 0) {
    container.innerHTML = allBookmarks.length === 0
      ? `<div class="empty-state">
           <div class="empty-state-icon">🔖</div>
           <h3>No bookmarks yet</h3>
           <p>Save important moments from YouTube videos so you can revisit them later.</p>
         </div>`
      : `<div class="empty-state">
           <div class="empty-state-icon">🔍</div>
           <h3>No matches found</h3>
           <p>Try adjusting your search or filters.</p>
         </div>`;
    return;
  }

  const [videoTitles, videoDurations] = await Promise.all([getVideoTitles(), getVideoDurations()]);
  container.innerHTML = '';
  selectedIds.clear();
  updateBulkDeleteBtn();

  if (viewMode === 'timeline') {
    renderTimelineView(filtered, container);
    return;
  }

  // ── Cards view ───────────────────────────────────────────────────────────
  let groups = groupByVideoAndDay(filtered);

  if (sortOrder === 'oldest') {
    groups.sort((a, b) => Math.min(...a.bookmarks.map(x => x.id)) - Math.min(...b.bookmarks.map(x => x.id)));
  } else if (sortOrder === 'timestamp') {
    groups.sort((a, b) => {
      const latestTitle = g => g.bookmarks
        .slice()
        .sort((x, y) => (y.createdAt ? new Date(y.createdAt).getTime() : y.id) - (x.createdAt ? new Date(x.createdAt).getTime() : x.id))
        .map(b => b.videoTitle)
        .find(t => t) || videoTitles[g.videoId] || g.videoId;
      return latestTitle(a).toLowerCase().localeCompare(latestTitle(b).toLowerCase());
    });
  } else {
    groups.sort((a, b) => Math.max(...b.bookmarks.map(x => x.id)) - Math.max(...a.bookmarks.map(x => x.id)));
  }

  // Featured = group with most bookmarks (only when there are multiple groups)
  const featuredKey = groups.length > 1
    ? groups.reduce((best, g) => (g.bookmarks.length > best.bookmarks.length) ? g : best, groups[0]).key
    : null;

  groups.forEach(({ key, videoId, bookmarks }) => {
    const title  = bookmarks
      .slice()
      .sort((a, b) => (b.createdAt ? new Date(b.createdAt).getTime() : b.id) - (a.createdAt ? new Date(a.createdAt).getTime() : a.id))
      .map(b => b.videoTitle)
      .find(t => t) || videoTitles[videoId] || `Video: ${videoId}`;
    const ytUrl  = `https://www.youtube.com/watch?v=${videoId}`;
    const thumb  = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    const count  = bookmarks.length;

    const card = document.createElement('div');
    card.className = 'vc-card' + (key === featuredKey ? ' vc-card--featured' : '');

    const maxTs    = Math.max(...bookmarks.map(b => b.timestamp));
    const trackMax = videoDurations[videoId] || Math.max(maxTs + 60, 120);
    const addedTs  = Math.max(...bookmarks.map(b => b.createdAt ? new Date(b.createdAt).getTime() : b.id));
    const addedStr = new Date(addedTs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const COLLAPSE_AFTER = 3;
    const hasMore  = bookmarks.length > COLLAPSE_AFTER;
    const sortedBookmarks = [...bookmarks].sort((a, b) => a.timestamp - b.timestamp);

    card.innerHTML = `
      <div class="vc-body">
        <div class="vc-left">
          <a href="${ytUrl}" target="_blank" rel="noopener" class="vc-thumb-wrap">
            <img src="${thumb}" alt="${title}" class="vc-thumb" loading="lazy">
            <div class="vc-thumb-gradient"></div>
            <div class="vc-thumb-overlay-bottom">
              <span class="vc-badge">YOUTUBE</span>
              <span class="vc-duration">${formatTimestamp(maxTs)}</span>
            </div>
            <div class="vc-play-btn">
              <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1;font-size:40px">play_arrow</span>
            </div>
          </a>
          <div class="vc-scrubber">
            <div class="vc-track">${buildTimeline(bookmarks, trackMax)}</div>
            <div class="vc-scrubber-times">
              <span class="vc-time-label">00:00</span>
              <span class="vc-time-label">${formatTimestamp(trackMax)}</span>
            </div>
          </div>
          <div class="vc-card-btns">
            <button class="vc-revisit-btn" data-video-id="${videoId}">
              <span class="material-symbols-outlined" style="font-variation-settings:'FILL' 1">play_circle</span> Revisit
            </button>
            <button class="vc-group-btn" data-video-id="${videoId}">
              <span class="material-symbols-outlined">folder</span> Group
            </button>
          </div>
        </div>
        <div class="vc-right">
          <div class="vc-right-head">
            <a class="vc-title" href="${ytUrl}" target="_blank" rel="noopener">${title}</a>
            <button class="vc-more-btn" title="More options">
              <span class="material-symbols-outlined">more_vert</span>
            </button>
          </div>
          <div class="vc-meta-row">
            <span class="vc-count-badge">${count} Bookmark${count !== 1 ? 's' : ''}</span>
            <span class="vc-meta-dot"></span>
            <span class="vc-added-date">Added ${addedStr}</span>
          </div>
          <div class="vc-vt">
            <div class="vc-vt-thread"></div>
            ${sortedBookmarks.map((b, i) => {
              if (hasMore && i >= COLLAPSE_AFTER) return '';
              const c         = b.color || '#14B8A6';
              const hasNotes  = b.notes && b.notes.trim();
              return `
                <div class="vc-chapter vc-vt-item" data-bookmark-id="${b.id}" data-video-id="${videoId}" style="--bm-color:${c}">
                  <input type="checkbox" class="bookmark-checkbox vc-cb" data-bookmark-id="${b.id}" data-video-id="${videoId}">
                  <div class="vc-vt-circle" style="border-color:${c}"></div>
                  <div class="vc-vt-content">
                    <div class="vc-vt-header">
                      <span class="vc-vt-time" style="background:${c}20;color:${c}">${formatTimestamp(b.timestamp)}</span>
                    </div>
                    <div class="vc-vt-note">${b.description || 'No note added.'}</div>
                    ${b.tags && b.tags.length
                      ? `<div class="vc-tags">${b.tags.map(t =>
                          `<span class="tag-badge" style="background:${getTagColor([t])}18;color:${getTagColor([t])}">#${t}</span>`
                        ).join('')}</div>`
                      : ''}
                    <div class="vc-actions">
                      <button class="vc-notes-btn btn-icon${hasNotes ? ' vc-notes-btn--has-notes' : ''}" data-bookmark-id="${b.id}" data-video-id="${videoId}" title="Extended notes${hasNotes ? ' (has notes)' : ''}">📝</button>
                      <button class="btn-icon copy-link" data-video-id="${videoId}" data-timestamp="${b.timestamp}" title="Copy link">⎘</button>
                      <button class="vc-jump jump-to-video" data-video-id="${videoId}" data-timestamp="${b.timestamp}">Jump</button>
                      <button class="vc-del delete-bookmark" data-bookmark-id="${b.id}" data-video-id="${videoId}">×</button>
                    </div>
                    <div class="vc-notes-panel" id="notes-${b.id}" data-bookmark-id="${b.id}" data-video-id="${videoId}">
                      <textarea class="vc-notes-textarea" placeholder="Add a longer note, context, or key insight…" rows="2">${b.notes || ''}</textarea>
                      <div class="vc-notes-hint">Auto-saves · Esc to close</div>
                    </div>
                  </div>
                </div>`;
            }).join('')}
            ${hasMore ? `
            <div class="vc-vt-overflow vc-vt-overflow--collapsed">
              <div class="vc-vt-overflow__inner">
                ${sortedBookmarks.slice(COLLAPSE_AFTER).map(b => {
                  const c         = b.color || '#14B8A6';
                  const hasNotes  = b.notes && b.notes.trim();
                  return `
                <div class="vc-chapter vc-vt-item" data-bookmark-id="${b.id}" data-video-id="${videoId}" style="--bm-color:${c}">
                  <input type="checkbox" class="bookmark-checkbox vc-cb" data-bookmark-id="${b.id}" data-video-id="${videoId}">
                  <div class="vc-vt-circle" style="border-color:${c}"></div>
                  <div class="vc-vt-content">
                    <div class="vc-vt-header">
                      <span class="vc-vt-time" style="background:${c}20;color:${c}">${formatTimestamp(b.timestamp)}</span>
                    </div>
                    <div class="vc-vt-note">${b.description || 'No note added.'}</div>
                    ${b.tags && b.tags.length
                      ? `<div class="vc-tags">${b.tags.map(t =>
                          `<span class="tag-badge" style="background:${getTagColor([t])}18;color:${getTagColor([t])}">#${t}</span>`
                        ).join('')}</div>`
                      : ''}
                    <div class="vc-actions">
                      <button class="vc-notes-btn btn-icon${hasNotes ? ' vc-notes-btn--has-notes' : ''}" data-bookmark-id="${b.id}" data-video-id="${videoId}" title="Extended notes${hasNotes ? ' (has notes)' : ''}">📝</button>
                      <button class="btn-icon copy-link" data-video-id="${videoId}" data-timestamp="${b.timestamp}" title="Copy link">⎘</button>
                      <button class="vc-jump jump-to-video" data-video-id="${videoId}" data-timestamp="${b.timestamp}">Jump</button>
                      <button class="vc-del delete-bookmark" data-bookmark-id="${b.id}" data-video-id="${videoId}">×</button>
                    </div>
                    <div class="vc-notes-panel" id="notes-${b.id}" data-bookmark-id="${b.id}" data-video-id="${videoId}">
                      <textarea class="vc-notes-textarea" placeholder="Add a longer note, context, or key insight…" rows="2">${b.notes || ''}</textarea>
                      <div class="vc-notes-hint">Auto-saves · Esc to close</div>
                    </div>
                  </div>
                </div>`;
                }).join('')}
              </div>
            </div>` : ''}
          </div>
          ${hasMore ? `
          <div class="vc-expand-row">
            <button class="vc-expand-btn" data-video-id="${videoId}" data-collapsed="true">
              Expand All Curations
              <span class="material-symbols-outlined vc-expand-arrow">expand_more</span>
            </button>
          </div>` : ''}
          <div class="vc-pill-row">
            ${sortedBookmarks.map(b => {
              const c = b.color || '#14B8A6';
              return `<button class="vc-pill jump-to-video" data-video-id="${videoId}" data-timestamp="${b.timestamp}" style="background:${c}18;color:${c};border:1px solid ${c}30">${formatTimestamp(b.timestamp)}</button>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    container.appendChild(card);
  });

  attachEventListeners();
}

// ─── Analytics View (Pro) ─────────────────────────────────────────────────────
async function renderAnalyticsView(container) {
  const isPro = await checkPro();
  if (!isPro) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📊</div>
        <h3>Analytics — Pro Feature</h3>
        <p>See which topics you save most, activity over time, and tag insights — all from your local data.</p>
        <a href="https://clipmark.mithahara.com/upgrade" target="_blank" class="analytics-upgrade-btn">✦ Upgrade to Pro</a>
      </div>`;
    return;
  }

  const bookmarks = allBookmarks;

  // Build tag map
  const tagMap = {};
  bookmarks.forEach(b => {
    (b.tags || []).forEach(t => {
      if (!tagMap[t]) tagMap[t] = { count: 0, videos: new Set() };
      tagMap[t].count++;
      tagMap[t].videos.add(b.videoId);
    });
  });
  const sortedTags = Object.entries(tagMap).sort((a, b) => b[1].count - a[1].count);
  const maxCount   = sortedTags[0]?.[1].count || 1;

  // Build heatmap (last 14 days)
  const dayMap = {};
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dayMap[d.toDateString()] = 0;
  }
  bookmarks.forEach(b => {
    const d = new Date(b.createdAt || b.id).toDateString();
    if (d in dayMap) dayMap[d]++;
  });
  const maxDay = Math.max(...Object.values(dayMap), 1);

  const heatmapHtml = Object.entries(dayMap).map(([day, count]) => {
    const opacity = count === 0 ? 0.08 : 0.18 + (count / maxDay) * 0.82;
    const d       = new Date(day);
    const label   = d.toLocaleDateString('default', { month: 'short', day: 'numeric' });
    return `<div class="heatmap-cell" style="--hm-opacity:${opacity}" title="${label}: ${count} bookmark${count !== 1 ? 's' : ''}">
      <span class="heatmap-date">${d.getDate()}</span>
    </div>`;
  }).join('');

  container.innerHTML = `
    <div class="analytics-wrap">
      <div class="analytics-section">
        <h3 class="analytics-section-title">Activity <span class="analytics-sub">last 14 days</span></h3>
        <div class="heatmap-row">${heatmapHtml}</div>
      </div>
      <div class="analytics-section">
        <h3 class="analytics-section-title">Tag Breakdown <span class="analytics-sub">${sortedTags.length} unique tag${sortedTags.length !== 1 ? 's' : ''}</span></h3>
        ${sortedTags.length === 0
          ? '<p class="analytics-empty">No tagged bookmarks yet. Add #tags to your notes to see insights here.</p>'
          : `<div class="analytics-grid">
              ${sortedTags.map(([tag, data]) => {
                const color = getTagColor([tag]);
                const pct   = ((data.count / maxCount) * 100).toFixed(0);
                const vids  = data.videos.size;
                return `
                  <div class="analytics-card" style="--ac-color:${color}">
                    <div class="analytics-tag" style="color:${color}">#${tag}</div>
                    <div class="analytics-count">${data.count}</div>
                    <div class="analytics-bar-track">
                      <div class="analytics-bar" style="width:${pct}%;background:${color}"></div>
                    </div>
                    <div class="analytics-meta">${vids} video${vids !== 1 ? 's' : ''}</div>
                  </div>`;
              }).join('')}
            </div>`}
      </div>
    </div>`;
}

// ─── Timeline view ────────────────────────────────────────────────────────────
function renderTimelineView(bookmarks, container) {
  if (!bookmarks.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔖</div>
        <h3>No bookmarks yet.</h3>
        <p>Save important moments from YouTube videos so you can revisit them later.</p>
      </div>`;
    return;
  }

  const sorted = [...bookmarks].sort((a, b) =>
    new Date(a.createdAt || 0) - new Date(b.createdAt || 0)
  );

  // Group by month-year
  const groups = [];
  let currentKey = null;
  sorted.forEach(b => {
    const d     = new Date(b.createdAt || 0);
    const key   = `${d.getFullYear()}-${d.getMonth()}`;
    const label = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    if (key !== currentKey) { groups.push({ label, items: [] }); currentKey = key; }
    groups[groups.length - 1].items.push(b);
  });

  const wrap = document.createElement('div');
  wrap.className = 'tl-wrap';
  let idx = 0;

  groups.forEach(({ label, items }) => {
    const period = document.createElement('div');
    period.className = 'tl-period';
    period.innerHTML = `<span class="tl-period-label">${label} <span class="tl-period-count">· ${items.length} bookmark${items.length !== 1 ? 's' : ''}</span></span>`;
    wrap.appendChild(period);

    items.forEach(b => {
      const side     = idx % 2 === 0 ? 'tl-left' : 'tl-right';
      const color    = b.color || getTagColor(b.tags);
      const thumb    = `https://img.youtube.com/vi/${b.videoId}/mqdefault.jpg`;
      const tagsHtml = b.tags?.length
        ? `<div class="tl-tags">${b.tags.map(t =>
            `<span class="tag-badge" style="background:${getTagColor([t])}18;color:${getTagColor([t])}">#${t}</span>`
          ).join('')}</div>`
        : '';

      const cardHtml = `
        <div class="tl-card" style="--tl-idx:${idx}">
          <img class="tl-thumb" src="${thumb}" loading="lazy" alt="">
          <div class="tl-ts" style="color:${color}">${formatTimestamp(b.timestamp)}</div>
          <div class="tl-video" title="${b.videoTitle || ''}">${b.videoTitle || 'Unknown video'}</div>
          <div class="tl-desc">${b.description || 'No note added.'}</div>
          ${tagsHtml}
          <div class="tl-actions">
            <button class="btn-icon copy-link" data-video-id="${b.videoId}" data-timestamp="${b.timestamp}" title="Copy link">⎘</button>
            <button class="vc-jump jump-to-video" data-video-id="${b.videoId}" data-timestamp="${b.timestamp}">Jump</button>
            <button class="vc-del delete-bookmark" data-bookmark-id="${b.id}" data-video-id="${b.videoId}">×</button>
          </div>
        </div>`;
      const nodeHtml = `<div class="tl-node"><div class="tl-dot" style="background:${color}"></div></div>`;
      const empty    = `<div class="tl-empty"></div>`;

      const entry = document.createElement('div');
      entry.className = `tl-entry ${side}`;
      entry.dataset.bookmarkId = b.id;
      entry.dataset.videoId    = b.videoId;
      entry.innerHTML = side === 'tl-left'
        ? cardHtml + nodeHtml + empty
        : empty    + nodeHtml + cardHtml;
      wrap.appendChild(entry);
      idx++;
    });
  });

  container.appendChild(wrap);
  attachEventListeners();
}

function updateBulkDeleteBtn() {
  const row = document.getElementById('toolbar-row-2');
  const cnt = document.getElementById('bulk-count');
  if (!row) return;
  if (selectedIds.size > 0) {
    row.style.display = 'flex';
    cnt.textContent = selectedIds.size;
  } else {
    row.style.display = 'none';
  }
}

function updateSaveFilterBtn() {
  const btn = document.getElementById('save-filter-btn');
  if (btn) btn.style.display = filterQuery ? '' : 'none';
}

function attachEventListeners() {
  document.querySelectorAll('.vc-group-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      showGroupPicker(btn.dataset.videoId, btn);
    });
  });

  document.querySelectorAll('.vc-revisit-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const isPro = await checkPro();
      if (!isPro) {
        showToast('▶ Revisit Mode is a Pro feature. Upgrade to Clipmark Pro to unlock it.', 'error');
        window.open('https://clipmark.mithahara.com/upgrade', '_blank');
        return;
      }
      const videoId   = btn.dataset.videoId;
      const bookmarks = allBookmarks
        .filter(b => b.videoId === videoId)
        .sort((a, b) => a.timestamp - b.timestamp);
      if (!bookmarks.length) return;
      await chrome.storage.local.set({ pendingRevision: { videoId, bookmarks } });
      chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${videoId}` });
    });
  });

  document.querySelectorAll('.jump-to-video').forEach(btn => {
    btn.addEventListener('click', e => {
      jumpToVideo(e.target.dataset.videoId, parseFloat(e.target.dataset.timestamp));
    });
  });

  document.querySelectorAll('.copy-link').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const { videoId, timestamp } = e.currentTarget.dataset;
      const url = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(parseFloat(timestamp))}`;
      await navigator.clipboard.writeText(url);
      showToast('Link copied!', 'success');
    });
  });

  document.querySelectorAll('.bookmark-checkbox').forEach(cb => {
    cb.addEventListener('change', e => {
      e.stopPropagation();
      const key = `${e.target.dataset.videoId}:${e.target.dataset.bookmarkId}`;
      if (e.target.checked) selectedIds.add(key);
      else selectedIds.delete(key);
      updateBulkDeleteBtn();
      const card = e.target.closest('.vc-chapter, .tl-entry');
      if (card) card.classList.toggle('selected', e.target.checked);
    });
  });

  document.querySelectorAll('.delete-bookmark').forEach(btn => {
    btn.addEventListener('click', async e => {
      const bookmarkId = parseInt(e.target.dataset.bookmarkId);
      const videoId    = e.target.dataset.videoId;
      const card       = e.target.closest('.vc-chapter, .tl-entry');

      card.classList.add('deleting');
      await new Promise(r => setTimeout(r, 300));

      try {
        await deleteBookmark(videoId, bookmarkId);
        allBookmarks = allBookmarks.filter(b => b.id !== bookmarkId);
        await renderBookmarks();
        showToast('Bookmark deleted', 'success');
      } catch {
        card.classList.remove('deleting');
        showToast('Failed to delete bookmark');
      }
    });
  });

  // ── Notes button (Pro) ────────────────────────────────────────────────────
  document.querySelectorAll('.vc-notes-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const isPro = await checkPro();
      if (!isPro) {
        showToast('✦ Extended Notes is a Pro feature. Upgrade to Clipmark Pro.');
        return;
      }
      const bookmarkId = btn.dataset.bookmarkId;
      const panel      = document.getElementById(`notes-${bookmarkId}`);
      if (!panel) return;
      const isOpen = panel.classList.contains('vc-notes-panel--open');
      document.querySelectorAll('.vc-notes-panel--open').forEach(p => p.classList.remove('vc-notes-panel--open'));
      if (!isOpen) {
        panel.classList.add('vc-notes-panel--open');
        const ta = panel.querySelector('.vc-notes-textarea');
        if (ta) {
          ta.focus();
          ta.style.height = 'auto';
          ta.style.height = ta.scrollHeight + 'px';
        }
      }
    });
  });

  document.querySelectorAll('.vc-notes-textarea').forEach(ta => {
    const panel      = ta.closest('.vc-notes-panel');
    const bookmarkId = parseInt(panel.dataset.bookmarkId);
    const videoId    = panel.dataset.videoId;
    const hint       = panel.querySelector('.vc-notes-hint');
    const hintDefault = hint ? hint.textContent : '';

    ta.addEventListener('input', () => {
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 200) + 'px';
    });

    let saveTimer = null;
    let isDirty   = false;

    const setHint = (text, temporary = false) => {
      if (!hint) return;
      hint.textContent = text;
      if (temporary) setTimeout(() => { hint.textContent = hintDefault; }, 1800);
    };

    const saveNotes = async () => {
      if (!isDirty) return;
      isDirty = false;
      clearTimeout(saveTimer);
      const notes = ta.value;
      ta.classList.add('vc-notes-textarea--saving');
      ta.classList.remove('vc-notes-textarea--saved');
      setHint('Saving…');
      try {
        await updateBookmark(videoId, bookmarkId, { notes });
        const bm = allBookmarks.find(b => b.id === bookmarkId);
        if (bm) bm.notes = notes;
        ta.classList.remove('vc-notes-textarea--saving');
        ta.classList.add('vc-notes-textarea--saved');
        setHint('Saved ✓', true);
        setTimeout(() => ta.classList.remove('vc-notes-textarea--saved'), 1800);
      } catch {
        ta.classList.remove('vc-notes-textarea--saving');
        setHint('Failed to save', true);
        showToast('Failed to save notes');
      }
    };

    ta.addEventListener('input', () => {
      isDirty = true;
      ta.classList.remove('vc-notes-textarea--saved');
      clearTimeout(saveTimer);
      saveTimer = setTimeout(saveNotes, 800);
    });

    ta.addEventListener('blur', () => {
      clearTimeout(saveTimer);
      saveNotes();
    });

    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); clearTimeout(saveTimer); saveNotes(); }
      if (e.key === 'Escape') { panel.classList.remove('vc-notes-panel--open'); }
    });
  });

  document.querySelectorAll('.vc-expand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card      = btn.closest('.vc-card');
      const overflow  = card.querySelector('.vc-vt-overflow');
      const collapsed = btn.dataset.collapsed === 'true';
      if (collapsed) {
        overflow.classList.remove('vc-vt-overflow--collapsed');
        btn.dataset.collapsed = 'false';
        btn.innerHTML = 'Collapse <span class="material-symbols-outlined vc-expand-arrow" style="transform:rotate(180deg);display:inline-block">expand_more</span>';
      } else {
        overflow.classList.add('vc-vt-overflow--collapsed');
        btn.dataset.collapsed = 'true';
        btn.innerHTML = 'Expand All Curations <span class="material-symbols-outlined vc-expand-arrow">expand_more</span>';
      }
    });
  });
}

function jumpToVideo(videoId, timestamp) {
  window.open(`https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(timestamp)}`, '_blank');
}

// ─── Export ───────────────────────────────────────────────────────────────────
function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportJSON() {
  downloadFile(JSON.stringify(allBookmarks, null, 2), 'clipmark-bookmarks.json', 'application/json');
}

function exportCSV() {
  const header = 'Video ID,Video Title,Timestamp,Description,Tags,Notes,Created At\n';
  const rows   = allBookmarks.map(b =>
    [b.videoId, b.videoTitle || '', formatTimestamp(b.timestamp),
     (b.description || '').replace(/"/g, '""'),
     (b.tags || []).join(' '),
     (b.notes || '').replace(/"/g, '""'),
     b.createdAt]
    .map(v => `"${v}"`).join(',')
  ).join('\n');
  downloadFile(header + rows, 'clipmark-bookmarks.csv', 'text/csv');
}

function exportMarkdown() {
  const videoTitles = {};
  allBookmarks.forEach(b => { videoTitles[b.videoId] = b.videoTitle || b.videoId; });

  const groups = groupByVideo(allBookmarks);
  const lines  = ['# Clipmark Bookmarks\n'];

  for (const [videoId, bookmarks] of Object.entries(groups)) {
    const title = videoTitles[videoId] || videoId;
    lines.push(`## [${title}](https://www.youtube.com/watch?v=${videoId})\n`);
    bookmarks.sort((a, b) => a.timestamp - b.timestamp).forEach(b => {
      const tagStr = b.tags && b.tags.length ? ` ${b.tags.map(t => `#${t}`).join(' ')}` : '';
      const url    = `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(b.timestamp)}`;
      lines.push(`- [${formatTimestamp(b.timestamp)}](${url}) — ${b.description || 'No description'}${tagStr}`);
      if (b.notes && b.notes.trim()) lines.push(`  > ${b.notes.replace(/\n/g, '\n  > ')}`);
    });
    lines.push('');
  }

  downloadFile(lines.join('\n'), 'clipmark-bookmarks.md', 'text/markdown');
}

async function exportObsidian() {
  const isPro = await checkPro();
  if (!isPro) { showToast('✦ Obsidian export is a Pro feature. Upgrade to Clipmark Pro.'); return; }

  const groups = groupByVideo(allBookmarks);
  const lines  = ['# Clipmark Export — Obsidian\n'];

  for (const [videoId, bookmarks] of Object.entries(groups)) {
    const title = bookmarks[0].videoTitle || videoId;
    const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
    lines.push(`> [!note] [${title}](${ytUrl})\n`);
    bookmarks.sort((a, b) => a.timestamp - b.timestamp).forEach(b => {
      const url    = `${ytUrl}&t=${Math.floor(b.timestamp)}`;
      const tagStr = b.tags?.length ? ` ${b.tags.map(t => `#${t}`).join(' ')}` : '';
      lines.push(`> - [${formatTimestamp(b.timestamp)}](${url}) — ${b.description || 'No note'}${tagStr}`);
      if (b.notes?.trim()) lines.push(`>   > ${b.notes.replace(/\n/g, '\n>   > ')}`);
    });
    lines.push('');
  }

  downloadFile(lines.join('\n'), 'clipmark-obsidian.md', 'text/markdown');
}

async function exportNotionCSV() {
  const isPro = await checkPro();
  if (!isPro) { showToast('✦ Notion CSV export is a Pro feature. Upgrade to Clipmark Pro.'); return; }

  const header = 'Name,Video,URL,Tags,Notes,Date\n';
  const rows   = allBookmarks.map(b => {
    const url = `https://www.youtube.com/watch?v=${b.videoId}&t=${Math.floor(b.timestamp)}`;
    return [
      `${formatTimestamp(b.timestamp)} — ${(b.description || '').replace(/"/g, '""')}`,
      (b.videoTitle || '').replace(/"/g, '""'),
      url,
      (b.tags || []).join(', '),
      (b.notes || '').replace(/"/g, '""'),
      b.createdAt ? new Date(b.createdAt).toISOString().split('T')[0] : '',
    ].map(v => `"${v}"`).join(',');
  }).join('\n');

  downloadFile(header + rows, 'clipmark-notion.csv', 'text/csv');
}

async function exportReadingList() {
  const isPro = await checkPro();
  if (!isPro) { showToast('✦ Reading List export is a Pro feature. Upgrade to Clipmark Pro.'); return; }

  const groups = groupByVideo(allBookmarks);
  const lines  = ['Clipmark — Reading List Export', '='.repeat(40), ''];

  for (const [videoId, bookmarks] of Object.entries(groups)) {
    const title = bookmarks[0].videoTitle || videoId;
    lines.push(`▶ ${title}`, `   https://www.youtube.com/watch?v=${videoId}`, '');
    bookmarks.sort((a, b) => a.timestamp - b.timestamp).forEach(b => {
      lines.push(`   ${formatTimestamp(b.timestamp)}  ${b.description || 'No note'}`);
      if (b.notes?.trim()) lines.push(`   Note: ${b.notes}`);
    });
    lines.push('');
  }

  downloadFile(lines.join('\n'), 'clipmark-reading-list.txt', 'text/plain');
}

// ─── Import ───────────────────────────────────────────────────────────────────
async function importBookmarks(file) {
  try {
    const text     = await file.text();
    const imported = JSON.parse(text);

    if (!Array.isArray(imported)) throw new Error('Invalid format: expected an array');

    const existingIds = new Set(allBookmarks.map(b => b.id));
    const newOnes     = imported.filter(b => b.videoId && b.timestamp != null && !existingIds.has(b.id));

    if (newOnes.length === 0) {
      showToast('No new bookmarks to import', 'success');
      return;
    }

    const byVideo = {};
    newOnes.forEach(b => {
      if (!byVideo[b.videoId]) byVideo[b.videoId] = [];
      byVideo[b.videoId].push(b);
    });

    for (const [videoId, bookmarks] of Object.entries(byVideo)) {
      const key     = bmKey(videoId);
      const current = await new Promise(r => chrome.storage.sync.get({ [key]: [] }, r));
      const merged  = [...current[key], ...bookmarks];
      await new Promise((resolve, reject) =>
        chrome.storage.sync.set({ [key]: merged }, () => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else resolve();
        })
      );
    }

    await loadAllBookmarks();
    showToast(`Imported ${newOnes.length} bookmark${newOnes.length !== 1 ? 's' : ''}`, 'success');
  } catch (error) {
    showToast('Import failed: ' + error.message);
  }
}

// ─── Video Groups ─────────────────────────────────────────────────────────────
async function getVideoGroups() {
  return new Promise(resolve =>
    chrome.storage.sync.get({ vgroups: [] }, r => resolve(r.vgroups))
  );
}

async function saveVideoGroups(groups) {
  return new Promise(resolve => chrome.storage.sync.set({ vgroups: groups }, resolve));
}

async function createGroup(name) {
  const groups = await getVideoGroups();
  groups.push({ id: Date.now(), name, videoIds: [], createdAt: new Date().toISOString() });
  await saveVideoGroups(groups);
  return groups;
}

async function deleteGroup(groupId) {
  const groups = await getVideoGroups();
  await saveVideoGroups(groups.filter(g => g.id !== groupId));
}

async function renameGroup(groupId, name) {
  const groups = await getVideoGroups();
  const g = groups.find(g => g.id === groupId);
  if (g) { g.name = name; await saveVideoGroups(groups); }
}

async function toggleVideoInGroup(groupId, videoId) {
  const groups = await getVideoGroups();
  const g = groups.find(g => g.id === groupId);
  if (!g) return;
  const idx = g.videoIds.indexOf(videoId);
  if (idx === -1) g.videoIds.push(videoId);
  else g.videoIds.splice(idx, 1);
  await saveVideoGroups(groups);
}

// ─── Group Picker (floating dropdown) ────────────────────────────────────────
let activePicker = null;

async function showGroupPicker(videoId, anchorEl) {
  closeGroupPicker();
  const groups = await getVideoGroups();

  const picker = document.createElement('div');
  picker.id = 'group-picker';
  picker.className = 'group-picker';

  picker.innerHTML = `
    <div class="gp-title">Add to group</div>
    ${groups.length === 0
      ? '<div class="gp-empty">No groups yet</div>'
      : groups.map(g => `
          <label class="gp-item">
            <input type="checkbox" class="gp-cb" data-group-id="${g.id}"
              ${g.videoIds.includes(videoId) ? 'checked' : ''}>
            <span class="gp-name">${g.name}</span>
          </label>`).join('')}
    <div class="gp-new-row">
      <input type="text" class="gp-new-input" placeholder="New group…" maxlength="40">
      <button class="gp-new-btn">+</button>
    </div>`;

  document.body.appendChild(picker);
  activePicker = picker;

  const rect = anchorEl.getBoundingClientRect();
  picker.style.top  = `${rect.bottom + window.scrollY + 4}px`;
  picker.style.left = `${rect.left + window.scrollX}px`;

  picker.querySelectorAll('.gp-cb').forEach(cb => {
    cb.addEventListener('change', async () => {
      await toggleVideoInGroup(parseInt(cb.dataset.groupId), videoId);
    });
  });

  const newInput = picker.querySelector('.gp-new-input');
  const newBtn   = picker.querySelector('.gp-new-btn');
  const doCreate = async () => {
    const name = newInput.value.trim();
    if (!name) return;
    await createGroup(name);
    closeGroupPicker();
    showGroupPicker(videoId, anchorEl);
  };
  newBtn.addEventListener('click', doCreate);
  newInput.addEventListener('keydown', e => { if (e.key === 'Enter') doCreate(); });

  setTimeout(() => {
    document.addEventListener('click', outsidePickerHandler);
  }, 0);
}

function outsidePickerHandler(e) {
  if (activePicker && !activePicker.contains(e.target)) closeGroupPicker();
}

function closeGroupPicker() {
  if (activePicker) {
    activePicker.remove();
    activePicker = null;
    document.removeEventListener('click', outsidePickerHandler);
  }
}

// ─── Groups View ──────────────────────────────────────────────────────────────
async function renderGroupsView() {
  const container = document.getElementById('bookmarks-container');
  container.innerHTML = '';
  container.className = 'groups-view';

  const groups      = await getVideoGroups();
  const videoTitles = await getVideoTitles();

  const header = document.createElement('div');
  header.className = 'gv-header';
  header.innerHTML = `
    <span class="gv-header-title">My Groups</span>
    <button class="gv-new-btn" id="gv-new-group-btn">+ New Group</button>`;
  container.appendChild(header);

  const newGroupForm = document.createElement('div');
  newGroupForm.className = 'gv-new-form';
  newGroupForm.style.display = 'none';
  newGroupForm.innerHTML = `
    <input type="text" class="gv-new-input" placeholder="Group name…" maxlength="60">
    <button class="gv-create-btn">Create</button>
    <button class="gv-cancel-btn">Cancel</button>`;
  container.appendChild(newGroupForm);

  header.querySelector('#gv-new-group-btn').addEventListener('click', () => {
    newGroupForm.style.display = 'flex';
    newGroupForm.querySelector('.gv-new-input').focus();
  });
  newGroupForm.querySelector('.gv-cancel-btn').addEventListener('click', () => {
    newGroupForm.style.display = 'none';
  });
  newGroupForm.querySelector('.gv-create-btn').addEventListener('click', async () => {
    const name = newGroupForm.querySelector('.gv-new-input').value.trim();
    if (!name) return;
    await createGroup(name);
    renderGroupsView();
  });
  newGroupForm.querySelector('.gv-new-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') newGroupForm.querySelector('.gv-create-btn').click();
    if (e.key === 'Escape') newGroupForm.querySelector('.gv-cancel-btn').click();
  });

  if (groups.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">⊗</div>
      <h3>No groups yet</h3>
      <p>Create a group and add videos to organise your bookmarks like playlists.</p>`;
    container.appendChild(empty);
    return;
  }

  groups.forEach((group, groupIdx) => {
    const groupColor   = stringToColor(group.name);
    const groupBmCount = allBookmarks.filter(b => group.videoIds.includes(b.videoId)).length;

    const section = document.createElement('div');
    section.className = 'gv-section';
    section.style.setProperty('--gv-color', groupColor);

    const videoCards = group.videoIds.map(videoId => {
      const bookmarks = allBookmarks.filter(b => b.videoId === videoId);
      const title     = bookmarks[0]?.videoTitle || videoTitles[videoId] || videoId;
      const count     = bookmarks.length;
      const thumb     = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      const ytUrl     = `https://www.youtube.com/watch?v=${videoId}`;
      return `
        <div class="gv-video-card">
          <a href="${ytUrl}" target="_blank" rel="noopener">
            <img src="${thumb}" class="gv-thumb" loading="lazy">
          </a>
          <div class="gv-video-meta">
            <a class="gv-video-title" href="${ytUrl}" target="_blank" rel="noopener">${title}</a>
            <span class="gv-video-count">${count} bookmark${count !== 1 ? 's' : ''}</span>
          </div>
          <button class="gv-remove-video" data-group-id="${group.id}" data-video-id="${videoId}" title="Remove from group">✕</button>
        </div>`;
    }).join('') || '<p class="gv-no-videos">No videos in this group yet. Use ⊕ Group on a video card to add one.</p>';

    section.innerHTML = `
      <div class="gv-section-header">
        <span class="gv-section-name" data-group-id="${group.id}">${group.name}</span>
        <span class="gv-section-stats">${group.videoIds.length} video${group.videoIds.length !== 1 ? 's' : ''} · ${groupBmCount} bookmark${groupBmCount !== 1 ? 's' : ''}</span>
        <div class="gv-section-actions">
          <button class="gv-up-btn" data-idx="${groupIdx}" title="Move up" ${groupIdx === 0 ? 'disabled' : ''}>↑</button>
          <button class="gv-down-btn" data-idx="${groupIdx}" title="Move down" ${groupIdx === groups.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="gv-rename-btn" data-group-id="${group.id}" title="Rename">✎</button>
          <button class="gv-delete-btn" data-group-id="${group.id}" title="Delete group">🗑</button>
        </div>
      </div>
      <div class="gv-videos">${videoCards}</div>`;

    // Rename
    section.querySelector('.gv-rename-btn').addEventListener('click', () => {
      const nameEl = section.querySelector('.gv-section-name');
      const old    = nameEl.textContent;
      nameEl.contentEditable = 'true';
      nameEl.focus();
      const range = document.createRange();
      range.selectNodeContents(nameEl);
      window.getSelection().removeAllRanges();
      window.getSelection().addRange(range);
      const done = async () => {
        nameEl.contentEditable = 'false';
        const newName = nameEl.textContent.trim() || old;
        nameEl.textContent = newName;
        await renameGroup(group.id, newName);
      };
      nameEl.addEventListener('blur', done, { once: true });
      nameEl.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); nameEl.blur(); }
        if (ev.key === 'Escape') { nameEl.textContent = old; nameEl.blur(); }
      });
    });

    // Delete group
    section.querySelector('.gv-delete-btn').addEventListener('click', async () => {
      if (!confirm(`Delete group "${group.name}"?`)) return;
      await deleteGroup(group.id);
      renderGroupsView();
    });

    // Move up
    section.querySelector('.gv-up-btn').addEventListener('click', async () => {
      if (groupIdx === 0) return;
      const all = await getVideoGroups();
      [all[groupIdx - 1], all[groupIdx]] = [all[groupIdx], all[groupIdx - 1]];
      await saveVideoGroups(all);
      renderGroupsView();
    });

    // Move down
    section.querySelector('.gv-down-btn').addEventListener('click', async () => {
      const all = await getVideoGroups();
      if (groupIdx >= all.length - 1) return;
      [all[groupIdx], all[groupIdx + 1]] = [all[groupIdx + 1], all[groupIdx]];
      await saveVideoGroups(all);
      renderGroupsView();
    });

    // Remove video from group
    section.querySelectorAll('.gv-remove-video').forEach(btn => {
      btn.addEventListener('click', async () => {
        await toggleVideoInGroup(parseInt(btn.dataset.groupId), btn.dataset.videoId);
        renderGroupsView();
      });
    });

    container.appendChild(section);
  });

  // ── Auto Groups (tag-based, read-only) ────────────────────────────────────
  const tagMap = new Map();
  allBookmarks.forEach(b => {
    const tags = (b.tags && b.tags.length) ? b.tags : ['untagged'];
    tags.forEach(tag => {
      if (!tagMap.has(tag)) tagMap.set(tag, new Set());
      tagMap.get(tag).add(b.videoId);
    });
  });

  if (tagMap.size > 0) {
    const divider = document.createElement('hr');
    divider.className = 'gv-divider';
    container.appendChild(divider);

    const autoHeader = document.createElement('div');
    autoHeader.className = 'gv-header';
    autoHeader.innerHTML = `<span class="gv-header-title">Auto Groups <span style="font-size:11px;font-weight:400;color:#9ca3af;">— from your tags</span></span>`;
    container.appendChild(autoHeader);

    const sortedTags = Array.from(tagMap.entries()).sort((a, b) => b[1].size - a[1].size);
    sortedTags.forEach(([tag, videoIdSet]) => {
      const videoIds = Array.from(videoIdSet);
      const tagColor = getTagColor([tag]);
      const section = document.createElement('div');
      section.className = 'gv-section gv-section--auto';
      section.style.setProperty('--gv-color', tagColor);

      const videoCards = videoIds.map(videoId => {
        const bookmarks = allBookmarks.filter(b => b.videoId === videoId);
        const title = bookmarks[0]?.videoTitle || videoTitles[videoId] || videoId;
        const count = bookmarks.length;
        const thumb = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        const ytUrl = `https://www.youtube.com/watch?v=${videoId}`;
        return `
          <div class="gv-video-card">
            <a href="${ytUrl}" target="_blank" rel="noopener">
              <img src="${thumb}" class="gv-thumb" loading="lazy">
            </a>
            <div class="gv-video-meta">
              <a class="gv-video-title" href="${ytUrl}" target="_blank" rel="noopener">${title}</a>
              <span class="gv-video-count">${count} bookmark${count !== 1 ? 's' : ''}</span>
            </div>
          </div>`;
      }).join('');

      section.innerHTML = `
        <div class="gv-section-header">
          <span class="gv-tag-pill" style="background:${tagColor}22;color:${tagColor}">#${tag}</span>
          <span class="gv-section-stats">${videoIds.length} video${videoIds.length !== 1 ? 's' : ''}</span>
        </div>
        <div class="gv-videos">${videoCards}</div>`;
      container.appendChild(section);
    });
  }
}

// ─── Reminders badge ─────────────────────────────────────────────────────────
async function updateRevisitBadge() {
  const badges = [
    document.getElementById('revisit-badge'),
    document.getElementById('revisit-badge-side'),
  ].filter(Boolean);
  if (!badges.length) return;

  const token = await getValidToken();
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/api/reminders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const { due } = await res.json();
    const count = (due ?? []).length;
    badges.forEach(b => {
      b.textContent   = count;
      b.style.display = count > 0 ? '' : 'none';
    });
  } catch {}
}

// ─── Main load ────────────────────────────────────────────────────────────────
async function loadAllBookmarks() {
  try {
    allBookmarks = await getAllBookmarks();
    await renderBookmarks();
  } catch (error) {
    console.error('Error loading bookmarks:', error);
    showToast('Failed to load bookmarks');
  }
}

// ─── Active nav helper ────────────────────────────────────────────────────────
function setActiveNav(id) {
  document.querySelectorAll('.subnav-link').forEach(l => l.classList.remove('subnav-link--active'));
  const el = document.getElementById(id);
  if (el) el.classList.add('subnav-link--active');
}

// ─── Reminders View ──────────────────────────────────────────────────────────
async function renderRevisitView(container, highlightTargetId = null) {
  container.innerHTML = '<div class="loading-spinner">Loading reminders…</div>';
  container.className = 'reminders-view';

  const token = await getValidToken();
  if (!token) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <h3>Sign in to view reminders</h3>
        <p>Reminders sync with your Clipmark account.</p>
      </div>`;
    return;
  }

  let due = [], upcoming = [];
  try {
    const res = await fetch(`${API_BASE}/api/reminders`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('fetch failed');
    ({ due, upcoming } = await res.json());
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Could not load reminders</h3>
        <p>Check your connection and try again.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  // Page header
  const pageHeader = document.createElement('div');
  pageHeader.className = 'rm-page-header';
  pageHeader.innerHTML = `
    <h2 class="rm-page-title">Reminders &amp; Re-engagement</h2>
    <p class="rm-page-sub">Set intentional moments to revisit your curated content and keep your learning loop continuous.</p>`;
  container.appendChild(pageHeader);

  // Outer-scope refs shared between buildCreateForm() and makeCard()
  let rmVideoSelect, rmPreviewCard, rmPreviewEmpty, rmPreviewGroup, rmPreviewGroupName;
  let rmPreviewThumb, rmPreviewTitle, rmPreviewTags;
  let rmActiveTargetType = 'collection';

  function updatePreview(targetId, targetType) {
    if (!targetId) {
      if (rmPreviewCard)  rmPreviewCard.style.display  = 'none';
      if (rmPreviewGroup) rmPreviewGroup.style.display = 'none';
      if (rmPreviewEmpty) rmPreviewEmpty.style.display = 'flex';
      return;
    }
    if (targetType === 'group') {
      if (rmPreviewCard)  rmPreviewCard.style.display  = 'none';
      if (rmPreviewEmpty) rmPreviewEmpty.style.display = 'none';
      if (rmPreviewGroupName) rmPreviewGroupName.textContent = rmVideoSelect?.options[rmVideoSelect.selectedIndex]?.text ?? 'Group';
      if (rmPreviewGroup) rmPreviewGroup.style.display = 'flex';
      return;
    }
    // collection / video
    if (!allBookmarks.some(b => b.videoId === targetId)) {
      if (rmPreviewCard)  rmPreviewCard.style.display  = 'none';
      if (rmPreviewGroup) rmPreviewGroup.style.display = 'none';
      if (rmPreviewEmpty) rmPreviewEmpty.style.display = 'flex';
      return;
    }
    const bms = allBookmarks.filter(b => b.videoId === targetId);
    rmPreviewThumb.src = `https://img.youtube.com/vi/${targetId}/mqdefault.jpg`;
    rmPreviewTitle.textContent = bms[0].videoTitle || '';
    const tags = [...new Set(bms.flatMap(b => b.tags || []))].slice(0, 4);
    rmPreviewTags.innerHTML = tags.map(t =>
      `<span class="rm-preview-tag" style="background:${getTagColor([t])}18;color:${getTagColor([t])}">#${t}</span>`
    ).join('');
    if (rmPreviewGroup) rmPreviewGroup.style.display = 'none';
    if (rmPreviewEmpty) rmPreviewEmpty.style.display = 'none';
    if (rmPreviewCard)  rmPreviewCard.style.display  = 'block';
  }

  async function buildCreateForm() {
    const videoOptions = [...new Map(
      allBookmarks
        .filter(b => b.videoId && b.videoTitle)
        .map(b => [b.videoId, b.videoTitle])
    ).entries()]
      .map(([vid, title]) => `<option value="${vid}">${title.substring(0, 60)}</option>`)
      .join('');

    // Fetch groups for the Collection/Group tab
    let groups = [];
    try {
      const t = await getValidToken();
      if (t) {
        const res = await fetch(`${API_BASE}/api/groups`, { headers: { Authorization: `Bearer ${t}` } });
        if (res.ok) groups = await res.json();
      }
    } catch {}
    const groupOptions = groups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');

    const defaultDate = new Date().toISOString().split('T')[0];

    // ── Two-column wrapper ──
    const twoCol = document.createElement('div');
    twoCol.className = 'rm-two-col';

    // ── Left panel — Content Preview ──
    const leftPanel = document.createElement('div');
    leftPanel.className = 'rm-left-panel';
    leftPanel.innerHTML = `
      <div class="rm-preview-header">
        <span class="rm-preview-label">Content Preview</span>
        <button type="button" class="rm-preview-toggle">Hide ↑</button>
      </div>
      <div class="rm-preview-body">
        <div class="rm-content-preview-empty">
          <span class="material-symbols-outlined" style="font-size:36px;color:rgba(20,184,166,0.3)">auto_stories</span>
          <p class="rm-preview-empty-text">Select content below to preview it here.</p>
        </div>
        <div class="rm-preview-card" style="display:none">
          <div class="rm-preview-thumb-wrap">
            <span class="rm-clip-badge">ACTIVE CLIP</span>
            <img class="rm-preview-thumb" src="" alt="">
          </div>
          <div class="rm-preview-info">
            <p class="rm-preview-title"></p>
            <div class="rm-preview-tags"></div>
            <blockquote class="rm-preview-quote">&ldquo;The purpose of a reminder is not to complete a task, but to re-enter a state of curiosity.&rdquo;</blockquote>
          </div>
        </div>
        <div class="rm-preview-group" style="display:none">
          <span class="material-symbols-outlined rm-preview-group-icon">collections_bookmark</span>
          <p class="rm-preview-group-name"></p>
          <p class="rm-preview-group-sub">Shuffle through this thematic series.</p>
          <blockquote class="rm-preview-quote">&ldquo;The purpose of a reminder is not to complete a task, but to re-enter a state of curiosity.&rdquo;</blockquote>
        </div>
      </div>`;

    // ── Right panel — Form ──
    const rightPanel = document.createElement('div');
    rightPanel.className = 'rm-right-panel';
    rightPanel.innerHTML = `
      <form class="rm-create-form" id="rm-create-form">
        <div class="rm-form-row">
          <label>Target Type</label>
          <div class="rm-target-tabs">
            <button type="button" class="rm-target-tab rm-target-tab--active" data-type="collection">
              <span class="rm-target-tab-title">Specific Video</span>
              <span class="rm-target-tab-sub">Revisit a single curated masterpiece</span>
            </button>
            <button type="button" class="rm-target-tab" data-type="group">
              <span class="rm-target-tab-title">Collection/Group</span>
              <span class="rm-target-tab-sub">Shuffle through a thematic series</span>
            </button>
          </div>
          <input type="hidden" name="target_type" value="collection">
        </div>
        <div class="rm-form-row">
          <label>Select Content</label>
          <select name="target_id" class="rm-form-select rm-video-select">
            ${videoOptions || '<option value="">No videos yet</option>'}
          </select>
        </div>
        <div class="rm-form-row">
          <label>Frequency</label>
          <div class="rm-radio-group">
            <label class="rm-radio-label"><input type="radio" name="frequency" value="once" checked> One-time</label>
            <label class="rm-radio-label"><input type="radio" name="frequency" value="weekly"> Weekly</label>
            <label class="rm-radio-label"><input type="radio" name="frequency" value="biweekly"> Every 2 weeks</label>
            <label class="rm-radio-label"><input type="radio" name="frequency" value="monthly"> Monthly</label>
            <label class="rm-radio-label"><input type="radio" name="frequency" value="daily"> Daily</label>
          </div>
        </div>
        <div class="rm-form-row">
          <label>Start Date</label>
          <input type="date" name="next_due_at" class="rm-form-input" value="${defaultDate}">
        </div>
        <div class="rm-form-row">
          <label>Label <span class="rm-form-optional">(optional)</span></label>
          <input type="text" name="label" class="rm-form-input rm-label-input" placeholder="e.g. Review key points" maxlength="80">
        </div>
        <div class="rm-form-actions">
          <span class="rm-form-note">Your reminder will appear in your dashboard and inbox at 9:00 AM.</span>
          <div class="rm-form-btns">
            <button type="button" class="rm-btn-cancel-edit" id="rm-btn-cancel-edit" style="display:none">Cancel</button>
            <button type="submit" class="rm-form-submit" id="rm-form-submit">Set Reminder</button>
          </div>
        </div>
      </form>`;

    twoCol.appendChild(leftPanel);
    twoCol.appendChild(rightPanel);

    // Assign outer-scope refs
    rmVideoSelect      = rightPanel.querySelector('.rm-video-select');
    rmPreviewCard      = leftPanel.querySelector('.rm-preview-card');
    rmPreviewEmpty     = leftPanel.querySelector('.rm-content-preview-empty');
    rmPreviewGroup     = leftPanel.querySelector('.rm-preview-group');
    rmPreviewGroupName = leftPanel.querySelector('.rm-preview-group-name');
    rmPreviewThumb     = leftPanel.querySelector('.rm-preview-thumb');
    rmPreviewTitle     = leftPanel.querySelector('.rm-preview-title');
    rmPreviewTags      = leftPanel.querySelector('.rm-preview-tags');

    // Toggle collapse
    const previewBody    = leftPanel.querySelector('.rm-preview-body');
    const toggleBtn      = leftPanel.querySelector('.rm-preview-toggle');
    let previewCollapsed = false;
    toggleBtn.addEventListener('click', () => {
      previewCollapsed = !previewCollapsed;
      previewBody.style.display = previewCollapsed ? 'none' : '';
      toggleBtn.textContent = previewCollapsed ? 'Show ↓' : 'Hide ↑';
    });

    // Target type tab switching
    const typeInput = rightPanel.querySelector('input[name="target_type"]');
    rightPanel.querySelectorAll('.rm-target-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const type = tab.dataset.type;
        rmActiveTargetType = type;
        typeInput.value = type;
        rightPanel.querySelectorAll('.rm-target-tab').forEach(t => t.classList.remove('rm-target-tab--active'));
        tab.classList.add('rm-target-tab--active');
        if (type === 'group') {
          rmVideoSelect.innerHTML = groupOptions || '<option value="">No groups yet</option>';
        } else {
          rmVideoSelect.innerHTML = videoOptions || '<option value="">No videos yet</option>';
        }
        updatePreview(rmVideoSelect.value, type);
      });
    });

    rmVideoSelect?.addEventListener('change', e => updatePreview(e.target.value, rmActiveTargetType));

    // Auto-detect active YouTube tab and pre-fill (collection only)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url   = tabs?.[0]?.url ?? '';
      const match = url.match(/[?&]v=([^&]+)/);
      if (match && rmVideoSelect && rmActiveTargetType === 'collection') {
        const opt = [...rmVideoSelect.querySelectorAll('option')].find(o => o.value === match[1]);
        if (opt) { rmVideoSelect.value = match[1]; updatePreview(match[1], 'collection'); }
      }
    });

    const form      = rightPanel.querySelector('.rm-create-form');
    const submitBtn = form.querySelector('#rm-form-submit');
    const cancelBtn = form.querySelector('#rm-btn-cancel-edit');

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const editId     = submitBtn.dataset.editId;
      const formData   = new FormData(form);
      const target_type = formData.get('target_type');
      const target_id  = formData.get('target_id');
      const frequency  = formData.get('frequency');
      const dateRaw    = formData.get('next_due_at');
      const label      = formData.get('label');

      if (!target_id || !dateRaw) {
        showToast('Please fill in all required fields');
        return;
      }

      submitBtn.disabled    = true;
      submitBtn.textContent = editId ? 'Updating…' : 'Creating…';
      try {
        const t = await getValidToken();
        if (editId) {
          await fetch(`${API_BASE}/api/reminders/${editId}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${t}` },
          });
          delete submitBtn.dataset.editId;
        }
        const res = await fetch(`${API_BASE}/api/reminders`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
          body: JSON.stringify({
            target_type,
            target_id,
            frequency,
            next_due_at: new Date(dateRaw + 'T09:00:00').toISOString(),
            label: label || null,
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        cancelBtn.style.display = 'none';
        showToast(editId ? 'Reminder updated!' : 'Reminder created!', 'success');
        renderRevisitView(container, target_id);
        updateRevisitBadge();
      } catch {
        showToast('Failed to save reminder — try again');
        submitBtn.disabled    = false;
        submitBtn.textContent = 'Set Reminder';
      }
    });

    cancelBtn.addEventListener('click', () => {
      delete submitBtn.dataset.editId;
      submitBtn.textContent   = 'Set Reminder';
      cancelBtn.style.display = 'none';
      form.reset();
      form.querySelector('input[name="next_due_at"]').value               = defaultDate;
      form.querySelector('input[name="frequency"][value="once"]').checked = true;
      updatePreview(rmVideoSelect?.value ?? '', rmActiveTargetType);
    });

    return twoCol;
  }

  container.appendChild(await buildCreateForm());

  if (!due.length && !upcoming.length) {
    const empty = document.createElement('p');
    empty.className = 'rm-empty-note';
    empty.textContent = 'No reminders scheduled yet.';
    container.appendChild(empty);
    const footer = document.createElement('p');
    footer.className = 'rm-footer';
    footer.innerHTML = `<a href="${API_BASE}/dashboard/queue" target="_blank" rel="noopener">Manage in dashboard ↗</a>`;
    container.appendChild(footer);
    return;
  }

  async function markDone(reminderId, cardEl) {
    cardEl.style.opacity = '0.5';
    cardEl.style.pointerEvents = 'none';
    try {
      const t = await getValidToken();
      await fetch(`${API_BASE}/api/reminders/${reminderId}/done`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${t}` },
      });
    } catch {}
    renderRevisitView(container);
    updateRevisitBadge();
  }

  function makeCard(r, isDue) {
    const dueDate = new Date(r.next_due_at);
    const now = new Date();
    const diffDays = Math.round((dueDate - now) / 86400000);
    let dateLabel;
    if (isDue) {
      dateLabel = '<span class="rm-date-label rm-date-due">DUE NOW</span>';
    } else if (diffDays === 0) {
      dateLabel = `<span class="rm-date-label">TODAY, ${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    } else if (diffDays === 1) {
      dateLabel = `<span class="rm-date-label">TOMORROW, ${dueDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    } else {
      dateLabel = `<span class="rm-date-label">${dueDate.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</span>`;
    }

    const freqMap = { once: 'One-time', daily: 'Daily', weekly: 'Weekly', biweekly: 'Biweekly', monthly: 'Monthly' };
    const freqLabel = freqMap[r.frequency] || r.frequency;
    const thumbHtml = r.videoId
      ? `<img class="rm-card-thumb" src="https://img.youtube.com/vi/${r.videoId}/mqdefault.jpg" loading="lazy" alt="">`
      : '';

    const card = document.createElement('div');
    card.className = `rm-card${isDue ? ' rm-card--due' : ''}${r.target_id === highlightTargetId ? ' rm-card--highlight' : ''}`;
    card.innerHTML = `
      ${thumbHtml}
      <div class="rm-card-body">
        <div class="rm-card-meta">
          ${dateLabel}
          <span class="rm-freq-badge">${freqLabel}</span>
        </div>
        <div class="rm-card-title">${r.label || r.targetLabel || 'Unknown'}</div>
        ${r.label ? `<div class="rm-card-sub">${r.targetLabel}</div>` : ''}
        <div class="rm-card-actions">
          ${isDue && r.videoId ? `<a class="rm-btn rm-btn-revisit" href="https://www.youtube.com/watch?v=${r.videoId}" target="_blank" rel="noopener">Revisit ↗</a>` : ''}
          ${isDue ? `<button class="rm-btn rm-btn-done">Mark Done</button>` : ''}
          <button class="rm-btn rm-btn-edit">Edit →</button>
          <button class="rm-btn-delete" title="Delete">×</button>
        </div>
      </div>`;

    if (isDue) card.querySelector('.rm-btn-done').addEventListener('click', () => markDone(r.id, card));
    card.querySelector('.rm-btn-edit').addEventListener('click', () => {
      // Switch to correct target type tab
      const targetType = r.target_type ?? 'collection';
      rmActiveTargetType = targetType;
      container.querySelectorAll('.rm-target-tab').forEach(t => {
        t.classList.toggle('rm-target-tab--active', t.dataset.type === targetType);
      });
      const typeInput = container.querySelector('input[name="target_type"]');
      if (typeInput) typeInput.value = targetType;
      if (rmVideoSelect) rmVideoSelect.value = r.target_id;
      const freqRadio = container.querySelector(`input[name="frequency"][value="${r.frequency}"]`);
      if (freqRadio) freqRadio.checked = true;
      const dateInput = container.querySelector('input[name="next_due_at"]');
      if (dateInput) dateInput.value = r.next_due_at.split('T')[0];
      const labelInput = container.querySelector('.rm-label-input');
      if (labelInput) labelInput.value = r.label ?? '';
      const submitBtn = container.querySelector('#rm-form-submit');
      if (submitBtn) { submitBtn.textContent = 'Update Reminder'; submitBtn.dataset.editId = r.id; }
      const cancelBtn = container.querySelector('#rm-btn-cancel-edit');
      if (cancelBtn) cancelBtn.style.display = 'inline-flex';
      updatePreview(r.target_id, targetType);
      container.querySelector('.rm-two-col')?.scrollIntoView({ behavior: 'smooth' });
    });
    card.querySelector('.rm-btn-delete').addEventListener('click', async () => {
      card.style.opacity = '0.5';
      card.style.pointerEvents = 'none';
      try {
        const t = await getValidToken();
        await fetch(`${API_BASE}/api/reminders/${r.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${t}` },
        });
      } catch {}
      renderRevisitView(container);
      updateRevisitBadge();
    });
    return card;
  }

  if (due.length) {
    const section = document.createElement('div');
    section.className = 'rm-section';
    section.innerHTML = '<h3 class="rm-section-title rm-section-title--due">Due Now</h3>';
    due.forEach(r => section.appendChild(makeCard(r, true)));
    container.appendChild(section);
  }

  if (upcoming.length) {
    const section = document.createElement('div');
    section.className = 'rm-section';
    section.innerHTML = `
      <div class="rm-section-header">
        <h3 class="rm-section-title">Active Schedule</h3>
        <a class="rm-section-link" href="${API_BASE}/dashboard/queue" target="_blank" rel="noopener">View Full Calendar ↗</a>
      </div>`;
    upcoming.forEach(r => section.appendChild(makeCard(r, false)));
    container.appendChild(section);
  }

  const footer = document.createElement('p');
  footer.className = 'rm-footer';
  footer.innerHTML = `<a href="${API_BASE}/dashboard/queue" target="_blank" rel="noopener">Manage all reminders ↗</a>`;
  container.appendChild(footer);
}

// ─── Videos View ─────────────────────────────────────────────────────────────
async function renderVideosView(container) {
  container.innerHTML = '';
  container.className = 'videos-view';

  if (allBookmarks.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📹</div>
        <h3>No videos yet</h3>
        <p>Save bookmarks from YouTube videos to see them here.</p>
      </div>`;
    return;
  }

  const [videoTitles] = await Promise.all([getVideoTitles()]);
  const grouped  = groupByVideo(allBookmarks);
  const videoIds = Object.keys(grouped).sort((a, b) =>
    Math.max(...grouped[b].map(x => x.id)) - Math.max(...grouped[a].map(x => x.id))
  );

  const header = document.createElement('div');
  header.className = 'vv-header';
  header.innerHTML = `<span class="vv-header-title">Videos</span><span class="vv-header-count">${videoIds.length}</span>`;
  container.appendChild(header);

  const grid = document.createElement('div');
  grid.className = 'vv-grid';

  videoIds.forEach(videoId => {
    const bookmarks = grouped[videoId];
    const title     = bookmarks[0].videoTitle || videoTitles[videoId] || `Video: ${videoId}`;
    const thumb     = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
    const count     = bookmarks.length;
    const lastSaved = Math.max(...bookmarks.map(b => b.id));

    const allTags = [...new Set(bookmarks.flatMap(b => b.tags || []))];
    const tagBadges = allTags.slice(0, 4).map(t =>
      `<span class="tag-badge" style="background:${getTagColor([t])}18;color:${getTagColor([t])}">#${t}</span>`
    ).join('');

    const card = document.createElement('div');
    card.className = 'vv-card';
    card.innerHTML = `
      <div class="vv-thumb-wrap">
        <img src="${thumb}" alt="${title}" class="vv-thumb" loading="lazy">
        <span class="vv-count-badge">${count} bookmark${count !== 1 ? 's' : ''}</span>
      </div>
      <div class="vv-meta">
        <div class="vv-title">${title}</div>
        <div class="vv-sub">${relativeTime(lastSaved)}</div>
        ${tagBadges ? `<div class="vv-tags">${tagBadges}</div>` : ''}
      </div>`;

    card.addEventListener('click', () => {
      filterVideoId = videoId;
      viewMode = 'cards';
      localStorage.setItem('bm_viewMode', viewMode);
      setActiveNav('subnav-all-side');
      updateViewToggle();
      renderBookmarks();
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ─── Shared Collections View ──────────────────────────────────────────────────
async function renderSharedView(container) {
  container.innerHTML = '<div class="loading-spinner">Loading shared collections…</div>';
  container.className = 'shared-view';

  const token = await getValidToken();
  if (!token) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <h3>Sign in to view shared collections</h3>
        <p>Collections you share from YouTube will appear here.</p>
      </div>`;
    return;
  }

  let collections = [];
  try {
    const res = await fetch(`${API_BASE}/api/shared`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('fetch failed');
    collections = await res.json();
  } catch {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <h3>Could not load collections</h3>
        <p>Check your connection and try again.</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'sh-header';
  header.innerHTML = `<span class="sh-header-title">Shared Collections</span><span class="sh-header-count">${collections.length}</span>`;
  container.appendChild(header);

  if (!collections.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-state';
    empty.innerHTML = `
      <div class="empty-state-icon">📤</div>
      <h3>No shared collections yet</h3>
      <p>Use the popup on a YouTube video to share your bookmarks.</p>`;
    container.appendChild(empty);
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'sh-grid';

  collections.forEach(col => {
    const thumb = col.video_id
      ? `https://img.youtube.com/vi/${col.video_id}/mqdefault.jpg`
      : '';
    const shareUrl = `${API_BASE}/v/${col.id}`;

    const card = document.createElement('div');
    card.className = 'sh-card';
    card.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="${col.video_title}" class="sh-thumb" loading="lazy">` : '<div class="sh-thumb sh-thumb--placeholder"></div>'}
      <div class="sh-card-body">
        <div class="sh-card-title">${col.video_title}</div>
        <div class="sh-card-meta">
          <span>${col.bookmark_count} bookmark${col.bookmark_count !== 1 ? 's' : ''}</span>
          <span>${col.view_count} view${col.view_count !== 1 ? 's' : ''}</span>
        </div>
        <div class="sh-card-actions">
          <button class="sh-btn sh-btn-copy" data-url="${shareUrl}">Copy Link</button>
          <a class="sh-btn sh-btn-open" href="${shareUrl}" target="_blank" rel="noopener">Open ↗</a>
        </div>
      </div>`;

    card.querySelector('.sh-btn-copy').addEventListener('click', async function() {
      try {
        await navigator.clipboard.writeText(this.dataset.url);
        this.textContent = 'Copied!';
        setTimeout(() => { this.textContent = 'Copy Link'; }, 2000);
      } catch {}
    });

    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// ─── View toggle ──────────────────────────────────────────────────────────────
function updateViewToggle() {
  document.getElementById('view-cards').classList.toggle('view-btn--active',    viewMode === 'cards');
  document.getElementById('view-timeline').classList.toggle('view-btn--active', viewMode === 'timeline');

  // Sync sidebar active state with toolbar view toggles
  if (viewMode === 'analytics') setActiveNav('subnav-analytics-side');
  else if (viewMode === 'groups') setActiveNav('subnav-groups-side');
  else if (viewMode === 'revisit') setActiveNav('subnav-revisit-side');
  else if (viewMode === 'videos') setActiveNav('subnav-videos-side');
  else setActiveNav('subnav-all-side');

  const hideToolbar = viewMode === 'groups' || viewMode === 'videos';
  document.getElementById('search-input').style.display = hideToolbar ? 'none' : '';
  document.getElementById('sort-select').style.display  = hideToolbar ? 'none' : '';
}

function updateCardSizeBtn() {
  const btn = document.getElementById('density-btn');
  if (!btn) return;
  const labels = { large: 'L', medium: 'M', small: 'S' };
  btn.title       = `Card size: ${cardSize}`;
  btn.textContent = labels[cardSize] || 'L';
}

// ─── Export popover ───────────────────────────────────────────────────────────
let exportPopoverOpen = false;

function toggleExportPopover(forceClose = false) {
  const popover = document.getElementById('export-popover');
  const btn     = document.getElementById('overflow-btn');
  if (!popover) return;
  exportPopoverOpen = forceClose ? false : !exportPopoverOpen;
  popover.classList.toggle('export-popover--open', exportPopoverOpen);
  if (exportPopoverOpen) {
    const rect = btn.getBoundingClientRect();
    popover.style.top  = `${rect.bottom + window.scrollY + 6}px`;
    popover.style.left = `${Math.max(8, rect.right + window.scrollX - 200)}px`;
    setTimeout(() => document.addEventListener('click', outsidePopoverHandler), 0);
  } else {
    document.removeEventListener('click', outsidePopoverHandler);
  }
}

function outsidePopoverHandler(e) {
  const popover = document.getElementById('export-popover');
  const btn     = document.getElementById('overflow-btn');
  if (popover && !popover.contains(e.target) && e.target !== btn) {
    exportPopoverOpen = false;
    popover.classList.remove('export-popover--open');
    document.removeEventListener('click', outsidePopoverHandler);
  }
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
async function loadAuthState() {
  const { bmUser } = await new Promise(resolve => chrome.storage.sync.get({ bmUser: null }, resolve));
  const signinBtn  = document.getElementById('signin-btn');
  const userChip   = document.getElementById('user-chip');
  const signoutBtn = document.getElementById('signout-btn');
  const syncBtn    = document.getElementById('sync-btn');
  const upgradeBtn = document.getElementById('dashboard-upgrade-btn');
  if (!signinBtn || !userChip) return;

  const signoutBtnSide = document.getElementById('signout-btn-side');
  const upgradeLink    = document.querySelector('.side-nav-upgrade');

  if (bmUser) {
    signinBtn.style.display  = 'none';
    userChip.style.display   = '';
    userChip.textContent     = (bmUser.userEmail?.[0] || '?').toUpperCase();
    userChip.title           = bmUser.userEmail || '';
    if (signoutBtn)     signoutBtn.style.display     = '';
    if (signoutBtnSide) signoutBtnSide.style.display = '';
    if (syncBtn)        syncBtn.style.display        = '';
    if (upgradeBtn)     upgradeBtn.style.display     = bmUser.isPro ? 'none' : '';
    if (upgradeLink) {
      upgradeLink.querySelector('span:last-child').textContent =
        bmUser.isPro ? 'Manage Subscription' : 'Upgrade';
    }

    // Silently validate/refresh token — sign out if session is fully expired
    const token = await getValidToken();
    if (!token) {
      await new Promise(resolve => chrome.storage.sync.remove('bmUser', resolve));
      loadAuthState();
    }
  } else {
    signinBtn.style.display  = '';
    userChip.style.display   = 'none';
    if (signoutBtn)     signoutBtn.style.display     = 'none';
    if (signoutBtnSide) signoutBtnSide.style.display = 'none';
    if (syncBtn)        syncBtn.style.display        = 'none';
    if (upgradeBtn)     upgradeBtn.style.display     = '';
    if (upgradeLink) {
      upgradeLink.querySelector('span:last-child').textContent = 'Upgrade';
    }
  }
}

async function syncAllWithCloud() {
  const token = await getValidToken();
  if (!token) return 0;

  // Fetch all bookmarks from cloud in a single request
  const cloudRes = await fetch(`${API_BASE}/api/bookmarks`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!cloudRes.ok) return 0;
  const { videos: cloudVideos } = await cloudRes.json();

  const allData = await new Promise(resolve => chrome.storage.sync.get(null, resolve));
  const cloudVideoIds = new Set((cloudVideos || []).map(v => v.videoId));
  const localVideoIds = Object.keys(allData)
    .filter(k => k.startsWith('bm_') && Array.isArray(allData[k]))
    .map(k => k.slice(3));

  let updatedCount = 0;

  // Merge cloud → local for every video in cloud (handles new-device case where local is empty)
  for (const { videoId, bookmarks: cloudBms } of (cloudVideos || [])) {
    try {
      const localBms = allData[bmKey(videoId)] || [];
      const localIds = new Set(localBms.map(b => b.id));
      const newFromCloud = (cloudBms || []).filter(b => !localIds.has(b.id));
      if (!newFromCloud.length) continue;

      const merged = [...localBms, ...newFromCloud];
      await new Promise(resolve => chrome.storage.sync.set({ [bmKey(videoId)]: merged }, resolve));
      updatedCount++;
    } catch { /* skip this video */ }
  }

  // Push any local-only videos to cloud
  for (const videoId of localVideoIds) {
    if (cloudVideoIds.has(videoId)) continue;
    const localBms = allData[bmKey(videoId)] || [];
    if (!localBms.length) continue;
    try {
      await fetch(`${API_BASE}/api/bookmarks`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ videoId, bookmarks: localBms }),
      });
    } catch { /* skip this video */ }
  }

  return updatedCount;
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // ── Theme Toggle (hidden) ────────────────────────────────────────────────────
  // function initTheme() {
  //   chrome.storage.local.get(['theme'], (result) => {
  //     const theme = result.theme || 'light';
  //     document.documentElement.setAttribute('data-theme', theme);
  //     updateThemeIcon(theme);
  //   });
  // }
  // function updateThemeIcon(theme) {
  //   const icon = document.querySelector('.theme-icon');
  //   if (icon) { icon.textContent = theme === 'dark' ? '🌙' : '☀️'; }
  // }
  // function toggleTheme() {
  //   const current = document.documentElement.getAttribute('data-theme') || 'light';
  //   const newTheme = current === 'light' ? 'dark' : 'light';
  //   document.documentElement.setAttribute('data-theme', newTheme);
  //   chrome.storage.local.set({ theme: newTheme });
  //   updateThemeIcon(newTheme);
  // }
  // initTheme();
  // const themeToggleBtn = document.getElementById('theme-toggle');
  // if (themeToggleBtn) { themeToggleBtn.addEventListener('click', toggleTheme); }

  // ── Sidebar collapse ────────────────────────────────────────────────────────
  const sideNav  = document.querySelector('.bm-side-nav');
  const mainEl   = document.querySelector('.bm-main');
  const collapseBtn = document.getElementById('sidebar-collapse-btn');

  function applySidebarCollapse(collapsed) {
    sideNav?.classList.toggle('bm-side-nav--collapsed', collapsed);
    mainEl?.classList.toggle('bm-main--nav-collapsed', collapsed);
    if (collapseBtn) {
      const icon = collapseBtn.querySelector('.material-symbols-outlined');
      if (icon) icon.textContent = collapsed ? 'chevron_right' : 'chevron_left';
    }
  }

  const storedCollapse = localStorage.getItem('sidebarCollapsed') === 'true';
  applySidebarCollapse(storedCollapse);

  collapseBtn?.addEventListener('click', () => {
    const next = !sideNav?.classList.contains('bm-side-nav--collapsed');
    applySidebarCollapse(next);
    localStorage.setItem('sidebarCollapsed', String(next));
  });

  // ── Auth ────────────────────────────────────────────────────────────────────
  loadAuthState();

  document.getElementById('signin-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: `${API_BASE}/signin?extensionId=${chrome.runtime.id}` });
  });

  document.getElementById('signout-btn')?.addEventListener('click', () => {
    chrome.storage.sync.remove('bmUser', () => loadAuthState());
  });

  document.getElementById('signout-btn-side')?.addEventListener('click', () => {
    chrome.storage.sync.remove('bmUser', () => loadAuthState());
  });

  document.getElementById('sync-btn')?.addEventListener('click', async () => {
    const btn  = document.getElementById('sync-btn');
    const icon = btn?.querySelector('.sync-btn-icon');
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    if (icon) icon.classList.add('spin');
    try {
      const updated = await syncAllWithCloud();
      if (updated > 0) {
        await renderBookmarks();
        showToast(`Synced ${updated} video${updated === 1 ? '' : 's'} from cloud`, 'success');
      } else {
        showToast('Already up to date', 'success');
      }
    } catch {
      showToast('Sync failed — try again', 'error');
    } finally {
      btn.disabled = false;
      if (icon) icon.classList.remove('spin');
    }
  });

  updateViewToggle();
  updateCardSizeBtn();
  // Silently pull all cloud bookmarks on open so cross-device data is available immediately
  loadAllBookmarks();
  syncAllWithCloud().then(updated => {
    if (updated > 0) loadAllBookmarks();
  }).catch(() => {});
  renderSavedFilterPills();
  updateRevisitBadge();

  // Search (header input)
  document.getElementById('search-input').addEventListener('input', e => {
    filterQuery = e.target.value.trim();
    const toolbarInput = document.getElementById('search-input-toolbar');
    if (toolbarInput) toolbarInput.value = e.target.value;
    updateSaveFilterBtn();
    renderBookmarks();
  });

  // Search (toolbar input — synced to header search)
  document.getElementById('search-input-toolbar')?.addEventListener('input', e => {
    filterQuery = e.target.value.trim();
    const headerInput = document.getElementById('search-input');
    if (headerInput) headerInput.value = e.target.value;
    updateSaveFilterBtn();
    renderBookmarks();
  });

  // Save filter (Pro)
  document.getElementById('save-filter-btn').addEventListener('click', async () => {
    const isPro = await checkPro();
    if (!isPro) { showToast('✦ Saved Filters is a Pro feature. Upgrade to Clipmark Pro.'); return; }
    const name = prompt('Name this filter:', filterQuery);
    if (!name || !name.trim()) return;
    await saveSavedSearch(name.trim(), filterQuery, sortOrder);
    await renderSavedFilterPills();
    showToast('Filter saved!', 'success');
  });

  // Sort
  document.getElementById('sort-select').addEventListener('change', e => {
    sortOrder = e.target.value;
    renderBookmarks();
  });

  // Bulk delete
  document.getElementById('bulk-delete-btn').addEventListener('click', async () => {
    if (selectedIds.size === 0) return;
    const btn   = document.getElementById('bulk-delete-btn');
    const count = selectedIds.size;
    btn.disabled = true;
    try {
      for (const key of [...selectedIds]) {
        const [videoId, bookmarkIdStr] = key.split(':');
        const bookmarkId = parseInt(bookmarkIdStr);
        await deleteBookmark(videoId, bookmarkId);
        allBookmarks = allBookmarks.filter(b => !(b.videoId === videoId && b.id === bookmarkId));
      }
      selectedIds.clear();
      await renderBookmarks();
      showToast(`Deleted ${count} bookmark${count !== 1 ? 's' : ''}`, 'success');
    } catch {
      showToast('Failed to delete some bookmarks');
      btn.disabled = false;
    }
  });

  // View toggles
  document.getElementById('view-cards').addEventListener('click', () => {
    viewMode = 'cards'; localStorage.setItem('bm_viewMode', viewMode);
    updateViewToggle(); renderBookmarks();
  });
  document.getElementById('view-timeline').addEventListener('click', () => {
    viewMode = 'timeline'; localStorage.setItem('bm_viewMode', viewMode);
    updateViewToggle(); renderBookmarks();
  });
  // Card size toggle
  document.getElementById('density-btn').addEventListener('click', () => {
    const cycle = { large: 'medium', medium: 'small', small: 'large' };
    cardSize = cycle[cardSize] || 'large';
    localStorage.setItem('bm_cardSize', cardSize);
    updateCardSizeBtn();
    renderBookmarks();
  });

  // Overflow / export popover
  document.getElementById('overflow-btn').addEventListener('click', e => {
    e.stopPropagation();
    toggleExportPopover();
  });

  // Export buttons (all close popover after click)
  const withClose = fn => () => { fn(); toggleExportPopover(true); };
  document.getElementById('export-json').addEventListener('click', withClose(exportJSON));
  document.getElementById('export-csv').addEventListener('click',  withClose(exportCSV));
  document.getElementById('export-md').addEventListener('click',   withClose(exportMarkdown));
  document.getElementById('export-obsidian').addEventListener('click',   () => { exportObsidian(); toggleExportPopover(true); });
  document.getElementById('export-notion-csv').addEventListener('click', () => { exportNotionCSV(); toggleExportPopover(true); });
  document.getElementById('export-reading').addEventListener('click',    () => { exportReadingList(); toggleExportPopover(true); });

  // Import
  const importInput = document.getElementById('import-input');
  document.getElementById('import-btn').addEventListener('click', () => {
    importInput.click();
    toggleExportPopover(true);
  });
  importInput.addEventListener('change', e => {
    if (e.target.files[0]) {
      importBookmarks(e.target.files[0]);
      importInput.value = '';
    }
  });

  // Subnav — All Bookmarks (header)
  document.getElementById('subnav-all').addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'cards';
    localStorage.setItem('bm_viewMode', 'cards');
    setActiveNav('subnav-all');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — All Bookmarks (sidebar)
  document.getElementById('subnav-all-side').addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'cards';
    localStorage.setItem('bm_viewMode', 'cards');
    setActiveNav('subnav-all-side');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — Revisit Queue (header)
  document.getElementById('subnav-revisit').addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'revisit';
    setActiveNav('subnav-revisit');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — Revisit Queue (sidebar)
  document.getElementById('subnav-revisit-side').addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'revisit';
    setActiveNav('subnav-revisit-side');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — Videos (sidebar)
  document.getElementById('subnav-videos-side').addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'videos';
    setActiveNav('subnav-videos-side');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — Groups (sidebar)
  document.getElementById('subnav-groups-side').addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'groups';
    localStorage.setItem('bm_viewMode', viewMode);
    setActiveNav('subnav-groups-side');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — Analytics (sidebar)
  document.getElementById('subnav-analytics-side')?.addEventListener('click', () => {
    filterVideoId = null;
    viewMode = 'analytics';
    localStorage.setItem('bm_viewMode', viewMode);
    setActiveNav('subnav-analytics-side');
    updateViewToggle();
    renderBookmarks();
  });

  // Subnav — Shared (sidebar) → inline shared collections view
  document.getElementById('subnav-shared-side').addEventListener('click', () => {
    filterVideoId = null;
    setActiveNav('subnav-shared-side');
    const container = document.getElementById('bookmarks-container');
    renderSharedView(container);
  });

  // Mobile bottom nav
  document.getElementById('mobile-nav-bookmarks').addEventListener('click', e => {
    e.preventDefault();
    filterVideoId = null;
    if (viewMode === 'revisit' || viewMode === 'videos') viewMode = 'cards';
    setActiveNav('subnav-all-side');
    updateViewToggle();
    renderBookmarks();
  });
  document.getElementById('mobile-nav-queue').addEventListener('click', e => {
    e.preventDefault();
    filterVideoId = null;
    viewMode = 'revisit';
    setActiveNav('subnav-revisit-side');
    updateViewToggle();
    renderBookmarks();
  });
  document.getElementById('mobile-nav-groups').addEventListener('click', e => {
    e.preventDefault();
    filterVideoId = null;
    viewMode = 'groups';
    localStorage.setItem('bm_viewMode', viewMode);
    setActiveNav('subnav-groups-side');
    updateViewToggle();
    renderBookmarks();
  });

  // ─── Live Sync with Side Panel ────────────────────────────────────────────────
  // Listen for storage changes from side panel and refresh automatically
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync') {
      console.log('[Bookmarks] Storage changed from side panel, auto-refreshing');
      renderBookmarks();
      if (changes.bmUser) loadAuthState();
    }
  });
});
