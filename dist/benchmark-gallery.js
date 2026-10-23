'use strict';

document.querySelectorAll('[data-benchmark-group]').forEach((group) => {
  const samples = [...group.querySelectorAll('.benchmark-sample')];
  const controls = group.querySelector('.benchmark-switch-controls');
  const title = group.querySelector('h3').textContent;
  let selected = samples.findIndex((sample) => !sample.hidden);
  if (samples.length < 2) return;
  controls.hidden = false;
  controls.addEventListener('click', (event) => {
    const button = event.target.closest('[data-benchmark-direction]');
    if (!button) return;
    selected = (selected + Number(button.dataset.benchmarkDirection) + samples.length) % samples.length;
    samples.forEach((sample, index) => { sample.hidden = index !== selected; });
    group.querySelector('.benchmark-scene').textContent = samples[selected].dataset.title;
    const position = group.querySelector('.benchmark-position');
    position.textContent = `${selected + 1} / ${samples.length}`;
    position.setAttribute('aria-label', `${title} example ${selected + 1} of ${samples.length}`);
  });
});
