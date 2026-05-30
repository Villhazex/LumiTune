use std::sync::Mutex;
use std::time::{Duration, Instant};

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

pub fn lookup_musicbrainz(recording_id: &str) -> Result<Option<(String, String, Option<String>, Option<i32>, Option<String>)>, String> {
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

pub fn fetch_cover(release_mbid: &str) -> Result<Option<(Vec<u8>, String)>, String> {
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

    if bytes.len() > 500_000 {
        return Ok(None);
    }
    Ok(Some((bytes.to_vec(), mime)))
}
