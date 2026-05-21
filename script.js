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
let currentAudioFile=null;
let currentView='home';
let db=null;
let recentPlaylists=[];
let recentSearches=[];
let navHistory=[];
let navFuture=[];

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
  }catch(e){console.warn(e);}
}

function setDate(){
  const el=$('sidebarDate');
  if(el)el.textContent=new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function fmt(s){
  if(isNaN(s)||s==null)return'0:00';
  return`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
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

function playlistSongs(pl){
  return Array.isArray(pl?.songs)?pl.songs:[];
}

function updateBgLabel(){
  const el=$('pageBgLabel');
  if(!el)return;
  const map={home:'MUSIC',library:'LIBRARY',favorites:'FAVS',playlists:'PLAYLISTS'};
  el.textContent=map[currentView]||(playlists[currentPlaylist]?.name||'MUSIC');
}

function renderFeatured(){
  const strip=$('featuredStrip');if(!strip)return;
  let keys=recentPlaylists.filter(k=>playlists[k]).slice(0,3);
  if(keys.length<3)for(const k of DEFAULT_KEYS){if(!keys.includes(k))keys.push(k);if(keys.length>=3)break;}
  const ordinals=['01','02','03'];
  strip.innerHTML=keys.map((key,i)=>{
    const pl=playlists[key];
    return`<div class="feat-card ${key===currentPlaylist?'feat-active':''}" data-playlist="${key}">
      <span class="feat-large">${pl.emoji}</span>
      <div class="feat-eyebrow">Playlist · ${ordinals[i]}</div>
      <div class="feat-title">${pl.name}</div>
      <div class="feat-sub">${pl.sub}</div>
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
  $('featuredStrip').style.display=view==='home'?'':'none';
  $('extraColHeader').textContent=view==='home'?'Duration':'Playlist';
  $('trackHeader').style.display=view==='playlists'?'none':'';
  updateBgLabel();
  renderSongList($('searchInput').value);
}

function renderSongList(filter=''){
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
  return`<div class="track-row ${isActive?'active':''}" data-index="${origIdx}" data-playlist="${plKey}">
    <div class="t-num ${isActive&&isPlaying?'playing':''}">${num}</div>
    <div class="t-info">
      <span class="t-title">${song.title}</span>
      <span class="t-artist">${song.artist}</span>
    </div>
    <div class="t-extra">${extra}</div>
    <div class="t-status">${status}</div>
    <div class="t-actions">
      <button class="like-btn ${isLiked?'liked':''}" data-song-id="${song.id}">${isLiked?'◆':'◇'}</button>
      ${showDel?`<button class="del-btn" data-del="${origIdx}">×</button>`:''}
    </div>
  </div>`;
}

function renderHome(filter){
  if(filter){
    const all=[];
    Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>all.push({...s,playlistKey:pk,songIndex:i})));
    const filtered=all.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(filter.toLowerCase()));
    $('secTitle').textContent='Search Results';
    $('secCount').textContent=filtered.length+' tracks';
    $('pageTitle').textContent='Search';
    $('pageSub').textContent='All playlists';
    updateBgLabel();
    if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
    $('emptyState').style.display='none';
    $('songList').innerHTML=filtered.map(song=>{
      const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
      return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
    }).join('');
    return;
  }
  const pl=playlists[currentPlaylist];
  if(!pl){$('secTitle').textContent='Tracklist';$('secCount').textContent='0 tracks';$('songList').innerHTML='';return;}
  const songs=pl.songs;
  $('secTitle').textContent=pl.name;
  $('secCount').textContent=songs.length+' tracks';
  $('pageTitle').textContent=pl.name;
  $('pageSub').textContent=pl.sub;
  updateBgLabel();
  if(!songs.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  const isCustom=!DEFAULT_KEYS.includes(currentPlaylist);
  $('songList').innerHTML=songs.map(song=>{
    const oi=songs.indexOf(song);
    return makeRow(song,oi,oi===currentSongIndex,favorites.has(String(song.id)),currentPlaylist,isCustom,song.duration);
  }).join('');
}

function renderLibrary(filter){
  const all=[];
  Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>all.push({...s,playlistKey:pk,songIndex:i})));
  const filtered=filter?all.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(filter.toLowerCase())):all;
  $('secTitle').textContent='Library';$('secCount').textContent=filtered.length+' tracks';
  $('pageTitle').textContent='Library';$('pageSub').textContent='All tracks across playlists';
  if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=filtered.map(song=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
  }).join('');
}

function renderFavs(filter){
  const favs=[];
  Object.entries(playlists).forEach(([pk,pl])=>pl.songs.forEach((s,i)=>favorites.has(String(s.id))&&favs.push({...s,playlistKey:pk,songIndex:i})));
  const filtered=filter?favs.filter(s=>s.title.toLowerCase().includes(filter.toLowerCase())||s.artist.toLowerCase().includes(filter.toLowerCase())):favs;
  $('secTitle').textContent='Favourites';$('secCount').textContent=filtered.length+' tracks';
  $('pageTitle').textContent='Favourites';$('pageSub').textContent='Your liked tracks';
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
  const q=filter.trim().toLowerCase();
  const keys=Object.keys(playlists).filter(k=>{
    const name=String(playlists[k]?.name||'Untitled Playlist').toLowerCase();
    return !q||name.includes(q);
  });
  $('secTitle').textContent='Playlists';
  $('secCount').textContent=keys.length+' playlists';
  $('pageTitle').textContent='Playlists';
  $('pageSub').textContent='Browse all playlists';
  updateBgLabel();
  if(!keys.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=`<div class="pl-grid">${keys.map(key=>{
    const pl=playlists[key];
    const isDefault=DEFAULT_KEYS.includes(key);
    const songs=playlistSongs(pl);
    const name=pl?.name||'Untitled Playlist';
    const emoji=pl?.emoji||'♫';
    return`<div class="pl-card ${key===currentPlaylist?'pl-active':''}" data-playlist="${esc(key)}" role="button" tabindex="0" title="${esc(name)}">
      ${isDefault?'':`<div class="pl-card-actions">
        <button class="pl-card-btn" data-rename="${esc(key)}" title="Rename">✎</button>
        <button class="pl-card-btn pl-card-del" data-delete="${esc(key)}" title="Delete">×</button>
      </div>`}
      <span class="pl-card-emoji">${esc(emoji)}</span>
      <div class="pl-card-name">${esc(name)}</div>
      <div class="pl-card-count">${songs.length} track${songs.length!==1?'s':''}</div>
    </div>`;
  }).join('')}</div>`;
}

function playSong(index,playlistKey){
  if(playlistKey&&playlistKey!==currentPlaylist){
    recordNav();audioPlayer.pause();
    if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
    clearInterval(playbackInterval);
    currentPlaylist=playlistKey;currentSongIndex=-1;
    renderPlaylistNav();renderFeatured();saveState();
    if(currentView!=='home')switchView('home');
  }
  recordPlay(currentPlaylist);
  if(!playlists[currentPlaylist])return;
  const songs=playlists[currentPlaylist].songs;
  if(index<0||index>=songs.length)return;
  currentSongIndex=index;
  const song=songs[index];
  $('trackTitle').textContent=song.title;
  $('trackArtist').textContent=song.artist;
  const aa=$('albumArt');
  aa.querySelector('.album-emoji').textContent=playlists[currentPlaylist].emoji;
  updateLikeBtn();
  isPlaying=true;updatePlayBtn();
  aa.classList.add('playing');
  $('vizBars').classList.add('active');
  renderSongList($('searchInput').value);
  if(song.file)playReal(song.file,song);else simPlay(song.duration);
}

function playReal(file,song){
  currentAudioFile=file;
  audioPlayer.src=URL.createObjectURL(file);
  audioPlayer.volume=isMuted?0:volume;
  audioPlayer.play().catch(()=>{});
  audioPlayer.onloadedmetadata=()=>{totalDuration=audioPlayer.duration;$('totalTime').textContent=fmt(totalDuration);song.duration=fmt(totalDuration);renderSongList($('searchInput').value);};
  audioPlayer.ontimeupdate=()=>{if(!isDraggingProgress){currentPlaybackTime=audioPlayer.currentTime;$('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;}};
  audioPlayer.onended=handleEnd;
}

function simPlay(durStr){
  clearInterval(playbackInterval);
  if(!durStr||durStr==='--:--'){totalDuration=0;$('totalTime').textContent='--:--';$('currentTime').textContent='0:00';$('progressFill').style.width='0%';return;}
  const p=durStr.split(':');
  totalDuration=parseInt(p[0])*60+parseInt(p[1]);
  currentPlaybackTime=0;
  $('totalTime').textContent=durStr;$('currentTime').textContent='0:00';$('progressFill').style.width='0%';
  playbackInterval=setInterval(()=>{if(isPlaying){currentPlaybackTime+=0.1;if(currentPlaybackTime>=totalDuration){handleEnd();return;}$('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;}},100);
}

function handleEnd(){
  clearInterval(playbackInterval);
  const songs=playlists[currentPlaylist].songs;
  if(repeatMode===2)playSong(currentSongIndex);
  else if(repeatMode===1||currentSongIndex<songs.length-1)playNext();
  else{isPlaying=false;updatePlayBtn();$('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');renderSongList($('searchInput').value);}
}

function playNext(){
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
  renderPlaylistNav();renderFeatured();switchPlaylist(key);saveState();
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
  if(currentPlaylist===targetKey)renderSongList($('searchInput').value);
  renderPlaylistNav();renderFeatured();saveState();e.target.value='';
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
  delete playlists[key];renderPlaylistNav();renderFeatured();saveState();
  if(isCur){
    audioPlayer.pause();
    if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
    clearInterval(playbackInterval);
    currentSongIndex=-1;isPlaying=false;updatePlayBtn();
    $('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');
    $('trackTitle').textContent='Select a track';$('trackArtist').textContent='Awaiting input';
    $('progressFill').style.width='0%';$('currentTime').textContent='0:00';$('totalTime').textContent='0:00';
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
  }else if(currentSongIndex>index)currentSongIndex--;
  renderSongList($('searchInput').value);saveState();
}

async function handleRename(key){
  const newName=await showRename(playlists[key].name);if(!newName)return;
  playlists[key].name=newName;
  renderPlaylistNav();renderFeatured();
  if(key===currentPlaylist){$('pageTitle').textContent=newName;$('secTitle').textContent=newName;}
  saveState();
}

function togglePlay(){
  if(currentSongIndex===-1){if(Object.keys(playlists).length)playSong(0);return;}
  isPlaying=!isPlaying;updatePlayBtn();
  if(isPlaying){$('albumArt').classList.add('playing');$('vizBars').classList.add('active');if(currentAudioFile)audioPlayer.play();}
  else{$('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');if(currentAudioFile)audioPlayer.pause();}
  renderSongList($('searchInput').value);
}
function updatePlayBtn(){
  $('playIcon').style.display=isPlaying?'none':'inline';
  $('pauseIcon').style.display=isPlaying?'inline':'none';
}
function toggleShuffle(){isShuffle=!isShuffle;$('shuffleBtn').classList.toggle('active',isShuffle);saveState();}
function toggleRepeat(){repeatMode=(repeatMode+1)%3;$('repeatBtn').classList.toggle('active',repeatMode>0);$('repeatBtn').textContent=repeatMode===2?'↺¹':'↺';saveState();}
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
  $('likeBtn').textContent=liked?'◆':'◇';
}
function seekTo(e){
  const rect=$('progressBar').getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  currentPlaybackTime=pct*totalDuration;
  $('progressFill').style.width=`${pct*100}%`;
  $('currentTime').textContent=fmt(currentPlaybackTime);
  if(currentAudioFile)audioPlayer.currentTime=currentPlaybackTime;
}
function setVol(e){
  const rect=$('volBar').getBoundingClientRect();
  volume=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  $('volFill').style.width=`${volume*100}%`;
  isMuted=false;audioPlayer.volume=volume;
  updateVolIcon();saveState();
}
function toggleMute(){isMuted=!isMuted;audioPlayer.volume=isMuted?0:volume;updateVolIcon();}
function updateVolIcon(){$('volBtn').textContent=(isMuted||volume===0)?'mute':'vol';}

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
    renderPlaylistNav();renderFeatured();saveState();
    loading2(null);
    await showMessage(`<div class="yt-success">✓ Added<br><strong>${esc(title||info.title)}</strong></div>`,'OK');
  }catch(e){loading2(null);await showMessage(`<div class="yt-error">Download failed<br><span style="font-size:11px;color:var(--text3)">${esc(e.message||'Unknown error')}</span></div>`,'OK');}
}

function switchPlaylist(key){
  currentPlaylist=key;renderPlaylistNav();renderFeatured();
  renderSongList($('searchInput').value);saveState();
}
function renderPlaylistNav(){}

function randomize(){
  const pl=playlists[currentPlaylist];if(!pl||pl.songs.length<2)return;
  const cur=currentSongIndex>=0?pl.songs[currentSongIndex]:null;
  for(let i=pl.songs.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pl.songs[i],pl.songs[j]]=[pl.songs[j],pl.songs[i]];}
  if(cur)currentSongIndex=pl.songs.indexOf(cur);
  renderSongList($('searchInput').value);saveState();
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
  if(s.playlist!==currentPlaylist){currentPlaylist=s.playlist;renderPlaylistNav();renderFeatured();}
  switchView(s.view);saveState();updateNavBtns();
}
function updateNavBtns(){$('backBtn').disabled=!navHistory.length;$('forwardBtn').disabled=!navFuture.length;}

$('backBtn').addEventListener('click',goBack);
$('forwardBtn').addEventListener('click',goForward);
$('newPlaylistBtn').addEventListener('click',()=>$('folderInput').click());
$('folderInput').addEventListener('change',handleFolderSelect);
$('addTracksBtn').addEventListener('click',()=>$('addTracksInput').click());
$('addTracksInput').addEventListener('change',handleAddTracks);
$('ytBtn').addEventListener('click',handleYouTubeImport);
$('playBtn').addEventListener('click',togglePlay);
$('nextBtn').addEventListener('click',playNext);
$('prevBtn').addEventListener('click',playPrev);
$('shuffleBtn').addEventListener('click',toggleShuffle);
$('randomizeBtn').addEventListener('click',randomize);
$('repeatBtn').addEventListener('click',toggleRepeat);
$('likeBtn').addEventListener('click',()=>{if(currentSongIndex!==-1)toggleFav(String(playlists[currentPlaylist].songs[currentSongIndex].id));});
$('progressBar').addEventListener('mousedown',e=>{isDraggingProgress=true;seekTo(e);});
$('volBar').addEventListener('mousedown',e=>{isDraggingVolume=true;setVol(e);});
document.addEventListener('mousemove',e=>{if(isDraggingProgress)seekTo(e);if(isDraggingVolume)setVol(e);});
document.addEventListener('mouseup',()=>{isDraggingProgress=false;isDraggingVolume=false;});
  $('volBtn').addEventListener('click',toggleMute);
  $('fullscreenBtn').addEventListener('click',()=>{
    if(document.fullscreenElement)document.exitFullscreen();
    else document.documentElement.requestFullscreen();
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
  const card=e.target.closest('.pl-card');
  if(card){recordNav();switchPlaylist(card.dataset.playlist);switchView('home');return;}
  const row=e.target.closest('.track-row');
  if(row&&row.dataset.index!==undefined)playSong(parseInt(row.dataset.index),row.dataset.playlist||currentPlaylist);
});



$('featuredStrip').addEventListener('click',e=>{
  const card=e.target.closest('.feat-card');if(card){recordNav();switchPlaylist(card.dataset.playlist);}
});

document.querySelectorAll('.nav-item[data-view]').forEach(el=>
  el.addEventListener('click',function(){recordNav();switchView(this.dataset.view);}));

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
  setDate();
  playlists={};
  for(const[k,v]of Object.entries(DEFAULT_PLAYLISTS))playlists[k]=JSON.parse(JSON.stringify(v));
  await loadState();
  if(!playlists[currentPlaylist]){const keys=Object.keys(playlists);currentPlaylist=keys.length?keys[0]:'';}
  renderPlaylistNav();renderFeatured();switchView('home');
  renderSongList($('searchInput').value);
  $('shuffleBtn').classList.toggle('active',isShuffle);
  $('repeatBtn').classList.toggle('active',repeatMode>0);
  $('repeatBtn').textContent=repeatMode===2?'↺¹':'↺';
  audioPlayer.volume=isMuted?0:volume;
  $('volFill').style.width=`${volume*100}%`;
  updateVolIcon();
  updateNavBtns();
}
init();
