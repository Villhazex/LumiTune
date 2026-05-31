function showSkeleton(){
  const el=$('songList');if(!el)return;
  el.innerHTML=Array(8).fill('<div class="skeleton-row"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>').join('');
}

function renderVirtualRows(title,sub,songs,filter=''){
  const q=filter.trim().toLowerCase();
  const filtered=q?songs.filter(s=>(s.customTitle||'').toLowerCase().includes(q)||String(s.title||'').toLowerCase().includes(q)||(s.fileName||'').toLowerCase().includes(q)||String(s.artist||'').toLowerCase().includes(q)||String(s.album||'').toLowerCase().includes(q)||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(q)):songs;
  $('trackHeader').style.display='';
  $('secTitle').textContent=title;
  $('secCount').textContent=filtered.length+' tracks';
  $('breadcrumbTitle').textContent=title;
  $('breadcrumbSub').textContent=sub;
  if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  setVirtualSongList(filtered,(song,i)=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,true,playlists[song.playlistKey]?.name||song.playlistKey);
  });
}

let featuredKeys=null;
function renderPlaylistGrid(){
  const grid=$('playlistGrid');if(!grid)return;
  if(!featuredKeys){
    const all=Object.keys(playlists);
    for(let i=all.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[all[i],all[j]]=[all[j],all[i]];}
    featuredKeys=all.slice(0,5);
  }
  const keys=featuredKeys;
  grid.innerHTML=keys.map((key,i)=>{
    const pl=playlists[key];
    const songs=playlistSongs(pl);
    return`<div class="playlist-card ${key===currentPlaylist?'active':''}" data-playlist="${key}">
      <svg class="card-folder" viewBox="0 0 36 30"><path class="folder-body" d="M0 6a3 3 0 0 1 3-3h10l3 4h17a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V6z"/></svg>
      <div class="card-meta">PLAYLIST · ${String(i+1).padStart(2,'0')}</div>
      <div class="card-name">${pl.name}</div>
      <div class="card-count">${songs.length} tracks</div>
    </div>`;
  }).join('');
}

function renderSongList(filter=''){
  const el=$('songList');if(el&&el._vCleanup){el._vCleanup();el._vCleanup=null;}
  showSkeleton();
  if(currentView!=='home')$('heroSection').style.display='none';
  if(currentView!=='search'){
    const stc=$('searchTabsContainer');
    if(stc)stc.remove();
  }
  if(currentView==='home')renderHome(filter);
  else if(currentView==='library')renderLibrary(filter);
  else if(currentView==='artists')renderArtists(filter);
  else if(currentView==='albums')renderAlbums(filter);
  else if(currentView==='smart')renderSmart(filter);
  else if(currentView==='favorites')renderFavs(filter);
  else if(currentView==='search')renderSearchResults(filter);
  else renderPlaylists(filter);
}

function makeRow(song,origIdx,isActive,isLiked,plKey,showDel,extra){
  const statusBadge=isActive
    ?`<span class="badge ${isPlaying?'badge-playing':'badge-paused'}"><span class="badge-dot"></span>${isPlaying?'Playing':'Paused'}</span>`
    :'';
  const methodLabel={id3:'ID3',acoustid:'AcoustID',hybrid:'Hybrid',cache:'Cache',audio_hash:'Audio Hash',manual:'Manual',filename:'Filename'}[song.metadataSource]||song.metadataSource||'Unknown';
  const trustNote=song.isTrusted===false?' · Not Verified':'';
  const swapNote=song.suspectedSwapped?' · Parser unsure (title/artist may be swapped)':'';
  const simNote=song.titleSimilarity>0
    ?` · Title:${(song.titleSimilarity*100).toFixed(0)}% Artist:${((song.artistSimilarity||0)*100).toFixed(0)}%`
    :'';
  const reliBadge=song.reliability&&song.reliability!=='high'
    ?` <span class="reliability-badge" title="Source: ${methodLabel} · Reliability: ${song.reliability||'low'}${trustNote}${swapNote}${simNote}"><span class="reli-dot ${song.reliability==='low'?'reli-low':'reli-med'}"></span></span>`
    :'';
  const moreItems=`<button class="dropdown-item" data-qadd="${origIdx}" data-qpl="${plKey}" title="Add to queue">Add to queue</button>
    <button class="dropdown-item" data-addpl="${origIdx}" data-addpl-pl="${plKey}" title="Add to playlist">Add to playlist</button>
    <button class="dropdown-item" data-movepl="${origIdx}" data-movepl-pl="${plKey}" title="Move to playlist">Move to playlist</button>
    <button class="dropdown-item" data-edit="${origIdx}" data-edit-pl="${plKey}" title="Edit metadata">Edit metadata</button>
    <button class="dropdown-item" data-download="${origIdx}" data-download-pl="${plKey}" title="Download MP3">Download MP3</button>
    ${showDel?`<div class="dropdown-divider"></div><button class="dropdown-item danger" data-del="${origIdx}" data-del-pl="${plKey}" title="Delete track">Delete</button>`:''}`;
  return`<div class="track-row ${isActive?'active':''}" draggable="true" data-index="${origIdx}" data-playlist="${plKey}">
    <div class="t-info">
      <span class="t-title">${esc(displayTitle(song))}</span>
      <span class="t-artist">${song.artist}${reliBadge}${statusBadge?' ':''}${statusBadge}</span>
    </div>
    <div class="t-extra">${extra}</div>
    <div class="t-actions">
      <button class="like-btn ${isLiked?'liked':''}" data-song-id="${song.id}" title="Like">${isLiked?'★':'☆'}</button>
      <div class="track-more-wrap">
        <button class="track-more-btn" data-more="${origIdx}" title="More">⋮</button>
        <div class="track-more-dropdown">${moreItems}</div>
      </div>
    </div>
  </div>`;
}

function renderHome(filter){
  $('trackHeader').style.display='';
  if(filter){
    const all=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((songId,i)=>{
      const song=getSong(songId);
      if(song)all.push({...song,playlistKey:pk,songIndex:i});
    }));
    const filtered=all.filter(s=>(s.customTitle||'').toLowerCase().includes(filter.toLowerCase())||s.title.toLowerCase().includes(filter.toLowerCase())||(s.fileName||'').toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(filter.toLowerCase()));
    $('secTitle').textContent='Search Results';
    $('secCount').textContent=filtered.length+' tracks';
    $('breadcrumbTitle').textContent='Search';
    $('breadcrumbSub').textContent='All playlists';
    if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
    $('emptyState').style.display='none';
    setVirtualSongList(filtered,(song,i)=>{
      const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
      return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,true,playlists[song.playlistKey]?.name||song.playlistKey);
    });
    updateHeroSection();
    return;
  }
  const pl=playlists[currentPlaylist];
  if(!pl){$('secTitle').textContent='Tracklist';$('secCount').textContent='0 tracks';$('songList').innerHTML='';updateHeroSection();return;}
  const songIds=pl.songs;
  $('secTitle').textContent=pl.name;
  $('secCount').textContent=songIds.length+' tracks';
  $('breadcrumbTitle').textContent=pl.name;
  $('breadcrumbSub').textContent=pl.sub;
  if(!songIds.length){$('songList').innerHTML='';$('emptyState').style.display='block';updateHeroSection();return;}
  $('emptyState').style.display='none';
  const isCustom=!DEFAULT_KEYS.includes(currentPlaylist);
  setVirtualSongList(songIds,(songId,i)=>{
    const song=getSong(songId);
    if(!song)return'';
    const isActive=i===currentSongIndex&&currentPlaylist===currentPlaylistPlaying;
    return makeRow(song,i,isActive,favorites.has(String(songId)),currentPlaylist,isCustom,song.duration);
  });
  updateHeroSection();
}

function renderSearchResults(filter){
  if(!filter){switchView('home');return;}
  $('playlistGrid').style.display='none';
  const plh=$('playlistSectionHeader');
  if(plh)plh.style.display='none';
  $('breadcrumbTitle').textContent='Search';
  $('breadcrumbSub').textContent=filter;
  renderSearchTabBar(filter);
  if(searchTab==='tracks')renderSearchTracks(filter);
  else if(searchTab==='playlists')renderSearchPlaylists(filter);
  else if(searchTab==='artists')renderSearchArtists(filter);
  else if(searchTab==='albums')renderSearchAlbums(filter);
}
function renderSearchTabBar(filter){
  let container=$('searchTabsContainer');
  if(!container){
    container=document.createElement('div');
    container.id='searchTabsContainer';
    $('songList').parentNode.insertBefore(container,$('songList'));
  }
  const tabs=['tracks','playlists','artists','albums'];
  container.innerHTML=`<div class="search-tabs">${tabs.map(t=>
    `<button class="search-tab${t===searchTab?' active':''}" data-stab="${t}">${t.charAt(0).toUpperCase()+t.slice(1)}</button>`
  ).join('')}</div>`;
  container.querySelectorAll('[data-stab]').forEach(b=>{
    b.onclick=()=>{searchTab=b.dataset.stab;renderSearchResults(filter);};
  });
}
function renderSearchTracks(filter){
  $('trackHeader').style.display='none';
  const all=[];
  Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((songId,i)=>{
    const song=getSong(songId);
    if(song)all.push({...song,playlistKey:pk,songIndex:i});
  }));
  const ql=filter.toLowerCase();
  const filtered=all.filter(s=>(s.customTitle||'').toLowerCase().includes(ql)||s.title.toLowerCase().includes(ql)||(s.fileName||'').toLowerCase().includes(ql)||s.artist.toLowerCase().includes(ql)||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(ql));
  $('secTitle').textContent='Search Results';
  $('secCount').textContent=filtered.length+' tracks';
  if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  setVirtualSongList(filtered,(song,i)=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,true,playlists[song.playlistKey]?.name||song.playlistKey);
  });
}
function renderSearchPlaylists(filter){
  $('trackHeader').style.display='none';
  const ql=filter.toLowerCase();
  const matched=Object.entries(playlists).filter(([k,pl])=>pl.name.toLowerCase().includes(ql));
  $('secTitle').textContent='Search Results';
  $('secCount').textContent=matched.length+' playlist'+(matched.length!==1?'s':'');
  if(!matched.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid collection-grid">${matched.map(([key,pl])=>{
    const songs=playlistSongs(pl);
    return`<div class="playlist-card" data-playlist="${esc(key)}" role="button" tabindex="0" title="${esc(pl.name)}">
      <svg class="card-folder" viewBox="0 0 36 30"><path class="folder-body" d="M0 6a3 3 0 0 1 3-3h10l3 4h17a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V6z"/></svg>
      <div class="card-meta">PLAYLIST</div>
      <div class="card-name">${esc(pl.name)}</div>
      <div class="card-count">${songs.length} track${songs.length!==1?'s':''}</div>
    </div>`;
  }).join('')}</div>`;
}
function renderSearchArtists(filter){
  $('trackHeader').style.display='none';
  const ql=filter.toLowerCase();
  const groups=groupSongsBy('artist').filter(([name])=>name.toLowerCase().includes(ql));
  $('secTitle').textContent='Search Results';
  $('secCount').textContent=groups.length+' artist'+(groups.length!==1?'s':'');
  if(!groups.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid collection-grid">${groups.map(([name,songs])=>`
    <div class="playlist-card collection-card" data-artist="${esc(name)}" role="button" tabindex="0" title="${esc(name)}">
      <div class="collection-mark">${esc(name.slice(0,1).toUpperCase())}</div>
      <div class="card-meta">ARTIST</div>
      <div class="card-name">${esc(name)}</div>
      <div class="card-count">${songs.length} track${songs.length!==1?'s':''}</div>
    </div>`).join('')}</div>`;
}
function renderSearchAlbums(filter){
  $('trackHeader').style.display='none';
  const ql=filter.toLowerCase();
  const groups=groupSongsBy('album').map(([name,songs])=>[name==='Unknown'?'Unknown Album':name,songs]).filter(([name])=>name.toLowerCase().includes(ql));
  $('secTitle').textContent='Search Results';
  $('secCount').textContent=groups.length+' album'+(groups.length!==1?'s':'');
  if(!groups.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid collection-grid">${groups.map(([name,songs])=>{
    const artist=songs[0]?.artist||'Various Artists';
    return`<div class="playlist-card collection-card" data-album="${esc(name)}" role="button" tabindex="0" title="${esc(name)}">
      <svg class="card-folder" viewBox="0 0 36 30"><path class="folder-body" d="M18 2a16 16 0 1 0 0 32A16 16 0 0 0 18 2zm0 20a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>
      <div class="card-meta">${esc(artist)}</div>
      <div class="card-name">${esc(name)}</div>
      <div class="card-count">${songs.length} track${songs.length!==1?'s':''}</div>
    </div>`;
  }).join('')}</div>`;
}
function renderLibrary(filter){
  $('trackHeader').style.display='';
  if(filter){
    const all=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((songId,i)=>{
      const song=getSong(songId);
      if(song)all.push({...song,playlistKey:pk,songIndex:i});
    }));
    const filtered=all.filter(s=>(s.customTitle||'').toLowerCase().includes(filter.toLowerCase())||s.title.toLowerCase().includes(filter.toLowerCase())||(s.fileName||'').toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(filter.toLowerCase()));
    $('secTitle').textContent='Library';$('secCount').textContent=filtered.length+' tracks';
    if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';libraryOrder=null;return;}
    $('emptyState').style.display='none';
    setVirtualSongList(filtered,(song,i)=>{
      const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
      return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,true,playlists[song.playlistKey]?.name||song.playlistKey);
    });
    libraryOrder=null;
    return;
  }
  if(!libraryOrder){
    libraryOrder=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((songId,i)=>{
      const song=getSong(songId);
      if(song)libraryOrder.push({...song,playlistKey:pk,songIndex:i});
    }));
  }
  $('secTitle').textContent='Library';$('secCount').textContent=libraryOrder.length+' tracks';
  if(!libraryOrder.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  setVirtualSongList(libraryOrder,(song,i)=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,true,playlists[song.playlistKey]?.name||song.playlistKey);
  });
}

function renderArtists(filter){
  if(selectedArtist){
    const songs=allLibrarySongs().filter(s=>(String(s.artist||'Unknown').trim()||'Unknown')===selectedArtist);
    renderVirtualRows(selectedArtist,'Artist view',songs,filter);
    return;
  }
  const q=filter.trim().toLowerCase();
  const groups=groupSongsBy('artist').filter(([name])=>!q||name.toLowerCase().includes(q));
  $('trackHeader').style.display='none';
  $('secTitle').textContent='Artists';
  $('secCount').textContent=groups.length+' artists';
  $('breadcrumbTitle').textContent='Artists';
  $('breadcrumbSub').textContent='Grouped by track artist';
  if(!groups.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid collection-grid">${groups.map(([name,songs])=>`
    <div class="playlist-card collection-card" data-artist="${esc(name)}" role="button" tabindex="0" title="${esc(name)}">
      <div class="collection-mark">${esc(name.slice(0,1).toUpperCase())}</div>
      <div class="card-meta">ARTIST</div>
      <div class="card-name">${esc(name)}</div>
      <div class="card-count">${songs.length} track${songs.length!==1?'s':''}</div>
    </div>`).join('')}</div>`;
}

function renderAlbums(filter){
  if(selectedAlbum){
    const songs=allLibrarySongs().filter(s=>(String(s.album||'Unknown Album').trim()||'Unknown Album')===selectedAlbum);
    renderVirtualRows(selectedAlbum,'Album view',songs,filter);
    return;
  }
  const q=filter.trim().toLowerCase();
  const groups=groupSongsBy('album').map(([name,songs])=>[name==='Unknown'?'Unknown Album':name,songs]).filter(([name])=>!q||name.toLowerCase().includes(q));
  $('trackHeader').style.display='none';
  $('secTitle').textContent='Albums';
  $('secCount').textContent=groups.length+' albums';
  $('breadcrumbTitle').textContent='Albums';
  $('breadcrumbSub').textContent='Grouped by album metadata';
  if(!groups.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid collection-grid">${groups.map(([name,songs])=>{
    const artist=songs[0]?.artist||'Various Artists';
    return`<div class="playlist-card collection-card" data-album="${esc(name)}" role="button" tabindex="0" title="${esc(name)}">
      <svg class="card-folder" viewBox="0 0 36 30"><path class="folder-body" d="M18 2a16 16 0 1 0 0 32A16 16 0 0 0 18 2zm0 20a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/></svg>
      <div class="card-meta">${esc(artist)}</div>
      <div class="card-name">${esc(name)}</div>
      <div class="card-count">${songs.length} track${songs.length!==1?'s':''}</div>
    </div>`;
  }).join('')}</div>`;
}

function getRecentlyPlayedSongs(){
  const all=allLibrarySongs();
  const map=new Map();
  all.forEach(s=>map.set(String(s.id),s));
  const res=[];
  for(const p of recentPlays){
    const s=map.get(String(p.id));
    if(s)res.push(s);
  }
  return res;
}
function getSmartSets(){
  const all=allLibrarySongs();
  const plays=getMonthPlays();
  const cache=getLyricsCache();
  const userLyrics=(()=>{try{return JSON.parse(localStorage.getItem('lumi-ulyrics')||'{}');}catch(e){return{};}})();
  return{
    recentlyAdded:{name:'Recently Added',sub:'Newest tracks in your library',songs:[...all].sort((a,b)=>songAddedAt(b)-songAddedAt(a)).slice(0,50)},
    recentlyPlayed:{name:'Recently Played',sub:'Recently played tracks',songs:getRecentlyPlayedSongs()},
    neverPlayed:{name:'Never Played',sub:'Tracks with no plays this month',songs:all.filter(s=>!plays[String(s.id)])},
    missingLyrics:{name:'Missing Lyrics',sub:'No custom or cached lyrics yet',songs:all.filter(s=>!userLyrics[String(s.id)]&&!cache[String(s.id)])},
    looseSongs:{name:'Loose Songs',sub:'Tracks not in any playlist',songs:getLooseSongs()}
  };
}

function renderSmart(filter){
  const sets=getSmartSets();
  if(selectedSmart&&sets[selectedSmart]){
    if(selectedSmart==='looseSongs'){renderLooseSongs(filter);return;}
    const smart=sets[selectedSmart];
    renderVirtualRows(smart.name,smart.sub,smart.songs,filter);
    return;
  }
  const q=filter.trim().toLowerCase();
  const entries=Object.entries(sets).filter(([,s])=>!q||s.name.toLowerCase().includes(q));
  $('trackHeader').style.display='none';
  $('secTitle').textContent='Smart Playlists';
  $('secCount').textContent=entries.length+' lists';
  $('breadcrumbTitle').textContent='Smart';
  $('breadcrumbSub').textContent='Auto-built from your library';
  if(!entries.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid collection-grid">${entries.map(([key,s])=>`
    <div class="playlist-card collection-card" data-smart="${esc(key)}" role="button" tabindex="0" title="${esc(s.name)}">
      <div class="collection-mark smart-mark">${esc(s.name.slice(0,1))}</div>
      <div class="card-meta">SMART PLAYLIST</div>
      <div class="card-name">${esc(s.name)}</div>
      <div class="card-count">${s.songs.length} track${s.songs.length!==1?'s':''}</div>
    </div>`).join('')}</div>`;
}

function getMissingDataSongs(){
  const cache=getLyricsCache();
  const userLyrics=(()=>{try{return JSON.parse(localStorage.getItem('lumi-ulyrics')||'{}');}catch(e){return{};}})();
  return allLibrarySongs().map(song=>{
    const issues=[];
    if(!song.artist||song.artist==='Unknown')issues.push('artist');
    if(!song.album)issues.push('album');
    if(!song.genre)issues.push('genre');
    if(!song.year)issues.push('year');
    if(!song.duration||song.duration==='--:--')issues.push('duration');
    if(!userLyrics[String(song.id)]&&!cache[String(song.id)])issues.push('lyrics');
    return{...song,issues};
  }).filter(s=>s.issues.length);
}

function getDuplicateGroups(){
  const map=new Map();
  for(const song of allLibrarySongs()){
    const key=[normalizeMeta(song.title),normalizeMeta(song.artist),String(song.duration||'')].join('|');
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(song);
  }
  return[...map.values()].filter(group=>group.length>1);
}

function renderBulkBar(songs){
  const selected=bulkSelected.size;
  return`<div class="bulk-bar">
    <button class="bulk-btn" data-bulk-action="select-all" title="Select all visible">Select visible</button>
    <button class="bulk-btn" data-bulk-action="clear" title="Clear selection">Clear</button>
    <span class="bulk-count">${selected} selected</span>
    <button class="bulk-btn" data-bulk-action="playlist" ${selected?'':'disabled'} title="Add to playlist">Add to playlist</button>
    <button class="bulk-btn" data-bulk-action="move" ${selected?'':'disabled'} title="Move to playlist">Move to playlist</button>
    <button class="bulk-btn" data-bulk-action="favorite" ${selected?'':'disabled'} title="Favorite selected">Favorite</button>
    <button class="bulk-btn" data-bulk-action="queue" ${selected?'':'disabled'} title="Add to queue">Queue</button>
    <button class="bulk-btn danger" data-bulk-action="delete" ${selected?'':'disabled'} title="Delete selected">Delete</button>
  </div>`;
}

function renderFavs(filter){
  $('trackHeader').style.display='';
  const favs=[];
  Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((songId,i)=>{
    if(favorites.has(String(songId))){
      const song=getSong(songId);
      if(song)favs.push({...song,playlistKey:pk,songIndex:i});
    }
  }));
  const filtered=filter?favs.filter(s=>(s.customTitle||'').toLowerCase().includes(filter.toLowerCase())||s.title.toLowerCase().includes(filter.toLowerCase())||(s.fileName||'').toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())):favs;
  $('secTitle').textContent='Favourites';$('secCount').textContent=filtered.length+' tracks';
  $('breadcrumbTitle').textContent='Favourites';$('breadcrumbSub').textContent='Your liked tracks';
  if(!filtered.length){
    $('songList').innerHTML='<div style="padding:60px 20px;text-align:center;font-family:DM Mono,monospace;font-size:10px;color:#4A4844;letter-spacing:.08em;text-transform:uppercase">— no favourites yet —</div>';
    $('emptyState').style.display='none';return;
  }
  $('emptyState').style.display='none';
  setVirtualSongList(filtered,(song,i)=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,true,song.playlistKey,true,playlists[song.playlistKey]?.name||song.playlistKey);
  });
}

function renderLooseSongs(filter){
  $('trackHeader').style.display='';
  const loose=getLooseSongs();
  const filtered=filter?loose.filter(s=>(s.customTitle||'').toLowerCase().includes(filter.toLowerCase())||s.title.toLowerCase().includes(filter.toLowerCase())||(s.fileName||'').toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())):loose;
  $('secTitle').textContent='Loose Songs';$('secCount').textContent=filtered.length+' tracks';
  $('breadcrumbTitle').textContent='Loose Songs';$('breadcrumbSub').textContent='Tracks not assigned to any playlist';
  if(!filtered.length){
    $('songList').innerHTML='<div style="padding:60px 20px;text-align:center;font-family:DM Mono,monospace;font-size:10px;color:#4A4844;letter-spacing:.08em;text-transform:uppercase">— all songs are in playlists —</div>';
    $('emptyState').style.display='none';return;
  }
  $('emptyState').style.display='none';
  setVirtualSongList(filtered,(song,i)=>{
    return makeRow(song,i,false,favorites.has(String(song.id)),'__loose',false,'Not in a playlist');
  });
}

function renderPlaylists(filter){
  if(playlistsViewMode==='detail'&&currentPlaylist){
    const pl=playlists[currentPlaylist];
    if(!pl){playlistsViewMode='grid';renderPlaylists(filter);return;}
    const songIds=pl.songs;
    $('secTitle').textContent=pl.name;
    $('secCount').textContent=songIds.length+' tracks';
    $('breadcrumbTitle').textContent=pl.name;
    $('breadcrumbSub').textContent=pl.sub;
    $('trackHeader').style.display='';
    if(!songIds.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
    $('emptyState').style.display='none';
    const isCustom=!DEFAULT_KEYS.includes(currentPlaylist);
    setVirtualSongList(songIds,(songId,i)=>{
      const song=getSong(songId);
      if(!song)return'';
      const isActive=i===currentSongIndex&&currentPlaylist===currentPlaylistPlaying;
      return makeRow(song,i,isActive,favorites.has(String(songId)),currentPlaylist,isCustom,song.duration);
    });
    return;
  }
  const q=filter.trim().toLowerCase();
  
  const smartSets=getSmartSets();
  const smartEntries=Object.entries(smartSets).filter(([,s])=>!q||s.name.toLowerCase().includes(q));
  
  const regKeys=Object.keys(playlists).filter(k=>{
    const name=String(playlists[k]?.name||'Untitled Playlist').toLowerCase();
    return !q||name.includes(q);
  });
  
  const totalCount=smartEntries.length+regKeys.length;
  $('secTitle').textContent='Playlists';
  $('secCount').textContent=totalCount+' playlists';
  $('breadcrumbTitle').textContent='Playlists';
  $('breadcrumbSub').textContent='Smart + your playlists';
  $('trackHeader').style.display='none';
  
  if(totalCount===0){
    $('songList').innerHTML='';
    $('emptyState').style.display='block';
    return;
  }
  $('emptyState').style.display='none';
  
  let html='';
  
  if(smartEntries.length>0){
    html+=`<div class="section-header" style="margin-bottom:12px;margin-top:0;padding:0 8px;border:none;">
      <div class="section-title" style="font-size:11px;color:var(--text-dim);letter-spacing:0.12em;text-transform:uppercase;">Smart Playlists</div>
    </div>`;
    html+=`<div class="playlist-grid collection-grid" style="margin-bottom:24px;">${smartEntries.map(([key,s])=>`
      <div class="playlist-card collection-card" data-smart="${esc(key)}" role="button" tabindex="0" title="${esc(s.name)}">
        <div class="collection-mark smart-mark">${esc(s.name.slice(0,1))}</div>
        <div class="card-meta" style="color:var(--accent);">SMART</div>
        <div class="card-name">${esc(s.name)}</div>
        <div class="card-count">${s.songs.length} track${s.songs.length!==1?'s':''}</div>
      </div>`).join('')}</div>`;
  }
  
  if(regKeys.length>0){
    html+=`<div class="section-header" style="margin-bottom:12px;padding:0 8px;border:none;">
      <div class="section-title" style="font-size:11px;color:var(--text-dim);letter-spacing:0.12em;text-transform:uppercase;">Your Playlists</div>
    </div>`;
    html+=`<div class="playlist-grid">${regKeys.map(key=>{
      const pl=playlists[key];
      const isDefault=DEFAULT_KEYS.includes(key);
      const songs=playlistSongs(pl);
      const name=pl?.name||'Untitled Playlist';
      return`<div class="playlist-card" data-playlist="${esc(key)}" role="button" tabindex="0" title="${esc(name)}">
        ${isDefault?'':`<div style="position:absolute;top:8px;right:8px;display:flex;gap:3px;z-index:2;opacity:0;transition:opacity 0.14s;">
          <button class="ctrl-btn" style="width:22px;height:22px;font-size:10px;background:var(--surface2);border:1px solid var(--border-soft);border-radius:4px;" data-rename="${esc(key)}" title="Rename">✎</button>
          <button class="ctrl-btn" style="width:22px;height:22px;font-size:10px;background:var(--surface2);border:1px solid var(--border-soft);border-radius:4px;" data-delete="${esc(key)}" title="Delete">×</button>
        </div>`}
        <svg class="card-folder" viewBox="0 0 36 30"><path class="folder-body" d="M0 6a3 3 0 0 1 3-3h10l3 4h17a3 3 0 0 1 3 3v17a3 3 0 0 1-3 3H3a3 3 0 0 1-3-3V6z"/></svg>
        <div class="card-name">${esc(name)}</div>
        <div class="card-count">${songs.length} track${songs.length!==1?'s':''}</div>
      </div>`;
    }).join('')}</div>`;
  }
  
  $('songList').innerHTML=html;
}

function updateHeroSection(){
  const hs=$('heroSection');
  const targetPl=currentPlaylistPlaying||currentPlaylist;
  if(currentView!=='home'){
    hs.style.display='none';return;
  }
  const pl=playlists[targetPl];
  const song=currentPlaylistPlaying&&pl?getSong(pl.songs[currentSongIndex]):null;
  $('heroTitle').textContent=song?displayTitle(song):'Select a track';
  $('heroArtist').textContent=song?song.artist:'Pick a song to start listening';
  const heroArt=$('heroArt');
  if(song?.cover){
    heroArt.style.backgroundImage=`url(${JSON.stringify(song.cover)})`;
    heroArt.style.backgroundSize='cover';
    heroArt.style.backgroundPosition='center';
    heroArt.classList.add('has-cover');
    $('heroEmoji').style.display='none';
  }else{
    heroArt.style.backgroundImage='';
    heroArt.classList.remove('has-cover');
    $('heroEmoji').style.display='';
  }
  if(song&&isPlaying){
    hs.classList.add('playing');
    $('heroPlayIcon').style.display='none';
    $('heroPauseIcon').style.display='';
  }else{
    hs.classList.remove('playing');
    $('heroPlayIcon').style.display='';
    $('heroPauseIcon').style.display='none';
  }
  hs.style.display='';
}

function updateHeroProgress(){
  const fill=$('heroProgFill');
  if(!fill)return;
  $('heroCurrentTime').textContent=fmt(currentPlaybackTime);
  $('heroTotalTime').textContent=fmt(totalDuration);
  fill.style.width=totalDuration>0?`${(currentPlaybackTime/totalDuration)*100}%`:'0%';
}

function switchPlaylist(key){
  currentPlaylist=key;sortColumn='';sortAsc=true;
  recordPlay(key);
  renderPlaylistNav();renderPlaylistGrid();
  renderSongList($('searchInput').value);saveState();
  updateSortIndicator();
}
function renderPlaylistNav(){}

function randomize(){
  if(currentView==='search')return;
  if(currentView==='library'){
    if(!libraryOrder){
      libraryOrder=[];
      Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((songId,i)=>{
        const song=getSong(songId);
        if(song)libraryOrder.push({...song,playlistKey:pk,songIndex:i});
      }));
    }
    if(libraryOrder.length<2)return;
    for(let i=libraryOrder.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[libraryOrder[i],libraryOrder[j]]=[libraryOrder[j],libraryOrder[i]];}
    renderSongList($('searchInput').value);saveState();
    return;
  }
  const pl=playlists[currentPlaylist];if(!pl||pl.songs.length<2)return;
  const cur=currentSongIndex>=0?pl.songs[currentSongIndex]:null;
  for(let i=pl.songs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pl.songs[i],pl.songs[j]]=[pl.songs[j],pl.songs[i]];}
  if(cur)currentSongIndex=pl.songs.indexOf(cur);
  renderSongList($('searchInput').value);saveState();
}

function toggleSort(col){
  const pl=playlists[currentPlaylist];
  if(!pl||!pl.songs.length)return;
  if(sortColumn===col)sortAsc=!sortAsc;
  else{sortColumn=col;sortAsc=true;}
  const curId=currentSongIndex>=0?pl.songs[currentSongIndex]:null;
  pl.songs.sort((aId,bId)=>{
    const a=getSong(aId),b=getSong(bId);
    if(!a||!b)return 0;
    let va=a[col],vb=b[col];
    if(col==='duration'){
      const pa=String(va).split(':'),pb=String(vb).split(':');
      va=pa.length===2?+pa[0]*60+ +pa[1]:0;
      vb=pb.length===2?+pb[0]*60+ +pb[1]:0;
      if(va===0&&a[col]!=='0:00')va=Infinity;
      if(vb===0&&b[col]!=='0:00')vb=Infinity;
    }else{va=String(va).toLowerCase();vb=String(vb).toLowerCase();}
    const res=typeof va==='number'?va-vb:va.localeCompare(vb,undefined,{numeric:true});
    return sortAsc?res:-res;
  });
  if(curId)currentSongIndex=pl.songs.indexOf(curId);
  libraryOrder=null;updateSortIndicator();
  renderSongList($('searchInput').value);saveState();
}

function updateSortIndicator(){
  const home=currentView==='home';
  const st=$('sortTitle');if(st)st.textContent='Title'+(home&&sortColumn==='title'?(sortAsc?' ▲':' ▼'):'');
  const sd=$('sortDuration');if(sd)sd.textContent=(home?'Duration':'Playlist')+(home&&sortColumn==='duration'?(sortAsc?' ▲':' ▼'):'');
}

/* ── RIGHT PANEL ── */
function switchTab(name, el){
  ['lyrics','queue','stats'].forEach(t=>{
    const panel=document.getElementById('tab-'+t);
    if(panel)panel.style.display=t===name?'':'none';
  });
  document.querySelectorAll('.panel-tab').forEach(t=>t.classList.remove('active'));
  if(el)el.classList.add('active');
  if(name==='stats')updateStats();
}

function updateUpNext(){
  const list=$('upNextList');if(!list)return;
  let html='';
  const empty=$('upNextEmpty');if(empty)empty.style.display=queue.length||currentQueueIdx>=0?'none':'';
  const actions=$('upNextActions');if(actions)actions.style.display=queue.length?'':'none';
  const isOnQueueSong=currentQueueIdx>=0&&currentQueueIdx<queue.length&&queue[currentQueueIdx]&&queue[currentQueueIdx].songIndex===currentSongIndex&&queue[currentQueueIdx].playlistKey===(currentPlaylistPlaying||currentPlaylist);
  const showPlCard=currentSongIndex>=0&&!isOnQueueSong;
  const lastIdx=playlistCardHistory.length-1;
  const items=[];
  for(let i=0;i<queue.length;i++)items.push({type:'queue',i,atPos:i});
  for(let j=0;j<playlistCardHistory.length;j++)items.push({type:'card',j,atPos:playlistCardHistory[j].atPos});
  items.sort((a,b)=>{
    if(a.atPos!==b.atPos)return a.atPos-b.atPos;
    return a.type==='queue'?-1:1;
  });
  for(const it of items){
    if(it.type==='queue'){
      const i=it.i;
      const item=queue[i];
      const pl=playlists[item.playlistKey];
      const song=getSong(pl?.songs[item.songIndex]);
      if(!song)continue;
      let cls='queue-item';
      if(i<currentQueueIdx||(i===currentQueueIdx&&!isOnQueueSong))cls+=' queue-history';
      else if(i===currentQueueIdx&&isOnQueueSong)cls+=' active';
      const draggable=i>currentQueueIdx?'draggable="true"':'';
      const isNpr=i===currentQueueIdx&&isOnQueueSong?' id="nowPlayingRow"':'';
      html+=`<div class="${cls}" ${draggable} data-qi="${i}"${isNpr}>
        ${i>currentQueueIdx?`<span class="queue-drag-handle">≡</span>`:''}
        <div class="queue-thumb"><svg viewBox="0 0 16 16"><path d="M2 3h8l2 3h2v8H2z" fill="currentColor"/></svg></div>
        <div class="queue-info">
          <div class="queue-name${i===currentQueueIdx&&isOnQueueSong?' active':''}">${esc(displayTitle(song))}</div>
          <div class="queue-sub">${esc(song.artist)}</div>
        </div>
        ${i>currentQueueIdx?`<button class="queue-del" data-qdel="${i}" title="Remove from queue">×</button>`:''}
      </div>`;
    }else{
      const j=it.j;
      const entry=playlistCardHistory[j];
      const isActive=showPlCard&&j===lastIdx;
      const cardCls='queue-item '+(isActive?'active':'queue-history');
      html+=`<div class="${cardCls}" style="cursor:default;pointer-events:none;margin:0 0 4px"${isActive?' id="nowPlayingRow"':''}>
        <span class="queue-drag-handle" style="cursor:default;opacity:0.3">≡</span>
        <div class="queue-thumb"><svg viewBox="0 0 16 16"><path d="M2 3h8l2 3h2v8H2z" fill="currentColor"/></svg></div>
        <div class="queue-info">
          <div class="queue-name" style="color:var(--accent2)${isActive?'':';opacity:0.5'}">♪ Playing from playlist</div>
          <div class="queue-sub">${esc(entry.name)}</div>
        </div>
      </div>`;
    }
  }
  list.innerHTML=html;
  const np=document.getElementById('nowPlayingRow');
  if(np)np.scrollIntoView({block:'start',behavior:'smooth'});
  const remaining=currentQueueIdx>=0?queue.length-currentQueueIdx-1:queue.length;
  const count=$('queueCount');if(count)count.textContent=remaining+' tracks';
}

function updateInfinityIndicator(){
  const btn=$('infinityBtn');
  if(!btn)return;
  btn.style.display='';
  btn.textContent=infinityMode==='off'?'∞':'∞';
  btn.title=infinityMode==='off'?'Infinity: Off':infinityMode==='song'?'Infinity: Random Song':'Infinity: Random Playlist';
  btn.classList.toggle('active',infinityMode!=='off');
}
/* ── STATS PANEL ── */
function getQueueAllItems(){
  var filter=$('searchInput').value.trim().toLowerCase();
  var items=[];
  if(currentView==='home'){
    if(filter){
      Object.entries(playlists).forEach(function(e){
        var pk=e[0],pl=e[1];
        pl.songs.forEach(function(songId,i){
          var song=getSong(songId);
          if(song&&((song.customTitle||'').toLowerCase().includes(filter)||song.title.toLowerCase().includes(filter)||(song.fileName||'').toLowerCase().includes(filter)||song.artist.toLowerCase().includes(filter)||(playlists[pk]?.name||'').toLowerCase().includes(filter)))
            items.push({playlistKey:pk,songIndex:i});
        });
      });
    }else{
      var pl=playlists[currentPlaylist];
      if(pl)pl.songs.forEach(function(_,i){items.push({playlistKey:currentPlaylist,songIndex:i});});
    }
  }else if(currentView==='library'){
    if(filter){
      Object.entries(playlists).forEach(function(e){
        var pk=e[0],pl=e[1];
        pl.songs.forEach(function(songId,i){
          var song=getSong(songId);
          if(song&&((song.customTitle||'').toLowerCase().includes(filter)||song.title.toLowerCase().includes(filter)||(song.fileName||'').toLowerCase().includes(filter)||song.artist.toLowerCase().includes(filter)))
            items.push({playlistKey:pk,songIndex:i});
        });
      });
    }else if(libraryOrder){
      libraryOrder.forEach(function(s){items.push({playlistKey:s.playlistKey,songIndex:s.songIndex});});
    }
  }else if(currentView==='favorites'){
    Object.entries(playlists).forEach(function(e){
      var pk=e[0],pl=e[1];
      pl.songs.forEach(function(songId,i){
        if(favorites.has(String(songId)))items.push({playlistKey:pk,songIndex:i});
      });
    });
  }else if(currentView==='search'&&filter){
    Object.entries(playlists).forEach(function(e){
      var pk=e[0],pl=e[1];
      pl.songs.forEach(function(songId,i){
        var song=getSong(songId);
        if(song&&((song.customTitle||'').toLowerCase().includes(filter)||song.title.toLowerCase().includes(filter)||(song.fileName||'').toLowerCase().includes(filter)||song.artist.toLowerCase().includes(filter)||(playlists[pk]?.name||'').toLowerCase().includes(filter)))
          items.push({playlistKey:pk,songIndex:i});
      });
    });
  }else if(currentView==='smart'&&selectedSmart&&selectedSmart!=='looseSongs'){
    var sets=getSmartSets();
    var smart=sets[selectedSmart];
    if(smart)smart.songs.forEach(function(song){items.push({playlistKey:song.playlistKey,songIndex:song.songIndex});});
  }else if(currentView==='artists'&&selectedArtist){
    var artistSongs=allLibrarySongs().filter(function(s){return(String(s.artist||'Unknown').trim()||'Unknown')===selectedArtist;});
    artistSongs.forEach(function(s){items.push({playlistKey:s.playlistKey,songIndex:s.songIndex});});
  }else if(currentView==='albums'&&selectedAlbum){
    var albumSongs=allLibrarySongs().filter(function(s){return(String(s.album||'Unknown Album').trim()||'Unknown Album')===selectedAlbum;});
    albumSongs.forEach(function(s){items.push({playlistKey:s.playlistKey,songIndex:s.songIndex});});
  }else if(playlistsViewMode==='detail'&&currentPlaylist){
    var pl=playlists[currentPlaylist];
    if(pl)pl.songs.forEach(function(_,i){items.push({playlistKey:currentPlaylist,songIndex:i});});
  }
  return items;
}

function updateStats(){
  const panel=$('tab-stats');if(!panel)return;
  const totalPls=Object.keys(playlists).length;
  let totalTracks=0;
  const artistCount={};
  Object.entries(playlists).forEach(([key,pl])=>{
    const len=pl.songs.length;
    totalTracks+=len;
    pl.songs.forEach(songId=>{
      const s=getSong(songId);
      if(!s)return;
      const a=s.artist||'Unknown';
      artistCount[a]=(artistCount[a]||0)+1;
    });
  });
  const topArtists=Object.entries(artistCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxArt=topArtists.length?topArtists[0][1]:1;
  const favoritesCount=favorites.size;
  const monthPlays=getMonthPlays();
  let changed=false;
  Object.keys(monthPlays).forEach(id=>{
    const entry=monthPlays[id];
    if(typeof entry==='number'&&!findSongById(id)){delete monthPlays[id];changed=true;}
  });
  if(changed)saveMonthPlays(monthPlays);
  const sortedPlays=Object.entries(monthPlays).sort((a,b)=>{
    const bc=typeof b[1]==='number'?b[1]:b[1].c;
    const ac=typeof a[1]==='number'?a[1]:a[1].c;
    return bc-ac;
  }).slice(0,5);
  const maxPlay=sortedPlays.length?(typeof sortedPlays[0][1]==='number'?sortedPlays[0][1]:sortedPlays[0][1].c):1;
  const monthNames=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const now=new Date();
  const monthLabel=monthNames[now.getMonth()]+' '+now.getFullYear();

  panel.innerHTML=`
<div class="stat-block">
  <div class="stat-label">Library Overview</div>
  <div class="stat-value">${totalPls} <span class="stat-unit">playlists</span></div>
  <div class="stat-sub">${totalTracks} total tracks · ${favoritesCount} favorites · ${queue.length} in queue</div>
</div>
<div class="stat-block">
  <div class="stat-label">Total Playtime</div>
  <div class="stat-value">${formatPlaytime(totalPlayTime)}</div>
  <div class="stat-sub">All time listening</div>
</div>
<div class="stat-block">
  <div class="stat-label">Session Playtime</div>
  <div class="stat-value">${formatPlaytime(sessionPlayTime)}</div>
  <div class="stat-sub">Since you opened the app</div>
</div>
<div class="stat-block">
  <div class="stat-label">Most Listened This Month</div>
  <div class="stat-sub" style="margin-bottom:6px">${monthLabel}</div>
  ${sortedPlays.length?sortedPlays.map(([id,entry])=>{
    const count=typeof entry==='number'?entry:entry.c;
    const song=findSongById(id);
    const label=song?esc(displayTitle(song)):(entry.t?esc(entry.t):'Unknown');
    const artist=song?esc(song.artist):(entry.a?esc(entry.a):'');
    return `<div class="genre-row" style="display:flex;justify-content:space-between;align-items:flex-start">
    <div class="genre-name" style="width:auto;flex-shrink:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}${artist?'<br><span style="font-size:10px;color:var(--text-dim)">'+artist+'</span>':''}</div>
    <div class="genre-pct" style="flex-shrink:0;margin-left:8px">${count}</div>
  </div>`;
  }).join(''):'<div style="color:var(--text-dim);font-size:11px">No plays yet this month</div>'}
</div>
<div class="stat-block">
  <div class="stat-label">Top Artists</div>
  ${topArtists.length?topArtists.map(([name,count])=>`<div class="genre-row">
    <div class="genre-name">${esc(name)}</div>
    <div class="genre-bar-bg"><div class="genre-bar-fill" style="width:${(count/maxArt*100).toFixed(1)}%"></div></div>
    <div class="genre-pct">${count}</div>
  </div>`).join(''):'<div style="color:var(--text-dim);font-size:11px">No tracks yet</div>'}
</div>`;
}
