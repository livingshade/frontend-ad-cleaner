(() => {
  'use strict';

  // Only explicit site structures are signals. Never search answer text for ads.
  const AD_ROOTS = [
    '.TopstoryItem--advertCard', '.Pc-word-card', '.Pc-word-new', '.Pc-card',
    '.Pc-Business-Card-PcTopFeedBanner', '.AdvertCard', '.AdCard',
    '[data-za-detail-view-path-is_ad="true"]', '[data-za-detail-view-path-is_ad="1"]'
  ].join(',');
  const SALT_CARDS = [
    '.KfeCollection-PcCollegeCard', '.KfeCollection-VipRecommendCard',
    '.KfeCollection-IntroCard', '.KfeCollection-IntroCard-newStyle-pc',
    '.KfeCollection-IntroCard-newStyle-mobile'
  ].join(',');
  const SALT_LABELS = '.KfeCollection-OrdinaryLabel-content,.KfeCollection-AnswerTopCard-Container';
  const AD_LABELS = '.Banner-adTag,.AdvertImg';
  const CARD = '.ContentItem,.AnswerItem,.TopstoryItem,.List-item,.SearchResult-Card,.AnswerCard';
  const TITLE_LINK = '.ContentItem-title a[href],a.ContentItem-title[href],.SearchItem-title a[href]';
  const PROSE = '.RichText,.RichContent-inner,.Post-RichText,.CommentItem-content,.CommentItemV2-content,.CommentRichText,.CommentContent,[contenteditable="true"],textarea,input,pre,code';
  const IDENTITY = '.UserLink,.UserLink-link,.AuthorInfo-name,.CommentItem-meta';
  const TITLES = '.ContentItem-title,.SearchItem-title,h1,h2,h3';
  const SAILOR_ROWS = '.AnswerItem div,.AnswerCard div,.ContentItem div';
  const SAILOR_WIDGETS = '.SailorBadge,.SailorButton,.VoyagerBadge,.VoyagerButton';
  const UI_CONTEXT = '.ContentItem-actions,.RichContent-actions,.ContentItem-status,.AuthorInfo,.Badge,.GlobalSideBar,.AppHeader,nav,aside,[role="navigation"]';
  const UI_CANDIDATES = 'a,button,[role="button"],img,span,[aria-label],[title]';
  const OWN = '[data-zclean-placeholder]';
  const MARKED = '[data-zclean-promo]';
  const HIDDEN = '[data-zclean-hidden]';
  const BOUNDARY = [CARD, AD_ROOTS, SALT_CARDS, '.Banner', MARKED].join(',');
  const pending = new Set();
  let timer = null;

  function elements(root, selector) {
    const found = [...root.querySelectorAll(selector)];
    if (root.matches?.(selector)) found.unshift(root);
    return found;
  }

  function pageUrl(value) {
    try {
      // The base also makes relative fixture links behave like Zhihu links.
      const base = /^https?:$/.test(location.protocol) ? location.href : 'https://www.zhihu.com/';
      const url = new URL(value, base);
      return /^https?:$/.test(url.protocol) ? url : null;
    } catch { return null; }
  }

  function isSaltLink(link) {
    const url = pageUrl(link.getAttribute('href'));
    if (!url || !/(^|\.)zhihu\.com$/i.test(url.hostname)) return false;
    return /^\/(?:xen\/)?market\/(?:paid_column|remix|vip|salt)(?:\/|$)/.test(url.pathname);
  }

  function labelCard(label) {
    if (label.closest('.RichText,.Post-RichText,.CommentItem-content')) return label;
    return label.closest(CARD) || label;
  }

  function promoTargets(root) {
    const targets = new Set(elements(root, `${AD_ROOTS},${SALT_CARDS}`));
    for (const label of elements(root, SALT_LABELS)) {
      if (label.matches('.KfeCollection-AnswerTopCard-Container') || /[盐严]选/.test(label.textContent)) targets.add(labelCard(label));
    }
    for (const label of elements(root, AD_LABELS)) {
      targets.add(label.closest(`${AD_ROOTS},.Banner-link,.Banner`) || label.parentElement);
    }
    for (const link of elements(root, TITLE_LINK)) {
      if (isSaltLink(link)) targets.add(link.closest(CARD) || link.closest('h1,h2,h3') || link);
    }
    // Outermost proven promo only; never widen to an arbitrary enclosing .Card.
    return new Set([...targets].filter(target => target && ![...targets].some(other => other !== target && other?.contains(target))));
  }

  function destination(card) {
    const candidates = [card.closest('a[href]'), ...card.querySelectorAll(TITLE_LINK), ...card.querySelectorAll('a[href]')];
    return candidates.find(link => link && !link.matches(OWN) && !link.closest(IDENTITY) && pageUrl(link.getAttribute('href'))) || null;
  }

  function updatePlaceholder(card) {
    const link = destination(card);
    const nestedLink = card.closest('a[href]');
    const tag = link && !nestedLink ? 'a' : 'span';
    let placeholder = [...card.children].find(child => child.matches(OWN));
    if (placeholder?.localName !== tag) { placeholder?.remove(); placeholder = null; }
    if (!placeholder) {
      placeholder = document.createElement(tag);
      placeholder.setAttribute('data-zclean-placeholder', '');
      placeholder.textContent = '广告';
      card.append(placeholder);
    }
    if (tag === 'a') {
      placeholder.setAttribute('href', link.getAttribute('href'));
      if (link.target === '_blank') { placeholder.target = '_blank'; placeholder.rel = 'noopener noreferrer'; }
      else { placeholder.removeAttribute('target'); placeholder.removeAttribute('rel'); }
    }
    card.setAttribute('data-zclean-promo', '');
  }

  function restoreCard(card) {
    card.removeAttribute('data-zclean-promo');
    for (const child of card.children) if (child.matches(OWN)) child.remove();
  }

  function compact(value) { return (value || '').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim(); }

  function isSailorLabel(text) {
    return /^(?:知乎)?航海家(?:[ ·・：:—-]*(?:赞同|点赞|值得一赞|计划|标记|会员|权益|入口))*(?:\s*[\d,.万亿kKwW+]+)?$/.test(text);
  }

  function sailorCount(element) {
    if (!element.matches('div,span') || !element.closest(CARD) || element.matches(CARD)) return null;
    if (element.closest(`${OWN},${PROSE},${IDENTITY},${TITLES},.AuthorInfo`)) return null;
    // A short status row must not contain the author, answer body, or action bar.
    if (element.querySelector(`${PROSE},${TITLES},.AuthorInfo,.ContentItem-actions,.RichContent-actions,.VoteButton`)) return null;
    const text = compact(element.textContent);
    if (text.length > 160) return null;
    return /^航海家.{0,100}?([\d,.]+(?:\s*[万亿kKwW])?\+?\s*人赞同(?:了该回答)?)\s*[›>»→]?$/.exec(text)?.[1] || null;
  }

  function shouldHide(element) {
    if (element.closest(`${OWN},${PROSE},${IDENTITY},${TITLES}`)) return false;
    if (element.matches('.AuthorInfo')) return false;
    if (element.hasAttribute('data-zclean-sailor-count')) return false;
    if (element.matches(SAILOR_WIDGETS)) return true;
    const labels = ['aria-label','title','alt'].map(name => compact(element.getAttribute(name)));
    const text = compact(element.textContent);
    if (text.length <= 48) labels.push(text);
    const interactive = element.matches('a,button,[role="button"]');
    if (interactive && labels.some(isSailorLabel)) return true;
    if (!element.closest(UI_CONTEXT)) return false;
    return labels.some(isSailorLabel);
  }

  function processRoot(root) {
    const targets = promoTargets(root);
    for (const previous of elements(root, MARKED)) if (!targets.has(previous)) restoreCard(previous);
    targets.forEach(updatePlaceholder);
    for (const element of elements(root, `${UI_CANDIDATES},${SAILOR_ROWS},${SAILOR_WIDGETS},${HIDDEN},[data-zclean-sailor-count]`)) {
      const count = sailorCount(element);
      if (count) element.setAttribute('data-zclean-sailor-count', count);
      else element.removeAttribute('data-zclean-sailor-count');
      if (shouldHide(element)) element.setAttribute('data-zclean-hidden', '');
      else element.removeAttribute('data-zclean-hidden');
    }
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (element) pending.add(element.closest(BOUNDARY) || element);
    }
    if (timer === null) timer = setTimeout(flush, 60);
  });

  function observe() {
    observer.observe(document.documentElement, {
      subtree:true, childList:true, characterData:true, attributes:true,
      attributeFilter:['class','href','aria-label','title','alt','data-za-detail-view-path-is_ad']
    });
  }

  function flush() {
    timer = null;
    const candidates = [...pending].filter(root => root.isConnected);
    pending.clear();
    const roots = candidates.length > 60 ? [document.documentElement] : candidates.filter(root => !candidates.some(other => other !== root && other.contains(root)));
    observer.disconnect(); // Our own DOM writes must not schedule another pass.
    try { roots.forEach(processRoot); } finally { observe(); }
  }

  function scanPage() {
    pending.add(document.documentElement);
    if (timer === null) timer = setTimeout(flush, 0);
  }
  // PushState-driven routes mutate the DOM; back/forward and BFCache also rescan.
  window.addEventListener('popstate', scanPage);
  window.addEventListener('pageshow', scanPage);
  if (document.documentElement) { observe(); scanPage(); }
  else document.addEventListener('DOMContentLoaded', () => { observe(); scanPage(); }, {once:true});
})();
