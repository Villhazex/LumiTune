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
    album: DeezerAlbum,
}

#[derive(serde::Deserialize)]
struct DeezerAlbum {
    cover_big: Option<String>,
    cover_xl: Option<String>,
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

    if bytes.len() > 1_000_000 {
        return Ok(None);
    }

    Ok(Some((bytes.to_vec(), mime)))
}
