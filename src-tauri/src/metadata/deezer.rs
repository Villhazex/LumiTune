use std::sync::Mutex;
use std::time::{Duration, Instant};

static LAST_DEEZER_CALL: Mutex<Option<Instant>> = Mutex::new(None);

fn throttle_api() {
    if let Ok(mut last) = LAST_DEEZER_CALL.lock() {
        if let Some(t) = *last {
            let elapsed = t.elapsed();
            if elapsed < Duration::from_millis(300) {
                std::thread::sleep(Duration::from_millis(300) - elapsed);
            }
        }
        *last = Some(Instant::now());
    }
}

#[derive(serde::Deserialize)]
struct DeezerResponse {
    data: Vec<DeezerTrack>,
}

#[derive(serde::Deserialize)]
struct DeezerTrack {
    id: i64,
    title: String,
    artist: DeezerArtist,
    album: DeezerAlbum,
}

#[derive(serde::Deserialize)]
struct DeezerArtist {
    name: String,
}

#[derive(serde::Deserialize)]
struct DeezerAlbum {
    title: Option<String>,
    cover_big: Option<String>,
    cover_xl: Option<String>,
}

#[derive(serde::Serialize, Clone)]
pub struct DeezerMatch {
    pub track_id: i64,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub cover_url: String,
}

fn url_encode(s: &str) -> String {
    // Simple percent-encoding for Deezer search queries
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' | b' ' => {
                out.push(b as char);
            }
            _ => {
                out.push_str(&format!("%{:02X}", b));
            }
        }
    }
    out
}

pub fn fetch_deezer_cover(title: &str, artist: &str) -> Result<Option<(Vec<u8>, String)>, String> {
    if title.is_empty() && artist.is_empty() {
        return Ok(None);
    }

    throttle_api();

    let query = format!(
        "artist:\"{}\" track:\"{}\"",
        url_encode(artist),
        url_encode(title)
    );

    let url = format!(
        "https://api.deezer.com/search?q={}&limit=1&output=json",
        url_encode(&query)
    );

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .header("User-Agent", "LumiTune/1.0 (music-player@lumitune.app)")
        .send()
        .map_err(|e| format!("Deezer request: {}", e))?;

    if !resp.status().is_success() {
        return Ok(None);
    }

    let text = resp.text().map_err(|e| format!("Deezer read: {}", e))?;
    let deez: DeezerResponse = match serde_json::from_str(&text) {
        Ok(d) => d,
        Err(_) => return Ok(None),
    };

    let cover_url = deez.data.first()
        .and_then(|t| t.album.cover_xl.as_deref().or(t.album.cover_big.as_deref()));

    let cover_url = match cover_url {
        Some(u) => u,
        None => return Ok(None),
    };

    // Download the cover image
    let img_resp = client
        .get(cover_url)
        .header("User-Agent", "LumiTune/1.0 (music-player@lumitune.app)")
        .timeout(Duration::from_secs(10))
        .send()
        .map_err(|e| format!("Deezer cover download: {}", e))?;

    if !img_resp.status().is_success() {
        return Ok(None);
    }

    let mime = img_resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = img_resp.bytes().map_err(|e| format!("Deezer cover read: {}", e))?;

    if bytes.len() > 5_000_000 {
        return Ok(None);
    }

    Ok(Some((bytes.to_vec(), mime)))
}

pub fn search_deezer(title: &str, artist: &str, limit: usize, index: usize) -> Result<Vec<DeezerMatch>, String> {
    if title.is_empty() && artist.is_empty() {
        return Ok(vec![]);
    }

    throttle_api();

    let query = if title.trim().is_empty() {
        url_encode(artist)
    } else {
        format!("{} {}", url_encode(artist), url_encode(title))
    };

    let limit = limit.clamp(1, 25);
    let url = format!(
        "https://api.deezer.com/search?q={}&limit={}&index={}&output=json",
        url_encode(&query),
        limit,
        index
    );

    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let resp = client
        .get(&url)
        .header("User-Agent", "LumiTune/1.0 (music-player@lumitune.app)")
        .send()
        .map_err(|e| format!("Deezer request: {}", e))?;

    if !resp.status().is_success() {
        return Ok(vec![]);
    }

    let text = resp.text().map_err(|e| format!("Deezer read: {}", e))?;
    let deez: DeezerResponse = match serde_json::from_str(&text) {
        Ok(d) => d,
        Err(_) => return Ok(vec![]),
    };

    let results = deez
        .data
        .into_iter()
        .filter_map(|t| {
            let cover_url = t
                .album
                .cover_xl
                .as_deref()
                .or(t.album.cover_big.as_deref())?
                .to_string();
            Some(DeezerMatch {
                track_id: t.id,
                title: t.title,
                artist: t.artist.name,
                album: t.album.title.unwrap_or_default(),
                cover_url,
            })
        })
        .collect();

    Ok(results)
}

pub fn download_deezer_cover(
    cover_url: &str,
    title: &str,
    artist: &str,
    covers_dir: &str,
) -> Result<Option<(Vec<u8>, String)>, String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(15))
        .user_agent("LumiTune/1.0 (music-player@lumitune.app)")
        .build()
        .map_err(|e| format!("HTTP client: {}", e))?;

    let img_resp = client
        .get(cover_url)
        .timeout(Duration::from_secs(15))
        .send()
        .map_err(|e| format!("Deezer cover download: {}", e))?;

    if !img_resp.status().is_success() {
        return Ok(None);
    }

    let mime = img_resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = img_resp
        .bytes()
        .map_err(|e| format!("Deezer cover read: {}", e))?;

    if bytes.len() > 5_000_000 {
        return Ok(None);
    }

    // Save to disk via existing helper
    let _path = super::save_raw_cover_to_dir(title, artist, &bytes, &mime, covers_dir);

    Ok(Some((bytes.to_vec(), mime)))
}
