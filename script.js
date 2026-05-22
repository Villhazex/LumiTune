const audioExtensions=['.mp3','.wav','.ogg','.flac','.m4a','.aac'];
const DEFAULT_KEYS=[];
const DEFAULT_PLAYLISTS={};

let playlists={};
let audioPlayer=new Audio();
let currentPlaylist='';
let currentSongIndex=-1;
let isPlaying=false;
let isShuffle=false;
let repeatMode=0;
let favorites=new Set();
let volume=0.7;
let isMuted=false;
let playbackInterval=null;
let currentPlaybackTime=0;
let totalDuration=0;
let isDraggingProgress=false;
let isDraggingVolume=false;
let isDraggingPanel=false;
let currentAudioFile=null;
let currentView='home';
let db=null;
let recentPlaylists=[];
let recentSearches=[];
let navHistory=[];
let navFuture=[];
let sortColumn='';
let sortAsc=true;
let playlistsViewMode='grid';
let queue=[];
let libraryOrder=null;
let totalPlayTime=0;
let lastTrackedPos=0;
let lyricLines=[];
let lyricsSynced=false;
let lyricsAbort=null;
let kuroshiroReady=false;
let kuroshiroInitAttempted=false;
let lyricsMode='romaji';
let lyricsHasRomaji=false;
let lyricsShowEdit=false;

const $=id=>document.getElementById(id);
const YT_SERVER='http://localhost:3001';

function getDB(){
  if(db)return Promise.resolve(db);
  return new Promise((res,rej)=>{
    const r=indexedDB.open('LumiToneDB',1);
    r.onupgradeneeded=e=>{if(!e.target.result.objectStoreNames.contains('files'))e.target.result.createObjectStore('files');};
    r.onsuccess=e=>{db=e.target.result;res(db);};
    r.onerror=e=>rej(e.target.error);
  });
}
const dbStore=(k,f)=>getDB().then(d=>new Promise((res,rej)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').put(f,k);tx.oncomplete=res;tx.onerror=e=>rej(e.target.error);}));
const dbGet=k=>getDB().then(d=>new Promise((res,rej)=>{const req=d.transaction('files','readonly').objectStore('files').get(k);req.onsuccess=()=>res(req.result);req.onerror=e=>rej(e.target.error);}));
const dbDel=k=>getDB().then(d=>new Promise((res,rej)=>{const tx=d.transaction('files','readwrite');tx.objectStore('files').delete(k);tx.oncomplete=res;tx.onerror=e=>rej(e.target.error);}));

function saveState(){
  const custom={};
  for(const key of Object.keys(playlists)){
    if(DEFAULT_KEYS.includes(key))continue;
    const pl=playlists[key];
    custom[key]={name:pl.name,emoji:pl.emoji,color:pl.color,sub:pl.sub,songs:pl.songs.map(s=>{const{file,...r}=s;return r;})};
  }
  try{
    localStorage.setItem('lumi-pl',JSON.stringify(custom));
    localStorage.setItem('lumi-fav',JSON.stringify([...favorites]));
    localStorage.setItem('lumi-vol',String(volume));
    localStorage.setItem('lumi-rep',String(repeatMode));
    localStorage.setItem('lumi-shuf',String(isShuffle));
    localStorage.setItem('lumi-cur',currentPlaylist);
    localStorage.setItem('lumi-rec',JSON.stringify(recentPlaylists));
    localStorage.setItem('lumi-src',JSON.stringify(recentSearches));
    localStorage.setItem('lumi-pt',String(totalPlayTime));
  }catch(e){}
}
async function loadState(){
  try{
    const raw=localStorage.getItem('lumi-pl');
    if(raw){
      const custom=JSON.parse(raw);
      for(const[key,pl]of Object.entries(custom)){
        const songs=[];
        for(const s of pl.songs){
          const fk=`file-${key}-${s.id}`;
          const file=await dbGet(fk).catch(()=>null);
          songs.push(file?{...s,file,fileKey:fk}:{...s});
        }
        playlists[key]={...pl,songs};
      }
    }
    const fav=JSON.parse(localStorage.getItem('lumi-fav')||'[]');
    const vol=parseFloat(localStorage.getItem('lumi-vol'));
    const rep=parseInt(localStorage.getItem('lumi-rep'));
    const shuf=localStorage.getItem('lumi-shuf')==='true';
    const cur=localStorage.getItem('lumi-cur');
    favorites=new Set(fav.map(String));
    if(!isNaN(vol))volume=Math.max(0,Math.min(1,vol));
    if(!isNaN(rep))repeatMode=rep%3;
    isShuffle=shuf;
    const keys=Object.keys(playlists);
    if(cur&&keys.includes(cur))currentPlaylist=cur;
    const rec=JSON.parse(localStorage.getItem('lumi-rec')||'[]');
    if(Array.isArray(rec))recentPlaylists=rec.filter(k=>typeof k==='string');
    const src=JSON.parse(localStorage.getItem('lumi-src')||'[]');
    if(Array.isArray(src))recentSearches=src.filter(s=>typeof s==='string');
    totalPlayTime=parseFloat(localStorage.getItem('lumi-pt')||'0');
  }catch(e){console.warn(e);}
}

function fmt(s){
  if(isNaN(s)||s==null)return'0:00';
  return`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
}

function formatPlaytime(s){
  if(isNaN(s)||s==null||s<1)return'0 mins';
  const days=Math.floor(s/86400);
  const hrs=Math.floor((s%86400)/3600);
  const mins=Math.floor((s%3600)/60);
  if(days>0)return`${days}d ${hrs}h ${mins}m`;
  if(hrs>0)return`${hrs}h ${mins}m`;
  return`${mins} mins`;
}
function monthKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
}
function getMonthPlays(){
  try{return JSON.parse(localStorage.getItem('lumi-plays-'+monthKey())||'{}');}catch(e){return{};}
}
function saveMonthPlays(data){
  try{localStorage.setItem('lumi-plays-'+monthKey(),JSON.stringify(data));}catch(e){}
}
function incrementPlayCount(id){
  const sid=String(id);
  const data=getMonthPlays();
  data[sid]=(data[sid]||0)+1;
  saveMonthPlays(data);
}
function findSongById(id){
  const sid=String(id);
  for(const pl of Object.values(playlists)){
    for(const song of pl.songs){
      if(String(song.id)===sid)return song;
    }
  }
  return null;
}
function esc(value){
  return String(value??'').replace(/[&<>"']/g,ch=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  })[ch]);
}

/* ── ROMAJI ── */
function hasJapanese(text){
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
}
async function initKuroshiro(){
  if(kuroshiroReady||kuroshiroInitAttempted)return;
  kuroshiroInitAttempted=true;
  if(typeof Kuroshiro==='undefined'||typeof KuromojiAnalyzer==='undefined')return;
  try{
    window.kuroshiroInst=new Kuroshiro();
    await window.kuroshiroInst.init(new KuromojiAnalyzer({dictPath:'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'}));
    kuroshiroReady=true;
  }catch(e){console.warn('Kuroshiro init failed:',e);}
}
function romajiCacheKey(lines){
  let h=5381;
  for(const l of lines)h=((h<<5)+h)+(l.text?l.text.length:0)+(l.time*100|0);
  return'lumi-rj-'+h;
}
function getRomajiCache(key){
  try{const r=localStorage.getItem(key);return r?JSON.parse(r):null;}catch(e){return null;}
}
function saveRomajiCache(key,data){
  try{localStorage.setItem(key,JSON.stringify(data));}catch(e){}
}
async function convertLinesToRomaji(lines){
  if(!kuroshiroReady||!lines.some(l=>hasJapanese(l.text)))return null;
  const ckey=romajiCacheKey(lines);
  const cached=getRomajiCache(ckey);
  if(cached)return cached;
  const result=[];
  for(const l of lines){
    let romaji='';
    if(hasJapanese(l.text)){
      try{romaji=await window.kuroshiroInst.convert(l.text,{to:'romaji',mode:'spaced'});}catch(e){}
    }
    result.push({time:l.time,original:l.text,romaji});
  }
  saveRomajiCache(ckey,result);
  return result;
}
/* ── LYRICS ── */
function readID3Tags(file){
  return new Promise(res=>{
    if(!file||typeof jsmediatags==='undefined'){res(null);return;}
    jsmediatags.read(file,{
      onSuccess:t=>res(t.tags),
      onError:()=>res(null)
    });
  });
}
async function fetchLyrics(title,artist){
  if(lyricsAbort){lyricsAbort.abort();}
  lyricsAbort=new AbortController();
  const url=`https://lrclib.net/api/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  try{
    const r=await fetch(url,{signal:lyricsAbort.signal});
    if(r.ok)return await r.json();
  }catch(e){if(e.name==='AbortError')return null;}
  const searchUrl=`https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  try{
    const r=await fetch(searchUrl,{signal:lyricsAbort.signal});
    if(r.ok){const arr=await r.json();return arr.length?arr[0]:null;}
  }catch(e){if(e.name==='AbortError')return null;}
  return null;
}
function parseLRC(lrc){
  if(!lrc)return[];
  const lines=lrc.split('\n');
  const result=[];
  const re=/\[(\d{1,3}):(\d{2})(?:\.(\d{2,3}))?\](.*)/;
  for(const line of lines){
    const m=line.match(re);
    if(m){
      const min=parseInt(m[1]),sec=parseInt(m[2]);
      const ms=m[3]?parseInt(m[3].padEnd(3,'0')):0;
      const time=min*60+sec+ms/1000;
      const text=m[4].trim();
      if(text)result.push({time,text});
    }
  }
  return result.sort((a,b)=>a.time-b.time);
}
function renderLyricLines(lines,showEdit){
  const el=$('lyricsContent');if(!el)return;
  const hasRomaji=lines.some(l=>l.romaji);
  lyricsHasRomaji=hasRomaji;
  lyricsShowEdit=!!showEdit;
  el.innerHTML=lines.map((l,i)=>{
    const orig=esc(l.original||l.text||'');
    const roma=esc(l.romaji||'');
    if(lyricsMode==='romaji'&&roma)return `<div class="lyric-line" data-idx="${i}">${roma}</div>`;
    return `<div class="lyric-line" data-idx="${i}">${orig}</div>`;
  }).join('')+(showEdit?`<div class="lyrics-actions" style="margin-top:20px"><button class="lyrics-add-btn primary" id="lyricEditBtn">Edit Lyrics</button><button class="lyrics-add-btn" id="lyricDeleteBtn" style="border-color:rgba(255,80,80,0.25);color:var(--text-dim)">Delete Lyrics</button></div>`:'');
}
async function renderLyrics(data,showEdit){
  const el=$('lyricsContent');if(!el)return;
  lyricLines=[];
  lyricsSynced=false;
  if(!data){el.innerHTML=`<div class="lyrics-none">Lyrics not found for this track</div>`;return;}
  if(data.syncedLyrics){
    const parsed=parseLRC(data.syncedLyrics);
    if(parsed.length){
      lyricsSynced=true;
      const romajiData=await convertLinesToRomaji(parsed);
      if(romajiData&&romajiData.length){
        lyricLines=romajiData;
        renderLyricLines(romajiData,showEdit);
        return;
      }
      lyricLines=parsed;
      renderLyricLines(parsed,showEdit);
      return;
    }
  }
  if(data.plainLyrics){
    const lines=data.plainLyrics.split('\n').filter(l=>l.trim());
    el.innerHTML=lines.map(l=>`<div class="lyric-line">${esc(l.trim())}</div>`).join('')+(showEdit?`<div class="lyrics-actions" style="margin-top:20px"><button class="lyrics-add-btn primary" id="lyricEditBtn">Edit Lyrics</button><button class="lyrics-add-btn" id="lyricDeleteBtn" style="border-color:rgba(255,80,80,0.25);color:var(--text-dim)">Delete Lyrics</button></div>`:'');
    return;
  }
  el.innerHTML=`<div class="lyrics-none">Lyrics not found for this track</div>`;
}
function showLyricsLoading(){
  const el=$('lyricsContent');if(!el)return;
  lyricLines=[];
  lyricsSynced=false;
  el.innerHTML=`<div class="lyrics-loading">Loading lyrics…</div>`;
}
function showLyricsNone(){
  const el=$('lyricsContent');if(!el)return;
  lyricLines=[];
  lyricsSynced=false;
  el.innerHTML=`<div class="lyrics-none">Select a track to see lyrics</div>`;
}
function toggleLyricsMode(){
  setLyricsMode(lyricsMode==='romaji'?'original':'romaji');
}
function setLyricsMode(mode){
  lyricsMode=mode;
  if(lyricLines.length&&lyricsSynced){renderLyricLines(lyricLines,lyricsShowEdit);if(lyricsShowEdit){$('lyricEditBtn')?.addEventListener('click',showEditLyricsModal);$('lyricDeleteBtn')?.addEventListener('click',deleteCurrentUserLyrics);}}
}
function updateLyricHighlight(time){
  if(!lyricsSynced||!lyricLines.length)return;
  const el=$('lyricsContent');if(!el)return;
  let activeIdx=-1;
  for(let i=lyricLines.length-1;i>=0;i--){
    if(time>=lyricLines[i].time){activeIdx=i;break;}
  }
  let changed=false;
  el.querySelectorAll('.lyric-line').forEach((line,i)=>{
    const wasActive=line.classList.contains('active');
    const wasPast=line.classList.contains('past');
    if(i===activeIdx){
      if(!wasActive){line.classList.add('active');changed=true;}
      if(wasPast){line.classList.remove('past');changed=true;}
    }else if(i<activeIdx){
      if(!wasPast){line.classList.add('past');changed=true;}
      if(wasActive){line.classList.remove('active');changed=true;}
    }else{
      if(wasPast){line.classList.remove('past');changed=true;}
      if(wasActive){line.classList.remove('active');changed=true;}
    }
  });
  if(changed&&activeIdx>=0){
    const activeEl=el.querySelector('.lyric-line.active');
    if(activeEl)activeEl.scrollIntoView({block:'center',behavior:'smooth'});
  }
}
function playlistSongs(pl){
  return Array.isArray(pl?.songs)?pl.songs:[];
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

function recordPlay(key){
  if(!playlists[key])return;
  const i=recentPlaylists.indexOf(key);
  if(i>-1)recentPlaylists.splice(i,1);
  recentPlaylists.unshift(key);
}

function switchView(view){
  currentView=view;
  document.querySelectorAll('.nav-item[data-view]').forEach(n=>n.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  $('playlistGrid').style.display=view==='home'?'':'none';
  const header=$('playlistSectionHeader');
  if(header)header.style.display=view==='home'?'':'none';
  libraryOrder=null;
  if(view==='playlists')playlistsViewMode='grid';
  updateSortIndicator();
  renderSongList($('searchInput').value);
  if(view==='home'){renderPlaylistGrid();}
}

function renderSongList(filter=''){
  if(currentView!=='home'||filter)$('heroSection').style.display='none';
  if(currentView==='home')renderHome(filter);
  else if(currentView==='library')renderLibrary(filter);
  else if(currentView==='favorites')renderFavs(filter);
  else renderPlaylists(filter);
}

function makeRow(song,origIdx,isActive,isLiked,plKey,showDel,extra){
  const num=isActive&&isPlaying?'▶':String(origIdx+1).padStart(2,'0');
  const status=isActive
    ?`<span class="badge ${isPlaying?'badge-playing':'badge-paused'}"><span class="badge-dot"></span>${isPlaying?'Playing':'Paused'}</span>`
    :'';
  return`<div class="track-row ${isActive?'active':''}" draggable="true" data-index="${origIdx}" data-playlist="${plKey}">
    <div class="t-num ${isActive&&isPlaying?'playing':''}">${num}</div>
    <div class="t-info">
      <span class="t-title">${song.title}</span>
      <span class="t-artist">${song.artist}</span>
    </div>
    <div class="t-extra">${extra}</div>
    <div class="t-status">${status}</div>
    <div class="t-actions">
      <button class="like-btn ${isLiked?'liked':''}" data-song-id="${song.id}">${isLiked?'★':'☆'}</button>
      <button class="queue-btn-row" data-qadd="${origIdx}" data-qpl="${plKey}" title="Add to queue">↓</button>
      ${showDel?`<button class="del-btn" data-del="${origIdx}">×</button>`:''}
    </div>
  </div>`;
}

function renderHome(filter){
  if(filter){
    $('heroSection').style.display='none';
    const all=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>all.push({...s,playlistKey:pk,songIndex:i})));
    const filtered=all.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(filter.toLowerCase()));
    $('secTitle').textContent='Search Results';
    $('secCount').textContent=filtered.length+' tracks';
    $('breadcrumbTitle').textContent='Search';
    $('breadcrumbSub').textContent='All playlists';
    if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
    $('emptyState').style.display='none';
    $('songList').innerHTML=filtered.map(song=>{
      const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
      return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
    }).join('');
    return;
  }
  const pl=playlists[currentPlaylist];
  if(!pl){$('secTitle').textContent='Tracklist';$('secCount').textContent='0 tracks';$('songList').innerHTML='';$('heroSection').style.display='none';return;}
  const songs=pl.songs;
  $('secTitle').textContent=pl.name;
  $('secCount').textContent=songs.length+' tracks';
  $('breadcrumbTitle').textContent=pl.name;
  $('breadcrumbSub').textContent=pl.sub;
  if(!songs.length){$('songList').innerHTML='';$('emptyState').style.display='block';$('heroSection').style.display='none';return;}
  $('emptyState').style.display='none';
  const isCustom=!DEFAULT_KEYS.includes(currentPlaylist);
  $('songList').innerHTML=songs.map(song=>{
    const oi=songs.indexOf(song);
    return makeRow(song,oi,oi===currentSongIndex,favorites.has(String(song.id)),currentPlaylist,isCustom,song.duration);
  }).join('');
  updateHeroSection();
}

function renderLibrary(filter){
  if(filter){
    const all=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>all.push({...s,playlistKey:pk,songIndex:i})));
    const filtered=all.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(filter.toLowerCase()));
    $('secTitle').textContent='Library';$('secCount').textContent=filtered.length+' tracks';
    if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';libraryOrder=null;return;}
    $('emptyState').style.display='none';
    $('songList').innerHTML=filtered.map(song=>{
      const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
      return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
    }).join('');
    libraryOrder=null;
    return;
  }
  if(!libraryOrder){
    libraryOrder=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>libraryOrder.push({...s,playlistKey:pk,songIndex:i})));
  }
  $('secTitle').textContent='Library';$('secCount').textContent=libraryOrder.length+' tracks';
  if(!libraryOrder.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=libraryOrder.map(song=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
  }).join('');
}

function renderFavs(filter){
  const favs=[];
  Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>favorites.has(String(s.id))&&favs.push({...s,playlistKey:pk,songIndex:i})));
  const filtered=filter?favs.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())):favs;
  $('secTitle').textContent='Favourites';$('secCount').textContent=filtered.length+' tracks';
  $('breadcrumbTitle').textContent='Favourites';$('breadcrumbSub').textContent='Your liked tracks';
  if(!filtered.length){
    $('songList').innerHTML='<div style="padding:60px 20px;text-align:center;font-family:DM Mono,monospace;font-size:10px;color:#4A4844;letter-spacing:.08em;text-transform:uppercase">— no favourites yet —</div>';
    $('emptyState').style.display='none';return;
  }
  $('emptyState').style.display='none';
  $('songList').innerHTML=filtered.map(song=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,true,song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
  }).join('');
}

function renderPlaylists(filter){
  if(playlistsViewMode==='detail'&&currentPlaylist){
    const pl=playlists[currentPlaylist];
    if(!pl){playlistsViewMode='grid';renderPlaylists(filter);return;}
    const songs=pl.songs;
    $('secTitle').textContent=pl.name;
    $('secCount').textContent=songs.length+' tracks';
    $('breadcrumbTitle').textContent=pl.name;
    $('breadcrumbSub').textContent=pl.sub;
    $('trackHeader').style.display='';
    if(!songs.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
    $('emptyState').style.display='none';
    const isCustom=!DEFAULT_KEYS.includes(currentPlaylist);
    $('songList').innerHTML=songs.map(song=>{
      const oi=songs.indexOf(song);
      return makeRow(song,oi,oi===currentSongIndex,favorites.has(String(song.id)),currentPlaylist,isCustom,song.duration);
    }).join('');
    return;
  }
  const q=filter.trim().toLowerCase();
  const keys=Object.keys(playlists).filter(k=>{
    const name=String(playlists[k]?.name||'Untitled Playlist').toLowerCase();
    return !q||name.includes(q);
  });
  $('secTitle').textContent='Playlists';
  $('secCount').textContent=keys.length+' playlists';
  $('breadcrumbTitle').textContent='Playlists';
  $('breadcrumbSub').textContent='Browse all playlists';
  $('trackHeader').style.display='none';
  if(!keys.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="playlist-grid">${keys.map(key=>{
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

function updateHeroSection(){
  const hs=$('heroSection');
  if(!playlists[currentPlaylist]||currentView==='library'||currentView==='favorites'||currentView==='playlists'||$('searchInput').value.trim()){
    hs.style.display='none';return;
  }
  const pl=playlists[currentPlaylist];
  const song=pl.songs[currentSongIndex];
  $('heroEmoji').textContent=pl.emoji;
  $('heroTitle').textContent=song?song.title:'Select a track';
  $('heroArtist').textContent=song?song.artist:'Pick a song to start listening';
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

function playSong(index,playlistKey){
  if(playlistKey&&playlistKey!==currentPlaylist){
    recordNav();audioPlayer.pause();
    if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
    clearInterval(playbackInterval);
    currentPlaylist=playlistKey;currentSongIndex=-1;
    renderPlaylistNav();renderPlaylistGrid();saveState();
  }
  recordPlay(currentPlaylist);
  if(!playlists[currentPlaylist])return;
  const songs=playlists[currentPlaylist].songs;
  if(index<0||index>=songs.length)return;
  currentSongIndex=index;
  const song=songs[index];
  incrementPlayCount(song.id);
  $('trackTitle').textContent=song.title;
  $('trackArtist').textContent=song.artist;
  const aa=$('albumArt');
  aa.querySelector('.art-emoji').textContent=playlists[currentPlaylist].emoji;
  updateLikeBtn();
  isPlaying=true;updatePlayBtn();
  aa.classList.add('playing');
  $('vizBars').classList.add('active');
  lastTrackedPos=0;
  updateHeroSection();
  renderSongList($('searchInput').value);
  if(song.file)playReal(song.file,song);else simPlay(song.duration);
  fetchLyricsForSong(song);
}
let lyricsSongId=null;
let lastLyricsSong=null;

/* ── USER LYRICS ── */
function getUserLyrics(songId){
  try{const all=JSON.parse(localStorage.getItem('lumi-ulyrics')||'{}');return all[songId]||null;}catch(e){return null;}
}
function saveUserLyrics(songId,type,lyrics,song){
  try{
    const all=JSON.parse(localStorage.getItem('lumi-ulyrics')||'{}');
    all[songId]={type,lyrics,title:song?.title||'',artist:song?.artist||''};
    localStorage.setItem('lumi-ulyrics',JSON.stringify(all));
  }catch(e){}
}
function deleteUserLyrics(songId){
  try{const all=JSON.parse(localStorage.getItem('lumi-ulyrics')||'{}');delete all[songId];localStorage.setItem('lumi-ulyrics',JSON.stringify(all));}catch(e){}
}
function detectLyricType(text){
  return /\[\d{1,3}:\d{2}[\.\d]*\]/.test(text)?'synced':'plain';
}
function showLyricsNotFound(song){
  const el=$('lyricsContent');if(!el)return;
  lyricLines=[];lyricsSynced=false;
  const sid=String(song.id);
  el.innerHTML=`<div class="lyrics-none">Lyrics not found</div>
<div class="lyrics-actions">
  <button class="lyrics-add-btn" id="lyricAddPlain">Add Plain Lyrics</button>
  <button class="lyrics-add-btn" id="lyricAddTimestamp">Add Timestamp Lyrics</button>
</div>`;
  setTimeout(()=>{
    $('lyricAddPlain')?.addEventListener('click',()=>showAddPlainLyricsModal(song));
    $('lyricAddTimestamp')?.addEventListener('click',()=>showAddTimestampLyricsModal(song));
  },0);
}
function showAddPlainLyricsModal(song,existing){
  const o=$('confirmOverlay');
  o.innerHTML=`<div class="modal-box" style="max-width:440px">
    <div class="modal-msg">${existing?'Edit':'Add'} Plain Lyrics</div>
    <div class="modal-hint">Paste your lyrics below, one line per verse.</div>
    <textarea class="modal-textarea" id="lyricTextarea" placeholder="Hello world&#10;This is my song&#10;Another lyric line">${existing?esc(existing):''}</textarea>
    <div class="modal-actions">
      <button class="modal-btn" id="mc">Cancel</button>
      <button class="modal-btn modal-ok" id="mo">Save</button>
    </div>
  </div>`;
  o.style.display='flex';
  const ta=$('lyricTextarea');ta.focus();
  const close=r=>{o.style.display='none';if(r)applyUserLyrics(song.id,'plain',r);};
  const kh=e=>{if(e.key==='Escape')close(null);if(e.key==='Enter'&&e.ctrlKey)$('mo').click();};
  document.addEventListener('keydown',kh);
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
  $('mo').onclick=()=>{const v=ta.value.trim();if(v){document.removeEventListener('keydown',kh);close(v);}};
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close(null);}};
}
function showAddTimestampLyricsModal(song,existing){
  const o=$('confirmOverlay');
  const template=existing||`[00:12.00] Hello world\n[00:15.50] This is my song\n[00:20.10] Another lyric line`;
  o.innerHTML=`<div class="modal-box" style="max-width:440px">
    <div class="modal-msg">${existing?'Edit':'Add'} Timestamp Lyrics</div>
    <div class="modal-hint">Edit the timestamps and lyrics below. Format: <code>[mm:ss.xx]</code></div>
    <textarea class="modal-textarea" id="lyricTextarea" style="min-height:200px">${esc(template)}</textarea>
    <div class="modal-hint">Tips: ask AI to generate synced .lrc lyrics for "${esc(song.title)}" using this format.</div>
    <div class="modal-actions">
      <button class="modal-btn" id="mc">Cancel</button>
      <button class="modal-btn modal-ok" id="mo">Save</button>
    </div>
  </div>`;
  o.style.display='flex';
  const ta=$('lyricTextarea');ta.focus();ta.select();
  const close=r=>{o.style.display='none';if(r)applyUserLyrics(song.id,'synced',r);};
  const kh=e=>{if(e.key==='Escape')close(null);if(e.key==='Enter'&&e.ctrlKey)$('mo').click();};
  document.addEventListener('keydown',kh);
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close(null);};
  $('mo').onclick=()=>{const v=ta.value.trim();if(v){document.removeEventListener('keydown',kh);close(v);}};
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close(null);}};
}
async function deleteCurrentUserLyrics(){
  if(!lastLyricsSong)return;
  if(!await showConfirm('Delete custom lyrics for this track?'))return;
  deleteUserLyrics(lastLyricsSong.id);
  lyricLines=[];lyricsSynced=false;lyricsShowEdit=false;
  fetchLyricsForSong(lastLyricsSong);
}
function showEditLyricsModal(){
  if(!lastLyricsSong)return;
  const user=getUserLyrics(lastLyricsSong.id);
  if(!user)return;
  if(user.type==='synced')showAddTimestampLyricsModal(lastLyricsSong,user.lyrics);
  else showAddPlainLyricsModal(lastLyricsSong,user.lyrics);
}
async function applyUserLyrics(songId,forcedType,text){
  const type=forcedType||detectLyricType(text);
  const song=lastLyricsSong;
  if(song)saveUserLyrics(songId,type,text,song);
  const data=type==='synced'?{syncedLyrics:text}:{plainLyrics:text};
  await renderLyrics(data,true);
  if(song){$('lyricEditBtn')?.addEventListener('click',showEditLyricsModal);$('lyricDeleteBtn')?.addEventListener('click',deleteCurrentUserLyrics);}
}
async function fetchLyricsForSong(song){
  lyricsSongId=song.id;
  lastLyricsSong=song;
  showLyricsLoading();
  initKuroshiro();
  let title=song.title;
  let artist=song.artist;
  if(song.file&&typeof jsmediatags!=='undefined'){
    const tags=await readID3Tags(song.file);
    if(lyricsSongId!==song.id)return;
    if(tags){
      if(tags.title)title=tags.title;
      if(tags.artist)artist=tags.artist;
    }
  }
  if(lyricsSongId!==song.id)return;
  const user=getUserLyrics(song.id);
  if(user){
    await renderLyrics(user.type==='synced'?{syncedLyrics:user.lyrics}:{plainLyrics:user.lyrics},true);
    setTimeout(()=>{$('lyricEditBtn')?.addEventListener('click',showEditLyricsModal);$('lyricDeleteBtn')?.addEventListener('click',deleteCurrentUserLyrics);},0);
    return;
  }
  const data=await fetchLyrics(title,artist);
  if(lyricsSongId!==song.id)return;
  if(!data){showLyricsNotFound(song);return;}
  await renderLyrics(data);
}

function playReal(file,song){
  currentAudioFile=file;
  audioPlayer.src=URL.createObjectURL(file);
  audioPlayer.volume=isMuted?0:volume;
  audioPlayer.play().catch(()=>{});
  audioPlayer.onloadedmetadata=()=>{totalDuration=audioPlayer.duration;$('totalTime').textContent=fmt(totalDuration);$('heroTotalTime').textContent=fmt(totalDuration);song.duration=fmt(totalDuration);renderSongList($('searchInput').value);};
  audioPlayer.ontimeupdate=()=>{if(!isDraggingProgress){currentPlaybackTime=audioPlayer.currentTime;if(isPlaying){const delta=currentPlaybackTime-lastTrackedPos;if(delta>0&&delta<5){totalPlayTime+=delta;}}lastTrackedPos=currentPlaybackTime;updateLyricHighlight(currentPlaybackTime);$('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;updateHeroProgress();}};
  audioPlayer.onended=handleEnd;
}

function simPlay(durStr){
  clearInterval(playbackInterval);
  if(!durStr||durStr==='--:--'){totalDuration=0;$('totalTime').textContent='--:--';$('currentTime').textContent='0:00';$('progressFill').style.width='0%';updateHeroProgress();return;}
  const p=durStr.split(':');
  totalDuration=parseInt(p[0])*60+parseInt(p[1]);
  currentPlaybackTime=0;
  $('totalTime').textContent=durStr;$('currentTime').textContent='0:00';$('progressFill').style.width='0%';updateHeroProgress();
  playbackInterval=setInterval(()=>{
    if(isPlaying){currentPlaybackTime+=0.1;totalPlayTime+=0.1;updateLyricHighlight(currentPlaybackTime);if(currentPlaybackTime>=totalDuration){$('currentTime').textContent=fmt(totalDuration);$('progressFill').style.width='100%';updateHeroProgress();handleEnd();return;}
    $('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;updateHeroProgress();
}},100);
}

function handleEnd(){
  clearInterval(playbackInterval);
  const songs=playlists[currentPlaylist].songs;
  if(repeatMode===2)playSong(currentSongIndex);
  else if(repeatMode===1||currentSongIndex<songs.length-1)playNext();
  else{isPlaying=false;updatePlayBtn();$('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');updateHeroSection();renderSongList($('searchInput').value);showLyricsNone();}
}

function playNext(){
  if(queue.length){
    const item=queue.shift();updateQueueUI();
    playSong(item.songIndex,item.playlistKey);
    return;
  }
  const songs=playlists[currentPlaylist].songs;if(!songs.length)return;
  let next;
  if(isShuffle){do{next=Math.floor(Math.random()*songs.length);}while(next===currentSongIndex&&songs.length>1);}
  else next=(currentSongIndex+1)%songs.length;
  playSong(next);
}
function playPrev(){
  const songs=playlists[currentPlaylist].songs;if(!songs.length)return;
  if(currentPlaybackTime>3){currentPlaybackTime=0;if(currentAudioFile)audioPlayer.currentTime=0;else simPlay(songs[currentSongIndex]?.duration);return;}
  playSong((currentSongIndex-1+songs.length)%songs.length);
}

async function handleFolderSelect(e){
  const files=Array.from(e.target.files).filter(f=>audioExtensions.includes('.'+f.name.split('.').pop().toLowerCase()));
  if(!files.length){alert('No audio files found.');return;}
  let name=await showInput('Playlist name:','My Playlist');
  if(!name){e.target.value='';return;}
  name=name.trim()||'My Playlist';
  const key='custom-'+Date.now();
  const songs=[];
  for(const[idx,file]of files.entries()){
    const id=key+'-'+idx;const fk=`file-${key}-${id}`;
    await dbStore(fk,file);
    songs.push({id,title:file.name.replace(/\.[^/.]+$/,''),artist:'Unknown',duration:'--:--',file,fileKey:fk});
  }
  playlists[key]={name,emoji:'📂',color:'#D4522A',sub:`${files.length} tracks`,songs};
  libraryOrder=null;renderPlaylistNav();renderPlaylistGrid();switchPlaylist(key);saveState();
  e.target.value='';
}

async function handleAddTracks(e){
  const files=Array.from(e.target.files).filter(f=>audioExtensions.includes('.'+f.name.split('.').pop().toLowerCase()));
  if(!files.length){e.target.value='';return;}
  const targetKey=await showPlaylistPicker();
  if(!targetKey){e.target.value='';return;}
  const pl=playlists[targetKey];const startId=Date.now();
  for(const[idx,file]of files.entries()){
    const id=startId+idx;const fk=`file-${targetKey}-${id}`;
    await dbStore(fk,file);
    pl.songs.push({id,title:file.name.replace(/\.[^/.]+$/,''),artist:'Unknown',duration:'--:--',file,fileKey:fk});
  }
  pl.sub=`${pl.songs.length} tracks`;
  libraryOrder=null;if(currentPlaylist===targetKey)renderSongList($('searchInput').value);
  renderPlaylistNav();renderPlaylistGrid();saveState();e.target.value='';
}

function showPlaylistPicker(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    const keys=Object.keys(playlists);
    o.innerHTML=`<div class="modal-box picker-box">
      <div class="modal-msg">Choose a playlist</div>
      <div class="picker-list">${keys.map(k=>{
        const pl=playlists[k];
        return`<button class="picker-item" data-pick="${esc(k)}">
          <span class="picker-emoji">${esc(pl.emoji||'♫')}</span>
          <span class="picker-name">${esc(pl.name)}</span>
          <span class="picker-count">${pl.songs.length} tracks</span>
        </button>`;
      }).join('')}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc">Cancel</button>
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

async function handleDeletePlaylist(key){
  if(DEFAULT_KEYS.includes(key))return;
  if(!(await showConfirm(`Delete "${playlists[key].name}"?`)))return;
  await Promise.all(playlists[key].songs.filter(s=>s.fileKey).map(s=>dbDel(s.fileKey)));
  const isCur=currentPlaylist===key;
  delete playlists[key];renderPlaylistNav();renderPlaylistGrid();saveState();
  if(isCur){
    audioPlayer.pause();
    if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
    clearInterval(playbackInterval);
    currentSongIndex=-1;isPlaying=false;updatePlayBtn();
    $('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');
    $('trackTitle').textContent='Select a track';$('trackArtist').textContent='Awaiting input';
    $('progressFill').style.width='0%';$('currentTime').textContent='0:00';$('totalTime').textContent='0:00';
    $('heroSection').style.display='none';
    const keys=Object.keys(playlists);if(keys.length)switchPlaylist(keys[0]);
  }
}

async function handleDeleteTrack(index){
  const song=playlists[currentPlaylist].songs[index];
  if(!(await showConfirm(`Remove "${song.title}"?`)))return;
  if(song.fileKey)await dbDel(song.fileKey);
  playlists[currentPlaylist].songs.splice(index,1);
  if(currentSongIndex===index){
    audioPlayer.pause();
    if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
    clearInterval(playbackInterval);
    currentSongIndex=-1;isPlaying=false;updatePlayBtn();
    $('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');
    $('trackTitle').textContent='Select a track';$('trackArtist').textContent='Awaiting input';
    $('progressFill').style.width='0%';$('currentTime').textContent='0:00';$('totalTime').textContent='0:00';
    $('heroSection').style.display='none';
  }else if(currentSongIndex>index)currentSongIndex--;
  libraryOrder=null;renderSongList($('searchInput').value);saveState();
}

async function handleRename(key){
  const newName=await showRename(playlists[key].name);if(!newName)return;
  playlists[key].name=newName;
  renderPlaylistNav();renderPlaylistGrid();
  if(key===currentPlaylist){$('breadcrumbTitle').textContent=newName;$('secTitle').textContent=newName;}
  saveState();
}

function togglePlay(){
  if(currentSongIndex===-1){if(Object.keys(playlists).length)playSong(0);return;}
  isPlaying=!isPlaying;updatePlayBtn();
  if(isPlaying){$('albumArt').classList.add('playing');$('vizBars').classList.add('active');if(currentAudioFile)audioPlayer.play();}
  else{$('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');if(currentAudioFile)audioPlayer.pause();localStorage.setItem('lumi-pt',String(totalPlayTime));}
  updateHeroSection();renderSongList($('searchInput').value);
}
function updatePlayBtn(){
  $('playIcon').style.display=isPlaying?'none':'inline';
  $('pauseIcon').style.display=isPlaying?'inline':'none';
  $('heroPlayIcon').style.display=isPlaying?'none':'inline';
  $('heroPauseIcon').style.display=isPlaying?'inline':'none';
}
function toggleShuffle(){isShuffle=!isShuffle;$('shuffleBtn').classList.toggle('active',isShuffle);const hs=$('heroShuffleBtn');if(hs)hs.classList.toggle('active',isShuffle);saveState();}
function toggleRepeat(){repeatMode=(repeatMode+1)%3;$('repeatBtn').classList.toggle('active',repeatMode>0);$('repeatBtn').textContent=repeatMode===2?'↺¹':'↺';const hr=$('heroRepeatBtn');if(hr){hr.classList.toggle('active',repeatMode>0);hr.textContent=repeatMode===2?'↺¹':'↺';}saveState();}
function toggleFav(id){
  id=String(id);
  if(favorites.has(id))favorites.delete(id);else favorites.add(id);
  updateLikeBtn();renderSongList($('searchInput').value);saveState();
}
function updateLikeBtn(){
  if(currentSongIndex===-1)return;
  const id=String(playlists[currentPlaylist].songs[currentSongIndex].id);
  const liked=favorites.has(id);
  $('likeBtn').classList.toggle('liked',liked);
  $('likeBtn').textContent=liked?'★':'☆';
}
function seekTo(e){
  const rect=$('progressBar').getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  currentPlaybackTime=pct*totalDuration;
  $('progressFill').style.width=`${pct*100}%`;
  $('currentTime').textContent=fmt(currentPlaybackTime);
  const hf=$('heroProgFill');if(hf)hf.style.width=`${pct*100}%`;
  const hc=$('heroCurrentTime');if(hc)hc.textContent=fmt(currentPlaybackTime);
  if(currentAudioFile)audioPlayer.currentTime=currentPlaybackTime;
  lastTrackedPos=currentPlaybackTime;
}
function seekHero(e){
  const el=$('heroProgBar');if(!el)return;
  const rect=el.getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  currentPlaybackTime=pct*totalDuration;
  $('heroProgFill').style.width=`${pct*100}%`;
  $('heroCurrentTime').textContent=fmt(currentPlaybackTime);
  $('progressFill').style.width=`${pct*100}%`;
  $('currentTime').textContent=fmt(currentPlaybackTime);
  if(currentAudioFile)audioPlayer.currentTime=currentPlaybackTime;
  lastTrackedPos=currentPlaybackTime;
}
function setVol(e){
  const rect=$('volBar').getBoundingClientRect();
  volume=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  $('volFill').style.width=`${volume*100}%`;
  isMuted=false;audioPlayer.volume=volume;
  updateVolIcon();saveState();
  const vs=$('heroVolSlider');if(vs)vs.value=Math.round(volume*100);
  const vl=$('heroVolLabel');if(vl)vl.textContent='VOL '+Math.round(volume*100);
}
function toggleMute(){isMuted=!isMuted;audioPlayer.volume=isMuted?0:volume;updateVolIcon();}
function updateVolIcon(){
  $('volBtn').textContent=(isMuted||volume===0)?'mute':'vol';
  const vs=$('heroVolSlider');if(vs)vs.value=isMuted?0:Math.round(volume*100);
  const vl=$('heroVolLabel');if(vl)vl.textContent=isMuted?'VOL 0':'VOL '+Math.round(volume*100);
}

function showMessage(msg,btn){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box" style="text-align:center">
      <div class="modal-msg">${msg}</div>
      ${btn?`<div class="modal-actions" style="justify-content:center"><button class="modal-btn modal-ok" id="mo">${btn}</button></div>`:''}
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

function extractYouTubeId(url){
  const m=url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  return m?m[1]:null;
}

async function fetchYouTubeInfo(videoId){
  const r=await fetch(`${YT_SERVER}/api/info?url=https://www.youtube.com/watch?v=${videoId}`);
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||`Server returned ${r.status}`);}
  return r.json();
}

async function fetchYouTubeAudio(videoId){
  const r=await fetch(`${YT_SERVER}/api/download?url=https://www.youtube.com/watch?v=${videoId}`);
  if(!r.ok){const e=await r.json().catch(()=>({}));throw new Error(e.error||`Server returned ${r.status}`);}
  const title=decodeURIComponent(r.headers.get('X-Title')||'');
  const author=decodeURIComponent(r.headers.get('X-Author')||'');
  const blob=await r.blob();
  return{blob,title,author};
}

function showConfirm(msg){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box">
      <div class="modal-msg">${msg}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc">Cancel</button>
        <button class="modal-btn modal-ok" id="mo">Delete</button>
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
        <button class="modal-btn" id="mc">Cancel</button>
        <button class="modal-btn modal-ok" id="mo">Create</button>
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
function showRename(current){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box">
      <div class="modal-msg">Rename playlist</div>
      <input type="text" class="modal-input" id="mi" value="${current||''}">
      <div class="modal-actions">
        <button class="modal-btn" id="mc">Cancel</button>
        <button class="modal-btn modal-ok" id="mo">Save</button>
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

function showSourcePicker(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    o.innerHTML=`<div class="modal-box source-picker-box">
      <div class="modal-msg">Add Track From</div>
      <div class="source-picker-grid">
        <button class="source-option" data-source="local">
          <span class="source-icon">📁</span>
          <span class="source-label">Local</span>
          <span class="source-desc">Browse files</span>
        </button>
        <button class="source-option" data-source="youtube">
          <span class="source-icon">▶</span>
          <span class="source-label">YouTube</span>
          <span class="source-desc">Download audio</span>
        </button>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc">Cancel</button>
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
        <button class="source-option" data-source="empty">
          <span class="source-icon">📄</span>
          <span class="source-label">Empty</span>
          <span class="source-desc">Create blank playlist</span>
        </button>
        <button class="source-option" data-source="songs">
          <span class="source-icon">📁</span>
          <span class="source-label">Add Songs</span>
          <span class="source-desc">Select audio files</span>
        </button>
      </div>
      <div class="modal-actions">
        <button class="modal-btn" id="mc">Cancel</button>
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

function showSettingsModal(){
  const o=$('confirmOverlay');
  const modeLabel=lyricsMode==='romaji'?'Romaji':'Japanese';
  o.innerHTML=`<div class="modal-box source-picker-box">
    <div class="modal-msg">Settings</div>
    <div class="source-picker-grid">
      <button class="source-option" id="settingsExport">
        <span class="source-icon">⬇</span>
        <span class="source-label">Export</span>
        <span class="source-desc">Backup playlists to JSON</span>
      </button>
      <button class="source-option" id="settingsImport">
        <span class="source-icon">⬆</span>
        <span class="source-label">Import</span>
        <span class="source-desc">Restore from backup</span>
      </button>
      <button class="source-option" id="settingsLyricMode">
        <span class="source-icon">♪</span>
        <span class="source-label">Lyric Display</span>
        <span class="source-desc" id="settingsLyricModeLabel">${modeLabel}</span>
      </button>
    </div>
    <div class="modal-actions">
      <button class="modal-btn modal-ok" id="mc">Close</button>
    </div>
  </div>`;
  o.style.display='flex';
  const close=()=>{o.style.display='none'};
  const kh=e=>{if(e.key==='Escape')close()};
  document.addEventListener('keydown',kh);
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close();}};
  $('settingsExport').onclick=()=>{document.removeEventListener('keydown',kh);close();exportPlaylists();};
  $('settingsImport').onclick=()=>{
    const inp=document.createElement('input');
    inp.type='file';inp.accept='.json';inp.style.display='none';
    inp.addEventListener('change',async e=>{document.removeEventListener('keydown',kh);close();await importPlaylists(e);});
    document.body.appendChild(inp);
    inp.click();
    setTimeout(()=>document.body.removeChild(inp),1000);
  };
  $('settingsLyricMode').onclick=()=>{
    toggleLyricsMode();
    const lbl=$('settingsLyricModeLabel');
    if(lbl)lbl.textContent=lyricsMode==='romaji'?'Romaji':'Japanese';
  };
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close();};
}

async function handleCreateEmptyPlaylist(){
  const name=await showInput('Playlist name:','My Playlist');
  if(!name)return;
  const key='custom-'+Date.now();
  playlists[key]={name,emoji:'📂',color:'#D4522A',sub:'0 tracks',songs:[]};
  renderPlaylistNav();renderPlaylistGrid();switchPlaylist(key);saveState();
}

function exportPlaylists(){
  const data={version:1,exportedAt:new Date().toISOString(),playlists:{},favorites:[...favorites]};
  for(const[key,pl]of Object.entries(playlists)){
    if(DEFAULT_KEYS.includes(key))continue;
    data.playlists[key]={name:pl.name,emoji:pl.emoji,color:pl.color,sub:pl.sub,songs:pl.songs.map(s=>({id:s.id,title:s.title,artist:s.artist,duration:s.duration,fileKey:s.fileKey||`file-${key}-${s.id}`}))};
  }
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=`lumitune-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function importPlaylists(e){
  const file=e.target.files[0];
  if(!file)return;
  try{
    const text=await file.text();
    const data=JSON.parse(text);
    if(!data.version||!data.playlists)return showMessage('Invalid backup file','OK');
    let count=0,missing=0;
    for(const[key,pl]of Object.entries(data.playlists)){
      if(playlists[key])continue;
      const songs=(pl.songs||[]).map(s=>({id:s.id,title:s.title,artist:s.artist||'Unknown',duration:s.duration||'--:--',fileKey:s.fileKey||null}));
      for(const s of songs){
        if(s.fileKey){const f=await dbGet(s.fileKey).catch(()=>null);if(f){s.file=f;}else missing++;}
        else missing++;
      }
      playlists[key]={name:pl.name||'Untitled',emoji:pl.emoji||'📂',color:pl.color||'#D4522A',sub:pl.sub||`${pl.songs?.length||0} tracks`,songs};
      count++;
    }
    if(data.favorites)data.favorites.forEach(id=>favorites.add(String(id)));
    renderPlaylistNav();renderPlaylistGrid();renderSongList($('searchInput').value);saveState();
    let msg=`Imported ${count} playlist${count!==1?'s':''}`;
    if(missing)msg+=`<br><span style="font-size:11px;color:var(--text3)">${missing} song${missing!==1?'s':''} have no audio — re-add via Add Tracks</span>`;
    showMessage(msg,'OK');
  }catch(err){showMessage('Failed to parse file','OK');}
  e.target.value='';
}

async function handleYouTubeImport(){
  const url=await showInput('Paste YouTube URL:','');
  if(!url)return;
  const id=extractYouTubeId(url.trim());
  if(!id){await showMessage('Invalid YouTube URL','OK');return;}
  const loading=showLoading('<div class="yt-loading"><div class="yt-spinner"></div>Fetching video info&hellip;</div>');
  let info;
  try{info=await fetchYouTubeInfo(id);}catch(e){loading(null);await showMessage(`<div class="yt-error">API failed<br><span style="font-size:11px;color:var(--text3)">${esc(e.message||'Is the server running? node server.js')}</span></div>`,'OK');return;}
  loading(null);
  const targetKey=await showPlaylistPicker();
  if(!targetKey)return;
  const loading2=showLoading('<div class="yt-loading"><div class="yt-spinner"></div>Downloading audio&hellip;</div>');
  try{
    const pl=playlists[targetKey];
    const sid=Date.now();
    const fk=`file-${targetKey}-${sid}`;
    const{blob,title,author}=await fetchYouTubeAudio(id);
    await dbStore(fk,blob);
    pl.songs.push({id:sid,title:title||info.title||'Unknown',artist:author||info.author_name||'YouTube',duration:'--:--',file:blob,fileKey:fk});
    pl.sub=`${pl.songs.length} tracks`;
    if(currentPlaylist===targetKey)renderSongList($('searchInput').value);
    renderPlaylistNav();renderPlaylistGrid();saveState();
    loading2(null);
    await showMessage(`<div class="yt-success">✓ Added<br><strong>${esc(title||info.title)}</strong></div>`,'OK');
  }catch(e){loading2(null);await showMessage(`<div class="yt-error">Download failed<br><span style="font-size:11px;color:var(--text3)">${esc(e.message||'Unknown error')}</span></div>`,'OK');}
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
  if(currentView==='library'){
    if(!libraryOrder){
      libraryOrder=[];
      Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>libraryOrder.push({...s,playlistKey:pk,songIndex:i})));
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
  const cur=currentSongIndex>=0?pl.songs[currentSongIndex]:null;
  pl.songs.sort((a,b)=>{
    let va=a[col],vb=b[col];
    if(col==='duration'){
      const pa=String(va).split(':'),pb=String(vb).split(':');
      va=pa.length===2?+pa[0]*60+ +pa[1]:0;
      vb=pb.length===2?+pb[0]*60+ +pb[1]:0;
      if(va===0&&a[col]!=='0:00')va=Infinity;
      if(vb===0&&b[col]!=='0:00')vb=Infinity;
    }else{va=String(va).toLowerCase();vb=String(vb).toLowerCase();}
    const res=typeof va==='number'?va-vb:va.localeCompare(vb);
    return sortAsc?res:-res;
  });
  if(cur)currentSongIndex=pl.songs.indexOf(cur);
  libraryOrder=null;updateSortIndicator();
  renderSongList($('searchInput').value);saveState();
}
function updateSortIndicator(){
  const home=currentView==='home';
  const st=$('sortTitle');if(st)st.textContent='Title'+(home&&sortColumn==='title'?(sortAsc?' ▲':' ▼'):'');
  const sd=$('sortDuration');if(sd)sd.textContent=(home?'Duration':'Playlist')+(home&&sortColumn==='duration'?(sortAsc?' ▲':' ▼'):'');
}

function addToQueue(playlistKey,songIndex){
  const pl=playlists[playlistKey];
  if(!pl||songIndex<0||songIndex>=pl.songs.length)return;
  queue.push({playlistKey,songIndex});
  updateQueueUI();updateUpNext();
}
function removeFromQueue(index){
  if(index<0||index>=queue.length)return;
  queue.splice(index,1);
  renderQueue();updateQueueUI();updateUpNext();
}
function clearQueue(){queue=[];updateQueueUI();updateUpNext();}
function updateQueueUI(){
  const btn=$('queueBtn'),badge=$('queueBadge');
  if(!btn)return;
  if(queue.length){badge.textContent=queue.length;badge.style.display='';}else{badge.style.display='none';}
}
function renderQueue(){
  const o=$('confirmOverlay');
  if(!queue.length){
    o.innerHTML=`<div class="modal-box source-picker-box">
      <div class="modal-msg">Up Next</div>
      <div style="text-align:center;padding:24px 0;font-size:12px;color:var(--text3)">Queue is empty</div>
      <div class="modal-actions"><button class="modal-btn modal-ok" id="mc">Close</button></div>
    </div>`;
  }else{
    o.innerHTML=`<div class="modal-box source-picker-box" style="max-width:400px">
      <div class="modal-msg">Up Next <span style="font-family:'DM Mono',monospace;font-size:11px;color:var(--text3)">(${queue.length})</span></div>
      <div class="queue-list">${queue.map((item,i)=>{
        const pl=playlists[item.playlistKey];
        const song=pl?.songs[item.songIndex];
        if(!song)return'';
        return`<div class="queue-item" draggable="true" data-qi="${i}">
          <span class="drag-handle">≡</span>
          <span class="queue-num">${i+1}</span>
          <span class="queue-info"><span class="queue-title">${esc(song.title)}</span><span class="queue-artist">${esc(song.artist)}</span></span>
          <span class="queue-pl">${esc(pl?.name||'')}</span>
          <button class="queue-del" data-qdel="${i}">×</button>
        </div>`;
      }).join('')}</div>
      <div class="modal-actions">
        <button class="modal-btn" id="queueClear">Clear</button>
        <button class="modal-btn modal-ok" id="mc">Close</button>
      </div>
    </div>`;
  }
  o.style.display='flex';
  const close=()=>{o.style.display='none'};
  const kh=e=>{if(e.key==='Escape')close()};
  document.addEventListener('keydown',kh);
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close();}};
  const mc=$('mc');
  if(mc)mc.onclick=()=>{document.removeEventListener('keydown',kh);close();};
  const qc=$('queueClear');
  if(qc)qc.onclick=()=>{document.removeEventListener('keydown',kh);clearQueue();close();};
  o.querySelectorAll('.queue-del').forEach(btn=>{btn.onclick=()=>{const idx=parseInt(btn.dataset.qdel);removeFromQueue(idx);if(!queue.length)close();};});
}

function recordNav(){navHistory.push({view:currentView,playlist:currentPlaylist});navFuture=[];updateNavBtns();}
function goBack(){
  if(!navHistory.length)return;
  navFuture.push({view:currentView,playlist:currentPlaylist});
  const s=navHistory.pop();applyNavState(s);
}
function goForward(){
  if(!navFuture.length)return;
  navHistory.push({view:currentView,playlist:currentPlaylist});
  const s=navFuture.pop();applyNavState(s);
}
function applyNavState(s){
  if(s.playlist!==currentPlaylist&&s.view!=='playlists'){currentPlaylist=s.playlist;renderPlaylistNav();renderPlaylistGrid();}
  switchView(s.view);saveState();updateNavBtns();
}
function updateNavBtns(){$('backBtn').disabled=!navHistory.length;$('forwardBtn').disabled=!navFuture.length;}

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
  const empty=$('upNextEmpty');if(empty)empty.style.display=queue.length?'none':'';
  const clear=$('upNextClear');if(clear)clear.style.display=queue.length?'':'none';
  const count=$('queueCount');if(count)count.textContent=queue.length+' tracks';
  if(!queue.length){list.innerHTML='';return;}
  list.innerHTML=queue.map((item,i)=>{
    const pl=playlists[item.playlistKey];
    const song=pl?.songs[item.songIndex];
    if(!song)return'';
    return`<div class="queue-item ${item.playlistKey===currentPlaylist&&item.songIndex===currentSongIndex?'active':''}" draggable="true" data-qi="${i}">
      <span class="queue-drag-handle">≡</span>
      <span class="queue-num ${item.playlistKey===currentPlaylist&&item.songIndex===currentSongIndex?'active':''}">${i+1}</span>
      <div class="queue-thumb"><svg viewBox="0 0 16 16"><path d="M2 3h8l2 3h2v8H2z" fill="currentColor"/></svg></div>
      <div class="queue-info">
        <div class="queue-name ${item.playlistKey===currentPlaylist&&item.songIndex===currentSongIndex?'active':''}">${esc(song.title)}</div>
        <div class="queue-sub">${esc(pl?.name||'')} · ${esc(song.artist)}</div>
      </div>
      <button class="queue-del" data-qdel="${i}">×</button>
    </div>`;
  }).join('');
}

/* ── STATS PANEL ── */
function updateStats(){
  const panel=$('tab-stats');if(!panel)return;
  const totalPls=Object.keys(playlists).length;
  let totalTracks=0;
  const artistCount={};
  Object.entries(playlists).forEach(([key,pl])=>{
    const len=pl.songs.length;
    totalTracks+=len;
    pl.songs.forEach(s=>{
      const a=s.artist||'Unknown';
      artistCount[a]=(artistCount[a]||0)+1;
    });
  });
  const topArtists=Object.entries(artistCount).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxArt=topArtists.length?topArtists[0][1]:1;
  const favoritesCount=favorites.size;
  const monthPlays=getMonthPlays();
  const sortedPlays=Object.entries(monthPlays).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const maxPlay=sortedPlays.length?sortedPlays[0][1]:1;
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
  <div class="stat-label">Most Listened This Month</div>
  <div class="stat-sub" style="margin-bottom:6px">${monthLabel}</div>
  ${sortedPlays.length?sortedPlays.map(([id,count])=>{
    const song=findSongById(id);
    const label=song?esc(song.title):'Unknown';
    const artist=song?esc(song.artist):'';
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

$('upNextClear')?.addEventListener('click',()=>{clearQueue();updateUpNext();});

$('upNextList')?.addEventListener('click',e=>{
  const del=e.target.closest('.queue-del');
  if(del){
    const idx=parseInt(del.dataset.qdel);
    if(idx>=0&&idx<queue.length){queue.splice(idx,1);updateQueueUI();updateUpNext();}
    return;
  }
  const item=e.target.closest('.queue-item');
  if(item&&item.dataset.qi!==undefined){
    const qi=parseInt(item.dataset.qi);
    const q=queue[qi];
    if(q)playSong(q.songIndex,q.playlistKey);
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
  if(targetIdx!==upNextDragSrc){
    const overTop=target.classList.contains('drag-over-top');
    const [item]=queue.splice(upNextDragSrc,1);
    queue.splice(overTop?targetIdx:targetIdx+1,0,item);
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
$('nextBtn').addEventListener('click',playNext);
$('heroNextBtn').addEventListener('click',playNext);
$('prevBtn').addEventListener('click',playPrev);
$('heroPrevBtn').addEventListener('click',playPrev);
$('shuffleBtn').addEventListener('click',toggleShuffle);
$('heroShuffleBtn')?.addEventListener('click',toggleShuffle);
$('randomizeBtn').addEventListener('click',randomize);
$('repeatBtn').addEventListener('click',toggleRepeat);
$('heroRepeatBtn')?.addEventListener('click',toggleRepeat);
$('likeBtn').addEventListener('click',()=>{if(currentSongIndex!==-1)toggleFav(String(playlists[currentPlaylist].songs[currentSongIndex].id));});
$('progressBar').addEventListener('mousedown',e=>{isDraggingProgress=true;seekTo(e);});
$('heroProgBar')?.addEventListener('mousedown',e=>{isDraggingProgress=true;seekHero(e);});
$('volBar').addEventListener('mousedown',e=>{isDraggingVolume=true;setVol(e);});
function resizePanel(e){
  const root=document.documentElement;
  let w=window.innerWidth-e.clientX;
  w=Math.max(200,Math.min(600,w));
  root.style.setProperty('--rpw',w+'px');
}
$('resizeHandle')?.addEventListener('mousedown',e=>{
  e.preventDefault();
  isDraggingPanel=true;
  document.body.style.cursor='col-resize';
  document.body.style.userSelect='none';
  e.currentTarget.classList.add('active');
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
document.addEventListener('mouseup',()=>{isDraggingProgress=false;isDraggingVolume=false;isDraggingPanel=false;document.body.style.cursor='';document.body.style.userSelect='';$('resizeHandle')?.classList.remove('active');});
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
          const [item]=queue.splice(dragSourceIdx,1);
          queue.splice(overTop?targetIdx:targetIdx+1,0,item);
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
function addRecentSearch(term){
  term=term.trim();
  if(!term)return;
  recentSearches=recentSearches.filter(s=>s!==term);
  recentSearches.unshift(term);
  if(recentSearches.length>8)recentSearches.pop();
  saveState();
}
function renderSearchDropdown(term){
  const dd=$('searchDropdown');
  const q=term.trim();
  if(!q){
    if(!recentSearches.length){dd.classList.remove('show');return;}
    dd.innerHTML=`<div class="search-dropdown-header">Recent Searches</div>
      ${recentSearches.map(s=>`<div class="search-dropdown-item" data-type="recent" data-term="${esc(s)}">
        <span class="srch-icon">⌕</span>
        <span class="srch-term">${esc(s)}</span>
        <button class="srch-remove" data-remove="${esc(s)}">×</button>
      </div>`).join('')}
      <button class="search-dropdown-clear">Clear all</button>`;
    dd.classList.add('show');
    return;
  }
  const ql=q.toLowerCase();
  const matchTracks=[];
  const matchPls=[];
  Object.entries(playlists).forEach(([pk,pl])=>{
    if(pl.name.toLowerCase().includes(ql))matchPls.push({key:pk,name:pl.name});
    pl.songs.forEach((s,i)=>{
      if(s.title.toLowerCase().includes(ql)||s.artist.toLowerCase().includes(ql))
        matchTracks.push({...s,playlistKey:pk,songIndex:i});
    });
  });
  let html='';
  if(matchTracks.length){
    html+=`<div class="search-dropdown-header">Tracks</div>`;
    matchTracks.slice(0,6).forEach(t=>{
      html+=`<div class="search-dropdown-item" data-type="track" data-term="${esc(t.title+' '+t.artist)}" data-playlist="${esc(t.playlistKey)}" data-index="${t.songIndex}">
        <span class="srch-icon">♪</span>
        <span class="srch-term">${esc(t.title)} · ${esc(t.artist)}</span>
        <span class="srch-meta">${esc(playlists[t.playlistKey]?.name||'')}</span>
      </div>`;
    });
  }
  if(matchPls.length){
    html+=`<div class="search-dropdown-header">Playlists</div>`;
    matchPls.slice(0,4).forEach(p=>{
      html+=`<div class="search-dropdown-item" data-type="playlist" data-playlist="${esc(p.key)}" data-term="${esc(p.name)}">
        <span class="srch-icon">⊟</span>
        <span class="srch-term">${esc(p.name)}</span>
      </div>`;
    });
  }
  if(!html)html=`<div class="search-dropdown-item" style="cursor:default;opacity:0.5">— no suggestions —</div>`;
  dd.innerHTML=html;
  dd.classList.add('show');
}
$('searchInput').addEventListener('input',e=>{
  const val=e.target.value;
  renderSongList(val);
  renderSearchDropdown(val);
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
    if(playlists[pk]&&playlists[pk].songs[idx])playSong(idx,pk);
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
  const ren=e.target.closest('[data-rename]');if(ren){handleRename(ren.dataset.rename);return;}
  const del=e.target.closest('[data-delete]');if(del){handleDeletePlaylist(del.dataset.delete);return;}
  const delt=e.target.closest('.del-btn');if(delt){handleDeleteTrack(parseInt(delt.dataset.del));return;}
  const like=e.target.closest('.like-btn');if(like){toggleFav(like.dataset.songId);return;}
  const qadd=e.target.closest('.queue-btn-row');if(qadd){addToQueue(qadd.dataset.qpl,parseInt(qadd.dataset.qadd));return;}
  const card=e.target.closest('.pl-card,.playlist-card');
  if(card){recordNav();playlistsViewMode='detail';switchPlaylist(card.dataset.playlist);return;}
  const row=e.target.closest('.track-row');
  if(row&&row.dataset.index!==undefined)playSong(parseInt(row.dataset.index),row.dataset.playlist||currentPlaylist);
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
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA')return;
  if(e.code==='Space'){e.preventDefault();togglePlay();}
  if(e.code==='ArrowRight'&&e.shiftKey)playNext();
  if(e.code==='ArrowLeft'&&e.shiftKey)playPrev();
  if(e.code==='ArrowLeft'&&e.altKey){e.preventDefault();goBack();}
  if(e.code==='ArrowRight'&&e.altKey){e.preventDefault();goForward();}
  if(e.code==='KeyM')toggleMute();
  if(e.code==='KeyS')toggleShuffle();
  if(e.code==='KeyR')toggleRepeat();
});

async function init(){
  playlists={};
  for(const[k,v]of Object.entries(DEFAULT_PLAYLISTS))playlists[k]=JSON.parse(JSON.stringify(v));
  await loadState();
  if(!playlists[currentPlaylist]){const keys=Object.keys(playlists);currentPlaylist=keys.length?keys[0]:'';}
  renderPlaylistNav();renderPlaylistGrid();switchView('home');
  renderSongList($('searchInput').value);
  $('shuffleBtn').classList.toggle('active',isShuffle);
  const hs=$('heroShuffleBtn');if(hs)hs.classList.toggle('active',isShuffle);
  $('repeatBtn').classList.toggle('active',repeatMode>0);
  $('repeatBtn').textContent=repeatMode===2?'↺¹':'↺';
  const hr=$('heroRepeatBtn');if(hr){hr.classList.toggle('active',repeatMode>0);hr.textContent=repeatMode===2?'↺¹':'↺';}
  audioPlayer.volume=isMuted?0:volume;
  $('volFill').style.width=`${volume*100}%`;
  updateVolIcon();
  updateNavBtns();
}
init();
addEventListener('beforeunload',()=>{localStorage.setItem('lumi-pt',String(totalPlayTime));});
