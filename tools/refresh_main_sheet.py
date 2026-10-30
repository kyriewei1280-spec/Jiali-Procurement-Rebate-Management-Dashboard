"""Refresh the supplier main sheet while retaining reviewed supporting records and UI.

Usage: python tools/refresh_main_sheet.py source.xlsx --sheet 采购5922清单 --as-of 2026-10-28
New/removed suppliers require a separate association review; do not silently drop links.
"""
import argparse
import copy
import hashlib
import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from import_workbook import ROOT, read_book, norm, numeric, iso, total

FIELDS = {
    'substream':'B', 'supplier':'C', 'category':'D', 'annualReceiptAmount':'E',
    'targetAmount':'F', 'targetRebateRate':'G', 'owner':'H', 'plannedDate':'I',
    'historicalPriceReductionRate':'J', 'historicalPriceIncreaseAmount':'K',
    'shareOfSupplierSales':'L', 'companyType':'M', 'substitutability':'N',
    'relationshipYears':'O', 'debongSimilarBusiness':'P', 'deliveryIssue':'Q',
    'qualityIssue':'R', 'newProjectFlag':'S', 'actualDate':'T', 'actualAmount':'U',
    'sourceAchievementRate':'V',
}


def refresh(source, sheet, asof):
    date.fromisoformat(asof)
    before = json.loads((ROOT/'data/snapshot.json').read_text(encoding='utf-8'))
    data = copy.deepcopy(before)
    book = read_book(source)
    rows = book[sheet]
    assert [rows[1].get(c) for c in ('F','U','V')] == [
        '5000万目标','实际返利金额','返利目标达成率']
    assert rows[1].get('I') in ('目标完成时间','目标完成时间 (不调整)')
    assert rows[1].get('T') in ('实际完成时间','第一次谈判时间'), 'Review changed T-column meaning'
    first_negotiation = rows[1]['T'] == '第一次谈判时间'
    fields = dict(FIELDS)
    has_follow_up = rows[1].get('W') == '下次跟进日期'
    if has_follow_up:
        assert str(rows[1].get('X','')).startswith('是否已签协议'), 'Review changed agreement status column'
        fields.update(nextFollowUpDate='W',agreementStatus='X')
    endcol = 'X' if has_follow_up else 'V'
    suppliers = [(i,v) for i,v in rows.items() if i>1 and v.get('C')]
    byname = {norm(v['C']):(i,v) for i,v in suppliers}
    assert len(byname)==len(suppliers), 'Duplicate supplier names require review'
    assert set(byname)=={norm(r['supplier']) for r in data['records']}, 'Supplier membership changed; review supporting associations first'
    changes = []
    for r in data['records']:
        # Snapshot-specific manual classifications require review on the next import.
        r.pop('rebateProgressOverride',None)
        i,v = byname[norm(r['supplier'])]
        changed = []
        for key,col in fields.items():
            value = iso(v.get(col)) if key in ('plannedDate','actualDate','nextFollowUpDate') else v.get(col)
            if value != r.get(key):
                changed.append(key)
            r[key] = value
        if changed:
            changes.append({'id':r['id'], 'fields':changed})
        r.update(workstream='BOM' if r['substream']=='BOM' else 'non-BOM',
                 sourceSheet=sheet, sourceRow=i, locator=f"'{sheet}'!A{i}:{endcol}{i}")
        if has_follow_up:
            # Current structured status supersedes older narrative interpretations.
            # Dated notes remain in history; a follow-up appointment is not a negotiation event.
            r.pop('actualAmountPending',None)
            r.pop('followUpReason',None)
            if r['agreementStatus'] or r['nextFollowUpDate']:
                parts = [str(r['agreementStatus'])] if r['agreementStatus'] else []
                if r['nextFollowUpDate']:
                    parts.append('下次跟进日期：'+r['nextFollowUpDate'])
                r.update(progressSummary='；'.join(parts),progressAsOf=asof,
                         progressLocator=f"'{sheet}'!W{i}:X{i}",
                         nextStep='；'.join(parts),nextStepLocator=f"'{sheet}'!W{i}:X{i}")
        r['achievementRate'] = r['actualAmount']/r['targetAmount'] if numeric(r['actualAmount']) is not None and numeric(r['targetAmount']) is not None and r['targetAmount']>0 else None
        if r['achievementRate'] is not None and numeric(r['sourceAchievementRate']) is not None:
            assert abs(r['achievementRate']-r['sourceAchievementRate'])<1e-9, (r['supplier'], 'V mismatch')
        # Do not re-date preparation notes or manufacture new negotiation events.
        r['history'] = [h for h in r['history'] if h['kind']!='谈判结果']
        if r['actualDate'] or numeric(r['actualAmount']) is not None:
            r['history'].append(dict(date=r['actualDate'],kind='谈判结果',amount=r['actualAmount'],target=r['targetAmount'],
                text=('主表记录首次谈判日期及当前返利金额；不代表后续谈判已结束。' if first_negotiation else '主表已回填谈判结果；协议签署与财务兑现需另行确认。'),locator=f"'{sheet}'!T{i}:V{i}"))
        r['history'].sort(key=lambda h:h['date'] or '9999')
    records, summary, meta = data['records'], data['summary'], data['metadata']
    summary.update(supplierCount=len(records),uniqueSupplierCount=len(byname),
        targetAmount=total(records,'targetAmount'),targetFilled=sum(numeric(r['targetAmount']) is not None for r in records),
        actualAmount=total(records,'actualAmount'),actualAmountFilled=sum(numeric(r['actualAmount']) is not None for r in records),
        actualDateFilled=sum(bool(r['actualDate']) for r in records),plannedDateFilled=sum(bool(r['plannedDate']) for r in records),owners=[],groups=[])
    for owner in sorted({r['owner'] for r in records}):
        selected=[r for r in records if r['owner']==owner]
        summary['owners'].append(dict(owner=owner,count=len(selected),targetAmount=total(selected,'targetAmount'),actualAmount=total(selected,'actualAmount')))
    for group in dict.fromkeys(r['substream'] for r in records):
        selected=[r for r in records if r['substream']==group]
        summary['groups'].append(dict(name=group,count=len(selected),targetAmount=total(selected,'targetAmount'),
            targetMissing=sum(r['targetAmount'] is None for r in selected),dateMissing=sum(not r['plannedDate'] for r in selected)))
    start=date.fromisoformat(asof);start-=timedelta(days=start.weekday())
    for key,offset in [('lastWeek',-7),('thisWeek',0),('nextWeek',7)]:
        a=(start+timedelta(days=offset)).isoformat();b=(start+timedelta(days=offset+6)).isoformat()
        selected=[r for r in records if any(d and a<=d<=b for d in (r['plannedDate'],r.get('nextFollowUpDate')))]
        summary[key]=dict(start=a,end=b,plannedCount=len(selected),targetAmount=total(selected,'targetAmount') or 0)
    if 'supportingSource' not in meta:
        meta['supportingSource']={k:before['metadata'][k] for k in ('asOf','sourceFile','sourceSha256')}
        meta['supportingSource']['scope']='质量、索赔、项目、行动项、非结果进展记录及目标池保留此前已核对的来源。'
    lastrow=max(i for i,v in suppliers)
    meta.update(asOf=asof,sourceFile=source.name,sourceSha256=hashlib.sha256(source.read_bytes()).hexdigest(),
        sourceModified=datetime.fromtimestamp(source.stat().st_mtime,timezone(timedelta(hours=8))).isoformat(),
        primarySheet=sheet,rowRange=f'A2:{endcol}{lastrow}',
        sourceSelection=f'以{sheet}为唯一供应商汇总；辅助明细与目标池按 supportingSource 保留，不重复计入。')
    meta['actualDateMeaning'] = 'firstNegotiation' if first_negotiation else 'completion'
    meta['hasFollowUpColumns'] = has_follow_up
    # Replace obsolete snapshot-specific gap statements with current main-sheet counts.
    keep=[i for i in data['issues'] if i['title'] not in ('模具目标尚未分配','non-BOM排期待补','空白结果待确认','原表公式缺口')]
    missing=[r for r in records if r['substream']=='non-BOM 模具' and r['targetAmount'] is None]
    if missing:
        keep.append(dict(title='模具目标尚未分配',detail=f'{len(missing)}家模具供应商目标为空，保留目标池余额，不向供应商自动分摊。',locator=f"'{sheet}'!F2:F{lastrow}"))
    undated=[r for r in records if r['workstream']=='non-BOM' and not r['plannedDate']]
    if undated:
        keep.append(dict(title='non-BOM排期待补',detail=f'{len(undated)}家non-BOM供应商没有目标完成时间，单列为待排期。',locator=f"'{sheet}'!I2:I{lastrow}"))
    keep.append(dict(title='空白结果待确认',detail='实际结果空白保持未知；V列公式零值不作为实际零返利。',locator=f"'{sheet}'!T2:V{lastrow}"))
    errors=[r for r in records if isinstance(r['sourceAchievementRate'],str) and r['sourceAchievementRate'].startswith('#')]
    if errors:
        keep.append(dict(title='主表公式待确认',detail=f'{len(errors)}家供应商V列含公式错误，达成率使用已知实际金额/有效目标计算。',locator=f"'{sheet}'!V2:V{lastrow}"))
    code_errors=sum(v.get('B')=='#N/A' for v in book.get('26年1-8月源数据 (2)_丽水 1021',{}).values())
    keep=[issue for issue in keep if issue['title']!='关联表编码待确认']
    if code_errors:
        keep.append(dict(title='关联表编码待确认',detail=f'丽水月度表{code_errors}个供应商编码为#N/A，沿用已核对的唯一名称关联，不借错误编码强行匹配。',locator="'26年1-8月源数据 (2)_丽水 1021'!B782:B1092"))
    data['issues']=keep
    # Supporting business records and pool membership must survive a main-only refresh.
    assert data['actions']==before['actions'] and data.get('targetPools')==before.get('targetPools')
    for old,new in zip(before['records'],records):
        for key in ('claims','qualityRecords','projects'):
            assert old.get(key)==new.get(key), (old['id'], key)
        assert [h for h in old['history'] if h['kind']!='谈判结果']==[h for h in new['history'] if h['kind']!='谈判结果']
    return data, changes


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path)
    parser.add_argument('--sheet',required=True)
    parser.add_argument('--as-of',required=True)
    args=parser.parse_args()
    data,changes=refresh(args.source,args.sheet,args.as_of)
    (ROOT/'data/snapshot.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'changedSuppliers':len(changes),'summary':data['summary']},ensure_ascii=True))
