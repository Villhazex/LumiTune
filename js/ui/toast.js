function showToast(msg,duration=2000){
  const existing=document.querySelector('.toast-notif');if(existing)existing.remove();
  const toast=document.createElement('div');
  toast.className='toast-notif';
  toast.textContent=msg;
  document.body.appendChild(toast);
  setTimeout(()=>{toast.style.opacity='0';toast.style.transform='translateY(10px)';},50);
  requestAnimationFrame(()=>{toast.style.opacity='1';toast.style.transform='translateY(0)';});
  setTimeout(()=>{
    toast.style.opacity='0';toast.style.transform='translateY(-10px)';
    setTimeout(()=>toast.remove(),300);
  },duration);
}
