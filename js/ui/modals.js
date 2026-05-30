function showConfirm(msg){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box">
      <div class="modal-msg">${msg}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
        <button class="modal-btn modal-ok" id="mo" title="Confirm">Delete</button>
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
          <span class="picker-emoji">${esc(pl.emoji||'♫')}</span>
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
  const o=$('confirmOverlay');
  o.innerHTML=`<div class="modal-box metadata-box">
    <div class="modal-msg">Edit Metadata</div>
    <label class="modal-field-label" for="metaTitle">Title</label>
    <input type="text" class="modal-input" id="metaTitle" value="${esc(song.title)}">
    <label class="modal-field-label" for="metaArtist">Artist</label>
    <input type="text" class="modal-input" id="metaArtist" value="${esc(song.artist)}">
    <div class="metadata-grid">
      <div>
        <label class="modal-field-label" for="metaAlbum">Album</label>
        <input type="text" class="modal-input" id="metaAlbum" value="${esc(song.album||'')}">
      </div>
      <div>
        <label class="modal-field-label" for="metaGenre">Genre</label>
        <input type="text" class="modal-input" id="metaGenre" value="${esc(song.genre||'')}">
      </div>
      <div>
        <label class="modal-field-label" for="metaYear">Year</label>
        <input type="text" class="modal-input" id="metaYear" value="${esc(song.year||'')}">
      </div>
      <div>
        <label class="modal-field-label" for="metaDuration">Duration</label>
        <input type="text" class="modal-input" id="metaDuration" value="${esc(song.duration||'--:--')}">
      </div>
    </div>
    <div class="modal-hint">Changes update LumiTune's library metadata. The original audio file is left untouched.</div>
    <div class="modal-actions">
      <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      <button class="modal-btn modal-ok" id="mo" title="Save">Save</button>
    </div>
  </div>`;
  o.style.display='flex';
  const close=()=>{o.style.display='none';};
  const save=()=>{
    const oldTitle=song.title,oldArtist=song.artist;
    song.title=$('metaTitle').value.trim()||oldTitle||'Unknown';
    song.artist=$('metaArtist').value.trim()||'Unknown';
    song.album=$('metaAlbum').value.trim();
    song.genre=$('metaGenre').value.trim();
    song.year=$('metaYear').value.trim();
    song.duration=$('metaDuration').value.trim()||'--:--';
    song.metadataEdited=true;
    song.metadataSource='manual';
    if(normalizeMeta(oldTitle)!==normalizeMeta(song.title)||normalizeMeta(oldArtist)!==normalizeMeta(song.artist)){
      deleteCachedLyrics(song);
    }
    if(playlistKey===currentPlaylist&&index===currentSongIndex){
      $('trackTitle').textContent=song.title;
      $('trackArtist').textContent=song.artist;
      updateHeroSection();
      fetchLyricsForSong(song);
    }
    libraryOrder=null;
    renderSongList($('searchInput').value);
    renderPlaylistGrid();
    saveState();
    close();
  };
  const kh=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',kh);close();}if(e.key==='Enter'){e.preventDefault();document.removeEventListener('keydown',kh);save();}};
  document.addEventListener('keydown',kh);
  $('metaTitle').focus();$('metaTitle').select();
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close();};
  $('mo').onclick=()=>{document.removeEventListener('keydown',kh);save();};
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close();}};
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
