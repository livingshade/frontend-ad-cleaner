/* Real DOM tests: removing a classifier, observer, or hide rule must fail. */
(async () => {
  const fixture = document.querySelector('#fixture');
  const results = [];
  const pause = () => new Promise(resolve => setTimeout(resolve, 100));
  const assert = (condition, message) => { if (!condition) throw Error(message); };
  const shown = element => !!element && element.getClientRects().length > 0 && getComputedStyle(element).visibility !== 'hidden';
  const ad = element => element?.querySelector('[data-zclean-placeholder]');
  async function mount(html) { fixture.innerHTML = html; await pause(); }
  async function test(name, run) {
    try { await run(); results.push({name, passed:true}); }
    catch (error) { results.push({name, passed:false, error:error.message}); }
  }

  await test('推广卡片替换为广告并保留原链接', async () => {
    await mount('<article class="TopstoryItem TopstoryItem--advertCard" id="promo"><h2 class="ContentItem-title"><a href="https://example.com/product?from=zhihu">推广标题</a></h2><div class="RichContent-cover">封面</div><p>广告摘要</p></article>');
    const card = document.querySelector('#promo');
    assert(ad(card)?.textContent === '广告', '缺少广告占位');
    assert(ad(card).getAttribute('href') === 'https://example.com/product?from=zhihu', '原链接丢失');
    assert(!shown(card.querySelector('h2')) && !shown(card.querySelector('.RichContent-cover')), '标题或封面仍显示');
    assert(shown(ad(card)), '占位不可见');
  });
  await test('正文和标题提及广告、盐选、航海家不触发误处理', async () => {
    await mount('<article class="ContentItem AnswerItem"><h2 class="ContentItem-title"><a href="/question/1">如何看待盐选广告？</a></h2><div class="AuthorInfo"><a class="UserLink-link" href="/people/sailor">航海家</a></div><div class="RichText"><p>我给广告分析点了赞，航海家的盐选书单值得讨论。</p><a href="https://www.zhihu.com/market/paid_column/1">盐选</a><span>123 人赞同</span></div></article>');
    assert(!ad(fixture), '普通回答被标广告');
    assert(shown(fixture.querySelector('.RichText')) && shown(fixture.querySelector('.UserLink-link')), '正文或作者名隐藏');
  });
  await test('盐选专属标记替换所属回答，保留相邻普通回答', async () => {
    await mount('<section class="Card"><article class="AnswerItem" id="salt"><a class="ContentItem-title" href="/question/2/answer/3">小说</a><span class="KfeCollection-OrdinaryLabel-content">盐选专栏</span><div class="RichText">付费故事</div></article><article class="AnswerItem" id="normal"><div class="RichText">普通回答</div></article></section>');
    assert(!!ad(document.querySelector('#salt')), '盐选未替换');
    assert(shown(document.querySelector('#normal .RichText')), '相邻回答隐藏');
  });
  await test('只有标题指向盐选的卡片被替换', async () => {
    await mount('<article class="ContentItem" id="salt"><h2 class="ContentItem-title"><a href="https://www.zhihu.com/xen/market/paid_column/123">小说</a></h2><p>简介</p></article><article class="ContentItem" id="safe"><h2 class="ContentItem-title"><a href="https://www.zhihu.com.evil.example/market/123">普通链接</a></h2></article>');
    assert(!!ad(document.querySelector('#salt')), '盐选标题未识别');
    assert(!ad(document.querySelector('#safe')), '错误域名被识别');
  });
  await test('显式广告数据属性支持 true 和 1，忽略 false', async () => {
    await mount('<div data-za-detail-view-path-is_ad="true" id="ad1"><a href="https://example.com/a">商品</a></div><div data-za-detail-view-path-is_ad="1" id="ad2">推广</div><div data-za-detail-view-path-is_ad="false" id="safe">正常内容</div>');
    assert(!!ad(document.querySelector('#ad1')) && !!ad(document.querySelector('#ad2')), '广告数据属性漏判');
    assert(!ad(document.querySelector('#safe')), 'false 被误判');
  });
  await test('普通点赞按钮与数量保留，航海家入口隐藏', async () => {
    await mount('<article class="AnswerItem"><div class="ContentItem-actions"><button class="VoteButton" id="vote">赞同 123</button><button id="semantic" aria-label="点赞 16">16</button><button id="sail">航海家赞同</button><button id="comment">12 条评论</button><button id="save">收藏</button></div><div class="ContentItem-status"><span id="count">123 人赞同了该回答</span></div><div class="Voters" id="voters">123 人赞同</div></article><nav><a href="/parker/campaign/1954601933802276076" id="entry">航海家·值得一赞</a></nav>');
    for (const id of ['sail','entry']) assert(!shown(document.getElementById(id)), id + ' 未隐藏');
    for (const id of ['vote','semantic','count','voters','comment','save']) assert(shown(document.getElementById(id)), id + ' 应保留');
  });
  await test('图片形式航海家标记隐藏，正文插图保留', async () => {
    await mount('<div class="AuthorInfo"><img id="badge" alt="航海家" width="20" height="20"></div><div class="RichText"><img id="illustration" alt="航海家" width="20" height="20"></div>');
    assert(!shown(document.querySelector('#badge')), '图片徽章未隐藏');
    assert(shown(document.querySelector('#illustration')), '正文插图被隐藏');
  });
  await test('没有触发点赞事件、取消点赞或网络请求', async () => {
    await mount('<button class="VoteButton is-active" aria-pressed="true" id="active">已赞同 2</button>');
    const button = document.querySelector('#active');
    assert(button.getAttribute('aria-pressed') === 'true' && button.classList.contains('is-active'), '赞同状态被修改');
    assert(window.testClickCount === 0, '产生了点击事件');
    assert(performance.getEntriesByType('resource').every(entry => !['fetch','xmlhttprequest'].includes(entry.initiatorType)), '扩展发起网络请求');
  });
  await test('动态插入及同页路由新增广告持续处理', async () => {
    await mount('<section id="feed"></section>');
    history.pushState({}, '', '#route-2');
    document.querySelector('#feed').insertAdjacentHTML('beforeend', '<article class="TopstoryItem--advertCard"><a href="https://example.com/new">新广告</a></article>');
    await pause();
    assert(!!ad(document.querySelector('#feed')), '动态广告未处理');
  });
  await test('卡片异步添加广告标记、文字更新及复用均被重新判断', async () => {
    await mount('<article class="ContentItem" id="reuse"><a href="https://example.com/old">旧卡片</a></article>');
    const card = document.querySelector('#reuse');
    card.classList.add('TopstoryItem--advertCard');
    await pause();
    assert(!!ad(card), '后加标记未生效');
    card.classList.remove('TopstoryItem--advertCard');
    card.innerHTML = '<h2 class="ContentItem-title"><a href="/question/5">新的普通问题</a></h2><div class="RichText">普通正文</div>';
    await pause();
    assert(!ad(card) && shown(card.querySelector('.RichText')), '复用为普通卡片后未恢复');
    fixture.insertAdjacentHTML('beforeend', '<button id="late">收藏</button>');
    await pause();
    document.querySelector('#late').firstChild.data = '赞同 8';
    await pause();
    assert(shown(document.querySelector('#late')), '动态普通赞同按钮应保留');
  });
  await test('框架重绘广告卡片后重新创建单一占位', async () => {
    await mount('<div class="Pc-word-card" id="rerender"><a href="https://example.com/a">广告 A</a></div>');
    const card = document.querySelector('#rerender');
    card.innerHTML = '<a href="https://example.com/b">广告 B</a>';
    await pause();
    assert(card.querySelectorAll('[data-zclean-placeholder]').length === 1, '占位数量错误');
    assert(ad(card).getAttribute('href') === 'https://example.com/b', '新链接未更新');
    await pause();
    assert(card.querySelectorAll('[data-zclean-placeholder]').length === 1, '重复生成占位');
  });
  await test('盐选嵌入推荐只替换小卡片，外层正文保留', async () => {
    await mount('<article class="AnswerItem"><div class="RichText"><p id="readable">普通正文</p><div class="KfeCollection-VipRecommendCard" id="embedded"><a href="/market/paid_column/1">推荐书籍</a></div></div></article>');
    assert(!!ad(document.querySelector('#embedded')), '嵌入盐选卡片未替换');
    assert(shown(document.querySelector('#readable')), '整篇回答误处理');
  });
  await test('危险链接不生成可点击广告入口，合法外层链接保留', async () => {
    await mount('<div class="Pc-word-card" id="unsafe"><a href="javascript:void(0)">广告</a></div><a class="Banner-link" href="https://example.com/banner" id="outer"><img class="AdvertImg" alt="商品"></a>');
    assert(ad(document.querySelector('#unsafe'))?.tagName === 'SPAN', '不安全链接仍可点击');
    assert(document.querySelector('#outer').getAttribute('href') === 'https://example.com/banner', '外层链接改变');
    assert(!document.querySelector('#outer a'), '生成嵌套链接');
    assert(!!ad(document.querySelector('#outer')), '图片广告未替换');
  });
  await test('评论点赞的纯数字按钮、回复与评论正文保留', async () => {
    await mount('<section class="CommentItemV2"><div class="CommentItemV2-content"><a href="/question/1">点赞</a></div><div class="CommentItemV2-footer"><button class="CommentItemV2-likeBtn" id="number-like">23</button><button id="reply">回复</button></div></section>');
    assert(shown(document.querySelector('#number-like')), '评论点赞按钮应保留');
    assert(shown(document.querySelector('#reply')) && shown(document.querySelector('.CommentItemV2-content a')), '回复或评论正文被隐藏');
  });
  await test('带零宽字符的普通赞同保留，航海家计数入口隐藏', async () => {
    await mount('<div class="ContentItem-actions"><button id="zero">\u200b赞同 1.2 万</button><button id="sail-number">航海家赞同 18</button></div>');
    assert(shown(document.querySelector('#zero')), '普通赞同应保留');
    assert(!shown(document.querySelector('#sail-number')), '带计数航海家未识别');
  });
  await test('航海家赞同提示显示人数，作者正文与赞同保留', async () => {
    await mount('<article class="AnswerItem"><div class="AuthorInfo"><a class="UserLink-link">作者甲</a></div><div id="sail-row" class="css-new-layout"><span>航海家</span> <a href="/people/example">示例用户</a> 等 653 人赞同<svg width="12" height="12"></svg></div><div class="RichContent-inner"><p>普通回答内容</p></div><div class="ContentItem-actions"><button class="VoteButton" id="retained-vote">赞同 653</button></div></article>');
    const row = document.querySelector('#sail-row');
    assert(shown(row), '赞同人数所在行应保留');
    assert(getComputedStyle(row, '::before').content === '"653 人赞同"', '应显示 653 人赞同');
    assert(!shown(row.querySelector('span')) && !shown(row.querySelector('a')), '航海家标记和推荐者应隐藏');
    assert(shown(document.querySelector('.AuthorInfo')) && shown(document.querySelector('.RichContent-inner')), '作者或正文被隐藏');
    assert(shown(document.querySelector('#retained-vote')), '普通赞同按钮被隐藏');
  });
  await test('航海家提示动态变化与容器复用时重新识别', async () => {
    await mount('<article class="AnswerItem"><div id="changing-row">653 人赞同</div><div class="RichText">正文</div></article>');
    const row = document.querySelector('#changing-row');
    assert(shown(row), '普通赞同摘要应保留');
    row.textContent = '航海家 示例用户等 653 人赞同';
    await pause();
    assert(shown(row) && getComputedStyle(row, '::before').content === '"653 人赞同"', '动态提示应显示赞同人数');
    row.firstChild.data = '航海家 示例用户等 789 人赞同';
    await pause();
    assert(getComputedStyle(row, '::before').content === '"789 人赞同"', '赞同人数应随原页面更新');
    row.textContent = '654 人赞同';
    await pause();
    assert(shown(row) && !row.hasAttribute('data-zclean-sailor-count'), '容器复用后应恢复原始显示');
  });
  await test('正文引用与标题里的航海家赞同提示不被隐藏', async () => {
    await mount('<article class="AnswerItem"><h2 class="ContentItem-title"><a href="/question/1">航海家 示例用户等 653 人赞同</a></h2><div class="RichText"><div id="quote">航海家 示例用户等 653 人赞同</div><button class="VoteButton" id="quoted-button">赞同 1</button></div><div class="AuthorInfo"><a class="UserLink-link">航海家</a></div></article>');
    for (const selector of ['.ContentItem-title', '#quote', '#quoted-button', '.UserLink-link']) assert(shown(document.querySelector(selector)), selector + ' 应保留');
  });
  document.querySelector('#results').textContent = JSON.stringify({passed:results.filter(x=>x.passed).length, failed:results.filter(x=>!x.passed).length, results}, null, 2);
  document.documentElement.dataset.testResult = results.every(x=>x.passed) ? 'passed' : 'failed';
})();
window.testClickCount = 0;
document.addEventListener('click', () => window.testClickCount++);
