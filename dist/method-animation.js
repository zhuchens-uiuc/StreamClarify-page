(function () {
  'use strict';

  const stageNames = ['Observe', 'Check', 'User guidance', 'Re-answer'];
  const durations = [4800, 5200, 5200, 5800];
  const frameSources = [
    { src: 'assets/drill-retrieved-1.jpg', time: '0 s' },
    { src: 'assets/drill-retrieved-2.jpg', time: '15 s' },
    { src: 'assets/drill-retrieved-3.jpg', time: '19 s' },
    { src: 'assets/drill-poster.jpg', time: '20 s' }
  ];

  window.createMethodAnimation = function createMethodAnimation({ root, onStep = function () {} }) {
    if (!root) throw new Error('The method animation needs a root element.');
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let stage = 0;
    let running = false;
    let ended = false;
    let elapsed = 0;
    let startedAt = 0;
    let timeout = null;
    let observer = null;

    const frame = (item, index, className = '') => `<figure class="ma-frame ${className}"><img src="${item.src}" alt="Electric-drill example, observed frame at ${item.time}" loading="lazy" decoding="async"><figcaption>${item.time}${index === 3 ? ' · query' : ''}</figcaption></figure>`;
    root.classList.add('method-animation');
    root.innerHTML = `
      <div class="ma-figure"><div class="ma-memory-column">
      <div class="ma-topline"><span>Illustrative video frames</span><span>Past → query</span></div>
      <div class="ma-video-strip">${frameSources.map((item, index) => frame(item, index, index === 3 ? 'ma-incoming-frame' : '')).join('')}</div>
      <p class="ma-fork-label">Incoming frames update both memories</p>
      <div class="ma-memories">
        <div class="ma-memory ma-active">
          <div class="ma-memory-heading"><span>Active context · TP-KV</span><span>bounded</span></div>
          <div class="ma-token-strip" aria-hidden="true"><div class="ma-history">${Array.from({ length: 12 }, (_, index) => `<i class="ma-token${index % 2 ? ' ma-subsampled' : ''}"></i>`).join('')}</div><div class="ma-recent">${'<i class="ma-token"></i>'.repeat(7)}</div></div>
          <div class="ma-memory-axis"><span>older tokens subsampled</span><span>recent detail protected</span></div>
        </div>
        <div class="ma-memory ma-archive">
          <div class="ma-memory-heading"><span>Searchable archive</span><span>separate CPU storage</span></div>
          <div class="ma-archive-items" aria-hidden="true">${frameSources.map((item) => `<span class="ma-archive-item"><img src="${item.src}" alt=""><span class="ma-semantic-key"></span></span>`).join('')}<span class="ma-archive-ellipsis">…</span></div>
          <p class="ma-memory-axis">Visual representations + semantic keys</p>
        </div>
      </div>
      </div><div class="ma-operation-column">
      <div class="ma-query"><span>Query</span><span>“What color is this?”</span></div>
      <div class="ma-process">
        <section class="ma-stage ma-stage-observe" data-stage-panel="0" aria-label="Observe">
          <p class="ma-process-title">Each incoming frame updates both memory paths.</p>
          <p class="ma-process-copy">Older active tokens are temporally subsampled. The independent archive keeps searchable visual representations.</p>
          <p class="ma-process-note">Images stand in for visual representations. Memory compression is schematic, not measured for this 20-second example.</p>
        </section>
        <section class="ma-stage ma-stage-check" data-stage-panel="1" aria-label="Check" hidden>
          <div class="ma-probe"><span class="ma-probe-input">Query + active context</span><span class="ma-down-arrow" aria-hidden="true">↓</span><span class="ma-probe-title">Would the answer rely on video evidence<br>rather than general knowledge?</span><span class="ma-yes-no">Yes / No</span><span class="ma-down-arrow" aria-hidden="true">↓</span><span class="ma-entropy">Uncertainty <i>H</i>(Yes, No) · fixed threshold τ</span></div>
          <div class="ma-decision"><span class="ma-bypass"><i>H</i> ≤ τ → direct answer<br><small>active TP-KV only</small></span><span class="ma-selected-route"><i>H</i> &gt; τ → clarification<br><small>illustrated route</small></span></div>
          <p class="ma-process-note">The second-stage answer is conditioned on the binary judgment.</p>
        </section>
        <section class="ma-stage ma-stage-clarify" data-stage-panel="2" aria-label="User guidance" hidden>
          <div class="ma-dialogue-line ma-followup"><span>Above the entropy threshold</span><p>Suspend the answer and request clarification.</p></div>
          <div class="ma-dialogue-line ma-reply"><span>Input to the framework</span><p>Clarified user guidance <i>R</i><sub>i</sub></p></div>
          <p class="ma-process-note ma-gate-note">User guidance is an input to the core framework. Question generation is evaluated separately as a proof of concept.</p>
        </section>
        <section class="ma-stage ma-stage-reanswer" data-stage-panel="3" aria-label="Re-answer" hidden>
          <div class="ma-retrieval-title"><span class="ma-retrieval-path" aria-hidden="true">↓</span><span>Guidance → archive retrieval → prefill</span></div>
          <div class="ma-temporary-context"><div class="ma-context-heading">Temporary answering context</div><div class="ma-context-inputs"><span class="ma-current-context">Current TP-KV</span><span class="ma-context-plus" aria-hidden="true">+</span><div class="ma-retrieved-candidates" aria-label="Retrieved candidates from 0, 15, and 19 seconds">${frameSources.slice(0, 3).map((item) => `<img src="${item.src}" alt="Retrieved candidate at ${item.time}">`).join('')}</div></div><p class="ma-context-note">retrieved candidates · persistent TP-KV stays unchanged</p></div>
          <div class="ma-recorded-answer"><span>Re-answer</span><p>Generate an answer using the temporary context.</p></div>
        </section>
      </div></div></div>
      <div class="ma-controls"><button type="button" class="plain-button" data-action="play">Play animation</button><button type="button" class="plain-button" data-action="restart">Restart</button><span class="ma-control-stage" aria-hidden="true">01 / 04</span></div>
      <p class="ma-caption">Conceptual animation of the core framework. Memory layout and timing are schematic; the video frames do not establish memory compression or recovery.</p>
      <p class="ma-accessible-status" role="status" aria-live="polite"></p>`;

    const panels = Array.from(root.querySelectorAll('[data-stage-panel]'));
    const playButton = root.querySelector('[data-action="play"]');
    const restartButton = root.querySelector('[data-action="restart"]');
    const stageLabel = root.querySelector('.ma-control-stage');
    const status = root.querySelector('.ma-accessible-status');

    function updateControls() {
      root.dataset.running = String(running);
      root.dataset.reducedMotion = String(reducedMotion.matches);
      playButton.textContent = running ? 'Pause animation' : ended ? 'Replay animation' : elapsed > 0 ? 'Resume animation' : 'Play animation';
      playButton.setAttribute('aria-label', playButton.textContent);
      stageLabel.textContent = `0${stage + 1} / 04`;
    }

    function render(animate) {
      root.dataset.stage = String(stage);
      root.dataset.phase = stageNames[stage].toLowerCase();
      root.dataset.animate = String(animate && !reducedMotion.matches);
      panels.forEach((panel, index) => { panel.hidden = index !== stage; });
      status.textContent = `${stage + 1} of 4: ${stageNames[stage]}.`;
      updateControls();
    }

    function clearTimer() {
      if (timeout !== null) window.clearTimeout(timeout);
      timeout = null;
    }

    function schedule() {
      clearTimer();
      startedAt = performance.now();
      timeout = window.setTimeout(function () {
        timeout = null;
        if (!running) return;
        elapsed = 0;
        if (stage === stageNames.length - 1) {
          running = false;
          ended = true;
          root.dataset.animate = 'false';
          status.textContent = 'Animation complete. Explore any method step above or replay.';
          updateControls();
          return;
        }
        stage += 1;
        render(true);
        onStep(stage);
        schedule();
      }, Math.max(0, durations[stage] - elapsed));
    }

    function pause() {
      if (!running) return;
      elapsed = Math.min(durations[stage], elapsed + performance.now() - startedAt);
      running = false;
      clearTimer();
      updateControls();
    }

    function play() {
      if (running) return;
      if (ended) {
        stage = 0;
        elapsed = 0;
        ended = false;
        onStep(stage);
      }
      running = true;
      if (elapsed === 0) {
        root.dataset.animate = 'false';
        void root.offsetWidth;
        render(true);
      } else {
        updateControls();
      }
      schedule();
    }

    function selectStep(index) {
      const next = Number(index);
      if (!Number.isInteger(next) || next < 0 || next >= stageNames.length) return;
      pause();
      stage = next;
      elapsed = 0;
      ended = false;
      render(false);
    }

    function restart() {
      pause();
      stage = 0;
      elapsed = 0;
      ended = false;
      render(false);
      onStep(stage);
      play();
    }

    function onPlayClick() { if (running) pause(); else play(); }
    function onVisibilityChange() { if (document.hidden) pause(); }
    function onReducedMotionChange() {
      root.dataset.reducedMotion = String(reducedMotion.matches);
      if (reducedMotion.matches) root.dataset.animate = 'false';
    }
    playButton.addEventListener('click', onPlayClick);
    restartButton.addEventListener('click', restart);
    document.addEventListener('visibilitychange', onVisibilityChange);
    reducedMotion.addEventListener('change', onReducedMotionChange);
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(function (entries) {
        if (entries.some((entry) => !entry.isIntersecting)) pause();
      }, { threshold: 0 });
      observer.observe(root);
    }
    render(false);

    return {
      selectStep,
      play,
      pause,
      restart,
      getState: function () { return { stage, running, ended, reducedMotion: reducedMotion.matches }; },
      destroy: function () {
        pause();
        clearTimer();
        playButton.removeEventListener('click', onPlayClick);
        restartButton.removeEventListener('click', restart);
        document.removeEventListener('visibilitychange', onVisibilityChange);
        reducedMotion.removeEventListener('change', onReducedMotionChange);
        if (observer) observer.disconnect();
      }
    };
  };
}());
