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
                <small>Continue playing when queue or playlist ends</small>
              </div>
              <div class="setting-row-control">
                <select id="sInfinityMode" class="setting-select">
                  <option value="off"${infinityMode==='off'?' selected':''}>Off</option>
                  <option value="song"${infinityMode==='song'?' selected':''}>Random Song</option>
                  <option value="playlist"${infinityMode==='playlist'?' selected':''}>Random Playlist</option>
                </select>
              </div>
            </div>
          </div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Audio Stabilize</span>
                <small>Normalize volume across songs based on loudness</small>
              </div>
              <div class="setting-row-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="sAudioStabilize"${audioStabilize?' checked':''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Target Loudness</span>
                <small>Reference loudness level in dB</small>
              </div>
              <div class="setting-row-control" style="display:flex;align-items:center;gap:8px">
                <input type="range" id="sLoudnessTarget" min="-30" max="-10" step="1" value="${loudnessTarget}" class="setting-slider">
                <span class="setting-slider-val" id="sLoudnessVal">${loudnessTarget} dB</span>
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
        $('sInfinityMode').onchange=()=>{
          infinityMode=$('sInfinityMode').value;
          saveState();
          updateInfinityIndicator();
        };
        $('sAudioStabilize').onchange=()=>{
          audioStabilize=$('sAudioStabilize').checked;
          saveState();
          if(audioStabilize){
            if(currentAudioFile&&isPlaying){initAudioChain();applyGain(getSong(playlists[currentPlaylist]?.songs?.[currentSongIndex]));measureLoudness(getSong(playlists[currentPlaylist]?.songs?.[currentSongIndex]));}
          }else{
            clearInterval(loudnessInterval);
            loudnessInterval=null;
            if(gainNode)gainNode.gain.value=1;
          }
        };
        $('sLoudnessTarget').oninput=()=>{
          loudnessTarget=parseInt($('sLoudnessTarget').value);
          $('sLoudnessVal').textContent=loudnessTarget+' dB';
          saveState();
          if(audioStabilize&&currentAudioFile&&isPlaying){
            const song=getSong(playlists[currentPlaylist]?.songs?.[currentSongIndex]);
            if(song)applyGain(song);
          }
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
          const swatch={default:'#0e0c0a',retro:'#f2e8d5',zine:'#1a1612',neurophism:'#e0dbd5',synthwave:'#0a0014',brutalism:'#0A0A0A',shibuya:'#0d0b0b'}[t]||'#888';
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
    scanner:{
      label:'Scanner',
      icon:'<svg viewBox="0 0 16 16" fill="currentColor"><path d="M6.5 1A5.5 5.5 0 0 1 12 6.5c0 1.38-.5 2.63-1.32 3.62l3.6 3.6a.75.75 0 0 1-1.06 1.06l-3.6-3.6A5.5 5.5 0 1 1 6.5 1Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg>',
      render(){
        return`<div class="settings-section-title">Library Scanner</div>
          <div class="settings-section-desc">Scan folders and identify songs via audio fingerprinting</div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Background Enrichment</span>
                <small>Automatically improve metadata after scan via AcoustID</small>
              </div>
              <div class="setting-row-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="sEnrichEnabled"${enrichmentEnabled?' checked':''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Auto-apply Improvements</span>
                <small>Apply enriched title/artist when higher confidence found</small>
              </div>
              <div class="setting-row-control">
                <label class="toggle-switch">
                  <input type="checkbox" id="sAutoApply"${autoApplyMetadata?' checked':''}>
                  <span class="toggle-slider"></span>
                </label>
              </div>
            </div>
          </div>
          <div class="setting-group">
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Scan Folder</span>
                <small>Pick a music folder to scan and identify</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn primary" id="sScanFolder"><svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h4.88a1.5 1.5 0 0 1 1.06.44l.88.88A1.5 1.5 0 0 0 10.38 3H13.5A1.5 1.5 0 0 1 15 4.5V12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2.5Z"/></svg> Scan Folder</button>
              </div>
            </div>
            <div class="setting-row">
              <div class="setting-row-label">
                <span>Identify Pending</span>
                <small>Run identification on scanned but unidentified files</small>
              </div>
              <div class="setting-row-control">
                <button class="setting-btn" id="sIdentifyAll"><svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M6.5 1A5.5 5.5 0 0 1 12 6.5c0 1.38-.5 2.63-1.32 3.62l3.6 3.6a.75.75 0 0 1-1.06 1.06l-3.6-3.6A5.5 5.5 0 1 1 6.5 1Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg> Identify All</button>
              </div>
            </div>
          </div>
          <div id="scanProgress" style="display:none;margin-top:8px">
            <div class="scan-progress-bar">
              <div class="scan-progress-fill" id="scanProgressFill" style="width:0%"></div>
            </div>
            <div class="scan-progress-text" id="scanProgressText">0 / 0</div>
            <div class="scan-status" id="scanStatus"></div>
          </div>
          <div id="scanStats" style="margin-top:8px;font-size:11px;color:var(--text-dim)"></div>`;
      },
      bind(){
        $('sEnrichEnabled').onchange=()=>{
          enrichmentEnabled=$('sEnrichEnabled').checked;
          saveState();
        };
        $('sAutoApply').onchange=()=>{
          autoApplyMetadata=$('sAutoApply').checked;
          saveState();
        };
        $('sScanFolder').onclick=async()=>{
          if(!isTauri()){showToast('Folder scanning only available in desktop app');return;}
          const folder=await inv('pick_folder').catch(()=>null);
          if(!folder)return;
          const btn=$('sScanFolder');const prog=$('scanProgress');const fill=$('scanProgressFill');const txt=$('scanProgressText');const status=$('scanStatus');
          prog.style.display='block';
          btn.disabled=true;
          btn.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h4.88a1.5 1.5 0 0 1 1.06.44l.88.88A1.5 1.5 0 0 0 10.38 3H13.5A1.5 1.5 0 0 1 15 4.5V12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2.5Z"/></svg> Scanning...';
          status.textContent='Scanning folder...';
          try{
            const allFiles=await inv('scan_library',{path:folder});
            const folderName=folder.split('\\').pop().split('/').pop()||'Music';
            status.textContent=`Showing ${allFiles.length} songs from "${esc(folderName)}"`;
            const basePath=folder.replace(/[\\\/]+$/,'');
            const groups={};
            const rootFiles=[];
            for(const f of allFiles){
              const dir=f.path.substring(0,f.path.lastIndexOf('\\'));
              if(dir===basePath){
                rootFiles.push(f);
              }else{
                if(!groups[dir])groups[dir]={name:dir.split('\\').pop(),files:[]};
                groups[dir].files.push(f);
              }
            }
            const allPlKeys=[];
            if(rootFiles.length>0)allPlKeys.push(createPlaylistFromScan(rootFiles,null,folderName,true));
            const subDirs=Object.keys(groups).sort();
            for(const dir of subDirs){
              const g=groups[dir];
              if(g.files.length>0)allPlKeys.push(createPlaylistFromScan(g.files,null,g.name,true));
            }
            saveState();
            renderPlaylistNav();
            renderPlaylistGrid();
            if(allPlKeys.length>0)switchPlaylist(allPlKeys[0]);
            const subCount=subDirs.length;
            const plCount=allPlKeys.length;
            showToast(`✅ Added ${allFiles.length} songs across ${plCount} playlist${plCount>1?'s':''}`);
            if(enrichmentEnabled&&allFiles.length>0){
              status.textContent='Starting background enrichment...';
              await startBackgroundEnrichment(({done,total,status:s})=>{
                fill.style.width=(total>0?(done/total*100).toFixed(0):'0')+'%';
                txt.textContent=`${done} / ${total}`;
                if(s)status.textContent=s;
              },ACOUSTID_API_KEY,3,allFiles,allPlKeys[0]);
            }
            btn.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h4.88a1.5 1.5 0 0 1 1.06.44l.88.88A1.5 1.5 0 0 0 10.38 3H13.5A1.5 1.5 0 0 1 15 4.5V12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2.5Z"/></svg> Scan Folder';
            btn.disabled=false;
            prog.style.display='none';
            refreshStats();
          }catch(e){
            btn.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M1 2.5A1.5 1.5 0 0 1 2.5 1h4.88a1.5 1.5 0 0 1 1.06.44l.88.88A1.5 1.5 0 0 0 10.38 3H13.5A1.5 1.5 0 0 1 15 4.5V12a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V2.5Z"/></svg> Scan Folder';
            btn.disabled=false;
            status.textContent='Error: '+e;
            showToast('❌ '+e,3000);
          }
        };
        $('sIdentifyAll').onclick=async()=>{
          if(!isTauri()){showToast('Identification only available in desktop app');return;}
          const btn=$('sIdentifyAll');const prog=$('scanProgress');const fill=$('scanProgressFill');const txt=$('scanProgressText');const status=$('scanStatus');
          prog.style.display='block';
          btn.disabled=true;
          btn.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M6.5 1A5.5 5.5 0 0 1 12 6.5c0 1.38-.5 2.63-1.32 3.62l3.6 3.6a.75.75 0 0 1-1.06 1.06l-3.6-3.6A5.5 5.5 0 1 1 6.5 1Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg> Identifying...';
          try{
            await inv('retry_failed');
            const results=await runQueueCollect(prog,fill,txt,status,ACOUSTID_API_KEY,3);
            btn.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M6.5 1A5.5 5.5 0 0 1 12 6.5c0 1.38-.5 2.63-1.32 3.62l3.6 3.6a.75.75 0 0 1-1.06 1.06l-3.6-3.6A5.5 5.5 0 1 1 6.5 1Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg> Identify All';btn.disabled=false;
            prog.style.display='none';
            if(results.length>0){
              const ok=results.filter(r=>r.success).length;
              const failed=results.filter(r=>!r.success);
              const plKey='identified-'+Date.now();
              const ids=[];
              for(const r of results){
                if(!r.success)continue;
                const song=Object.values(songs).find(s=>s.filePath===r.path);
                if(song){
                  applyCanonicalUpdate(song,r);
                  ids.push(song.id);
                }
              }
              if(ids.length>0){
                playlists[plKey]={name:'Identified Music',emoji:'🔍',color:'#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'),sub:ids.length+' tracks',songs:ids};
                saveState();
                renderPlaylistNav();renderPlaylistGrid();
                switchPlaylist(plKey);
              }
              let msg=`Identified ${ok}/${results.length} → "Identified Music"`;
              if(failed.length>0)msg+=` | ${failed.length} failed: ${esc(failed[0].error||'?')}`;
              status.textContent=msg;
              renderSongList($('searchInput').value);
            }else{
              status.textContent='No pending files';
            }
            refreshStats();
          }catch(e){
            btn.innerHTML='<svg viewBox="0 0 16 16" fill="currentColor" style="width:14px;height:14px;vertical-align:-2px;margin-right:4px"><path d="M6.5 1A5.5 5.5 0 0 1 12 6.5c0 1.38-.5 2.63-1.32 3.62l3.6 3.6a.75.75 0 0 1-1.06 1.06l-3.6-3.6A5.5 5.5 0 1 1 6.5 1Zm0 1.5a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"/></svg> Identify All';btn.disabled=false;
            status.textContent='Error: '+e;
          }
        };
        refreshStats();
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

async function refreshStats(){
  if(!isTauri())return;
  try{
    const stats=await inv('get_scan_stats');
    const el=$('scanStats');
    if(el){
      let parts=[`# Total: ${stats[0]}`,`✓ Identified: ${stats[1]}`];
      if(stats[2]>0)parts.push(`◉ Needs review: ${stats[2]}`);
      parts.push(`✗ Failed: ${stats[3]}`);
      el.textContent=parts.join(' | ');
    }
  }catch(e){}
}

function sleep(ms){return new Promise(r=>setTimeout(r,ms))}

async function runQueueCollect(progEl,fillEl,txtEl,statusEl,key,concurrency){
  await inv('start_queue',{acoustidKey:key,concurrency});
  const results=[];
  try{
    while(true){
      await sleep(250);
      const qs=await inv('get_queue_status');
      if(!qs.running)break;
      const total=qs.total;
      const done=qs.completed+qs.errors.length;
      fillEl.style.width=(total>0?(done/total*100).toFixed(0):'0')+'%';
      txtEl.textContent=`${done} / ${total}`;
      const drain=await inv('drain_processed');
      if(drain.length>0){
        const last=drain[drain.length-1];
        const b={high:'●',medium:'◖',low:'○'}[last.reliability]||'○';
        const trustMark=last.is_trusted===false?' !':'';
        statusEl.textContent=`${b}${trustMark} ${esc(last.title)} — ${esc(last.artist)} (${last.method})${last.fallback_reason?' ['+esc(last.fallback_reason)+']':''}`;
      }
      if(qs.errors.length>0){
        const e=qs.errors[qs.errors.length-1];
        statusEl.textContent='✗ '+esc(e);
      }
      results.push(...drain);
    }
  }finally{
    await inv('stop_queue').catch(()=>{});
  }
  return results;
}

async function startBackgroundEnrichment(onProgress,key,concurrency,scannedFiles,plKey){
  const total=scannedFiles.length;
  await inv('start_queue',{acoustidKey:key,concurrency});
  try{
    while(true){
      await sleep(250);
      const qs=await inv('get_queue_status');
      if(!qs.running)break;
      const done=qs.completed+qs.errors.length;
      const drain=await inv('drain_processed');
      if(drain.length>0){
        const last=drain[drain.length-1];
        const b={high:'●',medium:'◖',low:'○'}[last.reliability]||'○';
        const trustMark=last.is_trusted===false?' !':'';
        onProgress({done,total,title:last.title,artist:last.artist,method:last.method,reliability:last.reliability,isTrusted:last.is_trusted,status:`${b}${trustMark} ${esc(last.title)} — ${esc(last.artist)} (${last.method})`});
      }else{
        onProgress({done,total,status:qs.errors.length>0?'✗ '+qs.errors[qs.errors.length-1]:''});
      }
      for(const r of drain){
        if(!r.success)continue;
        const song=Object.values(songs).find(s=>s.filePath===r.path);
        if(!song)continue;
        applyCanonicalUpdate(song,r);
      }
      if(drain.length>0){
        saveState();
        renderSongList($('searchInput').value);
        renderPlaylistGrid();
      }
    }
  }finally{
    await inv('stop_queue').catch(()=>{});
  }
}

function applyCanonicalUpdate(song,result){
  if(song.metadataSource==='manual')return;
  const priorities={manual:5,acoustid:4,cache:3,audio_hash:3,id3:3,hybrid:3,filename:2,folder:1};
  const curPrio=priorities[song.metadataSource]||0;
  const newPrio=priorities[result.method]||0;

  // Similarity gate: block title/artist update if similarity too low
  // (unless confidence is extremely high >= 0.995)
  const bypassGate=(result.confidence||0)>=0.995;
  const ts=result.title_similarity!=null?result.title_similarity:1;
  const as=result.artist_similarity!=null?result.artist_similarity:1;
  // AcoustID results from MusicBrainz are inherently more reliable than
  // filename/hybrid/folder guesses — trust them even with low similarity
  const upgradeFromWeak=result.method==='acoustid'&&(result.confidence||0)>=0.5&&
    song.metadataSource!=='manual'&&
    (song.metadataSource==='filename'||song.metadataSource==='hybrid'||
     song.metadataSource==='folder'||song.metadataSource==='id3'||!song.metadataSource);
  const simOk=bypassGate||(ts>=0.7&&as>=0.7)||upgradeFromWeak;

  const canUpdate=autoApplyMetadata&&(newPrio>curPrio||(newPrio===curPrio&&(result.confidence||0)>=0.9));
  if(canUpdate&&simOk){
    // If filename parser suspects swapped, flip title/artist
    let t=result.title||song.title;
    let a=result.artist||song.artist;
    song.suspectedSwapped=!!result.suspected_swapped;
    if(result.suspected_swapped){
      [t,a]=[a,t];
    }
    song.title=t;
    song.artist=a;
    song.album=result.album||song.album;
    song.year=result.year||song.year;
    song.metadataSource=result.method;
    song.reliability=result.reliability||'low';
    song.isTrusted=result.is_trusted!=null?result.is_trusted:true;
    song.titleSimilarity=ts;
    song.artistSimilarity=as;
    song.finalScore=result.final_score||0;
  }else{
    // Always update reliability/trust even if title/artist not updated
    if(result.method==='acoustid'||result.method==='cache'||result.method==='audio_hash'){
      song.reliability=result.reliability||song.reliability;
      song.isTrusted=result.is_trusted!=null?result.is_trusted:song.isTrusted;
    }else if(result.method==='filename'||result.method==='hybrid'){
      // Filename/hybrid is NEVER reliable — force low
      song.reliability='low';
      song.isTrusted=false;
    }
    // Apply suspected_swapped even when canUpdate is false
    if(result.suspected_swapped){
      song.suspectedSwapped=true;
    }
  }
  // Safe fields: always update genre, duration, cover
  if(result.genre)song.genre=result.genre;
  if(result.duration!=null&&result.duration>0)song.duration=fmt(result.duration);
  if(result.cover_data_base64)song.cover='data:'+result.cover_mime+';base64,'+result.cover_data_base64;
}

function createPlaylistFromScan(files,results,playlistName,skipSaveRender){
  const plKey='scanned-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  const ids=files.map(f=>{
    const existing=Object.values(songs).find(s=>s.filePath===f.path);
    if(existing){
      if(results){
        const r=results.find(x=>x.path===f.path);
        if(r&&r.success)applyCanonicalUpdate(existing,r);
      }
      return existing.id;
    }
    const fileName=f.path.split('\\').pop().split('/').pop();
    const name=fileName.replace(/\.[^.]+$/,'');
    const sid='file-'+plKey+'-'+name.replace(/[^a-zA-Z0-9]/g,'_');
    const title=f.display_title||name;
    const artist=f.display_artist||'Unknown';
    const scanCover=f.cover_data_base64&&f.cover_mime?'data:'+f.cover_mime+';base64,'+f.cover_data_base64:undefined;
    songs[sid]={
      id:sid,
      title,
      artist,
      album:f.display_album||'',
      genre:'',
      year:'',
      duration:'--:--',
      addedAt:new Date().toISOString(),
      filePath:f.path,
      cover:scanCover,
      fileName,
      displayTitle:f.display_title||'',
      displayArtist:f.display_artist||'',
      displayAlbum:f.display_album||'',
      displayCoverPath:f.display_cover_path||'',
      metadataSource:f.display_source||'filename',
      reliability:'low',
      isTrusted:false,
      suspectedSwapped:!!f.suspected_swapped,
      titleSimilarity:0,
      artistSimilarity:0,
      finalScore:0,
      hasEmbeddedCover:true,
    };
    return sid;
  });
  playlists[plKey]={name:playlistName,emoji:'📂',color:'#'+Math.floor(Math.random()*0xffffff).toString(16).padStart(6,'0'),sub:ids.length+' tracks',songs:ids};
  if(!skipSaveRender){
    saveState();
    renderPlaylistNav();
    renderPlaylistGrid();
    switchPlaylist(plKey);
    if(results){
      const ok=results.filter(r=>r.success).length;
      const failed=results.filter(r=>!r.success);
      let msg=`${ok}/${results.length} → "${playlistName}"`;
      if(failed.length>0)msg+=` | ${failed.length} failed: ${esc(failed[0].error||'?')}`;
      showToast(`✅ ${msg}`);
    }else{
      showToast(`✅ Added ${ids.length} songs to "${esc(playlistName)}"`);
    }
  }
  return plKey;
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

async function doScanFolder(){
  if(!isTauri()){showToast('Folder scanning only available in desktop app');return;}
  const folder=await inv('pick_folder').catch(()=>null);
  if(!folder)return;
  const folderName=folder.split('\\').pop().split('/').pop()||'Music';
  const prog=showScanProgress();
  try{
    prog.update({done:0,total:1,status:'Scanning folder...',label:'Scanning '+esc(folderName)});
    const allFiles=await inv('scan_library',{path:folder});
    prog.update({done:1,total:1,status:`Found ${allFiles.length} songs`,label:'Creating playlists...'});
    await sleep(100);
    if(prog.cancelled()){prog.close();return;}
    const basePath=folder.replace(/[\\\/]+$/,'');
    const groups={};
    const rootFiles=[];
    for(const f of allFiles){
      const dir=f.path.substring(0,f.path.lastIndexOf('\\'));
      if(dir===basePath){
        rootFiles.push(f);
      }else{
        if(!groups[dir])groups[dir]={name:dir.split('\\').pop(),files:[]};
        groups[dir].files.push(f);
      }
    }
    const allPlKeys=[];
    if(rootFiles.length>0)allPlKeys.push(createPlaylistFromScan(rootFiles,null,folderName,true));
    const subDirs=Object.keys(groups).sort();
    for(const dir of subDirs){
      const g=groups[dir];
      if(g.files.length>0)allPlKeys.push(createPlaylistFromScan(g.files,null,g.name,true));
    }
    const subCount=subDirs.length;
    saveState();
    renderPlaylistNav();
    renderPlaylistGrid();
    if(allPlKeys.length>0)switchPlaylist(allPlKeys[0]);
    if(allFiles.length>0){
      const label=subCount>0?folderName+' + '+subCount+' subfolder'+(subCount>1?'s':''):folderName;
      prog.update({done:0,total:allFiles.length,status:'Starting identification...',label:'Identifying '+esc(label)});
      await startBackgroundEnrichment(({done,total,status:s})=>{
        prog.update({done,total,status:s||'',label:'Identifying '+esc(label)});
      },ACOUSTID_API_KEY,3,allFiles,allPlKeys[0]);
    }
    if(!prog.cancelled()){
      prog.close();
      const plCount=allPlKeys.length;
      showToast(`✅ Added ${allFiles.length} songs across ${plCount} playlist${plCount>1?'s':''}`);
    }
  }catch(e){
    prog.close();
    showToast('❌ '+e,3000);
  }
}
