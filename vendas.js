'use strict';
const API='https://ymezdvuxwtvikhywrugp.supabase.co',KEY='sb_publishable_u29un2hEjw8B2D5Xry5Z5g_uboqLzp2',SK='point_dashboard_session';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),percent=n=>n==null?'Sem base':(n>0?'+':'')+(n*100).toFixed(1).replace('.',',')+'%';
const title=k=>new Date(+k.slice(0,4),+k.slice(5)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const colors=['#45e3f2','#81db8b','#ffca70','#9e9aff','#fc8eae','#5da6ff','#f3ed90','#dc91fa','#35b89b'];
let session,data,page=0,paused=false,elapsed=0,busy=false,refreshPromise=null;
$('#month').value=SalesModel.day(new Date()).slice(0,7);$('#month').max=$('#month').value;
async function refresh(){
 if(refreshPromise)return refreshPromise;
 refreshPromise=(async()=>{try{session=JSON.parse(localStorage.getItem(SK)||'null');}catch{}
 if(!session?.refresh_token)throw Error('Entre no painel da rede e depois abra Vendas.');
 const r=await fetch(API+'/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{apikey:KEY,'content-type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token}),signal:AbortSignal.timeout(30000)});
 if(!r.ok)throw Error('Entre novamente no painel da rede.');session=await r.json();localStorage.setItem(SK,JSON.stringify(session));})().finally(()=>{refreshPromise=null;});
 return refreshPromise;
}
async function request(path,options={}){
 if(!session||session.expires_at*1000<Date.now()+60000)await refresh();
 const r=await fetch(API+path,{...options,headers:{apikey:KEY,Authorization:'Bearer '+session.access_token,...options.headers},cache:'no-store',signal:AbortSignal.timeout(90000)});
 const body=await r.json().catch(()=>null);if(!r.ok)throw Error(body?.detail||body?.message||body?.error||'Falha HTTP '+r.status);return body;
}
async function rows(table,fields,order,filter=''){
 const all=[];for(let n=0;;n+=1000){const rs=await request('/rest/v1/'+table+'?select='+fields+'&order='+order+'&limit=1000&offset='+n+filter);all.push(...rs);if(rs.length<1000)return all;}
}
async function load(){
 const [deals,wins,stages,users,sources]=await Promise.all([
 rows('crm_deals','bitrix_id,pipeline_id,status,stage_id,amount,currency,current_owner_id,source_id,created_at_bitrix,synced_at','bitrix_id','&pipeline_id=eq.0'),
 rows('crm_wins','deal_id,won_at,owner_at_win_id,owner_verified','deal_id'),
 rows('crm_stages','stage_id,stage_name,sort_order','sort_order','&pipeline_id=eq.0'),
 rows('crm_users','bitrix_id,display_name','bitrix_id'),
 rows('crm_sources','source_id,source_name','source_id')]);
 data={deals,wins,stages,users,sources};render();
}
function kpi(label,value,note=''){return '<div class="kpi"><label>'+esc(label)+'</label><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';}
function donut(m){
 const parts=m.sellers.filter(s=>s.amount>0).map((s,i)=>({...s,color:colors[i%colors.length]}));if(m.pending>0)parts.push({name:'Responsável a confirmar',amount:m.pending,color:'#8b98a8'});
 let a=0;const stops=parts.map(s=>{const b=a+s.amount/Math.max(1,m.total)*100,x=s.color+' '+a+'% '+b+'%';a=b;return x;});
 return '<div class="donut" role="img" aria-label="Distribuição do faturamento por vendedor" style="background:'+(stops.length?'conic-gradient('+stops.join(',')+')':'#3c5068')+'"><span>Contratos ganhos<strong>'+money(m.total)+'</strong></span></div><div class="legend">'+parts.map(s=>'<div><i style="background:'+s.color+'"></i><span>'+esc(s.name)+'</span><b>'+(s.amount/Math.max(1,m.total)*100).toFixed(1)+'%</b></div>').join('')+(parts.length?'':'Sem faturamento neste mês.')+'</div>';
}
function first(m){
 const funnel=m.stages.map((s,i)=>'<div class="stage" style="width:'+Math.max(54,100-i*4)+'%"><span>'+esc(s.stage_name)+'</span><b>'+s.count+'</b></div>').join('');
 let ranked=0;const sellers=m.sellers.map(s=>{const badge=s.amount>0?(['🥇','🥈','🥉'][ranked]||String(ranked+1)):'—';if(s.amount>0)ranked++;return '<tr><td>'+badge+' '+esc(s.name)+'</td><td>'+money(s.amount)+'</td></tr>';}).join('');
 return '<div class="eyebrow">Comercial · Pipeline 0</div><h1>Vendas · '+esc(title(m.key))+'</h1><div class="kpis">'+kpi('Faturamento contratado',money(m.total),'Valor dos negócios ganhos · BRL')+kpi('Comparação com mês anterior',percent(m.delta),title(m.previous)+' completo: '+money(m.priorTotal))+kpi('Negócios em andamento',m.open,'Carteira atual · todos os meses')+'</div><div class="commercial"><div class="panel"><h2>Funil de vendas</h2><p class="sub">Negócios atualmente em cada etapa</p><div class="funnel">'+funnel+'</div><p class="footnote">Larguras representam a sequência das etapas; os números mostram o volume atual.</p></div><div class="panel"><h2>Participação por vendedor</h2>'+donut(m)+'</div><div class="panel"><h2>Ranking de vendedores</h2><p class="sub">Responsável no fechamento · mês selecionado</p><table class="sellers"><thead><tr><th>Vendedor</th><th>Contratos</th></tr></thead><tbody>'+sellers+'</tbody></table>'+(m.pending?'<p class="footnote">'+money(m.pending)+' aguardando confirmação de responsável.</p>':'')+'</div></div><p class="footnote">Faturamento comercial = valor atual dos contratos em ganho. '+m.zero+' negócios ganhos no mês estão com valor zero. Medalhas somente para vendedores com faturamento.</p>';
}
function second(m){
 const max=Math.max(1,...m.months.map(x=>x.total));
 const chart=m.months.map((v,i)=>'<div class="col '+(v.key===m.key?'selected ':'')+(v.future?'future':'')+'"><span>'+(!v.future?(v.total/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':'—')+'</span><div class="track"><i style="height:'+(v.future?0:v.total/max*100)+'%"></i></div><label>'+['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i]+'</label></div>').join('');
 const known=m.origins.filter(s=>s.id),unknown=m.origins.find(s=>!s.id),sources=known.slice(0,5);
 if(known.length>5)sources.push({name:'Outras origens',count:known.slice(5).reduce((a,s)=>a+s.count,0)});if(unknown)sources.push(unknown);
 return '<div class="eyebrow">Comercial · Evolução</div><h1>Faturamento e origem · '+esc(m.key.slice(0,4))+'</h1><div class="kpis">'+kpi('Acumulado no ano',money(m.yearTotal),'Contratos ganhos cadastrados no Bitrix')+kpi(title(m.key),money(m.total),(m.currentMonth?'Mês em andamento':'Mês selecionado'))+kpi(m.currentMonth?'Comparação até o dia '+m.today.slice(8):'Comparação com mês anterior',percent(m.currentMonth?m.sameDelta:m.delta),title(m.previous)+': '+money(m.currentMonth?m.sameTotal:m.priorTotal))+'</div><div class="history"><div class="panel"><h2>Faturamento mês a mês</h2><p class="sub">Valores em R$ mil · mês selecionado em destaque</p><div class="columns">'+chart+'</div><p class="footnote">Meses sem contratos na base aparecem com zero; meses futuros com —. O mês atual é parcial.</p></div><div class="panel"><h2>Leads por origem</h2><p class="sub">'+m.leads+' negócios criados em '+esc(title(m.key))+'</p>'+sources.map(s=>'<div class="origin"><span>'+esc(s.name)+'</span><b>'+s.count+'</b><i style="width:'+(s.count/Math.max(1,m.leads)*100)+'%"></i></div>').join('')+(sources.length?'':'<p class="footnote">Nenhum negócio criado neste mês na base disponível.</p>')+'<p class="footnote">Origem informada no negócio. “Sem origem” permanece visível.</p></div></div>';
}
function render(){
 if(!data)return;const m=SalesModel.calc(data,$('#month').value);
 $('#view').innerHTML='<section class="slide-flow">'+(page===0?first(m):second(m))+'</section>';$('#screen').value=page;$('#page').textContent=(page+1)+' / 2';PointTV.fit();
}
async function update(){
 if(busy)return;busy=true;$('#status').textContent='Atualizando vendas do Bitrix…';
 try{
 await refresh();
 if(String(session.user.email).toLowerCase()==='admin@point24h.com.br'){
 let cursor=0;
 for(;;){const r=await request('/functions/v1/bitrix-sales-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cursor})});
 if(!Number.isSafeInteger(r.nextCursor)||(!r.complete&&r.nextCursor<=cursor))throw Error('Paginação interrompida');cursor=r.nextCursor;if(r.complete)break;
 }
 }
 await load();
 const stamp=data.deals.map(d=>d.synced_at).sort().at(-1);
 $('#status').textContent='Dados: '+(stamp?new Date(stamp).toLocaleString('pt-BR'):'sem carga')+' · Nova consulta em 5 min'+(session.user.email.toLowerCase()==='admin@point24h.com.br'?'':' · Somente leitura');
 }catch(e){$('#status').textContent='Atualização falhou: '+e.message+' · Últimos dados preservados';if(!data){$('#view').innerHTML='<section class="slide-flow"><h1>Acesso às vendas</h1><p>'+esc(e.message)+'</p><a href="index.html">Entrar no painel</a></section>';PointTV.fit();}}
 finally{busy=false;}
}
function move(){page=1-page;elapsed=0;render();}
$('#next').onclick=move;$('#prev').onclick=move;$('#screen').onchange=e=>{page=Number(e.target.value);elapsed=0;render();};$('#month').onchange=()=>{if(/^\d{4}-\d{2}$/.test($('#month').value))render();};
$('#pause').onclick=()=>{paused=!paused;$('#pause').textContent=paused?'Retomar':'Pausar';};$('#full').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#full').textContent='Use F11';}};
window.addEventListener('resize',()=>PointTV.fit());
PointTV.init();
setInterval(()=>{if(!data||paused)return;elapsed+=.25;if(elapsed>=30)move();$('#progress').style.width=elapsed/30*100+'%';},250);
setInterval(update,300000);
(async()=>{try{await refresh();await load();}catch{}await update();})();
