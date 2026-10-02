const cors={"access-control-allow-origin":"*","access-control-allow-headers":"authorization,apikey,content-type","access-control-allow-methods":"POST,OPTIONS"};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({error:"method_not_allowed"},405);
  const authorization=req.headers.get("authorization")||"";
  if(!authorization.startsWith("Bearer "))return json({error:"unauthorized"},401);
  const api=Deno.env.get("SUPABASE_URL"),anon=Deno.env.get("SUPABASE_ANON_KEY"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!api||!anon||!service)return json({error:"server_configuration"},503);
  const who=await fetch(api+"/auth/v1/user",{headers:{apikey:anon,Authorization:authorization}});
  if(!who.ok)return json({error:"unauthorized"},401);
  const user=await who.json();
  const member=await fetch(api+"/rest/v1/dashboard_members?select=active&user_id=eq."+encodeURIComponent(user.id),{headers:{apikey:anon,Authorization:authorization}});
  if(!member.ok||!(await member.json()).some(r=>r.active)||String(user.email||"").toLowerCase()!=="admin@point24h.com.br")return json({error:"forbidden"},403);
  let payload={};
  try{payload=await req.json();}catch{return json({error:"invalid_json"},400);}
  const cursor=Number(payload.cursor??0);
  if(!Number.isSafeInteger(cursor)||cursor<0)return json({error:"invalid_cursor"},400);
  const hook=Deno.env.get("BITRIX_WEBHOOK_URL");
  const match=hook?.match(/^(https:\/\/[^/]+\/rest\/\d+\/[^/]+\/)/i);
  if(!match)return json({error:"bitrix_webhook_not_configured"},503);
  const base=match[1];
  async function call(method,params={}){
    try{
      const response=await fetch(base+method+".json",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(params)});
      const body=await response.json();
      if(!response.ok||body.error)throw new Error(String(body.error||response.status)+": "+String(body.error_description||"").slice(0,120));
      return body;
    }catch(error){throw new Error(method+": "+String(error).replace(/https?:\/\/[^\s"']+/g,"[endpoint]").slice(0,180));}
  }
  async function upsert(table,rows,key,ignore=false){
    if(!rows.length)return;
    const response=await fetch(api+"/rest/v1/"+table+"?on_conflict="+encodeURIComponent(key),{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"content-type":"application/json",Prefer:(ignore?"resolution=ignore-duplicates":"resolution=merge-duplicates")+",return=minimal"},body:JSON.stringify(rows)});
    if(!response.ok)throw new Error(table+" upsert HTTP "+response.status+": "+(await response.text()).slice(0,240));
  }
  try{
    const now=new Date().toISOString();
    const stageResponse=await call("crm.status.list",{filter:{ENTITY_ID:"DEAL_STAGE"},order:{SORT:"ASC"}});
    const stageItems=Array.isArray(stageResponse.result)?stageResponse.result:[];
    const semantic=s=>({success:"S",process:"P",failure:"F",S:"S",P:"P",F:"F"}[s]||"P");
    const stages=stageItems.map(r=>({stage_id:String(r.STATUS_ID),pipeline_id:"0",stage_name:String(r.NAME||r.STATUS_ID),semantic:semantic(r.EXTRA?.SEMANTICS||r.SEMANTICS||"process"),sort_order:Number(r.SORT)||0,synced_at:now}));
    await upsert("crm_stages",stages,"stage_id");
    const stageMap=Object.fromEntries(stages.map(r=>[r.stage_id,r.semantic]));
    if(cursor===0){
      const sourcesResponse=await call("crm.status.list",{filter:{ENTITY_ID:"SOURCE"}});
      await upsert("crm_sources",(Array.isArray(sourcesResponse.result)?sourcesResponse.result:[]).map(r=>({source_id:String(r.STATUS_ID),source_name:String(r.NAME||r.STATUS_ID),synced_at:now})),"source_id");
      const users=[];let start=0;
      for(let i=0;i<20;i++){
        const result=await call("user.get",{select:["ID","NAME","LAST_NAME","ACTIVE"],start});
        users.push(...(Array.isArray(result.result)?result.result:[]));
        if(result.next==null)break;
        start=Number(result.next);
      }
      await upsert("crm_users",users.map(u=>({bitrix_id:Number(u.ID),display_name:[u.NAME,u.LAST_NAME].filter(Boolean).join(" ").trim()||"Usuário "+u.ID,active:u.ACTIVE===true||u.ACTIVE==="Y",synced_at:now})),"bitrix_id");
    }
    let total=null;
    if(cursor===0){
      const first=await call("crm.deal.list",{filter:{CATEGORY_ID:0},order:{ID:"DESC"},select:["ID"],start:0});
      total=first.total??null;
    }
    let lastId=cursor,pages=0,complete=false;
    const deals=[],wins=[];
    for(let i=0;i<8;i++){
      const response=await call("crm.deal.list",{filter:{CATEGORY_ID:0,">ID":lastId},order:{ID:"ASC"},select:["ID","CATEGORY_ID","STAGE_ID","STAGE_SEMANTIC_ID","OPPORTUNITY","CURRENCY_ID","ASSIGNED_BY_ID","SOURCE_ID","DATE_CREATE","DATE_MODIFY","MOVED_TIME"],start:-1});
      const rows=Array.isArray(response.result)?response.result:[];
      const before=lastId;
      for(const r of rows){
        const id=Number(r.ID);if(!Number.isSafeInteger(id)||id<=0)continue;
        lastId=Math.max(lastId,id);
        if(Number(r.CATEGORY_ID)!==0)continue;
        const stage=String(r.STAGE_ID||"");
        const amount=Number(r.OPPORTUNITY);
        const value=Number.isFinite(amount)?amount:null;
        const owner=Number(r.ASSIGNED_BY_ID);
        const ownerId=Number.isSafeInteger(owner)&&owner>0?owner:null;
        const sem=r.STAGE_SEMANTIC_ID||stageMap[stage];
        if(!["P","S","F"].includes(sem))throw new Error("unknown_stage_semantics");
        const status=sem==="S"?"won":sem==="F"?"lost":"open";
        deals.push({bitrix_id:id,pipeline_id:"0",stage_id:stage,status,amount:value,currency:r.CURRENCY_ID||"BRL",current_owner_id:ownerId,source_id:r.SOURCE_ID||null,created_at_bitrix:r.DATE_CREATE,updated_at_bitrix:r.DATE_MODIFY||null,last_activity_at:r.MOVED_TIME||null,synced_at:now});
        if(status==="won")wins.push({deal_id:id,won_at:r.MOVED_TIME||r.DATE_MODIFY||r.DATE_CREATE,owner_at_win_id:null,amount_at_win:value??0,currency:r.CURRENCY_ID||"BRL",evidence_source:"bitrix_current_state_backfill",owner_verified:false});
      }
      pages++;
      if(rows.length<50){complete=true;break;}
      if(lastId<=before)throw new Error("pagination_not_advancing");
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    await upsert("crm_deals",deals,"bitrix_id");
    await upsert("crm_wins",wins,"deal_id",true);
    const summary={pipelineId:0,cursor,nextCursor:lastId,loaded:deals.length,winsSeen:wins.length,pages,complete,reportedTotal:total};
    console.log("POINT_BITRIX_SYNC",JSON.stringify(summary));
    return json(summary);
  }catch(error){console.error("POINT_BITRIX_SYNC_ERROR",String(error).slice(0,350));return json({error:"sync_failed",detail:String(error).slice(0,250)},502);}
});
