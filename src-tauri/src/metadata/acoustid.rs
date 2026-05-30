use std::time::Duration;

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

pub fn lookup_acoustid(fingerprint: &str, duration: i64, api_key: &str) -> Result<Vec<(String, f64, String, String)>, String> {
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
