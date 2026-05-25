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
    const[cover]=await Promise.all([extractCoverFromFile(file),dbStore(fk,file)]);
    songs.push({id,title:file.name.replace(/\.[^/.]+$/,''),artist:'Unknown',album:'',genre:'',year:'',duration:'--:--',addedAt:new Date().toISOString(),file,fileKey:fk,cover});
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
    const[cover]=await Promise.all([extractCoverFromFile(file),dbStore(fk,file)]);
    pl.songs.push({id,title:file.name.replace(/\.[^/.]+$/,''),artist:'Unknown',album:'',genre:'',year:'',duration:'--:--',addedAt:new Date().toISOString(),file,fileKey:fk,cover});
  }
  pl.sub=`${pl.songs.length} tracks`;
  libraryOrder=null;if(currentPlaylist===targetKey)renderSongList($('searchInput').value);
  renderPlaylistNav();renderPlaylistGrid();saveState();e.target.value='';
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
    currentSongIndex=-1;currentPlaylistPlaying='';isPlaying=false;updatePlayBtn();updateUpNext();
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
    currentSongIndex=-1;currentPlaylistPlaying='';isPlaying=false;updatePlayBtn();updateUpNext();
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
