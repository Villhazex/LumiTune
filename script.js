const audioExtensions = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'];

const DEFAULT_KEYS = ['chill', 'workout', 'focus'];

const DEFAULT_PLAYLISTS = {
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

let playlists = {};
let audioPlayer = new Audio();
let currentPlaylist = "chill";
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
let isDraggingVolume = false;
let currentAudioFile = null;
let currentView = 'home';
let db = null;
let recentPlaylists = [];

const $ = id => document.getElementById(id);

// ─── IndexedDB ───────────────────────────────────────────────

function getDB() {
    if (db) return Promise.resolve(db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open('LumiToneDB', 1);
        req.onupgradeneeded = e => {
            const d = e.target.result;
            if (!d.objectStoreNames.contains('files'))
                d.createObjectStore('files');
        };
        req.onsuccess = e => { db = e.target.result; resolve(db); };
        req.onerror = e => reject(e.target.error);
    });
}

function dbStore(key, file) {
    return getDB().then(d => new Promise((resolve, reject) => {
        const tx = d.transaction('files', 'readwrite');
        tx.objectStore('files').put(file, key);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
    }));
}

function dbGet(key) {
    return getDB().then(d => new Promise((resolve, reject) => {
        const tx = d.transaction('files', 'readonly');
        const req = tx.objectStore('files').get(key);
        req.onsuccess = () => resolve(req.result);
        req.onerror = e => reject(e.target.error);
    }));
}

function dbDelete(key) {
    return getDB().then(d => new Promise((resolve, reject) => {
        const tx = d.transaction('files', 'readwrite');
        tx.objectStore('files').delete(key);
        tx.oncomplete = () => resolve();
        tx.onerror = e => reject(e.target.error);
    }));
}

// ─── State persistence ───────────────────────────────────────

function saveState() {
    const custom = {};
    for (const key of Object.keys(playlists)) {
        if (DEFAULT_KEYS.includes(key)) continue;
        const pl = playlists[key];
        custom[key] = {
            name: pl.name, emoji: pl.emoji, color: pl.color, sub: pl.sub,
            songs: pl.songs.map(s => {
                const { file, ...rest } = s;
                return rest;
            })
        };
    }
    try {
        localStorage.setItem('lumi-playlists', JSON.stringify(custom));
        localStorage.setItem('lumi-favorites', JSON.stringify([...favorites].map(id => String(id))));
        localStorage.setItem('lumi-volume', String(volume));
        localStorage.setItem('lumi-repeat', String(repeatMode));
        localStorage.setItem('lumi-shuffle', String(isShuffle));
        localStorage.setItem('lumi-current-playlist', currentPlaylist);
        localStorage.setItem('lumi-recent-playlists', JSON.stringify(recentPlaylists));
    } catch (e) {}
}

async function loadState() {
    try {
        const raw = localStorage.getItem('lumi-playlists');
        if (raw) {
            const custom = JSON.parse(raw);
            for (const [key, pl] of Object.entries(custom)) {
                const songs = [];
                for (const [idx, s] of pl.songs.entries()) {
                    const fk = `file-${key}-${s.id}`;
                    const file = await dbGet(fk);
                    songs.push(file ? { ...s, file, fileKey: fk } : { ...s });
                }
                playlists[key] = { ...pl, songs };
            }
        }
        const favArr = JSON.parse(localStorage.getItem('lumi-favorites') || '[]');
        const vol = parseFloat(localStorage.getItem('lumi-volume'));
        const rep = parseInt(localStorage.getItem('lumi-repeat'));
        const shuf = localStorage.getItem('lumi-shuffle') === 'true';
        const lastPl = localStorage.getItem('lumi-current-playlist');

        favorites = new Set(favArr.map(id => String(id)));
        if (!isNaN(vol)) volume = Math.max(0, Math.min(1, vol));
        if (!isNaN(rep)) repeatMode = rep % 3;
        isShuffle = shuf;

        const allKeys = [...DEFAULT_KEYS, ...Object.keys(playlists)];
        if (lastPl && allKeys.includes(lastPl)) currentPlaylist = lastPl;

        const recentRaw = localStorage.getItem('lumi-recent-playlists');
        if (recentRaw) {
            const parsed = JSON.parse(recentRaw);
            if (Array.isArray(parsed)) recentPlaylists = parsed.filter(k => typeof k === 'string');
        }
    } catch (e) {
        console.warn('Failed to load state:', e);
    }
}

// ─── Date ────────────────────────────────────────────────────

function setDate() {
    const el = document.getElementById('sidebarDate');
    if (el) el.textContent = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Formatting ──────────────────────────────────────────────

function formatTime(s) {
    if (isNaN(s) || s === undefined || s === null) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

// ─── Featured Strip ──────────────────────────────────────────

function renderFeaturedStrip() {
    const strip = $('featuredStrip');
    if (!strip) return;
    let keys = recentPlaylists.filter(k => playlists[k]).slice(0, 3);
    if (keys.length < 3) {
        for (const k of DEFAULT_KEYS) {
            if (!keys.includes(k)) keys.push(k);
            if (keys.length >= 3) break;
        }
    }
    strip.innerHTML = keys.map((key, i) => {
        const pl = playlists[key];
        const num = String(i + 1).padStart(3, '0');
        return `
        <div class="feat-card ${key === currentPlaylist ? 'feat-active' : ''}" data-playlist="${key}" data-emoji="${pl.emoji}">
            <div class="feat-eyebrow">// Playlist · ${num}</div>
            <div class="feat-title">${pl.name}</div>
            <div class="feat-sub">${pl.sub}</div>
        </div>`;
    }).join('');
}

function recordPlaylistPlay(key) {
    if (!playlists[key]) return;
    const idx = recentPlaylists.indexOf(key);
    if (idx > -1) recentPlaylists.splice(idx, 1);
    recentPlaylists.unshift(key);
}

// ─── View switching ──────────────────────────────────────────

function switchView(view) {
    currentView = view;
    document.querySelectorAll('.nav-item[data-view]').forEach(n => n.classList.remove('active'));
    const activeNav = document.querySelector(`.nav-item[data-view="${view}"]`);
    if (activeNav) activeNav.classList.add('active');

    const strip = $('featuredStrip');
    if (strip) strip.style.display = view === 'home' ? '' : 'none';

    const h = $('extraColHeader');
    if (view === 'home') {
        if (h) h.textContent = 'Duration';
    } else {
        if (h) h.textContent = 'Playlist';
    }

    renderSongList($('searchInput').value);
}

// ─── Song List Rendering ─────────────────────────────────────

function renderSongList(filter = "") {
    if (currentView === 'home') renderHomeSongs(filter);
    else if (currentView === 'library') renderLibrarySongs(filter);
    else if (currentView === 'favorites') renderFavoritesSongs(filter);
}

function renderHomeSongs(filter) {
    const pl = playlists[currentPlaylist];
    if (!pl) return;
    const songs = pl.songs;
    const filtered = filter
        ? songs.filter(s => s.title.toLowerCase().includes(filter.toLowerCase()) || s.artist.toLowerCase().includes(filter.toLowerCase()))
        : songs;

    $('secTitle').textContent = pl.name.toUpperCase() + ' // TRACKLIST';
    $('secCount').textContent = filtered.length + ' Tracks';
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
        const isLiked = favorites.has(String(song.id));
        const isCustom = !DEFAULT_KEYS.includes(currentPlaylist);
        const numDisplay = isActive && isPlaying ? '▶' : String(origIdx + 1).padStart(2, '0');
        return `
        <tr class="${isActive ? 'song-active' : ''}" data-index="${origIdx}" data-playlist="${currentPlaylist}">
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

function renderLibrarySongs(filter) {
    const allTracks = [];
    Object.entries(playlists).forEach(([plKey, pl]) => {
        pl.songs.forEach((song, idx) => {
            allTracks.push({ ...song, playlistKey: plKey, songIndex: idx });
        });
    });

    const filtered = filter
        ? allTracks.filter(s =>
            s.title.toLowerCase().includes(filter.toLowerCase()) ||
            s.artist.toLowerCase().includes(filter.toLowerCase()) ||
            (playlists[s.playlistKey]?.name || '').toLowerCase().includes(filter.toLowerCase()))
        : allTracks;

    $('secTitle').textContent = 'LIBRARY // ALL TRACKS';
    $('secCount').textContent = filtered.length + ' Tracks';
    $('pageTitle').textContent = 'LIBRARY';
    $('pageSub').textContent = 'Every track across all playlists';

    if (filtered.length === 0) {
        $('songList').innerHTML = '';
        $('emptyState').style.display = 'block';
        return;
    }
    $('emptyState').style.display = 'none';

    $('songList').innerHTML = filtered.map((song, idx) => {
        const isActive = song.playlistKey === currentPlaylist && song.songIndex === currentSongIndex;
        const isLiked = favorites.has(String(song.id));
        const numDisplay = isActive && isPlaying ? '▶' : String(idx + 1).padStart(2, '0');
        return `
        <tr class="${isActive ? 'song-active' : ''}" data-playlist="${song.playlistKey}" data-index="${song.songIndex}">
            <td><span class="song-num-cell ${isActive && isPlaying ? 'playing' : ''}">${numDisplay}</span></td>
            <td>
                <span class="song-title-strong">${song.title}</span>
                <span class="song-artist-sm">${song.artist}</span>
            </td>
            <td><span class="song-dur">${playlists[song.playlistKey]?.name || song.playlistKey}</span></td>
            <td>
                ${isActive ? `<span class="badge badge-acid">${isPlaying ? '◉ PLAYING' : '◎ PAUSED'}</span>` : '<span class="badge badge-neutral">—</span>'}
            </td>
            <td>
                <button class="like-btn-row ${isLiked ? 'liked' : ''}" data-song-id="${song.id}">♥</button>
            </td>
        </tr>`;
    }).join('');
}

function renderFavoritesSongs(filter) {
    const favTracks = [];
    Object.entries(playlists).forEach(([plKey, pl]) => {
        pl.songs.forEach((song, idx) => {
            if (favorites.has(String(song.id))) {
                favTracks.push({ ...song, playlistKey: plKey, songIndex: idx });
            }
        });
    });

    const filtered = filter
        ? favTracks.filter(s =>
            s.title.toLowerCase().includes(filter.toLowerCase()) ||
            s.artist.toLowerCase().includes(filter.toLowerCase()) ||
            (playlists[s.playlistKey]?.name || '').toLowerCase().includes(filter.toLowerCase()))
        : favTracks;

    $('secTitle').textContent = 'FAVORITES // LIKED TRACKS';
    $('secCount').textContent = filtered.length + ' Tracks';
    $('pageTitle').textContent = 'FAVORITES';
    $('pageSub').textContent = 'Your liked tracks';

    if (filtered.length === 0) {
        $('songList').innerHTML = '<tr><td colspan="5" style="text-align:center;padding:40px;color:var(--muted);font-style:italic;">— No favorites yet. Like a track to see it here. —</td></tr>';
        $('emptyState').style.display = 'none';
        return;
    }
    $('emptyState').style.display = 'none';

    $('songList').innerHTML = filtered.map((song, idx) => {
        const isActive = song.playlistKey === currentPlaylist && song.songIndex === currentSongIndex;
        const numDisplay = isActive && isPlaying ? '▶' : String(idx + 1).padStart(2, '0');
        return `
        <tr class="${isActive ? 'song-active' : ''}" data-playlist="${song.playlistKey}" data-index="${song.songIndex}">
            <td><span class="song-num-cell ${isActive && isPlaying ? 'playing' : ''}">${numDisplay}</span></td>
            <td>
                <span class="song-title-strong">${song.title}</span>
                <span class="song-artist-sm">${song.artist}</span>
            </td>
            <td><span class="song-dur">${playlists[song.playlistKey]?.name || song.playlistKey}</span></td>
            <td>
                ${isActive ? `<span class="badge badge-acid">${isPlaying ? '◉ PLAYING' : '◎ PAUSED'}</span>` : '<span class="badge badge-neutral">—</span>'}
            </td>
            <td>
                <button class="like-btn-row liked" data-song-id="${song.id}">♥</button>
            </td>
        </tr>`;
    }).join('');
}

// ─── Playback ────────────────────────────────────────────────

function playSong(index, playlistKey) {
    if (playlistKey && playlistKey !== currentPlaylist) {
        audioPlayer.pause();
        if (currentAudioFile) {
            URL.revokeObjectURL(audioPlayer.src);
            audioPlayer.src = '';
            currentAudioFile = null;
        }
        clearInterval(playbackInterval);
        currentPlaylist = playlistKey;
        currentSongIndex = -1;
        recordPlaylistPlay(playlistKey);
        renderPlaylistNav();
        renderFeaturedStrip();
        saveState();
        if (currentView !== 'home') switchView('home');
    }

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
    if (!durStr || durStr === '--:--') {
        totalDuration = 0;
        $('totalTime').textContent = '--:--';
        $('currentTime').textContent = '0:00';
        $('progressFill').style.width = '0%';
        return;
    }
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

function playNext() {
    const songs = playlists[currentPlaylist].songs;
    if (songs.length === 0) return;
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
    const songs = playlists[currentPlaylist].songs;
    if (songs.length === 0) return;
    if (currentPlaybackTime > 3) {
        currentPlaybackTime = 0;
        if (currentAudioFile) {
            audioPlayer.currentTime = 0;
        } else {
            simulatePlayback(songs[currentSongIndex]?.duration);
        }
        return;
    }
    playSong((currentSongIndex - 1 + songs.length) % songs.length);
}

// ─── File handling ───────────────────────────────────────────

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

    const songs = [];
    for (const [idx, file] of audioFiles.entries()) {
        const songId = playlistKey + '-' + idx;
        const fk = `file-${playlistKey}-${songId}`;
        await dbStore(fk, file);
        songs.push({
            id: songId,
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            duration: '--:--',
            file: file,
            fileKey: fk
        });
    }

    playlists[playlistKey] = {
        name: playlistName, emoji: "📂", color: "#a855f7", sub: `${audioFiles.length} tracks`,
        songs: songs
    };

    renderPlaylistNav();
    renderFeaturedStrip();
    switchPlaylist(playlistKey);
    saveState();

    $('tickerText').innerHTML = `&nbsp;&nbsp;✦ LumiTone &nbsp;✦&nbsp; ${audioFiles.length} TRACKS &nbsp;✦&nbsp; ${playlistName.toUpperCase()} &nbsp;✦&nbsp;`;
    e.target.value = '';
}

async function handleAddTracks(e) {
    const files = Array.from(e.target.files);
    const audioFiles = files.filter(f => {
        const ext = '.' + f.name.split('.').pop().toLowerCase();
        return audioExtensions.includes(ext);
    });
    if (audioFiles.length === 0) { e.target.value = ''; return; }

    const pl = playlists[currentPlaylist];
    const startId = Date.now();
    for (const [idx, file] of audioFiles.entries()) {
        const songId = startId + idx;
        const fk = `file-${currentPlaylist}-${songId}`;
        await dbStore(fk, file);
        pl.songs.push({
            id: songId,
            title: file.name.replace(/\.[^/.]+$/, ''),
            artist: 'Unknown Artist',
            duration: '--:--',
            file: file,
            fileKey: fk
        });
    }
    pl.sub = `${pl.songs.length} tracks`;
    renderSongList($('searchInput').value);
    saveState();
    e.target.value = '';
}

async function handleDeletePlaylist(key) {
    if (DEFAULT_KEYS.includes(key)) return;
    if (!(await showConfirmModal(`Delete "${playlists[key].name}"?`))) return;

    const deletePromises = playlists[key].songs
        .filter(s => s.fileKey)
        .map(s => dbDelete(s.fileKey));
    await Promise.all(deletePromises);

    const isCurrent = currentPlaylist === key;
    delete playlists[key];
    renderPlaylistNav();
    renderFeaturedStrip();
    saveState();

    if (isCurrent) {
        const keys = Object.keys(playlists);
        switchPlaylist(keys[0] || 'chill');
    }
}

async function handleDeleteTrack(index) {
    const songs = playlists[currentPlaylist].songs;
    const song = songs[index];
    if (!(await showConfirmModal(`Delete "${song.title}"?`))) return;

    if (song.fileKey) await dbDelete(song.fileKey);

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
    saveState();
}

async function handleRenamePlaylist(key) {
    const pl = playlists[key];
    const newName = await showRenameModal(pl.name);
    if (!newName) return;

    pl.name = newName;
    renderPlaylistNav();
    renderFeaturedStrip();
    if (key === currentPlaylist) {
        $('pageTitle').textContent = newName.toUpperCase();
        $('secTitle').textContent = newName.toUpperCase() + ' // TRACKLIST';
    }
    saveState();
}

// ─── Playback controls ──────────────────────────────────────

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
    $('playIcon').style.display = isPlaying ? 'none' : 'inline';
    $('pauseIcon').style.display = isPlaying ? 'inline' : 'none';
}

function toggleShuffle() {
    isShuffle = !isShuffle;
    $('shuffleBtn').classList.toggle('active', isShuffle);
    saveState();
}

function toggleRepeat() {
    repeatMode = (repeatMode + 1) % 3;
    $('repeatBtn').classList.toggle('active', repeatMode > 0);
    $('repeatBtn').textContent = repeatMode === 2 ? '↺¹' : '↺';
    saveState();
}

function toggleFav(id) {
    id = String(id);
    if (favorites.has(id)) favorites.delete(id);
    else favorites.add(id);
    updateLikeBtn();
    renderSongList($('searchInput').value);
    saveState();
}

function updateLikeBtn() {
    if (currentSongIndex === -1) return;
    const id = String(playlists[currentPlaylist].songs[currentSongIndex].id);
    $('likeBtn').classList.toggle('liked', favorites.has(id));
}

// ─── Progress / Volume ───────────────────────────────────────

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
    saveState();
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

// ─── Modals ──────────────────────────────────────────────────

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

// ─── Playlist navigation ─────────────────────────────────────

function switchPlaylist(key) {
    audioPlayer.pause();
    if (currentAudioFile) {
        URL.revokeObjectURL(audioPlayer.src);
    }
    audioPlayer.src = '';
    currentAudioFile = null;

    currentPlaylist = key;
    currentSongIndex = -1;
    recordPlaylistPlay(key);
    clearInterval(playbackInterval);
    isPlaying = false;
    updatePlayBtn();
    $('albumArt').classList.remove('playing');
    $('vizBars').classList.remove('active');
    $('albumArt').textContent = playlists[key].emoji;
    $('trackTitle').textContent = 'SELECT A TRACK';
    $('trackArtist').textContent = 'Awaiting input...';
    $('progressFill').style.width = '0%';
    $('currentTime').textContent = '0:00';
    $('totalTime').textContent = '0:00';

    renderPlaylistNav();
    renderFeaturedStrip();
    renderSongList($('searchInput').value);
    saveState();
}

function renderPlaylistNav() {
    $('plNav').innerHTML = Object.keys(playlists).map(key => {
        const pl = playlists[key];
        const isDefault = DEFAULT_KEYS.includes(key);
        const isActive = key === currentPlaylist;
        const color = pl.color || '#666';

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

// ─── Event wiring ────────────────────────────────────────────

$('newPlaylistBtn').addEventListener('click', () => $('folderInput').click());
$('folderInput').addEventListener('change', handleFolderSelect);
$('addTracksBtn').addEventListener('click', () => $('addTracksInput').click());
$('addTracksInput').addEventListener('change', handleAddTracks);

$('playBtn').addEventListener('click', togglePlay);
$('nextBtn').addEventListener('click', playNext);
$('prevBtn').addEventListener('click', playPrev);
$('shuffleBtn').addEventListener('click', toggleShuffle);
$('repeatBtn').addEventListener('click', toggleRepeat);
$('likeBtn').addEventListener('click', () => {
    if (currentSongIndex !== -1) toggleFav(String(playlists[currentPlaylist].songs[currentSongIndex].id));
});

$('progressBar').addEventListener('mousedown', e => { isDraggingProgress = true; seekTo(e); });
$('volBar').addEventListener('mousedown', e => { isDraggingVolume = true; setVolume(e); });
document.addEventListener('mousemove', e => {
    if (isDraggingProgress) seekTo(e);
    if (isDraggingVolume) setVolume(e);
});
document.addEventListener('mouseup', () => { isDraggingProgress = false; isDraggingVolume = false; });
$('volBtn').addEventListener('click', toggleMute);
$('searchInput').addEventListener('input', e => renderSongList(e.target.value));

$('songList').addEventListener('click', e => {
    const delBtn = e.target.closest('.song-delete-btn');
    if (delBtn) { handleDeleteTrack(parseInt(delBtn.dataset.del)); return; }
    const likeBtn = e.target.closest('.like-btn-row');
    if (likeBtn) { toggleFav(likeBtn.dataset.songId); return; }
    const tr = e.target.closest('tr');
    if (tr && tr.dataset.index !== undefined) {
        const plKey = tr.dataset.playlist || currentPlaylist;
        playSong(parseInt(tr.dataset.index), plKey);
    }
});

$('plNav').addEventListener('click', e => {
    const renameBtn = e.target.closest('.pl-rename');
    if (renameBtn) { handleRenamePlaylist(renameBtn.dataset.rename); return; }
    const delBtn = e.target.closest('.pl-delete');
    if (delBtn) { handleDeletePlaylist(delBtn.dataset.delete); return; }
    const plItem = e.target.closest('.pl-item');
    if (plItem) switchPlaylist(plItem.dataset.playlist);
});

// Featured cards clicks (delegated since they're dynamic)
$('featuredStrip').addEventListener('click', e => {
    const card = e.target.closest('.feat-card');
    if (card) switchPlaylist(card.dataset.playlist);
});

// Nav item clicks
document.querySelectorAll('.nav-item[data-view]').forEach(el =>
    el.addEventListener('click', function() {
        switchView(this.dataset.view);
    }));

// Keyboard shortcuts
document.addEventListener('keydown', e => {
    if (e.target === $('searchInput')) return;
    if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
    if (e.code === 'ArrowRight' && e.shiftKey) playNext();
    if (e.code === 'ArrowLeft' && e.shiftKey) playPrev();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'KeyS') toggleShuffle();
    if (e.code === 'KeyR') toggleRepeat();
});

// ─── Init ────────────────────────────────────────────────────

async function init() {
    setDate();

    playlists = {};
    for (const [key, val] of Object.entries(DEFAULT_PLAYLISTS)) {
        playlists[key] = JSON.parse(JSON.stringify(val));
    }

    await loadState();

    if (!playlists[currentPlaylist]) currentPlaylist = 'chill';

    renderPlaylistNav();
    renderFeaturedStrip();
    switchView('home');
    renderSongList($('searchInput').value);

    $('shuffleBtn').classList.toggle('active', isShuffle);
    $('repeatBtn').classList.toggle('active', repeatMode > 0);
    $('repeatBtn').textContent = repeatMode === 2 ? '↺¹' : '↺';
    audioPlayer.volume = isMuted ? 0 : volume;
    $('volFill').style.width = `${volume * 100}%`;
    updateVolIcon();
}

init();
