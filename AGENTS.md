# LumiTune

Vanilla JS music player with YouTube import, lyrics, and playlist management.

## Quick start

```bash
npm start       # starts Express server on :3001 and opens browser
node server.js  # same
LumiTune.bat    # Windows double-click entry
```

No build, lint, typecheck, or test commands exist.

## Architecture

- **Vanilla JS (no framework)** — all variables/functions are global, no modules/imports.
- **Script load order matters** (`index.html` line 380–396): constants → helpers → storage → toast → modals → shortcuts → nav → youtube → lyrics → virtual-list → views → player → settings → playlist → queue → search → main.
- **`$(id)`** = `document.getElementById(id)` (`js/core/constants.js:108`).
- **Server** (`server.js`): Express on port 3001, serves static files, proxies yt-dlp for YouTube audio.
- **Frontend entry**: `index.html` → `js/main.js:560` (`init()`).
- **Backend entry**: `server.js:67`.

## Data persistence

- **LocalStorage** for all metadata: playlists (`lumi-pl`), songs (`lumi-songs`), favorites, settings, lyrics cache (`lumi-lyrics-cache`), lyric offsets.
- **IndexedDB** (`LumiToneDB`, store `files`) for audio blobs imported from local files or YouTube.
- Save: `saveState()` in `js/core/storage.js:14`.
- Load: `loadState()` in `js/core/storage.js:43`.

## YouTube import

Requires the Express server running on `:3001`. Uses `yt-dlp-exec` (bundled yt-dlp binary). Flow: paste URL → `GET /api/info` (metadata) → `GET /api/download` (audio stream) → blob stored in IndexedDB.

The Invidious fallback is in the old `script.js` (line 29–30), commented out from `index.html`.

## Lyrics

- Source: `lrclib.net` API (`js/lyrics/lyrics.js:83`).
- Synced and plain lyrics cached in LocalStorage key `lumi-lyrics-cache`.
- User-edited lyrics stored in `lumi-ulyrics`.
- Japanese→romaji via Kuroshiro + Kuromoji (CDN scripts in `index.html`).

## Themes

10 CSS themes in `themes/`. Applied via `data-theme` attribute and a `<link>` element. Theme list in `js/core/constants.js:56`. Default: `default`.

## Directory structure

```
js/
  core/       constants.js, helpers.js, storage.js
  data/       playlist.js, queue.js
  lyrics/     lyrics.js
  player/     player.js
  ui/         views.js, search.js, settings.js, shortcuts.js, modals.js, toast.js, virtual-list.js
  main.js     event bindings + init()
  nav.js      navigation history
  youtube.js  YouTube API client
themes/        10 CSS files
server.js       Express backend
```

## Notable conventions

- `esc()` for HTML entity escaping (`js/core/helpers.js:6`).
- `fmt()` for seconds→`m:ss` formatting (`js/core/helpers.js:1`).
- `getSong(id)` to look up a song by string ID (`js/core/helpers.js:35`).
- Playlists are `{name, emoji, color, sub, songs: string[]}` objects in a global `playlists` map.
- Songs are `{id, title, artist, album, genre, year, duration, addedAt, file, fileKey, cover}` in a global `songs` map.
- Right panel is resizable (CSS custom property `--rpw`).
- `.gitignore` excludes `Design/`, `todo.*`, `.aider*`.

## Known quirks

- No loading spinner for bulk operations on large playlists.
- Audio volume slider unstyled in some themes.
- When no songs exist (new user), hero is hidden — handle `currentSongIndex === -1`.
