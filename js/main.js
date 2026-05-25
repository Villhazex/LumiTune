$('upNextClear')?.addEventListener('click',()=>{clearQueue();updateUpNext();});
$('upNextSave')?.addEventListener('click',()=>{saveQueueToPlaylist();});

$('upNextList')?.addEventListener('click',e=>{
  const del=e.target.closest('.queue-del');
  if(del){
    const idx=parseInt(del.dataset.qdel);
    if(idx>=0&&idx<queue.length){
      queue.splice(idx,1);
      if(idx<currentQueueIdx)currentQueueIdx--;
      else if(idx===currentQueueIdx)currentQueueIdx=-1;
      updateQueueUI();updateUpNext();
    }
    return;
  }
  const item=e.target.closest('.queue-item');
  if(item&&item.dataset.qi!==undefined){
    const qi=parseInt(item.dataset.qi);
    const q=queue[qi];
    if(q){
      currentQueueIdx=qi;
      playSong(q.songIndex,q.playlistKey,false);
    }
  }
});

/* ── Up Next panel drag reorder ── */
let upNextDragSrc=null;
const uq=$('upNextList');
uq.addEventListener('dragstart',e=>{
  const item=e.target.closest('.queue-item');if(!item)return;
  upNextDragSrc=parseInt(item.dataset.qi);
  item.classList.add('dragging');
  e.dataTransfer.effectAllowed='move';
  e.dataTransfer.setData('text/plain',JSON.stringify({qi:upNextDragSrc}));
});
uq.addEventListener('dragover',e=>{
  if(upNextDragSrc===null)return;
  e.preventDefault();e.dataTransfer.dropEffect='move';
  uq.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
  const target=e.target.closest('.queue-item');if(!target)return;
  const rect=target.getBoundingClientRect();
  if(e.clientY<rect.top+rect.height/2)target.classList.add('drag-over-top');
  else target.classList.add('drag-over-bottom');
});
uq.addEventListener('drop',e=>{
  if(upNextDragSrc===null)return;
  e.preventDefault();
  const target=e.target.closest('.queue-item');if(!target)return;
  const targetIdx=parseInt(target.dataset.qi);
  if(isNaN(targetIdx))return;
  if(targetIdx!==upNextDragSrc){
    const overTop=target.classList.contains('drag-over-top');
    const newPos=overTop?targetIdx:targetIdx+1;
    const [item]=queue.splice(upNextDragSrc,1);
    queue.splice(newPos,0,item);
    if(upNextDragSrc===currentQueueIdx)currentQueueIdx=newPos;
    else if(upNextDragSrc<currentQueueIdx&&newPos>=currentQueueIdx)currentQueueIdx--;
    else if(upNextDragSrc>currentQueueIdx&&newPos<=currentQueueIdx)currentQueueIdx++;
    updateUpNext();updateQueueUI();
  }
  upNextDragSrc=null;
  uq.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
});
uq.addEventListener('dragend',()=>{
  upNextDragSrc=null;
  uq.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
});

$('backBtn').addEventListener('click',goBack);
$('forwardBtn').addEventListener('click',goForward);
$('newPlaylistBtn').addEventListener('click',async()=>{
  const src=await showNewPlaylistPicker();
  if(src==='empty')handleCreateEmptyPlaylist();
  else if(src==='songs')$('folderInput').click();
});
$('folderInput').addEventListener('change',handleFolderSelect);
$('addTracksBtn').addEventListener('click',async()=>{
  const src=await showSourcePicker();
  if(src==='local')$('addTracksInput').click();
  else if(src==='youtube')handleYouTubeImport();
});
$('addTracksInput').addEventListener('change',handleAddTracks);
$('playBtn').addEventListener('click',togglePlay);
$('heroPlayBtn').addEventListener('click',togglePlay);
$('heroSection').addEventListener('click', e => {
  if(e.target.closest('button, .hero-right, #heroProgBar')) return;
  togglePlay();
});
$('nextBtn').addEventListener('click',playNext);
$('heroNextBtn').addEventListener('click',playNext);
$('prevBtn').addEventListener('click',playPrev);
$('heroPrevBtn').addEventListener('click',playPrev);
$('shuffleBtn').addEventListener('click',toggleShuffle);
$('heroShuffleBtn')?.addEventListener('click',toggleShuffle);
$('randomizeBtn').addEventListener('click',randomize);
$('queueAllBtn')?.addEventListener('click',()=>{
    const items=getQueueAllItems();
    if(!items.length)return;
    items.forEach(item=>addToQueue(item.playlistKey,item.songIndex,true));
    showToast(`↓ ${items.length} added to queue`);
    const tab=document.querySelector('.panel-tab:nth-child(2)');
    if(tab)switchTab('queue',tab);
  });
$('repeatBtn').addEventListener('click',toggleRepeat);
$('heroRepeatBtn')?.addEventListener('click',toggleRepeat);
$('likeBtn').addEventListener('click',()=>{if(currentSongIndex!==-1)toggleFav(String(playlists[currentPlaylist].songs[currentSongIndex]));});
$('progressBar').addEventListener('mousedown',e=>{isDraggingProgress=true;seekTo(e);});
$('heroProgBar')?.addEventListener('mousedown',e=>{isDraggingProgress=true;seekHero(e);});
$('volBar').addEventListener('mousedown',e=>{isDraggingVolume=true;setVol(e);});
function resizePanel(e){
  const root=document.documentElement;
  let w=window.innerWidth-e.clientX;
  w=Math.max(200,Math.min(600,w));
  root.style.setProperty('--rpw',w+'px');
  document.body.style.setProperty('--rpw',w+'px');
}
$('resizeHandle')?.addEventListener('mousedown',e=>{
  e.preventDefault();
  isDraggingPanel=true;
  document.body.style.cursor='col-resize';
  document.body.style.userSelect='none';
  e.currentTarget.classList.add('active');
  document.querySelector('.right-panel')?.classList.add('resizing');
});
$('heroVolSlider')?.addEventListener('input',function(){
  volume=this.value/100;
  isMuted=false;
  $('volFill').style.width=`${volume*100}%`;
  audioPlayer.volume=volume;
  $('heroVolLabel').textContent='VOL '+Math.round(volume*100);
  updateVolIcon();saveState();
});
document.addEventListener('mousemove',e=>{
  if(isDraggingProgress)seekTo(e);
  if(isDraggingVolume)setVol(e);
  if(isDraggingPanel)resizePanel(e);
});
document.addEventListener('mouseup',()=>{isDraggingProgress=false;isDraggingVolume=false;isDraggingPanel=false;document.body.style.cursor='';document.body.style.userSelect='';$('resizeHandle')?.classList.remove('active');document.querySelector('.right-panel')?.classList.remove('resizing');});
  $('volBtn').addEventListener('click',toggleMute);
  $('fullscreenBtn').addEventListener('click',()=>{
    if(document.fullscreenElement)document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  });
  $('queueBtn')?.addEventListener('click',()=>{
     updateUpNext();
     const tab=document.querySelector('.panel-tab:nth-child(2)');
     if(tab)switchTab('queue',tab);
   });

  $('offsetActivator')?.addEventListener('click',()=>{
    const pop=$('offsetPopover');
    if(!pop)return;
    if(pop.style.display!=='none'){pop.style.display='none';return;}
    const rect=$('offsetActivator').getBoundingClientRect();
    pop.style.left=rect.left+'px';
    pop.style.top=(rect.bottom+6)+'px';
    pop.style.display='';
  });
  document.addEventListener('click',e=>{
    const pop=$('offsetPopover');
    const act=$('offsetActivator');
    if(pop&&act&&!act.contains(e.target)&&!pop.contains(e.target))pop.style.display='none';
  });
  $('offsetMinusBig')?.addEventListener('click',()=>{adjustLyricOffset(-0.5,currentLyricOffsetSongId);$('offsetPopover')&&($('offsetPopover').style.display='none');});
  $('offsetMinus')?.addEventListener('click',()=>{adjustLyricOffset(-0.1,currentLyricOffsetSongId);$('offsetPopover')&&($('offsetPopover').style.display='none');});
  $('offsetReset')?.addEventListener('click',()=>{resetLyricOffset(currentLyricOffsetSongId);$('offsetPopover')&&($('offsetPopover').style.display='none');});
  $('offsetPlus')?.addEventListener('click',()=>{adjustLyricOffset(0.1,currentLyricOffsetSongId);$('offsetPopover')&&($('offsetPopover').style.display='none');});
  $('offsetPlusBig')?.addEventListener('click',()=>{adjustLyricOffset(0.5,currentLyricOffsetSongId);$('offsetPopover')&&($('offsetPopover').style.display='none');});

  function updateKaraokeOffsetLabel(){
    const lbl=$('karaokeOffsetLabel');
    if(lbl)lbl.textContent=(currentLyricOffset>=0?'+':'')+currentLyricOffset.toFixed(2)+'s';
  }
  $('karaokeOffsetMinusBig')?.addEventListener('click',()=>{adjustLyricOffset(-0.5,currentLyricOffsetSongId);updateKaraokeOffsetLabel();});
  $('karaokeOffsetMinus')?.addEventListener('click',()=>{adjustLyricOffset(-0.1,currentLyricOffsetSongId);updateKaraokeOffsetLabel();});
  $('karaokeOffsetPlus')?.addEventListener('click',()=>{adjustLyricOffset(0.1,currentLyricOffsetSongId);updateKaraokeOffsetLabel();});
  $('karaokeOffsetPlusBig')?.addEventListener('click',()=>{adjustLyricOffset(0.5,currentLyricOffsetSongId);updateKaraokeOffsetLabel();});

  $('karaokeBtn')?.addEventListener('click',function(){
    const container=$('karaokeContainer');
    if(!container)return;
    karaokeActive=!karaokeActive;
    this.classList.toggle('active',karaokeActive);
    container.style.display=karaokeActive?'':'none';
    document.body.style.overflow=karaokeActive?'hidden':'';
    if(karaokeActive){
      syncKaraokeLyrics();
      applyKaraokeFontSize();
      const cbs=$('karaokeBgOpts');
      if(cbs)cbs.querySelector('.karaoke-opt.active')?.click();
    }
  });
  function applyKaraokeFontSize(){
    const kl=$('karaokeLyrics');
    const fs=$('karaokeFontSlider');
    const val=$('karaokeFontVal');
    if(kl&&fs){kl.style.fontSize=fs.value+'px';if(val)val.textContent=fs.value+'px';}
  }
  $('karaokeFontSlider')?.addEventListener('input',applyKaraokeFontSize);
  $('karaokeFontSlider')?.addEventListener('change',applyKaraokeFontSize);
  $('karaokeBgOpts')?.addEventListener('click',e=>{
    const opt=e.target.closest('.karaoke-opt');
    if(!opt)return;
    opt.parentElement.querySelectorAll('.karaoke-opt').forEach(b=>b.classList.remove('active'));
    opt.classList.add('active');
    const container=$('karaokeContainer');
    if(container){
      container.classList.remove('bg-dark','bg-dim','bg-blur');
      container.classList.add('bg-'+opt.dataset.bg);
    }
  });
  $('karaokeExitBtn')?.addEventListener('click',()=>{
    const container=$('karaokeContainer');
    const btn=$('karaokeBtn');
    if(container)container.style.display='none';
    if(btn)btn.classList.remove('active');
    karaokeActive=false;
    document.body.style.overflow='';
  });
  $('karaokeExitBtn')?.addEventListener('click',()=>{
    const container=$('karaokeContainer');
    const btn=$('karaokeBtn');
    const startBtn=$('karaokeStartBtn');
    if(container)container.style.display='none';
    if(btn)btn.classList.remove('active');
    if(startBtn)startBtn.textContent='▶ Start';
    karaokeActive=false;
    document.body.style.overflow='';
  });

  $('lyricsContent')?.addEventListener('click',e=>{
    const line=e.target.closest('.lyric-line');
    if(!line)return;
    const idx=parseInt(line.dataset.idx);
    if(isNaN(idx)||!lyricLines[idx]||lyricLines[idx].time===undefined)return;
    line.classList.remove('pulse');
    void line.offsetWidth;
    line.classList.add('pulse');
    seekToLyricTime(lyricLines[idx].time+currentLyricOffset);
  });
  $('karaokeLyrics')?.addEventListener('click',e=>{
    const line=e.target.closest('.lyric-line');
    if(!line)return;
    const idx=parseInt(line.dataset.idx);
    if(isNaN(idx)||!lyricLines[idx]||lyricLines[idx].time===undefined)return;
    line.classList.remove('pulse');
    void line.offsetWidth;
    line.classList.add('pulse');
    seekToLyricTime(lyricLines[idx].time+currentLyricOffset);
  });

   let dragSourceIdx=null;
  const ov=$('confirmOverlay');
  ['dragstart','dragover','drop','dragend'].forEach(evt=>{
    ov.addEventListener(evt,e=>{
      const list=e.target.closest('.queue-list');
      if(!list||!ov.querySelector('.queue-list'))return;
      if(evt==='dragstart'){
        const item=e.target.closest('.queue-item');
        if(!item)return;
        dragSourceIdx=parseInt(item.dataset.qi);
        item.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',JSON.stringify({qi:dragSourceIdx}));
      }else if(evt==='dragover'){
        if(dragSourceIdx===null)return;
        e.preventDefault();
        e.dataTransfer.dropEffect='move';
        ov.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
        const target=e.target.closest('.queue-item');
        if(!target)return;
        const rect=target.getBoundingClientRect();
        if(e.clientY<rect.top+rect.height/2)target.classList.add('drag-over-top');
        else target.classList.add('drag-over-bottom');
      }else if(evt==='drop'){
        if(dragSourceIdx===null)return;
        e.preventDefault();
        const target=e.target.closest('.queue-item');
        if(!target)return;
        const targetIdx=parseInt(target.dataset.qi);
        if(targetIdx!==dragSourceIdx){
          const overTop=target.classList.contains('drag-over-top');
          const newPos=overTop?targetIdx:targetIdx+1;
          const [item]=queue.splice(dragSourceIdx,1);
          queue.splice(newPos,0,item);
          if(dragSourceIdx===currentQueueIdx)currentQueueIdx=newPos;
          else if(dragSourceIdx<currentQueueIdx&&newPos>=currentQueueIdx)currentQueueIdx--;
          else if(dragSourceIdx>currentQueueIdx&&newPos<=currentQueueIdx)currentQueueIdx++;
          renderQueue();
          updateQueueUI();
        }
        dragSourceIdx=null;
        ov.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
      }else if(evt==='dragend'){
        dragSourceIdx=null;
        ov.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
      }
    });
  });
  $('sortTitle')?.addEventListener('click',()=>toggleSort('title'));
  $('sortDuration')?.addEventListener('click',()=>toggleSort('duration'));
  $('settingsBtn').addEventListener('click',showSettingsModal);
  $('togglePanelBtn').addEventListener('click',()=>{
    const layout=document.querySelector('.layout');
    const closed=layout.classList.toggle('panel-closed');
    if(!closed){
      updateUpNext();
      const tab=document.querySelector('.panel-tab:nth-child(2)');
      if(tab)switchTab('queue',tab);
    }
  });

const doSearch=debounce(val=>{
  renderSongList(val);
  renderSearchDropdown(val);
},150);
$('searchInput').addEventListener('input',e=>{
  doSearch(e.target.value);
});
$('searchInput').addEventListener('keydown',e=>{
  const dd=$('searchDropdown');
  const items=dd.querySelectorAll('.search-dropdown-item');
  const sel=dd.querySelector('.search-dropdown-item.selected');
  if(e.key==='ArrowDown'){
    e.preventDefault();
    if(!dd.classList.contains('show')||!items.length)return;
    if(!sel){items[0].classList.add('selected');items[0].scrollIntoView({block:'nearest'});return;}
    const next=sel.nextElementSibling;
    if(next&&next.matches('.search-dropdown-item')){sel.classList.remove('selected');next.classList.add('selected');next.scrollIntoView({block:'nearest'});}
    return;
  }
  if(e.key==='ArrowUp'){
    e.preventDefault();
    if(!sel)return;
    const prev=sel.previousElementSibling;
    if(prev&&prev.matches('.search-dropdown-item')){sel.classList.remove('selected');prev.classList.add('selected');prev.scrollIntoView({block:'nearest'});return;}
    sel.classList.remove('selected');
    return;
  }
  if(e.key==='Enter'){
    if(sel){sel.click();return;}
    if(e.target.value.trim()){
      addRecentSearch(e.target.value.trim());
      renderSearchDropdown(e.target.value);
    }
    return;
  }
  if(e.key==='Escape'){
    if(dd.classList.contains('show'))dd.classList.remove('show');
  }
});
$('searchInput').addEventListener('focus',()=>{
  renderSearchDropdown($('searchInput').value);
});
$('searchInput').addEventListener('blur',()=>{
  setTimeout(()=>$('searchDropdown').classList.remove('show'),200);
});
$('searchClear').addEventListener('click',()=>{
  $('searchInput').value='';
  $('searchClear').classList.remove('show');
  renderSongList('');
  $('searchInput').focus();
  renderSearchDropdown('');
});
$('searchInput').addEventListener('input',()=>{
  $('searchClear').classList.toggle('show',!!$('searchInput').value);
});
$('searchDropdown').addEventListener('click',e=>{
  const item=e.target.closest('.search-dropdown-item');
  const remove=e.target.closest('.srch-remove');
  const clear=e.target.closest('.search-dropdown-clear');
  if(remove){
    e.stopPropagation();
    const term=remove.dataset.remove;
    recentSearches=recentSearches.filter(s=>s!==term);
    saveState();
    renderSearchDropdown($('searchInput').value);
    return;
  }
  if(clear){
    recentSearches=[];
    saveState();
    renderSearchDropdown($('searchInput').value);
    return;
  }
  if(!item)return;
  const type=item.dataset.type;
  if(type==='playlist'){
    const pk=item.dataset.playlist;
    if(playlists[pk]){recordNav();switchPlaylist(pk);switchView('home');}
    $('searchInput').value='';
    $('searchClear').classList.remove('show');
    $('searchDropdown').classList.remove('show');
    return;
  }
  if(type==='track'){
    const pk=item.dataset.playlist;
    const idx=parseInt(item.dataset.index);
    if(playlists[pk]&&playlists[pk].songs[idx])playSong(idx,pk,true);
    $('searchInput').value='';
    $('searchClear').classList.remove('show');
    $('searchDropdown').classList.remove('show');
    return;
  }
  const term=item.dataset.term||'';
  $('searchInput').value=term;
  $('searchClear').classList.toggle('show',!!term);
  renderSongList(term);
  $('searchDropdown').classList.remove('show');
  if(term.trim())addRecentSearch(term);
});

$('songList').addEventListener('click',e=>{
  const bulkAction=e.target.closest('[data-bulk-action]');if(bulkAction){runBulkAction(bulkAction.dataset.bulkAction);return;}
  const bulk=e.target.closest('.bulk-check');if(bulk){if(bulk.checked)bulkSelected.add(bulk.dataset.bulk);else bulkSelected.delete(bulk.dataset.bulk);renderSongList($('searchInput').value);return;}
  const ren=e.target.closest('[data-rename]');if(ren){handleRename(ren.dataset.rename);return;}
  const del=e.target.closest('[data-delete]');if(del){handleDeletePlaylist(del.dataset.delete);return;}
  const like=e.target.closest('.like-btn');if(like){toggleFav(like.dataset.songId);return;}
  const moreBtn=e.target.closest('.track-more-btn');
  if(moreBtn){
    e.stopPropagation();
    const wrap=moreBtn.closest('.track-more-wrap');
    const dd=wrap?.querySelector('.track-more-dropdown');
    if(dd){
      const wasOpen=dd.classList.contains('show');
      document.querySelectorAll('.track-more-dropdown.show').forEach(d=>d.classList.remove('show'));
      if(!wasOpen)dd.classList.add('show');
    }
    return;
  }
  document.querySelectorAll('.track-more-dropdown.show').forEach(d=>d.classList.remove('show'));
  const qadd=e.target.closest('[data-qadd]');if(qadd){addToQueue(qadd.dataset.qpl,parseInt(qadd.dataset.qadd));return;}
  const addpl=e.target.closest('[data-addpl]');if(addpl){handleAddToAnotherPlaylist(addpl.dataset.addplPl,parseInt(addpl.dataset.addpl));return;}
  const movepl=e.target.closest('[data-movepl]');if(movepl){handleMoveToPlaylist(movepl.dataset.moveplPl,parseInt(movepl.dataset.movepl));return;}
  const edit=e.target.closest('[data-edit]');if(edit){showMetadataEditor(edit.dataset.editPl,parseInt(edit.dataset.edit));return;}
  const delTrack=e.target.closest('[data-del]');if(delTrack){handleDeleteTrack(parseInt(delTrack.dataset.del));return;}
   const artist=e.target.closest('[data-artist]');if(artist){recordNav();selectedArtist=artist.dataset.artist;currentView='artists';renderSongList($('searchInput').value);return;}
   const album=e.target.closest('[data-album]');if(album){recordNav();selectedAlbum=album.dataset.album;currentView='albums';renderSongList($('searchInput').value);return;}
   const smart=e.target.closest('[data-smart]');if(smart){recordNav();selectedSmart=smart.dataset.smart;currentView='smart';renderSongList($('searchInput').value);return;}
  const card=e.target.closest('.pl-card,.playlist-card');
  if(card){recordNav();playlistsViewMode='detail';switchPlaylist(card.dataset.playlist);return;}
  const row=e.target.closest('.track-row');
   if(row&&row.dataset.index!==undefined){
     const plKey=row.dataset.playlist||currentPlaylist;
     if(plKey==='__loose'){showToast('⊕ Add this song to a playlist first');return;}
     playSong(parseInt(row.dataset.index),plKey,true);
   }
});

document.addEventListener('click',()=>{
  document.querySelectorAll('.track-more-dropdown.show').forEach(d=>d.classList.remove('show'));
});

let dragTrackSource=null;
const sl=$('songList');
['dragstart','dragover','drop','dragend'].forEach(evt=>{
  sl.addEventListener(evt,e=>{
    const row=e.target.closest('.track-row');
    if(!row)return;
    const plKey=row.dataset.playlist;
    if(plKey!==currentPlaylist)return;
    if(evt==='dragstart'){
      const idx=parseInt(row.dataset.index);
      dragTrackSource=idx;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed='all';
      e.dataTransfer.setData('text/plain',JSON.stringify({plKey,index:idx}));
    }else if(evt==='dragover'){
      if(dragTrackSource===null)return;
      e.preventDefault();
      e.dataTransfer.dropEffect='move';
      sl.querySelectorAll('.track-row').forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
      const rect=row.getBoundingClientRect();
      if(e.clientY<rect.top+rect.height/2)row.classList.add('drag-over-top');
      else row.classList.add('drag-over-bottom');
    }else if(evt==='drop'){
      if(dragTrackSource===null)return;
      e.preventDefault();
      const targetIdx=parseInt(row.dataset.index);
      if(targetIdx!==dragTrackSource){
        const overTop=row.classList.contains('drag-over-top');
        const songs=playlists[currentPlaylist].songs;
        const cur=dragTrackSource===currentSongIndex||targetIdx===currentSongIndex?songs[currentSongIndex]:null;
        const [item]=songs.splice(dragTrackSource,1);
        songs.splice(overTop?targetIdx:targetIdx+1,0,item);
        if(cur)currentSongIndex=songs.indexOf(cur);
        renderSongList($('searchInput').value);
        saveState();
      }
      dragTrackSource=null;
      sl.querySelectorAll('.track-row').forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
    }else if(evt==='dragend'){
      dragTrackSource=null;
      sl.querySelectorAll('.track-row').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
    }
  });
});
/* ── Drag from track list to Up Next panel ── */
let upNextDragCount=0;
const unp=$('tab-queue');
if(unp){
  unp.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='copy';});
  unp.addEventListener('dragenter',()=>{upNextDragCount++;unp.classList.add('drag-over');});
  unp.addEventListener('dragleave',()=>{upNextDragCount--;if(upNextDragCount<=0){upNextDragCount=0;unp.classList.remove('drag-over');}});
  unp.addEventListener('drop',e=>{
    e.preventDefault();upNextDragCount=0;unp.classList.remove('drag-over');
    const raw=e.dataTransfer.getData('text/plain');
    if(!raw)return;
    try{
      const d=JSON.parse(raw);
      if(d.plKey&&typeof d.index==='number')addToQueue(d.plKey,d.index);
    }catch{
      const idx=parseInt(raw);
      if(!isNaN(idx)&&currentPlaylist)addToQueue(currentPlaylist,idx);
    }
  });
}
$('playlistGrid').addEventListener('click',e=>{
  const card=e.target.closest('.playlist-card');if(card){recordNav();switchPlaylist(card.dataset.playlist);}
});
$('viewAllPlaylists')?.addEventListener('click',()=>{
  recordNav();switchView('playlists');
});

document.querySelectorAll('.nav-item[data-view]').forEach(el=>
  el.addEventListener('click',function(){recordNav();switchView(this.dataset.view);}));
$('logoArea').addEventListener('click',()=>{recordNav();switchView('home');});

document.addEventListener('keydown',e=>{
  if(isRecordingShortcut)return;
  const isInput=(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA');
  if(e.code==='Space'&&e.ctrlKey){e.preventDefault();executeShortcutAction('focusSearch');return;}
  if(isInput){if(e.code==='Escape'){e.target.blur();}return;}
  const shortcuts=getActiveShortcuts();
  for(const[action,sc]of Object.entries(shortcuts)){
    if(matchShortcut(e,sc)){e.preventDefault();executeShortcutAction(action);return;}
  }
});

async function init(){
  playlists={};
  for(const[k,v]of Object.entries(DEFAULT_PLAYLISTS))playlists[k]=JSON.parse(JSON.stringify(v));
  await loadState();
  try{
    const savedTheme=localStorage.getItem('lumi-theme');
    if(savedTheme&&availableThemes.includes(savedTheme))applyTheme(savedTheme);
    else applyTheme('default');
    if(!playlists[currentPlaylist]){const keys=Object.keys(playlists);currentPlaylist=keys.length?keys[0]:'';}
    renderPlaylistNav();renderPlaylistGrid();switchView('home');
    $('shuffleBtn').classList.toggle('active',isShuffle);
    const hs=$('heroShuffleBtn');if(hs)hs.classList.toggle('active',isShuffle);
    $('repeatBtn').classList.toggle('active',repeatMode>0);
    $('repeatBtn').textContent=repeatMode===2?'↺¹':'↺';
    const hr=$('heroRepeatBtn');if(hr){hr.classList.toggle('active',repeatMode>0);hr.textContent=repeatMode===2?'↺¹':'↺';}
    audioPlayer.volume=isMuted?0:volume;
    $('volFill').style.width=`${volume*100}%`;
    updateVolIcon();
    updateNavBtns();
  }finally{
    const splash=$('splash');
    if(splash){splash.style.opacity='0';setTimeout(()=>splash.remove(),400);}
  }
}
init();
setTimeout(()=>{
  const s=$('splash');
  if(s){s.style.opacity='0';setTimeout(()=>s.remove(),400);}
},3000);
addEventListener('beforeunload',()=>{localStorage.setItem('lumi-pt',String(totalPlayTime));});
