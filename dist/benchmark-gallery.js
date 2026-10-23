'use strict';

document.querySelectorAll('[data-benchmark-group]').forEach((group) => {
  const samples = [...group.querySelectorAll('.benchmark-sample')];
  const controls = group.querySelector('.benchmark-switch-controls');
  const title = group.querySelector('h3').textContent;
  let selected = samples.findIndex((sample) => !sample.hidden);
  samples.forEach((sample) => {
    const video = sample.querySelector('video');
    const button = sample.querySelector('.benchmark-play-toggle');
    button.addEventListener('click', async () => {
      if (!video.paused) { video.pause(); return; }
      if (video.ended) video.currentTime = 0;
      try { await video.play(); } catch { button.textContent = 'Retry playback'; }
    });
    video.addEventListener('play', () => { button.textContent = 'Pause excerpt'; });
    ['pause', 'ended'].forEach((event) => video.addEventListener(event, () => { button.textContent = 'Play excerpt'; }));
  });
  if (samples.length < 2) return;
  controls.hidden = false;
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-benchmark-direction]');
    if (!button) return;
    samples[selected].querySelector('video').pause();
    selected = (selected + Number(button.dataset.benchmarkDirection) + samples.length) % samples.length;
    samples.forEach((sample, index) => { sample.hidden = index !== selected; });
    group.querySelector('.benchmark-scene').textContent = samples[selected].dataset.title;
    const position = group.querySelector('.benchmark-position');
    position.textContent = `${selected + 1} / ${samples.length}`;
    position.setAttribute('aria-label', `${title} example ${selected + 1} of ${samples.length}`);
  });
});
document.addEventListener('play', (event) => {
  if (event.target.tagName !== 'VIDEO') return;
  document.querySelectorAll('video').forEach((video) => { if (video !== event.target) video.pause(); });
}, true);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) document.querySelectorAll('video').forEach((video) => video.pause());
});
