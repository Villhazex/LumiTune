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
