#!/usr/bin/env python3
"""Render the static dataset gallery from its source-checked example JSON."""
import argparse
from html import escape
import json
from pathlib import Path

DIST = Path(__file__).resolve().parents[1] / 'dist'
START = '<!-- benchmark-examples:start -->'
END = '<!-- benchmark-examples:end -->'
TYPES = [
    ('standard', 'Standard', 995, 'Well-specified questions with a supported answer.'),
    ('ambiguous', 'Ambiguous', 302, 'Questions with an unclear intended referent.'),
    ('evidence_absent', 'Unanswerable', 540, 'No supported substantive answer option.'),
]


def timestamp(seconds):
    return f'{int(seconds // 60):02d}:{int(seconds % 60):02d}'


def render_sample(example, visible):
    ex = example
    original_text = (ex.get('originalQuestion') or '').split(' Options:', 1)[0]
    original = (f'<details class="benchmark-reference"><summary>Source question</summary><p class="annotation-source">{escape(original_text)}</p></details>'
                if ex.get('originalQuestion') else '')
    options = ('<ol class="benchmark-options">' + ''.join(f'<li>{escape(o)}</li>' for o in ex['options']) + '</ol>'
               if ex['options'] else '')
    explanation = ex.get('ambiguityExplanation') or (ex.get('meaning') if ex['type'] == 'evidence_absent' else '')
    meaning = (f'<p class="annotation-meaning">{escape(explanation)}</p>' if explanation else '')
    title = escape(ex.get('title', ex['label']), quote=True)
    start, end, query = ex['clipStartSeconds'], ex['clipEndSeconds'], ex['queryTimeSeconds']
    offset, width = start / query * 100, (end - start) / query * 100
    return f'''<article class="benchmark-sample" id="benchmark-sample-{ex['id']}" data-benchmark="{ex['id']}" data-title="{title}" data-clip-start="{start:g}" data-clip-end="{end:g}" data-query="{query:g}" aria-label="{title}"{'' if visible else ' hidden'}>
          <figure>
            <div class="benchmark-video-shell"><video src="{ex['video']}" poster="{ex['image']}" aria-label="{escape(ex['alt'], quote=True)} Video excerpt from {timestamp(start)} to {timestamp(end)}." width="{ex['width']}" height="{ex['height']}" controls playsinline muted preload="none"></video></div>
            <div class="benchmark-playback"><button class="plain-button benchmark-play-toggle" type="button">Play excerpt</button><span>{timestamp(start)}–{timestamp(end)}</span></div>
            <div class="benchmark-timeline" role="img" aria-label="Observed video from zero to {timestamp(query)}. Highlighted excerpt: {timestamp(start)} to {timestamp(end)}."><div class="benchmark-timeline-track"><span class="benchmark-excerpt-range" style="left:{offset:.4f}%;width:{width:.4f}%"></span><span class="benchmark-query-marker"></span></div><div class="benchmark-timeline-labels"><span>00:00</span><span>Observed video</span><span>{timestamp(query)}</span></div></div>
            <figcaption>{escape(ex['dataset'])} · Question at {timestamp(query)}</figcaption>
          </figure>
          <div class="benchmark-qa"><p class="annotation-question"><span>Question</span>{escape(ex['question'])}</p>{options}<p class="annotation-answer"><span>Reference answer</span>{escape(ex['referenceAnswer'])}</p>{meaning}{original}</div>
        </article>'''


def render_gallery(examples):
    columns = []
    for type_id, label, count, definition in TYPES:
        group = [ex for ex in examples if ex['type'] == type_id]
        if type_id == 'standard' and len(group) > 1:
            group = group[1:] + group[:1]
        if not group:
            raise ValueError(f'Missing benchmark category: {type_id}')
        title = escape(group[0].get('title', group[0]['label']))
        samples = '\n'.join(render_sample(ex, index == 0) for index, ex in enumerate(group))
        columns.append(f'''<section class="benchmark-type" data-benchmark-group="{type_id}" aria-labelledby="benchmark-heading-{type_id}">
        <div class="type-heading"><h3 id="benchmark-heading-{type_id}">{label}</h3><span>{count}</span></div>
        <p class="type-construction">{definition}</p>
        <div class="benchmark-switcher"><span class="benchmark-scene">{title}</span><div class="benchmark-switch-controls" hidden><span class="benchmark-position" aria-live="polite" aria-atomic="true" aria-label="{label} example 1 of {len(group)}">1 / {len(group)}</span><button type="button" data-benchmark-direction="-1" aria-label="Previous {label.lower()} example">←</button><button type="button" data-benchmark-direction="1" aria-label="Next {label.lower()} example">→</button></div></div>
        <div class="benchmark-samples">{samples}</div>
      </section>''')
    return '\n        <div class="benchmark-examples">' + '\n'.join(columns) + '</div>\n        '


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if the checked-in HTML is stale.')
    args = parser.parse_args()
    examples = json.loads((DIST / 'data/benchmark-examples.json').read_text())['examples']
    page = DIST / 'index.html'
    html = page.read_text()
    before, remainder = html.split(START, 1)
    _, after = remainder.split(END, 1)
    rendered = before + START + render_gallery(examples) + END + after
    if args.check:
        if rendered != html:
            raise SystemExit('Benchmark HTML is stale. Run python tools/build_benchmark.py')
        print(f'BENCHMARK_RENDER_CHECK_PASSED {len(examples)} source-backed examples')
    else:
        page.write_text(rendered)
        print(f'Rendered {len(examples)} benchmark examples')


if __name__ == '__main__':
    main()
