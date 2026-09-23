'use strict';
// This key is publishable. No Bitrix or privileged database key belongs in the browser.
const API='https://ymezdvuxwtvikhywrugp.supabase.co';
const KEY='sb_publishable_u29un2hEjw8B2D5Xry5Z5g_uboqLzp2';
const sessionKey='point_dashboard_session';
let session=null;
const status=document.querySelector('#login-status');
function say(message){status.textContent=message;}
async function request(path,options={}){
  const headers={apikey:KEY,...options.headers};
  if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
  const response=await fetch(API+path,{...options,headers,cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(payload?.msg||payload?.message||payload?.error_description||'Falha de comunicação');
  return payload;
}
function saveSession(value){session=value;sessionStorage.setItem(sessionKey,JSON.stringify(value));}
async function refresh(){
  if(!session?.refresh_token)return false;
  try{const next=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});saveSession(next);return true;}catch{return false;}
}
async function getRows(table,select){
  const all=[];
  for(let offset=0;;offset+=1000){
    const rows=await request(`/rest/v1/${table}?select=${encodeURIComponent(select)}&limit=1000&offset=${offset}`);
    all.push(...rows);
    if(rows.length<1000)break;
  }
  return all;
}
async function loadDashboard(){
  const headers={Authorization:'Bearer '+session.access_token};
  const membership=await request(`/rest/v1/dashboard_members?select=active&user_id=eq.${encodeURIComponent(session.user.id)}`,{headers});
  if(!membership.some(r=>r.active))throw new Error('Este e-mail ainda não está autorizado ou confirmado.');
  const [periods,pdvs,terminals,sales,products]=await Promise.all([
    getRows('reporting_periods','id,starts_on,ends_on'),
    getRows('pdvs','id,name,city,state,status,business_model,quantity,quantity_unit,apartments,social_class,opened_on,closed_on,contract_on,expected_opening_on,included'),
    getRows('terminals','point_id,pdv_id,name_in_sales'),
    getRows('terminal_sales','period_id,point_id,revenue,source_file'),
    getRows('product_sales','period_id,product_id,barcode,name,category,quantity,revenue,source_file')
  ]);
  const byPeriod=new Map(periods.map(r=>[r.id,{key:r.id,year:Number(r.starts_on.slice(0,4)),month:Number(r.starts_on.slice(5,7)),half:r.starts_on.slice(8,10)==='01'?1:2,points:[],products:[],sources:[]}]));
  const terminalMap=new Map(terminals.map(t=>[t.point_id,t]));
  for(const r of sales){const t=terminalMap.get(r.point_id);const pdv=pdvs.find(p=>p.id===t?.pdv_id);const p=byPeriod.get(r.period_id);if(!p)continue;p.points.push({point:r.point_id,name:t?.name_in_sales||pdv?.name||'PDV '+r.point_id,city:pdv?.city||'',revenue:Number(r.revenue)});if(!p.sources.includes(r.source_file))p.sources.push(r.source_file);}
  for(const r of products){const p=byPeriod.get(r.period_id);if(!p)continue;p.products.push({id:r.product_id,code:r.barcode,name:r.name,category:r.category,quantity:Number(r.quantity),revenue:Number(r.revenue)});if(!p.sources.includes(r.source_file))p.sources.push(r.source_file);}
  const registry=pdvs.map(r=>({pdv_id:r.id,name:r.name,nome:r.name,city:r.city,uf:r.state,kind:r.business_model,status:r.status,quantity:r.quantity,quantityUnit:r.quantity_unit,apartamentos:r.apartments,classe_social:r.social_class,inauguracao:r.opened_on,encerramento:r.closed_on,contractDate:r.contract_on,expectedOpening:r.expected_opening_on,include:r.included}));
  window.POINT_DATA={updated:new Date().toISOString(),periods:[...byPeriod.values()],registry,control:registry,terminals:terminals.filter(r=>r.pdv_id).map(r=>({ponto:r.point_id,pdv_id:r.pdv_id})),unmatchedSales:[...new Set(terminals.filter(r=>!r.pdv_id).map(r=>r.name_in_sales).filter(Boolean))]};
  document.body.classList.remove('locked');
  document.querySelector('#view').replaceChildren();
  const script=document.createElement('script');script.src='app.js';document.body.append(script);
}
document.querySelector('#login-form').addEventListener('submit',async e=>{
  e.preventDefault();say('Entrando…');
  const email=document.querySelector('#email').value.trim(),password=document.querySelector('#password').value;
  try{
    const next=await request('/auth/v1/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password})});
    document.querySelector('#password').value='';saveSession(next);await loadDashboard();
  }catch(error){say(error.message);session=null;sessionStorage.removeItem(sessionKey);}
});
document.querySelector('#logout').addEventListener('click',()=>{sessionStorage.removeItem(sessionKey);location.reload();});
setInterval(async()=>{if(session&&!(await refresh())){sessionStorage.removeItem(sessionKey);location.reload();}},30*60*1000);
try{session=JSON.parse(sessionStorage.getItem(sessionKey)||'null');}catch{session=null;}
if(session)refresh().then(ok=>ok?loadDashboard().catch(e=>say(e.message)):sessionStorage.removeItem(sessionKey));
