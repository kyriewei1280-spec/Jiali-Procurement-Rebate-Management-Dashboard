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
    check(abs(sum(r['targetAmount'] for r in rows if r['targetAmount'] is not None) - summary['targetAmount']) < 0.01, 'Target total mismatch')
    for owner in summary['owners']:
        selected = [r for r in rows if r['owner'] == owner['owner']]
        check(len(selected) == owner['count'], f'Owner count mismatch: {owner["owner"]}')
        check((owner['targetAmount'] is None and all(r['targetAmount'] is None for r in selected)) or (owner['targetAmount'] is not None and abs(sum(r['targetAmount'] for r in selected if r['targetAmount'] is not None) - owner['targetAmount']) < 0.01), 'Owner target mismatch')
    for key in ('lastWeek', 'thisWeek', 'nextWeek'):
        week = summary[key]
        selected = [r for r in rows if r['plannedDate'] and week['start'] <= r['plannedDate'] <= week['end']]
        check(len(selected) == week['plannedCount'], f'Week count mismatch: {key}')
        check(abs(sum(r['targetAmount'] for r in selected if r['targetAmount'] is not None) - week['targetAmount']) < 0.01, 'Week target mismatch')
    check(all(r.get('locator') for r in rows), 'Source locator missing')
    actuals = [r['actualAmount'] for r in rows if r['actualAmount'] is not None]
    check(len(actuals) == summary['actualAmountFilled'], 'Actual fill count mismatch')
    check(bool(actuals) or summary['actualAmount'] is None, 'Missing actuals incorrectly represented as zero')
    check(not actuals or abs(sum(actuals)-summary['actualAmount']) < .01, 'Actual total mismatch')
    for row in rows:
        amount, target = row['actualAmount'], row['targetAmount']
        expected = amount/target if amount is not None and target else None
        check(row['achievementRate'] == expected, 'Supplier achievement mismatch')
        check(row['actualAmount'] is not None or row['achievementRate'] is None, 'Blank actual converted to zero achievement')
        for key in ('claims', 'qualityRecords', 'projects'):
            linked = row[key]
            check(all(x.get('locator') and x.get('matchMethod') for x in linked), 'Linked record provenance missing')
            check(len({x['locator'] for x in linked}) == len(linked), 'Duplicated linked source row')
        check(all(x['region'] in ('广东','温州','丽水') for x in row['claims']), 'Unknown claim region')
        results = [h for h in row['history'] if h['kind'] == '谈判结果']
        check(len(results) <= 1, 'Snapshot result double counted in history')
        check(not results or results[0]['amount'] == amount, 'History result mismatch')
    check(meta['displayDivisor'] == 10000 and meta['currency'] == 'CNY', 'Unexpected amount unit')
    index = (ROOT / 'index.html').read_text(encoding='utf-8')
    check(index == render(), 'index.html is stale; run python tools/build.py')
    check('/*__DATA__*/' not in index, 'Unreplaced template token')
    match = re.search(r'<script id="dataset" type="application/json">(.*?)</script>', index, re.S)
    check(match is not None and json.loads(match.group(1)) == data, 'Embedded data mismatch')
    check(not re.search(r'<(?:script|link)\b[^>]*(?:src|href)=["\']https?://', index, re.I), 'External runtime dependency')
    access = json.loads((ROOT / 'data/access.json').read_text(encoding='utf-8'))
    accounts = access['accounts']
    check(len({a['id'] for a in accounts}) == len(accounts), 'Duplicate access account IDs')
    check(len({a['hash'] for a in accounts}) == len(accounts), 'Duplicate access password hashes')
    check(all(set(a) <= {'id', 'label', 'role', 'owner', 'hash'} for a in accounts), 'Unexpected public account field')
    check(all(re.fullmatch(r'[0-9a-f]{64}', a['hash']) for a in accounts), 'Invalid password verifier')
    check(access['algorithm'] == 'PBKDF2-SHA256' and access['iterations'] == 210000, 'Unexpected password derivation')
    check(re.fullmatch(r'[0-9a-f]{48}', access['salt']) is not None and access['sessionHours'] == 12, 'Invalid login configuration')
    owner_accounts = [a for a in accounts if a['role'] == 'owner']
    named_owners = {r['owner'] for r in rows if r.get('owner') and r['owner'].strip().upper() not in {'NA', 'N/A', '未填', '待确认'}}
    check({a['owner'] for a in owner_accounts} == named_owners and len(owner_accounts) == len(named_owners), 'Owner login coverage differs from source')
    check(sorted(a['role'] for a in accounts if a['role'] != 'owner') == ['mold-admin', 'operations-admin', 'overall-admin'], 'Administrator role coverage differs')
    embedded_access = re.search(r'<script id="access-config" type="application/json">(.*?)</script>', index, re.S)
    check(embedded_access is not None and json.loads(embedded_access.group(1)) == access, 'Embedded login configuration differs')
    check('<div id="dashboardShell" hidden>' in index, 'Dashboard must start hidden before identity selection')
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
