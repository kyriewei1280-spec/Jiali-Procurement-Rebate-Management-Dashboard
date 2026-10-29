"""Generate display-routing passwords once, keeping plaintext outside the repo.

This static dashboard uses client-side presentation routing, not secure data
authorization. The published dataset remains available in the HTML/source.
"""
import argparse
import csv
import hashlib
import html
import json
import secrets
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
ITERATIONS = 210000


def encoded_hash(password, salt):
    return hashlib.pbkdf2_hmac('sha256', password.encode(), bytes.fromhex(salt), ITERATIONS).hex()


def password():
    return '-'.join(''.join(secrets.choice(ALPHABET) for _ in range(5)) for _ in range(3))


def write_json(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--private-dir', type=Path, default=ROOT.parent / 'private')
    args = parser.parse_args()
    private_dir = args.private_dir.resolve()
    if private_dir == ROOT or ROOT in private_dir.parents:
        raise SystemExit('Private output must be outside the publishable repository.')
    private_dir.mkdir(parents=True, exist_ok=True)
    private_path = private_dir / 'accounts.json'
    records = json.loads((ROOT / 'data/snapshot.json').read_text(encoding='utf-8'))['records']
    owners = sorted({r['owner'] for r in records if r.get('owner') and r['owner'].strip().upper() not in {'NA', 'N/A', '未填', '待确认'}})
    specifications = [
        {'id': 'admin-all', 'label': '采购总体管理员', 'role': 'overall-admin', 'scope': '全部采购数据、全部负责人、全部计划和供应商'},
        {'id': 'admin-mold', 'label': 'non-BOM 模具管理员', 'role': 'mold-admin', 'scope': '全部 non-BOM 模具汇总、负责人、计划和供应商'},
        {'id': 'admin-ops', 'label': 'non-BOM 工装、设备和物流管理员', 'role': 'operations-admin', 'scope': '全部 non-BOM 工装、设备、物流汇总、负责人、计划和供应商'},
    ]
    if private_path.exists():
        private = json.loads(private_path.read_text(encoding='utf-8'))
        old_accounts = private['accounts']
        old_owner_ids = {a['owner']: a['id'] for a in old_accounts if a['role'] == 'owner'}
        next_id = max([int(a['id'].split('-')[-1]) for a in old_accounts if a['role'] == 'owner'], default=0) + 1
    else:
        private = {'schemaVersion': 1, 'version': secrets.token_hex(12), 'createdAt': datetime.now(timezone.utc).isoformat(), 'salt': secrets.token_hex(24), 'accounts': []}
        old_accounts, old_owner_ids, next_id = [], {}, 1
    for owner in owners:
        account_id = old_owner_ids.get(owner)
        if not account_id:
            account_id = f'owner-{next_id:02d}'
            next_id += 1
        scopes = sorted({r['workstream'] if r['workstream'] == 'BOM' else r['substream'] for r in records if r['owner'] == owner})
        specifications.append({'id': account_id, 'label': owner, 'role': 'owner', 'owner': owner, 'scope': '专项汇总：' + '、'.join(scopes) + '；个人明细、计划和供应商仅本人'})
    by_id = {a['id']: a for a in old_accounts}
    accounts = []
    changed = False
    for specification in specifications:
        old = by_id.get(specification['id'])
        if old:
            if old.get('owner') != specification.get('owner') or old['role'] != specification['role']:
                raise SystemExit('Existing account identity differs; review without overwriting credentials.')
            secret = old['password']
        else:
            secret = password()
            changed = True
        accounts.append(dict(specification, password=secret))
    if len({a['password'] for a in accounts}) != len(accounts):
        raise SystemExit('Duplicate random password detected; regenerate only the new account.')
    if old_accounts and (changed or set(by_id) != {a['id'] for a in accounts}):
        private['version'] = secrets.token_hex(12)
    private['accounts'] = accounts
    write_json(private_path, private)
    public_accounts = [{**{k: v for k, v in a.items() if k not in {'password', 'scope'}}, 'hash': encoded_hash(a['password'], private['salt'])} for a in accounts]
    public = {'schemaVersion': 1, 'version': private['version'], 'algorithm': 'PBKDF2-SHA256', 'iterations': ITERATIONS, 'salt': private['salt'], 'sessionHours': 12, 'accounts': public_accounts}
    write_json(ROOT / 'data/access.json', public)
    headers = ['账号', '人员 / 管理员', '密码', '显示范围']
    with (private_dir / '采购看板账号密码清单.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(headers)
        writer.writerows([[a['id'], a['label'], a['password'], a['scope']] for a in accounts])
    rows = ''.join('<tr>' + ''.join('<td' + (' class="secret"' if i == 2 else '') + '>' + html.escape(str(value)) + '</td>' for i, value in enumerate([a['id'], a['label'], a['password'], a['scope']])) + '</tr>' for a in accounts)
    content = '''<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>采购看板账号密码清单 · 管理员留存</title>
<style>*{box-sizing:border-box}body{margin:0;background:#040606;color:#f3f5f2;font:18px/1.6 "Segoe UI","Microsoft YaHei",sans-serif}main{width:100%;padding:40px clamp(20px,3vw,64px)}.eyebrow{color:#56d15f;letter-spacing:.14em;font-size:16px}h1{font-size:36px;margin:8px 0 16px}p{color:#b9c2bb;max-width:78ch}.notice{padding:16px 20px;background:#121411;border:1px solid #28302a;border-radius:12px}.table-wrap{overflow:auto;border:1px solid #28302a;border-radius:12px;margin-top:28px}table{border-collapse:collapse;width:100%;min-width:1050px;text-align:left}th,td{padding:16px 20px;border-bottom:1px solid #28302a;vertical-align:top}th{background:#171d17;font-weight:600}tbody tr:nth-child(even){background:#121411}.secret{font-family:Consolas,monospace;font-size:20px;white-space:nowrap;color:#8ce396}footer{margin-top:24px;color:#9da39e;font-size:16px}a{color:#56d15f} @media(max-width:767px){h1{font-size:28px}main{padding-top:24px}} @media print{body{background:white;color:black}.secret,a{color:black}.notice,th,tbody tr:nth-child(even){background:#eee}main{padding:12px}.table-wrap{overflow:visible}table{min-width:0;font-size:12px}th,td{padding:8px}.secret{font-size:13px}footer,p{color:#333}}</style>
<main><div class="eyebrow">PROCUREMENT · ADMIN COPY</div><h1>采购看板账号密码清单</h1><p class="notice">仅供管理员保管。请分别向每位负责人提供其本人密码；不要把本文件放入公开 GitHub 仓库或公开页面。登录时只需输入密码，页面自动识别对应身份。</p><p><a href="https://kyriewei1280-spec.github.io/Jiali-Procurement-Rebate-Management-Dashboard/">打开采购看板</a> · 密码区分大小写，保留中间短横线。账号编号用于管理和沟通，无需在登录页面输入。</p><div class="table-wrap"><table><thead><tr>''' + ''.join('<th>' + html.escape(h) + '</th>' for h in headers) + '''</tr></thead><tbody>''' + rows + '''</tbody></table></div><footer>共 ''' + str(len(accounts)) + ''' 个账号。网页使用前端展示分流，公开 HTML 仍包含全量业务数据；密码不构成严格的数据保密。每个标签页独立保存登录状态，12 小时后需要重新输入密码。</footer></main></html>'''
    (private_dir / '采购看板账号密码清单.html').write_text(content, encoding='utf-8')
    print(f'Prepared {len(accounts)} accounts; plaintext retained only in private output directory.')


if __name__ == '__main__':
    main()
