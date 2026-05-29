use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::sync::Mutex;
use std::thread;
use std::time::{Duration, Instant};

use lofty::prelude::*;
use lofty::read_from_path;
use base64::Engine;

use crate::db::{Database, MetadataEntry};

const FPCALC_NAME: &str = "fpcalc.exe";

// ── MusicBrainz rate limiter (1 req/sec) ──

static LAST_MB_CALL: Mutex<Option<Instant>> = Mutex::new(None);

fn throttle_api() {
    if let Ok(mut last) = LAST_MB_CALL.lock() {
        if let Some(t) = *last {
            let elapsed = t.elapsed();
            if elapsed < Duration::from_millis(1100) {
                std::thread::sleep(Duration::from_millis(1100) - elapsed);
            }
        }
        *last = Some(Instant::now());
    }
}

// ── fpcalc ──

fn fpcalc_bin() -> String {
    let candidates = [
        "resources/fpcalc.exe",
        "src-tauri/resources/fpcalc.exe",
        "../src-tauri/resources/fpcalc.exe",
    ];
    for p in &candidates {
        if Path::new(p).exists() {
            return p.to_string();
        }
    }
    // Try relative to executable path
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for up in &[".", "..", "../..", "../../.."] {
                let c = dir.join(up).join("resources/fpcalc.exe");
                if c.exists() {
                    return c.to_string_lossy().to_string();
                }
            }
        }
    }
    FPCALC_NAME.to_string()
}

fn run_fpcalc(path: &str) -> Result<(String, i64), String> {
    let bin = fpcalc_bin();
    let arg_path = path.to_string();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        tx.send(Command::new(&bin).args(["-length", "120", &arg_path]).output()).ok();
    });
    let out = rx.recv_timeout(Duration::from_secs(30))
        .map_err(|_| "fpcalc timeout (30s)".to_string())?
        .map_err(|e| format!("fpcalc run: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("fpcalc: {}", &stderr[..500.min(stderr.len())]));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut fingerprint = String::new();
    let mut duration: i64 = 0;
    for line in stdout.lines() {
        if let Some(v) = line.strip_prefix("FINGERPRINT=") {
            fingerprint = v.to_string();
        } else if let Some(v) = line.strip_prefix("DURATION=") {
            duration = v.parse().unwrap_or(0);
        }
    }
    if fingerprint.is_empty() {
        return Err("No fingerprint generated".into());
    }
    Ok((fingerprint, duration))
}

// ── ID3 tag reader ──

#[derive(Debug, Clone, Default, serde::Serialize, serde::Deserialize)]
pub struct Id3Tags {
    pub title: Option<String>,
    pub artist: Option<String>,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub track: Option<u32>,
    pub cover_data: Option<Vec<u8>>,
    pub cover_mime: Option<String>,
}

pub fn read_id3(path: &str) -> Result<Id3Tags, String> {
    let file = read_from_path(path).map_err(|e| format!("lofty read: {}", e))?;
    let tag = file.primary_tag().or_else(|| file.first_tag());
    let tag = match tag {
        Some(t) => t,
        None => return Ok(Id3Tags::default()),
    };
    let mut r = Id3Tags {
        title: tag.title().map(|s| s.to_string()),
        artist: tag.artist().map(|s| s.to_string()),
        album: tag.album().map(|s| s.to_string()),
        year: tag.date().and_then(|d| {
            let s = d.to_string();
            if s.len() >= 4 { s[..4].parse::<i32>().ok() } else { None }
        }),
        genre: tag.genre().map(|s| s.to_string()),
        track: tag.track(),
        ..Default::default()
    };
    // Extract cover art
    if let Some(pic) = tag.pictures().first() {
        r.cover_data = Some(pic.data().to_vec());
        r.cover_mime = pic.mime_type().map(|m| format!("{}", m));
    }
    Ok(r)
}

pub fn has_minimal_tags(tags: &Id3Tags) -> bool {
    tags.title.as_ref().map_or(false, |t| !t.trim().is_empty())
        && tags.artist.as_ref().map_or(false, |a| !a.trim().is_empty())
}

pub fn is_garbage_tags(tags: &Id3Tags) -> bool {
    if !has_minimal_tags(tags) {
        return true;
    }
    let garbage = ["unknown", "y2mate.com", "y2mate", "various artists"];
    let artist = tags.artist.as_deref().unwrap_or("").trim().to_lowercase();
    let title = tags.title.as_deref().unwrap_or("").trim().to_lowercase();
    garbage.contains(&artist.as_str()) || garbage.contains(&title.as_str())
}

fn normalize_title(s: &str) -> String {
    let mut s = s.trim().to_lowercase();

    // Strip parenthesized/bracketed suffixes iteratively
    let suffixes = [
        "(official video)", "(official lyric video)", "(official music video)",
        "[official video]", "[official lyric video]", "[official music video]",
        "(official audio)", "[official audio]", "(lyrics)", "[lyrics]",
        "(lyric video)", "(audio)", "(official)", "(hd)",
        "[hd]", "(music video)", "[music video]",
    ];
    loop {
        let mut changed = false;
        for suf in &suffixes {
            if s.ends_with(suf) {
                s = s[..s.len() - suf.len()].trim().to_string();
                changed = true;
                break;
            }
        }
        if !changed {
            break;
        }
    }

    // Strip " - feat." / " - ft." / " - featuring" trailers
    if let Some(idx) = s.rfind(" - ") {
        let after = s[idx + 3..].trim().to_string();
        let tags = ["feat", "feat.", "ft", "ft.", "featuring", "with"];
        if tags.iter().any(|t| after.starts_with(t)) {
            s = s[..idx].trim().to_string();
        }
    }

    // Strip remaster/remastered annotations
    for suf in &["(remastered)", "(remaster)", "remastered", "remaster"] {
        if s.ends_with(suf) {
            s = s[..s.len() - suf.len()].trim().to_string();
            break;
        }
    }

    // Collapse whitespace
    let mut prev = ' ';
    s = s.chars()
        .filter(|c| {
            let b = *c != ' ' || prev != ' ';
            prev = *c;
            b
        })
        .collect::<String>()
        .trim()
        .to_string();

    s
}

fn titles_match(a: &str, b: &str) -> bool {
    let a = normalize_title(a);
    let b = normalize_title(b);
    a == b || a.starts_with(&b) || b.starts_with(&a)
}

// ── AcoustID ──

#[derive(serde::Deserialize)]
struct AcoustidResult {
    status: String,
    #[serde(default)]
    results: Vec<AcoustidHit>,
    error: Option<AcoustidErrorBody>,
}

#[derive(serde::Deserialize)]
struct AcoustidErrorBody {
    message: Option<String>,
}

#[derive(serde::Deserialize)]
struct AcoustidHit {
    id: String,
    score: f64,
    #[serde(default)]
    recordings: Vec<AcoustidRecording>,
}

#[derive(serde::Deserialize)]
struct AcoustidRecording {
    id: Option<String>,
    title: Option<String>,
    #[serde(default)]
    artists: Vec<AcoustidArtist>,
}

#[derive(serde::Deserialize)]
struct AcoustidArtist {
    id: Option<String>,
    name: Option<String>,
}

fn lookup_acoustid(fingerprint: &str, duration: i64, api_key: &str) -> Result<Vec<(String, f64, String, String)>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let resp = client
        .post("https://api.acoustid.org/v2/lookup")
        .form(&[
            ("client", api_key),
            ("fingerprint", fingerprint),
            ("duration", &duration.to_string()),
            ("format", "json"),
            ("meta", "recordings releasegroups"),
        ])
        .send()
        .map_err(|e| format!("AcoustID request: {}", e))?;

    let text = resp.text().map_err(|e| format!("AcoustID read: {}", e))?;
    let parsed: AcoustidResult = serde_json::from_str(&text)
        .map_err(|e| format!("AcoustID JSON: {} — body: {}", e, &text[..300.min(text.len())]))?;

    if parsed.status != "ok" {
        let msg = parsed.error
            .and_then(|e| e.message)
            .unwrap_or_else(|| "unknown API error".to_string());
        return Err(format!("AcoustID API error: {}", msg));
    }

    let mut results = Vec::new();
    for hit in parsed.results {
        for rec in hit.recordings {
            let artist = rec.artists.first()
                .and_then(|a| a.name.clone())
                .unwrap_or_default();
            let title = rec.title.unwrap_or_default();
            let recording_id = rec.id.unwrap_or_default();
            if !title.is_empty() {
                results.push((recording_id, hit.score, title, artist));
            }
        }
    }
    Ok(results)
}

// ── MusicBrainz ──

#[derive(serde::Deserialize)]
struct MbRecording {
    id: String,
    title: Option<String>,
    #[serde(default)]
    tags: Vec<MbTag>,
    #[serde(default)]
    releases: Vec<MbRelease>,
    #[serde(default)]
    #[serde(rename = "artist-credit")]
    artist_credit: Vec<MbArtistCredit>,
}

#[derive(serde::Deserialize)]
struct MbTag {
    name: Option<String>,
    count: Option<u32>,
}

#[derive(serde::Deserialize)]
struct MbRelease {
    id: Option<String>,
    title: Option<String>,
    date: Option<String>,
    #[serde(default)]
    #[serde(rename = "artist-credit")]
    artist_credit: Vec<MbArtistCredit>,
    #[serde(default)]
    #[serde(rename = "media")]
    media_list: Vec<MbMedia>,
}

#[derive(serde::Deserialize)]
struct MbArtistCredit {
    name: Option<String>,
}

#[derive(serde::Deserialize)]
struct MbMedia {
    title: Option<String>,
    #[serde(rename = "track-count")]
    track_count: Option<u32>,
}

fn lookup_musicbrainz(recording_id: &str) -> Result<Option<(String, String, Option<String>, Option<i32>, Option<String>)>, String> {
    throttle_api();

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let url = format!(
        "https://musicbrainz.org/ws/2/recording/{}?inc=artists+releases+artist-credits+tags&fmt=json",
        recording_id
    );
    let resp = client
        .get(&url)
        .header("User-Agent", "LumiTune/1.0 (music-player@lumitune.app)")
        .send()
        .map_err(|e| format!("MusicBrainz request: {}", e))?;

    if !resp.status().is_success() {
        return Ok(None);
    }
    let text = resp.text().map_err(|e| format!("MusicBrainz read: {}", e))?;
    let rec: MbRecording = serde_json::from_str(&text)
        .map_err(|e| format!("MusicBrainz JSON: {} — body: {}", e, &text[..300.min(text.len())]))?;

    let title = rec.title.unwrap_or_default();
    let artist = rec.artist_credit.first()
        .and_then(|a| a.name.clone())
        .unwrap_or_default();
    let mut album: Option<String> = None;
    let mut year: Option<i32> = None;
    let mut release_id: Option<String> = None;

    if let Some(release) = rec.releases.first() {
        album = release.title.clone();
        release_id = release.id.clone();
        if let Some(date) = &release.date {
            if date.len() >= 4 {
                year = date[..4].parse::<i32>().ok();
            }
        }
    }

    Ok(Some((title, artist, album, year, release_id)))
}

// ── Cover Art Archive ──

fn fetch_cover(release_mbid: &str) -> Result<Option<(Vec<u8>, String)>, String> {
    throttle_api();

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let url = format!("https://coverartarchive.org/release/{}/front", release_mbid);
    let resp = client
        .get(&url)
        .header("User-Agent", "LumiTune/1.0 (music-player@lumitune.app)")
        .send()
        .map_err(|e| format!("CoverArt request: {}", e))?;

    if !resp.status().is_success() {
        return Ok(None);
    }
    let mime = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();
    let bytes = resp.bytes().map_err(|e| format!("CoverArt read: {}", e))?;

    // Limit cover to 500KB
    if bytes.len() > 500_000 {
        return Ok(None);
    }
    Ok(Some((bytes.to_vec(), mime)))
}

// ── Filename parser (fallback) ──

fn parse_filename(path: &str) -> (Option<String>, Option<String>) {
    let name = Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("")
        .to_string();
    if name.is_empty() {
        return (None, None);
    }

    let mut s = name;

    // Strip known site prefixes (case-insensitive)
    let prefixes = ["y2mate.com", "youtube.com", "youtu.be"];
    for p in &prefixes {
        let prefix = format!("{} - ", p);
        if s.to_lowercase().starts_with(&prefix.to_lowercase()) {
            s = s[p.len() + 3..].trim().to_string();
            break;
        }
    }

    // Strip common suffixes (case-insensitive, longest first)
    let suffixes = [
        " (Official HD Video)", " (Official Lyric Video)", " (Official Music Video)",
        " [Official HD Video]", " [Official Lyric Video]", " [Official Music Video]",
        " Official HD Video", " Official Lyric Video", " Official Music Video",
        " (Official Video)", " [Official Video]", " (Official Audio)",
        " [Official Audio]", " (Lyrics)", " [Lyrics]", " (Lyric Video)",
        " (Audio)", " (Official)", " Official Video", " Official Audio",
    ];
    let lower = s.to_lowercase();
    for suffix in &suffixes {
        if lower.ends_with(&suffix.to_lowercase()) {
            s = s[..s.len() - suffix.len()].trim().to_string();
            break;
        }
    }

    let garbage_artists = ["y2mate.com", "youtube.com", "youtu.be", "unknown", "various artists"];

    // Try " - " split
    if let Some(idx) = s.find(" - ") {
        let artist = s[..idx].trim().to_string();
        let title = s[idx + 3..].trim().to_string();
        let artist_lower = artist.to_lowercase();
        if !artist.is_empty() && !title.is_empty() && !garbage_artists.contains(&artist_lower.as_str()) {
            return (Some(title), Some(artist));
        }
    }

    // Try "  " (double space) split before normalizing whitespace
    if let Some(idx) = s.find("  ") {
        let artist = s[..idx].trim().to_string();
        let title = s[idx + 2..].trim().to_string();
        let artist_lower = artist.to_lowercase();
        if !artist.is_empty() && !title.is_empty() && !garbage_artists.contains(&artist_lower.as_str()) {
            return (Some(title), Some(artist));
        }
    }

    // Normalize whitespace: collapse multiple spaces into one
    let mut prev = ' ';
    s = s.chars().filter(|c| { let b = *c != ' ' || prev != ' '; prev = *c; b }).collect::<String>().trim().to_string();

    (Some(s), None)
}

// ── Pipeline ──

#[derive(Debug, Clone, serde::Serialize)]
pub struct IdentificationProgress {
    pub file_id: i64,
    pub path: String,
    pub current: usize,
    pub total: usize,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct IdentificationResult {
    pub file_id: i64,
    pub path: String,
    pub success: bool,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub duration: Option<i64>,
    pub cover_data_base64: Option<String>,
    pub cover_mime: Option<String>,
    pub cover_path: Option<String>,
    pub method: String,
    pub confidence: Option<f64>,
    pub error: Option<String>,
    pub fallback_reason: Option<String>,
    pub reliability: String,
}

fn cover_to_b64(data: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn reliability(source: &str, confidence: Option<f64>) -> &'static str {
    match source {
        "acoustid" if confidence.map_or(false, |c| c >= 0.9) => "high",
        "acoustid" => "medium",
        "cache" | "audio_hash" if confidence.map_or(false, |c| c >= 0.9) => "high",
        "cache" | "audio_hash" => "medium",
        "id3" => "medium",
        "hybrid" => "medium",
        "filename" => "low",
        _ => "low",
    }
}

fn save_cover(data: &[u8], mime: &str, musicbrainz_id: &str, covers_dir: &str) -> String {
    let ext = match mime {
        "image/png" => "png",
        "image/apng" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => "jpg",
    };
    let filename = format!("{}.{}", musicbrainz_id, ext);
    let path_str = format!("{}/{}", covers_dir, filename);
    let path = std::path::Path::new(&path_str);
    if !path.exists() {
        std::fs::create_dir_all(covers_dir).ok();
        std::fs::write(path, data).ok();
    }
    path_str
}

pub fn identify_file(
    db: &Database,
    file_id: i64,
    path: &str,
    acoustid_key: &str,
    audio_hash: &str,
    covers_dir: &str,
) -> Result<IdentificationResult, String> {

    // Read ID3 tags (fallback if AcoustID fails)
    let mut tags = read_id3(path).unwrap_or_default();
    let has_tags = has_minimal_tags(&tags);
    let mut fallback_reason: Option<String> = None;
    let mut acoustid_artist: Option<String> = None;

    // Detect swapped title/artist in ID3 tags by comparing with filename
    // YouTube downloads often have channel name in title tag and song title in artist tag
    if has_tags && tags.title.is_some() && tags.artist.is_some() {
        let (fn_title, fn_artist) = parse_filename(path);
        if let (Some(ft), Some(fa)) = (&fn_title, &fn_artist) {
            let id3_title = tags.title.as_deref().unwrap_or("");
            let id3_artist = tags.artist.as_deref().unwrap_or("");
            if titles_match(id3_title, fa) && titles_match(id3_artist, ft) {
                let tmp = tags.title.clone();
                tags.title = tags.artist.clone();
                tags.artist = tmp;
                fallback_reason = Some("id3 tags had swapped title/artist — auto-fixed from filename".into());
            }
        }
    }

    // Audio hash cache: skip fpcalc if same audio already identified
    if !audio_hash.is_empty() {
        if let Ok(Some(cached)) = db.find_identified_by_audio_hash(audio_hash) {
            db.link_identification(file_id, cached.id, cached.confidence, "audio_hash", true)?;
            db.update_file_status(file_id, "identified")?;
            return Ok(IdentificationResult {
                file_id,
                path: path.to_string(),
                success: true,
                title: cached.title,
                artist: cached.artist,
                album: cached.album,
                year: cached.year,
                genre: cached.genre,
                duration: None,
                cover_data_base64: cached.cover_data.as_ref().map(|d| cover_to_b64(d)),
                cover_mime: cached.cover_mime,
                cover_path: cached.cover_path,
                method: "audio_hash".into(),
                confidence: cached.confidence,
                error: None,
                fallback_reason: None,
                reliability: reliability("audio_hash", cached.confidence).into(),
            });
        }
    }

    // Try fpcalc → AcoustID (takes priority over ID3 tags)
    if let Ok((fingerprint, duration)) = run_fpcalc(path) {

        // Cache hit? Use it directly.
        if let Some(cached) = db.find_by_fingerprint(&fingerprint)? {
            db.link_identification(file_id, cached.id, cached.confidence, "cache", true)?;
            db.update_file_status(file_id, "identified")?;
            return Ok(IdentificationResult {
                file_id,
                path: path.to_string(),
                success: true,
                title: cached.title,
                artist: cached.artist,
                album: cached.album,
                year: cached.year,
                genre: cached.genre,
                duration: Some(duration),
                cover_data_base64: cached.cover_data.as_ref().map(|d| cover_to_b64(d)),
                cover_mime: cached.cover_mime,
                cover_path: cached.cover_path,
                method: "cache".into(),
                confidence: cached.confidence,
                error: None,
                fallback_reason: None,
                reliability: reliability("cache", cached.confidence).into(),
            });
        }

        // AcoustID lookup (even if ID3 exists, to get better metadata)
        if !acoustid_key.is_empty() {
            let acoustid_results = match lookup_acoustid(&fingerprint, duration, acoustid_key) {
                Ok(results) => results,
                Err(e) => {
                    fallback_reason = Some(format!("acoustid error: {}", e));
                    let _ = db.cache_metadata(&MetadataEntry {
                        id: 0,
                        file_id: Some(file_id),
                        fingerprint: Some(fingerprint.clone()),
                        source: "fingerprint".into(),
                        title: String::new(),
                        artist: String::new(),
                        album: None, year: None, genre: None,
                        cover_data: None, cover_mime: None, cover_path: None,
                        musicbrainz_id: None, acoustid_id: None,
                        confidence: None,
                    });
                    Vec::new()
                }
            };

            if !acoustid_results.is_empty() {
                let (mb_id, confidence, title_from_aid, artist_from_aid) = &acoustid_results[0];

                // Tiered approval: high confidence ≥0.7 always accepted,
                // medium 0.4-0.7 only if ID3 is garbage (avoid overwriting correct ID3)
                let use_acoustid = *confidence >= 0.7
                    || (*confidence >= 0.4 && (!has_tags || is_garbage_tags(&tags)));

                if use_acoustid {

                    // Get MusicBrainz data
                    let (title, artist, album, year, release_id) = match lookup_musicbrainz(mb_id) {
                        Ok(Some(r)) => {
                            r
                        }
                        _ => {
                            (title_from_aid.clone(), artist_from_aid.clone(), None, None, None)
                        }
                    };

                    // Cross-check: compare AcoustID title against known title (ID3 or filename stem)
                    // to avoid overwriting correct metadata with wrong AcoustID match
                    let known_title = {
                        let id3_t = tags.title.as_deref().unwrap_or("").trim();
                        let fn_stem = Path::new(path).file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("");
                        if !id3_t.is_empty() { id3_t } else { fn_stem }
                    };
                    let cross_check_ok = known_title.is_empty()
                        || *confidence >= 0.99
                        || titles_match(&title, known_title);

                    if cross_check_ok {
                        // Fetch cover art and save to disk
                        let (cover_data, cover_mime, cover_path) = match release_id {
                            Some(ref rid) => match fetch_cover(rid) {
                                Ok(Some((data, mime))) => {
                                    let cp = save_cover(&data, &mime, rid, covers_dir);
                                    (Some(data), Some(mime), Some(cp))
                                }
                                _ => (None, None, None),
                            },
                            None => (None, None, None),
                        };

                        // Cache result
                        let entry = MetadataEntry {
                            id: 0,
                            file_id: Some(file_id),
                            fingerprint: Some(fingerprint),
                            source: "acoustid".into(),
                            title: title.clone(),
                            artist: artist.clone(),
                            album: album.clone(),
                            year,
                            genre: None,
                            cover_data,
                            cover_mime,
                            cover_path: cover_path.clone(),
                            musicbrainz_id: Some(mb_id.clone()),
                            acoustid_id: Some(acoustid_results[0].0.clone()),
                            confidence: Some(*confidence),
                        };
                        let meta_id = db.cache_metadata(&entry)?;
                        db.link_identification(file_id, meta_id, Some(*confidence), "acoustid", *confidence >= 0.9)?;
                        db.update_file_status(file_id, if *confidence >= 0.9 { "identified" } else { "needs_review" })?;

                        return Ok(IdentificationResult {
                            file_id,
                            path: path.to_string(),
                            success: true,
                            title: entry.title,
                            artist: entry.artist,
                            album: entry.album.clone(),
                            year: entry.year,
                            genre: entry.genre.clone(),
                            duration: Some(duration),
                            cover_data_base64: entry.cover_data.as_ref().map(|d| cover_to_b64(d)),
                            cover_mime: entry.cover_mime.clone(),
                            cover_path: entry.cover_path.clone(),
                            method: "acoustid".into(),
                            confidence: Some(*confidence),
                            error: None,
                            fallback_reason: None,
                            reliability: reliability("acoustid", Some(*confidence)).into(),
                        });
                    } else {
                        acoustid_artist = Some(artist.clone());
                        fallback_reason = Some(format!(
                            "acoustid: confidence {:.3} but title differs from '{}' (known='{}')",
                            confidence, title, known_title
                        ));
                    }
                } else {
                    let reason = if *confidence >= 0.4 { "good ID3 exists" } else { "below threshold 0.4" };
                    fallback_reason = Some(format!("acoustid: confidence {:.3} ({})", confidence, reason));
                }
            } else {
                if fallback_reason.is_none() {
                    fallback_reason = Some("acoustid: no matching results".into());
                }
            }
        } else {
            fallback_reason = Some("acoustid: no API key".into());
        }
    } else {
        fallback_reason = Some("fpcalc failed".into());
    }

    // Fallback 1: ID3 tags (if they exist)
    if has_tags {
        let entry = MetadataEntry {
            id: 0,
            file_id: Some(file_id),
            fingerprint: None,
            source: "id3".into(),
            title: tags.title.clone().unwrap_or_default(),
            artist: tags.artist.clone().unwrap_or_default(),
            album: tags.album.clone(),
            year: tags.year,
            genre: tags.genre.clone(),
            cover_data: tags.cover_data.clone(),
            cover_mime: tags.cover_mime.clone(),
            cover_path: None,
            musicbrainz_id: None,
            acoustid_id: None,
            confidence: Some(1.0),
        };
        let meta_id = db.cache_metadata(&entry)?;
        db.link_identification(file_id, meta_id, Some(1.0), "id3", true)?;
        db.update_file_status(file_id, "identified")?;
        return Ok(IdentificationResult {
            file_id,
            path: path.to_string(),
            success: true,
            title: tags.title.unwrap_or_default(),
            artist: tags.artist.unwrap_or_default(),
            album: tags.album,
            year: tags.year,
            genre: tags.genre.clone(),
            duration: None,
            cover_data_base64: tags.cover_data.as_ref().map(|d| cover_to_b64(d)),
            cover_mime: tags.cover_mime,
            cover_path: None,
            method: "id3".into(),
            confidence: Some(1.0),
            error: None,
            fallback_reason: fallback_reason.clone(),
            reliability: reliability("id3", Some(1.0)).into(),
        });
    }

    // Fallback 2: filename parsing
    let (title, artist) = parse_filename(path);
    let filename_artist = artist.or_else(|| {
        acoustid_artist.as_ref().and_then(|a| {
            let garbage = ["unknown", "y2mate.com", "y2mate", "various artists"];
            let lower = a.trim().to_lowercase();
            if !lower.is_empty() && !garbage.contains(&lower.as_str()) {
                Some(a.clone())
            } else {
                None
            }
        })
    }).unwrap_or_else(|| "Unknown".to_string());
    let entry = MetadataEntry {
        id: 0,
        file_id: Some(file_id),
        fingerprint: None,
        source: if acoustid_artist.is_some() { "hybrid" } else { "filename" }.into(),
        title: title.unwrap_or_else(|| Path::new(path).file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string()),
        artist: filename_artist,
        album: None,
        year: None,
        genre: None,
        cover_data: None,
        cover_mime: None,
        cover_path: None,
        musicbrainz_id: None,
        acoustid_id: None,
        confidence: Some(0.2),
    };
    let meta_id = db.cache_metadata(&entry)?;
    db.link_identification(file_id, meta_id, Some(0.2), &entry.source, false)?;
    db.update_file_status(file_id, "identified")?;
    Ok(IdentificationResult {
        file_id,
        path: path.to_string(),
        success: true,
        title: entry.title,
        artist: entry.artist,
        album: None,
        year: None,
        genre: None,
        duration: None,
        cover_data_base64: None,
        cover_mime: None,
        cover_path: None,
        method: entry.source.clone(),
        confidence: Some(0.2),
        error: None,
        fallback_reason: fallback_reason.clone(),
        reliability: reliability(&entry.source, Some(0.2)).into(),
    })
}
