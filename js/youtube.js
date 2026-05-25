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
    songs[sid]={id:sid,title:title||info.title||'Unknown',artist:author||info.author_name||'YouTube',album:'YouTube',genre:'',year:'',duration:'--:--',addedAt:new Date().toISOString(),file:blob,fileKey:fk,cover:info.thumbnail_url||undefined};
    pl.songs.push(String(sid));
    pl.sub=`${pl.songs.length} tracks`;
    if(currentPlaylist===targetKey)renderSongList($('searchInput').value);
    renderPlaylistNav();renderPlaylistGrid();saveState();
    loading2(null);
    await showMessage(`<div class="yt-success">✓ Added<br><strong>${esc(title||info.title)}</strong></div>`,'OK');
  }catch(e){loading2(null);await showMessage(`<div class="yt-error">Download failed<br><span style="font-size:11px;color:var(--text3)">${esc(e.message||'Unknown error')}</span></div>`,'OK');}
}
