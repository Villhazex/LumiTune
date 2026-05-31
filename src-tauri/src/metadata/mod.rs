mod normalize;
mod display;
mod fpcalc;
mod acoustid;
mod musicbrainz;
mod merge;
mod verifier;
mod deezer;

pub use normalize::{titles_match, parse_filename, similarity};
pub use display::{read_id3, has_minimal_tags};
pub use fpcalc::run_fpcalc;
pub use acoustid::lookup_acoustid;
pub use musicbrainz::{lookup_musicbrainz, fetch_cover};
pub use merge::try_update_display;
pub use verifier::{VerificationResult, verify_candidate};
pub use deezer::{fetch_deezer_cover, search_deezer, download_deezer_cover, DeezerMatch};

use std::path::Path;

use base64::Engine;

use crate::db::{Database, MetadataEntry};

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
    pub title_similarity: f64,
    pub artist_similarity: f64,
    pub final_score: f64,
    pub is_trusted: bool,
    pub suspected_swapped: bool,
}

fn cover_to_b64(data: &[u8]) -> String {
    base64::engine::general_purpose::STANDARD.encode(data)
}

fn metadata_hash(title: &str, artist: &str) -> u64 {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    title.hash(&mut h);
    artist.hash(&mut h);
    h.finish()
}

fn reliability(source: &str, confidence: Option<f64>, is_trusted: Option<bool>) -> &'static str {
    let trusted = is_trusted.unwrap_or(true);
    match source {
        "acoustid" if trusted && confidence.map_or(false, |c| c >= 0.9) => "high",
        "acoustid" if trusted => "medium",
        "acoustid" => "low",
        "cache" | "audio_hash" if confidence.map_or(false, |c| c >= 0.9) => "high",
        "cache" | "audio_hash" => "medium",
        "id3" => "medium",
        "hybrid" => "medium",
        "filename" => "low",
        _ => "low",
    }
}

/// Try to resolve cover data from a cached MetadataEntry.
/// If `cover_data` is present, use it directly.
/// If not, try reading from `cover_path` on disk.
/// If that also fails, return (None, None).
fn resolve_cached_cover(cached: &crate::db::MetadataEntry, _covers_dir: &str) -> (Option<Vec<u8>>, Option<String>) {
    if cached.cover_data.is_some() {
        return (cached.cover_data.clone(), cached.cover_mime.clone());
    }
    if let Some(ref cp) = cached.cover_path {
        if let Ok(data) = std::fs::read(cp) {
            let mime = cached.cover_mime.clone().unwrap_or_else(|| "image/jpeg".to_string());
            return (Some(data), Some(mime));
        }
    }
    (None, None)
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

pub fn fetch_and_save_manual_cover(title: &str, artist: &str, covers_dir: &str) -> Result<Option<(Vec<u8>, String, String)>, String> {
    match fetch_deezer_cover(title, artist) {
        Ok(Some((data, mime))) => {
            let rid = format!("manual_{:x}", metadata_hash(title, artist));
            let path = save_cover(&data, &mime, &rid, covers_dir);
            Ok(Some((data, mime, path)))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn save_raw_cover_to_dir(title: &str, artist: &str, data: &[u8], mime: &str, covers_dir: &str) -> String {
    let rid = format!("yt_{:x}", metadata_hash(title, artist));
    save_cover(data, mime, &rid, covers_dir)
}

pub fn identify_file(
    db: &Database,
    file_id: i64,
    path: &str,
    acoustid_key: &str,
    audio_hash: &str,
    covers_dir: &str,
) -> Result<IdentificationResult, String> {

    let current_source = db.get_file_metadata_source(file_id).unwrap_or_else(|_| "auto".to_string());

    let mut tags = read_id3(path).unwrap_or_default();
    let has_tags = has_minimal_tags(&tags);
    let mut fallback_reason: Option<String> = None;
    let mut acoustid_artist: Option<String> = None;

    if has_tags && tags.title.is_some() && tags.artist.is_some() {
        let fp = parse_filename(path);
        if let (Some(ft), Some(fa)) = (&fp.title, &fp.artist) {
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

    if !audio_hash.is_empty() {
        if let Ok(Some(cached)) = db.find_identified_by_audio_hash(audio_hash) {
            let (cover_data, cover_mime) = resolve_cached_cover(&cached, covers_dir);
            db.link_identification(file_id, cached.id, cached.confidence, "audio_hash", true)?;
            db.update_file_status(file_id, "identified")?;
            try_update_display(db, file_id, &current_source, "audio_hash", &cached.title, &cached.artist, cached.confidence);
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
                cover_data_base64: cover_data.as_ref().map(|d| cover_to_b64(d)),
                cover_mime,
                cover_path: cached.cover_path,
                method: "audio_hash".into(),
                confidence: cached.confidence,
                error: None,
                fallback_reason: None,
                reliability: reliability("audio_hash", cached.confidence, None).into(),
                title_similarity: 0.0,
                artist_similarity: 0.0,
                final_score: 0.0,
                is_trusted: true,
                suspected_swapped: false,
            });
        }
    }

    if let Ok((fingerprint, duration)) = run_fpcalc(path) {

        if let Some(cached) = db.find_by_fingerprint(&fingerprint)? {
            let (cover_data, cover_mime) = resolve_cached_cover(&cached, covers_dir);
            db.link_identification(file_id, cached.id, cached.confidence, "cache", true)?;
            db.update_file_status(file_id, "identified")?;
            try_update_display(db, file_id, &current_source, "cache", &cached.title, &cached.artist, cached.confidence);
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
                cover_data_base64: cover_data.as_ref().map(|d| cover_to_b64(d)),
                cover_mime,
                cover_path: cached.cover_path,
                method: "cache".into(),
                confidence: cached.confidence,
                error: None,
                fallback_reason: None,
                reliability: reliability("cache", cached.confidence, None).into(),
                title_similarity: 0.0,
                artist_similarity: 0.0,
                final_score: 0.0,
                is_trusted: true,
                suspected_swapped: false,
            });
        }

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
                        title_similarity: None,
                        artist_similarity: None,
                        final_score: None,
                        is_trusted: None,
                        candidates_log: None,
                    });
                    Vec::new()
                }
            };

            if !acoustid_results.is_empty() {
                // ---- Candidate Re-Scoring ----
                // Determine known metadata from ID3 or filename for comparison
                // When no ID3 tags, try both filename parser orientations
                let known_pairs: Vec<(String, String)> = if has_tags {
                    let id3_t = tags.title.as_deref().unwrap_or("").trim().to_string();
                    let id3_a = tags.artist.as_deref().unwrap_or("").trim().to_string();
                    if !id3_t.is_empty() {
                        // Try both orientations in case ID3 tags are swapped
                        let mut pairs = vec![(id3_t.clone(), id3_a.clone())];
                        if !id3_a.is_empty() && id3_t != id3_a {
                            pairs.push((id3_a, id3_t));
                        }
                        pairs
                    } else {
                        Vec::new()
                    }
                } else {
                    let fp = parse_filename(path);
                    let ft = fp.title.unwrap_or_default();
                    let fa = fp.artist.unwrap_or_default();
                    let mut pairs = Vec::new();
                    if !ft.is_empty() || !fa.is_empty() {
                        pairs.push((ft.clone(), fa.clone()));
                        if !ft.is_empty() && !fa.is_empty() && ft != fa {
                            pairs.push((fa, ft));
                        }
                    }
                    pairs
                };

                // Score all AcoustID candidates against known metadata
                // When multiple known pairs exist, pick the orientation with the best match
                let mut scored: Vec<(f64, &(String, f64, String, String), VerificationResult)> = acoustid_results.iter()
                    .map(|cand| {
                        if known_pairs.is_empty() {
                            let vr = VerificationResult {
                                title_similarity: cand.1,
                                artist_similarity: cand.1,
                                final_score: cand.1,
                                is_trusted: cand.1 >= 0.5,
                            };
                            return (vr.final_score, cand, vr);
                        }
                        let mut best: Option<(f64, &(String, f64, String, String), VerificationResult)> = None;
                        for (kt, ka) in &known_pairs {
                            let vr = verify_candidate(&cand.2, &cand.3, kt, ka, cand.1);
                            let score = vr.final_score;
                            let better = best.as_ref().map_or(true, |(best_s, _, _)| score > *best_s);
                            if better {
                                best = Some((score, cand, vr));
                            }
                        }
                        best.unwrap()
                    })
                    .collect();
                scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
                scored.dedup_by_key(|(_, cand, _)| cand.0.clone());

                let (best_score, best_cand, best_vr) = &scored[0];
                let (mb_id, confidence, title_from_aid, artist_from_aid) = *best_cand;

                let decision = if *best_score >= 0.6 { "accepted" }
                    else if *best_score >= 0.4 { "needs_review" }
                    else { "rejected" };

                match decision {
                    "rejected" => {
                        acoustid_artist = Some(artist_from_aid.clone());
                        fallback_reason = Some(format!(
                            "acoustid: best candidate score {:.3} < 0.4 (conf={:.3}, title_sim={:.3}, artist_sim={:.3})",
                            best_score, confidence, best_vr.title_similarity, best_vr.artist_similarity
                        ));
                    }
                    _ => {
                        // MusicBrainz lookup for best candidate
                        let (title, artist, album, year, release_id) = match lookup_musicbrainz(mb_id) {
                            Ok(Some(r)) => r,
                            _ => (title_from_aid.clone(), artist_from_aid.clone(), None, None, None),
                        };

                        // Re-verify with MB-resolved data against all known pairs
                        let (mb_vr, mb_score, is_trusted) = if known_pairs.is_empty() {
                            let vr = VerificationResult {
                                title_similarity: confidence.max(0.5),
                                artist_similarity: confidence.max(0.5),
                                final_score: *confidence,
                                is_trusted: *confidence >= 0.5,
                            };
                            let fs = vr.final_score;
                            let tr = vr.is_trusted;
                            (vr, fs, tr)
                        } else {
                            let mut mb_best: Option<(VerificationResult, f64, bool)> = None;
                            for (kt, ka) in &known_pairs {
                                let vr = verify_candidate(&title, &artist, kt, ka, *confidence);
                                let score = vr.final_score;
                                let trusted = vr.is_trusted;
                                let better = mb_best.as_ref().map_or(true, |(_, best_s, _)| score > *best_s);
                                if better {
                                    mb_best = Some((vr, score, trusted));
                                }
                            }
                            mb_best.unwrap()
                        };

                        let final_decision = if mb_score >= 0.6 || is_trusted { "accepted" }
                            else if mb_score >= 0.4 { "needs_review" }
                            else { "rejected" };

                        match final_decision {
                            "rejected" => {
                                acoustid_artist = Some(artist.clone());
                                fallback_reason = Some(format!(
                                    "acoustid: after MB resolution score {:.3} < 0.4 (conf={:.3}, title_sim={:.3}, artist_sim={:.3})",
                                    mb_score, confidence, mb_vr.title_similarity, mb_vr.artist_similarity
                                ));
                            }
                            _ => {
                                let mut cover_data: Option<Vec<u8>> = None;
                                let mut cover_mime: Option<String> = None;
                                let mut cover_path: Option<String> = None;
                                // CAA cover
                                if let Some(ref rid) = release_id {
                                    if let Ok(Some((data, mime))) = fetch_cover(rid) {
                                        let cp = save_cover(&data, &mime, rid, covers_dir);
                                        cover_data = Some(data);
                                        cover_mime = Some(mime);
                                        cover_path = Some(cp);
                                    }
                                }
                                // Deezer fallback when CAA had no cover
                                if cover_data.is_none() && !title.is_empty() {
                                    if let Ok(Some((data, mime))) = fetch_deezer_cover(&title, &artist) {
                                        let rid_hash = format!("dz_{:x}", metadata_hash(&title, &artist));
                                        let cp = save_cover(&data, &mime, &rid_hash, covers_dir);
                                        cover_data = Some(data);
                                        cover_mime = Some(mime);
                                        cover_path = Some(cp);
                                    }
                                }

                                let status = if *confidence >= 0.9 && is_trusted { "identified" } else { "needs_review" };

                                let candidates_log = serde_json::to_string(&scored.iter().map(|(s, c, vr)| {
                                    serde_json::json!({
                                        "id": c.0, "conf": c.1, "title": c.2, "artist": c.3,
                                        "title_sim": vr.title_similarity, "artist_sim": vr.artist_similarity,
                                        "score": s
                                    })
                                }).collect::<Vec<_>>()).unwrap_or_default();

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
                                    acoustid_id: Some(best_cand.0.clone()),
                                    confidence: Some(*confidence),
                                    title_similarity: Some(mb_vr.title_similarity),
                                    artist_similarity: Some(mb_vr.artist_similarity),
                                    final_score: Some(mb_vr.final_score),
                                    is_trusted: Some(is_trusted),
                                    candidates_log: Some(candidates_log),
                                };
                                let meta_id = db.cache_metadata(&entry)?;
                                db.link_identification(file_id, meta_id, Some(*confidence), "acoustid", status == "identified")?;
                                db.update_file_status(file_id, status)?;

                                try_update_display(db, file_id, &current_source, "acoustid", &entry.title, &entry.artist, Some(*confidence));
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
                                    reliability: reliability("acoustid", Some(*confidence), Some(is_trusted)).into(),
                                    title_similarity: mb_vr.title_similarity,
                                    artist_similarity: mb_vr.artist_similarity,
                                    final_score: mb_score,
                                    is_trusted,
                                    suspected_swapped: false,
                                });
                            }
                        }
                    }
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

    if has_tags {
        let id3_title = tags.title.clone().unwrap_or_default();
        let id3_artist = tags.artist.clone().unwrap_or_default();
        let entry = MetadataEntry {
            id: 0,
            file_id: Some(file_id),
            fingerprint: None,
            source: "id3".into(),
            title: id3_title.clone(),
            artist: id3_artist.clone(),
            album: tags.album.clone(),
            year: tags.year,
            genre: tags.genre.clone(),
            cover_data: tags.cover_data.clone(),
            cover_mime: tags.cover_mime.clone(),
            cover_path: None,
            musicbrainz_id: None,
            acoustid_id: None,
            confidence: Some(1.0),
            title_similarity: None,
            artist_similarity: None,
            final_score: None,
            is_trusted: None,
            candidates_log: None,
        };
        let meta_id = db.cache_metadata(&entry)?;
        db.link_identification(file_id, meta_id, Some(1.0), "id3", true)?;
        db.update_file_status(file_id, "identified")?;
        try_update_display(db, file_id, &current_source, "id3", &id3_title, &id3_artist, Some(1.0));
        return Ok(IdentificationResult {
            file_id,
            path: path.to_string(),
            success: true,
            title: id3_title,
            artist: id3_artist,
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
            reliability: reliability("id3", Some(1.0), None).into(),
            title_similarity: 1.0,
            artist_similarity: 1.0,
            final_score: 0.0,
            is_trusted: true,
            suspected_swapped: false,
        });
    }

    let fp = parse_filename(path);
    let filename_artist = fp.artist.or_else(|| {
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
        title: fp.title.unwrap_or_else(|| Path::new(path).file_stem().and_then(|s| s.to_str()).unwrap_or("Unknown").to_string()),
        artist: filename_artist,
        album: fp.album,
        year: None,
        genre: None,
        cover_data: None,
        cover_mime: None,
        cover_path: None,
        musicbrainz_id: None,
        acoustid_id: None,
        confidence: Some(0.2),
        title_similarity: None,
        artist_similarity: None,
        final_score: None,
        is_trusted: None,
        candidates_log: None,
    };
    let meta_id = db.cache_metadata(&entry)?;
    db.link_identification(file_id, meta_id, Some(0.2), &entry.source, false)?;
    db.update_file_status(file_id, "identified")?;
    try_update_display(db, file_id, &current_source, &entry.source, &entry.title, &entry.artist, Some(0.2));
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
        reliability: reliability(&entry.source, Some(0.2), None).into(),
        title_similarity: 0.0,
        artist_similarity: 0.0,
        final_score: 0.0,
        is_trusted: false,
        suspected_swapped: false,
    })
}
