function adjustLyricOffset(delta,songId){
  if(songId===null)return;
  const current=getLyricOffset(songId);
  const newOffset=Math.max(-30,Math.min(30,current+delta));
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
  const popVal=$('popoverOffsetValue');
  const controls=$('lyricsOffsetControls');
  if(controls){
    controls.style.display=lyricsSynced?'':'none';
  }
  const text=currentLyricOffset>=0?'+'+currentLyricOffset.toFixed(2)+'s':currentLyricOffset.toFixed(2)+'s';
  if(label)label.textContent=text;
  if(popVal)popVal.textContent=text;
  const klbl=$('karaokeOffsetLabel');
  if(klbl)klbl.textContent=text;
}
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
      const initPromise=window.kuroshiroInst.init(new KuromojiAnalyzer({dictPath:'js/lib/kuromoji-dict/'}));
      const tmo=new Promise((_,reject)=>setTimeout(()=>reject(new Error('timeout')),10000));
      await Promise.race([initPromise,tmo]);
      kuroshiroReady=true;
      kuroshiroCallbacks.splice(0).forEach(fn=>fn());
    }catch(e){
      console.warn('Kuroshiro init failed:',e);
      kuroshiroPromise=null;
    }
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
async function convertLinesToRomaji(lines,checkSid){
  _pm('convertRomaji-start');
  if(!kuroshiroReady){
    await initKuroshiro();
    if(!kuroshiroReady){_pe('convertRomaji-start','convertRomaji-start');return null;}
  }
  if(!lines.some(l=>hasJapanese(l.text))){_pe('convertRomaji-start','convertRomaji-start');return null;}
  const ckey=romajiCacheKey(lines);
  const cached=getRomajiCache(ckey);
  if(cached){_pe('convertRomaji-start','convertRomaji-start');return cached;}
  const result=[];
  for(const l of lines){
    if(checkSid!==void 0&&lyricsSongId!==checkSid){_pe('convertRomaji-start','convertRomaji-start');return null;}
    let romaji='';
    if(hasJapanese(l.text)){
      try{romaji=await window.kuroshiroInst.convert(l.text,{to:'romaji',mode:'spaced'});}catch(e){}
      if(checkSid!==void 0&&lyricsSongId!==checkSid){_pe('convertRomaji-start','convertRomaji-start');return null;}
    }
    result.push({time:l.time,original:l.text,romaji});
  }
  saveRomajiCache(ckey,result);
  _pe('convertRomaji-start','convertRomaji-start');
  return result;
}
async function fetchLyrics(title,artist){
  _pm('fetchLyrics-start');
  if(lyricsAbort){lyricsAbort.abort();}
  if(isTauri()&&inv){
    if(lyricsAbortTimer)clearTimeout(lyricsAbortTimer);
    lyricsAbort=new AbortController();
    lyricsAbortTimer=setTimeout(()=>{lyricsAbort?.abort();lyricsAbort=null;},15000);
    try{
      const res=await inv('fetch_lyrics',{track:title,artist});
      clearTimeout(lyricsAbortTimer);lyricsAbortTimer=null;
      if(res)return res;
    }catch(e){
      clearTimeout(lyricsAbortTimer);lyricsAbortTimer=null;
      if(e?.name==='AbortError')return null;
      console.warn('fetch_lyrics command failed, falling back to fetch():',e);
    }
  }
  const controller=new AbortController();
  lyricsAbort=controller;
  const tmo=setTimeout(()=>controller.abort(),15000);
  const url=`https://lrclib.net/api/search?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`;
  try{
    const r=await fetch(url,{signal:controller.signal});
    clearTimeout(tmo);
    if(r.ok){const arr=await r.json();_pe('fetchLyrics-start','fetchLyrics-start');return arr.length?arr[0]:null;}
  }catch(e){
    clearTimeout(tmo);
    if(e.name==='AbortError'){_pe('fetchLyrics-start','fetchLyrics-start');return null;}
  }
  _pe('fetchLyrics-start','fetchLyrics-start');
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
  }).join('')+(showEdit?`<div class="lyrics-actions" style="margin-top:20px"><button class="lyrics-add-btn primary" id="lyricEditBtn" title="Edit lyrics">Edit Lyrics</button><button class="lyrics-add-btn" id="lyricDeleteBtn" style="border-color:rgba(255,80,80,0.25);color:var(--text-dim)" title="Delete lyrics">Delete Lyrics</button></div>`:'');
}
async function renderLyrics(data,showEdit){
  _pm('renderLyrics-start');
  const el=$('lyricsContent');if(!el){_pe('renderLyrics-start','renderLyrics-start');return;}
  const _renderSid=lyricsSongId;
  lyricLines=[];
  lyricsSynced=false;
  if(!data){el.innerHTML=`<div class="lyrics-none">Lyrics not found for this track</div>`;syncKaraokeLyrics();_pe('renderLyrics-start','renderLyrics-start');return;}
  if(data.syncedLyrics){
    const parsed=parseLRC(data.syncedLyrics);
    if(parsed.length){
      lyricsSynced=true;
      if(_renderSid!==lyricsSongId){_pe('renderLyrics-start','renderLyrics-start');return;}
      const romajiData=await convertLinesToRomaji(parsed,_renderSid);
      if(_renderSid!==lyricsSongId){_pe('renderLyrics-start','renderLyrics-start');return;}
      if(romajiData&&romajiData.length){
        lyricLines=romajiData;
        renderLyricLines(romajiData,showEdit);
        updateLyricOffsetUI();
        syncKaraokeLyrics();
        _pe('renderLyrics-start','renderLyrics-start');
        return;
      }
      if(!romajiData){
        const retryRomaji=()=>{
          convertLinesToRomaji(parsed).then(rd=>{
            if(rd&&rd.length&&lyricsSongId===lastLyricsSong?.id){
              lyricLines=rd;
              renderLyricLines(rd,showEdit);
              updateLyricOffsetUI();
            }
          });
        };
        if(!kuroshiroReady)kuroshiroCallbacks.push(retryRomaji);
      }
      lyricLines=parsed;
      renderLyricLines(parsed,showEdit);
      updateLyricOffsetUI();
      syncKaraokeLyrics();
      _pe('renderLyrics-start','renderLyrics-start');
      return;
    }
  }
  if(data.plainLyrics){
    const lines=data.plainLyrics.split('\n').filter(l=>l.trim());
    el.innerHTML=lines.map(l=>`<div class="lyric-line">${esc(l.trim())}</div>`).join('')+(showEdit?`<div class="lyrics-actions" style="margin-top:20px"><button class="lyrics-add-btn primary" id="lyricEditBtn" title="Edit lyrics">Edit Lyrics</button><button class="lyrics-add-btn" id="lyricDeleteBtn" style="border-color:rgba(255,80,80,0.25);color:var(--text-dim)" title="Delete lyrics">Delete Lyrics</button></div>`:'');
    syncKaraokeLyrics();
    _pe('renderLyrics-start','renderLyrics-start');
    return;
  }
  el.innerHTML=`<div class="lyrics-none">Lyrics not found for this track</div>`;
  syncKaraokeLyrics();
  _pe('renderLyrics-start','renderLyrics-start');
}
function showLyricsLoading(){
  const el=$('lyricsContent');if(!el)return;
  lyricLines=[];
  lyricsSynced=false;
  el.innerHTML=`<div class="lyrics-loading">Loading lyrics…</div>`;
  syncKaraokeLyrics();
}
function showLyricsNone(){
  const el=$('lyricsContent');if(!el)return;
  lyricLines=[];
  lyricsSynced=false;
  el.innerHTML=`<div class="lyrics-none">Select a track to see lyrics</div>`;
  syncKaraokeLyrics();
}
function syncKaraokeLyrics(){
  const kl=$('karaokeLyrics');
  const lc=$('lyricsContent');
  if(karaokeActive&&kl&&lc){
    kl.innerHTML=lc.innerHTML;
    const fs=$('karaokeFontSlider');
    if(fs)kl.style.fontSize=fs.value+'px';
  }
}
function toggleLyricsMode(){
  setLyricsMode(lyricsMode==='romaji'?'original':'romaji');
}
function setLyricsMode(mode){
  lyricsMode=mode;
  if(lyricLines.length&&lyricsSynced){renderLyricLines(lyricLines,lyricsShowEdit);if(lyricsShowEdit){const eb=$('lyricEditBtn'),db=$('lyricDeleteBtn');if(eb)eb.onclick=showEditLyricsModal;if(db)db.onclick=deleteCurrentUserLyrics;}}
}
let _lastLyricActiveIdx=-1;
let _lyricScrollThrottle=false;
function updateLyricHighlight(time){
  if(!lyricsSynced||!lyricLines.length)return;
  const el=$('lyricsContent');if(!el)return;
  const adjustedTime=time-currentLyricOffset;
  let activeIdx=-1;
  for(let i=lyricLines.length-1;i>=0;i--){
    if(adjustedTime>=lyricLines[i].time){activeIdx=i;break;}
  }
  if(activeIdx===_lastLyricActiveIdx)return;
  _lastLyricActiveIdx=activeIdx;
  let changed=false;
  const lines=el.querySelectorAll('.lyric-line');
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
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
  }
  if(changed&&activeIdx>=0&&!_lyricScrollThrottle){
    _lyricScrollThrottle=true;
    const activeEl=el.querySelector('.lyric-line.active');
    if(activeEl)activeEl.scrollIntoView({block:'center',behavior:'smooth'});
    setTimeout(()=>{_lyricScrollThrottle=false;},300);
  }
  if(karaokeActive){
    const kl=$('karaokeLyrics');
    if(kl){
      const kLines=kl.querySelectorAll('.lyric-line');
      for(let i=0;i<kLines.length;i++){
        const line=kLines[i];
        line.classList.toggle('active',i===activeIdx);
        line.classList.toggle('past',i<activeIdx);
      }
      if(activeIdx>=0&&!_lyricScrollThrottle){
        _lyricScrollThrottle=true;
        const activeEl=kl.querySelector('.lyric-line.active');
        if(activeEl)activeEl.scrollIntoView({block:'center',behavior:'smooth'});
        setTimeout(()=>{_lyricScrollThrottle=false;},300);
      }
    }
  }
}
let lyricsSongId=null;
let lastLyricsSong=null;
let _lyricsReqId=0;

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
  <button class="lyrics-add-btn primary" id="lyricEditMeta" title="Edit metadata">Edit Metadata</button>
  <button class="lyrics-add-btn" id="lyricRescanTrack" title="Re-identify this track via audio fingerprinting">Rescan Song</button>
  <a class="lyrics-add-btn" href="https://lrclib.net/" target="_blank" rel="noopener">Open LRCLIB Search</a>
  <button class="lyrics-add-btn" id="lyricAddPlain" title="Add plain lyrics">Add Plain Lyrics</button>
  <button class="lyrics-add-btn" id="lyricAddTimestamp" title="Add timed lyrics">Add Timestamp Lyrics</button>
</div>`;
  setTimeout(()=>{
    $('lyricEditMeta')?.addEventListener('click',()=>{
      const loc=findSongLocation(song);
      if(loc)showMetadataEditor(loc.playlistKey,loc.index);
    });
    $('lyricAddPlain')?.addEventListener('click',()=>showAddPlainLyricsModal(song));
    $('lyricAddTimestamp')?.addEventListener('click',()=>showAddTimestampLyricsModal(song));
    $('lyricRescanTrack')?.addEventListener('click',()=>rescanTrack(song));
  },0);
}
function showAddPlainLyricsModal(song,existing){
  const o=$('confirmOverlay');
  o.innerHTML=`<div class="modal-box" style="max-width:440px">
    <div class="modal-msg">${existing?'Edit':'Add'} Plain Lyrics</div>
    <div class="modal-hint">Paste your lyrics below, one line per verse.</div>
    <textarea class="modal-textarea" id="lyricTextarea" placeholder="Hello world&#10;This is my song&#10;Another lyric line">${existing?esc(existing):''}</textarea>
    <div class="modal-actions">
      <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      <button class="modal-btn modal-ok" id="mo" title="Save lyrics">Save</button>
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
      <button class="modal-btn" id="mc" title="Cancel">Cancel</button>
      <button class="modal-btn modal-ok" id="mo" title="Save lyrics">Save</button>
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
  _pm('fetchLyricsForSong-start');
  if(lyricsAbort){lyricsAbort.abort();lyricsAbort=null;}
  if(lyricsAbortTimer){clearTimeout(lyricsAbortTimer);lyricsAbortTimer=null;}
  const reqId=++_lyricsReqId;
  lyricsSongId=song.id;
  lastLyricsSong=song;
  loadLyricOffsetForSong(song.id);
  initKuroshiro();
  let title=song.title;
  let artist=song.artist;
  const hasLirik=!!getUserLyrics(song.id)||!!readCachedLyrics(song,title,artist);
  if(!hasLirik){
    await new Promise(r=>setTimeout(r,5000));
    if(reqId!==_lyricsReqId){_pe('fetchLyricsForSong-start','fetchLyricsForSong-start');return;}
  }
  const user=getUserLyrics(song.id);
  if(user){
    await renderLyrics(user.type==='synced'?{syncedLyrics:user.lyrics}:{plainLyrics:user.lyrics},true);
    if(reqId!==_lyricsReqId){_pe('fetchLyricsForSong-start','fetchLyricsForSong-start');return;}
    setTimeout(()=>{$('lyricEditBtn')?.addEventListener('click',showEditLyricsModal);$('lyricDeleteBtn')?.addEventListener('click',deleteCurrentUserLyrics);},0);
    _pe('fetchLyricsForSong-start','fetchLyricsForSong-start');
    return;
  }
  const cached=readCachedLyrics(song,title,artist);
  if(cached){
    await renderLyrics(cached);
    if(reqId!==_lyricsReqId){_pe('fetchLyricsForSong-start','fetchLyricsForSong-start');return;}
    _pe('fetchLyricsForSong-start','fetchLyricsForSong-start');
    return;
  }

  // Lyrics trust gate: only fetch from LRCLIB if metadata is trusted
  const metadataTrusted=song.isTrusted!==false||song.metadataSource==='manual'||song.metadataSource==='id3';
  if(!metadataTrusted){
    const el=$('lyricsContent');
    if(el){
      el.innerHTML=`<div class="lyrics-none">Lyrics unavailable — metadata pending verification</div>
<div class="lyrics-helper">
  <div class="lyrics-helper-text">This track's metadata is not yet verified. Edit metadata manually to enable lyrics lookup.</div>
  <div class="lyrics-actions">
    <button class="lyrics-add-btn primary" id="lyricEditMeta" title="Edit metadata">Edit Metadata</button>
  </div>
</div>`;
      setTimeout(()=>{
        $('lyricEditMeta')?.addEventListener('click',()=>{
          const loc=findSongLocation(song);
          if(loc)showMetadataEditor(loc.playlistKey,loc.index);
        });
      },0);
    }
    _pe('fetchLyricsForSong-start','fetchLyricsForSong-start');
    return;
  }

  const data=await fetchLyrics(title,artist);
  if(reqId!==_lyricsReqId){_pe('fetchLyricsForSong-start','fetchLyricsForSong-start');return;}
  if(!data){showLyricsNotFound(song);_pe('fetchLyricsForSong-start','fetchLyricsForSong-start');return;}
  saveCachedLyrics(song,title,artist,data);
  await renderLyrics(data);
  if(reqId!==_lyricsReqId){_pe('fetchLyricsForSong-start','fetchLyricsForSong-start');return;}
  _pe('fetchLyricsForSong-start','fetchLyricsForSong-start');
}
