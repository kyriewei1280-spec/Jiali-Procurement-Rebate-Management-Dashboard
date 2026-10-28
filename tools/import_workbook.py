"""Read the supplied workbook without changing it; export only dashboard fields.

Usage: python tools/import_workbook.py /path/to/source.xlsx --as-of 2026-10-27
Sparse XML avoids inflated Excel used ranges and preserves raw numeric amounts.
"""
import argparse
import hashlib
import json
import re
import unicodedata
import zipfile
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict
from datetime import datetime, date, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
NS = {'m': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}


def read_book(path):
    book = {}
    with zipfile.ZipFile(path) as z:
        strings = []
        if 'xl/sharedStrings.xml' in z.namelist():
            strings = [''.join(e.itertext()) for e in ET.fromstring(z.read('xl/sharedStrings.xml'))]
        rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(z.read('xl/_rels/workbook.xml.rels'))}
        for sheet in ET.fromstring(z.read('xl/workbook.xml')).find('m:sheets', NS):
            target = rels[sheet.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']]
            target = target.lstrip('/') if target.startswith('/') else 'xl/' + target
            rows = {}
            for row in ET.fromstring(z.read(target)).findall('.//m:sheetData/m:row', NS):
                values = {}
                for c in row:
                    v, inline = c.find('m:v', NS), c.find('m:is', NS)
                    value = None
                    if v is not None and v.text is not None:
                        value = v.text
                        if c.get('t') == 's':
                            value = strings[int(value)]
                        elif c.get('t') not in ('str', 'e'):
                            try:
                                value = float(value)
                            except ValueError:
                                pass
                    elif inline is not None:
                        value = ''.join(inline.itertext())
                    if value is not None:
                        values[re.sub(r'\d', '', c.get('r'))] = value
                if values:
                    rows[int(row.get('r'))] = values
            book[sheet.get('name')] = rows
    return book


def numeric(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def iso(v):
    if isinstance(v, (int, float)):
        return (datetime(1899, 12, 30) + timedelta(days=v)).date().isoformat()
    if isinstance(v, str):
        m = re.fullmatch(r'(20\d{2})[./-](\d{1,2})[./-](\d{1,2})', v.strip())
        if m:
            return date(*map(int, m.groups())).isoformat()
    return None


def norm(v):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', str(v or '')))


def total(rows, key):
    v = [r[key] for r in rows if numeric(r.get(key)) is not None]
    return sum(v) if v else None


def target_pools(records, summary):
    """Keep the workbook's mold scope target separate from individual F-column targets."""
    return [dict(id='mold-target', label='模具', workstream='non-BOM', substream='non-BOM 模具',
                 totalAmount=summary['moldReferenceAmount'],
                 memberIds=[r['id'] for r in records if r['substream']=='non-BOM 模具'],
                 locator=summary['moldReferenceLocator'], formula=summary['moldReferenceFormula'])]


def import_snapshot(path, asof):
    book = read_book(path)
    sheet = '采购5921清单'
    assert [book[sheet][1].get(c) for c in ['F', 'I', 'T', 'U', 'V']] == ['5000万目标', '目标完成时间', '实际完成时间', '实际返利金额', '返利目标达成率'], 'Unexpected main-sheet columns'
    records = []
    for i, v in book[sheet].items():
        if i == 1 or not v.get('C'):
            continue
        r = dict(id=f'procurement-r{i}', supplier=v['C'], owner=v.get('H'), category=v.get('D'),
                 workstream='BOM' if v['B'] == 'BOM' else 'non-BOM', substream=v['B'],
                 sourceSheet=sheet, sourceRow=i, locator=f"'{sheet}'!A{i}:V{i}",
                 plannedDate=iso(v.get('I')), actualDate=iso(v.get('T')),
                 agreedAmount=None, realizedAmount=None, realizedDate=None, negotiationDate=None,
                 claims=[], qualityRecords=[], projects=[], history=[], nextStep=None)
        columns = {'annualReceiptAmount':'E', 'targetAmount':'F', 'targetRebateRate':'G',
                   'historicalPriceReductionRate':'J', 'historicalPriceIncreaseAmount':'K',
                   'shareOfSupplierSales':'L', 'companyType':'M', 'substitutability':'N',
                   'relationshipYears':'O', 'debongSimilarBusiness':'P', 'deliveryIssue':'Q',
                   'qualityIssue':'R', 'newProjectFlag':'S', 'actualAmount':'U', 'sourceAchievementRate':'V'}
        r.update({k:v.get(c) for k,c in columns.items()})
        # V has formula-generated zeros for blank U. It is retained for traceability,
        # never used as evidence of a negotiation or a zero-valued result.
        r['achievementRate'] = r['actualAmount']/r['targetAmount'] if numeric(r['actualAmount']) is not None and r['targetAmount'] else None
        records.append(r)
    byname = {norm(r['supplier']):r for r in records}
    universe = set(byname)
    codes = defaultdict(set)
    for i,v in book['供应商账期 1021'].items():
        if i>1 and v.get('B'):
            universe.add(norm(v['B']))
            if v.get('A'):
                codes[norm(v['A'])].add(norm(v['B']))
    for n,s in book.items():
        if re.match(r'\d+月.*温州',n):
            for i,v in s.items():
                if numeric(v.get('A')) is not None and v.get('C'):
                    universe.add(norm(v['C']))
                    codes[norm(v.get('B'))].add(norm(v['C']))
    def match(name, code=None, allow_short=False):
        name = norm(name)
        if name in byname:
            return byname[name], '全称匹配'
        candidates = codes.get(norm(code),set()) if code else set()
        if len(candidates)==1 and next(iter(candidates)) in byname:
            return byname[next(iter(candidates))], '供应商编码匹配'
        if allow_short and len(name)>=2:
            candidates = {n for n in universe if name in n}
            if len(candidates)==1 and next(iter(candidates)) in byname:
                return byname[next(iter(candidates))], '唯一简称匹配（保留原名供核对）'
        return None, None
    audit = Counter()
    # Claim ledgers: monetary values remain separate from negotiated rebates.
    specs = [('索赔明细_温州 1021','温州',1,'H','G','I','J','M','K'),
             ('索赔明细_广东 1021','广东',1,'B','J','D','C','F','G'),
             ('索赔金额__丽水 1021','丽水',2,'C','B','E','F',None,None)]
    for name,region,header,nc,dc,reasonc,ac,paidc,pendingc in specs:
        for i,v in book[name].items():
            if i<=header or not v.get(nc) or not v.get(reasonc):
                continue
            r,method = match(v[nc])
            if not r:
                audit['unmatchedClaims']+=1
                continue
            item = dict(region=region,sourceSupplier=v[nc],matchMethod=method,date=iso(v.get(dc)),
                        dateRaw=v.get(dc),reason=v.get(reasonc),amount=numeric(v.get(ac)),
                        deducted=numeric(v.get(paidc)) if paidc else None,
                        pending=numeric(v.get(pendingc)) if pendingc else None,
                        locator=f"'{name}'!A{i}:{'S' if region=='温州' else 'N' if region=='广东' else 'M'}{i}")
            if region=='丽水':
                item.update(confirmed=v.get('G'),invoiced=v.get('H'),offset=v.get('I'),tax=v.get('J'),note=v.get('K'))
            elif region=='温州':
                item.update(discount=numeric(v.get('L')),note=v.get('O'))
            else:
                item.update(note=v.get('E'))
            r['claims'].append(item)
    # Monthly quality and delivery evidence, using each inspected layout.
    for name,s in book.items():
        m = re.match(r'(\d+)月.*(广东|温州)',name)
        if not m:
            continue
        month,region=int(m[1]),m[2]
        for i,v in s.items():
            if numeric(v.get('A')) is None:
                continue
            if region=='温州':
                nc,qc,dc,qt,dt,ppm,complaint='C','G','P','F','O','J','L'
            elif month==1:
                nc,qc,dc,qt,dt,ppm,complaint='B','F','P','E','O','I',None
            elif month<=6:
                nc,qc,dc,qt,dt,ppm,complaint='B','F','V','E','U','M','P'
            else:
                nc,qc,dc,qt,dt,ppm,complaint='B','F','O','E','N','I','K'
            r,method = match(v.get(nc),v.get('B') if region=='温州' else None,allow_short=region=='广东')
            if not r:
                audit['unmatchedQuality']+=1
                continue
            r['qualityRecords'].append(dict(region=region,month=f'2026-{month:02}',sourceSupplier=v.get(nc),
                matchMethod=method,qualityRate=numeric(v.get(qc)),deliveryRate=numeric(v.get(dc)),
                qualityTarget=numeric(v.get(qt)),deliveryTarget=numeric(v.get(dt)),
                ppm=numeric(v.get(ppm)),complaints=numeric(v.get(complaint)),
                locator=f"'{name}'!A{i}:{'AF' if region=='广东' and 3<=month<=6 else 'X'}{i}"))
    name='26年1-8月源数据 (2)_丽水 1021'
    for i,v in book[name].items():
        if i==1 or not v.get('C'):
            continue
        r,method=match(v['C'],v.get('B'),allow_short=True)
        if not r:
            audit['unmatchedQuality']+=1
            continue
        month=re.search(r'\d+',str(v.get('A','')))
        r['qualityRecords'].append(dict(region='丽水',month=f'2026-{int(month[0]):02}' if month else None,
            sourceSupplier=v['C'],matchMethod=method,qualityRate=numeric(v.get('D')),deliveryRate=numeric(v.get('E')),
            qualityTarget=None,deliveryTarget=None,ppm=None,complaints=None,locator=f"'{name}'!A{i}:E{i}"))
    name='2027年量产新项目定点清单 1021'
    for i,v in book[name].items():
        if i<=2:
            continue
        supplier=v.get('M') or v.get('J')
        r,method=match(supplier)
        if not r:
            audit['unmatchedProjects' if supplier else 'unassignedProjects']+=1
            continue
        r['projects'].append(dict(region=v.get('B'),customer=v.get('C'),project=v.get('D'),code=v.get('E'),
            volume=v.get('F'),t0=iso(v.get('G')),sop=iso(v.get('H')),product=v.get('I'),note=v.get('K'),
            sourceSupplier=supplier,originalSupplier=v.get('J'),supplierColumn='M' if v.get('M') else 'J',
            matchMethod=method,locator=f"'{name}'!A{i}:M{i}"))
    # Business-specific excerpts preserve provenance; planning notes do not prove completion.
    name='采购日清日结 | 滚动更新'
    actions=[]
    for i,v in book[name].items():
        if i<3 or not v.get('C'):
            continue
        updates=[dict(date=iso(book[name][2][col]),text=value,locator=f"'{name}'!{col}{i}") for col,value in v.items() if col not in ['A','B','C','D','E','F'] and iso(book[name][2].get(col))]
        actions.append(dict(id=f'action-r{i}',owner=v.get('B'),description=v['C'],plannedDate=iso(v.get('D')),
                            actualDate=iso(v.get('E')),status=v.get('F'),updates=updates,locator=f"'{name}'!A{i}:M{i}"))
    notes=[('汇达',20,'汇达与虹达合计200万元、凯盛世170万元已锁定，需尽快签订协议。汇达提出逾期款项需于年底结清。','推进协议签订，跟进年底结清逾期款项的要求。'),
           ('虹达',20,'汇达与虹达合计200万元、凯盛世170万元已锁定，需尽快签订协议。','推进返利协议签订。'),
           ('凯盛世',20,'汇达与虹达合计200万元、凯盛世170万元已锁定，原三家目标500万元，仍有差距。','推进协议签订，跟进未达目标差额。'),
           ('鞍能',25,'10月27日记录：鞍能与明曜确定当天下午由胡部谈，晚上跟进；嘉利业务占比高，在附近设厂服务。','补充本次谈判的策略、话术、效果及未达标补救记录，纳入质量及交付问题。'),
           ('明曜',25,'10月27日记录（原文为“明耀”）：与鞍能确定当天下午由胡部谈；嘉利业务占比高，重组加工费，对返利反弹较大。','补充本次谈判的策略、话术、效果及未达标补救记录，纳入质量及交付问题。'),
           ('诚轩',25,'10月27日记录：诚轩次日确定谈，开模具不要钱，但对返利反弹较大。','准备次日谈判，将质量及交付问题纳入讨论。'),
           ('佛隽',24,'核对佛隽当前真实毛利，为制定返利比例提供数据基础；记录称明天会上做初步毛利讨论。','核对毛利，准备次日讨论。')]
    for alias,row,text,next_step in notes:
        rs=[r for r in records if alias in r['supplier']]
        if len(rs)!=1:
            raise ValueError('Ambiguous action alias: '+alias)
        assert book[name][row].get('M'), 'Action source changed'
        rs[0]['history'].append(dict(date=asof,kind='进展记录',text=text,locator=f"'{name}'!M{row}",sharedNote=True))
        rs[0]['nextStep']=next_step
        rs[0]['nextStepLocator']=f"'{name}'!M{row}"
        if alias in ('鞍能', '明曜'):
            assert '未达标补救' in book['10月 | 微信消息'][4]['C'], 'Negotiation follow-up source changed'
            rs[0]['nextStepLocator'] += "；'10月 | 微信消息'!C4"
    for r in records:
        if r['actualDate'] or numeric(r['actualAmount']) is not None:
            r['history'].append(dict(date=r['actualDate'],kind='谈判结果',amount=r['actualAmount'],target=r['targetAmount'],
                text='主表已回填谈判结果；协议签署与财务兑现需另行确认。',locator=f"'{sheet}'!T{r['sourceRow']}:V{r['sourceRow']}"))
        r['history'].sort(key=lambda h:h['date'] or '9999')
    summary=dict(supplierCount=len(records),uniqueSupplierCount=len(byname),targetAmount=total(records,'targetAmount'),
        targetFilled=sum(r['targetAmount'] is not None for r in records),actualAmount=total(records,'actualAmount'),
        actualAmountFilled=sum(r['actualAmount'] is not None for r in records),actualDateFilled=sum(bool(r['actualDate']) for r in records),
        plannedDateFilled=sum(bool(r['plannedDate']) for r in records),owners=[],groups=[],
        moldReferenceAmount=book['Non-Bom 模具618清单 1026'][37].get('K'),moldReferenceFormula='=D37*0.036',
        moldReferenceLocator="'Non-Bom 模具618清单 1026'!K37",actionCount=len(actions),actionStatusCounts=dict(Counter(a['status'] or '未填' for a in actions)))
    for owner in sorted({r['owner'] for r in records}):
        rs=[r for r in records if r['owner']==owner]
        summary['owners'].append(dict(owner=owner,count=len(rs),targetAmount=total(rs,'targetAmount'),actualAmount=total(rs,'actualAmount')))
    for substream in dict.fromkeys(r['substream'] for r in records):
        rs=[r for r in records if r['substream']==substream]
        summary['groups'].append(dict(name=substream,count=len(rs),targetAmount=total(rs,'targetAmount'),targetMissing=sum(r['targetAmount'] is None for r in rs),dateMissing=sum(not r['plannedDate'] for r in rs)))
    start=date.fromisoformat(asof); start-=timedelta(days=start.weekday())
    for key,offset in [('lastWeek',-7),('thisWeek',0),('nextWeek',7)]:
        a=(start+timedelta(days=offset)).isoformat(); b=(start+timedelta(days=offset+6)).isoformat()
        rs=[r for r in records if r['plannedDate'] and a<=r['plannedDate']<=b]
        summary[key]=dict(start=a,end=b,plannedCount=len(rs),targetAmount=total(rs,'targetAmount') or 0)
    tz=timezone(timedelta(hours=8))
    meta=dict(schemaVersion='3.0',asOf=asof,sourceFile=path.name,sourceSha256=hashlib.sha256(path.read_bytes()).hexdigest(),
        sourceModified=datetime.fromtimestamp(path.stat().st_mtime,tz).isoformat(),currency='CNY',rawAmountUnit='元',
        displayDivisor=10000,displayAmountUnit='万元',annualReceiptPeriod='2025-09 至 2026-08',primarySheet=sheet,rowRange='A2:V158',
        sourceSelection='以采购5921清单为唯一供应商汇总；相关质量、索赔与项目表仅作明细关联。',associationAudit=dict(audit))
    issues=[dict(title='模具目标尚未分配',detail='35家模具供应商的F列为空。分表618.62万元仅为汇总参考，未分摊到负责人或供应商达成率分母。',locator=summary['moldReferenceLocator']),
            dict(title='non-BOM排期待补',detail='85家non-BOM供应商没有目标完成时间，单独列为待排期，不归入任何一天或一周。',locator="'采购5921清单'!I74:I158"),
            dict(title='空白结果待确认',detail='T/U未回填不证明未开展谈判。超过目标日的此类记录标为超期未谈（待确认）；V列公式零值不作为实际返利零元。',locator="'采购5921清单'!T2:V158"),
            dict(title='新项目量体与关联口径',detail='项目明细优先采用M列整理后的供应商全称，其次J列。企划量按原文展示，同一项目跨零件或供应商重复，不直接相加。简称仅在全称名录中唯一匹配时关联，保留原名及匹配依据。',locator="'2027年量产新项目定点清单 1021'!A2:M357")]
    for r in records:
        if r['achievementRate'] is not None and numeric(r['sourceAchievementRate']) is not None:
            assert abs(r['achievementRate']-r['sourceAchievementRate'])<1e-9
    issues.append(dict(title='原表公式缺口',detail='35家模具供应商因目标为空，V列出现#DIV/0!，保留为待补目标；丽水月度表9个供应商编码为#N/A，只在名称可唯一确认时关联，不借错误编码强行匹配。',locator="'采购5921清单'!V74:V108；'26年1-8月源数据 (2)_丽水 1021'!B782:B1092"))
    return dict(metadata=meta,records=records,actions=actions,summary=summary,issues=issues,
                targetPools=target_pools(records, summary))


if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('source',type=Path)
    parser.add_argument('--as-of',required=True)
    args=parser.parse_args()
    data=import_snapshot(args.source,args.as_of)
    (ROOT/'data/snapshot.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'summary':data['summary'],'linkedClaims':sum(len(r['claims']) for r in data['records']),
        'linkedQuality':sum(len(r['qualityRecords']) for r in data['records']),
        'linkedProjects':sum(len(r['projects']) for r in data['records']),'audit':data['metadata']['associationAudit']},ensure_ascii=True))
