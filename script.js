const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];

let playlists = {
    chill: {
        name: "Chill Vibes", emoji: "🎵", color: "#d4f53c", sub: "Relax & unwind — FM 99.7",
        songs: [
            { id:1,  title:"Midnight Dreams",   artist:"Luna Wave",     duration:"3:45" },
            { id:2,  title:"Ocean Breeze",       artist:"Coastal Beats", duration:"4:12" },
            { id:3,  title:"Starlight Serenade", artist:"Night Sky",     duration:"3:28" },
            { id:4,  title:"Gentle Rain",        artist:"Nature Sounds", duration:"5:01" },
            { id:5,  title:"Sunset Glow",        artist:"Amber Light",   duration:"3:55" }
        ]
    },
    workout: {
        name: "Workout Mix", emoji: "⚡", color: "#c8422a", sub: "Get pumped up — FM 99.7",
        songs: [
            { id:6,  title:"Power Up",    artist:"Energy Boost", duration:"3:22" },
            { id:7,  title:"Run Free",    artist:"Pulse Runner", duration:"4:05" },
            { id:8,  title:"Beast Mode",  artist:"Iron Will",    duration:"3:48" },
            { id:9,  title:"Adrenaline",  artist:"Max Power",    duration:"3:33" },
            { id:10, title:"Unstoppable", artist:"Victory Lap",  duration:"4:18" }
        ]
    },
    focus: {
        name: "Deep Focus", emoji: "◎", color: "#5dca86", sub: "Concentrate better — FM 99.7",
        songs: [
            { id:11, title:"Concentration", artist:"Mind Flow",   duration:"6:15" },
            { id:12, title:"Study Session", artist:"Brain Waves", duration:"5:42" },
            { id:13, title:"Deep Work",     artist:"Focus Lab",   duration:"7:08" },
            { id:14, title:"Clarity",       artist:"Zen Mode",    duration:"4:55" },
            { id:15, title:"Flow State",    artist:"Alpha Waves", duration:"5:30" }
        ]
    }
};

let audioPlayer = new Audio();

let currentPlaylist  = "chill";
let currentSongIndex = -1;
let isPlaying = false;
let isShuffle = false;
let repeatMode = 0;
let favorites = new Set();
let volume = 0.7;
let isMuted = false;
let playbackInterval = null;
let currentPlaybackTime = 0;
let totalDuration = 0;
let isDraggingProgress = false;
let isDraggingVolume   = false;
let currentAudioFile   = null;

const $ = id => document.getElementById(id);

document.getElementById('sidebarDate').textContent = new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});

function formatTime(s) {
    if (isNaN(s)) return "0:00";
    const m = Math.floor(s/60), sec = Math.floor(s%60);
    return `${m}:${sec.toString().padStart(2,"0")}`;
}

function renderSongList(filter="") {
    const songs = playlists[currentPlaylist].songs;
    const filtered = filter
        ? songs.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()) || s.artist.toLowerCase().includes(filter.toLowerCase()))
        : songs;

    $('secTitle').textContent = playlists[currentPlaylist].name.toUpperCase() + ' // TRACKLIST';
    $('secCount').textContent = filtered.length + ' Tracks';

    const pl = playlists[currentPlaylist];
    $('pageTitle').textContent = pl.name.toUpperCase();
    $('pageSub').textContent = pl.sub;

    if (filtered.length === 0) {
        $('songList').innerHTML = '';
        $('emptyState').style.display = 'block';
        return;
    }
    $('emptyState').style.display = 'none';

    $('songList').innerHTML = filtered.map(song => {
        const origIdx = songs.indexOf(song);
        const isActive = origIdx === currentSongIndex;
        const isLiked  = favorites.has(song.id);
        const isCustom = !['chill', 'workout', 'focus'].includes(currentPlaylist);
        const numDisplay = isActive && isPlaying ? '▶' : String(origIdx + 1).padStart(2, '0');
        return `
        <tr class="${isActive ? 'song-active' : ''}" data-index="${origIdx}">
            <td><span class="song-num-cell ${isActive && isPlaying ? 'playing' : ''}">${numDisplay}</span></td>
            <td>
                <span class="song-title-strong">${song.title}</span>
                <span class="song-artist-sm">${song.artist}</span>
            </td>
            <td><span class="song-dur">${song.duration}</span></td>
            <td>
                ${isActive ? `<span class="badge badge-acid">${isPlaying ? '◉ PLAYING' : '◎ PAUSED'}</span>` : '<span class="badge badge-neutral">—</span>'}
            </td>
            <td>
                <button class="like-btn-row ${isLiked ? 'liked' : ''}" data-song-id="${song.id}">♥</button>
                ${isCustom ? `<button class="song-delete-btn" data-del="${origIdx}">×</button>` : ''}
            </td>
        </tr>`;
    }).join('');

}

function playSong(index) {
    const songs = playlists[currentPlaylist].songs;
    if (index < 0 || index >= songs.length) return;
    currentSongIndex = index;
    const song = songs[index];

    $('trackTitle').textContent = song.title.toUpperCase();
    $('trackArtist').textContent = song.artist;
    $('albumArt').textContent = playlists[currentPlaylist].emoji;

    updateLikeBtn();
    isPlaying = true;
    updatePlayBtn();
    $('albumArt').classList.add('playing');
    $('vizBars').classList.add('active');
    renderSongList($('searchInput').value);

    if (song.file) {
        playRealAudio(song.file, song);
    } else {
        simulatePlayback(song.duration);
    }
}

function playRealAudio(file, song) {
    currentAudioFile = file;
    const url = URL.createObjectURL(file);
    audioPlayer.src = url;
    audioPlayer.volume = isMuted ? 0 : volume;
    audioPlayer.play().catch(e => console.log('Play error:', e));
    
    audioPlayer.onloadedmetadata = () => {
        totalDuration = audioPlayer.duration;
        $('totalTime').textContent = formatTime(totalDuration);
        song.duration = formatTime(totalDuration);
        renderSongList($('searchInput').value);
    };
    
    audioPlayer.ontimeupdate = () => {
        if (!isDraggingProgress) {
            currentPlaybackTime = audioPlayer.currentTime;
            $('currentTime').textContent = formatTime(currentPlaybackTime);
            $('progressFill').style.width = `${(currentPlaybackTime / totalDuration) * 100}%`;
        }
    };
    
    audioPlayer.onended = handleEnd;
}

function simulatePlayback(durStr) {
    clearInterval(playbackInterval);
    const parts = durStr.split(':');
    totalDuration = parseInt(parts[0]) * 60 + parseInt(parts[1]);
    currentPlaybackTime = 0;
    $('totalTime').textContent = durStr;
    $('currentTime').textContent = '0:00';
    $('progressFill').style.width = '0%';

    playbackInterval = setInterval(() => {
        if (isPlaying) {
            currentPlaybackTime += 0.1;
            if (currentPlaybackTime >= totalDuration) { handleEnd(); return; }
            $('currentTime').textContent = formatTime(currentPlaybackTime);
            $('progressFill').style.width = `${(currentPlaybackTime / totalDuration) * 100}%`;
        }
    }, 100);
}

function handleEnd() {
    clearInterval(playbackInterval);
    const songs = playlists[currentPlaylist].songs;
    if (repeatMode === 2) {
        playSong(currentSongIndex);
    } else if (repeatMode === 1 || currentSongIndex < songs.length - 1) {
        playNext();
    } else {
        isPlaying = false;
        updatePlayBtn();
        $('albumArt').classList.remove('playing');
        $('vizBars').classList.remove('active');
        renderSongList($('searchInput').value);
    }
}

async function handleFolderSelect(e) {
    const files = Array.from(e.target.files);
    const audioFiles = files.filter(f => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return audioExtensions.includes(ext);
    });

    if (audioFiles.length === 0) {
        alert('No audio files selected!');
        return;
    }

    let playlistName = await showInputModal('Name your playlist:', 'My Playlist');
    if (!playlistName) { e.target.value = ''; return; }
    playlistName = playlistName.trim() || 'My Playlist';

    const playlistKey = 'custom-' + Date.now();
    
    playlists[playlistKey] = {
        name: playlistName.trim(), emoji: "📂", color: "#a855f7", sub: `${audioFiles.length} tracks`,
        songs: audioFiles.map((file, idx) => ({
            id: playlistKey + '-' + idx,
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            duration: '--:--',
            file: file
        }))
    };

    renderPlaylistNav();
    switchPlaylist(playlistKey);
    
    $('tickerText').innerHTML = `&nbsp;&nbsp;✦ LumiTone &nbsp;✦&nbsp; ${audioFiles.length} TRACKS &nbsp;✦&nbsp; ${playlistName.trim().toUpperCase()} &nbsp;✦&nbsp;`;
    e.target.value = '';
}

function handleAddTracks(e) {
    const files = Array.from(e.target.files);
    const audioFiles = files.filter(f => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return audioExtensions.includes(ext);
    });
    if (audioFiles.length === 0) { e.target.value = ''; return; }

    const pl = playlists[currentPlaylist];
    const startId = Date.now();
    const newSongs = audioFiles.map((file, idx) => ({
        id: startId + idx,
        title: file.name.replace(/\.[^/.]+$/, ''),
        artist: 'Unknown Artist',
        duration: '--:--',
        file: file
    }));
    pl.songs.push(...newSongs);
    pl.sub = `${pl.songs.length} tracks`;
    renderSongList($('searchInput').value);
    e.target.value = '';
}

async function handleDeletePlaylist(key) {
    if (['chill', 'workout', 'focus'].includes(key)) return;
    if (!(await showConfirmModal(`Delete "${playlists[key].name}"?`))) return;

    const isCurrent = currentPlaylist === key;
    delete playlists[key];
    renderPlaylistNav();

    if (isCurrent) {
        const keys = Object.keys(playlists);
        switchPlaylist(keys[0] || 'chill');
    }
}

async function handleDeleteTrack(index) {
    const songs = playlists[currentPlaylist].songs;
    const song = songs[index];
    if (!(await showConfirmModal(`Delete "${song.title}"?`))) return;

    const wasPlaying = currentSongIndex === index && isPlaying;
    songs.splice(index, 1);

    if (currentSongIndex === index) {
        audioPlayer.pause();
        if (currentAudioFile) {
            URL.revokeObjectURL(audioPlayer.src);
            audioPlayer.src = '';
            currentAudioFile = null;
        }
        clearInterval(playbackInterval);
        currentSongIndex = -1;
        isPlaying = false;
        updatePlayBtn();
        $('albumArt').classList.remove('playing');
        $('vizBars').classList.remove('active');
        $('trackTitle').textContent = 'SELECT A TRACK';
        $('trackArtist').textContent = 'Awaiting input...';
        $('progressFill').style.width = '0%';
        $('currentTime').textContent = '0:00';
        $('totalTime').textContent = '0:00';
    } else if (currentSongIndex > index) {
        currentSongIndex--;
    }
    renderSongList($('searchInput').value);
}

async function handleRenamePlaylist(key) {
    const pl = playlists[key];
    const newName = await showRenameModal(pl.name);
    if (!newName) return;

    pl.name = newName;
    renderPlaylistNav();
    if (key === currentPlaylist) {
        $('pageTitle').textContent = newName.toUpperCase();
        $('secTitle').textContent = newName.toUpperCase() + ' // TRACKLIST';
    }
}

function togglePlay() {
    if (currentSongIndex === -1) { playSong(0); return; }
    isPlaying = !isPlaying;
    updatePlayBtn();
    if (isPlaying) {
        $('albumArt').classList.add('playing');
        $('vizBars').classList.add('active');
        if (currentAudioFile) audioPlayer.play();
    } else {
        $('albumArt').classList.remove('playing');
        $('vizBars').classList.remove('active');
        if (currentAudioFile) audioPlayer.pause();
    }
    renderSongList($('searchInput').value);
}

function updatePlayBtn() {
    $('playIcon').style.display  = isPlaying ? 'none'   : 'inline';
    $('pauseIcon').style.display = isPlaying ? 'inline' : 'none';
}

function playNext() {
    const songs = playlists[currentPlaylist].songs;
    let next;
    if (isShuffle) {
        do { next = Math.floor(Math.random() * songs.length); }
        while (next === currentSongIndex && songs.length > 1);
    } else {
        next = (currentSongIndex + 1) % songs.length;
    }
    playSong(next);
}

function playPrev() {
    if (currentPlaybackTime > 3) {
        currentPlaybackTime = 0;
        if (currentAudioFile) {
            audioPlayer.currentTime = 0;
        } else {
            simulatePlayback(playlists[currentPlaylist].songs[currentSongIndex].duration);
        }
        return;
    }
    const songs = playlists[currentPlaylist].songs;
    playSong((currentSongIndex - 1 + songs.length) % songs.length);
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    $('shuffleBtn').classList.toggle('active', isShuffle);
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    $('repeatBtn').classList.toggle('active', repeatMode > 0);
    $('repeatBtn').textContent = repeatMode === 2 ? '↺¹' : '↺';
}

function toggleFav(id) {
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    updateLikeBtn();
    renderSongList($('searchInput').value);
}

function updateLikeBtn() {
    if (currentSongIndex === -1) return;
    const id = playlists[currentPlaylist].songs[currentSongIndex].id;
    $('likeBtn').classList.toggle('liked', favorites.has(id));
}

function seekTo(e) {
    const rect = $('progressBar').getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    currentPlaybackTime = pct * totalDuration;
    $('progressFill').style.width = `${pct * 100}%`;
    $('currentTime').textContent = formatTime(currentPlaybackTime);
    if (currentAudioFile) {
        audioPlayer.currentTime = currentPlaybackTime;
    }
}

function setVolume(e) {
    const rect = $('volBar').getBoundingClientRect();
    volume = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    $('volFill').style.width = `${volume * 100}%`;
    isMuted = false;
    audioPlayer.volume = volume;
    updateVolIcon();
}

function toggleMute() {
    isMuted = !isMuted;
    audioPlayer.volume = isMuted ? 0 : volume;
    updateVolIcon();
}

function updateVolIcon() {
    $('volBtn').textContent = (isMuted || volume === 0) ? 'MUTE' : 'VOL';
    $('volFill').style.background = (isMuted || volume === 0) ? '#444' : '#555';
}

function showConfirmModal(msg) {
    return new Promise(resolve => {
        const overlay = $('confirmOverlay');
        overlay.innerHTML = `
        <div class="confirm-box">
            <div class="confirm-msg">${msg}</div>
            <div class="confirm-actions">
                <button class="confirm-btn" id="confirmCancel">Cancel</button>
                <button class="confirm-btn confirm-ok" id="confirmOk">OK</button>
            </div>
        </div>`;
        overlay.style.display = 'flex';

        const close = result => { overlay.style.display = 'none'; resolve(result); };
        const keyHandler = e => { if (e.key === 'Escape') close(false); };

        document.addEventListener('keydown', keyHandler);
        document.getElementById('confirmCancel').onclick = () => { document.removeEventListener('keydown', keyHandler); close(false); };
        document.getElementById('confirmOk').onclick = () => { document.removeEventListener('keydown', keyHandler); close(true); };
    });
}

function showInputModal(label, defaultValue) {
    return new Promise(resolve => {
        const overlay = $('confirmOverlay');
        overlay.innerHTML = `
        <div class="confirm-box">
            <label class="confirm-msg">${label}</label>
            <input type="text" class="rename-input" id="modalInput" value="${defaultValue || ''}">
            <div class="confirm-actions">
                <button class="confirm-btn" id="modalCancel">Cancel</button>
                <button class="confirm-btn confirm-ok" id="modalOk">OK</button>
            </div>
        </div>`;
        overlay.style.display = 'flex';

        const input = document.getElementById('modalInput');
        input.focus(); input.select();

        const close = result => { overlay.style.display = 'none'; resolve(result); };
        const keyHandler = e => {
            if (e.key === 'Escape') close(null);
            if (e.key === 'Enter') document.getElementById('modalOk').click();
        };
        document.addEventListener('keydown', keyHandler);
        document.getElementById('modalCancel').onclick = () => { document.removeEventListener('keydown', keyHandler); close(null); };
        document.getElementById('modalOk').onclick = () => {
            const val = document.getElementById('modalInput').value.trim();
            document.removeEventListener('keydown', keyHandler);
            close(val || null);
        };
    });
}

function showRenameModal(currentName) {
    return showInputModal('Rename playlist:', currentName);
}

function switchPlaylist(key) {
    audioPlayer.pause();
    if (currentAudioFile) {
        URL.revokeObjectURL(audioPlayer.src);
    }
    audioPlayer.src = '';
    currentAudioFile = null;

    currentPlaylist  = key;
    currentSongIndex = -1;
    clearInterval(playbackInterval);
    isPlaying = false;
    updatePlayBtn();
    $('albumArt').classList.remove('playing');
    $('vizBars').classList.remove('active');
    $('albumArt').textContent = playlists[key].emoji;
    $('trackTitle').textContent  = 'SELECT A TRACK';
    $('trackArtist').textContent = 'Awaiting input...';
    $('progressFill').style.width = '0%';
    $('currentTime').textContent = '0:00';
    $('totalTime').textContent   = '0:00';

    renderPlaylistNav();

    // Update featured cards
    document.querySelectorAll('.feat-card').forEach(el =>
        el.classList.toggle('feat-active', el.dataset.playlist === key));

    renderSongList($('searchInput').value);
}

function renderPlaylistNav() {
    const defaultKeys = ['chill', 'workout', 'focus'];
    const colors = { chill: 'var(--acid)', workout: 'var(--rust)', focus: '#5dca86' };

    $('plNav').innerHTML = Object.keys(playlists).map(key => {
        const pl = playlists[key];
        const isDefault = defaultKeys.includes(key);
        const isActive = key === currentPlaylist;
        const color = pl.color || colors[key] || '#666';

        if (isDefault) {
            return `<button class="pl-item ${isActive ? 'active' : ''}" data-playlist="${key}">
                <span class="pl-dot" style="background:${color}"></span> ${pl.name}
            </button>`;
        }

        return `<div class="pl-custom-row">
            <button class="pl-item ${isActive ? 'active' : ''}" data-playlist="${key}">
                <span class="pl-dot" style="background:${color}"></span> ${pl.name}
            </button>
            <button class="pl-rename" data-rename="${key}">✎</button>
            <button class="pl-delete" data-delete="${key}">×</button>
        </div>`;
    }).join('');
}

$('newPlaylistBtn').addEventListener('click', () => $('folderInput').click());
$('folderInput').addEventListener('change', handleFolderSelect);
$('addTracksBtn').addEventListener('click', () => $('addTracksInput').click());
$('addTracksInput').addEventListener('change', handleAddTracks);

// Wire events
$('playBtn').addEventListener('click',    togglePlay);
$('nextBtn').addEventListener('click',    playNext);
$('prevBtn').addEventListener('click',    playPrev);
$('shuffleBtn').addEventListener('click', toggleShuffle);
$('repeatBtn').addEventListener('click',  toggleRepeat);
$('likeBtn').addEventListener('click', () => {
    if (currentSongIndex !== -1) toggleFav(playlists[currentPlaylist].songs[currentSongIndex].id);
});

$('progressBar').addEventListener('mousedown', e => { isDraggingProgress = true; seekTo(e); });
$('volBar').addEventListener('mousedown',      e => { isDraggingVolume   = true; setVolume(e); });
document.addEventListener('mousemove', e => {
    if (isDraggingProgress) seekTo(e);
    if (isDraggingVolume)   setVolume(e);
});
document.addEventListener('mouseup', () => { isDraggingProgress = false; isDraggingVolume = false; });
$('volBtn').addEventListener('click',      toggleMute);
$('searchInput').addEventListener('input', e => renderSongList(e.target.value));

$('songList').addEventListener('click', e => {
    const delBtn = e.target.closest('.song-delete-btn');
    if (delBtn) { handleDeleteTrack(parseInt(delBtn.dataset.del)); return; }
    const likeBtn = e.target.closest('.like-btn-row');
    if (likeBtn) { toggleFav(parseInt(likeBtn.dataset.songId)); return; }
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.index !== undefined) playSong(parseInt(tr.dataset.index));
});

$('plNav').addEventListener('click', e => {
    const renameBtn = e.target.closest('.pl-rename');
    if (renameBtn) { handleRenamePlaylist(renameBtn.dataset.rename); return; }
    const delBtn = e.target.closest('.pl-delete');
    if (delBtn) { handleDeletePlaylist(delBtn.dataset.delete); return; }
    const plItem = e.target.closest('.pl-item');
    if (plItem) switchPlaylist(plItem.dataset.playlist);
});

document.querySelectorAll('.feat-card').forEach(el =>
    el.addEventListener('click', () => switchPlaylist(el.dataset.playlist)));
document.querySelectorAll('.nav-item[data-view]').forEach(el =>
    el.addEventListener('click', function() {
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        this.classList.add('active');
    }));

document.addEventListener('keydown', e => {
    if (e.target === $('searchInput')) return;
    if (e.code === 'Space')               { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight' && e.shiftKey) playNext();
    if (e.code === 'ArrowLeft'  && e.shiftKey) playPrev();
    if (e.code === 'KeyM')  toggleMute();
    if (e.code === 'KeyS')  toggleShuffle();
    if (e.code === 'KeyR')  toggleRepeat();
});

// Init
renderPlaylistNav();
renderSongList();