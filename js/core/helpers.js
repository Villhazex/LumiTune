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

function displayTitle(s){
  return s.customTitle||s.title||'Unknown';
}

function displayFileName(s){
  return s.fileName||(s.filePath?s.filePath.split('\\').pop().split('/').pop():'')||'—';
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
  return [...map.entries()].sort((a,b)=>a[0].localeCompare(b[0],undefined,{numeric:true}));
}

function readID3Tags(file,signal){
  return new Promise(res=>{
    if(!file||typeof jsmediatags==='undefined'){res(null);return;}
    if(signal?.aborted){res(null);return;}
    const timer=setTimeout(()=>res(null),1500);
    const onAbort=()=>{clearTimeout(timer);res(null);};
    signal?.addEventListener('abort',onAbort,{once:true});
    jsmediatags.read(file,{
      onSuccess:t=>{clearTimeout(timer);res(t.tags);},
      onError:()=>{clearTimeout(timer);res(null);}
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
  const debounced=function(...args){
    clearTimeout(timer);
    timer=setTimeout(()=>fn.apply(this,args),ms);
  };
  debounced.cancel=()=>clearTimeout(timer);
  return debounced;
}

function updatePlayingRow(){
  const el=$('songList');if(!el)return;
  el.querySelectorAll('.track-row.active').forEach(row=>row.classList.remove('active'));
  const selector=`[data-playlist="${currentPlaylistPlaying}"][data-index="${currentSongIndex}"]`;
  const row=el.querySelector(selector);
  if(row)row.classList.add('active');
}
async function rescanTrack(song){
  if(!isTauri()||!inv){showToast('Rescan only available in desktop app');return;}
  if(!song.filePath){showToast('No local file path for this track');return;}
  showToast('Rescanning track...');
  try{
    const result=await inv('identify_single_file',{path:song.filePath,acoustidKey:ACOUSTID_API_KEY});
    if(result&&result.success){
      const oldTitle=displayTitle(song),oldArtist=song.artist;
      song.title=result.title||song.title;
      song.artist=result.artist||song.artist;
      song.album=result.album||song.album;
      song.year=result.year||song.year;
      song.genre=result.genre||song.genre;
      if(result.duration!=null&&result.duration>0)song.duration=fmt(result.duration);
      if(result.cover_data_base64&&!song.cover)song.cover='data:'+result.cover_mime+';base64,'+result.cover_data_base64;
      song.metadataSource=result.method;
      song.reliability=result.reliability||'low';
      song.suspectedSwapped=!!result.suspected_swapped;
      if(result.title_similarity!=null)song.titleSimilarity=result.title_similarity;
      if(result.artist_similarity!=null)song.artistSimilarity=result.artist_similarity;
      if(result.final_score)song.finalScore=result.final_score;
      saveState();
      renderSongList($('searchInput').value);
      renderPlaylistGrid();
      const loc=findSongLocation(song);
      if(loc&&loc.playlistKey===currentPlaylist&&loc.index===currentSongIndex){
        $('trackTitle').textContent=displayTitle(song);
        $('trackArtist').textContent=song.artist;
        updateHeroSection();
        fetchLyricsForSong(song);
      }
      const changed=displayTitle(song)!==oldTitle||song.artist!==oldArtist;
      showToast((changed?'✅ ':'ℹ️ ')+(changed?'Updated: ':'No change to title/artist. ')+displayTitle(song)+' — '+song.artist);
    }else{
      showToast('❌ Rescan failed: '+(result?.error||'Unknown error'));
    }
  }catch(e){
    showToast('❌ Rescan error: '+e);
  }
}
