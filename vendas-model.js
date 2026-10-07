'use strict';
window.SalesModel=(()=>{
const day=t=>{if(!t||isNaN(new Date(t)))return '';const p=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-');};
const prev=k=>new Date(Date.UTC(+k.slice(0,4),+k.slice(5)-2,1)).toISOString().slice(0,7),sum=rs=>rs.reduce((a,r)=>a+Number(r.amount||0),0),change=(a,b)=>b>0?a/b-1:null;

const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
function channel(d){
 if(!d.attribution_synced_at)return 'Aguardando rastreamento';
 const source=norm(d.utm_source),medium=norm(d.utm_medium);
 const paid=/^(cpc|ppc|cpm|paid|paid[_ -]?(social|search)|social[_ -]?paid|display)$/.test(medium);
 const meta=/^(meta|meta_ads|facebook_ads|facebook|fb|instagram|ig|facebook\.com|instagram\.com|m\.facebook\.com|l\.facebook\.com)$/.test(source);
 const google=/^(google|googleads|google_ads|adwords|google\.com|google\.com\.br)$/.test(source);
 if(/^(organic|organico|organic[_ -]?(search|social))$/.test(medium))return 'Orgânico';
 if(meta)return paid||/^(meta_ads|facebook_ads)$/.test(source)?'Meta Ads':'Meta · mídia não identificada';
 if(google)return paid||/^(googleads|google_ads|adwords)$/.test(source)?'Google Ads':'Google · mídia não identificada';
 if(source==='chatgpt.com'||source==='chatgpt')return 'ChatGPT';
 if(['RECOMMENDATION','4'].includes(d.source_id))return 'Indicação';
 if(source)return 'Outros canais rastreados';
 return 'Não identificado';
}

function calc(data,key,now=new Date()){
const today=day(now),deals=data.deals.filter(d=>String(d.pipeline_id)==='0'),wm=new Map(data.wins.map(w=>[String(w.deal_id),w]));
const won=deals.filter(d=>d.status==='won'&&d.currency==='BRL').map(d=>{const w=wm.get(String(d.bitrix_id));return {...d,date:day(w?.won_at),owner:w?.owner_verified&&w.owner_at_win_id!=null?String(w.owner_at_win_id):null};}).filter(d=>d.date);
const month=k=>won.filter(d=>d.date.startsWith(k)),current=month(key),previous=prev(key),prior=month(previous),total=sum(current),priorTotal=sum(prior),sameTotal=sum(prior.filter(d=>+d.date.slice(8)<=+today.slice(8)));
const ids=[...new Set([...deals.map(d=>d.current_owner_id),...won.map(d=>d.owner)].filter(x=>x!=null).map(String))];
const sellers=ids.map(id=>({id,name:data.users.find(u=>String(u.bitrix_id)===id)?.display_name||'Vendedor '+id,amount:sum(current.filter(d=>d.owner===id))})).sort((a,b)=>b.amount-a.amount||a.name.localeCompare(b.name));
const monthlyDeals=deals.filter(d=>day(d.created_at_bitrix).startsWith(key)),open=monthlyDeals.filter(d=>d.status==='open');
const groups=[
{stage_name:'Novo lead',ids:['NEW','PREPARATION','PREPAYMENT_INVOICE','EXECUTING']},
{stage_name:'Contato realizado',ids:['FINAL_INVOICE','UC_VIJU3P']},
{stage_name:'Follow-up',ids:['UC_XWNJ6W','UC_A0KX4J','UC_NQR30F']}
];
const stages=groups.map(g=>({stage_name:g.stage_name,count:open.filter(d=>g.ids.includes(d.stage_id)).length}));
stages.push({stage_name:'Ganho',count:monthlyDeals.filter(d=>d.status==='won').length});
const lost=monthlyDeals.filter(d=>d.status==='lost').length,other=open.filter(d=>!groups.some(g=>g.ids.includes(d.stage_id))).length;
const leads=deals.filter(d=>day(d.created_at_bitrix).startsWith(key)),origin=new Map();for(const d of leads){const id=channel(d);if(!origin.has(id))origin.set(id,{id,name:id,count:0});origin.get(id).count++;}
return {key,today,previous,total,priorTotal,sameTotal,currentMonth:key===today.slice(0,7),delta:change(total,priorTotal),sameDelta:change(total,sameTotal),yearTotal:sum(won.filter(d=>d.date.startsWith(key.slice(0,4)))),sellers,pending:sum(current.filter(d=>!d.owner)),zero:current.filter(d=>Number(d.amount)===0).length,stages,lost,other,open:open.length,leads:leads.length,origins:[...origin.values()].sort((a,b)=>b.count-a.count),months:Array.from({length:12},(_,i)=>{const k=key.slice(0,4)+'-'+String(i+1).padStart(2,'0');return {key:k,total:sum(month(k)),future:k>today.slice(0,7)};})};
}
return {day,prev,calc,channel};
})();