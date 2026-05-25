function recordPlay(key){
  if(!playlists[key])return;
  const i=recentPlaylists.indexOf(key);
  if(i>-1)recentPlaylists.splice(i,1);
  recentPlaylists.unshift(key);
}

function recordNav(){
  navHistory.push({
    view:currentView,
    playlist:currentPlaylist,
    artist:selectedArtist,
    album:selectedAlbum,
    smart:selectedSmart
  });
  navFuture=[];
  updateNavBtns();
}
function makeNavState(){
  return {view:currentView,playlist:currentPlaylist,artist:selectedArtist,album:selectedAlbum,smart:selectedSmart};
}
function goBack(){
  if(!navHistory.length)return;
  navFuture.push(makeNavState());
  const s=navHistory.pop();applyNavState(s);
}
function goForward(){
  if(!navFuture.length)return;
  navHistory.push(makeNavState());
  const s=navFuture.pop();applyNavState(s);
}
function applyNavState(s){
  if(s.playlist!==undefined&&s.playlist!==currentPlaylist&&s.view!=='playlists'){
    currentPlaylist=s.playlist;
    renderPlaylistNav();
    renderPlaylistGrid();
  }
  if(s.artist!==undefined)selectedArtist=s.artist;
  if(s.album!==undefined)selectedAlbum=s.album;
  if(s.smart!==undefined)selectedSmart=s.smart;
  switchView(s.view);
  saveState();
  updateNavBtns();
}
function updateNavBtns(){$('backBtn').disabled=!navHistory.length;$('forwardBtn').disabled=!navFuture.length;}

function switchView(view){
  currentView=view;
  document.querySelectorAll('.nav-item[data-view]').forEach(n=>n.classList.remove('active'));
  document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
  $('playlistGrid').style.display=view==='home'?'':'none';
  const header=$('playlistSectionHeader');
  if(header)header.style.display=view==='home'?'':'none';
  libraryOrder=null;
  if(view!=='artists')selectedArtist='';
  if(view!=='albums')selectedAlbum='';
  if(view!=='smart')selectedSmart='';
  if(view==='playlists')playlistsViewMode='grid';
  updateSortIndicator();
  renderSongList($('searchInput').value);
  if(view==='home'){renderPlaylistGrid();}
  const sl=$('songList');
  if(sl){sl.classList.remove('fade-in');void sl.offsetWidth;sl.classList.add('fade-in');}
}
