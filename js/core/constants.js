const audioExtensions=['.mp3','.wav','.ogg','.flac','.m4a','.aac'];
const DEFAULT_KEYS=[];
const DEFAULT_PLAYLISTS={};

let playlists={};
let songs={};
let audioPlayer=new Audio();
let currentPlaylist='';
let currentSongIndex=-1;
let currentPlaylistPlaying='';
let isPlaying=false;
let isShuffle=false;
let repeatMode=0;
let favorites=new Set();
let volume=0.7;
let isMuted=false;
let playbackInterval=null;
let currentPlaybackTime=0;
let totalDuration=0;
let isDraggingProgress=false;
let isDraggingVolume=false;
let isDraggingPanel=false;
let currentAudioFile=null;
let currentView='home';
let db=null;
let recentPlaylists=[];
let recentSearches=[];
let navHistory=[];
let navFuture=[];
let sortColumn='';
let sortAsc=true;
let playlistsViewMode='grid';
let queue=[];
let currentQueueIdx=-1;
let karaokeActive=false;
let infinityMode='off';
let playlistCardHistory=[];
// let dragProgressSource='bottom';
let libraryOrder=null;
let selectedArtist='';
let selectedAlbum='';
let selectedSmart='';
let bulkSelected=new Set();
let totalPlayTime=0;
let sessionPlayTime=0;
let lastTrackedPos=0;
let lyricLines=[];
let lyricsSynced=false;
let lyricsAbort=null;
let kuroshiroReady=false;
let kuroshiroInitAttempted=false;
let lyricsMode='romaji';
let lyricsHasRomaji=false;
let lyricsShowEdit=false;

let currentTheme='default';
const availableThemes=['default','retro','zine','neurophism','shibuya','mecha','blackwhite'];

let currentLyricOffset=0;
let currentLyricOffsetSongId=null;

let isRecordingShortcut=false;

let noAnim=false;
let recordingShortcutKey=null;

let searchTab='tracks';
let recentPlays=[];
const ACOUSTID_API_KEY='KC621JosOG';
let acoustidKey=ACOUSTID_API_KEY;
let audioCtx=null;
let gainNode=null;
let analyserNode=null;
let loudnessTarget=-18;
let audioStabilize=false;
let loudnessInterval=null;
let enrichmentEnabled=true;
let autoApplyMetadata=true;

const SHORTCUTS={
  playPause:{code:'Space',modifiers:[],label:'Play / Pause',category:'Playback'},
  nextTrack:{code:'ArrowRight',modifiers:['Shift'],label:'Next Track',category:'Playback'},
  prevTrack:{code:'ArrowLeft',modifiers:['Shift'],label:'Previous Track',category:'Playback'},
  volumeUp:{code:'ArrowUp',modifiers:[],label:'Volume Up',category:'Playback'},
  volumeDown:{code:'ArrowDown',modifiers:[],label:'Volume Down',category:'Playback'},
  toggleMute:{code:'KeyM',modifiers:[],label:'Toggle Mute',category:'Playback'},
  toggleShuffle:{code:'KeyS',modifiers:[],label:'Toggle Shuffle',category:'Playback'},
  toggleRepeat:{code:'KeyR',modifiers:[],label:'Toggle Repeat',category:'Playback'},
  seek00:{code:'Digit0',modifiers:[],label:'Seek to 0%',category:'Navigation'},
  seek10:{code:'Digit1',modifiers:[],label:'Seek to 10%',category:'Navigation'},
  seek20:{code:'Digit2',modifiers:[],label:'Seek to 20%',category:'Navigation'},
  seek30:{code:'Digit3',modifiers:[],label:'Seek to 30%',category:'Navigation'},
  seek40:{code:'Digit4',modifiers:[],label:'Seek to 40%',category:'Navigation'},
  seek50:{code:'Digit5',modifiers:[],label:'Seek to 50%',category:'Navigation'},
  seek60:{code:'Digit6',modifiers:[],label:'Seek to 60%',category:'Navigation'},
  seek70:{code:'Digit7',modifiers:[],label:'Seek to 70%',category:'Navigation'},
  seek80:{code:'Digit8',modifiers:[],label:'Seek to 80%',category:'Navigation'},
  seek90:{code:'Digit9',modifiers:[],label:'Seek to 90%',category:'Navigation'},
  goBack:{code:'ArrowLeft',modifiers:['Alt'],label:'Go Back',category:'Navigation'},
  goForward:{code:'ArrowRight',modifiers:['Alt'],label:'Go Forward',category:'Navigation'},
  focusSearch:{code:'Space',modifiers:['Ctrl'],label:'Focus Search',category:'Navigation'},
  newPlaylist:{code:'KeyN',modifiers:['Ctrl'],label:'New Playlist',category:'Navigation'},
  toggleFullscreen:{code:'KeyF',modifiers:[],label:'Toggle Fullscreen',category:'UI'},
   toggleRightPanel:{code:'KeyL',modifiers:[],label:'Toggle Right Panel',category:'UI'},
   showShortcuts:{code:'Slash',modifiers:['Ctrl'],label:'Show Shortcuts',category:'UI'},
   offsetMinus:{code:'BracketLeft',modifiers:[],label:'Lyric Offset -0.1s',category:'Lyrics'},
   offsetPlus:{code:'BracketRight',modifiers:[],label:'Lyric Offset +0.1s',category:'Lyrics'},
   offsetMinusBig:{code:'BracketLeft',modifiers:['Ctrl'],label:'Lyric Offset -0.5s',category:'Lyrics'},
   offsetPlusBig:{code:'BracketRight',modifiers:['Ctrl'],label:'Lyric Offset +0.5s',category:'Lyrics'},
   offsetReset:{code:'Digit0',modifiers:['Ctrl'],label:'Reset Lyric Offset',category:'Lyrics'}
 };

const $=id=>document.getElementById(id);
const isTauri=()=>typeof window!=='undefined'&&window.__TAURI__;
const YT_SERVER='http://localhost:3001';
const LYRICS_CACHE_KEY='lumi-lyrics-cache';
const convertFileSrc=path=>window.__TAURI_INTERNALS__?.convertFileSrc?.(path)||'asset://localhost/'+encodeURIComponent(path);
