function showConfirm(msg, confirmText){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box">
      <div class="modal-msg">${msg}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
        <button class="modal-btn modal-ok" id="mo" title="Confirm">${confirmText||'Delete'}</button>
      </div>
    </div>`;
    o.style.display='flex';
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Escape')close(false);};
    document.addEventListener('keydown',kh);
    $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(false);};
    $('mo').onclick=()=>{document.removeEventListener('keydown',kh);close(true);};
  });
}
function showInput(label,def){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box">
      <div class="modal-msg">${label}</div>
      <input type="text" class="modal-input" id="mi" value="${def||''}">
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
        <button class="modal-btn modal-ok" id="mo" title="Create">Create</button>
      </div>
    </div>`;
    o.style.display='flex';
    const inp=$('mi');inp.focus();inp.select();
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Escape')close(null);if(e.key==='Enter')$('mo').click();};
    document.addEventListener('keydown',kh);
    $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
    $('mo').onclick=()=>{document.removeEventListener('keydown',kh);close($('mi').value.trim()||null);};
  });
}
function showMessage(msg,btn){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box" style="text-align:center">
      <div class="modal-msg">${msg}</div>
      ${btn?`<div class="modal-actions" style="justify-content:center"><button class="modal-btn modal-ok" id="mo" title="Dismiss">${btn}</button></div>`:''}
    </div>`;
    o.style.display='flex';
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Enter'||e.key==='Escape')$('mo')?.click();};
    document.addEventListener('keydown',kh);
    const b=$('mo');
    if(b)b.onclick=()=>{document.removeEventListener('keydown',kh);close(true);};
    else close(true);
  });
}
function showRename(current){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box">
      <div class="modal-msg">Rename playlist</div>
      <input type="text" class="modal-input" id="mi" value="${current||''}">
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
        <button class="modal-btn modal-ok" id="mo" title="Save">Save</button>
      </div>
    </div>`;
    o.style.display='flex';
    const inp=$('mi');inp.focus();inp.select();
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Escape')close(null);if(e.key==='Enter')$('mo').click();};
    document.addEventListener('keydown',kh);
    $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
    $('mo').onclick=()=>{document.removeEventListener('keydown',kh);close($('mi').value.trim()||null);};
  });
}
function showLoading(msg){
  const o=$('confirmOverlay');
  o.innerHTML=`<div class="modal-box" style="text-align:center">
    <div class="modal-msg">${msg}</div>
  </div>`;
  o.style.display='flex';
  return text=>{
    if(text===null){o.style.display='none';return;}
    const m=o.querySelector('.modal-msg');
    if(m)m.innerHTML=text;
  };
}
function showPlaylistPicker(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    const keys=Object.keys(playlists);
    if(!keys.length){
      o.innerHTML=`<div class="modal-box source-picker-box" style="text-align:center">
        <div class="modal-msg">No playlists yet</div>
        <div style="padding:16px 0;font-size:12px;color:var(--text3)">Create a playlist first to add tracks.</div>
        <div class="source-picker-grid" style="grid-template-columns:1fr">
          <button class="source-option" id="createPlaylistBtn" title="Create new playlist">
            <span class="source-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg></span>
            <span class="source-label">Create New Playlist</span>
            <span class="source-desc">Make a new playlist to add tracks into</span>
          </button>
        </div>
        <div class="modal-actions" style="justify-content:center">
          <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
        </div>
      </div>`;
      o.style.display='flex';
      $('createPlaylistBtn').onclick=async()=>{
        const name=await showInput('Playlist name:','My Playlist');
        if(!name){o.style.display='none';resolve(null);return;}
        const key='custom-'+Date.now();
        playlists[key]={name,emoji:'📂',color:'#D4522A',sub:'0 tracks',songs:[]};
        switchPlaylist(key);
        o.style.display='none';resolve(key);
      };
      $('mc').onclick=()=>{o.style.display='none';resolve(null);};
      return;
    }
    o.innerHTML=`<div class="modal-box picker-box">
      <div class="modal-msg">Choose a playlist</div>
      <div class="picker-list">${keys.map(k=>{
        const pl=playlists[k];
        return`<button class="picker-item" data-pick="${esc(k)}" title="Select playlist">
          <span class="picker-emoji"><svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h4.88a1.5 1.5 0 0 1 1.06.44l.88.88A1.5 1.5 0 0 0 10.38 3H13.5A1.5 1.5 0 0 1 15 4.5V12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2.5Z"/></svg></span>
          <span class="picker-name">${esc(pl.name)}</span>
          <span class="picker-count">${pl.songs.length} tracks</span>
        </button>`;
      }).join('')}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      </div>
    </div>`;
    o.style.display='flex';
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Escape')close(null);};
    document.addEventListener('keydown',kh);
    o.querySelectorAll('.picker-item').forEach(el=>el.addEventListener('click',()=>{document.removeEventListener('keydown',kh);close(el.dataset.pick);}));
    $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
  });
}
function showMetadataEditor(playlistKey,index){
  let song,pl;
  if(playlistKey==='__loose'){
    const loose=getLooseSongs();
    song=loose[index];
  }else{
    pl=playlists[playlistKey];
    const songId=pl?.songs[index];
    song=getSong(songId);
  }
  if(!song)return;
  song={...song};
  songs[String(song.id)]=song;
  const o=$('confirmOverlay');
  o.innerHTML=`<div class="modal-box metadata-box">
    <div class="modal-msg">Edit Metadata</div>
    <label class="modal-field-label" for="metaCustomTitle">Custom Title (for display)</label>
    <div class="input-wrap"><input type="text" class="modal-input" id="metaCustomTitle" value="${esc(displayTitle(song))}"><button class="copy-btn" data-copy="metaCustomTitle" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
    <label class="modal-field-label" for="metaOriginalTitle">Original Title (for metadata)</label>
    <div class="input-wrap"><input type="text" class="modal-input" id="metaOriginalTitle" value="${esc(song.title)}"><button class="copy-btn" data-copy="metaOriginalTitle" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
    <label class="modal-field-label" for="metaArtist">Artist</label>
    <div class="input-wrap"><input type="text" class="modal-input" id="metaArtist" value="${esc(song.artist)}"><button class="copy-btn" data-copy="metaArtist" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
    <div class="metadata-grid">
      <div>
        <label class="modal-field-label" for="metaAlbum">Album</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="metaAlbum" value="${esc(song.album||'')}"><button class="copy-btn" data-copy="metaAlbum" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div>
        <label class="modal-field-label" for="metaGenre">Genre</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="metaGenre" value="${esc(song.genre||'')}"><button class="copy-btn" data-copy="metaGenre" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div>
        <label class="modal-field-label" for="metaYear">Year</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="metaYear" value="${esc(song.year||'')}"><button class="copy-btn" data-copy="metaYear" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div>
        <label class="modal-field-label" for="metaDuration">Duration</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="metaDuration" value="${esc(song.duration||'--:--')}"><button class="copy-btn" data-copy="metaDuration" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div style="grid-column:1/-1">
        <label class="modal-field-label" for="metaSourceUrl">Link</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="metaSourceUrl" value="${esc(song.sourceUrl||'')}"><button class="copy-btn" data-copy="metaSourceUrl" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
    </div>
    <div style="font-size:12px;color:var(--text3);margin:8px 0;padding:6px 8px;background:var(--surface2);border-radius:4px">
      Original File: <span id="metaFileName">${esc(displayFileName(song))}</span>
    </div>
    <div class="modal-hint">Custom Title is for display only. Original Title is used for lyrics &amp; cover search.</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:22px">
      <button class="modal-btn" id="metaDeezerCover">Search Cover from Deezer</button>
      <button class="modal-btn" id="metaDeleteCover" style="${song.cover||song.coverKey?'':'display:none'}">Delete Cover</button>
    </div>
    <button class="modal-btn" id="metaRescanTrack" style="width:100%;margin-bottom:22px">Rescan Track</button>
    <hr style="border:none;border-top:1px solid var(--border,#2a2a2a);margin-bottom:20px">
    <div class="modal-actions">
      <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      <button class="modal-btn modal-ok" id="mo" title="Save">Save</button>
    </div>
  </div>`;
  o.style.display='flex';
  const close=()=>{o.style.display='none';};
  const save=async ()=>{
    const oldOriginal=song.title,oldArtist=song.artist;
    const ct=$('metaCustomTitle').value.trim();
    if(ct&&ct!==song.title){
      song.customTitle=ct;
    }else{
      delete song.customTitle;
    }
    song.title=$('metaOriginalTitle').value.trim()||song.title||'Unknown';
    song.artist=$('metaArtist').value.trim()||'Unknown';
    song.album=$('metaAlbum').value.trim();
    song.genre=$('metaGenre').value.trim();
    song.year=$('metaYear').value.trim();
    song.duration=$('metaDuration').value.trim()||'--:--';
    song.sourceUrl=$('metaSourceUrl').value.trim()||undefined;
    song.metadataEdited=true;
    song.metadataSource='manual';
    const metaChanged=normalizeMeta(oldOriginal)!==normalizeMeta(song.title)||normalizeMeta(oldArtist)!==normalizeMeta(song.artist);
    if(metaChanged){
      deleteCachedLyrics(song);
    }
    if(playlistKey===currentPlaylist&&index===currentSongIndex){
      $('trackTitle').textContent=displayTitle(song);
      $('trackArtist').textContent=song.artist;
      updateHeroSection();
      fetchLyricsForSong(song);
    }
    libraryOrder=null;
    renderSongList($('searchInput').value);
    renderPlaylistGrid();
    saveState();
    close();
    if(metaChanged&&isTauri()&&inv){
      showToast('Searching for cover...');
      try{
        const res=await inv('search_deezer_cover',{title:song.title,artist:song.artist,index:0});
        if(res&&res.length){
          const best=res[0];
          const r=await inv('pick_deezer_cover',{coverUrl:best.cover_url,title:song.title,artist:song.artist});
          if(r&&r[0]){
            song.cover='data:'+r[1]+';base64,'+r[0];
            song.coverKey=r[2];
            song.metadataSource='deezer';
            saveState();
            if(playlistKey===currentPlaylist&&index===currentSongIndex){
              updateHeroSection();
            }
            showToast('Cover updated');
          }else{
            showToast('No cover found');
          }
        }else{
          showToast('No cover found');
        }
      }catch(e){console.warn('Auto cover fetch failed:',e);}
    }
  };
  const kh=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',kh);close();}if(e.key==='Enter'){e.preventDefault();document.removeEventListener('keydown',kh);save();}};
  document.addEventListener('keydown',kh);
  $('metaCustomTitle').focus();$('metaCustomTitle').select();
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close();};
  $('mo').onclick=()=>{document.removeEventListener('keydown',kh);save();};
  $('metaDeezerCover').onclick=()=>{
    const ti=$('metaOriginalTitle').value.trim()||song.title;
    const ar=$('metaArtist').value.trim()||song.artist;
    if(!ti&&!ar)return;
    showDeezerCoverPicker(song,ti,ar,playlistKey,index);
  };
  $('metaRescanTrack').onclick=()=>{close();rescanTrack(song);};
  $('metaDeleteCover').onclick=async ()=>{
    const ok=await showConfirm('Delete cover for "'+esc(displayTitle(song))+'" ?');
    if(!ok)return;
    delete song.cover;
    delete song.coverKey;
    saveState();
    $('metaDeleteCover').style.display='none';
    if(playlistKey===currentPlaylist&&index===currentSongIndex){
      updateHeroSection();
      const aa=$('albumArt');
      if(aa){
        aa.style.backgroundImage='';
        aa.classList.remove('has-cover');
        const emoji=aa.querySelector('.art-emoji');
        if(emoji)emoji.style.display='';
      }
    }
    showToast('Cover deleted');
  };
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close();}};
}
function showBulkMetadataEditor(refs){
  if(!refs||!refs.length)return;
  const o=$('confirmOverlay');
  const n=refs.length;
  o.innerHTML=`<div class="modal-box metadata-box">
    <div class="modal-msg">Edit Metadata — ${n} song${n!==1?'s':''}</div>
    <div style="font-size:11px;color:var(--text3);margin:-10px 0 16px">Leave fields blank to keep original values</div>
    <label class="modal-field-label" for="bmetaTitle">Title</label>
    <div class="input-wrap"><input type="text" class="modal-input" id="bmetaTitle" placeholder="— unchanged —"><button class="copy-btn" data-copy="bmetaTitle" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
    <label class="modal-field-label" for="bmetaArtist">Artist</label>
    <div class="input-wrap"><input type="text" class="modal-input" id="bmetaArtist" placeholder="— unchanged —"><button class="copy-btn" data-copy="bmetaArtist" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
    <div class="metadata-grid">
      <div>
        <label class="modal-field-label" for="bmetaAlbum">Album</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="bmetaAlbum" placeholder="— unchanged —"><button class="copy-btn" data-copy="bmetaAlbum" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div>
        <label class="modal-field-label" for="bmetaGenre">Genre</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="bmetaGenre" placeholder="— unchanged —"><button class="copy-btn" data-copy="bmetaGenre" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div>
        <label class="modal-field-label" for="bmetaYear">Year</label>
        <div class="input-wrap"><input type="text" class="modal-input" id="bmetaYear" placeholder="— unchanged —"><button class="copy-btn" data-copy="bmetaYear" data-tip="Copied!" title="Copy"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg></button></div>
      </div>
      <div>
        <label class="modal-field-label" for="bmetaCoverDelete">Cover</label>
        <div class="meta-field-wrap"><button class="modal-btn" id="bmetaCoverDelete" style="width:100%">Delete Cover</button></div>
      </div>
    </div>
    <hr style="border:none;border-top:1px solid var(--border,#2a2a2a);margin-bottom:20px">
    <div class="modal-actions">
      <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      <button class="modal-btn modal-ok" id="mo" title="Apply">Apply</button>
    </div>
  </div>`;
  o.style.display='flex';
  const close=()=>{o.style.display='none';};
  const save=()=>{
    const title=$('bmetaTitle').value.trim();
    const artist=$('bmetaArtist').value.trim();
    const album=$('bmetaAlbum').value.trim();
    const genre=$('bmetaGenre').value.trim();
    const year=$('bmetaYear').value.trim();
    let changed=false;
    for(const r of refs){
      const song=getSong(playlists[r.playlistKey].songs[r.index]);
      if(!song)continue;
      if(title){song.title=title;changed=true;}
      if(artist){song.artist=artist;changed=true;}
      if(album)song.album=album;
      if(genre)song.genre=genre;
      if(year)song.year=year;
      if(bulkDelCover){
        delete song.cover;
        delete song.coverKey;
      }
    }
    if(changed&&title)deleteCachedLyrics(refs.map(r=>getSong(playlists[r.playlistKey].songs[r.index])).filter(Boolean));
    close();
    if(bulkDelCover&&refs.some(r=>r.playlistKey===currentPlaylistPlaying&&r.index===currentSongIndex)){
      updateHeroSection();
      const aa=$('albumArt');
      if(aa){
        aa.style.backgroundImage='';
        aa.classList.remove('has-cover');
        const emoji=aa.querySelector('.art-emoji');
        if(emoji)emoji.style.display='';
      }
    }
    bulkSelected.clear();
    libraryOrder=null;renderSongList($('searchInput').value);saveState();
    showToast('Updated '+refs.length+' song'+(refs.length!==1?'s':''));
  };
  let bulkDelCover=false;
  const kh=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',kh);close();}if(e.key==='Enter'){e.preventDefault();document.removeEventListener('keydown',kh);save();}};
  document.addEventListener('keydown',kh);
  $('bmetaTitle').focus();
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close();};
  $('mo').onclick=()=>{document.removeEventListener('keydown',kh);save();};
  $('bmetaCoverDelete').onclick=()=>{
    bulkDelCover=!bulkDelCover;
    $('bmetaCoverDelete').classList.toggle('modal-ok');
    $('bmetaCoverDelete').textContent=bulkDelCover?'✓ Delete Cover':'Delete Cover';
  };
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close();}};
}
function showDeezerCoverPicker(song, title, artist, playlistKey, songIdx){
  if(!isTauri()||!inv)return;
  const ole=$('confirmOverlay');
  const ov=document.createElement('div');
  ov.className='modal-overlay';
  ov.style.cssText='display:flex;position:fixed;inset:0;z-index:1001;background:var(--overlay);align-items:center;justify-content:center';
  ov.innerHTML=`<div class="modal-box" style="width:90vw;max-width:1100px;padding:20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <div><strong style="font-size:16px">Search Cover from Deezer</strong><br><span style="font-size:13px;color:var(--text3)">${esc(title)} — ${esc(artist)}</span></div>
      <button class="modal-btn dz-picker-close" style="font-size:14px;padding:4px 12px">✕</button>
    </div>
    <div id="dzResults" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:8px;min-height:100px">
      <div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text3)">Searching...</div>
    </div>
    <div id="dzFooter" style="text-align:center;margin-top:12px;display:flex;justify-content:center;gap:8px">
      <button class="modal-btn dz-picker-close" style="font-size:13px">Cancel</button>
    </div>
  </div>`;
  document.body.appendChild(ov);

  const closePicker=()=>{document.removeEventListener('keydown',pk);ov.remove();ole.style.display='none';};

  const pk=e=>{if(e.key==='Escape')closePicker();};

  document.addEventListener('keydown',pk);
  ov.querySelectorAll('.dz-picker-close').forEach(b=>b.onclick=closePicker);
  ov.onclick=e=>{if(e.target===ov)closePicker();};

  let currentPage=0;
  const container=$('dzResults');
  const footer=$('dzFooter');

  function createCard(r){
    const card=document.createElement('div');
    card.style.cssText='border-radius:8px;overflow:hidden;background:var(--surface2);cursor:pointer;transition:.15s;border:2px solid transparent';
    card.innerHTML=`
      <div style="aspect-ratio:1;background:var(--surface1);display:flex;align-items:center;justify-content:center;overflow:hidden">
        <img src="${esc(r.cover_url)}" alt="" style="width:100%;height:100%;object-fit:cover" loading="lazy">
      </div>
      <div style="padding:6px 8px">
        <div style="font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.title)}</div>
        <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.artist)}</div>
        <div style="font-size:11px;color:var(--text3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.album)}</div>
      </div>`;
    card.onmouseenter=()=>{card.style.borderColor='var(--accent)';card.style.background='var(--surface3)';};
    card.onmouseleave=()=>{card.style.borderColor='transparent';card.style.background='var(--surface2)';};
    card.onclick=()=>{
      card.style.borderColor='var(--accent)';
      showToast('Downloading cover...');
      inv('pick_deezer_cover',{coverUrl:r.cover_url,title:r.title,artist:r.artist}).then(res=>{
        if(res&&res[0]){
          song.cover='data:'+res[1]+';base64,'+res[0];
          song.coverKey=res[2];
          showToast('Cover downloaded');
          if(playlistKey===currentPlaylist&&songIdx===currentSongIndex){
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
          }
        }else{
          showToast('Cover failed: empty response from server');
          console.log('pick_deezer_cover returned null/empty:',res);
        }
        closePicker();
        if(ole.style.display!=='flex')ole.style.display='flex';
        if(res&&res[0]){
          showConfirm('Also update song metadata from Deezer?','Yes').then(overwrite=>{
            if(overwrite){
              song.title=r.title;
              song.artist=r.artist;
              song.album=r.album||'';
              song.metadataEdited=true;
              song.metadataSource='deezer';
              if(playlistKey===currentPlaylist&&songIdx===currentSongIndex){
                $('trackTitle').textContent=displayTitle(song);
                $('trackArtist').textContent=song.artist;
                updateHeroSection();
                fetchLyricsForSong(song);
              }
            }
            saveState();
          });
        }
      }).catch(err=>{
        showToast('Cover failed: '+err);
        console.error('pick_deezer_cover error:',err);
        closePicker();
      });
    };
    return card;
  }

  function loadPage(){
    const searchIdx=currentPage*25;
    container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text3)">Searching...</div>';
    footer.querySelectorAll('.dz-nav').forEach(n=>n.remove());
    inv('search_deezer_cover',{title,artist,index:searchIdx}).then(raw=>{
      if(!raw||!raw.length){
        container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text3)">No results from Deezer</div>';
        return;
      }
      const al=artist.toLowerCase();
      let filtered=raw.filter(r=>r.artist.toLowerCase().includes(al));
      if(!filtered.length){
        filtered=raw;
        showToast('Showing all results — none matched artist filter');
      }
      container.innerHTML='';
      filtered.forEach(r=>container.appendChild(createCard(r)));
      const frag=document.createDocumentFragment();
      if(currentPage>0){
        const b=document.createElement('button');
        b.className='modal-btn dz-nav';
        b.textContent='\u2190 Back';
        b.onclick=()=>{currentPage--;loadPage();};
        frag.appendChild(b);
      }
      if(raw.length>=25){
        const b=document.createElement('button');
        b.className='modal-btn dz-nav';
        b.textContent='Next \u2192';
        b.onclick=()=>{currentPage++;loadPage();};
        frag.appendChild(b);
      }
      if(frag.childNodes.length)footer.insertBefore(frag,footer.firstChild);
    }).catch(()=>{
      container.innerHTML='<div style="grid-column:1/-1;text-align:center;padding:40px 0;color:var(--text3)">Failed to search cover from Deezer</div>';
    });
  }

  loadPage();
}

function showScanProgress(){
  const o=$('confirmOverlay');
  o.innerHTML=`<div class="modal-box scan-progress-modal" style="text-align:center;min-width:320px">
    <div class="modal-msg">Scanning Music Folder...</div>
    <div style="margin:16px 0">
      <div class="scan-progress-bar" style="height:6px;background:var(--surface2);border-radius:3px;overflow:hidden">
        <div class="scan-progress-fill" style="height:100%;width:0%;background:var(--accent);border-radius:3px;transition:width .3s"></div>
      </div>
    </div>
    <div class="scan-progress-text" style="font-size:13px;color:var(--text2)">0 / 0</div>
    <div class="scan-status" style="font-size:12px;color:var(--text3);margin-top:6px"></div>
    <div class="modal-actions" style="justify-content:center;margin-top:12px">
      <button class="modal-btn" id="scanProgCancel" title="Cancel">Cancel</button>
    </div>
  </div>`;
  o.style.display='flex';
  let cancelled=false;
  $('scanProgCancel').onclick=()=>cancelled=true;
  return {
    close:()=>{o.style.display='none';},
    cancelled:()=>cancelled,
    update:({done,total,status,label})=>{
      if(cancelled)return;
      const pct=total>0?(done/total*100).toFixed(0):'0';
      o.querySelector('.scan-progress-fill').style.width=pct+'%';
      o.querySelector('.scan-progress-text').textContent=`${done} / ${total}`;
      if(label)o.querySelector('.modal-msg').textContent=label;
      if(status)o.querySelector('.scan-status').textContent=status;
    }
  };
}

function showSourcePicker(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box source-picker-box">
      <div class="modal-msg">Add Track From</div>
      <div class="source-picker-grid">
        <button class="source-option" data-source="local" title="Local files">
          <span class="source-icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h4l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/></svg></span>
          <span class="source-label">Local</span>
          <span class="source-desc">Browse files</span>
        </button>
        <button class="source-option" data-source="youtube" title="YouTube import">
          <span class="source-icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M4 2l10 6-10 6z"/></svg></span>
          <span class="source-label">YouTube</span>
          <span class="source-desc">Download audio</span>
        </button>
        ${isTauri()?`<button class="source-option" data-source="folder" title="Scan folder">
          <span class="source-icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h4l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/></svg></span>
          <span class="source-label">Folder</span>
          <span class="source-desc">Scan &amp; identify</span>
        </button>`:''}
      </div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      </div>
    </div>`;
    o.style.display='flex';
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Escape')close(null);};
    document.addEventListener('keydown',kh);
    o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close(null);}};
    o.querySelectorAll('.source-option').forEach(btn=>{btn.onclick=()=>{document.removeEventListener('keydown',kh);close(btn.dataset.source);};});
    $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
  });
}
function showNewPlaylistPicker(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box source-picker-box">
      <div class="modal-msg">New Playlist</div>
      <div class="source-picker-grid">
        <button class="source-option" data-source="empty" title="Empty playlist">
          <span class="source-icon"><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 3v10M3 8h10"/></svg></span>
          <span class="source-label">Empty</span>
          <span class="source-desc">Create blank playlist</span>
        </button>
        <button class="source-option" data-source="songs" title="Add from files">
          <span class="source-icon"><svg viewBox="0 0 16 16" fill="currentColor"><path d="M2 4a1 1 0 0 1 1-1h4l2 2h5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4z"/></svg></span>
          <span class="source-label">Add Songs</span>
          <span class="source-desc">Select audio files</span>
        </button>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      </div>
    </div>`;
    o.style.display='flex';
    const close=r=>{o.style.display='none';resolve(r);};
    const kh=e=>{if(e.key==='Escape')close(null);};
    document.addEventListener('keydown',kh);
    o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close(null);}};
    o.querySelectorAll('.source-option').forEach(btn=>{btn.onclick=()=>{document.removeEventListener('keydown',kh);close(btn.dataset.source);};});
    $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
  });
}
