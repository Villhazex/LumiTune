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
    custom[key]={name:pl.name,emoji:pl.emoji,color:pl.color,sub:pl.sub,songs:pl.songs};
  }
  const songData={};
  Object.entries(songs).forEach(([id,s])=>{
    const{file,...r}=s;
    songData[id]=r;
  });
  try{
    localStorage.setItem('lumi-pl',JSON.stringify(custom));
    localStorage.setItem('lumi-songs',JSON.stringify(songData));
    localStorage.setItem('lumi-fav',JSON.stringify([...favorites]));
    localStorage.setItem('lumi-vol',String(volume));
    localStorage.setItem('lumi-rep',String(repeatMode));
    localStorage.setItem('lumi-shuf',String(isShuffle));
    localStorage.setItem('lumi-cur',currentPlaylist);
    localStorage.setItem('lumi-rec',JSON.stringify(recentPlaylists));
    localStorage.setItem('lumi-src',JSON.stringify(recentSearches));
    localStorage.setItem('lumi-pt',String(totalPlayTime));
    localStorage.setItem('lumi-infinity',infinityMode);
    localStorage.setItem('lumi-stabilize',String(audioStabilize));
    localStorage.setItem('lumi-loudness-target',String(loudnessTarget));
    localStorage.setItem('lumi-recent-plays',JSON.stringify(recentPlays));
  }catch(e){}
}
async function loadState(){
  try{
    totalPlayTime=parseFloat(localStorage.getItem('lumi-pt')||'0');
    const raw=localStorage.getItem('lumi-pl');
    const songsRaw=localStorage.getItem('lumi-songs');
    let migrated=false;
    if(songsRaw){
      const songData=JSON.parse(songsRaw);
      for(const[id,s]of Object.entries(songData)){
        const file=await dbGet(s.fileKey).catch(()=>null);
        songs[id]=file?{...s,file,fileKey:s.fileKey}:{...s};
      }
    }
    if(raw){
      const custom=JSON.parse(raw);
      for(const[key,pl]of Object.entries(custom)){
        if(Array.isArray(pl.songs)&&pl.songs.length>0&&typeof pl.songs[0]==='object'){
          migrated=true;
          const oldIds=[];
          for(const s of pl.songs){
            const sid=String(s.id);
            if(!songs[sid]){
              const fk=s.fileKey||`file-${key}-${sid}`;
              const file=await dbGet(fk).catch(()=>null);
              songs[sid]=file?{...s,file,fileKey:fk}:{...s};
            }
            oldIds.push(sid);
          }
          pl.songs=oldIds;
        }else if(Array.isArray(pl.songs)&&pl.songs.length>0&&typeof pl.songs[0]==='string'){
          if(!songsRaw){
            for(const id of pl.songs){
              if(!songs[id]){
                const fk=`file-${key}-${id}`;
                const file=await dbGet(fk).catch(()=>null);
                songs[id]=file?{id,file,fileKey:fk}:{id};
              }
            }
          }
        }
        playlists[key]={...pl};
      }
      if(migrated){
        saveState();
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
    if(Array.isArray(src))recentSearches=src.map(s=>typeof s==='string'?{term:s,time:0}:s).filter(s=>s&&s.term);
    const rp=JSON.parse(localStorage.getItem('lumi-recent-plays')||'[]');
    if(Array.isArray(rp))recentPlays=rp.filter(p=>p&&p.id);
    infinityMode=localStorage.getItem('lumi-infinity')||'off';
    if(infinityMode==='true')infinityMode='song';
    audioStabilize=localStorage.getItem('lumi-stabilize')==='true';
    const lt=parseFloat(localStorage.getItem('lumi-loudness-target'));
    if(!isNaN(lt))loudnessTarget=Math.max(-30,Math.min(-10,lt));
  }catch(e){console.warn(e);}
}

function getMonthPlays(){
  try{return JSON.parse(localStorage.getItem('lumi-plays-'+monthKey())||'{}');}catch(e){return{};}
}
function saveMonthPlays(data){
  try{localStorage.setItem('lumi-plays-'+monthKey(),JSON.stringify(data));}catch(e){}
}
function incrementPlayCount(id,title,artist){
  const sid=String(id);
  const data=getMonthPlays();
  const prev=data[sid];
  const count=typeof prev==='number'?prev:(prev?.c||0);
  data[sid]={c:count+1,t:title||'Unknown',a:artist||''};
  saveMonthPlays(data);
}

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
