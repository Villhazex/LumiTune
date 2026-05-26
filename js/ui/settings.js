function loadThemeCSS(theme){
  const id='lumi-theme-css';
  const existing=document.getElementById(id);
  if(existing)existing.remove();
  const link=document.createElement('link');
  link.rel='stylesheet';
  link.href=`themes/${theme}.css`;
  link.id=id;
  document.head.appendChild(link);
}

function applyTheme(theme){
  currentTheme=theme;
  document.body.dataset.theme=theme;
  localStorage.setItem('lumi-theme',theme);
  loadThemeCSS(theme);
  showToast('Theme: '+theme);
}

function showSettingsModal(){
  const o=$('confirmOverlay');
  let currentSection='general';

  const sections={
    general:{
      label:'General',icon:'⚙',
      render(){
        return`<div class="settings-section-title">General</div>
          <div class="settings-section-desc">Import and export your playlist data</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Export Playlists</span>
                <small>Backup all playlists to a JSON file</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn" id="sExport" title="Export playlists to JSON">⬇ Export</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Import Playlists</span>
                <small>Restore playlists from a JSON backup</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn" id="sImport" title="Import playlists from JSON backup">⬆ Import</button>
              </div>
            </div>
          </div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Disable Animations</span>
                <small>Turn off all animations and transitions</small>
              </div>
              <div class="setting-row-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="sNoAnim"${noAnim?' checked':''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Infinity Play</span>
                <small>Continue playing from random playlists when queue or playlist ends</small>
              </div>
              <div class="setting-row-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="sInfinityPlay"${infinityPlay?' checked':''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>`;
      },
      bind(){
        $('sExport').onclick=()=>{close();exportPlaylists();};
        $('sImport').onclick=()=>{
          const inp=document.createElement('input');
          inp.type='file';inp.accept='.json';inp.style.display='none';
          inp.addEventListener('change',async e=>{close();await importPlaylists(e);});
          document.body.appendChild(inp);
          inp.click();
          setTimeout(()=>document.body.removeChild(inp),1000);
        };
        $('sNoAnim').onchange=()=>{
          noAnim=$('sNoAnim').checked;
          document.body.classList.toggle('no-anim',noAnim);
          localStorage.setItem('lumi-no-anim',noAnim?'1':'');
        };
        $('sInfinityPlay').onchange=()=>{
          infinityPlay=$('sInfinityPlay').checked;
          saveState();
        };
      }
    },
    appearance:{
      label:'Appearance',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M2.9 2.9l1.4 1.4M11.7 11.7l1.4 1.4M2.9 13.1l1.4-1.4M11.7 4.3l1.4-1.4"/></svg>',
      render(){
        const themeOpts=availableThemes.map(t=>{
          const active=t===currentTheme;
          const label=t.charAt(0).toUpperCase()+t.slice(1);
          const swatch={default:'#0e0c0a',retro:'#f2e8d5',zine:'#1a1612',neurophism:'#e0dbd5',synthwave:'#0a0014',brutalism:'#0A0A0A',shibuya:'#0d0b0b',mecha:'#f0ead8'}[t]||'#888';
          return`<button class="theme-option${active?' active':''}" data-theme="${t}" title="Apply ${label} theme">
            <span class="theme-option-swatch" style="background:${swatch}"></span>
            <span class="theme-option-label">${label}</span>
            ${active?'<span class="theme-option-check">✓</span>':''}
          </button>`;
        }).join('');
        return`<div class="settings-section-title">Appearance</div>
          <div class="settings-section-desc">Customize the look and feel of LumiTune</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Theme</span>
                <small>Select your preferred theme</small>
              </div>
            </div>
            <div class="theme-list">${themeOpts}</div>
          </div>`;
      },
      bind(){
        o.querySelectorAll('.theme-option').forEach(el=>{
          el.onclick=()=>{
            const theme=el.dataset.theme;
            applyTheme(theme);
            renderContent('appearance');
          };
        });
      }
    },
    lyrics:{
      label:'Lyrics',icon:'♪',
      render(){
        return`<div class="settings-section-title">Lyrics</div>
          <div class="settings-section-desc">Configure how lyrics are displayed</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Display Mode</span>
                <small>show japanese lyric in romaji</small>
              </div>
              <div class="setting-row-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="sLyricMode"${lyricsMode==='romaji'?' checked':''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>`;
      },
      bind(){
        $('sLyricMode').onchange=()=>{
          toggleLyricsMode();
          renderContent('lyrics');
        };
      }
    },
    shortcuts:{
      label:'Shortcuts',icon:'⌨',
      render(){
        const shortcuts=getActiveShortcuts();
        const categories={};
        Object.entries(shortcuts).forEach(([key,sc])=>{
          const cat=sc.category||'Other';
          if(!categories[cat])categories[cat]=[];
          categories[cat].push({key,...sc});
        });
        let listHtml='';
        Object.entries(categories).forEach(([cat,items])=>{
          listHtml+=`<div style="font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:0.1em;margin:12px 0 4px">${esc(cat)}</div>`;
          items.forEach(item=>{
            listHtml+=`<div class="shortcuts-inline-row">
              <span class="shortcuts-inline-label">${esc(item.label)}</span>
              <span class="shortcuts-inline-keys">${esc(formatShortcut(item))}</span>
            </div>`;
          });
        });
        return`<div class="settings-section-title">Keyboard Shortcuts</div>
          <div class="settings-section-desc">View available keyboard shortcuts</div>
          <div class="setting-group">
            <div class="shortcuts-inline-list">${listHtml}</div>
            <button class="setting-btn primary" id="sCustomizeShortcuts" title="Customize keyboard shortcuts">⌨ Customize Shortcuts</button>
          </div>`;
      },
      bind(){
        $('sCustomizeShortcuts').onclick=()=>{close();showShortcutsModal();};
      }
    },
    about:{
      label:'About',icon:'ℹ',
      render(){
        return`<div class="about-info">
          <div class="about-name">LUMITUNE</div>
          <div class="about-ver">Version 1.0.0</div>
          <div class="about-desc">A sleek audio player with YouTube integration, lyrics support, and playlist management. Built with vanilla JavaScript, CSS, and Node.js.</div>
        </div>`;
      },
      bind(){}
    }
  };

  function renderContent(key){
    currentSection=key;
    const content=$('settingsContent');
    if(!content)return;
    content.innerHTML=sections[key].render();
    if(sections[key].bind)sections[key].bind();
    o.querySelectorAll('.settings-nav-item').forEach(el=>{
      el.classList.toggle('active',el.dataset.section===key);
    });
  }

  o.innerHTML=`<div class="modal-box settings-page">
    <div class="settings-page-header">
      <div class="modal-msg">Settings</div>
      <button class="modal-btn modal-ok" id="mc" title="Close settings">Close</button>
    </div>
    <div class="settings-body">
      <div class="settings-sidebar">
        ${Object.entries(sections).map(([key,sec])=>`
          <button class="settings-nav-item${key===currentSection?' active':''}" data-section="${key}" title="Open ${sec.label} settings">
            <span class="settings-nav-icon">${sec.icon}</span>
            <span>${sec.label}</span>
          </button>
        `).join('')}
      </div>
      <div class="settings-content" id="settingsContent">${sections[currentSection].render()}</div>
    </div>
  </div>`;
  o.style.display='flex';
  if(o._skh)document.removeEventListener('keydown',o._skh);
  const kh=e=>{if(e.key==='Escape')close()};
  o._skh=kh;
  document.addEventListener('keydown',kh);
  const close=()=>{if(o._skh){document.removeEventListener('keydown',o._skh);o._skh=null;}o.style.display='none'};
  o.onclick=e=>{if(e.target===o)close();};

  o.querySelectorAll('.settings-nav-item').forEach(el=>{
    el.onclick=()=>renderContent(el.dataset.section);
  });
  $('mc').onclick=()=>{close();};
  if(sections[currentSection].bind)sections[currentSection].bind();
}

async function handleCreateEmptyPlaylist(){
  const name=await showInput('Playlist name:','My Playlist');
  if(!name)return;
  const key='custom-'+Date.now();
  playlists[key]={name,emoji:'📂',color:'#D4522A',sub:'0 tracks',songs:[]};
  renderPlaylistNav();renderPlaylistGrid();switchPlaylist(key);saveState();
}

function exportPlaylists(){
  const loading=showLoading('<div class="yt-loading"><div class="yt-spinner"></div><div>Exporting&hellip;</div></div>');
  setTimeout(()=>{
    const data={version:2,exportedAt:new Date().toISOString(),playlists:{},songs:{},favorites:[...favorites]};
    for(const[key,pl]of Object.entries(playlists)){
      if(DEFAULT_KEYS.includes(key))continue;
      data.playlists[key]={name:pl.name,emoji:pl.emoji,color:pl.color,sub:pl.sub,songs:pl.songs};
    }
    Object.entries(songs).forEach(([id,s])=>{
      const{file,...r}=s;
      data.songs[id]=r;
    });
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`lumitune-backup-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    loading(null);
  },50);
}
async function importPlaylists(e){
  const file=e.target.files[0];
  if(!file)return;
  const loading=showLoading('<div class="yt-loading"><div class="yt-spinner"></div><div>Importing&hellip;</div></div>');
  try{
    const text=await file.text();
    const data=JSON.parse(text);
    if(!data.version||!data.playlists){loading(null);return showMessage('Invalid backup file','OK');}
    const isV1=data.version===1;
    let count=0,missing=0;
    loading('<div class="yt-loading"><div class="yt-spinner"></div><div>Processing songs&hellip;</div></div>');
    if(isV1&&data.songs){
      Object.entries(data.songs).forEach(([id,s])=>{
        if(!songs[id])songs[id]={...s};
      });
    }
    const plEntries=Object.entries(data.playlists);
    for(const[idx,[key,pl]]of plEntries.entries()){
      if(playlists[key])continue;
      let songIds;
      if(isV1){
        songIds=(pl.songs||[]).map(s=>{
          const sid=String(s.id);
          if(!songs[sid]){
            const fk=s.fileKey||`file-${key}-${sid}`;
            songs[sid]={id:sid,title:s.title,artist:s.artist||'Unknown',album:s.album||'',genre:s.genre||'',year:s.year||'',duration:s.duration||'--:--',addedAt:s.addedAt||'',metadataEdited:!!s.metadataEdited,fileKey:fk,cover:s.cover||undefined};
          }
          return sid;
        });
      }else{
        songIds=(pl.songs||[]).filter(id=>{
          if(songs[id])return true;
          missing++;
          return false;
        });
      }
      for(const sid of songIds){
        const s=songs[sid];
        if(s&&s.fileKey){const f=await dbGet(s.fileKey).catch(()=>null);if(f){songs[sid]={...s,file:f};}else missing++;}
        else if(s)missing++;
      }
      playlists[key]={name:pl.name||'Untitled',emoji:pl.emoji||'📂',color:pl.color||'#D4522A',sub:pl.sub||`${songIds.length} tracks`,songs:songIds};
      count++;
      if(idx%3===0)loading(`<div class="yt-loading"><div class="yt-spinner"></div><div class="yt-step">${idx+1} of ${plEntries.length}</div><div>Importing playlists&hellip;</div></div>`);
    }
    if(data.favorites)data.favorites.forEach(id=>favorites.add(String(id)));
    loading(null);
    renderPlaylistNav();renderPlaylistGrid();renderSongList($('searchInput').value);saveState();
    let msg=`Imported ${count} playlist${count!==1?'s':''}`;
    if(missing)msg+=`<br><span style="font-size:11px;color:var(--text3)">${missing} song${missing!==1?'s':''} have no audio — re-add via Add Tracks</span>`;
    showMessage(msg,'OK');
  }catch(err){loading(null);showMessage('Failed to parse file','OK');}
  e.target.value='';
}
