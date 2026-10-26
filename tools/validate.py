"""Validate data semantics, portable release content, and build consistency."""
import json
import re
from datetime import date
from pathlib import Path
from build import render

ROOT = Path(__file__).resolve().parents[1]


def check(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    data = json.loads((ROOT / 'data/snapshot.json').read_text(encoding='utf-8'))
    rows, meta, summary = data['records'], data['metadata'], data['summary']
    date.fromisoformat(meta['asOf'])
    check(len({r['id'] for r in rows}) == len(rows), 'Duplicate record IDs')
    check(len(rows) == summary['supplierCount'], 'Supplier count mismatch')
    check(abs(sum(r['targetAmount'] for r in rows) - summary['targetAmount']) < 0.01, 'Target total mismatch')
    for owner in summary['owners']:
        selected = [r for r in rows if r['owner'] == owner['owner']]
        check(len(selected) == owner['count'], f'Owner count mismatch: {owner["owner"]}')
        check(abs(sum(r['targetAmount'] for r in selected) - owner['targetAmount']) < 0.01, 'Owner target mismatch')
    for key in ('lastWeek', 'thisWeek', 'nextWeek'):
        week = summary[key]
        selected = [r for r in rows if r['plannedDate'] and week['start'] <= r['plannedDate'] <= week['end']]
        check(len(selected) == week['plannedCount'], f'Week count mismatch: {key}')
        check(abs(sum(r['targetAmount'] for r in selected) - week['targetAmount']) < 0.01, 'Week target mismatch')
    check(all(r.get('locator') for r in rows), 'Source locator missing')
    actuals = [r['actualAmount'] for r in rows if r['actualAmount'] is not None]
    check(len(actuals) == summary['actualAmountFilled'], 'Actual fill count mismatch')
    check(bool(actuals) or summary['actualAmount'] is None, 'Missing actuals incorrectly represented as zero')
    check(meta['displayDivisor'] == 10000 and meta['currency'] == 'CNY', 'Unexpected amount unit')
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    check(index == render(), 'index.html is stale; run python tools/build.py')
    check('/*__DATA__*/' not in index, 'Unreplaced template token')
    match = re.search(r'<script id="dataset" type="application/json">(.*?)</script>', index, re.S)
    check(match is not None and json.loads(match.group(1)) == data, 'Embedded data mismatch')
    check(not re.search(r'<(?:script|link)\b[^>]*(?:src|href)=["\']https?://', index, re.I), 'External runtime dependency')
    for filename in ['README.md', 'AGENTS.md', '.gitignore', 'docs/METRICS.md', 'docs/DATA.md', 'docs/DEPLOYMENT.md']:
        check((ROOT / filename).is_file(), f'Required file missing: {filename}')
    for file in ROOT.rglob('*'):
        if not file.is_file() or '.git' in file.parts or '__pycache__' in file.parts:
            continue
        if file.suffix in {'.html', '.js', '.json', '.md', '.css'}:
            text = file.read_text(encoding='utf-8')
            check(not re.search(r'[A-Za-z]:[\\/]+Users[\\/]', text), f'Local user path in {file.relative_to(ROOT)}')
    print(f'PASS: {len(rows)} suppliers; target CNY {summary["targetAmount"]:,.0f}; source/embedded data agree; portable self-contained HTML')


if __name__ == '__main__':
    main()
