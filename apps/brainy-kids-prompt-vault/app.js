(function () {
  'use strict';

  const SUBJECTS = [
    'Math',
    'Reading & Phonics',
    'Writing',
    'Science',
    'Social Studies',
    'Logic & Critical Thinking',
    'Art & Creativity',
    'SEL & Life Skills',
  ];

  const GRADES = ['PreK–K', 'Grade 1–2', 'Grade 3–4', 'Grade 5–6'];

  const TYPES = [
    'Practice Drill',
    'Puzzle Page',
    'Story-Based Worksheet',
    'Real-World Activity',
    'Mini-Project',
    'Quick Assessment',
  ];

  const THEMES = [
    { name: 'Detective Mystery', color: '#2A9D8F' },
    { name: 'Cozy Bakery', color: '#B5651D' },
    { name: 'Dinosaur World', color: '#3E885B' },
    { name: 'Jungle Safari', color: '#2E8B57' },
    { name: 'Fairy-Tale Castle', color: '#6A4C93' },
    { name: 'Robot Lab', color: '#277DA1' },
    { name: 'Sports Stadium', color: '#E63946' },
    { name: 'Outer Space', color: '#6C4AB6' },
    { name: 'Superhero City', color: '#3A86FF' },
    { name: 'Farm Friends', color: '#BC4749' },
    { name: 'Under the Sea', color: '#0E7C9B' },
    { name: 'Four Seasons', color: '#80B918' },
  ];

  const THEME_MAP = Object.fromEntries(THEMES.map((t) => [t.name, t.color]));
  const PAGE_SIZE = 60;
  const STATE_KEY = 'bkpv_state_v1';
  const REQUIRED_KEYS = ['n', 'subject', 'grade', 'type', 'theme', 'skill', 'content'];

  const app = {
    prompts: [],
    filtered: [],
    filters: { subjects: [], grades: [], themes: [], types: [] },
    onlySaved: false,
    hideUsed: false,
    searchQuery: '',
    sort: 'n_asc',
    visibleCount: PAGE_SIZE,
    drawerPrompt: null,
    userState: {
      favorites: [],
      used: [],
      notes: {},
      ui: { tipsBanner: null, lastSort: 'n_asc' },
    },
  };

  let searchDebounceTimer = null;
  let notesDebounceTimer = null;
  let eventsBound = false;

  const $ = (sel) => document.querySelector(sel);

  const els = {
    loadingScreen: $('#loading-screen'),
    loadingMessage: $('#loading-message'),
    errorScreen: $('#error-screen'),
    errorMessage: $('#error-message'),
    retryLoad: $('#retry-load'),
    app: $('#app'),
    tipsBanner: $('#tips-banner'),
    tipsDismiss: $('#tips-dismiss'),
    warningBanner: $('#warning-banner'),
    offlineBadge: $('#offline-badge'),
    totalCount: $('#total-count'),
    searchInput: $('#search-input'),
    searchClear: $('#search-clear'),
    reloadData: $('#reload-data'),
    helpBtn: $('#help-btn'),
    helpModal: $('#help-modal'),
    helpClose: $('#help-close'),
    sidebar: $('#sidebar'),
    sidebarToggle: $('#sidebar-toggle'),
    sidebarClose: $('#sidebar-close'),
    sidebarBackdrop: $('#sidebar-backdrop'),
    filterGroups: $('#filter-groups'),
    filterSaved: $('#filter-saved'),
    filterHideUsed: $('#filter-hide-used'),
    resetFilters: $('#reset-filters'),
    statsText: $('#stats-text'),
    sortSelect: $('#sort-select'),
    activeChips: $('#active-chips'),
    promptList: $('#prompt-list'),
    emptyState: $('#empty-state'),
    loadMore: $('#load-more'),
    drawerOverlay: $('#drawer-overlay'),
    drawer: $('#drawer'),
    drawerClose: $('#drawer-close'),
    drawerMeta: $('#drawer-meta'),
    drawerTitle: $('#drawer-title'),
    drawerTags: $('#drawer-tags'),
    drawerContent: $('#drawer-content'),
    drawerNotes: $('#drawer-notes'),
    notesSaved: $('#notes-saved'),
    drawerFavorite: $('#drawer-favorite'),
    drawerUsed: $('#drawer-used'),
    drawerCopy: $('#drawer-copy'),
    relatedSection: $('#related-section'),
    relatedList: $('#related-list'),
    toastContainer: $('#toast-container'),
  };

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function padNum(n) {
    return String(n).padStart(3, '0');
  }

  function normalizeGrade(grade) {
    return grade.replace(/-/g, '–');
  }

  function loadUserState() {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      app.userState = {
        favorites: parsed.favorites || [],
        used: parsed.used || [],
        notes: parsed.notes || {},
        ui: { tipsBanner: parsed.ui?.tipsBanner ?? null, lastSort: parsed.ui?.lastSort || 'n_asc' },
      };
    } catch {
      app.userState = { favorites: [], used: [], notes: {}, ui: { tipsBanner: null, lastSort: 'n_asc' } };
    }
  }

  function saveUserState() {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify(app.userState));
    } catch (e) {
      console.warn('Could not save state', e);
    }
  }

  function isFavorite(n) {
    return app.userState.favorites.includes(n);
  }

  function isUsed(n) {
    return app.userState.used.includes(n);
  }

  function toggleFavorite(n) {
    const idx = app.userState.favorites.indexOf(n);
    if (idx >= 0) app.userState.favorites.splice(idx, 1);
    else app.userState.favorites.push(n);
    saveUserState();
    refresh();
    if (app.drawerPrompt?.n === n) updateDrawerActions();
  }

  function toggleUsed(n) {
    const idx = app.userState.used.indexOf(n);
    if (idx >= 0) app.userState.used.splice(idx, 1);
    else app.userState.used.push(n);
    saveUserState();
    refresh();
    if (app.drawerPrompt?.n === n) updateDrawerActions();
  }

  function renderForCopy(content) {
    return content
      .replace(/\*\*\*\*&\*\*\*\*/g, '&')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/^• /gm, '• ');
  }

  function renderForDisplay(content) {
    const cleaned = content.replace(/\*\*\*\*&\*\*\*\*/g, '&');
    const lines = cleaned.split('\n');
    let html = '';
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (inList) { html += '</ul>'; inList = false; }
        continue;
      }

      const boldMatch = trimmed.match(/^\*\*(.+)\*\*$/);
      if (boldMatch) {
        if (inList) { html += '</ul>'; inList = false; }
        html += `<strong>${escapeHtml(boldMatch[1])}</strong>`;
        continue;
      }

      if (trimmed.startsWith('• ')) {
        if (!inList) { html += '<ul>'; inList = true; }
        html += `<li>${escapeHtml(trimmed.slice(2))}</li>`;
        continue;
      }

      if (inList) { html += '</ul>'; inList = false; }
      html += `<p>${escapeHtml(trimmed)}</p>`;
    }

    if (inList) html += '</ul>';
    return html;
  }

  async function loadPrompts() {
    if (window.VAULT_PROMPTS) {
      return window.VAULT_PROMPTS;
    }
    return loadFromFetch();
  }

  async function loadFromFetch() {
    const res = await fetch('./prompts.json');
    if (!res.ok) throw new Error('fetch failed');
    return res.json();
  }

  function validateData(data) {
    if (!Array.isArray(data)) {
      showToast('Invalid data: expected an array');
      return false;
    }
    if (data.length !== 700) {
      showWarning(`Expected 700 prompts, found ${data.length}. Rendering anyway.`);
    }
    const first = data[0];
    if (first && !REQUIRED_KEYS.every((k) => k in first)) {
      showToast('Invalid data: missing required fields');
      return false;
    }
    return true;
  }

  function normalizeData(data) {
    data.forEach((p) => {
      p.grade = normalizeGrade(p.grade);
    });
    return data;
  }

  function showWarning(msg) {
    els.warningBanner.textContent = msg;
    els.warningBanner.classList.remove('hidden');
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    els.toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  async function initData() {
    loadUserState();
    app.sort = app.userState.ui.lastSort || 'n_asc';
    els.sortSelect.value = app.sort;

    try {
      const data = await loadPrompts();
      if (!validateData(data)) {
        return showLoadError('Invalid prompt data format.');
      }
      app.prompts = normalizeData(data);
    } catch {
      return showLoadError('Make sure prompts.js is in the same folder as index.html.');
    }

    finishInit();
  }

  function showLoadError(message) {
    els.loadingScreen.classList.add('hidden');
    els.errorMessage.textContent = message;
    els.errorScreen.classList.remove('hidden');
  }

  function finishInit() {
    els.loadingScreen.classList.add('hidden');
    els.errorScreen.classList.add('hidden');
    els.app.classList.remove('hidden');

    els.totalCount.textContent = app.prompts.length;

    if (!navigator.onLine) els.offlineBadge.classList.remove('hidden');

    if (app.userState.ui.tipsBanner !== 'dismissed') {
      els.tipsBanner.classList.remove('hidden');
    }

    parseHashFilters();
    buildFilterUI();
    syncToggleFilters();
    refresh();
    if (!eventsBound) {
      bindEvents();
      eventsBound = true;
    }
  }

  function syncToggleFilters() {
    els.filterSaved.checked = app.onlySaved;
    els.filterHideUsed.checked = app.hideUsed;
  }

  function getBaseFiltered() {
    let list = app.prompts;

    if (app.filters.subjects.length) {
      list = list.filter((p) => app.filters.subjects.includes(p.subject));
    }
    if (app.filters.grades.length) {
      list = list.filter((p) => app.filters.grades.includes(p.grade));
    }
    if (app.filters.themes.length) {
      list = list.filter((p) => app.filters.themes.includes(p.theme));
    }
    if (app.filters.types.length) {
      list = list.filter((p) => app.filters.types.includes(p.type));
    }
    if (app.onlySaved) {
      list = list.filter((p) => isFavorite(p.n));
    }
    if (app.hideUsed) {
      list = list.filter((p) => !isUsed(p.n));
    }

    const q = app.searchQuery.trim().toLowerCase();
    if (q) {
      list = list.filter((p) => {
        const skillMatch = p.skill.toLowerCase().includes(q);
        const themeMatch = p.theme.toLowerCase().includes(q);
        const subjectMatch = p.subject.toLowerCase().includes(q);
        const contentMatch = p.content.toLowerCase().includes(q);
        return skillMatch || themeMatch || subjectMatch || (contentMatch && !skillMatch);
      });

      if (q) {
        list.sort((a, b) => {
          const aSkill = a.skill.toLowerCase().includes(q) ? 0 : 1;
          const bSkill = b.skill.toLowerCase().includes(q) ? 0 : 1;
          if (aSkill !== bSkill) return aSkill - bSkill;
          return a.n - b.n;
        });
      }
    } else {
      list = sortList([...list]);
    }

    return list;
  }

  function sortList(list) {
    switch (app.sort) {
      case 'n_desc': return list.sort((a, b) => b.n - a.n);
      case 'skill_asc': return list.sort((a, b) => a.skill.localeCompare(b.skill));
      case 'skill_desc': return list.sort((a, b) => b.skill.localeCompare(a.skill));
      default: return list.sort((a, b) => a.n - b.n);
    }
  }

  function countForDimension(prompts, field, value) {
    return prompts.filter((p) => p[field] === value).length;
  }

  function getCountsForGroup(groupKey, field, values) {
    const otherFilters = { ...app.filters };
    otherFilters[groupKey] = [];

    let base = app.prompts;
    if (otherFilters.subjects.length) base = base.filter((p) => otherFilters.subjects.includes(p.subject));
    if (otherFilters.grades.length) base = base.filter((p) => otherFilters.grades.includes(p.grade));
    if (otherFilters.themes.length) base = base.filter((p) => otherFilters.themes.includes(p.theme));
    if (otherFilters.types.length) base = base.filter((p) => otherFilters.types.includes(p.type));
    if (app.onlySaved) base = base.filter((p) => isFavorite(p.n));
    if (app.hideUsed) base = base.filter((p) => !isUsed(p.n));

    const q = app.searchQuery.trim().toLowerCase();
    if (q) {
      base = base.filter((p) =>
        p.skill.toLowerCase().includes(q) ||
        p.theme.toLowerCase().includes(q) ||
        p.subject.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q)
      );
    }

    if (typeof values[0] === 'object') {
      return values.map((v) => ({ value: v.name, count: countForDimension(base, field, v.name) }));
    }
    return values.map((v) => ({ value: v, count: countForDimension(base, field, v) }));
  }

  function buildFilterUI() {
    const groups = [
      { key: 'subjects', label: 'Subject', field: 'subject', values: SUBJECTS },
      { key: 'grades', label: 'Grade', field: 'grade', values: GRADES },
      { key: 'themes', label: 'Theme', field: 'theme', values: THEMES, isTheme: true },
      { key: 'types', label: 'Type', field: 'type', values: TYPES },
    ];

    els.filterGroups.innerHTML = groups.map((g) => `
      <div class="filter-group" data-group="${g.key}">
        <p class="filter-group__label">${g.label}</p>
        <div class="filter-group__list" id="filter-${g.key}"></div>
      </div>
    `).join('');

    updateFilterCounts();
  }

  function updateFilterCounts() {
    const configs = [
      { key: 'subjects', field: 'subject', values: SUBJECTS },
      { key: 'grades', field: 'grade', values: GRADES },
      { key: 'themes', field: 'theme', values: THEMES },
      { key: 'types', field: 'type', values: TYPES },
    ];

    for (const cfg of configs) {
      const container = $(`#filter-${cfg.key}`);
      if (!container) continue;
      const counts = getCountsForGroup(cfg.key, cfg.field, cfg.values);
      const selected = app.filters[cfg.key];

      container.innerHTML = counts.map(({ value, count }) => {
        const checked = selected.includes(value) ? 'checked' : '';
        const dot = cfg.key === 'themes'
          ? `<span class="theme-dot" style="background:${THEME_MAP[value]}"></span>`
          : '';
        const label = value.length > 18 ? value.slice(0, 16) + '…' : value;
        return `
          <label class="filter-item">
            <input type="checkbox" data-filter="${cfg.key}" data-value="${escapeHtml(value)}" ${checked}>
            ${dot}<span>${escapeHtml(label)}</span>
            <span class="filter-item__count">(${count})</span>
          </label>`;
      }).join('');
    }
  }

  function refresh(resetPage) {
    if (resetPage) app.visibleCount = PAGE_SIZE;
    app.filtered = getBaseFiltered();
    renderStats();
    renderChips();
    renderList();
    updateFilterCounts();
    updateHash();
  }

  function renderStats() {
    const showing = Math.min(app.visibleCount, app.filtered.length);
    els.statsText.textContent =
      `Showing ${showing} of ${app.filtered.length} • Used: ${app.userState.used.length} • Saved: ${app.userState.favorites.length}`;
  }

  function getActiveFilterChips() {
    const chips = [];
    for (const s of app.filters.subjects) chips.push({ group: 'subjects', value: s, label: s });
    for (const g of app.filters.grades) chips.push({ group: 'grades', value: g, label: g });
    for (const t of app.filters.themes) chips.push({ group: 'themes', value: t, label: t });
    for (const t of app.filters.types) chips.push({ group: 'types', value: t, label: t });
    if (app.onlySaved) chips.push({ group: 'toggle', value: 'saved', label: 'Only saved' });
    if (app.hideUsed) chips.push({ group: 'toggle', value: 'hideUsed', label: 'Hide used' });
    if (app.searchQuery.trim()) chips.push({ group: 'search', value: app.searchQuery, label: `"${app.searchQuery.trim()}"` });
    return chips;
  }

  function renderChips() {
    const chips = getActiveFilterChips();
    if (!chips.length) {
      els.activeChips.classList.add('hidden');
      els.activeChips.innerHTML = '';
      return;
    }
    els.activeChips.classList.remove('hidden');
    els.activeChips.innerHTML = chips.map((c) =>
      `<button type="button" class="chip" data-chip-group="${c.group}" data-chip-value="${escapeHtml(c.value)}">
        ${escapeHtml(c.label)} <span class="chip__remove">×</span>
      </button>`
    ).join('');
  }

  function renderList() {
    const visible = app.filtered.slice(0, app.visibleCount);

    if (!app.filtered.length) {
      els.promptList.innerHTML = '';
      els.promptList.classList.add('hidden');
      els.loadMore.classList.add('hidden');
      renderEmptyState();
      return;
    }

    els.emptyState.classList.add('hidden');
    els.promptList.classList.remove('hidden');

    els.promptList.innerHTML = visible.map((p) => {
      const fav = isFavorite(p.n);
      const used = isUsed(p.n);
      const stripeClass = fav ? 'is-favorite' : used ? 'is-used' : '';
      return `
        <article class="prompt-row" role="listitem" data-n="${p.n}">
          <div class="prompt-row__stripe ${stripeClass}"></div>
          <div class="prompt-row__body">
            <div class="prompt-row__top">
              <span class="prompt-row__num">#${padNum(p.n)}</span>
              <span class="prompt-row__grade">${escapeHtml(p.grade)}</span>
            </div>
            <h3 class="prompt-row__skill">${escapeHtml(p.skill)}</h3>
            <p class="prompt-row__meta">${escapeHtml(p.subject)} · ${escapeHtml(p.theme)} · ${escapeHtml(p.type)}</p>
          </div>
          <div class="prompt-row__actions">
            <button type="button" class="row-action ${fav ? 'is-active' : ''}" data-action="favorite" data-n="${p.n}" aria-label="Favorite" title="Favorite">⭐</button>
            <button type="button" class="row-action ${used ? 'is-active' : ''}" data-action="used" data-n="${p.n}" aria-label="Mark used" title="Mark used">✓</button>
            <button type="button" class="row-action" data-action="copy" data-n="${p.n}" aria-label="Copy" title="Copy">📋</button>
          </div>
        </article>`;
    }).join('');

    if (app.visibleCount < app.filtered.length) {
      els.loadMore.classList.remove('hidden');
    } else {
      els.loadMore.classList.add('hidden');
    }

    renderStats();
  }

  function renderEmptyState() {
    const chips = getActiveFilterChips();
    els.emptyState.classList.remove('hidden');
    els.emptyState.innerHTML = `
      <h3>No prompts match your filters</h3>
      <p>Try removing some filters or resetting your search.</p>
      ${chips.length ? `<div class="empty-state__chips">${chips.map((c) =>
        `<span class="chip">${escapeHtml(c.label)}</span>`).join('')}</div>` : ''}
      <button type="button" class="btn btn--secondary" id="empty-reset">Reset filters</button>`;

    const resetBtn = $('#empty-reset');
    if (resetBtn) resetBtn.addEventListener('click', resetAllFilters);
  }

  function openDrawer(n) {
    const prompt = app.prompts.find((p) => p.n === n);
    if (!prompt) return;

    app.drawerPrompt = prompt;
    els.drawerMeta.textContent = `#${padNum(prompt.n)} · ${prompt.grade} · ${prompt.subject}`;
    els.drawerTitle.textContent = prompt.skill;

    const themeColor = THEME_MAP[prompt.theme] || '#6B7A8F';
    els.drawerTags.innerHTML = `
      <span class="drawer__tag">${escapeHtml(prompt.subject)}</span>
      <span class="drawer__tag"><span class="theme-dot" style="background:${themeColor}"></span>${escapeHtml(prompt.theme)}</span>
      <span class="drawer__tag">${escapeHtml(prompt.type)}</span>`;

    els.drawerContent.innerHTML = renderForDisplay(prompt.content);
    els.drawerNotes.value = app.userState.notes[prompt.n] || '';
    els.notesSaved.classList.add('hidden');

    updateDrawerActions();
    renderRelated(prompt);

    els.drawerOverlay.classList.remove('hidden');
    requestAnimationFrame(() => els.drawerOverlay.classList.add('is-visible'));
    els.drawer.classList.remove('hidden');
    requestAnimationFrame(() => els.drawer.classList.add('is-open'));
    document.body.classList.add('drawer-open');
    els.drawerClose.focus();
  }

  function closeDrawer() {
    els.drawer.classList.remove('is-open');
    els.drawerOverlay.classList.remove('is-visible');
    document.body.classList.remove('drawer-open');
    setTimeout(() => {
      els.drawer.classList.add('hidden');
      els.drawerOverlay.classList.add('hidden');
    }, 250);
    app.drawerPrompt = null;
  }

  function updateDrawerActions() {
    if (!app.drawerPrompt) return;
    const n = app.drawerPrompt.n;
    const fav = isFavorite(n);
    const used = isUsed(n);
    els.drawerFavorite.classList.toggle('is-active', fav);
    els.drawerFavorite.textContent = fav ? '⭐ Favorited' : '⭐ Favorite';
    els.drawerUsed.classList.toggle('is-used', used);
    els.drawerUsed.textContent = used ? '✓ Used' : '✓ Mark used';
  }

  function renderRelated(prompt) {
    const related = app.prompts
      .filter((p) => p.n !== prompt.n && p.subject === prompt.subject && p.grade === prompt.grade)
      .slice(0, 5);

    if (!related.length) {
      els.relatedSection.classList.add('hidden');
      return;
    }

    els.relatedSection.classList.remove('hidden');
    els.relatedList.innerHTML = related.map((p) => `
      <div class="related-card" data-n="${p.n}" tabindex="0">
        <span class="related-card__num">#${padNum(p.n)}</span>
        <p class="related-card__skill">${escapeHtml(p.skill)}</p>
      </div>`).join('');
  }

  async function copyPrompt(n) {
    const prompt = app.prompts.find((p) => p.n === n);
    if (!prompt) return;

    const text = renderForCopy(prompt.content);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    showToast(`Copied prompt #${padNum(n)}`);
  }

  function saveNote(n, text) {
    if (text.trim()) app.userState.notes[n] = text;
    else delete app.userState.notes[n];
    saveUserState();
    els.notesSaved.classList.remove('hidden');
    setTimeout(() => els.notesSaved.classList.add('hidden'), 2000);
  }

  function resetAllFilters() {
    app.filters = { subjects: [], grades: [], themes: [], types: [] };
    app.onlySaved = false;
    app.hideUsed = false;
    app.searchQuery = '';
    els.searchInput.value = '';
    els.searchClear.classList.add('hidden');
    els.filterSaved.checked = false;
    els.filterHideUsed.checked = false;
    refresh(true);
    els.promptList.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function updateHash() {
    const params = new URLSearchParams();
    if (app.filters.subjects.length) params.set('subject', app.filters.subjects.join(','));
    if (app.filters.grades.length) params.set('grade', app.filters.grades.join(','));
    if (app.filters.themes.length) params.set('theme', app.filters.themes.join(','));
    if (app.filters.types.length) params.set('type', app.filters.types.join(','));
    const hash = params.toString();
    history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
  }

  function parseHashFilters() {
    const hash = location.hash.slice(1);
    if (!hash) return;
    const params = new URLSearchParams(hash);
    if (params.get('subject')) app.filters.subjects = params.get('subject').split(',');
    if (params.get('grade')) app.filters.grades = params.get('grade').split(',').map(normalizeGrade);
    if (params.get('theme')) app.filters.themes = params.get('theme').split(',');
    if (params.get('type')) app.filters.types = params.get('type').split(',');
  }

  function toggleSidebar(open) {
    const isOpen = open ?? !els.sidebar.classList.contains('is-open');
    els.sidebar.classList.toggle('is-open', isOpen);
    els.sidebarBackdrop.classList.toggle('is-visible', isOpen);
    els.sidebarBackdrop.classList.toggle('hidden', !isOpen);
  }

  function bindEvents() {
    els.tipsDismiss.addEventListener('click', () => {
      els.tipsBanner.classList.add('hidden');
      app.userState.ui.tipsBanner = 'dismissed';
      saveUserState();
    });

    els.searchInput.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        app.searchQuery = els.searchInput.value;
        els.searchClear.classList.toggle('hidden', !app.searchQuery);
        refresh(true);
      }, 200);
    });

    els.searchClear.addEventListener('click', () => {
      els.searchInput.value = '';
      app.searchQuery = '';
      els.searchClear.classList.add('hidden');
      refresh(true);
      els.searchInput.focus();
    });

    els.sortSelect.addEventListener('change', () => {
      app.sort = els.sortSelect.value;
      app.userState.ui.lastSort = app.sort;
      saveUserState();
      refresh(true);
    });

    els.filterGroups.addEventListener('change', (e) => {
      const input = e.target;
      if (input.type !== 'checkbox') return;
      const group = input.dataset.filter;
      const value = input.dataset.value;
      const arr = app.filters[group];
      if (input.checked) arr.push(value);
      else {
        const idx = arr.indexOf(value);
        if (idx >= 0) arr.splice(idx, 1);
      }
      refresh(true);
      els.promptList.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });

    els.filterSaved.addEventListener('change', () => {
      app.onlySaved = els.filterSaved.checked;
      refresh(true);
    });

    els.filterHideUsed.addEventListener('change', () => {
      app.hideUsed = els.filterHideUsed.checked;
      refresh(true);
    });

    els.resetFilters.addEventListener('click', resetAllFilters);

    els.activeChips.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      const group = chip.dataset.chipGroup;
      const value = chip.dataset.chipValue;
      if (group === 'search') {
        els.searchInput.value = '';
        app.searchQuery = '';
        els.searchClear.classList.add('hidden');
      } else if (group === 'toggle') {
        if (value === 'saved') { app.onlySaved = false; els.filterSaved.checked = false; }
        if (value === 'hideUsed') { app.hideUsed = false; els.filterHideUsed.checked = false; }
      } else {
        const arr = app.filters[group];
        const idx = arr.indexOf(value);
        if (idx >= 0) arr.splice(idx, 1);
      }
      refresh(true);
    });

    els.promptList.addEventListener('click', (e) => {
      const actionBtn = e.target.closest('[data-action]');
      if (actionBtn) {
        e.stopPropagation();
        const n = Number(actionBtn.dataset.n);
        const action = actionBtn.dataset.action;
        if (action === 'favorite') toggleFavorite(n);
        else if (action === 'used') toggleUsed(n);
        else if (action === 'copy') copyPrompt(n);
        return;
      }
      const row = e.target.closest('.prompt-row');
      if (row) openDrawer(Number(row.dataset.n));
    });

    els.loadMore.addEventListener('click', () => {
      app.visibleCount += PAGE_SIZE;
      renderList();
    });

    els.drawerClose.addEventListener('click', closeDrawer);
    els.drawerOverlay.addEventListener('click', closeDrawer);
    els.drawerFavorite.addEventListener('click', () => {
      if (app.drawerPrompt) toggleFavorite(app.drawerPrompt.n);
    });
    els.drawerUsed.addEventListener('click', () => {
      if (app.drawerPrompt) toggleUsed(app.drawerPrompt.n);
    });
    els.drawerCopy.addEventListener('click', () => {
      if (app.drawerPrompt) copyPrompt(app.drawerPrompt.n);
    });

    els.drawerNotes.addEventListener('input', () => {
      if (!app.drawerPrompt) return;
      clearTimeout(notesDebounceTimer);
      const n = app.drawerPrompt.n;
      const text = els.drawerNotes.value;
      notesDebounceTimer = setTimeout(() => saveNote(n, text), 500);
    });

    els.drawerNotes.addEventListener('blur', () => {
      if (!app.drawerPrompt) return;
      saveNote(app.drawerPrompt.n, els.drawerNotes.value);
    });

    els.relatedList.addEventListener('click', (e) => {
      const card = e.target.closest('.related-card');
      if (card) openDrawer(Number(card.dataset.n));
    });

    els.reloadData.addEventListener('click', async () => {
      els.loadingScreen.classList.remove('hidden');
      els.loadingMessage.textContent = 'Reloading…';
      els.app.classList.add('hidden');
      try {
        const data = await loadPrompts();
        if (validateData(data)) {
          app.prompts = normalizeData(data);
          els.loadingScreen.classList.add('hidden');
          els.app.classList.remove('hidden');
          refresh(true);
          showToast('Data reloaded');
        }
      } catch {
        els.loadingScreen.classList.add('hidden');
        showLoadError('Could not reload prompt data.');
      }
    });

    els.helpBtn.addEventListener('click', () => els.helpModal.classList.remove('hidden'));
    els.helpClose.addEventListener('click', () => els.helpModal.classList.add('hidden'));
    els.helpModal.querySelector('.help-modal__backdrop').addEventListener('click', () => {
      els.helpModal.classList.add('hidden');
    });

    els.sidebarToggle.addEventListener('click', () => toggleSidebar());
    els.sidebarClose.addEventListener('click', () => toggleSidebar(false));
    els.sidebarBackdrop.addEventListener('click', () => toggleSidebar(false));

    window.addEventListener('offline', () => els.offlineBadge.classList.remove('hidden'));
    window.addEventListener('online', () => els.offlineBadge.classList.add('hidden'));

    document.addEventListener('keydown', (e) => {
      const isMetaK = (e.metaKey || e.ctrlKey) && e.key === 'k';
      const isSlash = e.key === '/' && document.activeElement !== els.searchInput;

      if (isMetaK || isSlash) {
        e.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
        return;
      }

      if (e.key === 'Escape') {
        if (!els.helpModal.classList.contains('hidden')) {
          els.helpModal.classList.add('hidden');
          return;
        }
        if (els.sidebar.classList.contains('is-open')) {
          toggleSidebar(false);
          return;
        }
        if (app.drawerPrompt) {
          closeDrawer();
          return;
        }
        if (document.activeElement === els.searchInput && els.searchInput.value) {
          els.searchInput.value = '';
          app.searchQuery = '';
          els.searchClear.classList.add('hidden');
          refresh(true);
        }
      }

      if (!app.drawerPrompt || !els.drawer.classList.contains('is-open')) return;

      if (e.key === 'f' || e.key === 'F') {
        e.preventDefault();
        toggleFavorite(app.drawerPrompt.n);
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        toggleUsed(app.drawerPrompt.n);
      } else if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        copyPrompt(app.drawerPrompt.n);
      }
    });
  }

  els.retryLoad.addEventListener('click', () => {
    els.errorScreen.classList.add('hidden');
    els.loadingScreen.classList.remove('hidden');
    els.loadingMessage.textContent = 'Loading vault…';
    initData();
  });

  initData();
})();
