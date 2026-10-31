(() => {
  'use strict';

  const CARD = '.bili-video-card, .floor-single-card';
  // These are platform disclosure elements, not words from a video's title.
  const PROMOTION = '.bili-video-card__info--ad, .bili-video-card__info--creative-ad';
  const PROGRAM_TYPES = new Set(['直播', '番剧', '国创', '综艺', '课堂', '电影', '电视剧', '纪录片', '漫画']);
  const records = new WeakMap();
  const pending = new Set();
  let scheduled = false;

  function readLinkUrl(link) {
    if (!link) return null;
    try {
      return new URL(link.getAttribute('href'), document.baseURI);
    } catch {
      return null;
    }
  }

  function isAdRedirect(link) {
    const url = readLinkUrl(link);
    if (!url) return false;
    return url.hostname === 'cm.bilibili.com' &&
      url.pathname.startsWith('/cm/api/fees/pc/sync/');
  }

  function hasPromotion(card, root, cover) {
    if (card.querySelector(PROMOTION)) return true;
    const labels = card.querySelectorAll('.bili-video-card__stats .bili-video-card__stats--text');
    if (Array.from(labels).some(label => /^(广告|推广|商业推广)$/.test(label.textContent.trim()))) return true;
    // New icon-only disclosures share normal stats classes. Only inspect the
    // primary cover/title destination, never unrelated links or title keywords.
    return isAdRedirect(cover.closest('a')) ||
      isAdRedirect(root.querySelector('a') || root.closest('a'));
  }

  function programLabel(card) {
    const category = card.querySelector('.badge .floor-title')?.textContent.trim();
    return PROGRAM_TYPES.has(category) ? `广告：${category}` : null;
  }

  function isOurTitle(state) {
    return state.target.childNodes.length === 1 &&
      state.target.firstChild === state.replacement &&
      state.replacement.data === state.text;
  }

  function restoreTitle(state) {
    if (isOurTitle(state)) state.target.replaceChildren(...state.nodes);
    for (const label of state.labels) {
      if (label.node.getAttribute('title') !== state.text) continue;
      if (label.value === null) label.node.removeAttribute('title');
      else label.node.setAttribute('title', label.value);
    }
    state.root.classList.remove('bpl-title');
  }

  function replaceTitle(state, text) {
    const owned = isOurTitle(state);
    if (!owned) state.nodes = Array.from(state.target.childNodes);
    if (!owned || state.text !== text) {
      state.replacement = document.createTextNode(text);
      state.target.replaceChildren(state.replacement);
    }
    for (const label of state.labels) {
      const current = label.node.getAttribute('title');
      if (current !== state.text) label.value = current;
      if (current !== text) label.node.setAttribute('title', text);
    }
    state.text = text;
    state.root.classList.add('bpl-title');
  }

  function createRecord(root, cover) {
    const target = root.querySelector('a') || root;
    const overlay = document.createElement('span');
    overlay.className = 'bpl-placeholder';
    overlay.setAttribute('role', 'img');
    return {
      root, target, cover, overlay,
      nodes: [], replacement: null, text: null,
      labels: Array.from(new Set([root, target])).map(node => ({ node, value: null }))
    };
  }

  function restore(card) {
    const state = records.get(card);
    if (!state) return;
    restoreTitle(state);
    state.overlay.remove();
    state.cover.classList.remove('bpl-cover');
    card.classList.remove('bpl-program');
    records.delete(card);
  }

  function matchesRecord(state, root, cover) {
    return state.root === root && state.cover === cover && root.contains(state.target);
  }

  function refresh(card) {
    if (!card.isConnected) return;
    if (card.matches('.floor-single-card')) {
      refreshProgram(card);
      return;
    }
    refreshVideo(card);
  }

  function refreshProgram(card) {
    card.classList.remove('bpl-hidden');
    const text = programLabel(card);
    if (!text) {
      restore(card);
      return;
    }
    const root = card.querySelector('.info-container .title');
    const cover = card.querySelector('.cover-container');
    if (!root || !cover) return;
    applyReplacement(card, root, cover, text);
    card.classList.add('bpl-program');
  }

  function refreshVideo(card) {
    const root = card.querySelector('.bili-video-card__info--tit');
    const cover = card.querySelector('.bili-video-card__image');
    if (!root || !cover) return;
    if (!hasPromotion(card, root, cover)) {
      restore(card);
      return;
    }
    applyReplacement(card, root, cover, '广告');
  }

  function applyReplacement(card, root, cover, text) {
    let state = records.get(card);
    if (state && !matchesRecord(state, root, cover)) {
      restore(card);
      state = null;
    }
    if (!state) {
      state = createRecord(root, cover);
      records.set(card, state);
    }
    replaceTitle(state, text);
    state.overlay.textContent = text;
    state.overlay.setAttribute('aria-label', text);
    cover.classList.add('bpl-cover');
    if (state.overlay.parentNode !== cover) cover.append(state.overlay);
  }

  function collect(node) {
    if (node?.nodeType !== Node.ELEMENT_NODE) return;
    const card = node.closest(CARD);
    if (card) pending.add(card);
    for (const child of node.querySelectorAll(CARD)) pending.add(child);
  }

  function flush() {
    scheduled = false;
    // Include mutations queued since the callback before disconnecting.
    collectMutations(observer.takeRecords());
    observer.disconnect();
    try {
      for (const card of pending) refresh(card);
    } finally {
      pending.clear();
      observe();
    }
  }

  function collectMutations(mutations) {
    for (const mutation of mutations) {
      const target = mutation.target;
      collect(target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement);
      for (const node of mutation.addedNodes) collect(node);
    }
  }

  const observer = new MutationObserver(mutations => {
    collectMutations(mutations);
    if (scheduled || pending.size === 0) return;
    scheduled = true;
    setTimeout(flush, 40);
  });

  function observe() {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['class', 'title', 'href']
    });
  }

  collect(document.documentElement);
  flush();
})();
