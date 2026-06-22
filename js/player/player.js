function extractCoverBg(song){
  if(song.file){extractCoverFromFile(song.file).then(c=>{if(c){song.cover=c;saveState();}});}
  else if(song.filePath&&isTauri()&&inv){
    if(song.hasEmbeddedCover!==false)inv('extract_file_cover',{path:song.filePath}).then(r=>{if(r&&r[0]){song.cover='data:'+r[1]+';base64,'+r[0];saveState();}}).catch(()=>{});
    setTimeout(async()=>{
      if(!song.cover)try{const r=await inv('batch_get_covers',{paths:[song.filePath]});if(r&&r[0]&&r[0][1]){song.cover='data:'+r[0][2]+';base64,'+r[0][1];saveState();}}catch(e){}
    },100);
  }
}
let _playReqId=0;
let _lastSavedVol=-1;
function setVolume(newVol){
  volume=Math.max(0,Math.min(1,newVol));
  audioPlayer.volume=isMuted?0:volume;
  $('volFill').style.width=`${volume*100}%`;
  const hs=$('heroVolSlider');if(hs)hs.value=Math.round(volume*100);
  const hl=$('heroVolLabel');if(hl)hl.textContent=`VOL ${Math.round(volume*100)}`;
  updateVolIcon();
  const rounded=Math.round(volume*100);
  if(rounded!==_lastSavedVol){_lastSavedVol=rounded;saveState();}
  showVolPopup();
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

function _pm(name){try{performance.mark(name)}catch(e){}}
function _pe(name,startMark){try{performance.measure(name,startMark);performance.clearMarks(startMark);performance.clearMeasures(name)}catch(e){}}
async function playSong(index,playlistKey,addToQueue){
  _pm('playSong-start');
  if(lyricsAbort){lyricsAbort.abort();lyricsAbort=null;}
  if(lyricsAbortTimer){clearTimeout(lyricsAbortTimer);lyricsAbortTimer=null;}
  _lyricsReqId++;
  lyricsSongId=null;

  const wasDifferentPlaylist=playlistKey&&playlistKey!==currentPlaylist;
  if(wasDifferentPlaylist)recordNav();

  _pm('playSong-audioStop');
  audioPlayer.pause();
  if(currentAudioFile){URL.revokeObjectURL(audioPlayer.src);audioPlayer.src='';currentAudioFile=null;}
  clearInterval(playbackInterval);
  _pe('playSong-audioStop','playSong-audioStop');

  if(playlistKey)currentPlaylist=playlistKey;
  currentSongIndex=index;
  currentPlaylistPlaying=currentPlaylist;

  recordPlay(currentPlaylist);
  if(!playlists[currentPlaylist])return;
  const songs=playlists[currentPlaylist].songs;
  if(index<0||index>=songs.length)return;

  if(addToQueue){
    const existing=queue.findIndex(q=>q.playlistKey===currentPlaylist&&q.songIndex===index);
    if(existing>=0){
      currentQueueIdx=existing;
    }else{
      const insertAt=currentQueueIdx>=0?currentQueueIdx+1:queue.length;
      queue.splice(insertAt,0,{playlistKey:currentPlaylist,songIndex:index});
      currentQueueIdx=insertAt;
    }
    updateQueueUI();
  }

  currentSongIndex=index;
  currentPlaylistPlaying=currentPlaylist;

  const songId=playlists[currentPlaylist].songs[currentSongIndex];
  const song=getSong(songId);
  if(!song)return;

  _pm('playSong-domUpdate');
  lastTrackedPos=0;
  const aa=$('albumArt');
  $('trackTitle').textContent=displayTitle(song);
  $('trackArtist').textContent=song.artist;
  if(song.cover){
    aa.style.backgroundImage=`url(${JSON.stringify(song.cover)})`;
    aa.style.backgroundSize='cover';
    aa.style.backgroundPosition='center';
    aa.classList.add('has-cover');
  }else{
    aa.style.backgroundImage='';
    aa.classList.remove('has-cover');
  }
  _pe('playSong-domUpdate','playSong-domUpdate');
  requestAnimationFrame(()=>{
    _pm('playSong-rAF');
    const emoji=aa.querySelector('.art-emoji');
    emoji.textContent='♫';
    emoji.style.display=song.cover?'none':'';
    updateLikeBtn();
    isPlaying=true;updatePlayBtn();
    aa.classList.add('playing');
    $('vizBars').classList.add('active');
    updateHeroSection();
    updatePlayingRow();
    _pe('playSong-rAF','playSong-rAF');
  });

  _pm('playSong-startAudio');
  if(song.file||song.filePath)playReal(song.file,song);else simPlay(song.duration);
  _pe('playSong-startAudio','playSong-startAudio');

  setTimeout(()=>{
    _pm('playSong-setTimeout0');
    incrementPlayCount(song.id,displayTitle(song),song.artist);
    trackRecentPlay(song,currentPlaylist);
    if(!song.cover)extractCoverBg(song);
    if(wasDifferentPlaylist){renderPlaylistNav();renderPlaylistGrid();saveState();}
    updateUpNext();
    _pe('playSong-setTimeout0','playSong-setTimeout0');
  },0);
  setTimeout(()=>{
    _pm('playSong-fetchLyrics');
    fetchLyricsForSong(song).catch(e=>console.warn('fetchLyricsForSong error:',e));
    _pe('playSong-fetchLyrics','playSong-fetchLyrics');
  },200);
  _pe('playSong-start','playSong-start');
}

async function playReal(file,song){
  _pm('playReal-start');
  const reqId=++_playReqId;
  clearInterval(playbackInterval);
  currentAudioFile=null;
  let src;
  _pm('playReal-getSrc');
  if(file){
    src=URL.createObjectURL(file);
    currentAudioFile=file;
  }else if(song.filePath&&inv){
    try{
      src=convertFileSrc(song.filePath);
      currentAudioFile=src;
    }catch(e){
      console.warn('convertFileSrc failed:',e);
      return;
    }
  }else return;
  _pe('playReal-getSrc','playReal-getSrc');
  console.log('playReal src:',src,'filePath:',song.filePath,'hasFile:',!!file, 'hasInv:',!!inv);
  _pm('playReal-audioInit');
  audioPlayer.onerror=()=>console.warn('Audio error:',audioPlayer.error?.code,audioPlayer.error?.message,'src:',audioPlayer.src);
  audioPlayer.onloadedmetadata=()=>{totalDuration=audioPlayer.duration;$('totalTime').textContent=fmt(totalDuration);$('heroTotalTime').textContent=fmt(totalDuration);const ktt=$('karaokeTotalTime');if(ktt)ktt.textContent=fmt(totalDuration);song.duration=fmt(totalDuration);const activeRow=$('songList')?.querySelector('.track-row.active');if(activeRow){const durEl=activeRow.querySelector('.t-dur');if(durEl)durEl.textContent=song.duration;}};
  audioPlayer.ontimeupdate=()=>{if(!isDraggingProgress){currentPlaybackTime=audioPlayer.currentTime;if(isPlaying){const delta=currentPlaybackTime-lastTrackedPos;if(delta>0&&delta<5){totalPlayTime+=delta;sessionPlayTime+=delta;}}lastTrackedPos=currentPlaybackTime;updateLyricHighlight(currentPlaybackTime);$('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(currentPlaybackTime);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=`${(currentPlaybackTime/totalDuration)*100}%`;updateHeroProgress();}};
  audioPlayer.onended=handleEnd;
  audioPlayer.volume=isMuted?0:volume;
  _pm('playReal-loadAudio');
  audioPlayer.src=src;
  audioPlayer.load();
  audioPlayer.play().catch(e=>console.warn('play() failed:',e));
  _pe('playReal-loadAudio','playReal-loadAudio');
  clearInterval(loudnessInterval);
  loudnessInterval=null;
  if(audioStabilize){_pm('playReal-audioChain');initAudioChain();applyGain(song);measureLoudness(song);_pe('playReal-audioChain','playReal-audioChain');}
  _pe('playReal-start','playReal-start');
}

function simPlay(durStr){
  clearInterval(playbackInterval);
  if(!durStr||durStr==='--:--'){totalDuration=0;$('totalTime').textContent='--:--';$('currentTime').textContent='0:00';$('progressFill').style.width='0%';const kct=$('karaokeCurrentTime');if(kct)kct.textContent='0:00';const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width='0%';updateHeroProgress();return;}
  const p=durStr.split(':');
  if(p.length<2||isNaN(parseInt(p[0]))||isNaN(parseInt(p[1]))){totalDuration=0;$('currentTime').textContent='0:00';$('progressFill').style.width='0%';const kct=$('karaokeCurrentTime');if(kct)kct.textContent='0:00';const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width='0%';updateHeroProgress();return;}
  totalDuration=parseInt(p[0])*60+parseInt(p[1]);
  currentPlaybackTime=0;
  $('totalTime').textContent=durStr;$('currentTime').textContent='0:00';$('progressFill').style.width='0%';const ktt=$('karaokeTotalTime');if(ktt)ktt.textContent=durStr;const kct=$('karaokeCurrentTime');if(kct)kct.textContent='0:00';const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width='0%';updateHeroProgress();
  playbackInterval=setInterval(()=>{
    if(isPlaying){currentPlaybackTime+=0.1;totalPlayTime+=0.1;sessionPlayTime+=0.1;updateLyricHighlight(currentPlaybackTime);if(currentPlaybackTime>=totalDuration){$('currentTime').textContent=fmt(totalDuration);$('progressFill').style.width='100%';const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(totalDuration);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width='100%';updateHeroProgress();handleEnd();return;}
    $('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(currentPlaybackTime);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=`${(currentPlaybackTime/totalDuration)*100}%`;updateHeroProgress();
}},100);
}

function initAudioChain(){
  if(!audioCtx){
    audioCtx=new(window.AudioContext||window.webkitAudioContext)();
    gainNode=audioCtx.createGain();
    analyserNode=audioCtx.createAnalyser();
    analyserNode.fftSize=2048;
  }
  if(audioCtx.state==='suspended')audioCtx.resume();
  if(window.audioSourceNode)return;
  try{
    window.audioSourceNode=audioCtx.createMediaElementSource(audioPlayer);
    window.audioSourceNode.connect(gainNode);
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
  }catch(e){console.warn('Audio chain init failed:',e);}
}
function destroyAudioChain(){
  clearInterval(loudnessInterval);
  loudnessInterval=null;
  if(analyserNode){try{analyserNode.disconnect();}catch(e){}}
  if(gainNode){try{gainNode.disconnect();}catch(e){}}
  if(window.audioSourceNode){try{window.audioSourceNode.disconnect();}catch(e){}window.audioSourceNode=null;}
  if(audioCtx){audioCtx.close().catch(()=>{});audioCtx=null;gainNode=null;analyserNode=null;}
}
function applyGain(song){
  if(!gainNode||!audioStabilize){if(gainNode)gainNode.gain.value=1;return;}
  if(song.loudness==null){gainNode.gain.value=1;return;}
  const gainDb=loudnessTarget-song.loudness;
  const clampedDb=Math.max(-12,Math.min(12,gainDb));
  gainNode.gain.value=Math.pow(10,clampedDb/20);
}
function measureLoudness(song){
  clearInterval(loudnessInterval);
  if(!analyserNode||!audioStabilize)return;
  const bufferLength=analyserNode.frequencyBinCount;
  const dataArray=new Uint8Array(bufferLength);
  let measureCount=0;
  let totalRms=0;
  loudnessInterval=setInterval(()=>{
    analyserNode.getByteTimeDomainData(dataArray);
    let sum=0;
    for(let i=0;i<bufferLength;i++){const v=(dataArray[i]-128)/128;sum+=v*v;}
    const rms=Math.sqrt(sum/bufferLength);
    if(rms>0.001){totalRms+=rms;measureCount++;}
    if(measureCount>=60){
      clearInterval(loudnessInterval);
      loudnessInterval=null;
      const avgRms=totalRms/measureCount;
      song.loudness=Math.max(-60,Math.min(0,20*Math.log10(avgRms)));
      saveState();
    }
  },100);
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){
    if(playbackInterval){clearInterval(playbackInterval);playbackInterval=null;}
    if(loudnessInterval){clearInterval(loudnessInterval);loudnessInterval=null;}
  }else{
    if(audioCtx&&audioCtx.state==='suspended')audioCtx.resume();
    if(isPlaying&&!audioPlayer.src&&!playbackInterval&&totalDuration>0){
      playbackInterval=setInterval(()=>{
        if(isPlaying){currentPlaybackTime+=0.1;totalPlayTime+=0.1;sessionPlayTime+=0.1;updateLyricHighlight(currentPlaybackTime);if(currentPlaybackTime>=totalDuration){$('currentTime').textContent=fmt(totalDuration);$('progressFill').style.width='100%';const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(totalDuration);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width='100%';updateHeroProgress();handleEnd();return;}
        $('currentTime').textContent=fmt(currentPlaybackTime);$('progressFill').style.width=`${(currentPlaybackTime/totalDuration)*100}%`;const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(currentPlaybackTime);const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=`${(currentPlaybackTime/totalDuration)*100}%`;updateHeroProgress();
      }},100);
    }
  }
});

function stopPlayback(){
  isPlaying=false;updatePlayBtn();playlistCardHistory=[];
  $('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');
  updateHeroSection();updatePlayingRow();showLyricsNone();updateUpNext();
}
function playRandom(){
  const allKeys=Object.keys(playlists).filter(k=>(playlists[k]?.songs||[]).length>0);
  if(!allKeys.length){stopPlayback();return;}
  let key,idx;
  if(infinityMode==='playlist'){
    key=allKeys[Math.floor(Math.random()*allKeys.length)];
    idx=0;
  }else{
    const others=allKeys.filter(k=>k!==currentPlaylist);
    const pool=others.length?others:allKeys;
    key=pool[Math.floor(Math.random()*pool.length)];
    idx=Math.floor(Math.random()*playlists[key].songs.length);
  }
  playlistCardHistory.push({playlistKey:key,name:playlists[key]?.name||'playlist',atPos:currentQueueIdx});
  playSong(idx,key);
}
function handleEnd(){
  clearInterval(playbackInterval);
  clearInterval(loudnessInterval);
  loudnessInterval=null;
  const songs=(playlists[currentPlaylist]?.songs)||[];
  if(repeatMode===2){playSong(currentSongIndex);return;}
  const nextIdx=(currentQueueIdx>=0?currentQueueIdx:-1)+1;
  if(queue.length>0&&nextIdx<queue.length){currentQueueIdx=nextIdx;playSong(queue[currentQueueIdx].songIndex,queue[currentQueueIdx].playlistKey);return;}
  if(currentQueueIdx>=0&&queue.length>0){if(infinityMode!=='off'){playRandom();}else{stopPlayback();}return;}
  if(repeatMode===1||currentSongIndex<songs.length-1){playNext();return;}
  if(infinityMode!=='off'){playRandom();}else{stopPlayback();}
}

function playNext(){
  const nextIdx=(currentQueueIdx>=0?currentQueueIdx:-1)+1;
  if(queue.length>0&&nextIdx<queue.length){
    currentQueueIdx=nextIdx;
    playSong(queue[nextIdx].songIndex,queue[nextIdx].playlistKey);
    return;
  }
  if(currentQueueIdx>=0&&queue.length>0){if(infinityMode!=='off'){playRandom();}else{stopPlayback();}return;}
  const songs=playlists[currentPlaylist]?.songs;if(!songs.length){if(infinityMode!=='off'){playRandom();}else{stopPlayback();}return;}
  let next;
  if(isShuffle){do{next=Math.floor(Math.random()*songs.length);}while(next===currentSongIndex&&songs.length>1);}
  else next=(currentSongIndex+1)%songs.length;
  playSong(next);
}
function playPrev(){
  if(currentPlaybackTime>3){currentPlaybackTime=0;if(currentAudioFile)audioPlayer.currentTime=0;else{const s=playlists[currentPlaylist]?.songs;if(s)simPlay(s[currentSongIndex]?.duration);}return;}
  const prevIdx=currentQueueIdx-1;
  if(queue.length>0&&prevIdx>=0){currentQueueIdx=prevIdx;playSong(queue[prevIdx].songIndex,queue[prevIdx].playlistKey);return;}
  const songs=playlists[currentPlaylist]?.songs;if(!songs||!songs.length)return;
  playSong((currentSongIndex-1+songs.length)%songs.length);
}

function togglePlay(){
  if(currentSongIndex===-1){if(Object.keys(playlists).length){playlistCardHistory=[];playSong(0);}return;}
  isPlaying=!isPlaying;updatePlayBtn();
  if(isPlaying){$('albumArt').classList.add('playing');$('vizBars').classList.add('active');if(currentAudioFile)audioPlayer.play();}
  else{$('albumArt').classList.remove('playing');$('vizBars').classList.remove('active');if(currentAudioFile)audioPlayer.pause();localStorage.setItem('lumi-pt',String(totalPlayTime));}
  updateHeroSection();
  const ar=document.querySelector('.track-row.active');
  if(ar){
    const oldBadge=ar.querySelector('.badge');
    if(oldBadge)oldBadge.remove();
    const ta=ar.querySelector('.t-artist');
    if(ta){
      const b=document.createElement('span');
      b.className='badge '+(isPlaying?'badge-playing':'badge-paused');
      b.innerHTML='<span class="badge-dot"></span>'+(isPlaying?'Playing':'Paused');
      ta.appendChild(b);
    }
  }
}
function updatePlayBtn(){
  $('playIcon').style.display=isPlaying?'none':'inline';
  $('pauseIcon').style.display=isPlaying?'inline':'none';
  $('heroPlayIcon').style.display=isPlaying?'none':'inline';
  $('heroPauseIcon').style.display=isPlaying?'inline':'none';
  const kpi=$('karaokePlayIcon');if(kpi)kpi.style.display=isPlaying?'none':'inline';
  const kpa=$('karaokePauseIcon');if(kpa)kpa.style.display=isPlaying?'inline':'none';
}
function toggleShuffle(){isShuffle=!isShuffle;$('shuffleBtn').classList.toggle('active',isShuffle);const hs=$('heroShuffleBtn');if(hs)hs.classList.toggle('active',isShuffle);saveState();showToast('Shuffle '+(isShuffle?'On':'Off'));}
function toggleRepeat(){repeatMode=(repeatMode+1)%3;$('repeatBtn').classList.toggle('active',repeatMode>0);$('repeatBtn').textContent=repeatMode===2?'↺¹':'↺';const hr=$('heroRepeatBtn');if(hr){hr.classList.toggle('active',repeatMode>0);hr.textContent=repeatMode===2?'↺¹':'↺';}saveState();const labels=['↺ Repeat Off','↺ Repeat All','↺¹ Repeat One'];showToast(labels[repeatMode]);}
function toggleFav(id){
  id=String(id);
  if(favorites.has(id))favorites.delete(id);else favorites.add(id);
  updateLikeBtn();
  const ar=document.querySelector('.track-row.active');
  const lb=ar?.querySelector('.like-btn');
  if(lb){lb.classList.toggle('liked',favorites.has(id));lb.textContent=favorites.has(id)?'★':'☆';}
  saveState();
  showToast(favorites.has(id)?'♥ Added to Favorites':'♡ Removed from Favorites');
}
function updateLikeBtn(){
  if(currentSongIndex===-1)return;
  const songId=String(playlists[currentPlaylist].songs[currentSongIndex]);
  const liked=favorites.has(songId);
  $('likeBtn').classList.toggle('liked',liked);
  $('likeBtn').textContent=liked?'★':'☆';
  const hlb=$('heroLikeBtn');
  if(hlb){hlb.classList.toggle('liked',liked);hlb.textContent=liked?'★':'☆';}
}
function seekTo(e){
  const rect=$('progressBar').getBoundingClientRect();
  const pct=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  currentPlaybackTime=pct*totalDuration;
  $('progressFill').style.width=`${pct*100}%`;
  $('currentTime').textContent=fmt(currentPlaybackTime);
  const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=`${pct*100}%`;
  const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(currentPlaybackTime);
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
  const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=`${pct*100}%`;
  const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(currentPlaybackTime);
  if(currentAudioFile)audioPlayer.currentTime=currentPlaybackTime;
  lastTrackedPos=currentPlaybackTime;
}
function setVol(e){
  const rect=$('volBar').getBoundingClientRect();
  volume=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));
  $('volFill').style.width=`${volume*100}%`;
  isMuted=false;audioPlayer.volume=volume;
  updateVolIcon();
  const rounded=Math.round(volume*100);
  if(rounded!==_lastSavedVol){_lastSavedVol=rounded;saveState();}
  const vs=$('heroVolSlider');if(vs)vs.value=Math.round(volume*100);
  const vl=$('heroVolLabel');if(vl)vl.textContent='VOL '+Math.round(volume*100);
  showVolPopup();
}
function toggleMute(){isMuted=!isMuted;audioPlayer.volume=isMuted?0:volume;updateVolIcon();showToast(isMuted?'Muted':'Unmuted');}
function updateVolIcon(){
  $('volBtn').textContent=(isMuted||volume===0)?'mute':'vol';
  const vs=$('heroVolSlider');if(vs)vs.value=isMuted?0:Math.round(volume*100);
  const vl=$('heroVolLabel');if(vl)vl.textContent=isMuted?'VOL 0':'VOL '+Math.round(volume*100);
}
function showVolPopup(){
  const existing=document.querySelector('.vol-popup');if(existing)existing.remove();
  const popup=document.createElement('div');
  popup.className='vol-popup';
  popup.textContent=isMuted?'🔇 0%':'🔊 '+Math.round(volume*100)+'%';
  document.body.appendChild(popup);
  requestAnimationFrame(()=>popup.classList.add('show'));
  clearTimeout(window.volPopupTimer);
  window.volPopupTimer=setTimeout(()=>{
    popup.classList.remove('show');
    setTimeout(()=>popup.remove(),150);
  },800);
}
function seekToLyricTime(time){
  if(totalDuration<=0)return;
  currentPlaybackTime=time;
  if(currentAudioFile)audioPlayer.currentTime=time;
  else {
    const songId=playlists[currentPlaylist]?.songs?.[currentSongIndex];
    const song=getSong(songId);
    simPlay(song?.duration);
  }
  $('currentTime').textContent=fmt(time);
  const pct=(time/totalDuration)*100;
  $('progressFill').style.width=`${pct}%`;
  const kpf=$('karaokeProgressFill');if(kpf)kpf.style.width=`${pct}%`;
  const kct=$('karaokeCurrentTime');if(kct)kct.textContent=fmt(time);
  updateHeroProgress();
  updateLyricHighlight(time);
}
