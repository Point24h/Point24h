(()=>{'use strict';
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}),percent=n=>n==null?'Sem base':(n>0?'+':'')+(n*100).toFixed(1).replace('.',',')+'%';
const title=k=>new Date(+k.slice(0,4),+k.slice(5)-1,1).toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
const colors=['#45e3f2','#81db8b','#ffca70','#9e9aff','#fc8eae','#5da6ff','#f3ed90','#dc91fa','#35b89b'];

let data=null,client=null,busy=false,started=false,message='Carregando vendas…';
let month=SalesModel.day(new Date()).slice(0,7);
const emit=()=>window.dispatchEvent(new Event('point-commercial-update'));
const request=(path,options={})=>client.request(path,{...options,signal:AbortSignal.timeout(90000)});
async function rows(table,fields,order,filter=''){
 const all=[];for(let n=0;;n+=1000){const rs=await request('/rest/v1/'+table+'?select='+fields+'&order='+order+'&limit=1000&offset='+n+filter);all.push(...rs);if(rs.length<1000)return all;}
}
async function loadData(){
 const [deals,wins,stages,users,sources]=await Promise.all([
 rows('crm_deals','bitrix_id,pipeline_id,status,stage_id,amount,currency,current_owner_id,source_id,utm_source,utm_medium,attribution_synced_at,created_at_bitrix,synced_at','bitrix_id','&pipeline_id=eq.0'),
 rows('crm_wins','deal_id,won_at,owner_at_win_id,owner_verified','deal_id'),
 rows('crm_stages','stage_id,stage_name,sort_order','sort_order','&pipeline_id=eq.0'),
 rows('crm_users','bitrix_id,display_name','bitrix_id'),
 rows('crm_sources','source_id,source_name','source_id')]);
 data={deals,wins,stages,users,sources};
}

function kpi(label,value,note=''){return '<div class="kpi"><label>'+esc(label)+'</label><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></div>';}
function donut(m){
 const parts=m.sellers.filter(s=>s.amount>0).map((s,i)=>({...s,color:colors[i%colors.length]}));if(m.pending>0)parts.push({name:'Sem responsável no Bitrix',amount:m.pending,color:'#8b98a8'});
 let a=0;const stops=parts.map(s=>{const b=a+s.amount/Math.max(1,m.total)*100,x=s.color+' '+a+'% '+b+'%';a=b;return x;});
 return '<div class="donut" role="img" aria-label="Distribuição do faturamento por vendedor" style="background:'+(stops.length?'conic-gradient('+stops.join(',')+')':'#3c5068')+'"><span>Contratos ganhos<strong>'+money(m.total)+'</strong></span></div><div class="legend">'+parts.map(s=>'<div><i style="background:'+s.color+'"></i><span>'+esc(s.name)+'</span><b>'+(s.amount/Math.max(1,m.total)*100).toFixed(1)+'%</b></div>').join('')+(parts.length?'':'Sem faturamento neste mês.')+'</div>';
}
function first(m){
 const funnel=m.stages.map((s,i)=>'<div class="stage" style="width:'+Math.max(54,100-i*4)+'%"><span>'+esc(s.stage_name)+'</span><b>'+s.count+'</b></div>').join('');
 let ranked=0;const sellers=m.sellers.map(s=>{const badge=s.amount>0?(['🥇','🥈','🥉'][ranked]||String(ranked+1)):'—';if(s.amount>0)ranked++;return '<tr><td>'+badge+' '+esc(s.name)+'</td><td>'+money(s.amount)+'</td></tr>';}).join('');
 return '<h1>COMERCIAL POINT24H</h1><p class="sub">'+esc(title(m.key))+'</p><div class="kpis">'+kpi('Vendas',money(m.total))+kpi('Comparação com mês anterior',percent(m.delta),title(m.previous)+' completo: '+money(m.priorTotal))+kpi('Leads que entraram',m.leads,'Criados no mês selecionado · categoria 0')+'</div><div class="commercial"><div class="panel"><h2>Funil Comercial</h2><p class="sub">Etapa atual dos leads criados no mês</p><div class="funnel">'+funnel+'</div><p class="footnote">Novo lead inclui tentativas; contato inclui reunião; follow-up inclui quente e contrato. '+m.lost+' perdidos'+(m.other?' · '+m.other+' em outras etapas':'')+'.</p></div><div class="panel"><h2>Participação por vendedor</h2>'+donut(m)+'</div><div class="panel"><h2>Ranking de vendedores</h2><p class="sub">Responsável pelo negócio · mês selecionado</p><table class="sellers"><thead><tr><th>Vendedor</th><th>Contratos</th></tr></thead><tbody>'+sellers+(m.pending?'<tr><td>Sem responsável no Bitrix</td><td>'+money(m.pending)+'</td></tr>':'')+'</tbody><tfoot><tr><td><strong>Total de vendas</strong></td><td><strong>'+money(m.total)+'</strong></td></tr></tfoot></table>'+(m.pending?'<p class="footnote">'+money(m.pending)+' em negócios sem responsável cadastrado.</p>':'')+'</div></div><p class="footnote">Faturamento comercial = valor atual dos contratos em ganho. '+m.zero+' negócios ganhos no mês estão com valor zero. Vendas usa o mês do fechamento; o funil usa o mês de entrada dos leads.</p>';
}
function second(m){
 const max=Math.max(1,...m.months.map(x=>x.total));
 const chart=m.months.map((v,i)=>'<div class="col '+(v.key===m.key?'selected ':'')+(v.future?'future':'')+'"><span>'+(!v.future?(v.total/1000).toLocaleString('pt-BR',{maximumFractionDigits:1})+' mil':'—')+'</span><div class="track"><i style="height:'+(v.future?0:v.total/max*100)+'%"></i></div><label>'+['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][i]+'</label></div>').join('');
 const pendingNames=['Não identificado','Aguardando rastreamento'],known=m.origins.filter(s=>!pendingNames.includes(s.id)),unknown=m.origins.filter(s=>pendingNames.includes(s.id)),sources=known.slice(0,5);
 if(known.length>5)sources.push({name:'Outras origens',count:known.slice(5).reduce((a,s)=>a+s.count,0)});sources.push(...unknown);
 return '<h1>COMERCIAL POINT24H</h1><p class="sub">Evolução e origens · '+esc(title(m.key))+'</p><div class="kpis">'+kpi('Acumulado no ano',money(m.yearTotal),'Contratos ganhos cadastrados no Bitrix')+kpi(title(m.key),money(m.total),(m.currentMonth?'Mês em andamento':'Mês selecionado'))+kpi(m.currentMonth?'Comparação até o dia '+m.today.slice(8):'Comparação com mês anterior',percent(m.currentMonth?m.sameDelta:m.delta),title(m.previous)+': '+money(m.currentMonth?m.sameTotal:m.priorTotal))+'</div><div class="history"><div class="panel"><h2>Faturamento mês a mês</h2><p class="sub">Valores em R$ mil · mês selecionado em destaque</p><div class="columns">'+chart+'</div><p class="footnote">Meses sem contratos na base aparecem com zero; meses futuros com —. O mês atual é parcial.</p></div><div class="panel"><h2>Leads por canal</h2><p class="sub">'+m.leads+' negócios criados em '+esc(title(m.key))+'</p>'+sources.map(s=>'<div class="origin"><span>'+esc(s.name)+'</span><b>'+s.count+'</b><i style="width:'+(s.count/Math.max(1,m.leads)*100)+'%"></i></div>').join('')+(sources.length?'':'<p class="footnote">Nenhum negócio criado neste mês na base disponível.</p>')+'<p class="footnote">Classificação por rastreamento UTM. Sem evidência do canal, o lead fica como não identificado; ausência de UTM não significa orgânico.</p></div></div>';
}

async function update(){
 if(busy||!client)return;busy=true;message='Atualizando vendas do Bitrix…';emit();
 try{
 if(!client.getSession())throw Error('Entre novamente no painel.');
 if(client.getSession().expires_at*1000<Date.now()+120000 && !await client.refresh())throw Error('Não foi possível renovar a sessão.');
 if(!data){await loadData();emit();}
 if(String(client.getSession().user.email).toLowerCase()==='admin@point24h.com.br'){
 let cursor=0;
 for(;;){
 const r=await request('/functions/v1/bitrix-sales-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({cursor})});
 if(!Number.isSafeInteger(r.nextCursor)||(!r.complete&&r.nextCursor<=cursor))throw Error('Paginação interrompida');
 cursor=r.nextCursor;if(r.complete)break;
 }
 }
 await loadData();
 const stamp=data.deals.map(d=>d.synced_at).filter(Boolean).sort().at(-1);
 message='CRM · Dados: '+(stamp?new Date(stamp).toLocaleString('pt-BR'):'sem carga')+' · Atualização a cada 5 min';
 }catch(e){message='CRM · Falha ao atualizar: '+e.message+(data?' · Últimos dados preservados':'');}
 finally{busy=false;emit();}
}
window.PointCommercial={
 start(config){if(started)return;started=true;client=config;update();setInterval(update,300000);},
 getMonth:()=>month,
 setMonth(value){if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value)){month=value;emit();}},
 status:()=>message,
 screen(index){
 const content=data?(index===0?first(SalesModel.calc(data,month)):second(SalesModel.calc(data,month))):'<h1>COMERCIAL POINT24H</h1><div class="panel"><p>'+esc(message)+'</p></div>';
 return '<div class="commercial-slide">'+content+'</div>';
 }
};
})();