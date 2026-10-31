'use strict';
document.querySelector('#add').addEventListener('click', () => {
  const card = document.querySelector('.bili-video-card').cloneNode(true);
  const marker = document.createElement('span');
  marker.className = 'bili-video-card__info--creative-ad';
  marker.textContent = '推广';
  card.querySelector('.meta').replaceChildren(marker);
  document.querySelector('.grid').append(card);
});
document.querySelector('#recycle').addEventListener('click', () => {
  const card = document.querySelectorAll('.bili-video-card')[1];
  const title = card.querySelector('h3');
  title.querySelector('a').textContent = '刚换入的普通视频';
  title.title = '刚换入的普通视频';
  card.querySelector('.meta').textContent = '普通视频 · 换一批后恢复';
});
