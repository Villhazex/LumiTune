function setVirtualSongList(items,renderFn){
  const el=$('songList');
  if(!el)return;
  if(el._vCleanup){el._vCleanup();el._vCleanup=null;}
  const threshold=200;
  if(items.length<=threshold){
    el.innerHTML=items.map((item,i)=>renderFn(item,i)).join('');
    return;
  }
  const itemHeight=52;
  const buffer=10;
  const container=document.querySelector('.main');
  if(!container){el.innerHTML='';return;}
  el.style.position='relative';
  let rafId=null;
  let lastStart=-1,lastEnd=-1;
  function render(){
    const rect=container.getBoundingClientRect();
    const scrollTop=container.scrollTop;
    const viewH=rect.height;
    const start=Math.max(0,Math.floor(scrollTop/itemHeight)-buffer);
    const end=Math.min(items.length,Math.ceil((scrollTop+viewH)/itemHeight)+buffer);
    if(start===lastStart&&end===lastEnd)return;
    lastStart=start;lastEnd=end;
    el.innerHTML='';
    el.style.height=items.length*itemHeight+'px';
    for(let i=start;i<end;i++){
      const row=document.createElement('div');
      row.style.cssText=`position:absolute;top:${i*itemHeight}px;left:0;right:0;height:${itemHeight}px;`;
      row.innerHTML=renderFn(items[i],i);
      el.appendChild(row);
    }
  }
  render();
  const handler=()=>{
    if(rafId)cancelAnimationFrame(rafId);
    rafId=requestAnimationFrame(render);
  };
  container.addEventListener('scroll',handler,{passive:true});
  el._vCleanup=()=>{
    container.removeEventListener('scroll',handler);
    if(rafId)cancelAnimationFrame(rafId);
    el.style.position='';el.style.height='';el.innerHTML='';
  };
}