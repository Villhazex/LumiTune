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
