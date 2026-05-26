function fuzzyMatch(query,target){
  const ql=query.toLowerCase();
  const tl=target.toLowerCase();
  let qi=0;
  for(let ti=0;ti<tl.length&&qi<ql.length;ti++){
    if(tl[ti]===ql[qi])qi++;
  }
  return qi===ql.length;
}
function highlightMatch(query,text){
  if(!query)return esc(text);
  const ql=query.toLowerCase();
  const tl=text.toLowerCase();
  const idx=tl.indexOf(ql);
  if(idx!==-1)return esc(text.slice(0,idx))+'<strong>'+esc(text.slice(idx,idx+ql.length))+'</strong>'+esc(text.slice(idx+ql.length));
  let qi=0;
  let result='';
  let last=0;
  let inStrong=false;
  for(let ti=0;ti<tl.length&&qi<ql.length;ti++){
    if(tl[ti]===ql[qi]){
      if(!inStrong){result+=esc(text.slice(last,ti))+'<strong>';inStrong=true;}
      result+=esc(text[ti]);
      qi++;last=ti+1;
    }else if(inStrong){result+='</strong>';inStrong=false;}
  }
  if(inStrong)result+='</strong>';
  result+=esc(text.slice(last));
  return result;
}
function timeAgo(t){
  if(!t)return'';
  const diff=Date.now()-t;
  if(diff<60000)return'just now';
  if(diff<3600000){const m=Math.floor(diff/60000);return m+'m ago';}
  if(diff<86400000){const h=Math.floor(diff/3600000);return h+'h ago';}
  const d=Math.floor(diff/86400000);return d+'d ago';
}
function addRecentSearch(term){
  term=term.trim();
  if(!term)return;
  recentSearches=recentSearches.filter(s=>(typeof s==='string'?s:s.term)!==term);
  recentSearches.unshift({term,time:Date.now()});
  if(recentSearches.length>8)recentSearches.pop();
  saveState();
}
function trackRecentPlay(song,playlistKey){
  if(!song||!song.id)return;
  recentPlays=recentPlays.filter(p=>p.id!==song.id);
  recentPlays.unshift({id:song.id,title:song.title,artist:song.artist,playlistKey,time:Date.now()});
  if(recentPlays.length>10)recentPlays.pop();
  saveState();
}
function renderSearchDropdown(term){
  const dd=$('searchDropdown');
  const q=term.trim();
  if(!q){
    let html='';
    if(recentPlays.length){
      html+=`<div class="search-dropdown-header">Recently Played</div>`;
      recentPlays.slice(0,5).forEach(p=>{
        html+=`<div class="search-dropdown-item" data-type="recent-track" data-song-id="${esc(p.id)}">
          <span class="srch-icon">▶</span>
          <span class="srch-term">${esc(p.title)} · ${esc(p.artist)}</span>
          <span class="srch-meta">${timeAgo(p.time)}</span>
        </div>`;
      });
    }
    if(recentSearches.length){
      html+=`<div class="search-dropdown-header">Recent Searches</div>`;
      recentSearches.forEach(s=>{
        html+=`<div class="search-dropdown-item" data-type="recent" data-term="${esc(s.term)}">
          <span class="srch-icon">⌕</span>
          <span class="srch-term">${esc(s.term)}</span>
          <span class="srch-meta">${timeAgo(s.time)}</span>
          <button class="srch-remove" data-remove="${esc(s.term)}" title="Remove term">×</button>
        </div>`;
      });
      html+=`<button class="search-dropdown-clear" title="Clear all">Clear all</button>`;
    }
    if(!html){dd.classList.remove('show');return;}
    dd.innerHTML=html;
    dd.classList.add('show');
    dd.querySelectorAll('.search-dropdown-item').forEach((el,i)=>{el.style.setProperty('--si',i);});
    return;
  }
  const ql=q.toLowerCase();
  const matchTracks=[];
  const matchPls=[];
  Object.entries(playlists).forEach(([pk,pl])=>{
    if(pl.name.toLowerCase().includes(ql)||fuzzyMatch(ql,pl.name))matchPls.push({key:pk,name:pl.name,exact:pl.name.toLowerCase().includes(ql)});
    pl.songs.forEach((songId,i)=>{
      const s=getSong(songId);
      if(!s)return;
      const titleMatch=s.title.toLowerCase().includes(ql)||fuzzyMatch(ql,s.title);
      const artistMatch=s.artist.toLowerCase().includes(ql)||fuzzyMatch(ql,s.artist);
      if(titleMatch||artistMatch)matchTracks.push({...s,playlistKey:pk,songIndex:i,exact:titleMatch&&(s.title.toLowerCase().includes(ql)||s.artist.toLowerCase().includes(ql))});
    });
  });
  matchTracks.sort((a,b)=>{
    if(a.exact!==b.exact)return a.exact?-1:1;
    return 0;
  });
  matchPls.sort((a,b)=>{
    if(a.exact!==b.exact)return a.exact?-1:1;
    return 0;
  });
  let html='';
  if(matchTracks.length){
    html+=`<div class="search-dropdown-header">Tracks <span class="srch-count">${matchTracks.length}</span></div>`;
    matchTracks.slice(0,8).forEach(t=>{
      const label=highlightMatch(q,t.title)+' · '+highlightMatch(q,t.artist);
      html+=`<div class="search-dropdown-item${t.exact?'':' fuzzy'}" data-type="track" data-term="${esc(t.title+' '+t.artist)}" data-playlist="${esc(t.playlistKey)}" data-index="${t.songIndex}">
        <span class="srch-icon">♪</span>
        <span class="srch-term">${label}</span>
        <span class="srch-meta">${esc(playlists[t.playlistKey]?.name||'')}</span>
      </div>`;
    });
  }
  if(matchPls.length){
    html+=`<div class="search-dropdown-header">Playlists <span class="srch-count">${matchPls.length}</span></div>`;
    matchPls.slice(0,4).forEach(p=>{
      html+=`<div class="search-dropdown-item${p.exact?'':' fuzzy'}" data-type="playlist" data-playlist="${p.key}" data-term="${esc(p.name)}">
        <span class="srch-icon">⊟</span>
        <span class="srch-term">${highlightMatch(q,p.name)}</span>
      </div>`;
    });
  }
  if(!html)html=`<div class="search-dropdown-item" style="cursor:default;opacity:0.5">— no suggestions —</div>`;
  dd.innerHTML=html;
  dd.classList.add('show');
  dd.querySelectorAll('.search-dropdown-item').forEach((el,i)=>{el.style.setProperty('--si',i);});
}
