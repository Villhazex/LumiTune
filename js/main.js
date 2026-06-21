let inv=null;
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
  e.dataTransfer.effectAllowed='all';
  e.dataTransfer.setData('text/plain','true');
  e.stopPropagation();
});
uq.addEventListener('dragover',e=>{
  e.preventDefault();e.dataTransfer.dropEffect='move';
  if(upNextDragSrc===null)return;
  uq.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('drag-over-top','drag-over-bottom'));
  const target=e.target.closest('.queue-item');if(!target)return;
  const rect=target.getBoundingClientRect();
  if(e.clientY<rect.top+rect.height/2)target.classList.add('drag-over-top');
  else target.classList.add('drag-over-bottom');
});
uq.addEventListener('drop',e=>{
  e.preventDefault();
  if(upNextDragSrc===null)return;
  const target=e.target.closest('.queue-item');if(!target)return;
  const targetIdx=parseInt(target.dataset.qi);
  if(isNaN(targetIdx)||targetIdx===upNextDragSrc)return;
  const overTop=target.classList.contains('drag-over-top');
  let newPos=overTop?targetIdx:targetIdx+1;
  if(targetIdx>upNextDragSrc)newPos--;
  const [item]=queue.splice(upNextDragSrc,1);
  queue.splice(newPos,0,item);
  if(upNextDragSrc===currentQueueIdx)currentQueueIdx=newPos;
  else if(upNextDragSrc<currentQueueIdx&&newPos>=currentQueueIdx)currentQueueIdx--;
  else if(upNextDragSrc>currentQueueIdx&&newPos<=currentQueueIdx)currentQueueIdx++;
  upNextDragSrc=null;
  uq.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
  updateUpNext();updateQueueUI();
});
uq.addEventListener('dragend',()=>{
  upNextDragSrc=null;
  uq.querySelectorAll('.queue-item').forEach(el=>el.classList.remove('dragging','drag-over-top','drag-over-bottom'));
});

$('backBtn').addEventListener('click',goBack);
$('forwardBtn').addEventListener('click',goForward);
document.addEventListener('click',e=>{
  const card=e.target.closest('#newPlCard');
  if(card){handleCreateEmptyPlaylist();return;}
});
$('folderInput').addEventListener('change',handleFolderSelect);
$('addTracksBtn').addEventListener('click',async()=>{
  const src=await showSourcePicker();
  if(src==='local')$('addTracksInput').click();
  else if(src==='youtube')handleYouTubeImport();
  else if(src==='folder')doScanFolder();
});
$('addTracksInput').addEventListener('change',handleAddTracks);
$('playBtn').addEventListener('click',togglePlay);
$('heroPlayBtn').addEventListener('click',togglePlay);
$('heroSection').addEventListener('click', e => {
  if(e.target.closest('button, .hero-right, #heroProgBar, #heroArt')) return;
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
$('bulkToggleBtn').addEventListener('click',()=>{
  bulkMode=!bulkMode;
  if(!bulkMode)bulkSelected.clear();
  $('bulkToggleBtn').textContent=bulkMode?'☑ Done':'☐ Select';
  renderSongList($('searchInput').value);
});
$('rescanBtn').addEventListener('click',()=>{
  if(currentView==='library')handleRescanAll();
  else if(currentPlaylist)handleRescanPlaylist(currentPlaylist);
  else showToast('No playlist selected');
});
$('repeatBtn').addEventListener('click',toggleRepeat);
$('heroRepeatBtn')?.addEventListener('click',toggleRepeat);
$('likeBtn').addEventListener('click',()=>{if(currentSongIndex!==-1)toggleFav(String(playlists[currentPlaylist].songs[currentSongIndex]));});
$('heroLikeBtn').addEventListener('click',()=>{if(currentSongIndex!==-1)toggleFav(String(playlists[currentPlaylist].songs[currentSongIndex]));});
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
$('heroVolSlider')?.addEventListener('wheel',function(e){
  e.preventDefault();
  isMuted=false;
  var step=0.05;
  volume=Math.max(0,Math.min(1,volume+(e.deltaY<0?step:-step)));
  setVolume(volume);
});
$('volBar')?.addEventListener('wheel',function(e){
  e.preventDefault();
  isMuted=false;
  var step=0.05;
  volume=Math.max(0,Math.min(1,volume+(e.deltaY<0?step:-step)));
  setVolume(volume);
});
document.addEventListener('mousemove',e=>{
  if(isDraggingProgress)seekTo(e);
  if(isDraggingVolume)setVol(e);
  if(isDraggingPanel)resizePanel(e);
});
document.addEventListener('mouseup',()=>{isDraggingProgress=false;isDraggingVolume=false;isDraggingPanel=false;document.body.style.cursor='';document.body.style.userSelect='';$('resizeHandle')?.classList.remove('active');document.querySelector('.right-panel')?.classList.remove('resizing');});
  $('volBtn').addEventListener('click',toggleMute);
  
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
  $('offsetMinusBig')?.addEventListener('click',()=>{adjustLyricOffset(-0.5,currentLyricOffsetSongId);});
  $('offsetMinus')?.addEventListener('click',()=>{adjustLyricOffset(-0.1,currentLyricOffsetSongId);});
  $('offsetReset')?.addEventListener('click',()=>{resetLyricOffset(currentLyricOffsetSongId);});
  $('offsetPlus')?.addEventListener('click',()=>{adjustLyricOffset(0.1,currentLyricOffsetSongId);});
  $('offsetPlusBig')?.addEventListener('click',()=>{adjustLyricOffset(0.5,currentLyricOffsetSongId);});

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
    container.classList.toggle('show',karaokeActive);
    document.body.style.overflow=karaokeActive?'hidden':'';
    if(karaokeActive){
      syncKaraokeLyrics();
      applyKaraokeFontSize();
      const cbs=$('karaokeBgOpts');
      if(cbs)cbs.querySelector('.karaoke-opt.active')?.click();
      const kct=$('karaokeCurrentTime');if(kct)kct.textContent=$('currentTime').textContent;
      const ktt=$('karaokeTotalTime');if(ktt)ktt.textContent=$('totalTime').textContent;
      const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=$('progressFill').style.width;
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
    if(container)container.classList.remove('show');
    if(btn)btn.classList.remove('active');
    karaokeActive=false;
    document.body.style.overflow='';
  });
  $('karaokeExitBtn')?.addEventListener('click',()=>{
    const container=$('karaokeContainer');
    const btn=$('karaokeBtn');
    const startBtn=$('karaokeStartBtn');
    if(container)container.classList.remove('show');
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

  $('karaokePrevBtn')?.addEventListener('click',playPrev);
  $('karaokeNextBtn')?.addEventListener('click',playNext);
  $('karaokePlayBtn')?.addEventListener('click',togglePlay);

  function seekKaraoke(e){
    const track=$('karaokeProgressBar');
    if(!track)return;
    const rect=track.getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
    currentPlaybackTime=pct*totalDuration;
    $('karaokeProgressFill').style.width=`${pct*100}%`;
    $('karaokeCurrentTime').textContent=fmt(currentPlaybackTime);
    $('progressFill').style.width=`${pct*100}%`;
    $('currentTime').textContent=fmt(currentPlaybackTime);
    updateHeroProgress();
    if(currentAudioFile)audioPlayer.currentTime=currentPlaybackTime;
    lastTrackedPos=currentPlaybackTime;
  }
  $('karaokeProgressBar')?.addEventListener('click',seekKaraoke);


  $('sortTitle')?.addEventListener('click',()=>toggleSort('title'));
  $('sortDuration')?.addEventListener('click',()=>toggleSort('duration'));
  $('settingsBtn').addEventListener('click',showSettingsModal);
  function closeAllDropdowns(){
    document.querySelectorAll('.track-more-dropdown.show').forEach(d=>{
      d.classList.remove('show','upward');
      d.style.left='';d.style.top='';d.style.transformOrigin='';
      if(d._origParent&&d.parentNode!==d._origParent){
        d._origParent.appendChild(d);
      }else if(d.id==='heroMoreDropdown'){
        const ow=$('heroMoreBtn').closest('.track-more-wrap');
        if(ow&&d.parentNode!==ow)ow.appendChild(d);
      }
    });
  }
  $('heroMoreBtn').addEventListener('click',e=>{
    e.stopPropagation();
    const dd=$('heroMoreDropdown');
    const wasOpen=dd.classList.contains('show');
    closeAllDropdowns();
    if(!wasOpen){
      const rect=$('heroMoreBtn').getBoundingClientRect();
      document.body.appendChild(dd);
      const ddH=dd.offsetHeight;
      const ddW=Math.max(160,dd.offsetWidth||160);
      let top=rect.bottom+4;
      let origin='top center';
      if(top+ddH>window.innerHeight-4){top=rect.top-4-ddH;origin='bottom center';}
      dd.style.transformOrigin=origin;
      dd.style.left=Math.max(8,Math.min(rect.right-ddW,window.innerWidth-ddW-8))+'px';
      dd.style.top=Math.max(8,top)+'px';
      dd.classList.add('show');
    }
  });
  $('heroMoreDropdown').addEventListener('click',e=>{
    const btn=e.target.closest('[data-hero-action]');
    if(!btn)return;
    const action=btn.dataset.heroAction;
    if(currentSongIndex===-1)return;
    if(action==='queue')addToQueue(currentPlaylist,currentSongIndex);
    else if(action==='addpl')handleAddToAnotherPlaylist(currentPlaylist,currentSongIndex);
    else if(action==='movepl')handleMoveToPlaylist(currentPlaylist,currentSongIndex);
    else if(action==='edit')showMetadataEditor(currentPlaylist,currentSongIndex);
    else if(action==='del')handleDeleteTrack(currentSongIndex);
    else if(action==='delcover')handleHeroDeleteCover();
    const dd=$('heroMoreDropdown');dd.classList.remove('show');
    dd.style.left='';dd.style.top='';dd.style.transformOrigin='';
    const ow=$('heroMoreBtn').closest('.track-more-wrap');
    if(ow&&dd.parentNode!==ow)ow.appendChild(dd);
  });
  function handleHeroDeleteCover(){
    const pl=playlists[currentPlaylistPlaying];
    const song=currentPlaylistPlaying&&pl?getSong(pl.songs[currentSongIndex]):null;
    if(!song)return;
    showConfirm('Delete cover for "'+displayTitle(song)+'" ?').then(ok=>{
      if(!ok)return;
      delete song.cover;
      delete song.coverKey;
      saveState();
      updateHeroSection();
      const aa=$('albumArt');
      if(aa){
        aa.style.backgroundImage='';
        aa.classList.remove('has-cover');
        const emoji=aa.querySelector('.art-emoji');
        if(emoji)emoji.style.display='';
      }
      showToast('Cover deleted');
    });
  }
  $('togglePanelBtn').addEventListener('click',()=>{
    const layout=document.querySelector('.layout');
    const closed=layout.classList.toggle('panel-closed');
    if(!closed){
      updateUpNext();
      const tab=document.querySelector('.panel-tab:nth-child(2)');
      if(tab)switchTab('queue',tab);
    }
  });
  document.querySelectorAll('.panel-tab').forEach(tab=>{
    tab.addEventListener('click',()=>switchTab(tab.dataset.tab,tab));
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
      doSearch.cancel&&doSearch.cancel();
      recordNav();
      currentView='search';searchTab='tracks';
      renderSongList(e.target.value.trim());
      $('searchDropdown').classList.remove('show');
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
    recentSearches=recentSearches.filter(s=>(typeof s==='string'?s:s.term)!==term);
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
    if(playlists[pk]&&idx>=0&&playlists[pk].songs[idx]){currentQueueIdx=-1;playlistCardHistory=[];playSong(idx,pk,false);}
    $('searchInput').value='';
    $('searchClear').classList.remove('show');
    $('searchDropdown').classList.remove('show');
    return;
  }
  if(type==='recent-track'){
    const songId=item.dataset.songId;
    let found=false;
    for(const[pk,pl]of Object.entries(playlists)){
      const idx=pl.songs.indexOf(songId);
      if(idx!==-1){currentQueueIdx=-1;playlistCardHistory=[];playSong(idx,pk,false);found=true;break;}
    }
    if(!found)showToast('Song not found');
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

document.querySelector('.track-list-wrap')?.addEventListener('click',e=>{
  const bulkAction=e.target.closest('[data-bulk-action]');if(bulkAction){runBulkAction(bulkAction.dataset.bulkAction);return;}
});
$('songList').addEventListener('click',e=>{
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
      closeAllDropdowns();
      if(!wasOpen){
        dd._origParent=wrap;
        const rect=moreBtn.getBoundingClientRect();
        document.body.appendChild(dd);
        const ddH=dd.offsetHeight;
        let ddW=Math.max(160,dd.offsetWidth||160);
        const maxW=window.innerWidth-16;
        if(ddW>maxW){ddW=maxW;dd.style.maxWidth=maxW+'px';}
        let top=rect.bottom+4;
        let origin='top center';
        if(top+ddH>window.innerHeight-4){top=rect.top-4-ddH;origin='bottom center';}
        dd.style.right='auto';
        dd.style.transformOrigin=origin;
        dd.style.left=Math.max(8,Math.min(rect.right-ddW,window.innerWidth-ddW-8))+'px';
        dd.style.top=Math.max(8,top)+'px';
        dd.classList.add('show');
      }
    }
    return;
  }
  closeAllDropdowns();
  const copyBtn=e.target.closest('.copy-btn');if(copyBtn){const inp=copyBtn.closest('.input-wrap')?.querySelector('.modal-input')??$(copyBtn.dataset.copy);if(inp){const t=inp.value;if(!t)return;navigator.clipboard.writeText(t).then(()=>{copyBtn.classList.add('copied','show-tip');setTimeout(()=>copyBtn.classList.remove('copied','show-tip'),1500);}).catch(()=>{});}return;}
  const qadd=e.target.closest('[data-qadd]');if(qadd){if(qadd.dataset.qpl==='__loose'){showToast('⊕ Add this song to a playlist first');return;}addToQueue(qadd.dataset.qpl,parseInt(qadd.dataset.qadd));return;}
  const addpl=e.target.closest('[data-addpl]');if(addpl){handleAddToAnotherPlaylist(addpl.dataset.addplPl,parseInt(addpl.dataset.addpl));return;}
  const movepl=e.target.closest('[data-movepl]');if(movepl){handleMoveToPlaylist(movepl.dataset.moveplPl,parseInt(movepl.dataset.movepl));return;}
  const edit=e.target.closest('[data-edit]');if(edit){showMetadataEditor(edit.dataset.editPl,parseInt(edit.dataset.edit));return;}
  const delTrack=e.target.closest('[data-del]');if(delTrack){handleDeleteTrack(parseInt(delTrack.dataset.del),delTrack.dataset.delPl||currentPlaylist);return;}
  const dload=e.target.closest('[data-download]');if(dload){handleDownload(dload.dataset.downloadPl,parseInt(dload.dataset.download));return;}
  const delcover=e.target.closest('[data-delcover]');if(delcover){handleDeleteCover(delcover.dataset.delcoverPl,parseInt(delcover.dataset.delcover));return;}
   const artist=e.target.closest('[data-artist]');if(artist){recordNav();selectedArtist=artist.dataset.artist;currentView='artists';renderSongList($('searchInput').value);return;}
   const album=e.target.closest('[data-album]');if(album){recordNav();selectedAlbum=album.dataset.album;currentView='albums';renderSongList($('searchInput').value);return;}
   const smart=e.target.closest('[data-smart]');if(smart){recordNav();selectedSmart=smart.dataset.smart;currentView='smart';renderSongList($('searchInput').value);return;}
  const rescanPl=e.target.closest('[data-rescan]');if(rescanPl){e.stopPropagation();handleRescanPlaylist(rescanPl.dataset.rescan);return;}
  const card=e.target.closest('.pl-card,.playlist-card:not(#newPlCard)');
  if(card){recordNav();playlistsViewMode='detail';switchPlaylist(card.dataset.playlist);return;}
  const row=e.target.closest('.track-row');
    if(row&&row.dataset.index!==undefined){
      if(bulkMode){
        const ch=row.querySelector('.bulk-check');
        if(ch){
          const key=ch.dataset.bulk;
          if(bulkSelected.has(key))bulkSelected.delete(key);else bulkSelected.add(key);
          renderSongList($('searchInput').value);
        }
        return;
      }
      const plKey=row.dataset.playlist||currentPlaylist;
      if(plKey==='__loose'){showToast('⊕ Add this song to a playlist first');return;}
      currentQueueIdx=-1;playlistCardHistory=[];playSong(parseInt(row.dataset.index),plKey,false);
    }
});

/* ── Hero art click → custom cover picker ── */
$('heroArt').addEventListener('click',()=>{
  const pl=playlists[currentPlaylistPlaying];
  if(!currentPlaylistPlaying||!pl)return;
  const song=getSong(pl.songs[currentSongIndex]);
  if(!song)return;
  $('heroCoverInput').click();
});
$('heroCoverInput').addEventListener('change',async ()=>{
  const file=$('heroCoverInput').files[0];
  if(!file)return;
  const pl=playlists[currentPlaylistPlaying];
  if(!currentPlaylistPlaying||!pl){$('heroCoverInput').value='';return;}
  const song=getSong(pl.songs[currentSongIndex]);
  if(!song){$('heroCoverInput').value='';return;}
  const reader=new FileReader();
  reader.onload=async (e)=>{
    const dataUrl=e.target.result;
    const mime=file.type||'image/jpeg';
    if(isTauri()&&inv){
      const base64=dataUrl.split(',')[1];
      try{
        const res=await inv('save_custom_cover',{data:base64,mime,title:song.title,artist:song.artist});
        if(res&&res[0]){
          song.cover='data:'+res[1]+';base64,'+res[0];
          song.coverKey=res[2];
        }else{
          song.cover=dataUrl;
          song.coverKey='custom-'+song.id;
        }
      }catch(e){
        console.warn('save custom cover fallback:',e);
        song.cover=dataUrl;
        song.coverKey='custom-'+song.id;
      }
    }else{
      song.cover=dataUrl;
      song.coverKey='custom-'+song.id;
    }
    saveState();
    updateHeroSection();
    const aa=$('albumArt');
    if(aa){
      aa.style.backgroundImage=`url(${JSON.stringify(song.cover)})`;
      aa.style.backgroundSize='cover';
      aa.style.backgroundPosition='center';
      aa.classList.add('has-cover');
      const emoji=aa.querySelector('.art-emoji');
      if(emoji)emoji.style.display='none';
    }
    showToast('Cover updated');
    $('heroCoverInput').value='';
  };
  reader.readAsDataURL(file);
});

document.addEventListener('click',closeAllDropdowns);

let dragTrackSource=null;
const sl=$('songList');
if(sl){
  sl.addEventListener('dragstart',e=>{
    const row=e.target.closest('.track-row');
    if(!row)return;
    const plKey=row.dataset.playlist;
    const idx=parseInt(row.dataset.index);
    if(isNaN(idx))return;
    dragTrackSource={plKey,index:idx};
    sl.dragInProgress=true;
    e.dataTransfer.effectAllowed='all';
    e.dataTransfer.setData('text/plain',JSON.stringify({plKey,index:idx}));
  });
  sl.addEventListener('dragend',()=>{
    sl.dragInProgress=false;
    dragTrackSource=null;
  });
}
/* ── Drag from track list to Up Next panel ── */
let upNextDragCount=0;
const unp=$('tab-queue');
if(unp){
  unp.addEventListener('dragover',e=>{
    e.preventDefault();
    e.dataTransfer.dropEffect='copy';
  });
  unp.addEventListener('dragenter',()=>{upNextDragCount++;unp.classList.add('drag-over');});
  unp.addEventListener('dragleave',()=>{upNextDragCount--;if(upNextDragCount<=0){upNextDragCount=0;unp.classList.remove('drag-over');}});
  unp.addEventListener('drop',e=>{
    e.preventDefault();
    upNextDragCount=0;unp.classList.remove('drag-over');
    const src=dragTrackSource;
    if(src){addToQueue(src.plKey,src.index);dragTrackSource=null;return;}
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
  if(e.ctrlKey&&e.shiftKey&&(e.code==='ArrowRight'||e.code==='ArrowLeft')){
    e.preventDefault();
    const ci=availableThemes.indexOf(currentTheme);
    const next=e.code==='ArrowRight'?(ci+1)%availableThemes.length:(ci-1+availableThemes.length)%availableThemes.length;
    applyTheme(availableThemes[next]);
    return;
  }
  const shortcuts=getActiveShortcuts();
  for(const[action,sc]of Object.entries(shortcuts)){
    if(matchShortcut(e,sc)){e.preventDefault();executeShortcutAction(action);return;}
  }
});

function handleDownload(plKey,idx){
  let songs;
  if(plKey==='__loose')songs=getLooseSongs();
  else{const pl=playlists[plKey];if(!pl)return;songs=pl.songs;}
  const songId=songs[idx];if(songId===undefined)return;
  const song=getSong(songId);if(!song)return;
  const name=`${song.title} - ${song.artist}`.replace(/[<>:"/\\|?*]/g,'_');
  if(song.sourceUrl){
    if(isTauri()){
      (async()=>{
        try{
          const res=await window.__TAURI__.invoke('yt_download_mp3',{url:song.sourceUrl});
          const blob=new Blob([new Uint8Array(res.bytes)],{type:'audio/mpeg'});
          const url=URL.createObjectURL(blob);
          const a=document.createElement('a');a.href=url;a.download=`${name}.mp3`;
          document.body.appendChild(a);a.click();a.remove();
          URL.revokeObjectURL(url);
          showToast(`⬇ Downloaded ${displayTitle(song)}`);
        }catch(e){showToast('Download failed');}
      })();
    }else{
      const a=document.createElement('a');
      a.href=`/api/download-mp3?url=${encodeURIComponent(song.sourceUrl)}`;
      a.download=`${name}.mp3`;
      document.body.appendChild(a);a.click();a.remove();
      showToast(`⬇ Downloading ${displayTitle(song)}...`);
    }
  }else if(song.file){
    const ct=song.file.type;
    let ext='mp3';
    if(ct.includes('mpeg'))ext='mp3';
    else if(ct.includes('wav'))ext='wav';
    else if(ct.includes('flac'))ext='flac';
    else if(ct.includes('ogg'))ext='ogg';
    else if(ct.includes('mp4'))ext='m4a';
    else if(ct.includes('aac'))ext='aac';
    const url=URL.createObjectURL(song.file);
    const a=document.createElement('a');
    a.href=url;a.download=`${name}.${ext}`;
    document.body.appendChild(a);a.click();a.remove();
    URL.revokeObjectURL(url);
    showToast(`⬇ Downloaded ${displayTitle(song)}`);
  }else showToast('No audio data to download');
}

function handleDeleteCover(plKey,index){
  const pl=playlists[plKey];
  if(!pl)return;
  const song=getSong(pl.songs[index]);
  if(!song)return;
  showConfirm('Delete cover for "'+displayTitle(song)+'" ?').then(ok=>{
    if(!ok)return;
    delete song.cover;
    delete song.coverKey;
    saveState();
    if(plKey===currentPlaylistPlaying&&index===currentSongIndex){
      updateHeroSection();
      const aa=$('albumArt');
      if(aa){
        aa.style.backgroundImage='';
        aa.classList.remove('has-cover');
        const emoji=aa.querySelector('.art-emoji');
        if(emoji)emoji.style.display='';
      }
    }
    renderSongList($('searchInput')?.value||'');
    showToast('Cover deleted');
  });
}

async function rescanSongFromBlob(song){
  const blob=song.file||(song.fileKey?await dbGet(song.fileKey):null);
  if(!blob)return 0;
  try{
    const [tags,cover]=await Promise.all([
      readID3Tags(blob),
      extractCoverFromFile(blob)
    ]);
    if(tags){
      if(tags.title)song.title=tags.title;
      if(tags.artist)song.artist=tags.artist;
      if(tags.album)song.album=tags.album;
      if(tags.genre)song.genre=tags.genre;
      if(tags.year)song.year=String(tags.year);
      if(tags.duration!=null)song.duration=fmt(tags.duration);
    }
    if(cover&&!song.coverKey)song.cover=cover;
    return 1;
  }catch(e){
    console.warn('rescanSongFromBlob error:',e);
    return -1;
  }
}

async function rescanSongViaTauri(song){
  if(!song.filePath||!isTauri()||!inv)return 0;
  try{
    const result=await inv('identify_single_file',{path:song.filePath,acoustidKey:ACOUSTID_API_KEY});
    if(result&&result.success){
      song.title=result.title||song.title;
      song.artist=result.artist||song.artist;
      song.album=result.album||song.album;
      song.year=result.year||song.year;
      song.genre=result.genre||song.genre;
      if(result.duration!=null&&result.duration>0)song.duration=fmt(result.duration);
      if(result.cover_data_base64&&!song.coverKey)song.cover='data:'+result.cover_mime+';base64,'+result.cover_data_base64;
      song.metadataSource=result.method;
      song.reliability=result.reliability||'low';
      song.suspectedSwapped=!!result.suspected_swapped;
      if(result.title_similarity!=null)song.titleSimilarity=result.title_similarity;
      if(result.artist_similarity!=null)song.artistSimilarity=result.artist_similarity;
      if(result.final_score)song.finalScore=result.final_score;
      return 1;
    }
    return 0;
  }catch(e){
    console.warn('rescanSongViaTauri error:',e);
    return -1;
  }
}

async function handleRescanPlaylist(plKey){
  const pl=playlists[plKey];
  if(!pl||!pl.songs.length){showToast('No tracks to rescan');return;}
  showToast('Rescanning '+pl.songs.length+' tracks...');
  let updated=0,failed=0;
  for(let i=0;i<pl.songs.length;i++){
    const song=getSong(pl.songs[i]);
    if(!song)continue;
    let r=0;
    if(song.filePath&&isTauri()&&inv)r=await rescanSongViaTauri(song);
    else r=await rescanSongFromBlob(song);
    if(r>0)updated++;
    else if(r<0)failed++;
  }
  saveState();
  renderSongList($('searchInput')?.value||'');
  renderPlaylistGrid();
  const msg=updated+' track'+(updated!==1?'s':'')+' updated';
  showToast(failed?msg+', '+failed+' failed':msg);
}

async function handleRescanAll(){
  const all=[];
  Object.values(playlists).forEach(pl=>pl.songs.forEach(sid=>{if(!all.includes(sid))all.push(sid);}));
  if(!all.length){showToast('No tracks to rescan');return;}
  showToast('Rescanning '+all.length+' tracks...');
  let updated=0,failed=0;
  for(let i=0;i<all.length;i++){
    const song=getSong(all[i]);
    if(!song)continue;
    let r=0;
    if(song.filePath&&isTauri()&&inv)r=await rescanSongViaTauri(song);
    else r=await rescanSongFromBlob(song);
    if(r>0)updated++;
    else if(r<0)failed++;
  }
  saveState();
  renderSongList($('searchInput')?.value||'');
  renderPlaylistGrid();
  const msg=updated+' track'+(updated!==1?'s':'')+' updated';
  showToast(failed?msg+', '+failed+' failed':msg);
}

async function init(){
  playlists={};
  for(const[k,v]of Object.entries(DEFAULT_PLAYLISTS))playlists[k]=JSON.parse(JSON.stringify(v));
  await loadState();
  try{
    const savedTheme=localStorage.getItem('lumi-theme');
    if(savedTheme&&availableThemes.includes(savedTheme))applyTheme(savedTheme);
    else applyTheme('default');
    if(!playlists[currentPlaylist]){const keys=Object.keys(playlists);currentPlaylist=keys.length?keys[0]:'';}
    if(localStorage.getItem('lumi-no-anim')){noAnim=true;document.body.classList.add('no-anim');}
    renderPlaylistNav();renderPlaylistGrid();switchView('home');
    updateInfinityIndicator();
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
  if(isTauri()){
    document.body.classList.add('tb-active');
    const ipc=window.__TAURI_IPC__;
    let _ipcId=0;
    const tauriInvoke=window.__TAURI__?.tauri?.invoke||window.__TAURI__?.invoke;
    inv=ipc?(cmd,args)=>new Promise((rs,rj)=>{const cid=++_ipcId,eid=++_ipcId;window[`_${cid}`]=rs;window[`_${eid}`]=rj;const m={cmd,callback:cid,error:eid,...args};ipc(m);}):tauriInvoke?(cmd,args)=>tauriInvoke(cmd,args):null;
    if(!inv){showToast('ERR: no IPC',5000);return;}
    const btns=[$('tb-min'),$('tb-max'),$('tb-close')];
    btns.forEach(btn=>{
      if(!btn)return;
      btn.addEventListener('click',e=>{
        const id=btn.id;
        if(id==='tb-min')inv('tb_minimize').catch(e=>showToast('err: '+e));
        else if(id==='tb-close')inv('tb_close').catch(e=>showToast('err: '+e));
        else if(id==='tb-max')inv('tb_maximize').catch(e=>showToast('err: '+e));
      });
    });
    inv('tb_is_maximized').then(r=>$('tb-max').textContent=r?'❐':'□').catch(e=>showToast('err: '+e));
  }
  loadCoversFromDB();
  initKuroshiro().catch(()=>{});
}
init();
setTimeout(()=>{
  const s=$('splash');
  if(s){s.style.opacity='0';setTimeout(()=>s.remove(),400);}
},5000);
addEventListener('beforeunload',()=>{localStorage.setItem('lumi-pt',String(totalPlayTime));saveStateNow();});
$('infinityBtn')?.addEventListener('click',()=>{
  const modes=['off','song','playlist'];
  const idx=modes.indexOf(infinityMode);
  infinityMode=modes[(idx+1)%modes.length];
  saveState();
  updateInfinityIndicator();
  showToast(infinityMode==='off'?'∞ Infinity Off':infinityMode==='song'?'∞ Random Song':'∞ Random Playlist',1200);
});
