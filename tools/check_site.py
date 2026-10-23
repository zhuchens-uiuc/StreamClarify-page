#!/usr/bin/env python3
"""Dependency-free validation of the GitHub Pages publication directory."""
import hashlib
import json
import re
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit

DIST = Path(__file__).resolve().parents[1] / 'dist'


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []
        self.references = []
        self.errors = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            self.ids.append(attrs['id'])
        for key in ('href', 'src', 'poster'):
            if attrs.get(key):
                self.references.append(attrs[key])
        if tag == 'img' and 'alt' not in attrs:
            self.errors.append('Image missing alt attribute')


class BenchmarkExampleParser(HTMLParser):
    """Read the visible annotation fields, excluding their short UI labels."""

    def __init__(self):
        super().__init__()
        self.examples = []
        self.current = None
        self.capture = None
        self.capture_tag = None
        self.text = []
        self.in_label = False
        self.in_options = False

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == 'article' and 'data-benchmark' in attrs:
            self.current = {'id': attrs['data-benchmark'], 'options': [], 'clipStartSeconds': float(attrs['data-clip-start']), 'clipEndSeconds': float(attrs['data-clip-end']), 'queryTimeSeconds': float(attrs['data-query'])}
            self.examples.append(self.current)
        if self.current is None:
            return
        if tag == 'video':
            self.current['image'] = attrs.get('poster')
            self.current['video'] = attrs.get('src')
        classes = attrs.get('class', '').split()
        if tag == 'ol' and 'benchmark-options' in classes:
            self.in_options = True
        fields = {'annotation-question': 'question', 'annotation-answer': 'referenceAnswer', 'annotation-source': 'originalQuestion'}
        field = next((fields[c] for c in classes if c in fields), None)
        if tag == 'figcaption':
            field = 'caption'
        elif tag == 'li' and self.in_options:
            field = 'option'
        if field:
            self.capture, self.capture_tag, self.text = field, tag, []
        elif tag == 'span' and self.capture:
            self.in_label = True

    def handle_data(self, data):
        if self.capture and not self.in_label:
            self.text.append(data)

    def handle_endtag(self, tag):
        if tag == 'span':
            self.in_label = False
        if self.current is not None and self.capture and tag == self.capture_tag:
            value = ' '.join(''.join(self.text).split())
            if self.capture == 'option':
                self.current['options'].append(value)
            else:
                self.current[self.capture] = value
            self.capture = self.capture_tag = None
        if tag == 'ol':
            self.in_options = False
        if tag == 'article':
            self.current = None


def main():
    errors = []
    checks = 0

    def require(condition, message):
        nonlocal checks
        checks += 1
        if not condition:
            errors.append(message)

    html = (DIST / 'index.html').read_text()
    page = PageParser()
    page.feed(html)
    visible_benchmark = BenchmarkExampleParser()
    visible_benchmark.feed(html)
    errors.extend(page.errors)
    require(len(page.ids) == len(set(page.ids)), 'Duplicate HTML IDs')
    cases = json.loads((DIST / 'data/cases.json').read_text())['cases']
    require(len({c['id'] for c in cases}) == len(cases), 'Duplicate case IDs')
    results = json.loads((DIST / 'data/results.json').read_text())
    core = json.loads((DIST / 'data/core-results.json').read_text())
    references = page.references + ['app.js', 'style.css', 'data/cases.json', 'data/results.json', 'data/core-results.json', 'data/benchmark-examples.json', 'citation.bib']
    benchmark_examples = json.loads((DIST / 'data/benchmark-examples.json').read_text())['examples']
    require({e['type'] for e in benchmark_examples} == {'standard', 'ambiguous', 'evidence_absent'}, 'Benchmark examples must cover all three types')
    require(all(sum(e['type'] == category for e in benchmark_examples) >= 2 for category in {'standard', 'ambiguous', 'evidence_absent'}), 'Each benchmark category needs multiple examples')
    require(len({e['id'] for e in benchmark_examples}) == len(benchmark_examples), 'Duplicate benchmark example IDs')
    require(len(visible_benchmark.examples) == len(benchmark_examples) and {e['id'] for e in visible_benchmark.examples} == {e['id'] for e in benchmark_examples}, 'Rendered benchmark articles do not match example IDs')
    visible_by_id = {e['id']: e for e in visible_benchmark.examples}
    for example in benchmark_examples:
        label = f'Benchmark {example["id"]}'
        references.extend([example['image'], example['video']])
        require(0 <= example['clipStartSeconds'] < example['clipEndSeconds'] <= example['queryTimeSeconds'], f'{label}: future or invalid video excerpt')
        require(example['clipStartSeconds'] <= example['frameTimeSeconds'] <= example['clipEndSeconds'], f'{label}: poster outside excerpt')
        video_path = (DIST / example['video']).resolve()
        valid_video = video_path.is_relative_to(DIST.resolve()) and video_path.is_file()
        require(valid_video, f'{label}: missing or invalid video')
        if valid_video:
            require(hashlib.sha256(video_path.read_bytes()).hexdigest() == example['provenance']['videoSha256'], f'{label}: video hash changed')
        require(0 <= example['frameTimeSeconds'] <= example['queryTimeSeconds'], f'{label}: future or invalid frame')
        require(example['provenance']['frameTimeSeconds'] == example['frameTimeSeconds'], f'{label}: inconsistent frame provenance')
        image_path = (DIST / example['image']).resolve()
        valid_image = image_path.is_relative_to(DIST.resolve()) and image_path.is_file()
        require(valid_image, f'{label}: missing or invalid image')
        if valid_image:
            require(hashlib.sha256(image_path.read_bytes()).hexdigest() == example['provenance']['imageSha256'], f'{label}: image hash changed')
        shown = visible_by_id.get(example['id'], {})
        for field in ('question', 'referenceAnswer', 'options', 'image', 'video', 'clipStartSeconds', 'clipEndSeconds', 'queryTimeSeconds', 'originalQuestion'):
            expected = example.get(field)
            if field == 'originalQuestion' and expected:
                expected = expected.split(' Options:', 1)[0]
            require(shown.get(field) == expected, f'{label}: visible {field} differs from annotation JSON')
        query = example['queryTimeSeconds']
        time = f'{int(query // 60):02d}:{int(query % 60):02d}'
        require(shown.get('caption') == f'{example["dataset"]} · Question at {time}', f'{label}: visible query time or dataset differs from annotation JSON')
    for c in cases:
        references.extend([c['video'], c['poster']])
        require(0 <= c['clipStart'] < c['clipEnd'], f'{c["id"]}: invalid video interval')
        require(c['clipEnd'] <= c['queryTime'], f'{c["id"]}: future video content')
        require(c['posterTime'] <= c['queryTime'], f'{c["id"]}: future poster')
        if c['fallbackToDirect']:
            require(c['userReply'] is None, f'{c["id"]}: fallback incorrectly supplies user reply')
            require(c['answer'] == c['direct'], f'{c["id"]}: fallback answer differs from recorded direct answer')
        for frame in c['evidence']:
            references.append(frame['image'])
            require(frame['time'] <= c['queryTime'], f'{c["id"]}: future retrieved frame')
            require(frame['retrievedRange'][0] <= frame['time'] <= frame['retrievedRange'][1], f'{c["id"]}: frame outside retrieval range')
    for reference in references:
        parts = urlsplit(reference)
        if parts.scheme or parts.netloc:
            require(parts.scheme in ('https', 'mailto'), f'Unexpected external scheme: {reference}')
            continue
        require(not parts.path.startswith('/'), f'Root-relative asset breaks project Pages: {reference}')
        if parts.path:
            path = (DIST / unquote(parts.path)).resolve()
            require(path.is_relative_to(DIST.resolve()), f'Reference escapes published directory: {reference}')
            require(path.is_file(), f'Missing local file: {reference}')
        elif parts.fragment:
            require(parts.fragment in page.ids, f'Missing anchor: {reference}')
    benchmark = results['benchmark']
    require(sum(c['count'] for c in benchmark['categories']) == benchmark['total_qa'] == 1837, 'Benchmark count mismatch')
    require(sum(d['video_count'] for d in benchmark['datasets']) == benchmark['total_videos'] == 355, 'Video count mismatch')
    data = results['clarification']
    baseline = next(c for c in data['conditions'] if c['id'] == 'without_clarification')['correct']
    for c in data['conditions']:
        require(round(c['correct'] / data['denominator'] * 100, 1) == c['accuracy_percent'], f'Wrong accuracy: {c["id"]}')
        require(baseline + c['wrong_to_correct'] - c['correct_to_wrong'] == c['correct'], f'Wrong paired change: {c["id"]}')
    require(not list(DIST.rglob('*.pdf')), 'Manuscript PDFs are temporarily withheld')
    require(not re.search(r'(?:href|src)=[\"\'][^\"\']*\.pdf', html, re.IGNORECASE), 'PDF download link remains')
    for backbone in core['trigger']['backbones']:
        random, entropy = backbone['methods']
        require(round(entropy['precision_percent'] - random['precision_percent'], 1) == backbone['precision_gain_pp'], f'Trigger precision difference mismatch: {backbone["name"]}')
        for method in backbone['methods']:
            require(all(0 <= method[key] <= 100 for key in ['trigger_rate_percent', 'precision_percent', 'recall_percent']), 'Invalid trigger percentage')
    for dataset in core['memory']['datasets']:
        for gain in dataset['gains']:
            require((gain['ci95_pp'][0] <= 0 <= gain['ci95_pp'][1]) == gain['interval_includes_zero'], 'Memory CI scope mismatch')
    files = [p for p in DIST.rglob('*') if p.is_file()]
    for path in files:
        require(not path.is_symlink(), f'Symlink in Pages artifact: {path.name}')
        require('openreview' not in path.name.lower(), 'Private review document in public artifact')
        require(path.stat().st_size < 25_000_000, f'Unexpectedly large public asset: {path.name}')
    if errors:
        raise SystemExit('\n'.join(errors))
    print(f'STATIC_CHECKS_PASSED {checks}; {len(files)} files; {sum(p.stat().st_size for p in files) / 1024 / 1024:.2f} MiB')


if __name__ == '__main__':
    main()
