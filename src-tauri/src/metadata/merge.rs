use crate::db::Database;

pub fn source_priority(source: &str) -> u8 {
    match source {
        "manual" => 5,
        "acoustid" => 4,
        "cache" | "audio_hash" => 3,
        "id3" | "hybrid" => 3,
        "filename" => 2,
        "folder" => 1,
        _ => 0,
    }
}

pub fn should_update_display(current_source: &str, new_method: &str, new_confidence: f64,
    title_similarity: Option<f64>, artist_similarity: Option<f64>) -> bool {
    if current_source == "manual" {
        return false;
    }
    // High confidence override (≥0.995): bypass similarity gate
    if new_confidence >= 0.995 {
        let cur = source_priority(current_source);
        let new = source_priority(new_method);
        return new > cur || (new == cur && new_confidence >= 0.9);
    }
    // Similarity gate: don't overwrite title/artist if similarity is too low
    if let (Some(ts), Some(as_)) = (title_similarity, artist_similarity) {
        if ts < 0.7 || as_ < 0.7 {
            return false;
        }
    }
    let cur = source_priority(current_source);
    let new = source_priority(new_method);
    new > cur || (new == cur && new_confidence >= 0.9)
}

pub fn try_update_display(db: &Database, file_id: i64, current_source: &str,
    method: &str, title: &str, artist: &str, confidence: Option<f64>) {
    let conf = confidence.unwrap_or(0.0);
    if should_update_display(current_source, method, conf, None, None) {
        db.update_display_metadata(file_id, title, artist, method).ok();
    }
}
