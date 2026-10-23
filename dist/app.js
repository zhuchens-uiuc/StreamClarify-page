'use strict';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const esc = (text) => String(text ?? '').replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const timestamp = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
let cases = [];
let results;
let coreResults;
let activeCase;
let step = 0;
let comparison = 'clarification';
let resultMode = 'trigger';
let replayTimer;
let walkthrough = false;
let methodAnimation;

function stopReplay() {
  clearTimeout(replayTimer);
  replayTimer = undefined;
  $('#replay').textContent = 'Replay dialogue';
  $('#replay').setAttribute('aria-label', 'Replay the interaction');
}

function turn(label, text, kind = '', note = '') {
  return `<li class="${esc(kind)}"><div class="turn-label">${esc(label)}</div><p class="turn-text">${esc(text)}</p>${note ? `<p class="turn-note">${esc(note)}</p>` : ''}</li>`;
}

function renderDialogue() {
  if (!activeCase) return;
  const c = activeCase;
  let html = turn('Question', c.question);
  if (comparison !== 'clarification') {
    const isDirect = comparison === 'direct';
    const correct = isDirect ? c.directCorrect : c.baselineCorrect;
    html += turn(isDirect ? 'Direct retrieval' : 'Without clarification', isDirect ? c.direct : c.baseline, correct ? 'answer' : 'failure', correct ? 'Paper evaluator: correct.' : 'Paper evaluator: incorrect.');
  } else {
    if (step >= 1) html += turn('Model follow-up', c.clarification, 'clarification');
    if (step >= 2) {
      html += c.fallbackToDirect
        ? turn('Evaluation protocol · fallback', 'The validity gate rejects this question. No simulated user reply is supplied.', 'reply', 'Evaluation-only gate; uses the annotated referent.')
        : turn('Simulated user reply', c.userReply, 'reply');
    }
    if (step >= 3) html += turn(c.fallbackToDirect ? 'Direct retrieval fallback' : 'Answer after retrieval', c.answer, c.success ? 'answer' : 'failure', c.success ? 'Paper evaluator: correct.' : 'Paper evaluator: incorrect.');
  }
  $('#dialogue').innerHTML = html;
  $('#previous-step').disabled = comparison !== 'clarification' || step === 0;
  $('#next-step').disabled = comparison !== 'clarification' || step === 3;
  const labels = ['Next: follow-up', c.fallbackToDirect ? 'Next: fallback' : 'Next: user reply', 'Next: answer', 'Complete'];
  $('#next-step').innerHTML = `${labels[step]} <span aria-hidden="true">→</span>`;
  $('#step-progress').textContent = comparison === 'clarification' ? `${step + 1} / 4` : '—';
  $('#step-progress').setAttribute('aria-label', comparison === 'clarification' ? `Step ${step + 1} of 4` : 'Comparison answer');
  ['#previous-step', '#next-step', '#step-progress'].forEach((selector) => {
    $(selector).hidden = !walkthrough || comparison !== 'clarification';
  });
  $$('.comparison-controls button').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.comparison === comparison)));
  $('#comparison-description').textContent = comparison === 'clarification'
    ? c.fallbackToDirect ? 'Generated follow-up, gate rejection, and direct-retrieval fallback.' : 'Generated follow-up, simulated reply, and re-answering.'
    : comparison === 'baseline' ? 'The original answer, before any clarification intervention.' : 'Retrieval and re-answering with the original query, without user guidance.';
}

function evidenceGrid(c) {
  return `<div class="evidence-grid">${c.evidence.map((frame) => `<button class="evidence-item" type="button" data-image="${esc(frame.image)}" data-caption="${esc(`${c.id} · ${frame.label} · recorded retrieval rank ${frame.retrievalRank}`)}" aria-label="Enlarge ${esc(frame.label)}"><img loading="lazy" src="${esc(frame.image)}" alt="${esc(`Retrieved video frame at ${timestamp(frame.time)}`)}" width="224" height="168"><span>${esc(timestamp(frame.time))} · retrieval rank ${frame.retrievalRank}</span></button>`).join('')}</div>`;
}

function renderEvidence() {
  const c = activeCase;
  let html = `<p class="evidence-caption">This audit shows the recorded clarification branch${c.fallbackToDirect ? ' (its direct-retrieval fallback)' : ''}; switching the answer comparison above does not change these frames or ranks. ${esc(c.evidenceNote)}</p>${evidenceGrid(c)}<p class="small-note">${esc(c.id)} · ${esc(c.source.dataset)} · question at ${timestamp(c.queryTime)} · original sampling: ${c.sourceFps} fps. Clip and retrieval frames are at or before the question timestamp. Step replay uses a presentation pace, not measured inference latency.</p>`;
  const audit = cases.find((item) => item.displayRole === 'audit');
  if (audit) {
    html += `<details class="audit-case"><summary>Evidence audit: a correct-rated answer with unverified visual support</summary><p class="audit-answer">${esc(audit.description)}</p><p class="audit-answer"><strong>Question:</strong> ${esc(audit.question)}<br><strong>Simulated reply:</strong> ${esc(audit.userReply)}<br><strong>Recorded answer:</strong> ${esc(audit.answer)}</p>${evidenceGrid(audit)}<p class="small-note">${esc(audit.id)} · question at ${timestamp(audit.queryTime)}. ${esc(audit.evidenceNote)}</p></details>`;
  }
  html += '<p class="small-note" style="margin-top:15px"><a href="data/cases.json" download>Download the recorded example data</a></p>';
  $('#evidence-content').innerHTML = html;
}

function selectCase(id) {
  stopReplay();
  activeCase = cases.find((c) => c.id === id);
  step = 3;
  walkthrough = false;
  comparison = 'clarification';
  const video = $('#example-video');
  video.pause();
  video.poster = activeCase.poster;
  video.src = activeCase.video;
  video.load();
  $('#video-unavailable').hidden = true;
  $('#case-title').textContent = activeCase.kicker;
  $('#case-summary').textContent = activeCase.description;
  $('#query-time').textContent = `Query ${timestamp(activeCase.queryTime)}`;
  $('#video-window').textContent = `Clip ${timestamp(activeCase.clipStart)}–${timestamp(activeCase.clipEnd)} · preview ${timestamp(activeCase.posterTime)}`;
  $('.video-frame').style.aspectRatio = activeCase.aspectRatio || '4 / 3';
  $('#video-context').textContent = activeCase.previewNote || '';
  $('#video-context').hidden = !activeCase.previewNote || activeCase.clipEnd === activeCase.queryTime;
  $('#example-caption').textContent = activeCase.fallbackToDirect
    ? 'The gate rejects the follow-up. No reply is supplied; direct retrieval is used.'
    : 'Recorded model outputs and simulated replies.';
  $$('#case-tabs button').forEach((button) => {
    const selected = button.dataset.case === id;
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  $('#example-panel').setAttribute('aria-labelledby', `case-tab-${id}`);
  renderDialogue();
  renderEvidence();
}

function setupCases(data) {
  cases = data.cases;
  const featured = cases.filter((c) => c.displayRole !== 'audit');
  $('#case-tabs').innerHTML = featured.map((c) => `<button id="case-tab-${c.id}" type="button" role="tab" aria-controls="example-panel" aria-selected="false" tabindex="-1" data-case="${c.id}"><img src="${esc(c.poster)}" alt="" width="192" height="108"><span class="case-tab-title">${esc(c.tabLabel || c.title)}</span></button>`).join('');
  selectCase(featured[0].id);
  $('#case-tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-case]');
    if (button) selectCase(button.dataset.case);
  });
  $('#previous-step').addEventListener('click', () => { stopReplay(); step = Math.max(0, step - 1); renderDialogue(); });
  $('#next-step').addEventListener('click', () => { stopReplay(); step = Math.min(3, step + 1); renderDialogue(); });
  $$('.comparison-controls button').forEach((button) => button.addEventListener('click', () => { stopReplay(); comparison = button.dataset.comparison; renderDialogue(); }));
  $('#replay').addEventListener('click', () => {
    if (replayTimer) { stopReplay(); return; }
    step = 0; walkthrough = true; comparison = 'clarification'; renderDialogue();
    $('#replay').textContent = 'Pause replay';
    $('#replay').setAttribute('aria-label', 'Pause the interaction replay');
    const advance = () => {
      step += 1; renderDialogue();
      if (step < 3) replayTimer = setTimeout(advance, activeCase.fallbackToDirect && step === 2 ? 3500 : 2400);
      else stopReplay();
    };
    replayTimer = setTimeout(advance, 1800);
  });
  $('#play-clip').addEventListener('click', () => {
    const video = $('#example-video');
    if (!video.paused) { video.pause(); return; }
    if (video.ended || video.currentTime > video.duration - 0.2) video.currentTime = 0;
    video.play().catch(() => { $('#video-unavailable').hidden = false; });
  });
  $('#example-video').addEventListener('play', () => { $('#play-clip').textContent = 'Pause clip'; });
  $('#example-video').addEventListener('pause', () => { $('#play-clip').textContent = 'Play clip'; });
  $('#example-video').addEventListener('error', () => { $('#video-unavailable').hidden = false; });
}

const methodSteps = [
  {label:'01 / Observe', title:'Keep recent detail. Compress older context.', text:'TP-KV keeps the active context within a fixed token budget. A separate CPU archive stores searchable visual representations.', note:'Archive storage can have its own retention window.'},
  {label:'02 / Check', title:'Check uncertainty before answering.', text:'Ask whether the answer relies on video evidence rather than general knowledge. Compare the Yes/No entropy with a fixed threshold for each backbone.', note:'Above threshold → request guidance. Below threshold → answer directly.'},
  {label:'03 / User guidance', title:'Receive clarified guidance.', text:'Pause the answer on selected queries. Use the resulting guidance to search the video archive.', note:'The main analysis uses oracle guidance. Generated questions and simulated replies are a separate proof of concept.'},
  {label:'04 / Re-answer', title:'Search the past with user guidance.', text:'Retrieve historical frames. Add them to a temporary answering context alongside active TP-KV. Leave persistent TP-KV unchanged.', note:'Retrieved frames are candidates. The experiments do not isolate recovery of evicted evidence.'}
];

function selectMethod(index, fromAnimation = false) {
  const data = methodSteps[index];
  $$('.method-tabs button').forEach((button, i) => { button.setAttribute('aria-selected', String(i === index)); button.tabIndex = i === index ? 0 : -1; });
  $('#method-panel').setAttribute('aria-labelledby', `method-tab-${index}`);
  $('#method-step-label').textContent = data.label;
  $('#method-step-title').textContent = data.title;
  $('#method-step-description').textContent = data.text;
  $('#method-step-note').textContent = data.note;
  if (methodAnimation && !fromAnimation) methodAnimation.selectStep(index);
}

function table(headers, rows, highlighted = -1) {
  return `<div class="data-table-wrap"><table class="data-table"><thead><tr>${headers.map((heading) => `<th scope="col">${esc(heading)}</th>`).join('')}</tr></thead><tbody>${rows.map((row, index) => `<tr${index === highlighted ? ' class="featured-row"' : ''}>${row.map((value, cell) => cell === 0 ? `<th scope="row">${esc(value)}</th>` : `<td>${esc(value)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

function renderResults() {
  if (!results || !coreResults) return;
  const clarification = resultMode === 'clarification';
  const trigger = resultMode === 'trigger';
  const memory = resultMode === 'memory';
  let rows;
  let maximum;
  $('#dataset-control').hidden = clarification || trigger;
  $('#backbone-control').hidden = !trigger;
  $('#clarification-result-note').hidden = !clarification;
  $('#core-result-note').hidden = !trigger && !memory;
  $$('.results-tabs button').forEach((button) => { const selected = button.dataset.result === resultMode; button.setAttribute('aria-selected', String(selected)); button.tabIndex = selected ? 0 : -1; });
  $('#results-panel').setAttribute('aria-labelledby', `result-tab-${resultMode}`);
  if (trigger) {
    const data = coreResults.trigger;
    const backbone = data.backbones[Number($('#backbone-select').value)];
    rows = backbone.methods.map((method) => ({label:method.label, sub:`${method.trigger_rate_percent.toFixed(1)}% of queries selected`, value:method.precision_percent, highlight:method.id === 'entropy'}));
    maximum = 100;
    $('#chart-title').textContent = 'Selecting initially incorrect answers';
    $('#chart-subtitle').textContent = `${backbone.name} · 1,837 pooled questions · trigger precision`;
    $('#core-result-note').textContent = `Entropy selection improves initial-error precision by ${backbone.precision_gain_pp.toFixed(1)} points over random at comparable selection rates.`;
    $('#results-details-content').innerHTML = `<p>${esc(data.precision_definition)} ${esc(data.recall_definition)}</p>${table(['Selection', 'Trigger rate (%)', 'Precision (%)', 'Recall (%)'], backbone.methods.map((m) => [m.label,m.trigger_rate_percent.toFixed(1),m.precision_percent.toFixed(1),m.recall_percent.toFixed(1)]),1)}<p>${esc(data.mechanism.score)} ${esc(data.mechanism.threshold_setting)}</p><p>The trigger measurements come from the paper’s oracle-guided analysis, not the generated-question PoC. Oracle guidance is supplied only after a trigger.</p><h4>Qwen downstream results with oracle guidance</h4>${table(['Condition','Micro (%)','Macro (%)','Mean TTFT (s)'], data.oracle_context.conditions.map((c) => [c.name,c.micro_accuracy_percent.toFixed(1),c.macro_accuracy_percent.toFixed(1),c.ttft_seconds.toFixed(3)]),2)}<p>These timings describe the oracle-guided experiment. They are not the latency of a natural user interaction.</p><h4>Pre-answer scoring ablation</h4><p>Qwen3-VL on OVO-Bench, with clarification, retrieval, and re-answering disabled. Accuracy is for the initial answer.</p>${table(['Scoring strategy','Macro (%)','TTFT (s)'],data.scoring_ablation.methods.map((m) => [m.name,m.macro_accuracy_percent.toFixed(1),m.ttft_seconds.toFixed(3)]),4)}<p><a href="data/core-results.json" download>Download the core results</a> · Paper Tables 3 and 5</p>`;
  } else if (memory) {
    const data = coreResults.memory;
    const dataset = data.datasets[Number($('#dataset-select').value)];
    maximum = 60;
    rows = dataset.methods.map((m) => ({label:m.name, sub:m.name === 'StreamClarify' ? 'Ours · no clarification' : '', value:m.macro_accuracy_percent, highlight:m.name === 'StreamClarify'}));
    $('#chart-title').textContent = `Macro accuracy with 6K active context: ${dataset.name}`;
    $('#chart-subtitle').textContent = 'Qwen3-VL · clarification disabled · CPU storage is separate';
    const gain = dataset.gains.find((g) => g.metric === 'macro');
    $('#core-result-note').textContent = `Paired Macro gain over ${gain.baseline}: ${gain.gain_pp.toFixed(1)} points. 95% CI: ${gain.ci95_pp[0].toFixed(1)} to ${gain.ci95_pp[1].toFixed(1)}.${gain.interval_includes_zero ? ' The interval includes zero.' : ''}`;
    $('#results-details-content').innerHTML = `<p>${esc(data.regime)}</p><p>${esc(data.notes[0])}</p><p>${esc(data.notes[1])}</p>${table(['Method','Macro (%)','Micro (%)','TTFT (s)','ProcFPS'],dataset.methods.map((m) => [m.name,m.macro_accuracy_percent.toFixed(1),m.micro_accuracy_percent.toFixed(1),m.ttft_seconds.toFixed(3),m.processing_fps.toFixed(2)]),3)}<p>${esc(data.metric_definition)}</p>${table(['Paired gain','Strongest baseline','Gain (pp)','95% CI'],dataset.gains.map((g) => [g.metric,g.baseline,g.gain_pp.toFixed(1),g.ci95_pp.map((v) => v.toFixed(1)).join(' to ')]))}<p>${esc(data.interval_definition)} ${esc(data.rounding_note)}</p><p>Under the 6K setting, 85.2% of StreamClarify queries arrive after its first compression. This shows exposure to memory pressure; it does not verify that a query’s necessary evidence was removed.</p><p>${esc(data.notes[4])}</p><p><a href="data/core-results.json" download>Download the core results</a> · Paper Table 6</p>`;
  } else if (clarification) {
    const data = results.clarification;
    const order = ['without_clarification', 'direct_retrieval', 'entropy_gated_generated', 'generated_forced_on', 'oracle'];
    rows = order.map((id) => data.conditions.find((condition) => condition.id === id)).map((condition) => ({label:condition.label, sub:condition.selection, value:condition.accuracy_percent, highlight:condition.id === 'entropy_gated_generated', oracle:condition.id === 'oracle'}));
    maximum = 50;
    $('#chart-title').textContent = 'Accuracy on 302 ambiguous questions';
    $('#chart-subtitle').textContent = 'Qwen3-VL · proof of concept · simulated referent-only replies';
    $('#results-details-content').innerHTML = `<p>${esc(data.protocol_note)}</p><p>${esc(data.selection_note)}</p>${table(['Condition', 'Selection', 'Correct / 302', 'Accuracy', 'Corrections', 'Harms'], data.conditions.map((c) => [c.label,c.selection,c.correct,`${c.accuracy_percent.toFixed(1)}%`,c.wrong_to_correct,c.correct_to_wrong]),1)}<p>${esc(data.denominator_note)} ${esc(data.evaluation)}</p><p>The confidence interval is for the paired accuracy gain, not the absolute accuracy. The published generated-question analysis does not include a matched-rate random-selection control.</p><p><a href="data/results.json" download>Download the displayed results</a> · Paper Table 4</p>`;
  } else {
    const data = results.qwen_main;
    const dataset = data.datasets[Number($('#dataset-select').value)];
    maximum = 60;
    rows = dataset.methods.map((method) => ({label:method.name, sub:method.name === 'StreamClarify' ? 'Ours · no clarification' : '', value:method.macro_accuracy_percent, highlight:method.name === 'StreamClarify'}));
    $('#chart-title').textContent = `Macro accuracy on ${dataset.name}`;
    $('#chart-subtitle').textContent = `Qwen3-VL · ${dataset.qa_count.toLocaleString()} questions · without clarification`;
    $('#results-details-content').innerHTML = `<p>${esc(data.regime)} ${esc(data.budget_note)}</p>${table(['Method', 'Macro (%)', 'Micro (%)', 'TTFT (s)', 'ProcFPS'], dataset.methods.map((m) => [m.name,m.macro_accuracy_percent.toFixed(1),m.micro_accuracy_percent.toFixed(1),m.ttft_seconds.toFixed(3),m.processing_fps.toFixed(2)]),3)}<p>${esc(data.macro_definition)} ${esc(data.latency_note)}</p><p><a href="data/results.json" download>Download the displayed results</a> · Paper Table 2</p>`;
  }
  $('#results-chart').innerHTML = rows.map((row) => `<div class="chart-row"><div class="chart-label">${esc(row.label)}${row.sub ? `<small>${esc(row.sub)}</small>` : ''}</div><div class="bar-track" aria-hidden="true"><div class="bar${row.highlight ? ' highlight' : ''}${row.oracle ? ' oracle' : ''}" style="width:${(row.value / maximum * 100).toFixed(2)}%"></div></div><span class="chart-value${row.highlight ? ' highlight' : ''}">${row.value.toFixed(1)}%</span></div>`).join('') + `<div class="chart-axis" aria-hidden="true"><span></span><div><div class="chart-ticks">${Array.from({length:6},(_,i) => `<span>${i * maximum / 5}</span>`).join('')}</div><div class="chart-axis-label">${trigger ? 'Initial-error precision' : clarification ? 'Accuracy' : 'Macro accuracy'} (%)</div></div><span></span></div>`;
}

function setupKeyboardTabs() {
  $$('[role="tablist"]').forEach((tablist) => tablist.addEventListener('keydown', (event) => {
    if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const buttons = [...tablist.querySelectorAll('[role="tab"]')];
    const current = buttons.indexOf(document.activeElement);
    if (current < 0) return;
    event.preventDefault();
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[target].click(); buttons[target].focus();
  }));
}

async function loadJSON(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

async function init() {
  methodAnimation = window.createMethodAnimation({root: $('#method-animation'), onStep: (index) => selectMethod(index, true)});
  selectMethod(0);
  $$('.method-tabs button').forEach((button) => button.addEventListener('click', () => selectMethod(Number(button.dataset.method))));
  $$('.results-tabs button').forEach((button) => button.addEventListener('click', () => { resultMode = button.dataset.result; renderResults(); }));
  $$('.experiment-map a').forEach((link) => link.addEventListener('click', () => {
    const tab = $(link.getAttribute('href'));
    if (tab) { tab.click(); tab.focus({preventScroll:true}); }
  }));
  $('#dataset-select').addEventListener('change', renderResults);
  $('#backbone-select').addEventListener('change', renderResults);
  const loaded = await Promise.allSettled([loadJSON('data/cases.json'), loadJSON('data/results.json'), loadJSON('data/core-results.json')]);
  if (loaded[0].status === 'fulfilled') setupCases(loaded[0].value);
  else { $('#case-title').textContent = 'Example data unavailable'; $('#dialogue').innerHTML = '<li>The example data could not load. Please reload, or read the examples in the paper.</li>'; console.error(loaded[0].reason); }
  if (loaded[1].status === 'fulfilled' && loaded[2].status === 'fulfilled') { results = loaded[1].value; coreResults = loaded[2].value; renderResults(); }
  else { $('#results-chart').innerHTML = '<p>The chart data could not load. Full results are available in the paper.</p>'; console.error(loaded[1].reason); }
  setupKeyboardTabs();
  $('#evidence-content').addEventListener('click', (event) => {
    const button = event.target.closest('[data-image]');
    if (!button) return;
    $('#large-frame').src = button.dataset.image;
    $('#large-frame').alt = button.dataset.caption;
    $('#large-frame-caption').textContent = button.dataset.caption;
    $('#frame-dialog').showModal();
  });
  $('#close-frame').addEventListener('click', () => $('#frame-dialog').close());
  $('#frame-dialog').addEventListener('click', (event) => { if (event.target === $('#frame-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
  try { const response = await fetch('citation.bib'); if (response.ok) $('#citation-text').textContent = (await response.text()).trim(); } catch {  }
  $('#copy-citation').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('#citation-text').textContent);
      $('#copy-status').textContent = 'Citation copied.';
    } catch {
      const selection = window.getSelection(); const range = document.createRange(); range.selectNodeContents($('#citation-text')); selection.removeAllRanges(); selection.addRange(range);
      $('#copy-status').textContent = 'Citation selected. Press Ctrl+C or Command+C to copy.';
    }
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { stopReplay(); $('#example-video').pause(); } });
}
init();
