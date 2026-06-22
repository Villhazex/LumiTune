function addToQueue(playlistKey,songIndex,silent){
  const pl=playlists[playlistKey];
  if(!pl||songIndex<0||songIndex>=pl.songs.length)return;
  queue.push({playlistKey,songIndex});
  updateQueueUI();updateUpNext();
  if(!silent)showToast('Added to queue');
}
function removeFromQueue(index){
  if(index<0||index>=queue.length)return;
  queue.splice(index,1);
  if(index<currentQueueIdx)currentQueueIdx--;
  else if(index===currentQueueIdx)currentQueueIdx=-1;
  for(let entry of playlistCardHistory){if(index<=entry.atPos)entry.atPos--;}
  renderQueue();updateQueueUI();updateUpNext();
}
function clearQueue(){queue=[];currentQueueIdx=-1;playlistCardHistory=[];updateQueueUI();updateUpNext();}
async function saveQueueToPlaylist(){
  if(!queue.length)return;
  const name=await showInput('Playlist name:','Queue - '+new Date().toLocaleDateString());
  if(!name)return;
  const key='custom-'+Date.now();
  const songs=queue.map(item=>{
    const pl=playlists[item.playlistKey];
    const songId=pl?.songs[item.songIndex];
    const song=getSong(songId);
    return song;
  }).filter(Boolean);
  if(!songs.length)return;
  playlists[key]={name,emoji:'♫',color:'var(--accent)',sub:songs.length+' tracks',songs:songs.map(s=>String(s.id))};
  renderPlaylistNav();renderPlaylistGrid();saveState();
  const tab=document.querySelector('.panel-tab:nth-child(3)');
  if(tab)switchTab('stats',tab);
}
function updateQueueUI(){
  const btn=$('queueBtn'),badge=$('queueBadge');
  if(!btn)return;
  const remaining=currentQueueIdx>=0?queue.length-currentQueueIdx-1:queue.length;
  if(remaining>0){badge.textContent=remaining;badge.style.display='';}else{badge.style.display='none';}
}
function renderQueue(){
  const o=$('confirmOverlay');
  if(!queue.length){
    o.innerHTML=`<div class="modal-box source-picker-box">
      <div class="modal-msg">Up Next</div>
      <div style="text-align:center;padding:24px 0;font-size:12px;color:var(--text3)">Queue is empty</div>
      <div class="modal-actions"><button class="modal-btn modal-ok" id="mc" title="Close">Close</button></div>
    </div>`;
  }else{
    const remaining=currentQueueIdx>=0?queue.length-currentQueueIdx-1:queue.length;
    o.innerHTML=`<div class="modal-box source-picker-box queue-modal-box">
      <div class="modal-msg">Up Next <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">${remaining} left</span></div>
      <div class="queue-list">${queue.map((item,i)=>{
        const pl=playlists[item.playlistKey];
        const song=getSong(pl?.songs[item.songIndex]);
        if(!song)return'';
        const cls=i==currentQueueIdx?'queue-item active':i<currentQueueIdx?'queue-item queue-history':'queue-item has-del';
      return`<div class="${cls}" draggable="true" data-qi="${i}">
          <span class="drag-handle">≡</span>
          <span class="queue-info"><span class="queue-title">${esc(displayTitle(song))}</span><span class="queue-artist">${esc(song.artist)}</span></span>
          <span class="queue-pl">${esc(pl?.name||'')}</span>
          ${i>currentQueueIdx?`<button class="queue-del" data-qdel="${i}" title="Remove from queue">×</button>`:''}
        </div>`;
      }).join('')}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="queueSaveModal" title="Save queue as playlist">Save</button>
        <button class="modal-btn" id="queueClear" title="Clear queue">Clear</button>
        <button class="modal-btn modal-ok" id="mc" title="Close">Close</button>
      </div>
    </div>`;
    const ql=o.querySelector('.queue-list');
    if(ql)(function(){
      let mds=null;
      ql.addEventListener('dragstart',e=>{
        const item=e.target.closest('.queue-item');if(!item)return;
        mds=parseInt(item.dataset.qi);item.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain','true');
      });
      ql.addEventListener('dragover',e=>{
        e.preventDefault();e.dataTransfer.dropEffect='move';
        if(mds===null)return;
        ql.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
        const t=e.target.closest('.queue-item');if(!t)return;
        const r=t.getBoundingClientRect();
        if(e.clientY<r.top+r.height/2)t.classList.add('drag-over-top');else t.classList.add('drag-over-bottom');
      });
      ql.addEventListener('drop',e=>{
        e.preventDefault();
        if(mds===null)return;
        const t=e.target.closest('.queue-item');if(!t)return;
        const ti=parseInt(t.dataset.qi);
        if(isNaN(ti)||ti===mds)return;
        const ot=t.classList.contains('drag-over-top');
        let np=ot?ti:ti+1;
        if(ti>mds)np--;
        const [it]=queue.splice(mds,1);queue.splice(np,0,it);
        if(mds===currentQueueIdx)currentQueueIdx=np;
        else if(mds<currentQueueIdx&&np>=currentQueueIdx)currentQueueIdx--;
        else if(mds>currentQueueIdx&&np<=currentQueueIdx)currentQueueIdx++;
        mds=null;ql.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
        renderQueue();updateQueueUI();
      });
      ql.addEventListener('dragend',()=>{
        mds=null;ql.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
      });
    })();
  }
  o.style.display='flex';
  if(o._qkh)document.removeEventListener('keydown',o._qkh);
  const kh=e=>{if(e.key==='Escape')close()};
  o._qkh=kh;
  document.addEventListener('keydown',kh);
  const close=()=>{if(o._qkh){document.removeEventListener('keydown',o._qkh);o._qkh=null;}o.style.display='none'};
  o.onclick=e=>{if(e.target===o)close();};
  const mc=$('mc');
  if(mc)mc.onclick=()=>{close();};
  const qc=$('queueClear');
  if(qc)qc.onclick=()=>{close();clearQueue();};
  const qs=$('queueSaveModal');
  if(qs)qs.onclick=()=>{close();saveQueueToPlaylist();};
  o.querySelectorAll('.queue-del').forEach(btn=>{btn.onclick=()=>{const idx=parseInt(btn.dataset.qdel);removeFromQueue(idx);if(!queue.length)close();};});
}
