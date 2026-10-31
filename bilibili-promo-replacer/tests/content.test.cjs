const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

// Breaks caught: false positives, lost links, missed dynamic cards, stale replacements.
const source = fs.readFileSync(path.join(__dirname, '../extension/content.js'), 'utf8');
const tick = () => new Promise(resolve => setTimeout(resolve, 80));
function fixture({ promoted = true, search = false, icon = false } = {}) {
  const heading = '<h3 class="bili-video-card__info--tit" title="原视频标题">原视频标题</h3>';
  const title = search ? `<a href="/video/BV1Ni4y1q7Z6/">${heading}</a>`
    : '<h3 class="bili-video-card__info--tit" title="原视频标题"><a href="/video/BV1Ni4y1q7Z6/">原视频标题</a></h3>';
  const marker = icon ? '<svg class="vui_icon bili-video-card__info--creative-ad"></svg>'
    : '<span class="bili-video-card__info--ad">推广</span>';
  return `<article class="bili-video-card"><div class="bili-video-card__wrap">
    <a class="cover-link" href="/video/BV1Ni4y1q7Z6/"><div class="bili-video-card__image"><picture><img src="original.jpg" alt="原封面"></picture><div class="v-inline-player"></div></div></a>
    ${title}${promoted ? marker : ''}</div></article>`;
}
async function setup(t, html) {
  const dom = new JSDOM(html, { url: 'https://www.bilibili.com/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  dom.window.eval(source);
  await tick();
  return dom.window.document;
}
const heading = doc => doc.querySelector('h3');

test('official promotion replaces cover and title while keeping both destination links', async t => {
  const doc = await setup(t, fixture());
  assert.equal(heading(doc).textContent, '广告');
  assert.equal(heading(doc).title, '广告');
  assert.equal(doc.querySelector('.bpl-placeholder')?.textContent, '广告');
  assert.equal(doc.querySelector('.cover-link').getAttribute('href'), '/video/BV1Ni4y1q7Z6/');
  assert.equal(heading(doc).querySelector('a').getAttribute('href'), '/video/BV1Ni4y1q7Z6/');
});
test('normal videos mentioning advertising in the title remain untouched', async t => {
  const doc = await setup(t, fixture({ promoted: false }).replaceAll('原视频标题', '推广广告设计教程'));
  assert.equal(heading(doc).textContent, '推广广告设计教程');
  assert.equal(doc.querySelector('.bpl-placeholder'), null);
});
test('search cards whose heading is inside a link are replaced without losing the link', async t => {
  const doc = await setup(t, fixture({ search: true }));
  assert.equal(heading(doc).textContent, '广告');
  assert.equal(heading(doc).parentElement.getAttribute('href'), '/video/BV1Ni4y1q7Z6/');
});
test('the site promotion icon works even when it has no text', async t => {
  const doc = await setup(t, fixture({ icon: true }));
  assert.equal(heading(doc).textContent, '广告');
});
test('new infinite-scroll cards are processed', async t => {
  const doc = await setup(t, '<main></main>');
  doc.querySelector('main').innerHTML = fixture();
  await tick();
  assert.equal(heading(doc).textContent, '广告');
});
test('promotion marker arriving after the card triggers replacement', async t => {
  const doc = await setup(t, fixture({ promoted: false }));
  doc.querySelector('article').insertAdjacentHTML('beforeend', '<span class="bili-video-card__info--ad">推广</span>');
  await tick();
  assert.equal(heading(doc).textContent, '广告');
});
test('removing the promotion marker restores a reused card including original title markup', async t => {
  const doc = await setup(t, fixture().replace('>原视频标题</a>', '><em>原视频</em>标题</a>'));
  doc.querySelector('.bili-video-card__info--ad').remove();
  await tick();
  assert.equal(heading(doc).textContent, '原视频标题');
  assert.equal(heading(doc).querySelector('em').textContent, '原视频');
  assert.equal(heading(doc).title, '原视频标题');
  assert.equal(doc.querySelector('.bpl-placeholder'), null);
  assert.equal(doc.querySelector('.bpl-cover'), null);
});
test('site title updates are not overwritten with a stale original when promotion disappears', async t => {
  const doc = await setup(t, fixture());
  heading(doc).querySelector('a').textContent = '新的普通视频';
  heading(doc).title = '新的普通视频';
  doc.querySelector('.bili-video-card__info--ad').remove();
  await tick();
  assert.equal(heading(doc).textContent, '新的普通视频');
  assert.equal(heading(doc).title, '新的普通视频');
});
test('updates to an active promoted title are masked and the latest title can be restored', async t => {
  const doc = await setup(t, fixture());
  heading(doc).querySelector('a').textContent = '第二条推广';
  heading(doc).title = '第二条推广';
  await tick();
  assert.equal(heading(doc).textContent, '广告');
  doc.querySelector('.bili-video-card__info--ad').remove();
  await tick();
  assert.equal(heading(doc).textContent, '第二条推广');
  assert.equal(heading(doc).title, '第二条推广');
});
test('repeated mutations never duplicate the replacement or affect adjacent ordinary cards', async t => {
  const doc = await setup(t, fixture() + fixture({ promoted: false }));
  doc.querySelector('article').classList.add('hover');
  await tick();
  doc.querySelector('article').classList.remove('hover');
  await tick();
  assert.equal(doc.querySelectorAll('.bpl-placeholder').length, 1);
  assert.equal(doc.querySelectorAll('h3')[1].textContent, '原视频标题');
});
test('a promotion class added to an existing icon is detected', async t => {
  const doc = await setup(t, fixture({ promoted: false }) );
  const badge = doc.createElement('span');
  doc.querySelector('article').append(badge);
  await tick();
  badge.className = 'bili-video-card__info--ad';
  await tick();
  assert.equal(heading(doc).textContent, '广告');
});
test('detached text mutations elsewhere on the page do not stop processing new cards', async t => {
  const doc = await setup(t, '<p>temporary</p><main></main>');
  const text = doc.querySelector('p').firstChild;
  text.data = 'updated';
  text.remove();
  doc.querySelector('main').innerHTML = fixture();
  await tick();
  assert.equal(heading(doc).textContent, '广告');
});
test('site replacement of the entire cover and heading is handled without stale nodes', async t => {
  const doc = await setup(t, fixture());
  const template = doc.createElement('template');
  template.innerHTML = fixture().replaceAll('原视频标题', '换一批后的推广');
  doc.querySelector('article').replaceChildren(...template.content.querySelector('article').childNodes);
  await tick();
  assert.equal(heading(doc).textContent, '广告');
  assert.equal(doc.querySelectorAll('.bpl-placeholder').length, 1);
  doc.querySelector('.bili-video-card__info--ad').remove();
  await tick();
  assert.equal(heading(doc).textContent, '换一批后的推广');
});

// Current signed-in homepage places its disclosure in the cover stats.
function statsFixture(text) {
  return fixture({ promoted: false }).replace('<div class="v-inline-player"></div>',
    `<div class="bili-video-card__stats"><span class="bili-video-card__stats--text">${text}</span></div>`);
}
const adUrl = '//cm.bilibili.com/cm/api/fees/pc/sync/v2?msg=test';

test('current cover-level advertising text replaces both cover and title', async t => {
  const doc = await setup(t, statsFixture('广告'));
  assert.equal(heading(doc).textContent, '广告');
  assert.equal(doc.querySelector('.bpl-placeholder')?.textContent, '广告');
});
test('current icon-only platform promotion is identified by the primary ad redirect', async t => {
  const html = statsFixture('66.3万').replaceAll('/video/BV1Ni4y1q7Z6/', adUrl);
  const doc = await setup(t, html);
  assert.equal(heading(doc).textContent, '广告');
  assert.equal(doc.querySelector('.cover-link').getAttribute('href'), adUrl);
});
test('numeric cover stats do not identify an ordinary video as an ad', async t => {
  const doc = await setup(t, statsFixture('66.3万'));
  assert.equal(doc.querySelector('.bpl-placeholder'), null);
  assert.equal(heading(doc).textContent, '原视频标题');
});
test('changing an ad stats label back to a view count restores the reused video', async t => {
  const doc = await setup(t, statsFixture('广告'));
  assert.equal(heading(doc).textContent, '广告');
  doc.querySelector('.bili-video-card__stats--text').textContent = '1200';
  await tick();
  assert.equal(heading(doc).textContent, '原视频标题');
  assert.equal(doc.querySelector('.bpl-placeholder'), null);
});
test('switching the cover destination into and out of a platform ad is detected', async t => {
  const doc = await setup(t, fixture({ promoted: false }));
  doc.querySelector('.cover-link').setAttribute('href', adUrl);
  await tick();
  assert.equal(heading(doc).textContent, '广告');
  doc.querySelector('.cover-link').setAttribute('href', '/video/BV1Ni4y1q7Z6/');
  await tick();
  assert.equal(heading(doc).textContent, '原视频标题');
});
test('ad-like URLs and unrelated links do not label ordinary videos', async t => {
  for (const url of [
    'https://cm.bilibili.com.example.com/cm/api/fees/pc/sync/v2',
    'https://www.bilibili.com/video/BV1Ni4y1q7Z6/?ref=cm.bilibili.com',
    'https://cm.bilibili.com/ordinary',
    'javascript:void(0)',
    'http://['
  ]) {
    const doc = await setup(t, fixture({ promoted: false }).replaceAll('/video/BV1Ni4y1q7Z6/', url));
    assert.equal(doc.querySelector('.bpl-placeholder'), null, url);
  }
  const doc = await setup(t, fixture({ promoted: false }).replace('</article>', `<a href="${adUrl}">参考链接</a></article>`));
  assert.equal(doc.querySelector('.bpl-placeholder'), null);
});

function programFixture(href, category = '') {
  return `<div class="floor-single-card"><div class="floor-card single-card"><div class="floor-card-inner">
    <div class="cover-container"><a href="${href}"><div class="cover-shim"></div><picture><img src="program.jpg"></picture></a>
      ${category ? `<div class="badge"><span class="floor-title">${category}</span></div>` : ''}</div>
    <div class="info-container"><p class="title"><a href="${href}">节目</a></p></div>
  </div></div></div>`;
}
test('live and program cards keep their positions but replace cover and title with ad categories', async t => {
  const doc = await setup(t, '<nav><a href="https://live.bilibili.com/">直播入口</a></nav>' +
    programFixture('https://live.bilibili.com/12345', '直播') +
    programFixture('https://www.bilibili.com/bangumi/play/ep84776', '番剧') + fixture({ promoted: false }));
  assert.deepEqual(Array.from(doc.querySelectorAll('.floor-single-card .title'), n=>n.textContent), ['广告：直播','广告：番剧']);
  assert.deepEqual(Array.from(doc.querySelectorAll('.floor-single-card .bpl-placeholder'), n=>n.textContent), ['广告：直播','广告：番剧']);
  assert.equal(doc.querySelectorAll('.floor-single-card.bpl-hidden').length, 0);
  assert.equal(doc.querySelector('nav').classList.contains('bpl-hidden'), false);
  assert.equal(doc.querySelector('.bili-video-card .bpl-placeholder'), null);
});
test('new category cards are replaced and reused ordinary cards return', async t => {
  const doc = await setup(t, '<main></main>');
  doc.querySelector('main').innerHTML = programFixture('https://www.bilibili.com/zh-Hans/bangumi/play/ep123', '番剧');
  await tick();
  assert.equal(doc.querySelector('.title').textContent, '广告：番剧');
  doc.querySelector('.cover-container a').href = 'https://www.bilibili.com/video/BV1Ni4y1q7Z6/';
  doc.querySelector('.badge').remove();
  await tick();
  assert.equal(doc.querySelector('.title').textContent, '节目');
  assert.equal(doc.querySelector('.bpl-placeholder'), null);
});
test('ordinary floor cards and lookalike external domains remain visible', async t => {
  const doc = await setup(t, programFixture('https://www.bilibili.com/video/BV1Ni4y1q7Z6/') +
    programFixture('https://live.bilibili.com.example.com/123'));
  assert.equal(doc.querySelectorAll('.bpl-hidden').length, 0);
  assert.equal(doc.querySelectorAll('.bpl-placeholder').length, 0);
});
test('comics, courses and all observed official categories get their own ad label with original links', async t => {
  const categories = ['直播','番剧','国创','综艺','课堂','电影','电视剧','纪录片','漫画'];
  const html = categories.map(c=>programFixture('/category/example', c)).join('');
  const doc = await setup(t, html);
  const labels = Array.from(doc.querySelectorAll('.bpl-placeholder'), n=>n.textContent);
  assert.deepEqual(labels, ['广告：直播','广告：番剧','广告：国创','广告：综艺','广告：课堂','广告：电影','广告：电视剧','广告：纪录片','广告：漫画']);
  for (const link of doc.querySelectorAll('.title a')) assert.equal(link.getAttribute('href'), '/category/example');
});
test('switching a category updates its label without losing the original title for restoration', async t => {
  const doc = await setup(t, programFixture('/category/example', '直播'));
  assert.equal(doc.querySelector('.title').textContent, '广告：直播');
  doc.querySelector('.floor-title').textContent = '漫画';
  await tick();
  assert.equal(doc.querySelector('.title').textContent, '广告：漫画');
  assert.equal(doc.querySelector('.bpl-placeholder').getAttribute('aria-label'), '广告：漫画');
  doc.querySelector('.badge').remove();
  await tick();
  assert.equal(doc.querySelector('.title').textContent, '节目');
  assert.equal(doc.querySelector('.title').getAttribute('title'), null);
});
test('a category badge arriving after the card still replaces its original content', async t => {
  const doc = await setup(t, programFixture('/category/example'));
  doc.querySelector('.cover-container').insertAdjacentHTML('beforeend', '<div class="badge"><span class="floor-title">课堂</span></div>');
  await tick();
  assert.equal(doc.querySelector('.title').textContent, '广告：课堂');
});
