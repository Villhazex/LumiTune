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

function monthKey(){
  const d=new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');
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

function normalizeMeta(value){
  return String(value||'').trim().toLowerCase().replace(/\s+/g,' ');
}

function getSong(id){
  return songs[String(id)]||null;
}

function getLooseSongs(){
  const used=new Set();
  Object.values(playlists).forEach(pl=>pl.songs.forEach(id=>used.add(String(id))));
  return Object.values(songs).filter(s=>!used.has(String(s.id)));
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

function findSongById(id){
  return getSong(id);
}

function findSongLocation(song){
  const sid=String(song?.id||'');
  for(const[playlistKey,pl]of Object.entries(playlists)){
    const index=pl.songs.findIndex(id=>String(id)===sid);
    if(index>-1)return{playlistKey,index};
  }
  return null;
}

function playlistSongs(pl){
  return Array.isArray(pl?.songs)?pl.songs:[];
}

function allLibrarySongs(){
  const all=[];
  Object.entries(playlists).forEach(([playlistKey,pl])=>{
    playlistSongs(pl).forEach((songId,songIndex)=>{
      const song=getSong(songId);
      if(song)all.push({...song,playlistKey,songIndex});
    });
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

function readID3Tags(file){
  return new Promise(res=>{
    if(!file||typeof jsmediatags==='undefined'){res(null);return;}
    jsmediatags.read(file,{
      onSuccess:t=>res(t.tags),
      onError:()=>res(null)
    });
  });
}

function extractCoverFromFile(file){
  return new Promise(res=>{
    if(!file||typeof jsmediatags==='undefined'){res(undefined);return;}
    jsmediatags.read(file,{
      onSuccess:t=>{
        const pic=t.tags?.picture;
        if(!pic||!pic.data||!pic.format){res(undefined);return;}
        const data=pic.data instanceof Uint8Array?pic.data:new Uint8Array(pic.data);
        let binary='';
        for(let i=0;i<data.length;i++)binary+=String.fromCharCode(data[i]);
        res(`data:${pic.format};base64,${btoa(binary)}`);
      },
      onError:()=>res(undefined)
    });
  });
}

function debounce(fn,ms){
  let timer;
  return function(...args){
    clearTimeout(timer);
    timer=setTimeout(()=>fn.apply(this,args),ms);
  };
}
