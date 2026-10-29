'use strict';
const $=id=>document.getElementById(id);
const DATA=JSON.parse($('dataset').textContent),META=DATA.metadata,ASOF=META.asOf;
const FIRST_NEGOTIATION=META.actualDateMeaning==='firstNegotiation';
const ACTUAL_DATE_LABEL=FIRST_NEGOTIATION?'首次谈判时间':'实际完成时间';
const TIMING_LABEL=FIRST_NEGOTIATION?'按期首次谈判':'准时完成';
// Calendar navigation follows Beijing time, independently of the business snapshot.
const beijingDate=milliseconds=>new Date(milliseconds+8*60*60*1000).toISOString().slice(0,10);
let networkClock=null,clockSyncPending=false,lastClockSync=-Infinity;
const calendarNow=()=>networkClock?networkClock.utc+performance.now()-networkClock.tick:Date.now();
let today=beijingDate(calendarNow());
function refreshCalendar(redraw=true){
 const current=beijingDate(calendarNow());if(current===today)return;
 today=current;
 if(state.followToday&&['day','week'].includes(state.periodMode))state.period=state.periodMode==='week'?monday(today):today;
 if(redraw&&state.view==='plan')render();
}
async function syncNetworkClock(){
 if(!['http:','https:'].includes(location.protocol)||clockSyncPending)return;
 clockSyncPending=true;const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),5000),start=performance.now();
 try{
  // The same-origin response supplies an HTTP UTC Date; Age accounts for CDN caches.
  // No workbook contents or user selections are sent to a third-party time service.
  const url=new URL(location.pathname,location.origin);url.searchParams.set('calendar-clock',String(Date.now()));
  const response=await fetch(url,{method:'HEAD',cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
  const utc=Date.parse(response.headers.get('Date')),age=Number(response.headers.get('Age')||0),end=performance.now();
  if(response.ok&&Number.isFinite(utc)&&Number.isFinite(age)&&age>=0){networkClock={utc:utc+age*1000+(end-start)/2,tick:end};lastClockSync=end;refreshCalendar()}
 }catch{/* Offline remains usable with the device clock converted to UTC+8. */}
 finally{clearTimeout(timeout);clockSyncPending=false}
}
function resumeCalendar(){refreshCalendar();if(performance.now()-lastClockSync>5*60*1000)void syncNetworkClock()}

const state={view:['guide','overview','owners','plan','suppliers'].includes(location.hash.slice(1))?location.hash.slice(1):'overview',workstream:'all',owner:'all',search:'',status:'all',sort:'date',page:1,periodMode:'day',period:today,followToday:true};
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=x=>typeof x==='number'&&Number.isFinite(x);
const money=x=>num(x)?(x/10000).toLocaleString('zh-CN',{maximumFractionDigits:0}):'待补';
const ratio=(a,b)=>num(a)&&num(b)&&b>0?100*a/b:null;
const percent=x=>num(x)?`${x.toFixed(1)}%`:'待补目标';
const sum=(rows,key)=>{const a=rows.map(r=>r[key]).filter(num);return a.length?a.reduce((x,y)=>x+y,0):null};
const add=(s,n)=>{const d=new Date(s+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10)};
const monday=s=>add(s,-((new Date(s+'T12:00:00Z').getUTCDay()+6)%7));
const dateText=s=>s?s.replaceAll('-','.'): '未填';
const dateSort=(a,b)=>(a.plannedDate||'9999').localeCompare(b.plannedDate||'9999')||(b.targetAmount??-1)-(a.targetAmount??-1);
const known=r=>(!r.actualDate||r.actualDate<=ASOF)&&(num(r.actualAmount)||!!r.actualDate);
const actual=r=>known(r)&&num(r.actualAmount)?r.actualAmount:null;
const achievement=r=>ratio(actual(r),r.targetAmount);
const STATUSES={met:'已达返利目标',partial:'已谈成部分返利',talked:'已谈 · 结果待补 / 零返利',ongoing:'谈判中',planned:'按计划待谈',late:'超期未谈（待确认）',unscheduled:'待排期待谈'};
function statusKey(r){if(r.actualAmountPending&&started(r))return 'ongoing';if(known(r)){if(achievement(r)>=100)return 'met';if(actual(r)>0)return 'partial';return 'talked'}if(started(r))return 'ongoing';if(!r.plannedDate)return 'unscheduled';return r.plannedDate<ASOF?'late':'planned'}
const chip=(s,c='')=>`<span class="chip ${c}">${esc(s)}</span>`;
const statusChip=r=>chip(STATUSES[statusKey(r)],({met:'green',partial:'amber',late:'red'})[statusKey(r)]||'outline');
function timing(r){if(followUp(r))return '已开展首轮，后续继续谈判／跟进';if(FIRST_NEGOTIATION&&r.actualDate&&r.actualDate<=ASOF)return '已记录首次谈判，不代表全部谈判结束';return r.actualDate&&r.actualDate<=ASOF&&r.plannedDate?(r.actualDate<=r.plannedDate?'按计划完成谈判':'晚于计划完成谈判'):known(r)?'日期待补':r.plannedDate?'按目标完成日跟进':'排期待补'}
const ownerLink=name=>`<button class="textbtn owner-link" data-owner="${esc(name)}">${esc(name)}</button>`;
const supplierLink=r=>`<button class="row-action" ${['owners','plan'].includes(state.view)?'data-master':'data-record'}="${esc(r.id)}">${esc(r.supplier)}</button>`;
const inlineRefs=new Map(DATA.records.map(r=>[r.supplier,{id:r.id}]));
for(const alias of ['汇达','虹达','凯盛世','鞍能','明曜','诚轩','佛隽']){const rs=DATA.records.filter(r=>r.supplier.includes(alias));if(rs.length===1)inlineRefs.set(alias,{id:rs[0].id})}
for(const owner of new Set(DATA.records.map(r=>r.owner)))inlineRefs.set(owner,{owner});
function linkText(value){let text=String(value??''),result='';while(text){let match=null;for(const [name,ref] of inlineRefs){const index=text.indexOf(name);if(index>=0&&(!match||index<match.index||index===match.index&&name.length>match.name.length))match={index,name,ref}}if(!match)return result+esc(text);result+=esc(text.slice(0,match.index))+`<button class="inline-link" ${match.ref.id?`data-record="${match.ref.id}"`:`data-owner="${esc(match.ref.owner)}"`}>${esc(match.name)}</button>`;text=text.slice(match.index+match.name.length)}return result}
const sub=s=>`<div class="cell-sub">${s}</div>`;
const notice=s=>`<div class="notice"><div>${s}</div></div>`;
const section=(title,desc,body)=>`<section class="section"><div class="section-head"><div><h2>${title}</h2><p>${desc}</p></div></div>${body}</section>`;
const table=(headers,rows,label,cls='')=>`<div class="table-scroll" role="region" aria-label="${esc(label)}" tabindex="0"><table class="${cls}"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="${headers.length}" class="empty">当前范围没有记录。</td></tr>`}</tbody></table></div>`;
const base=()=>!['owners','plan'].includes(state.view)?DATA.records:DATA.records.filter(r=>(state.workstream==='all'||r.workstream===state.workstream||r.substream===state.workstream)&&(state.owner==='all'||r.owner===state.owner));
function stats(rs){const done=rs.filter(started),values=rs.filter(r=>num(actual(r))),eligible=rs.filter(r=>known(r)&&r.actualDate&&r.plannedDate);return {n:rs.length,target:sum(rs,'targetAmount'),targetFilled:rs.filter(r=>num(r.targetAmount)).length,amount:sum(values,'actualAmount'),recorded:sum(values,'actualAmount')??0,amountFilled:values.length,rate:ratio(sum(values,'actualAmount')??0,sum(rs,'targetAmount')),talked:done.length,met:rs.filter(r=>statusKey(r)==='met').length,eligible:eligible.length,onTime:eligible.filter(r=>r.actualDate<=r.plannedDate).length,unscheduled:rs.filter(r=>!r.plannedDate).length}}
// Deadline compliance and monetary achievement are independent measures.
function ownerTraffic(rows){
 const due=rows.filter(r=>r.plannedDate&&r.plannedDate<=ASOF);
 const onTime=due.filter(r=>r.actualDate&&r.actualDate<=ASOF&&r.actualDate<=r.plannedDate).length;
 const rate=ratio(onTime,due.length),color=!due.length?'gray':onTime===due.length?'green':onTime*5>=due.length*4?'yellow':'red';
 return {color,rate,due:due.length,onTime,reason:due.length?`${onTime} / ${due.length} 家${TIMING_LABEL} · ${percent(rate)}`:'暂无到期供应商'};
}
function supplierTraffic(r){
 const pending=reason=>({color:'gray',reason});
 if(r.actualDate&&r.actualDate>ASOF)return pending('实际日期晚于数据截止日');
 if(started(r)&&num(actual(r))&&num(r.targetAmount)&&r.targetAmount>0&&actual(r)<r.targetAmount)return {color:'yellow',reason:'已谈，返利未达目标'};
 if(!started(r)&&r.plannedDate&&r.plannedDate<ASOF)return {color:'red',reason:'已超期，暂无谈判记录'};
 if(r.actualDate&&r.plannedDate&&r.actualDate<=r.plannedDate&&achievement(r)>=100)return {color:'green',reason:FIRST_NEGOTIATION?'首次谈判按期且返利达标':'按期谈完且返利达标'};
 if(!r.plannedDate)return pending('目标完成时间待补');
 if(!started(r))return pending('尚未超过目标完成日');
 if(!r.actualDate||!num(actual(r))||!num(r.targetAmount)||r.targetAmount<=0)return pending(FIRST_NEGOTIATION?'首次谈判日期或返利资料待补':'完成日期或返利资料待补');
 return pending(FIRST_NEGOTIATION?'返利达标，首次谈判晚于计划':'返利达标，完成时间晚于计划');
}
const TRAFFIC_LABELS={green:'绿灯',yellow:'黄灯',red:'红灯',gray:'待确认'};
function trafficBadge(t){return `<span class="traffic-badge traffic-${t.color}"><span class="traffic-dot" aria-hidden="true"></span>${TRAFFIC_LABELS[t.color]}</span><span class="traffic-reason">${esc(t.reason)}</span>`}
const TRAFFIC_LEGEND='<div class="traffic-legend"><span>● 绿灯：按期谈判且达标</span><span>● 黄灯：已谈未达标</span><span>● 红灯：超期无谈判记录</span><span>● 灰色：待确认</span></div>';

let drillGroups=new Map(),drillIndex=0;
const overviewDrills=new Map();
function drillButton(rows,label,cls='textbtn'){const key=String(++drillIndex);drillGroups.set(key,rows.map(r=>r.id));return `<button class="${cls}" data-drill="${key}">${label}</button>`}
const kpi=(label,value,foot,action='')=>`<article class="kpi"><div class="label">${label}</div><div class="value">${value}</div><div class="foot">${foot}</div>${action}</article>`;
function metrics(rs){const m=stats(rs);return `<div class="kpis">${kpi('负责返利目标',money(m.target)+'<small>万元</small>',`${m.targetFilled} / ${m.n} 家已分配；${m.n-m.targetFilled} 家待补`)}${kpi('供应商谈判覆盖',`${m.talked}<small>/ ${m.n} 家</small>`,`已记录谈判比例 ${percent(ratio(m.talked,m.n))}`)}${kpi('已记录谈成返利',money(m.recorded)+'<small>万元</small>',`${m.amountFilled} 家已填金额；${m.n-m.amountFilled} 家未回填`)}${kpi('已记录目标达成率',drillButton(rs,percent(m.rate),'metric-link'),`已记录返利 ÷ 已分配返利目标${m.n>m.targetFilled?'；目标尚未全覆盖':''}`)}</div>`}
function clues(r){return `<div class="clue-links"><button class="textbtn" data-record="${r.id}" data-tab="quality">质量 / 交付${r.claims.length?` · ${r.claims.length} 笔索赔`:r.qualityRecords.length?' · 有月度记录':r.qualityIssue==='是'||r.deliveryIssue==='是'?' · 已标注':' · 待补'}</button><button class="textbtn" data-record="${r.id}" data-tab="projects">新项目 · ${r.projects.length?r.projects.length+' 条':r.newProjectFlag==='是'?'已标注':'未匹配'}</button></div>`}
function supplierTable(rs,denominator=null){return `<div class="panel table-panel">${table(['供应商 / 谈判线索','负责人','返利目标 / 万元','已谈成返利 / 万元','目标达成率',...(denominator!==null?['占本分析目标']:[]),'目标完成日',ACTUAL_DATE_LABEL+' / 节奏','谈判状态','下一步'],rs.map(r=>`<tr><td>${supplierLink(r)}${sub(`${esc(r.substream)} · ${esc(r.category)}`)}${clues(r)}</td><td>${ownerLink(r.owner)}</td><td class="num">${money(r.targetAmount)}</td><td class="num">${num(actual(r))?money(actual(r)):'待回填'}</td><td class="num">${num(achievement(r))?drillButton([r],percent(achievement(r))):num(r.targetAmount)?'待回填':'待补目标'}</td>${denominator!==null?`<td class="num">${num(actual(r))?percent(ratio(actual(r),denominator)):'未记录贡献'}</td>`:''}<td>${r.plannedDate?dateText(r.plannedDate):'待排期'}</td><td>${dateText(r.actualDate)}${sub(esc(timing(r)))}</td><td>${statusChip(r)}</td><td class="next-step">${linkText(r.nextStep||'尚未记录下一步')}${r.nextStepLocator?sub(esc(r.nextStepLocator)):''}</td></tr>`).join(''),'供应商谈判明细','supplier-table')}</div>`}
function ownerTable(rs){const owners=[...new Set(rs.map(r=>r.owner))].map(owner=>({owner,rows:rs.filter(r=>r.owner===owner)})).sort((a,b)=>(sum(b.rows,'targetAmount')??-1)-(sum(a.rows,'targetAmount')??-1));return `<div class="panel table-panel">${table(['谈判负责人',TIMING_LABEL+'灯号','负责目标 / 万元','已谈 / 负责供应商','已谈成返利 / 万元','目标达成率','达到目标','待排期'],owners.map(({owner,rows})=>{const m=stats(rows),light=ownerTraffic(rows);return `<tr class="traffic-row traffic-${light.color}"><td>${ownerLink(owner)}</td><td data-sort="${light.rate??''}">${trafficBadge(light)}</td><td class="num" data-sort="${m.target??''}">${money(m.target)}</td><td class="num">${m.talked} / ${m.n}</td><td class="num" data-sort="${m.amount??''}">${m.amountFilled?money(m.amount):'待回填'}</td><td class="num" data-sort="${m.rate??''}">${drillButton(rows,percent(m.rate))}</td><td class="num">${m.met} 家</td><td class="num">${m.unscheduled} 家</td></tr>`}).join(''),'负责人进展','owner-table')}</div>`}
function categories(rs){return `<div class="workstream-block">${['BOM','non-BOM'].map(name=>{const rows=rs.filter(r=>r.workstream===name),m=stats(rows);if(!m.n)return '';return `<article class="panel category-card"><div class="panel-top"><h3>${name}</h3>${chip(m.n+' 家')}</div><div class="category-main"><b>${money(m.target)}</b><span>万元已分配返利目标</span></div><div class="category-metrics"><div><small>已记录返利 / 万元</small><b>${money(m.recorded)}</b></div><div><small>目标达成率</small>${drillButton(rows,percent(m.rate))}</div><div><small>已记录谈判</small><b>${m.talked} / ${m.n} 家</b></div></div><div class="bar green"><i style="width:${Math.min(100,m.rate??0)}%"></i></div><p class="panel-note">${m.n-m.targetFilled} 家目标待补，${m.unscheduled} 家待排期。${m.amountFilled?'':'实际返利尚未回填，已记录贡献为 0。'}</p>${name==='non-BOM'?`<div class="section">${['non-BOM 模具','non-BOM 工装','non-BOM 物流'].map(s=>{const a=rows.filter(r=>r.substream===s);return a.length?`<div class="category-sub"><span>${s.replace('non-BOM ','')} · ${a.length} 家</span><b>${money(sum(a,'targetAmount'))}${sum(a,'targetAmount')!==null?' 万元':''}</b></div>`:''}).join('')}</div>`:''}${drillButton(rows,'查看目标与返利贡献 →')}</article>`}).join('')}</div>`}
function statusCards(rs){return `<div class="status-grid">${Object.entries(STATUSES).map(([key,label])=>`<button class="status-card ${state.status===key?'selected':''}" data-status="${key}"><span>${esc(label)}</span><strong>${rs.filter(r=>statusKey(r)===key).length}<small> 家</small></strong></button>`).join('')}</div>`}
function searchRows(rs){const q=state.search.trim().toLowerCase();return rs.filter(r=>!q||`${r.supplier} ${r.owner} ${r.category} ${r.substream}`.toLowerCase().includes(q))}
function listRows(rs){return searchRows(rs).filter(r=>state.status==='all'||statusKey(r)===state.status).sort(state.sort==='amount'?(a,b)=>(b.targetAmount??-1)-(a.targetAmount??-1):state.sort==='owner'?(a,b)=>a.owner.localeCompare(b.owner,'zh-CN')||dateSort(a,b):dateSort)}
function listControls(kind){return `<div class="tab-toolbar"><label class="field-label">搜索供应商 / 负责人<input id="ledgerSearch" class="search-box" type="search" value="${esc(state.search)}" placeholder="输入名称或品类"></label><label class="field-label">谈判状态<select id="statusSelect"><option value="all">全部状态</option>${Object.entries(STATUSES).map(([k,v])=>`<option value="${k}" ${state.status===k?'selected':''}>${v}</option>`).join('')}</select></label>${kind==='ledger'?`<label class="field-label">排序<select id="sortSelect">${[['date','按目标完成日'],['amount','按返利目标'],['owner','按负责人']].map(([k,v])=>`<option value="${k}" ${state.sort===k?'selected':''}>${v}</option>`).join('')}</select></label>`:''}${kind!=='plan'?`<button data-export="${kind}" class="ghost">导出明细 CSV</button>`:''}</div>`}
function ledger(rs){const list=listRows(rs),pages=Math.max(1,Math.ceil(list.length/12));state.page=Math.min(state.page,pages);return `${listControls('ledger')}<p class="subtle">以下列表 ${list.length} 家；搜索与状态仅筛选本列表。</p>${supplierTable(list.slice((state.page-1)*12,state.page*12))}<div class="pagination"><span>第 ${state.page} / ${pages} 页 · 共 ${list.length} 家</span><div><button data-page="-1" ${state.page===1?'disabled':''} aria-label="上一页">←</button><button data-page="1" ${state.page===pages?'disabled':''} aria-label="下一页">→</button></div></div>`}
function overview(rs){return overviewBlocks(rs)}
function historyPanel(rs){const events=rs.flatMap(r=>r.history.map(h=>({r,h}))).sort((a,b)=>(a.h.date||'9999').localeCompare(b.h.date||'9999')||a.r.supplier.localeCompare(b.r.supplier,'zh-CN'));return events.length?`<div class="panel table-panel">${table(['日期 / 类型','供应商 / 负责人','返利目标 / 万元','本次结果 / 万元','进展与下一步'],events.map(({r,h})=>`<tr><td>${dateText(h.date)}${sub(esc(h.kind))}</td><td>${supplierLink(r)}${sub(ownerLink(r.owner))}${clues(r)}</td><td class="num">${money(r.targetAmount)}</td><td>${h.kind==='谈判结果'?money(h.amount):'进展记录，不重复计金额'}</td><td class="history-copy">${linkText(h.text)}${sub(`下一步：${linkText(r.nextStep||'尚未记录')}`)}${sub(esc(h.locator))}</td></tr>`).join(''),'按日期排列的谈判历程','history-table')}</div>`:'<div class="panel empty">当前范围尚无供应商级谈判结果或进展记录。目标排期见下方清单。</div>'}
function ownersView(rs){const startedRows=rs.filter(started),waiting=rs.filter(r=>!started(r));return `${section('负责人进度',`${TIMING_LABEL}率仅计算截至数据截止日目标已到期的供应商；100% 绿灯，80% 至不足 100% 黄灯，低于 80% 红灯。${FIRST_NEGOTIATION?'首次谈判不代表后续谈判结束。':''}点击姓名查看工作清单。`,ownerTable(rs))}${section('已开展谈判',`${startedRows.length} 家 · 首次谈判、后续跟进与返利达标分别展示；后续谈判不重复增加供应商数量。`,masterTable(startedRows,'已开展谈判供应商'))}${section('待开展谈判',`${waiting.length} 家 · 暂无已开展谈判的确认记录；已记录的计划及准备事项保留在下一步中。`,masterTable(waiting,'待开展谈判供应商'))}`}
function periodOptions(){const dates=DATA.records.map(r=>r.plannedDate).filter(Boolean).concat(ASOF,today,state.period).sort();let all=[];for(let d=dates[0];d<=dates.at(-1);d=add(d,1))all.push(d);if(state.periodMode==='week')all=[...new Set(all.map(monday))];return all}
function periodRows(rs){rs=[...new Map(rs.map(r=>[r.id,r])).values()];if(state.periodMode==='unscheduled')return rs.filter(r=>!r.plannedDate);if(state.periodMode==='all')return rs;return rs.filter(r=>r.plannedDate&&(state.periodMode==='day'?r.plannedDate===state.period:r.plannedDate>=state.period&&r.plannedDate<=add(state.period,6)))}
const selectedPlan=()=>listRows(periodRows(base())).sort(dateSort);
function planView(){const list=selectedPlan(),m=stats(list),dated=['day','week'].includes(state.periodMode);return `<div class="panel period-controls"><label class="field-label">查看粒度<select id="periodMode">${[['day','每日进度'],['week','每周进度'],['unscheduled','待排期'],['all','全部目标排期']].map(([k,v])=>`<option value="${k}" ${state.periodMode===k?'selected':''}>${v}</option>`).join('')}</select></label>${dated?`<label class="field-label">${state.periodMode==='day'?'目标完成日期（北京时间）':'目标完成周（周一至周日）'}<select id="periodValue">${periodOptions().map(d=>`<option value="${d}" ${d===state.period?'selected':''}>${dateText(d)}${state.periodMode==='week'?' — '+dateText(add(d,6)):''}${(state.periodMode==='week'?d===monday(today):d===today)?(state.periodMode==='week'?' · 本周':' · 今日'):''}</option>`).join('')}</select></label>`:''}<button class="ghost" data-today>返回今日</button></div><div class="section kpis">${kpi('本期间需推进供应商',m.n+'<small>家</small>',`${new Set(list.map(r=>r.owner)).size} 位负责人 · 含 ${list.filter(followUp).length} 家已谈后续跟进；每家仅计一次`)}${kpi('本期间计划返利目标',money(m.target)+'<small>万元</small>',`${m.n-m.targetFilled} 家目标待补；按目标完成时间归集`)}${kpi('计划目标占整体目标',percent(ratio(m.n?m.target:0,DATA.summary.targetAmount)),`分母固定为全体已分配目标 ${money(DATA.summary.targetAmount)} 万元`)}${kpi('本批供应商已记录返利',money(m.recorded)+'<small>万元</small>',`${m.talked} 家已有谈判记录；达成 ${percent(m.rate)}`,drillButton(list,'查看本批成果 →'))}</div>${notice('计划金额为选中供应商的返利目标，不代表已承诺取得的金额。已有首次谈判的供应商仍按目标完成日纳入后续计划，每家只计一次；本批成果是截至快照日的累计金额，不是本日／本周新增返利。')}${section('本期间供应商与负责人','按目标完成时间排序；筛选同时作用于上方期间统计。',masterTable(list,'本期间供应商返利清单'))}`}
function contribution(key){const ids=drillGroups.get(key);if(!ids)return;const rs=ids.map(id=>DATA.records.find(r=>r.id===id)).filter(Boolean),m=stats(rs);$('contributionTitle').textContent='实际谈成返利 · 供应商达成状况';$('contributionBody').innerHTML=`<div class="mini-kpis">${[['供应商数量',m.n+' 家'],['原订返利目标',money(m.target)+' 万元'],['实际谈成返利',money(m.recorded)+' 万元'],['本清单目标达成率',percent(m.rate)]].map(([k,v])=>`<div class="mini-kpi"><label>${k}</label><b>${v}</b></div>`).join('')}</div>${state.view==='owners'&&m.rate===0?'<p class="empty">当前达成率为 0，暂无返利成果清单。</p>':`<p>与「04 供应商返利清单」采用相同资料，可查看实际谈成金额与各供应商目标达成率。${esc(pendingAmountNote(rs))}</p>${masterTable(rs,'返利成果供应商清单')}`} `;enhanceTables($('contributionBody'));if(!$('contributionDialog').open)$('contributionDialog').showModal()}
let detailId=null;
function profileBody(r){const fields=[['返利目标',`${money(r.targetAmount)} 万元`],['已谈成返利',num(actual(r))?`${money(actual(r))} 万元${r.actualAmountPending?'（协商中，待确认）':''}`:'待回填'],['返利目标达成率',num(achievement(r))?percent(achievement(r)):'待回填 / 待补目标'],['目标完成时间',dateText(r.plannedDate)],[ACTUAL_DATE_LABEL,dateText(r.actualDate)],['年入库金额（背景参考）',`${money(r.annualReceiptAmount)} 万元`],['目标返利比（F/E）',num(r.targetRebateRate)?percent(r.targetRebateRate*100):'未填'],['26年降价比',num(r.historicalPriceReductionRate)?percent(r.historicalPriceReductionRate*100):r.historicalPriceReductionRate??'未填'],['26年涨价金额',num(r.historicalPriceIncreaseAmount)?`${money(r.historicalPriceIncreaseAmount)} 万元`:'未填'],['份额占比（原表口径）',num(r.shareOfSupplierSales)?percent(r.shareOfSupplierSales*100):r.shareOfSupplierSales??'未填'],['企业类型',r.companyType],['可替代性',r.substitutability],['合作年限（原表值）',r.relationshipYears??'未填'],['得邦相似业务',r.debongSimilarBusiness??''],['交付问题标注',r.deliveryIssue??''],['质量问题标注',r.qualityIssue??''],['27年新项目标注',r.newProjectFlag??'未填']];return `${followUpNote(r)}${r.progressSummary?`<div class="note-box"><strong>${dateText(r.progressAsOf)} 商谈进展</strong><p>${linkText(r.progressSummary)}</p></div>`:''}<div class="details-grid section">${fields.map(([k,v])=>`<div><label>${esc(k)}</label><b>${esc(v)}</b></div>`).join('')}</div><h3>下一步</h3><p>${linkText(r.nextStep||'尚未记录下一步')}</p>${r.nextStepLocator?sub(esc(r.nextStepLocator)):''}<h3>谈判历程</h3>${r.history.length?r.history.map(h=>`<article class="history-item"><strong>${dateText(h.date)} · ${esc(h.kind)}</strong><p>${linkText(h.text)}</p>${h.kind==='谈判结果'?`<p>目标 ${money(h.target)} 万元 · 结果 ${money(h.amount)} 万元</p>`:''}${sub(esc(h.locator))}</article>`).join(''):'<p>尚无已回填的谈判记录。</p>'}<p class="panel-note">年入库金额仅作背景参考，不作为负责人达成率分母；谈成返利不等同签约、财务确认或到账。</p>`}
const yuan=n=>num(n)?n.toLocaleString('zh-CN',{maximumFractionDigits:0}):'未填';
function qualityBody(r){const cs=r.claims,qs=r.qualityRecords.slice().sort((a,b)=>(a.month||'').localeCompare(b.month||'')||a.region.localeCompare(b.region,'zh-CN'));return `<p class="panel-note">主表质量标注：${esc(r.qualityIssue??'')}；交付标注：${esc(r.deliveryIssue??'')}。同时展示隐藏表已匹配记录，主表空白不代表没有问题。</p><h3>质量 / 交付索赔与罚款</h3><p>${cs.length} 笔已匹配索赔；台账索赔金额 ${money(sum(cs,'amount'))} 万元，与谈判返利分开。</p>${cs.length?table(['地区 / 日期','问题与索赔原因','索赔金额 / 元','实际扣回 / 元','待扣 / 元','状态 / 来源'],cs.map(c=>`<tr><td>${esc(c.region)}${sub(c.date?dateText(c.date):esc(c.dateRaw??'未填'))}</td><td class="claim-reason">${linkText(c.reason)}</td><td class="num">${yuan(c.amount)}</td><td class="num">${yuan(c.deducted)}</td><td class="num">${yuan(c.pending)}</td><td>${c.region==='丽水'?`内部确认：${esc(c.confirmed??'未填')}；开票：${esc(c.invoiced??'未填')}；核销货款：${esc(c.offset??'未填')}`:esc(c.note??'')}${sub(esc(c.locator))}</td></tr>`).join(''),'三地索赔明细','claims-table'):'<p class="empty">未匹配到供应商级索赔明细，不代表索赔金额为零。</p>'}<h3>月度质量与交付记录</h3><p>简称关联保留原名称和依据，供核对；合格率及交付率按原值显示。</p>${qs.length?table(['地区 / 月份','原表供应商 / 匹配依据','批次合格率','考核目标','供货达成率','考核目标','生产不良 PPM','投诉 / 抱怨次数','来源'],qs.map(q=>`<tr><td>${esc(q.region)}${sub(esc(q.month))}</td><td>${esc(q.sourceSupplier)}${sub(esc(q.matchMethod))}</td><td>${num(q.qualityRate)?percent(q.qualityRate*100):'未填'}</td><td>${num(q.qualityTarget)?percent(q.qualityTarget*100):'未填'}</td><td>${num(q.deliveryRate)?percent(q.deliveryRate*100):'未填'}</td><td>${num(q.deliveryTarget)?percent(q.deliveryTarget*100):'未填'}</td><td>${num(q.ppm)?q.ppm.toFixed(2):'未填'}</td><td>${num(q.complaints)?q.complaints:'未填'}</td><td>${esc(q.locator)}</td></tr>`).join(''),'三地质量交付月度记录','quality-table'):'<p class="empty">暂无可确认关联的月度记录；主表标注仍保留。</p>'}`}
function projectsBody(r){if(!r.projects.length)return '<p class="empty">无</p>';return `<p class="panel-note">主表新项目标注：${esc(r.newProjectFlag??'未填')}。匹配到 ${r.projects.length} 条关联记录；企划量可能跨零件重复，不直接相加，也不视为承诺给该供应商的订单量。</p>${r.projects.length?table(['产地 / 客户','项目 / 代码','零部件产品','预计企划量（原文）','T0 / SOP','备注 / 来源'],r.projects.map(p=>`<tr><td>${esc(p.region)}${sub(esc(p.customer))}</td><td>${esc(p.project)}${sub(esc(p.code))}</td><td>${esc(p.product??'未填')}</td><td>${esc(p.volume??'未填')}</td><td>T0 ${dateText(p.t0)}${sub(`SOP ${dateText(p.sop)}`)}</td><td>${esc(p.note??'')}${sub(esc(p.locator))}${sub(`关联取 ${p.supplierColumn} 列 · ${esc(p.matchMethod)}`)}</td></tr>`).join(''),'2027年量产新项目明细','projects-table'):'<p class="empty">未匹配到该供应商的定点明细。主表若已标注“是”，需要补充对应项目。</p>'}<div class="section">${ownerLink(r.owner)} <span>查看该负责人谈判进展 →</span></div>`}
function detail(id,tab='profile'){const r=DATA.records.find(r=>r.id===id);if(!r)return;detailId=id;$('detailTitle').textContent=r.supplier;$('detailBody').innerHTML=`<div class="detail-summary">${statusChip(r)}<span>${esc(r.substream)}</span>${ownerLink(r.owner)}</div><div class="segmented section" aria-label="供应商详情分类">${[['profile','供应商与谈判'],['quality','质量 / 交付 / 罚款'],['projects','2027 新项目']].map(([k,v])=>`<button data-detail-tab="${k}" class="${tab===k?'active':''}" aria-pressed="${tab===k}">${v}</button>`).join('')}</div>${({profile:profileBody,quality:qualityBody,projects:projectsBody}[tab])(r)}<div class="source-box">${esc(META.sourceFile)}<br>${esc(r.locator)} · 目标 F${r.sourceRow} · 目标日期 I${r.sourceRow} · 实际结果 T${r.sourceRow}:V${r.sourceRow}</div>`;enhanceTables($('detailBody'));if(!$('detailDialog').open)$('detailDialog').showModal()}
// Shared views and supplier master. Source records remain immutable.
const VIEW_GUIDE=[
 ['01','overview','整体谈判的目标以及进度','关注总体/BOM/ non-BOM的目标与返利进度'],
 ['02','owners','负责人进展','查看各负责人工作任务、当前进度与各供应商谈判策略'],
 ['03','plan','每日每周进度','快速查看当日与本周的谈判进度与工作计划'],
 ['04','suppliers','供应商返利清单','呈现全部供应商清单与基本资讯、谈判策略']
];
const categorySelection={BOM:'all','non-BOM':'all'};
let masterFocus=null;
const started=r=>known(r)||(r.negotiationDate&&r.negotiationDate<=ASOF)||(r.history||[]).some(h=>h.date&&h.date<=ASOF&&['谈判中','已开展谈判'].includes(h.kind));
function followUp(r){return FIRST_NEGOTIATION&&r.actualDate&&r.actualDate<=ASOF&&r.plannedDate&&r.plannedDate>r.actualDate&&(r.actualAmountPending||!num(achievement(r))||achievement(r)<100)}
function followUpText(r){return followUp(r)?`已于 ${dateText(r.actualDate)} 首次谈判；${r.followUpReason||'尚未达成返利目标，具体原因待补'}。后续谈判／跟进目标日：${dateText(r.plannedDate)}。`:''}
function followUpNote(r){return followUp(r)?`<div class="follow-up-note">${chip('已谈判 · 后续跟进','amber')}<p>${esc(followUpText(r))}</p></div>`:''}
function pendingAmountNote(rows){const pending=rows.filter(r=>r.actualAmountPending&&num(actual(r)));return pending.length?`含 ${money(sum(pending,'actualAmount'))} 万元协商中，尚未最终确认`:''}
function stageLabel(r){return followUp(r)?'已谈判 · 待后续跟进':r.actualAmountPending&&started(r)?'已谈判 · 协商中':FIRST_NEGOTIATION&&started(r)?'已开展谈判':r.actualDate&&r.actualDate<=ASOF?'已完成':started(r)?'谈判中':'待开展（记录待确认）'}
function guideView(){return `<div class="guide-intro panel"><p class="eyebrow">从目标到执行</p><h2>四个板块，一份供应商返利清单</h2><p>按以下顺序查看，点击卡片即可进入对应板块。</p></div><div class="guide-grid">${VIEW_GUIDE.map(([n,key,title,desc])=>`<button class="guide-card" data-view="${key}"><span class="guide-number">${n}</span><span><strong>${title}</strong><span class="guide-description">${desc}</span></span><span class="guide-arrow" aria-hidden="true">↗</span></button>`).join('')}</div>${notice('供应商名称可查看统一底表与详情；负责人姓名可进入个人进展；实际谈成返利金额可点入查看供应商贡献。日期与结果均以当前工作簿快照为准。')}`}
function categoryOptions(name){const rows=DATA.records.filter(r=>r.workstream===name);return `<option value="all">全部 ${name}</option>${name==='non-BOM'?`<optgroup label="业务大类">${[...new Set(rows.map(r=>r.substream))].sort().map(s=>`<option value="group:${esc(s)}" ${categorySelection[name]==='group:'+s?'selected':''}>${esc(s.replace('non-BOM ',''))}</option>`).join('')}</optgroup>`:''}<optgroup label="原表品类">${[...new Set(rows.map(r=>r.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN')).map(c=>`<option value="category:${esc(c)}" ${categorySelection[name]==='category:'+c?'selected':''}>${esc(c)}</option>`).join('')}</optgroup>`}
function categoryRows(rs,name){const value=categorySelection[name];return rs.filter(r=>r.workstream===name&&(value==='all'||value==='category:'+r.category||value==='group:'+r.substream))}
// Pool totals are source-backed scope targets, never allocated to individual suppliers.
// As targets are assigned, only the remaining pool is added, preventing double counting.
function overviewTarget(rows){
 const ids=new Set(rows.map(r=>r.id)),assigned=sum(rows,'targetAmount');
 let reserve=0,coveredPool=false;const partialPools=[],missingPools=[],includedPools=[];
 for(const pool of DATA.targetPools||[]){
  const members=DATA.records.filter(r=>pool.memberIds.includes(r.id));
  if(!members.some(r=>ids.has(r.id)))continue;
  if(!num(pool.totalAmount)){missingPools.push(pool);continue}
  const remaining=Math.max(0,pool.totalAmount-(sum(members,'targetAmount')??0));
  if(members.every(r=>ids.has(r.id))){reserve+=remaining;coveredPool=true;includedPools.push({...pool,remaining})}
  else if(remaining>0)partialPools.push({...pool,remaining});
 }
 return {assigned,reserve,total:num(assigned)||coveredPool?(assigned??0)+reserve:null,includedPools,partialPools,missingPools};
}
function overviewMetrics(rows){
 const m=stats(rows),target=overviewTarget(rows),receipt=sum(rows,'annualReceiptAmount'),done=rows.filter(started);
 const results=rows.filter(r=>num(actual(r))),amount=sum(results,'actualAmount'),doneTarget=sum(done,'targetAmount');
 const cohortComplete=done.length>0&&done.every(r=>num(r.targetAmount)&&num(actual(r)));
 return {m,target,receipt,done,results,amount,doneTarget,cohortComplete,
  targetRate:ratio(target.total,receipt),overallRate:ratio(amount,target.total),cohortRate:cohortComplete?ratio(sum(done,'actualAmount'),doneTarget):null};
}
function overviewBlocks(rs){return ['总体','BOM','non-BOM'].map((name,index)=>{
 const rows=name==='总体'?rs:categoryRows(rs,name),v=overviewMetrics(rows),{m,target,done}=v;
 const link=(kind,label,large=false)=>overviewDrillButton(rows,kind,label,large);
 const missingMolds=rows.filter(r=>r.substream==='non-BOM 模具'&&!num(r.targetAmount)).length;
 const otherMissing=m.n-m.targetFilled-missingMolds;
 const targetNotes=[`${link('unscheduled',m.unscheduled)} 家待排期`,...(missingMolds?[`${link('missing-mold',missingMolds)} 家模具目标待拆解`]:[]),...(otherMissing?[`${link('missing-target',otherMissing)} 家目标待补`]:[])];
 const targetDetail=target.reserve>0?`含模具目标 ${link('pool',money(target.reserve))} 万元待拆解`:target.partialPools.length?'模具目标尚未拆分至当前品类':target.missingPools.length?'模具汇总目标待补':`${link('assigned',m.targetFilled)} 家已分配目标`;
 const targetRatio=num(v.targetRate)?`占入库金额 ${link('receipt-ratio',percent(v.targetRate))}`:'占入库金额比例待补';
 const overallRatio=num(v.overallRate)?`占总返利目标 ${link('overall-rate',percent(v.overallRate))}`:'整体返利进度待回填';
 const cohortRatio=!done.length?'暂无已谈记录':num(v.cohortRate)?`已谈供应商目标达成率 ${link('cohort-rate',percent(v.cohortRate))}`:'已谈供应商目标达成率待补';
 const cohortDetail=!done.length?'有谈判记录后计算达成率':v.cohortComplete?`已谈成 ${link('cohort-amount',money(sum(done,'actualAmount')))} / 原定目标 ${link('cohort-target',money(v.doneTarget))} 万元`:`${link('cohort-missing-target',done.filter(r=>!num(r.targetAmount)).length)} 家目标待补；${link('cohort-missing-result',done.filter(r=>!num(actual(r))).length)} 家结果待补`;
 const card=(key,label,value,ratioText,note)=>`<article class="kpi overview-kpi" data-metric="${key}"><div class="label">${label}</div><div class="value">${value}</div><div class="foot"><div class="overview-ratio">${ratioText}</div><div class="overview-note">${note}</div></div></article>`;
 const amountValue=v.results.length?drillButton(v.results,money(v.amount)+'<small>万元</small>','metric-link'):'待回填';
 return `<section class="overview-section" data-overview="${name}"><div class="overview-heading"><div><span class="eyebrow">${String(index+1).padStart(2,'0')} / NEGOTIATION</span><h2>${name}</h2></div>${name!=='总体'?`<label class="field-label">分类筛选<select data-category="${name}" aria-label="${name}分类筛选">${categoryOptions(name)}</select></label>`:''}</div><h3 class="metric-group-title">总目标</h3><div class="kpis overview-metrics">${card('target','返利金额目标',num(target.total)?link('target',money(target.total)+'<small>万元</small>',true):money(target.total),targetRatio,targetDetail)}${card('suppliers','需谈判供应商',link('suppliers',m.n+'<small>家</small>',true),targetNotes.join(' · '),'按 Excel 目标完成时间统计排期')}</div><h3 class="metric-group-title">总进度</h3><div class="kpis overview-metrics">${card('amount','已谈成返利金额',amountValue,overallRatio,v.results.length?`${link('results',v.results.length)} 家已填结果 · 点击数字查看明细${pendingAmountNote(rows)?'<br>'+pendingAmountNote(rows):''}`:'实际返利金额尚未回填')}${card('talked','已谈判供应商',link('talked',done.length+'<small>家</small>',true),cohortRatio,cohortDetail)}</div></section>`
 }).join('')}

const OVERVIEW_DRILL_TITLES={target:'返利目标构成', 'receipt-ratio':'目标占入库金额比例',pool:'模具未拆解目标',suppliers:'需谈判供应商',unscheduled:'待排期供应商','missing-mold':'模具目标待拆解供应商','missing-target':'其他目标待补供应商',assigned:'已分配目标供应商','overall-rate':'整体返利进度',talked:'已谈判供应商','cohort-rate':'已谈供应商目标达成率','cohort-amount':'已谈供应商返利金额','cohort-target':'已谈供应商原定目标',results:'已填写返利结果供应商','cohort-missing-target':'已谈供应商目标待补','cohort-missing-result':'已谈供应商结果待补'};
function overviewDrillButton(rows,kind,label,large=false){
 const key=String(overviewDrills.size+1);overviewDrills.set(key,{ids:rows.map(r=>r.id),kind});
 return `<button type="button" class="${large?'metric-link':'overview-number-link'}" data-overview-drill="${key}" data-drill-kind="${kind}" aria-label="查看${esc(OVERVIEW_DRILL_TITLES[kind])}数据表">${label}</button>`;
}
function overviewDrillRows(rows,kind){
 const filters={unscheduled:r=>!r.plannedDate,'missing-mold':r=>r.substream==='non-BOM 模具'&&!num(r.targetAmount),'missing-target':r=>r.substream!=='non-BOM 模具'&&!num(r.targetAmount),assigned:r=>num(r.targetAmount),talked:started,'cohort-rate':started,'cohort-target':started,'cohort-amount':r=>started(r)&&num(actual(r)),results:r=>num(actual(r)),'cohort-missing-target':r=>started(r)&&!num(r.targetAmount),'cohort-missing-result':r=>started(r)&&!num(actual(r))};
 if(kind==='pool'){const ids=new Set(overviewTarget(rows).includedPools.flatMap(p=>p.memberIds));return rows.filter(r=>ids.has(r.id))}
 return filters[kind]?rows.filter(filters[kind]):rows;
}
function overviewDrill(key){
 const entry=overviewDrills.get(key);if(!entry)return;
 const rows=entry.ids.map(id=>DATA.records.find(r=>r.id===id)).filter(Boolean),v=overviewMetrics(rows),kind=entry.kind;
 const selected=overviewDrillRows(rows,kind),s=overviewMetrics(selected),title=OVERVIEW_DRILL_TITLES[kind];
 const amount=x=>num(x)?money(x)+' 万元':'待回填',target=x=>num(x)?money(x)+' 万元':'待补';
 let cards=[['供应商数量',selected.length+' 家'],['已分配返利目标',target(s.target.assigned)],['已记录谈成返利',amount(s.amount)]],note='',reconciliation='';
 const fullTarget=['target','receipt-ratio','overall-rate'].includes(kind);
 if(fullTarget){
  cards=[['完整返利目标',target(v.target.total)],['入库金额',amount(v.receipt)],['已记录谈成返利',amount(v.amount)],['对应比例',kind==='overall-rate'?percent(v.overallRate):percent(v.targetRate)]];
  note=kind==='overall-rate'?'整体返利进度 = 已记录谈成返利 ÷ 完整返利目标。下表保留分母范围内全部供应商，结果空白仍为空白。':kind==='receipt-ratio'?'目标占入库金额比例 = 完整返利目标 ÷ 本范围入库金额。下表保留同范围供应商的目标与入库金额。':'完整返利目标 = 已分配供应商目标 + 未拆解目标池余额。未拆解目标单独列示，不分摊到供应商。';
  const components=[['已分配供应商目标',v.target.assigned,`${META.primarySheet} · 本范围 F 列合计`],...v.target.includedPools.filter(p=>p.remaining>0).map(p=>[`${p.label}未拆解目标`,p.remaining,`${p.locator} · 汇总目标减已分配额`]),['完整返利目标合计',v.target.total,'以上项目按未舍入金额汇总']];
  reconciliation=`<div class="panel table-panel overview-reconciliation">${table(['目标构成','金额 / 万元','来源与计算'],components.map(([label,value,source])=>`<tr><td>${esc(label)}</td><td class="num" data-sort="${value??''}">${money(value)}</td><td>${esc(source)}</td></tr>`).join(''),'返利目标构成','target-components')}</div>`;
 }
 if(kind==='pool'){
  const pools=v.target.includedPools,total=pools.reduce((n,p)=>n+p.totalAmount,0),allocated=pools.reduce((n,p)=>n+(sum(DATA.records.filter(r=>p.memberIds.includes(r.id)),'targetAmount')??0),0);
  cards=[['相关供应商',selected.length+' 家'],['模具汇总目标',target(total)],['已分配目标',target(allocated)],['尚未拆解金额',target(v.target.reserve)]];
  note=`尚未拆解金额 = max(0, 模具汇总目标 − 已分配目标)。来源：${pools.map(p=>p.locator+'；'+p.formula).join(' / ')}。下表供应商目标为空时保持为空，不均摊目标。`;
 }
 if(['talked','cohort-rate','cohort-target','cohort-amount'].includes(kind)){
  const cohort=overviewMetrics(v.done);
  cards=[['已谈供应商',v.done.length+' 家'],['该批原定返利目标',target(v.doneTarget)],['该批已谈成返利',amount(cohort.amount)],['该批目标达成率',v.done.length?percent(v.cohortRate):'暂无已谈记录']];
  note='已谈供应商目标达成率 = 同一批供应商已谈成返利 ÷ 该批原定目标。目标或结果缺失时不补零，不能将其与整体返利进度混用。';
 }
 const notes={suppliers:'当前分类范围内全部需谈判供应商。',unscheduled:'仅列目标完成时间尚未填写的供应商；目标完成时间是截止时间，不是预约谈判日期。','missing-mold':'仅列模具范围内供应商返利目标尚未拆解的记录。','missing-target':'仅列非模具范围内返利目标尚未填写的记录。',assigned:'仅列已经填写供应商返利目标的记录。',results:'仅列截至快照日已经填写有效返利结果的供应商，包含明确填写的零返利。','cohort-missing-target':'仅列已开展谈判但原定目标尚未填写的供应商。','cohort-missing-result':'仅列已开展谈判但实际返利金额尚未填写的供应商。'};
 note=notes[kind]||note;
 $('contributionTitle').textContent=title+' · 数据明细';
 $('contributionBody').innerHTML=`<div class="mini-kpis">${cards.map(([label,value])=>`<div class="mini-kpi"><label>${esc(label)}</label><b>${esc(value)}</b></div>`).join('')}</div><p class="overview-drill-note">${esc(note)}</p>${reconciliation}<p class="overview-drill-count">本清单 ${selected.length} 家供应商 · 数据截至 ${dateText(ASOF)}</p>${masterTable(selected,title+'供应商清单')}`;
 enhanceTables($('contributionBody'));$('contributionBody').scrollTop=0;
 if(!$('contributionDialog').open)$('contributionDialog').showModal();
 requestAnimationFrame(syncTableScrollbars);
}
function bindOverviewFilters(){document.querySelectorAll('[data-category]').forEach(el=>el.onchange=()=>{const key=el.dataset.category,top=window.scrollY;categorySelection[key]=el.value;render();document.querySelector(`[data-category="${key}"]`).focus({preventScroll:true});window.scrollTo(0,top)})}

const LEVERAGE_RULES={
 reduction:{label:'低于集团目前降本比例',key:'historicalPriceReductionRate',column:'J',test:v=>num(v)&&v<.09,format:v=>percent(v*100),rule:'26年降价比低于 9%（不含 9%）'},
 share:{label:'嘉利作为供应商大客户',key:'shareOfSupplierSales',column:'L',test:v=>num(v)&&v>.6,format:v=>percent(v*100),rule:'份额占比高于 60%（不含 60%）'},
 years:{label:'合作年限长客户',key:'relationshipYears',column:'O',test:v=>num(v)&&v>10,format:v=>`${v} 年`,rule:'合作年限高于 10 年（不含 10 年）'}
};
function leverageLabels(r){return [...Object.values(LEVERAGE_RULES).filter(rule=>rule.test(r[rule.key])).map(rule=>rule.label),...['debongSimilarBusiness','deliveryIssue','qualityIssue'].filter(key=>r[key]!=null&&String(r[key]).trim()).map(key=>({debongSimilarBusiness:'得邦相似业务',deliveryIssue:'交付问题',qualityIssue:'质量问题'}[key])+`：${r[key]}`)]}
function leverageTags(r){const numerical=Object.entries(LEVERAGE_RULES).filter(([,rule])=>rule.test(r[rule.key])).map(([key,rule])=>`<button class="leverage-tag" data-leverage="${key}" data-id="${esc(r.id)}">${rule.label} ↗</button>`);const flags=[['debongSimilarBusiness','得邦相似业务'],['deliveryIssue','交付问题'],['qualityIssue','质量问题']].filter(([key])=>r[key]!=null&&String(r[key]).trim()).map(([key,label])=>key==='qualityIssue'?`<button class="leverage-tag" data-record="${esc(r.id)}" data-tab="quality">${label}：${esc(r[key])} ↗</button>`:`<span class="leverage-tag static-tag">${label}：${esc(r[key])}</span>`);return `<div class="leverage-tags">${[...numerical,...flags].join('')}</div>`}
function leverageDetail(id,key){const r=DATA.records.find(r=>r.id===id),rule=LEVERAGE_RULES[key];if(!r||!rule||!rule.test(r[rule.key]))return;$('leverageTitle').textContent=rule.label;$('leverageBody').innerHTML=`<h3>${esc(r.supplier)}</h3><div class="leverage-value">${rule.format(r[rule.key])}</div><p>${rule.rule}</p><p>谈判负责人：${ownerLink(r.owner)}</p><button class="ghost" data-master="${esc(r.id)}">在供应商返利清单查看 →</button><div class="source-box">${esc(r.sourceSheet)} · ${rule.column}${r.sourceRow} · 数据截至 ${dateText(ASOF)}</div>`;$('leverageDialog').showModal()}
const fieldMoney=v=>num(v)?money(v):'';
const fieldPercent=v=>num(v)?percent(v*100):esc(v??'');
const MASTER_COLUMNS=[
 {name:'供应商名称',key:'supplier',render:r=>supplierLink(r)+sub(`<button class="textbtn" data-record="${esc(r.id)}">查看资料与谈判详情 ↗</button>`)+followUpNote(r),value:r=>r.supplier},
 {name:'谈判灯号',key:'traffic',render:r=>trafficBadge(supplierTraffic(r)),value:r=>TRAFFIC_LABELS[supplierTraffic(r).color]},
 {name:'分类',key:'workstream',render:r=>esc(r.workstream)+sub(esc(r.category)),value:r=>r.workstream+' '+r.category},
 {name:'谈判策略',key:'leverage',render:leverageTags,value:r=>leverageLabels(r).join('；')},
 {name:'年入库金额 / 万元',key:'annualReceiptAmount',render:r=>fieldMoney(r.annualReceiptAmount)},
 {name:'返利目标 / 万元',key:'targetAmount',render:r=>fieldMoney(r.targetAmount)},
 {name:'返利比',key:'targetRebateRate',render:r=>fieldPercent(r.targetRebateRate)},
 {name:'责任人',key:'owner',render:r=>ownerLink(r.owner)},
 {name:'目标完成时间',key:'plannedDate',render:r=>r.plannedDate?dateText(r.plannedDate):''},
 {name:'26年降价比',key:'historicalPriceReductionRate',render:r=>fieldPercent(r.historicalPriceReductionRate)},
 {name:'26年涨价金额 / 万元',key:'historicalPriceIncreaseAmount',render:r=>fieldMoney(r.historicalPriceIncreaseAmount)},
 {name:'份额占比',key:'shareOfSupplierSales',render:r=>fieldPercent(r.shareOfSupplierSales)},
 {name:'企业类型',key:'companyType'},
 {name:'可替代性',key:'substitutability'},
 {name:'合作年限',key:'relationshipYears',render:r=>num(r.relationshipYears)?`${r.relationshipYears} 年`:esc(r.relationshipYears??'')},
 {name:'得邦相似业务',key:'debongSimilarBusiness'},
 {name:'交付问题',key:'deliveryIssue'},
 {name:'质量问题',key:'qualityIssue',render:r=>r.qualityIssue!=null&&String(r.qualityIssue).trim()?`<button class="textbtn" data-record="${esc(r.id)}" data-tab="quality">${esc(r.qualityIssue)} ↗</button>`:''},
 {name:'27年新项目',key:'newProjectFlag',render:r=>r.newProjectFlag==='是'?`<button class="textbtn" data-record="${esc(r.id)}" data-tab="projects">是 · ${r.projects.length} 条 ↗</button>`:esc(r.newProjectFlag??'')},
 {name:'谈判阶段 / 结果',key:'stage',value:r=>stageLabel(r)+' '+STATUSES[statusKey(r)]+' '+followUpText(r),render:r=>chip(stageLabel(r),known(r)?'green':'outline')+sub(statusChip(r))},
 {name:ACTUAL_DATE_LABEL,key:'actualDate',render:r=>r.actualDate?dateText(r.actualDate):''},
 {name:'实际谈成返利 / 万元',key:'actualAmount',value:actual,render:r=>fieldMoney(actual(r))+(r.actualAmountPending?sub('协商中，待确认'):'')},
 {name:'返利目标达成率',key:'achievement',value:achievement,render:r=>num(achievement(r))?drillButton([r],percent(achievement(r))):''},
 {name:'下一步',key:'nextStep',value:r=>followUp(r)?followUpText(r):r.nextStep,render:r=>linkText(followUp(r)?followUpText(r):r.nextStep??'')}
];
function masterTable(rs,label){return `<div class="panel table-panel master-panel">${table(MASTER_COLUMNS.map(c=>c.name),rs.slice().sort(dateSort).map(r=>`<tr class="traffic-row traffic-${supplierTraffic(r).color}" data-supplier-id="${esc(r.id)}">${MASTER_COLUMNS.map(c=>{const raw=c.value?c.value(r):r[c.key];return `<td class="${['annualReceiptAmount','targetAmount','targetRebateRate','historicalPriceReductionRate','historicalPriceIncreaseAmount','shareOfSupplierSales','relationshipYears','actualAmount','achievement'].includes(c.key)?'numeric-cell':''}" data-field="${c.key}" data-sort="${esc(raw??'')}" ${num(raw)?'data-sort-type="number"':''}>${c.render?c.render(r):esc(raw??'')}</td>`}).join('')}</tr>`).join(''),label,'master-table')}</div>`}
function suppliersView(rs){const selected=masterFocus?DATA.records.filter(r=>r.id===masterFocus):rs;return `${masterFocus?notice(`从供应商链接定位到 <strong>${esc(selected[0]?.supplier??'')}</strong>。<button class="textbtn" data-clear-master>返回全部供应商返利清单 →</button>`):''}<div class="master-heading"><h2>${masterFocus?'当前供应商':'全部供应商'} · ${selected.length} 家</h2><p>查看供应商基本资讯、谈判策略、谈判结果与下一步，可按栏位排序。</p>${TRAFFIC_LEGEND}</div>${masterTable(selected,'供应商返利清单')}`}
function openMaster(id){closeDialogs();masterFocus=id;state.view='suppliers';state.search='';state.status='all';render();window.scrollTo(0,0)}

// Every table uses the same column filtering, typed sorting, pagination and export.
// Persist controls across rerenders without changing the immutable source records.
const tableStates=new Map();
function tableContext(label){return [state.view,state.workstream,state.owner,state.periodMode,state.period,masterFocus||'',detailId||'',label].join('|')}
function csvDownload(headers,rows,name){const safe=value=>{let v=String(value??'');if(/^\s*[=+@-]/.test(v))v="'"+v;return '"'+v.replaceAll('"','""')+'"'};const url=URL.createObjectURL(new Blob(['\ufeff'+[headers,...rows].map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`${name}_${ASOF}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000)}
let sortMenuAction=null,sortMenuTrigger=null,sortMenuAnchor=null;
const FUNNEL_ICON='<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M3 5h18l-7 8v6l-4 2v-8Z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>';
function closeSortMenu(){const menu=$('sortMenu');if(menu.matches(':popover-open'))menu.hidePopover()}
function openSortMenu(trigger,title,action){closeSortMenu();sortMenuAction=action;sortMenuTrigger=trigger;const menu=$('sortMenu'),host=trigger.closest('dialog')||document.body;if(menu.parentElement!==host)host.append(menu);$('sortMenuTitle').textContent=title;trigger.setAttribute('aria-expanded','true');menu.showPopover();const scale=parseFloat(getComputedStyle(document.documentElement).zoom)||1,rect=trigger.getBoundingClientRect(),box=menu.getBoundingClientRect();sortMenuAnchor={left:rect.left,top:rect.top};menu.style.left=Math.max(8,Math.min(innerWidth-box.width-8,rect.right-box.width))/scale+'px';menu.style.top=(rect.bottom+box.height+8<=innerHeight?rect.bottom+6:Math.max(8,rect.top-box.height-6))/scale+'px';menu.querySelector('button').focus({preventScroll:true})}
// Keep horizontal navigation visible above long tables, outside the scrolling body.
function addTableScrollbar(wrap){const strip=document.createElement('div');strip.className='table-scroll-strip';strip.innerHTML='<span class="scroll-hint">左右滚动查看完整清单 →</span><div class="scroll-navigation"><button class="scroll-left" aria-label="向左滚动表格">←</button><div class="table-top-scroll" tabindex="0" role="region"><div></div></div><button class="scroll-right" aria-label="向右滚动表格">→</button></div>';const bar=strip.querySelector('.table-top-scroll');bar.setAttribute('aria-label',(wrap.getAttribute('aria-label')||'明细')+'横向滚动条');wrap.before(strip);wrap.classList.add('scroll-ready');wrap._topScrollbar=bar;strip.querySelector('.scroll-left').onclick=()=>{wrap.scrollLeft-=wrap.clientWidth*.65};strip.querySelector('.scroll-right').onclick=()=>{wrap.scrollLeft+=wrap.clientWidth*.65};bar.addEventListener('scroll',()=>{if(Math.abs(wrap.scrollLeft-bar.scrollLeft)>1)wrap.scrollLeft=bar.scrollLeft});wrap.addEventListener('scroll',()=>{if(Math.abs(bar.scrollLeft-wrap.scrollLeft)>1)bar.scrollLeft=wrap.scrollLeft})}
function syncTableScrollbars(){document.querySelectorAll('.table-scroll.scroll-ready').forEach(wrap=>{const bar=wrap._topScrollbar;if(!bar)return;const strip=bar.closest('.table-scroll-strip'),overflow=wrap.scrollWidth>wrap.clientWidth+1;strip.hidden=!overflow;bar.firstElementChild.style.width=wrap.scrollWidth+'px';bar.scrollLeft=wrap.scrollLeft})}
window.addEventListener('resize',()=>requestAnimationFrame(syncTableScrollbars));

// One data model, two presentation modes. Preference storage is optional.
const presentationMedia=matchMedia('(max-width: 767px)');
let presentationPreference=null;
try{const saved=localStorage.getItem('jiali-dashboard-presentation');if(['browser','mobile'].includes(saved))presentationPreference=saved}catch{}
const requestedPresentation=new URLSearchParams(location.search).get('mode');
if(['browser','mobile'].includes(requestedPresentation))presentationPreference=requestedPresentation;
function ensureActiveNavVisible(){const wrap=document.querySelector('.nav-wrap'),button=wrap.querySelector('[aria-current=page]');if(!button)return;const left=button.offsetLeft-wrap.offsetLeft;if(left<wrap.scrollLeft)wrap.scrollLeft=left;else if(left+button.offsetWidth>wrap.scrollLeft+wrap.clientWidth)wrap.scrollLeft=left+button.offsetWidth-wrap.clientWidth}
function setPresentation(mode,remember=false){if(!['browser','mobile'].includes(mode))return;closeSortMenu();document.documentElement.dataset.presentation=mode;document.querySelectorAll('[data-presentation-choice]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.presentationChoice===mode)));if(remember){presentationPreference=mode;try{localStorage.setItem('jiali-dashboard-presentation',mode)}catch{}try{const url=new URL(location.href);if(url.searchParams.has('mode')){url.searchParams.set('mode',mode);history.replaceState(null,'',url)}}catch{}}requestAnimationFrame(()=>{syncTableScrollbars();ensureActiveNavVisible()})}
presentationMedia.addEventListener('change',e=>{if(!presentationPreference)setPresentation(e.matches?'mobile':'browser')});
function mobileTableCard(entry,headers,isMaster){const cells=[...entry.row.cells];const field=index=>`<div class="mobile-fact"><dt>${esc(headers[index])}</dt><dd>${cells[index].innerHTML}</dd></div>`,rowClass=esc(entry.row.className);
 if(!isMaster)return `<article class="mobile-record-card ${rowClass}"><header class="mobile-record-heading"><span class="mobile-record-kind">${esc(headers[0])}</span>${cells[0].innerHTML}</header><dl class="mobile-facts">${cells.slice(1).map((_,i)=>field(i+1)).join('')}</dl></article>`;
 const index=key=>cells.findIndex(c=>c.dataset.field===key),content=key=>cells[index(key)].innerHTML;
 const primary=['owner','plannedDate','targetAmount','actualAmount','achievement'].map(index),shown=new Set(['supplier','traffic','workstream','leverage','stage','nextStep'].map(index).concat(primary)),remaining=cells.map((_,i)=>i).filter(i=>!shown.has(i));
 return `<article class="mobile-record-card ${rowClass}" data-supplier-id="${esc(entry.row.dataset.supplierId)}"><header class="mobile-record-heading">${content('supplier')}<div class="mobile-record-category">${content('workstream')}</div></header><div class="mobile-traffic">${content('traffic')}</div><div class="mobile-record-status">${content('stage')}</div><dl class="mobile-facts">${primary.map(field).join('')}</dl>${cells[index('nextStep')].textContent.trim()?`<div class="mobile-next-step"><h4>下一步</h4>${content('nextStep')}</div>`:''}${cells[index('leverage')].textContent.trim()?`<section class="mobile-strategies"><h4>谈判策略</h4>${content('leverage')}</section>`:''}<details class="mobile-record-more"><summary>更多供应商资料</summary><dl class="mobile-facts">${remaining.map(field).join('')}</dl></details></article>`
}

function enhanceTables(root){for(const t of root.querySelectorAll('table:not([data-enhanced])')){
 t.dataset.enhanced='true';const wrap=t.closest('.table-scroll'),label=wrap.getAttribute('aria-label')||'明细',key=tableContext(label),heads=[...t.tHead.rows[0].cells],body=t.tBodies[0],sourceRows=[...body.rows].filter(row=>row.cells.length===heads.length),isMaster=t.classList.contains('master-table');
 const config=tableStates.get(key)||{sort:-1,direction:1,page:1};tableStates.set(key,config);
 function cellText(cell){const copy=cell.cloneNode(true);copy.querySelectorAll('.cell-sub,.clue-links').forEach(e=>e.remove());return copy.textContent.trim()}
 const entries=sourceRows.map((row,index)=>({row,index,cells:[...row.cells].map(cell=>{const main=cellText(cell),raw=cell.hasAttribute('data-sort')?cell.dataset.sort:main,clean=raw.replaceAll(',','').trim(),n=/^-?\d+(?:\.\d+)?(?:%|\s*万元|\s*元|\s*年|\s*家)?$/.test(clean)?parseFloat(clean):null;return {display:main,sort:cell.dataset.sortType==='number'?Number(raw):n!==null?n:raw,empty:raw===''||['未填','待补','待回填','待补目标','待排期'].includes(raw)}})}));
 const headers=heads.map(h=>h.textContent.trim());
 heads.forEach((head,i)=>{if(isMaster)head.dataset.field=MASTER_COLUMNS[i].key;head.setAttribute('scope','col');const title=document.createElement('span');title.className='column-heading';title.innerHTML=esc(headers[i]).replace(/ \/ (万元|元)$/,'<span class="column-unit">$1</span>');const button=document.createElement('button');button.className='header-sort';button.type='button';button.innerHTML=FUNNEL_ICON;button.title='排序：'+headers[i];button.setAttribute('aria-label',`${label}：排序${headers[i]}`);button.setAttribute('aria-haspopup','true');button.setAttribute('aria-expanded','false');button.onclick=()=>openSortMenu(button,headers[i],direction=>{config.sort=direction===0?-1:i;config.direction=direction||1;config.page=1;apply()});const line=document.createElement('div');line.className='column-heading-line';line.append(title,button);head.replaceChildren(line)});
 const toolbar=document.createElement('div');toolbar.className='table-tools';const count=document.createElement('span');count.className='table-count';count.setAttribute('role','status');const exportButton=document.createElement('button');exportButton.textContent='导出清单 CSV';exportButton.className='ghost';exportButton.onclick=()=>csvDownload(headers,ordered.map(e=>e.cells.map(c=>c.display)),label);toolbar.append(count,exportButton);wrap.before(toolbar);addTableScrollbar(wrap);
 const pager=document.createElement('div');pager.className='pagination table-pagination';const pageLabel=document.createElement('span'),pagerActions=document.createElement('div'),prev=document.createElement('button'),next=document.createElement('button');prev.textContent='←';next.textContent='→';prev.setAttribute('aria-label',label+'上一页');next.setAttribute('aria-label',label+'下一页');prev.onclick=()=>{config.page--;apply()};next.onclick=()=>{config.page++;apply()};pagerActions.append(prev,next);pager.append(pageLabel,pagerActions);wrap.after(pager);
 const mobileView=document.createElement('div');mobileView.className='mobile-table-view';const mobileSort=document.createElement('div');mobileSort.className='mobile-sort-controls';const sortLabel=document.createElement('label');sortLabel.textContent='排序栏位';const mobileSelect=document.createElement('select');mobileSelect.setAttribute('aria-label',label+'排序栏位');mobileSelect.innerHTML='<option value="-1">默认顺序</option>'+headers.map((h,i)=>`<option value="${i}">${esc(h)}</option>`).join('');sortLabel.append(mobileSelect);const mobileDirection=document.createElement('button');mobileDirection.setAttribute('aria-label',label+'切换排序方向');mobileSelect.onchange=()=>{config.sort=Number(mobileSelect.value);config.page=1;apply()};mobileDirection.onclick=()=>{config.direction*=-1;config.page=1;apply()};mobileSort.append(sortLabel,mobileDirection);const mobileList=document.createElement('div');mobileList.className='mobile-card-list';mobileView.append(mobileSort,mobileList);wrap.before(mobileView);
 const empty=document.createElement('tr');empty.innerHTML=`<td colspan="${heads.length}" class="empty">当前范围没有记录。</td>`;let ordered=[];
 function apply(){ordered=entries.slice();if(config.sort>=0)ordered.sort((a,b)=>{const x=a.cells[config.sort],y=b.cells[config.sort];if(x.empty!==y.empty)return x.empty?1:-1;const result=typeof x.sort==='number'&&typeof y.sort==='number'?x.sort-y.sort:String(x.sort).localeCompare(String(y.sort),'zh-CN',{numeric:true});return result*config.direction||a.index-b.index});const pageSize=12,pages=Math.max(1,Math.ceil(ordered.length/pageSize));config.page=Math.max(1,Math.min(config.page,pages));body.replaceChildren(...ordered.slice((config.page-1)*pageSize,config.page*pageSize).map(e=>e.row));if(!ordered.length)body.append(empty);mobileSelect.value=String(config.sort);mobileDirection.disabled=config.sort<0;mobileDirection.textContent=config.direction===1?'↑ 升序':'↓ 降序';mobileList.innerHTML=ordered.slice((config.page-1)*pageSize,config.page*pageSize).map(e=>mobileTableCard(e,headers,isMaster)).join('')||'<p class="empty">当前范围没有记录。</p>';count.textContent=`共 ${entries.length} ${isMaster?'家供应商':'条记录'}`;pageLabel.textContent=`第 ${config.page} / ${pages} 页`;prev.disabled=config.page<=1;next.disabled=config.page>=pages;heads.forEach((h,i)=>{h.setAttribute('aria-sort',config.sort===i?(config.direction===1?'ascending':'descending'):'none');const b=h.querySelector('.header-sort');b.classList.toggle('sorted',config.sort===i);b.setAttribute('aria-label',`${label}：排序${headers[i]}${config.sort===i?(config.direction===1?'，目前升序':'，目前降序'):''}`);b.innerHTML=FUNNEL_ICON+(config.sort===i?`<span class="sort-direction" aria-hidden="true">${config.direction===1?'↑':'↓'}</span>`:'')});}
 apply();
}requestAnimationFrame(syncTableScrollbars)}


function render(){refreshCalendar(false);closeSortMenu();document.querySelector('.filters').classList.toggle('hidden',!['owners','plan'].includes(state.view));drillGroups=new Map();drillIndex=0;overviewDrills.clear();const rs=base(),titles={guide:['降本看板功能说明','从整体目标到每日执行，通过四个板块逐层查看。'],suppliers:['供应商返利清单','全部供应商清单、基本资讯与谈判策略。'],overview:['采购整体谈判进展','从返利目标到已谈成果，逐层查看供应商贡献。'],owners:['负责人谈判进展','以负责的返利目标为分母，按日期追踪谈判与下一步。'],plan:['每日与每周推进进度','按目标完成时间查看任务、负责人和计划返利金额。']};$('pageTitle').textContent=titles[state.view][0];$('pageDesc').textContent=titles[state.view][1];$('scopeLabel').innerHTML=`${state.owner==='all'?'全部负责人':ownerLink(state.owner)} · ${rs.length} 家`;document.querySelectorAll('.nav button').forEach(b=>{b.classList.toggle('active',b.dataset.view===state.view);if(b.dataset.view===state.view)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});$('app').innerHTML=({guide:guideView,overview,owners:ownersView,plan:planView,suppliers:suppliersView}[state.view])(rs);enhanceTables($('app'));bindOverviewFilters();ensureActiveNavVisible();try{history.replaceState(null,'','#'+state.view)}catch{};
 if($('ledgerSearch'))$('ledgerSearch').oninput=e=>{const pos=e.target.selectionStart;state.search=e.target.value;state.page=1;render();$('ledgerSearch').focus();$('ledgerSearch').setSelectionRange(pos,pos)};
 if($('statusSelect'))$('statusSelect').onchange=e=>{state.status=e.target.value;state.page=1;render()};
 if($('sortSelect'))$('sortSelect').onchange=e=>{state.sort=e.target.value;state.page=1;render()};
 if($('periodMode'))$('periodMode').onchange=e=>{refreshCalendar(false);state.followToday=true;state.periodMode=e.target.value;state.period=state.periodMode==='week'?monday(today):today;state.page=1;render()};
 if($('periodValue'))$('periodValue').onchange=e=>{state.followToday=false;state.period=e.target.value;state.page=1;render()};
}
function exportCsv(kind){const rows=kind==='plan'?selectedPlan():listRows(base());const safe=v=>{let s=String(v??'');if(/^\s*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"'};const data=[['供应商','分类','负责人','返利目标（万元）','目标完成日',ACTUAL_DATE_LABEL,'已谈成返利（万元）','目标达成率','状态','下一步','来源','快照日'],...rows.map(r=>[r.supplier,r.substream,r.owner,num(r.targetAmount)?r.targetAmount/10000:null,r.plannedDate,r.actualDate,num(actual(r))?actual(r)/10000:null,num(achievement(r))?percent(achievement(r)):null,STATUSES[statusKey(r)],followUpText(r)||r.nextStep,r.locator,ASOF])];const url=URL.createObjectURL(new Blob(['\ufeff'+data.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`采购谈判_${ASOF}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),2000);$('toast').textContent=`已导出 ${rows.length} 条记录，空白金额保持为空。`;$('toast').classList.remove('hidden');setTimeout(()=>$('toast').classList.add('hidden'),2500)}
function closeDialogs(){closeSortMenu();document.querySelectorAll('dialog[open]').forEach(d=>d.close())}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.presentationChoice){setPresentation(b.dataset.presentationChoice,true);return}if(b.dataset.master){openMaster(b.dataset.master);return}if(b.hasAttribute('data-clear-master')){masterFocus=null;render();return}if(b.dataset.leverage){leverageDetail(b.dataset.id,b.dataset.leverage);return}if(b.dataset.close){$(b.dataset.close).close();return}if(b.dataset.detailTab){detail(detailId,b.dataset.detailTab);return}if(b.dataset.record){detail(b.dataset.record,b.dataset.tab||'profile');return}if(b.dataset.overviewDrill){overviewDrill(b.dataset.overviewDrill);return}if(b.dataset.drill){contribution(b.dataset.drill);return}if(b.dataset.export){exportCsv(b.dataset.export);return}if(b.dataset.owner){closeDialogs();state.owner=b.dataset.owner;state.view='owners';state.status='all';state.search='';state.page=1;$('ownerFilter').value=state.owner;render();window.scrollTo(0,0);return}if(b.dataset.view){closeDialogs();masterFocus=null;state.view=b.dataset.view;state.search='';state.status='all';state.page=1;render();window.scrollTo(0,0);return}if(b.dataset.status){state.status=b.dataset.status;state.search='';state.page=1;render();$('ledgerSearch')?.scrollIntoView({block:'center'});return}if(b.dataset.page){state.page+=Number(b.dataset.page);render();return}if(b.hasAttribute('data-today')){refreshCalendar(false);state.followToday=true;state.periodMode='day';state.period=today;state.search='';state.status='all';render();void syncNetworkClock()}});
for(const name of [...new Set(DATA.records.filter(r=>r.workstream==='non-BOM').map(r=>r.substream))]){const o=document.createElement('option');o.value=o.textContent=name;$('workstreamFilter').append(o)}
for(const name of [...new Set(DATA.records.map(r=>r.owner))].sort((a,b)=>a.localeCompare(b,'zh-CN'))){const o=document.createElement('option');o.value=o.textContent=name;$('ownerFilter').append(o)}
$('workstreamFilter').onchange=e=>{state.workstream=e.target.value;state.page=1;render()};$('ownerFilter').onchange=e=>{state.owner=e.target.value;state.page=1;render()};
$('resetBtn').onclick=()=>{refreshCalendar(false);tableStates.clear();masterFocus=null;categorySelection.BOM='all';categorySelection['non-BOM']='all';Object.assign(state,{workstream:'all',owner:'all',search:'',status:'all',sort:'date',page:1,periodMode:'day',period:today,followToday:true});$('workstreamFilter').value='all';$('ownerFilter').value='all';render()};
$('asofLabel').textContent=dateText(ASOF);
document.querySelectorAll('dialog').forEach(d=>d.addEventListener('click',e=>{if(e.target!==d)return;const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close()}));
$('sortMenu').onclick=e=>{const button=e.target.closest('[data-sort-choice]');if(!button)return;sortMenuAction?.(Number(button.dataset.sortChoice));const trigger=sortMenuTrigger;closeSortMenu();trigger?.focus({preventScroll:true})};
$('sortMenu').addEventListener('toggle',e=>{if(e.newState==='closed')sortMenuTrigger?.setAttribute('aria-expanded','false')});
window.addEventListener('resize',closeSortMenu);
document.addEventListener('scroll',()=>{if(!sortMenuAnchor||!sortMenuTrigger||!$('sortMenu').matches(':popover-open'))return;const rect=sortMenuTrigger.getBoundingClientRect();if(Math.abs(rect.left-sortMenuAnchor.left)>2||Math.abs(rect.top-sortMenuAnchor.top)>2)closeSortMenu()},true);
setPresentation(presentationPreference||(presentationMedia.matches?'mobile':'browser'));
render();

// Keep an open tab current across midnight and after the device resumes.
setInterval(()=>refreshCalendar(),30000);
setInterval(()=>{if(!document.hidden)void syncNetworkClock()},60*60*1000);
window.addEventListener('focus',resumeCalendar);
window.addEventListener('online',()=>{refreshCalendar();void syncNetworkClock()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)resumeCalendar()});
void syncNetworkClock();
