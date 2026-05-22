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
let selectedArtist='';
let selectedAlbum='';
let selectedSmart='';
let selectedTool='missing';
let bulkSelected=new Set();
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

let currentTheme='default';
const availableThemes=['default','retro','zine','neurophism'];

let currentLyricOffset=0;
let currentLyricOffsetSongId=null;

function getLyricOffsets(){
  try{return JSON.parse(localStorage.getItem('lumi-lyrics-offset')||'{}');}catch(e){return{};}
}
function saveLyricOffset(songId,offset){
  try{
    const offsets=getLyricOffsets();
    if(Math.abs(offset)<0.001)delete offsets[String(songId)];
    else offsets[String(songId)]=parseFloat(offset.toFixed(3));
    localStorage.setItem('lumi-lyrics-offset',JSON.stringify(offsets));
  }catch(e){}
}
function getLyricOffset(songId){
  const offsets=getLyricOffsets();
  return parseFloat(offsets[String(songId)]||0);
}

function adjustLyricOffset(delta,songId){
  if(songId===null)return;
  const current=getLyricOffset(songId);
  const newOffset=Math.max(-10,Math.min(10,current+delta));
  saveLyricOffset(songId,newOffset);
  currentLyricOffset=newOffset;
  updateLyricOffsetUI();
  updateLyricHighlight(currentPlaybackTime);
}
function resetLyricOffset(songId){
  if(songId===null)return;
  saveLyricOffset(songId,0);
  currentLyricOffset=0;
  updateLyricOffsetUI();
  updateLyricHighlight(currentPlaybackTime);
}
function loadLyricOffsetForSong(songId){
  currentLyricOffsetSongId=songId;
  currentLyricOffset=getLyricOffset(songId);
  updateLyricOffsetUI();
}
function updateLyricOffsetUI(){
  const label=$('lyricOffsetLabel');
  const controls=$('lyricsOffsetControls');
  if(controls){
    controls.style.display=lyricsSynced?'':'none';
  }
  if(label){
    const sign=currentLyricOffset>=0?'+':'';
    label.textContent=`Offset: ${sign}${currentLyricOffset.toFixed(2)}s`;
  }
}

let isRecordingShortcut=false;
let recordingShortcutKey=null;

const SHORTCUTS={
  playPause:{code:'Space',modifiers:[],label:'Play / Pause',category:'Playback'},
  nextTrack:{code:'ArrowRight',modifiers:['Shift'],label:'Next Track',category:'Playback'},
  prevTrack:{code:'ArrowLeft',modifiers:['Shift'],label:'Previous Track',category:'Playback'},
  volumeUp:{code:'ArrowUp',modifiers:[],label:'Volume Up',category:'Playback'},
  volumeDown:{code:'ArrowDown',modifiers:[],label:'Volume Down',category:'Playback'},
  toggleMute:{code:'KeyM',modifiers:[],label:'Toggle Mute',category:'Playback'},
  toggleShuffle:{code:'KeyS',modifiers:[],label:'Toggle Shuffle',category:'Playback'},
  toggleRepeat:{code:'KeyR',modifiers:[],label:'Toggle Repeat',category:'Playback'},
  seek00:{code:'Digit0',modifiers:[],label:'Seek to 0%',category:'Navigation'},
  seek10:{code:'Digit1',modifiers:[],label:'Seek to 10%',category:'Navigation'},
  seek20:{code:'Digit2',modifiers:[],label:'Seek to 20%',category:'Navigation'},
  seek30:{code:'Digit3',modifiers:[],label:'Seek to 30%',category:'Navigation'},
  seek40:{code:'Digit4',modifiers:[],label:'Seek to 40%',category:'Navigation'},
  seek50:{code:'Digit5',modifiers:[],label:'Seek to 50%',category:'Navigation'},
  seek60:{code:'Digit6',modifiers:[],label:'Seek to 60%',category:'Navigation'},
  seek70:{code:'Digit7',modifiers:[],label:'Seek to 70%',category:'Navigation'},
  seek80:{code:'Digit8',modifiers:[],label:'Seek to 80%',category:'Navigation'},
  seek90:{code:'Digit9',modifiers:[],label:'Seek to 90%',category:'Navigation'},
  goBack:{code:'ArrowLeft',modifiers:['Alt'],label:'Go Back',category:'Navigation'},
  goForward:{code:'ArrowRight',modifiers:['Alt'],label:'Go Forward',category:'Navigation'},
  focusSearch:{code:'Space',modifiers:['Ctrl'],label:'Focus Search',category:'Navigation'},
  newPlaylist:{code:'KeyN',modifiers:['Ctrl'],label:'New Playlist',category:'Navigation'},
  toggleFullscreen:{code:'KeyF',modifiers:[],label:'Toggle Fullscreen',category:'UI'},
   toggleRightPanel:{code:'KeyL',modifiers:[],label:'Toggle Right Panel',category:'UI'},
   showShortcuts:{code:'Slash',modifiers:['Ctrl'],label:'Show Shortcuts',category:'UI'},
   offsetMinus:{code:'BracketLeft',modifiers:[],label:'Lyric Offset -0.1s',category:'Lyrics'},
   offsetPlus:{code:'BracketRight',modifiers:[],label:'Lyric Offset +0.1s',category:'Lyrics'},
   offsetMinusBig:{code:'BracketLeft',modifiers:['Ctrl'],label:'Lyric Offset -0.5s',category:'Lyrics'},
   offsetPlusBig:{code:'BracketRight',modifiers:['Ctrl'],label:'Lyric Offset +0.5s',category:'Lyrics'},
   offsetReset:{code:'Digit0',modifiers:['Ctrl'],label:'Reset Lyric Offset',category:'Lyrics'}
 };

function getActiveShortcuts(){
  const custom=JSON.parse(localStorage.getItem('lumi-custom-shortcuts')||'{}');
  const active=JSON.parse(JSON.stringify(SHORTCUTS));
  Object.entries(custom).forEach(([key,val])=>{if(active[key])Object.assign(active[key],val);});
  return active;
}
function saveCustomShortcuts(custom){localStorage.setItem('lumi-custom-shortcuts',JSON.stringify(custom));}
function formatShortcut(sc){
  const parts=[];
  if(sc.modifiers?.includes('Ctrl'))parts.push('Ctrl');
  if(sc.modifiers?.includes('Shift'))parts.push('Shift');
  if(sc.modifiers?.includes('Alt'))parts.push('Alt');
  let keyName=sc.code;
  if(keyName.startsWith('Key'))keyName=keyName.slice(3);
  else if(keyName.startsWith('Digit'))keyName=keyName.slice(5);
  else if(keyName==='ArrowUp')keyName='↑';
  else if(keyName==='ArrowDown')keyName='↓';
  else if(keyName==='ArrowLeft')keyName='←';
  else if(keyName==='ArrowRight')keyName='→';
  else if(keyName==='Space')keyName='Space';
  parts.push(keyName);
  return parts.join(' + ');
}
function matchShortcut(e,sc){
  if(e.code!==sc.code)return false;
  const needsCtrl=sc.modifiers?.includes('Ctrl')||false;
  const needsShift=sc.modifiers?.includes('Shift')||false;
  const needsAlt=sc.modifiers?.includes('Alt')||false;
  return(e.ctrlKey===needsCtrl)&&(e.shiftKey===needsShift)&&(e.altKey===needsAlt);
}
function seekToPercent(percent){
  if(totalDuration<=0)return;
  const newTime=totalDuration*(percent/100);
  currentPlaybackTime=newTime;
  if(currentAudioFile)audioPlayer.currentTime=newTime;
  else simPlay(playlists[currentPlaylist]?.songs?.[currentSongIndex]?.duration);
  $('currentTime').textContent=fmt(newTime);
  $('progressFill').style.width=`${percent}%`;
  updateHeroProgress();
  updateLyricHighlight(newTime);
}
function setVolume(newVol){
  volume=Math.max(0,Math.min(1,newVol));
  audioPlayer.volume=isMuted?0:volume;
  $('volFill').style.width=`${volume*100}%`;
  const hs=$('heroVolSlider');if(hs)hs.value=Math.round(volume*100);
  const hl=$('heroVolLabel');if(hl)hl.textContent=`VOL ${Math.round(volume*100)}`;
  updateVolIcon();
  saveState();
}
function toggleFullscreenMode(){
  if(document.fullscreenElement)document.exitFullscreen();
  else document.documentElement.requestFullscreen();
}
function toggleRightPanelDisplay(){
  const layout=document.querySelector('.layout');
  if(!layout)return;
  const wasClosed=layout.classList.contains('panel-closed');
  layout.classList.toggle('panel-closed');
  if(wasClosed){
    updateUpNext();
    const tab=document.querySelector('.panel-tab:nth-child(2)');
    if(tab)switchTab('queue',tab);
  }
}
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
function showShortcutsModal(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    const shortcuts=getActiveShortcuts();
    const categories={};
    Object.entries(shortcuts).forEach(([key,sc])=>{
      const cat=sc.category||'Other';
      if(!categories[cat])categories[cat]=[];
      categories[cat].push({key,...sc});
    });
    let catsHtml='';
    Object.entries(categories).forEach(([cat,items])=>{
      catsHtml+=`<div class="shortcuts-cat"><div class="shortcuts-cat-label">${esc(cat)}</div>`;
      items.forEach(item=>{
        catsHtml+=`<div class="shortcut-row" data-key="${esc(item.key)}">
          <span class="shortcut-label">${esc(item.label)}</span>
          <span class="shortcut-keys" data-key="${esc(item.key)}">${esc(formatShortcut(item))}</span>
          <button class="shortcut-edit" data-key="${esc(item.key)}" title="Change shortcut">✎</button>
        </div>`;
      });
      catsHtml+='</div>';
    });
    o.innerHTML=`<div class="modal-box shortcuts-modal">
      <div class="shortcuts-header">
        <div class="modal-msg">Keyboard Shortcuts</div>
        <button class="shortcut-reset-all" id="resetAllShortcuts">Reset All to Default</button>
      </div>
      <div class="shortcuts-list">${catsHtml}</div>
      <div class="shortcuts-recording" id="recordingIndicator" style="display:none">
        <div class="recording-pulse"></div>
        <span>Press new shortcut combination...</span>
        <button class="recording-cancel" id="cancelRecording">Cancel</button>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-ok" id="closeShortcuts">Close</button>
      </div>
    </div>`;
    o.style.display='flex';
    const close=()=>{document.removeEventListener('keydown',kh,true);o.style.display='none';resolve();};
    $('closeShortcuts').onclick=close;
    function bindRowHandlers(){
      o.querySelectorAll('.shortcut-edit').forEach(btn=>{
        btn.onclick=e=>{e.stopPropagation();startRecordingShortcut(btn.dataset.key);};
      });
      o.querySelectorAll('.shortcut-keys').forEach(el=>{
        el.onclick=e=>{e.stopPropagation();startRecordingShortcut(el.dataset.key);};
      });
    }
    bindRowHandlers();
    function refreshShortcutsDisplay(){
      const shortcuts=getActiveShortcuts();
      o.querySelectorAll('.shortcut-row').forEach(row=>{
        const key=row.dataset.key;
        const sc=shortcuts[key];
        if(sc){
          const keysEl=row.querySelector('.shortcut-keys');
          if(keysEl)keysEl.textContent=formatShortcut(sc);
        }
      });
    }
    $('resetAllShortcuts').onclick=async()=>{
      if(!await showConfirm('Reset all shortcuts to default?'))return;
      localStorage.removeItem('lumi-custom-shortcuts');
      refreshShortcutsDisplay();
      showToast('Shortcuts reset to default');
    };
    function startRecordingShortcut(shortcutKey){
      if(isRecordingShortcut)return;
      isRecordingShortcut=true;
      recordingShortcutKey=shortcutKey;
      const ind=$('recordingIndicator');
      if(ind)ind.style.display='flex';
      o.querySelectorAll('.shortcut-row').forEach(r=>{
        r.classList.toggle('recording-mode',r.dataset.key===shortcutKey);
      });
    }
    function stopRecordingShortcut(){
      isRecordingShortcut=false;
      recordingShortcutKey=null;
      const ind=$('recordingIndicator');
      if(ind)ind.style.display='none';
      o.querySelectorAll('.shortcut-row').forEach(r=>r.classList.remove('recording-mode'));
    }
    function checkConflict(newCode,newModifiers,excludeKey){
      const shortcuts=getActiveShortcuts();
      for(const[key,sc]of Object.entries(shortcuts)){
        if(key===excludeKey)continue;
        if(sc.code===newCode){
          const hasCtrl=(sc.modifiers?.includes('Ctrl')||false)===newModifiers.includes('Ctrl');
          const hasShift=(sc.modifiers?.includes('Shift')||false)===newModifiers.includes('Shift');
          const hasAlt=(sc.modifiers?.includes('Alt')||false)===newModifiers.includes('Alt');
          if(hasCtrl&&hasShift&&hasAlt)return sc;
        }
      }
      return null;
    }
    const kh=async e=>{
      if(!isRecordingShortcut||!recordingShortcutKey)return;
      if(e.key==='Escape'){stopRecordingShortcut();return;}
      if(['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code))return;
      e.preventDefault();e.stopPropagation();
      const modifiers=[];
      if(e.ctrlKey)modifiers.push('Ctrl');
      if(e.shiftKey)modifiers.push('Shift');
      if(e.altKey)modifiers.push('Alt');
      const conflict=checkConflict(e.code,modifiers,recordingShortcutKey);
      if(conflict){
        const override=await showConfirm(`"${formatShortcut({code:e.code,modifiers})}" is already used for "${conflict.label}". Overwrite?`);
        if(!override){stopRecordingShortcut();return;}
        const custom=JSON.parse(localStorage.getItem('lumi-custom-shortcuts')||'{}');
        Object.entries(SHORTCUTS).forEach(([key,defaultSc])=>{
          for(const[k,sc]of Object.entries(getActiveShortcuts())){
            if(k!==recordingShortcutKey&&sc.code===e.code){
              if(!custom[k])custom[k]={};
              custom[k].code=defaultSc.code;
              custom[k].modifiers=[...(defaultSc.modifiers||[])];
            }
          }
        });
      }
      const custom=JSON.parse(localStorage.getItem('lumi-custom-shortcuts')||'{}');
      if(!custom[recordingShortcutKey])custom[recordingShortcutKey]={};
      custom[recordingShortcutKey].code=e.code;
      custom[recordingShortcutKey].modifiers=modifiers;
      saveCustomShortcuts(custom);
      stopRecordingShortcut();
      refreshShortcutsDisplay();
      showToast('Shortcut updated');
    };
    document.addEventListener('keydown',kh,true);
    $('cancelRecording')?.addEventListener('click',()=>stopRecordingShortcut());
  });
}
function executeShortcutAction(action){
  switch(action){
    case 'playPause':togglePlay();break;
    case 'nextTrack':playNext();break;
    case 'prevTrack':playPrev();break;
    case 'volumeUp':setVolume(Math.min(1,volume+0.1));break;
    case 'volumeDown':setVolume(Math.max(0,volume-0.1));break;
    case 'toggleMute':toggleMute();break;
    case 'toggleShuffle':toggleShuffle();break;
    case 'toggleRepeat':toggleRepeat();break;
    case 'seek00':seekToPercent(0);break;
    case 'seek10':seekToPercent(10);break;
    case 'seek20':seekToPercent(20);break;
    case 'seek30':seekToPercent(30);break;
    case 'seek40':seekToPercent(40);break;
    case 'seek50':seekToPercent(50);break;
    case 'seek60':seekToPercent(60);break;
    case 'seek70':seekToPercent(70);break;
    case 'seek80':seekToPercent(80);break;
    case 'seek90':seekToPercent(90);break;
    case 'goBack':goBack();break;
    case 'goForward':goForward();break;
    case 'focusSearch':
      const inp=$('searchInput');
      if(inp){inp.focus();setTimeout(()=>inp.select(),0);}
      break;
    case 'newPlaylist':
      (async()=>{
        const name=await showInput('Playlist name:','My Playlist');
        if(!name)return;
        const key='custom-'+Date.now();
        playlists[key]={name,emoji:'📂',color:'#D4522A',sub:'0 tracks',songs:[]};
        renderPlaylistNav();renderPlaylistGrid();switchPlaylist(key);saveState();
      })();
      break;
    case 'toggleFullscreen':toggleFullscreenMode();break;
     case 'toggleRightPanel':toggleRightPanelDisplay();break;
     case 'showShortcuts':showShortcutsModal();break;
     case 'offsetMinus':adjustLyricOffset(-0.1,currentLyricOffsetSongId);break;
     case 'offsetPlus':adjustLyricOffset(0.1,currentLyricOffsetSongId);break;
     case 'offsetMinusBig':adjustLyricOffset(-0.5,currentLyricOffsetSongId);break;
     case 'offsetPlusBig':adjustLyricOffset(0.5,currentLyricOffsetSongId);break;
     case 'offsetReset':resetLyricOffset(currentLyricOffsetSongId);break;
   }
 }

const $=id=>document.getElementById(id);
const YT_SERVER='http://localhost:3001';
const LYRICS_CACHE_KEY='lumi-lyrics-cache';

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
function findSongLocation(song){
  const sid=String(song?.id||'');
  for(const[playlistKey,pl]of Object.entries(playlists)){
    const index=pl.songs.findIndex(s=>String(s.id)===sid);
    if(index>-1)return{playlistKey,index};
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
function normalizeMeta(value){
  return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
}
function songLyricsCacheId(song){
  return String(song?.id||'');
}
function songRefKey(playlistKey,songIndex){
  return `${playlistKey}::${songIndex}`;
}
function parseSongRefKey(key){
  const [playlistKey,index]=String(key).split('::');
  return{playlistKey,index:parseInt(index)};
}

/* ── ROMAJI ── */
function hasJapanese(text){
  return /[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]/.test(text);
}
let kuroshiroPromise=null;
async function initKuroshiro(){
  if(kuroshiroReady)return;
  if(kuroshiroPromise)return kuroshiroPromise;
  kuroshiroInitAttempted=true;
  kuroshiroPromise=(async()=>{
    if(typeof Kuroshiro==='undefined'||typeof KuromojiAnalyzer==='undefined')return;
    try{
      window.kuroshiroInst=new Kuroshiro();
      await window.kuroshiroInst.init(new KuromojiAnalyzer({dictPath:'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/'}));
      kuroshiroReady=true;
    }catch(e){console.warn('Kuroshiro init failed:',e);}
  })();
  return kuroshiroPromise;
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
function getLyricsCache(){
  try{
    const data=JSON.parse(localStorage.getItem(LYRICS_CACHE_KEY)||'{}');
    return data&&typeof data==='object'?data:{};
  }catch(e){return{};}
}
function readCachedLyrics(song,title,artist){
  const cache=getLyricsCache();
  const entry=cache[songLyricsCacheId(song)];
  if(!entry||!entry.data)return null;
  if(normalizeMeta(entry.title)!==normalizeMeta(title))return null;
  if(normalizeMeta(entry.artist)!==normalizeMeta(artist))return null;
  return entry.data;
}
function saveCachedLyrics(song,title,artist,data){
  if(!song||!data||(!data.syncedLyrics&&!data.plainLyrics))return;
  try{
    const cache=getLyricsCache();
    cache[songLyricsCacheId(song)]={
      title:String(title||''),
      artist:String(artist||''),
      cachedAt:new Date().toISOString(),
      data:{
        syncedLyrics:data.syncedLyrics||'',
        plainLyrics:data.plainLyrics||''
      }
    };
    localStorage.setItem(LYRICS_CACHE_KEY,JSON.stringify(cache));
  }catch(e){}
}
function deleteCachedLyrics(song){
  try{
    const cache=getLyricsCache();
    delete cache[songLyricsCacheId(song)];
    localStorage.setItem(LYRICS_CACHE_KEY,JSON.stringify(cache));
  }catch(e){}
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
        updateLyricOffsetUI();
        return;
      }
      lyricLines=parsed;
      renderLyricLines(parsed,showEdit);
      updateLyricOffsetUI();
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
  const adjustedTime=time-currentLyricOffset;
  let activeIdx=-1;
  for(let i=lyricLines.length-1;i>=0;i--){
    if(adjustedTime>=lyricLines[i].time){activeIdx=i;break;}
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
function allLibrarySongs(){
  const all=[];
  Object.entries(playlists).forEach(([playlistKey,pl])=>{
    playlistSongs(pl).forEach((song,songIndex)=>all.push({...song,playlistKey,songIndex}));
  });
  return all;
}
function songAddedAt(song){
  if(song.addedAt)return Date.parse(song.addedAt)||0;
  const n=Number(song.id);
  if(Number.isFinite(n)&&n>1000000000000)return n;
  return 0;
}
function groupSongsBy(field){
  const map=new Map();
  for(const song of allLibrarySongs()){
    const key=String(song[field]||'Unknown').trim()||'Unknown';
    if(!map.has(key))map.set(key,[]);
    map.get(key).push(song);
  }
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0]));
}
function renderVirtualRows(title,sub,songs,filter=''){
  const q=filter.trim().toLowerCase();
  const filtered=q?songs.filter(s=>String(s.title||'').toLowerCase().includes(q)||String(s.artist||'').toLowerCase().includes(q)||String(s.album||'').toLowerCase().includes(q)||(playlists[s.playlistKey]?.name||'').toLowerCase().includes(q)):songs;
  $('trackHeader').style.display='';
  $('secTitle').textContent=title;
  $('secCount').textContent=filtered.length+' tracks';
  $('breadcrumbTitle').textContent=title;
  $('breadcrumbSub').textContent=sub;
  if(!filtered.length){$('songList').innerHTML='';$('emptyState').style.display='block';return;}
  $('emptyState').style.display='none';
  $('songList').innerHTML=filtered.map(song=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,false,playlists[song.playlistKey]?.name||song.playlistKey);
  }).join('');
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
  if(view!=='artists')selectedArtist='';
  if(view!=='albums')selectedAlbum='';
  if(view!=='smart')selectedSmart='';
  if(view!=='tools'){selectedTool='missing';bulkSelected.clear();}
  if(view==='playlists')playlistsViewMode='grid';
  updateSortIndicator();
  renderSongList($('searchInput').value);
  if(view==='home'){renderPlaylistGrid();}
}

function renderSongList(filter=''){
  if(currentView!=='home'||filter)$('heroSection').style.display='none';
  if(currentView==='home')renderHome(filter);
  else if(currentView==='library')renderLibrary(filter);
  else if(currentView==='artists')renderArtists(filter);
  else if(currentView==='albums')renderAlbums(filter);
  else if(currentView==='smart')renderSmart(filter);
  else if(currentView==='tools')renderTools(filter);
  else if(currentView==='favorites')renderFavs(filter);
  else renderPlaylists(filter);
}

function makeRow(song,origIdx,isActive,isLiked,plKey,showDel,extra){
  const num=isActive&&isPlaying?'▶':String(origIdx+1).padStart(2,'0');
  const ref=songRefKey(plKey,origIdx);
  const bulk=currentView==='tools'?`<input type="checkbox" class="bulk-check" data-bulk="${esc(ref)}" ${bulkSelected.has(ref)?'checked':''}> `:'';
  const statusBadge=isActive
    ?`<span class="badge ${isPlaying?'badge-playing':'badge-paused'}"><span class="badge-dot"></span>${isPlaying?'Playing':'Paused'}</span>`
    :'';
  return`<div class="track-row ${isActive?'active':''}" draggable="true" data-index="${origIdx}" data-playlist="${plKey}">
    <div class="t-num ${isActive&&isPlaying?'playing':''}">${bulk}${num}</div>
    <div class="t-info">
      <span class="t-title">${song.title}</span>
      <span class="t-artist">${statusBadge}${statusBadge?' ':''}${song.artist}</span>
    </div>
    <div class="t-extra">${extra}</div>
    <div class="t-actions">
      <button class="like-btn ${isLiked?'liked':''}" data-song-id="${song.id}">${isLiked?'★':'☆'}</button>
      <button class="queue-btn-row" data-qadd="${origIdx}" data-qpl="${plKey}" title="Add to queue">↓</button>
      <button class="edit-track-btn" data-edit="${origIdx}" data-edit-pl="${plKey}" title="Edit metadata">edit</button>
      ${showDel?`<button class="del-btn" data-del="${origIdx}">×</button>`:''}
    </div>
  </div>`;
}

function renderHome(filter){
  $('trackHeader').style.display='';
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
  $('trackHeader').style.display='';
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

function getSmartSets(){
  const all=allLibrarySongs();
  const plays=getMonthPlays();
  const cache=getLyricsCache();
  const userLyrics=(()=>{try{return JSON.parse(localStorage.getItem('lumi-ulyrics')||'{}');}catch(e){return{};}})();
  return{
    recentlyAdded:{name:'Recently Added',sub:'Newest tracks in your library',songs:[...all].sort((a,b)=>songAddedAt(b)-songAddedAt(a)).slice(0,50)},
    mostPlayed:{name:'Most Played',sub:'Top tracks this month',songs:[...all].sort((a,b)=>(plays[String(b.id)]||0)-(plays[String(a.id)]||0)).filter(s=>(plays[String(s.id)]||0)>0).slice(0,50)},
    neverPlayed:{name:'Never Played',sub:'Tracks with no plays this month',songs:all.filter(s=>!plays[String(s.id)])},
    missingLyrics:{name:'Missing Lyrics',sub:'No custom or cached lyrics yet',songs:all.filter(s=>!userLyrics[String(s.id)]&&!cache[String(s.id)])},
    favorites:{name:'Favorites',sub:'Liked tracks',songs:all.filter(s=>favorites.has(String(s.id)))}
  };
}
function renderSmart(filter){
  const sets=getSmartSets();
  if(selectedSmart&&sets[selectedSmart]){
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
    <button class="bulk-btn" data-bulk-action="select-all">Select visible</button>
    <button class="bulk-btn" data-bulk-action="clear">Clear</button>
    <span class="bulk-count">${selected} selected</span>
    <button class="bulk-btn" data-bulk-action="playlist" ${selected?'':'disabled'}>Add to playlist</button>
    <button class="bulk-btn" data-bulk-action="favorite" ${selected?'':'disabled'}>Favorite</button>
    <button class="bulk-btn" data-bulk-action="queue" ${selected?'':'disabled'}>Queue</button>
    <button class="bulk-btn danger" data-bulk-action="delete" ${selected?'':'disabled'}>Delete</button>
  </div>`;
}
function renderTools(filter){
  $('trackHeader').style.display='';
  const missing=getMissingDataSongs();
  const duplicateGroups=getDuplicateGroups();
  let songs=selectedTool==='duplicates'?duplicateGroups.flat():missing;
  const q=filter.trim().toLowerCase();
  if(q)songs=songs.filter(s=>String(s.title||'').toLowerCase().includes(q)||String(s.artist||'').toLowerCase().includes(q)||String(s.album||'').toLowerCase().includes(q));
  $('secTitle').textContent='Library Tools';
  $('secCount').textContent=(selectedTool==='duplicates'?duplicateGroups.length+' groups':songs.length+' tracks');
  $('breadcrumbTitle').textContent='Tools';
  $('breadcrumbSub').textContent='Scan metadata, duplicates, and bulk edit';
  const tabs=`<div class="tool-tabs">
    <button class="tool-tab ${selectedTool==='missing'?'active':''}" data-tool="missing">Missing Data <span>${missing.length}</span></button>
    <button class="tool-tab ${selectedTool==='duplicates'?'active':''}" data-tool="duplicates">Duplicates <span>${duplicateGroups.length}</span></button>
  </div>`;
  if(!songs.length){$('songList').innerHTML=tabs+renderBulkBar([])+'<div class="tool-empty">No issues found here.</div>';$('emptyState').style.display='none';return;}
  $('emptyState').style.display='none';
  const rows=songs.map(song=>{
    const isActive=song.playlistKey===currentPlaylist&&song.songIndex===currentSongIndex;
    const extra=selectedTool==='missing'?(song.issues||[]).join(', '):playlists[song.playlistKey]?.name||song.playlistKey;
    return makeRow(song,song.songIndex,isActive,favorites.has(String(song.id)),song.playlistKey,true,extra);
  }).join('');
  $('songList').innerHTML=tabs+renderBulkBar(songs)+rows;
}

function renderFavs(filter){
  $('trackHeader').style.display='';
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
  if(!playlists[currentPlaylist]||currentView!=='home'||$('searchInput').value.trim()){
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
  const apiUrl=`https://lrclib.net/api/search?track_name=${encodeURIComponent(song.title||'')}&artist_name=${encodeURIComponent(song.artist||'')}`;
  el.innerHTML=`<div class="lyrics-none">Lyrics not found</div>
<div class="lyrics-helper">
  <div class="lyrics-helper-title">Why it can fail</div>
  <div class="lyrics-helper-text">LRCLIB matches mostly by clean title and artist. Remove words like Official MV, Lyrics, Full Version, Remix, Cover, AMV, or anime/game names.</div>
  <div class="lyrics-helper-meta">
    <span>Title</span><strong>${esc(song.title||'Unknown')}</strong>
    <span>Artist</span><strong>${esc(song.artist||'Unknown')}</strong>
  </div>
</div>
<div class="lyrics-actions">
  <button class="lyrics-add-btn primary" id="lyricEditMeta">Edit Metadata</button>
  <a class="lyrics-add-btn" href="https://lrclib.net/" target="_blank" rel="noopener">Open LRCLIB Search</a>
  <a class="lyrics-add-btn" href="${apiUrl}" target="_blank" rel="noopener">Check Exact Match</a>
  <button class="lyrics-add-btn" id="lyricAddPlain">Add Plain Lyrics</button>
  <button class="lyrics-add-btn" id="lyricAddTimestamp">Add Timestamp Lyrics</button>
</div>`;
  setTimeout(()=>{
    $('lyricEditMeta')?.addEventListener('click',()=>{
      const loc=findSongLocation(song);
      if(loc)showMetadataEditor(loc.playlistKey,loc.index);
    });
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
  loadLyricOffsetForSong(song.id);
  showLyricsLoading();
  await initKuroshiro();
  let title=song.title;
  let artist=song.artist;
  if(!song.metadataEdited&&song.file&&typeof jsmediatags!=='undefined'){
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
  const cached=readCachedLyrics(song,title,artist);
  if(cached){
    await renderLyrics(cached);
    return;
  }
  const data=await fetchLyrics(title,artist);
  if(lyricsSongId!==song.id)return;
  if(!data){showLyricsNotFound(song);return;}
  saveCachedLyrics(song,title,artist,data);
  await renderLyrics(data);
}

function playReal(file,song){
  clearInterval(playbackInterval);
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
  if(p.length<2||isNaN(parseInt(p[0]))||isNaN(parseInt(p[1]))){totalDuration=0;$('currentTime').textContent='0:00';$('progressFill').style.width='0%';updateHeroProgress();return;}
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
  const songs=(playlists[currentPlaylist]?.songs)||[];
  if(repeatMode===2){playSong(currentSongIndex);return;}
  if(queue.length>0){playNext();return;}
  if(repeatMode===1||currentSongIndex<songs.length-1){playNext();return;}
  isPlaying=false;updatePlayBtn();
  $('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');
  updateHeroSection();renderSongList($('searchInput').value);showLyricsNone();
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
    songs.push({id,title:file.name.replace(/\.[^/.]+$/,''),artist:'Unknown',album:'',genre:'',year:'',duration:'--:--',addedAt:new Date().toISOString(),file,fileKey:fk});
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
    pl.songs.push({id,title:file.name.replace(/\.[^/.]+$/,''),artist:'Unknown',album:'',genre:'',year:'',duration:'--:--',addedAt:new Date().toISOString(),file,fileKey:fk});
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
async function deleteSongRef(playlistKey,index){
  const pl=playlists[playlistKey];
  const song=pl?.songs[index];
  if(!song)return;
  if(song.fileKey)await dbDel(song.fileKey);
  pl.songs.splice(index,1);
  pl.sub=`${pl.songs.length} tracks`;
  if(playlistKey===currentPlaylist){
    if(currentSongIndex===index){
      audioPlayer.pause();
      if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
      currentSongIndex=-1;isPlaying=false;updatePlayBtn();
    }else if(currentSongIndex>index)currentSongIndex--;
  }
}
function selectedRefs(){
  return[...bulkSelected].map(parseSongRefKey).filter(r=>playlists[r.playlistKey]?.songs[r.index]);
}
async function runBulkAction(action){
  const refs=selectedRefs();
  if(!refs.length)return;
  if(action==='clear'){bulkSelected.clear();renderSongList($('searchInput').value);return;}
  if(action==='select-all'){
    document.querySelectorAll('.bulk-check').forEach(ch=>bulkSelected.add(ch.dataset.bulk));
    renderSongList($('searchInput').value);return;
  }
  if(action==='playlist'){
    const target=await showPlaylistPicker();if(!target)return;
    const pl=playlists[target];
    for(const r of refs){
      const src=playlists[r.playlistKey].songs[r.index];
      if(src&&!pl.songs.some(s=>String(s.id)===String(src.id)))pl.songs.push({...src});
    }
    pl.sub=`${pl.songs.length} tracks`;
  }else if(action==='favorite'){
    refs.forEach(r=>favorites.add(String(playlists[r.playlistKey].songs[r.index].id)));
  }else if(action==='queue'){
    refs.forEach(r=>addToQueue(r.playlistKey,r.index));
  }else if(action==='delete'){
    if(!await showConfirm(`Delete ${refs.length} selected track${refs.length!==1?'s':''}?`))return;
    refs.sort((a,b)=>a.playlistKey.localeCompare(b.playlistKey)||b.index-a.index);
    for(const r of refs)await deleteSongRef(r.playlistKey,r.index);
    bulkSelected.clear();
  }
  libraryOrder=null;renderPlaylistGrid();renderSongList($('searchInput').value);saveState();
}

async function handleRename(key){
  const newName=await showRename(playlists[key].name);if(!newName)return;
  playlists[key].name=newName;
  renderPlaylistNav();renderPlaylistGrid();
  if(key===currentPlaylist){$('breadcrumbTitle').textContent=newName;$('secTitle').textContent=newName;}
  saveState();
}

function showMetadataEditor(playlistKey,index){
  const pl=playlists[playlistKey];
  const song=pl?.songs[index];
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
      <button class="modal-btn" id="mc">Cancel</button>
      <button class="modal-btn modal-ok" id="mo">Save</button>
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
  const kh=e=>{if(e.key==='Escape'){document.removeEventListener('keydown',kh);close();}if(e.key==='Enter'&&e.ctrlKey){document.removeEventListener('keydown',kh);save();}};
  document.addEventListener('keydown',kh);
  $('metaTitle').focus();$('metaTitle').select();
  $('mc').onclick=()=>{document.removeEventListener('keydown',kh);close();};
  $('mo').onclick=()=>{document.removeEventListener('keydown',kh);save();};
  o.onclick=e=>{if(e.target===o){document.removeEventListener('keydown',kh);close();}};
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

function loadThemeCSS(theme){
  const id='lumi-theme-css';
  const existing=document.getElementById(id);
  if(existing)existing.remove();
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=`themes/${theme}.css`;
  link.id=id;
  document.head.appendChild(link);
}

function applyTheme(theme){
  currentTheme=theme;
  document.body.dataset.theme=theme;
  localStorage.setItem('lumi-theme',theme);
  loadThemeCSS(theme);
}

function showSettingsModal(){
  const o=$('confirmOverlay');
  let currentSection='general';

  const sections={
    general:{
      label:'General',icon:'⚙',
      render(){
        return`<div class="settings-section-title">General</div>
          <div class="settings-section-desc">Import and export your playlist data</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Export Playlists</span>
                <small>Backup all playlists to a JSON file</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn" id="sExport">⬇ Export</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Import Playlists</span>
                <small>Restore playlists from a JSON backup</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn" id="sImport">⬆ Import</button>
              </div>
            </div>
          </div>`;
      },
      bind(){
        $('sExport').onclick=()=>{close();exportPlaylists();};
        $('sImport').onclick=()=>{
          const inp=document.createElement('input');
          inp.type='file';inp.accept='.json';inp.style.display='none';
          inp.addEventListener('change',async e=>{close();await importPlaylists(e);});
          document.body.appendChild(inp);
          inp.click();
          setTimeout(()=>document.body.removeChild(inp),1000);
        };
      }
    },
    appearance:{
      label:'Appearance',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4"/></svg>',
      render(){
        const themeOpts=availableThemes.map(t=>{
          const active=t===currentTheme;
          const label=t.charAt(0).toUpperCase()+t.slice(1);
          const swatch={default:'#0e0c0a',retro:'#f2e8d5',zine:'#1a1612',neurophism:'#e8e4df'}[t]||'#888';
          return`<button class="theme-option${active?' active':''}" data-theme="${t}">
            <span class="theme-option-swatch" style="background:${swatch}"></span>
            <span class="theme-option-label">${label}</span>
            ${active?'<span class="theme-option-check">✓</span>':''}
          </button>`;
        }).join('');
        return`<div class="settings-section-title">Appearance</div>
          <div class="settings-section-desc">Customize the look and feel of LumiTune</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Theme</span>
                <small>Select your preferred theme</small>
              </div>
            </div>
            <div class="theme-list">${themeOpts}</div>
          </div>`;
      },
      bind(){
        o.querySelectorAll('.theme-option').forEach(el=>{
          el.onclick=()=>{
            const theme=el.dataset.theme;
            applyTheme(theme);
            renderContent('appearance');
          };
        });
      }
    },
    lyrics:{
      label:'Lyrics',icon:'♪',
      render(){
        const modeLabel=lyricsMode==='romaji'?'Romaji':'Japanese';
        return`<div class="settings-section-title">Lyrics</div>
          <div class="settings-section-desc">Configure how lyrics are displayed</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Display Mode</span>
                <small>Show lyrics in Romaji or Japanese script</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn${lyricsMode==='romaji'?' active':''}" id="sLyricMode">${modeLabel}</button>
              </div>
            </div>
          </div>`;
      },
      bind(){
        $('sLyricMode').onclick=()=>{
          toggleLyricsMode();
          renderContent('lyrics');
        };
      }
    },
    shortcuts:{
      label:'Shortcuts',icon:'⌨',
      render(){
        const shortcuts=getActiveShortcuts();
        const categories={};
        Object.entries(shortcuts).forEach(([key,sc])=>{
          const cat=sc.category||'Other';
          if(!categories[cat])categories[cat]=[];
          categories[cat].push({key,...sc});
        });
        let listHtml='';
        Object.entries(categories).forEach(([cat,items])=>{
          listHtml+=`<div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.1em;margin:12px 0 4px">${esc(cat)}</div>`;
          items.forEach(item=>{
            listHtml+=`<div class="shortcuts-inline-row">
              <span class="shortcuts-inline-label">${esc(item.label)}</span>
              <span class="shortcuts-inline-keys">${esc(formatShortcut(item))}</span>
            </div>`;
          });
        });
        return`<div class="settings-section-title">Keyboard Shortcuts</div>
          <div class="settings-section-desc">View available keyboard shortcuts</div>
          <div class="setting-group">
            <div class="shortcuts-inline-list">${listHtml}</div>
            <button class="setting-btn primary" id="sCustomizeShortcuts">⌨ Customize Shortcuts</button>
          </div>`;
      },
      bind(){
        $('sCustomizeShortcuts').onclick=()=>{close();showShortcutsModal();};
      }
    },
    about:{
      label:'About',icon:'ℹ',
      render(){
        return`<div class="about-info">
          <div class="about-name">LUMITUNE</div>
          <div class="about-ver">Version 1.0.0</div>
          <div class="about-desc">A sleek audio player with YouTube integration, lyrics support, and playlist management. Built with vanilla JavaScript, CSS, and Node.js.</div>
        </div>`;
      },
      bind(){}
    }
  };

  function renderContent(key){
    currentSection=key;
    const content=$('settingsContent');
    if(!content)return;
    content.innerHTML=sections[key].render();
    if(sections[key].bind)sections[key].bind();
    o.querySelectorAll('.settings-nav-item').forEach(el=>{
      el.classList.toggle('active',el.dataset.section===key);
    });
  }

  o.innerHTML=`<div class="modal-box settings-page">
    <div class="settings-page-header">
      <div class="modal-msg">Settings</div>
      <button class="modal-btn modal-ok" id="mc">Close</button>
    </div>
    <div class="settings-body">
      <div class="settings-sidebar">
        ${Object.entries(sections).map(([key,sec])=>`
          <button class="settings-nav-item${key===currentSection?' active':''}" data-section="${key}">
            <span class="settings-nav-icon">${sec.icon}</span>
            <span>${sec.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="settings-content" id="settingsContent">${sections[currentSection].render()}</div>
    </div>
  </div>`;
  o.style.display='flex';
  if(o._skh)document.removeEventListener('keydown',o._skh);
  const kh=e=>{if(e.key==='Escape')close()};
  o._skh=kh;
  document.addEventListener('keydown',kh);
  const close=()=>{if(o._skh){document.removeEventListener('keydown',o._skh);o._skh=null;}o.style.display='none'};
  o.onclick=e=>{if(e.target===o)close();};

  o.querySelectorAll('.settings-nav-item').forEach(el=>{
    el.onclick=()=>renderContent(el.dataset.section);
  });
  $('mc').onclick=()=>{close();};
  if(sections[currentSection].bind)sections[currentSection].bind();
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
    data.playlists[key]={name:pl.name,emoji:pl.emoji,color:pl.color,sub:pl.sub,songs:pl.songs.map(s=>({id:s.id,title:s.title,artist:s.artist,album:s.album||'',genre:s.genre||'',year:s.year||'',duration:s.duration,addedAt:s.addedAt||'',metadataEdited:!!s.metadataEdited,fileKey:s.fileKey||`file-${key}-${s.id}`}))};
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
      const songs=(pl.songs||[]).map(s=>({id:s.id,title:s.title,artist:s.artist||'Unknown',album:s.album||'',genre:s.genre||'',year:s.year||'',duration:s.duration||'--:--',addedAt:s.addedAt||'',metadataEdited:!!s.metadataEdited,fileKey:s.fileKey||null}));
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
  const loading=showLoading('<div class="yt-loading"><div class="yt-spinner"></div><div class="yt-step">Step 1 of 4</div><div>Fetching video info&hellip;</div></div>');
  let info;
  try{info=await fetchYouTubeInfo(id);}catch(e){loading(null);await showMessage(`<div class="yt-error">API failed<br><span style="font-size:11px;color:var(--text3)">${esc(e.message||'Is the server running? node server.js')}</span></div>`,'OK');return;}
  loading(`<div class="yt-loading"><div class="yt-spinner"></div><div class="yt-step">Step 2 of 4</div><div>Ready to save<br><strong>${esc(info.title||'YouTube audio')}</strong></div></div>`);
  loading(null);
  const targetKey=await showPlaylistPicker();
  if(!targetKey)return;
  const loading2=showLoading(`<div class="yt-loading"><div class="yt-spinner"></div><div class="yt-step">Step 3 of 4</div><div>Downloading audio stream&hellip;<br><strong>${esc(info.title||'YouTube audio')}</strong></div></div>`);
  try{
    const pl=playlists[targetKey];
    const sid=Date.now();
    const fk=`file-${targetKey}-${sid}`;
    const{blob,title,author}=await fetchYouTubeAudio(id);
    loading2(`<div class="yt-loading"><div class="yt-spinner"></div><div class="yt-step">Step 4 of 4</div><div>Saving to ${esc(pl.name||'playlist')}&hellip;</div></div>`);
    await dbStore(fk,blob);
    pl.songs.push({id:sid,title:title||info.title||'Unknown',artist:author||info.author_name||'YouTube',album:'YouTube',genre:'',year:'',duration:'--:--',addedAt:new Date().toISOString(),file:blob,fileKey:fk});
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
  o.querySelectorAll('.queue-del').forEach(btn=>{btn.onclick=()=>{const idx=parseInt(btn.dataset.qdel);removeFromQueue(idx);if(!queue.length)close();};});
}

function recordNav(){
  navHistory.push({
    view:currentView,
    playlist:currentPlaylist,
    artist:selectedArtist,
    album:selectedAlbum,
    smart:selectedSmart
  });
  navFuture=[];
  updateNavBtns();
}
function makeNavState(){
  return {view:currentView,playlist:currentPlaylist,artist:selectedArtist,album:selectedAlbum,smart:selectedSmart};
}
function goBack(){
  if(!navHistory.length)return;
  navFuture.push(makeNavState());
  const s=navHistory.pop();applyNavState(s);
}
function goForward(){
  if(!navFuture.length)return;
  navHistory.push(makeNavState());
  const s=navFuture.pop();applyNavState(s);
}
function applyNavState(s){
  if(s.playlist!==undefined&&s.playlist!==currentPlaylist&&s.view!=='playlists'){
    currentPlaylist=s.playlist;
    renderPlaylistNav();
    renderPlaylistGrid();
  }
  if(s.artist!==undefined)selectedArtist=s.artist;
  if(s.album!==undefined)selectedAlbum=s.album;
  if(s.smart!==undefined)selectedSmart=s.smart;
  switchView(s.view);
  saveState();
  updateNavBtns();
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

  $('offsetMinus')?.addEventListener('click',()=>adjustLyricOffset(-0.1,currentLyricOffsetSongId));
  $('offsetPlus')?.addEventListener('click',()=>adjustLyricOffset(0.1,currentLyricOffsetSongId));
  $('offsetMinusBig')?.addEventListener('click',()=>adjustLyricOffset(-0.5,currentLyricOffsetSongId));
  $('offsetPlusBig')?.addEventListener('click',()=>adjustLyricOffset(0.5,currentLyricOffsetSongId));
  $('offsetReset')?.addEventListener('click',()=>resetLyricOffset(currentLyricOffsetSongId));

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
  const tool=e.target.closest('[data-tool]');if(tool){selectedTool=tool.dataset.tool;bulkSelected.clear();renderSongList($('searchInput').value);return;}
  const bulkAction=e.target.closest('[data-bulk-action]');if(bulkAction){runBulkAction(bulkAction.dataset.bulkAction);return;}
  const bulk=e.target.closest('.bulk-check');if(bulk){if(bulk.checked)bulkSelected.add(bulk.dataset.bulk);else bulkSelected.delete(bulk.dataset.bulk);renderSongList($('searchInput').value);return;}
  const ren=e.target.closest('[data-rename]');if(ren){handleRename(ren.dataset.rename);return;}
  const del=e.target.closest('[data-delete]');if(del){handleDeletePlaylist(del.dataset.delete);return;}
  const delt=e.target.closest('.del-btn');if(delt){handleDeleteTrack(parseInt(delt.dataset.del));return;}
  const like=e.target.closest('.like-btn');if(like){toggleFav(like.dataset.songId);return;}
  const qadd=e.target.closest('.queue-btn-row');if(qadd){addToQueue(qadd.dataset.qpl,parseInt(qadd.dataset.qadd));return;}
  const edit=e.target.closest('.edit-track-btn');if(edit){showMetadataEditor(edit.dataset.editPl,parseInt(edit.dataset.edit));return;}
   const artist=e.target.closest('[data-artist]');if(artist){recordNav();selectedArtist=artist.dataset.artist;currentView='artists';renderSongList($('searchInput').value);return;}
   const album=e.target.closest('[data-album]');if(album){recordNav();selectedAlbum=album.dataset.album;currentView='albums';renderSongList($('searchInput').value);return;}
   const smart=e.target.closest('[data-smart]');if(smart){recordNav();selectedSmart=smart.dataset.smart;currentView='smart';renderSongList($('searchInput').value);return;}
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
  const savedTheme=localStorage.getItem('lumi-theme');
  if(savedTheme&&availableThemes.includes(savedTheme))applyTheme(savedTheme);
  else applyTheme('default');
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
