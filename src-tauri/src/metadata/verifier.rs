use crate::metadata::similarity;

#[derive(Debug, Clone, serde::Serialize)]
pub struct VerificationResult {
    pub title_similarity: f64,
    pub artist_similarity: f64,
    pub final_score: f64,
    pub is_trusted: bool,
}

pub fn compute_final_score(acoustid_confidence: f64, title_sim: f64, artist_sim: f64) -> f64 {
    acoustid_confidence * 0.5 + title_sim * 0.3 + artist_sim * 0.2
}

pub fn is_trusted(score: f64, title_sim: f64, artist_sim: f64) -> bool {
    score >= 0.6 && title_sim >= 0.5 && artist_sim >= 0.5
}

pub fn verify_candidate(
    candidate_title: &str,
    candidate_artist: &str,
    known_title: &str,
    known_artist: &str,
    acoustid_confidence: f64,
) -> VerificationResult {
    let title_sim = similarity(candidate_title, known_title);
    let artist_sim = similarity(candidate_artist, known_artist);
    let final_score = compute_final_score(acoustid_confidence, title_sim, artist_sim);
    let trusted = is_trusted(final_score, title_sim, artist_sim);
    VerificationResult {
        title_similarity: title_sim,
        artist_similarity: artist_sim,
        final_score,
        is_trusted: trusted,
    }
}
