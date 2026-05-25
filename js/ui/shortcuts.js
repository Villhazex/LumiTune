function getActiveShortcuts(){
  const custom=JSON.parse(localStorage.getItem('lumi-custom-shortcuts')||'{}');
  const active=JSON.parse(JSON.stringify(SHORTCUTS));
  Object.entries(custom).forEach(([key,val])=>{if(active[key])Object.assign(active[key],val);});
  return active;
}
function saveCustomShortcuts(custom){localStorage.setItem('lumi-custom-shortcuts',JSON.stringify(custom));}
function formatShortcut(sc){
  const parts=[];
  if(sc.modifiers?.includes('Ctrl'))parts.push('Ctrl');
  if(sc.modifiers?.includes('Shift'))parts.push('Shift');
  if(sc.modifiers?.includes('Alt'))parts.push('Alt');
  let keyName=sc.code;
  if(keyName.startsWith('Key'))keyName=keyName.slice(3);
  else if(keyName.startsWith('Digit'))keyName=keyName.slice(5);
  else if(keyName==='ArrowUp')keyName='↑';
  else if(keyName==='ArrowDown')keyName='↓';
  else if(keyName==='ArrowLeft')keyName='←';
  else if(keyName==='ArrowRight')keyName='→';
  else if(keyName==='Space')keyName='Space';
  parts.push(keyName);
  return parts.join(' + ');
}
function matchShortcut(e,sc){
  if(e.code!==sc.code)return false;
  const needsCtrl=sc.modifiers?.includes('Ctrl')||false;
  const needsShift=sc.modifiers?.includes('Shift')||false;
  const needsAlt=sc.modifiers?.includes('Alt')||false;
  return(e.ctrlKey===needsCtrl)&&(e.shiftKey===needsShift)&&(e.altKey===needsAlt);
}
function showShortcutsModal(){
  return new Promise(resolve=>{
    const o=$('confirmOverlay');
    const shortcuts=getActiveShortcuts();
    const categories={};
    Object.entries(shortcuts).forEach(([key,sc])=>{
      const cat=sc.category||'Other';
      if(!categories[cat])categories[cat]=[];
      categories[cat].push({key,...sc});
    });
    let catsHtml='';
    Object.entries(categories).forEach(([cat,items])=>{
      catsHtml+=`<div class="shortcuts-cat"><div class="shortcuts-cat-label">${esc(cat)}</div>`;
      items.forEach(item=>{
        catsHtml+=`<div class="shortcut-row" data-key="${esc(item.key)}">
          <span class="shortcut-label">${esc(item.label)}</span>
          <span class="shortcut-keys" data-key="${esc(item.key)}">${esc(formatShortcut(item))}</span>
          <button class="shortcut-edit" data-key="${esc(item.key)}" title="Change shortcut">✎</button>
        </div>`;
      });
      catsHtml+='</div>';
    });
    o.innerHTML=`<div class="modal-box shortcuts-modal">
      <div class="shortcuts-header">
        <div class="modal-msg">Keyboard Shortcuts</div>
        <button class="shortcut-reset-all" id="resetAllShortcuts">Reset All to Default</button>
      </div>
      <div class="shortcuts-list">${catsHtml}</div>
      <div class="shortcuts-recording" id="recordingIndicator" style="display:none">
        <div class="recording-pulse"></div>
        <span>Press new shortcut combination...</span>
        <button class="recording-cancel" id="cancelRecording">Cancel</button>
      </div>
      <div class="modal-actions">
        <button class="modal-btn modal-ok" id="closeShortcuts">Close</button>
      </div>
    </div>`;
    o.style.display='flex';
    const close=()=>{document.removeEventListener('keydown',kh,true);o.style.display='none';resolve();};
    $('closeShortcuts').onclick=close;
    function bindRowHandlers(){
      o.querySelectorAll('.shortcut-edit').forEach(btn=>{
        btn.onclick=e=>{e.stopPropagation();startRecordingShortcut(btn.dataset.key);};
      });
      o.querySelectorAll('.shortcut-keys').forEach(el=>{
        el.onclick=e=>{e.stopPropagation();startRecordingShortcut(el.dataset.key);};
      });
    }
    bindRowHandlers();
    function refreshShortcutsDisplay(){
      const shortcuts=getActiveShortcuts();
      o.querySelectorAll('.shortcut-row').forEach(row=>{
        const key=row.dataset.key;
        const sc=shortcuts[key];
        if(sc){
          const keysEl=row.querySelector('.shortcut-keys');
          if(keysEl)keysEl.textContent=formatShortcut(sc);
        }
      });
    }
    $('resetAllShortcuts').onclick=async()=>{
      if(!await showConfirm('Reset all shortcuts to default?'))return;
      localStorage.removeItem('lumi-custom-shortcuts');
      refreshShortcutsDisplay();
      showToast('Shortcuts reset to default');
    };
    function startRecordingShortcut(shortcutKey){
      if(isRecordingShortcut)return;
      isRecordingShortcut=true;
      recordingShortcutKey=shortcutKey;
      const ind=$('recordingIndicator');
      if(ind)ind.style.display='flex';
      o.querySelectorAll('.shortcut-row').forEach(r=>{
        r.classList.toggle('recording-mode',r.dataset.key===shortcutKey);
      });
    }
    function stopRecordingShortcut(){
      isRecordingShortcut=false;
      recordingShortcutKey=null;
      const ind=$('recordingIndicator');
      if(ind)ind.style.display='none';
      o.querySelectorAll('.shortcut-row').forEach(r=>r.classList.remove('recording-mode'));
    }
    function checkConflict(newCode,newModifiers,excludeKey){
      const shortcuts=getActiveShortcuts();
      for(const[key,sc]of Object.entries(shortcuts)){
        if(key===excludeKey)continue;
        if(sc.code===newCode){
          const hasCtrl=(sc.modifiers?.includes('Ctrl')||false)===newModifiers.includes('Ctrl');
          const hasShift=(sc.modifiers?.includes('Shift')||false)===newModifiers.includes('Shift');
          const hasAlt=(sc.modifiers?.includes('Alt')||false)===newModifiers.includes('Alt');
          if(hasCtrl&&hasShift&&hasAlt)return sc;
        }
      }
      return null;
    }
    const kh=async e=>{
      if(!isRecordingShortcut||!recordingShortcutKey)return;
      if(e.key==='Escape'){stopRecordingShortcut();return;}
      if(['ControlLeft','ControlRight','ShiftLeft','ShiftRight','AltLeft','AltRight','MetaLeft','MetaRight'].includes(e.code))return;
      e.preventDefault();e.stopPropagation();
      const modifiers=[];
      if(e.ctrlKey)modifiers.push('Ctrl');
      if(e.shiftKey)modifiers.push('Shift');
      if(e.altKey)modifiers.push('Alt');
      const conflict=checkConflict(e.code,modifiers,recordingShortcutKey);
      if(conflict){
        const override=await showConfirm(`"${formatShortcut({code:e.code,modifiers})}" is already used for "${conflict.label}". Overwrite?`);
        if(!override){stopRecordingShortcut();return;}
        const custom=JSON.parse(localStorage.getItem('lumi-custom-shortcuts')||'{}');
        Object.entries(SHORTCUTS).forEach(([key,defaultSc])=>{
          for(const[k,sc]of Object.entries(getActiveShortcuts())){
            if(k!==recordingShortcutKey&&sc.code===e.code){
              if(!custom[k])custom[k]={};
              custom[k].code=defaultSc.code;
              custom[k].modifiers=[...(defaultSc.modifiers||[])];
            }
          }
        });
      }
      const custom=JSON.parse(localStorage.getItem('lumi-custom-shortcuts')||'{}');
      if(!custom[recordingShortcutKey])custom[recordingShortcutKey]={};
      custom[recordingShortcutKey].code=e.code;
      custom[recordingShortcutKey].modifiers=modifiers;
      saveCustomShortcuts(custom);
      stopRecordingShortcut();
      refreshShortcutsDisplay();
      showToast('Shortcut updated');
    };
    document.addEventListener('keydown',kh,true);
    $('cancelRecording')?.addEventListener('click',()=>stopRecordingShortcut());
  });
}
function executeShortcutAction(action){
  switch(action){
    case 'playPause':togglePlay();break;
    case 'nextTrack':playNext();break;
    case 'prevTrack':playPrev();break;
    case 'volumeUp':setVolume(Math.min(1,volume+0.1));break;
    case 'volumeDown':setVolume(Math.max(0,volume-0.1));break;
    case 'toggleMute':toggleMute();break;
    case 'toggleShuffle':toggleShuffle();break;
    case 'toggleRepeat':toggleRepeat();break;
    case 'seek00':seekToPercent(0);break;
    case 'seek10':seekToPercent(10);break;
    case 'seek20':seekToPercent(20);break;
    case 'seek30':seekToPercent(30);break;
    case 'seek40':seekToPercent(40);break;
    case 'seek50':seekToPercent(50);break;
    case 'seek60':seekToPercent(60);break;
    case 'seek70':seekToPercent(70);break;
    case 'seek80':seekToPercent(80);break;
    case 'seek90':seekToPercent(90);break;
    case 'goBack':goBack();break;
    case 'goForward':goForward();break;
    case 'focusSearch':
      const inp=$('searchInput');
      if(inp){inp.focus();setTimeout(()=>inp.select(),0);}
      break;
    case 'newPlaylist':
      (async()=>{
        const name=await showInput('Playlist name:','My Playlist');
        if(!name)return;
        const key='custom-'+Date.now();
        playlists[key]={name,emoji:'📂',color:'#D4522A',sub:'0 tracks',songs:[]};
        renderPlaylistNav();renderPlaylistGrid();switchPlaylist(key);saveState();
      })();
      break;
    case 'toggleFullscreen':toggleFullscreenMode();break;
     case 'toggleRightPanel':toggleRightPanelDisplay();break;
     case 'showShortcuts':showShortcutsModal();break;
     case 'offsetMinus':adjustLyricOffset(-0.1,currentLyricOffsetSongId);break;
     case 'offsetPlus':adjustLyricOffset(0.1,currentLyricOffsetSongId);break;
     case 'offsetMinusBig':adjustLyricOffset(-0.5,currentLyricOffsetSongId);break;
     case 'offsetPlusBig':adjustLyricOffset(0.5,currentLyricOffsetSongId);break;
     case 'offsetReset':resetLyricOffset(currentLyricOffsetSongId);break;
   }
 }
