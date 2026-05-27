function showToast(msg,duration=2000){
  const existing=document.querySelector('.toast-notif');if(existing)existing.remove();
  const toast=document.createElement('div');
  toast.className='toast-notif';
  toast.textContent=msg;
  document.body.appendChild(toast);
  const btn=document.getElementById('playBtn');
  if(btn){
    const br=btn.getBoundingClientRect();
    const tw=toast.offsetWidth;
    let left=br.left+br.width/2-tw/2;
    const pad=8;
    left=Math.max(pad,Math.min(left,window.innerWidth-tw-pad));
    toast.style.left=left+'px';
    toast.style.right='auto';
    toast.style.margin='0';
  }
  requestAnimationFrame(()=>{toast.style.opacity='1';toast.style.transform='translateY(0)';});
  setTimeout(()=>{
    toast.style.opacity='0';toast.style.transform='translateY(-10px)';
    setTimeout(()=>toast.remove(),300);
  },duration);
}
