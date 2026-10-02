'use strict';
window.PointTV=(()=>{
 let frame;
 const view=()=>document.querySelector('#view');
 function area(){const el=view(),css=getComputedStyle(el);return {width:Math.max(1,el.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight)),height:Math.max(1,el.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom))};}
 function rows(){const a=area();return Math.max(3,Math.min(10,Math.floor((a.height-230)/(a.width<1100?62:58))));}
 function fit(){cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{
  const el=view()?.querySelector('.slide-flow');if(!el)return;
  const a=area();el.style.transform='none';el.style.width=a.width+'px';
  const width=Math.max(a.width,el.scrollWidth),height=Math.max(el.scrollHeight,el.getBoundingClientRect().height);
  const scale=Math.min(1,a.width/width,a.height/Math.max(1,height));
  el.style.transform='scale('+scale+')';el.style.marginLeft=Math.max(0,(a.width-width*scale)/2)+'px';
 });}
 function init(){
  const button=document.querySelector('#tv-mode');
  let enabled=false;try{enabled=localStorage.getItem('point_tv_mode')==='true';}catch{}
  function set(value){document.body.classList.toggle('presentation',value);button.textContent=value?'Mostrar controles':'Modo TV';button.setAttribute('aria-pressed',String(value));try{localStorage.setItem('point_tv_mode',String(value));}catch{}window.dispatchEvent(new Event('resize'));}
  button.onclick=()=>set(!document.body.classList.contains('presentation'));set(enabled);
  document.addEventListener('fullscreenchange',fit);
  if(document.fonts)document.fonts.ready.then(fit);
 }
 return {init,fit,rows};
})();