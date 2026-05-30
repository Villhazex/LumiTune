use std::path::Path;
use std::fs;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::io::{Read, Seek, SeekFrom};
use walkdir::WalkDir;

use base64::Engine;

use crate::metadata;

const AUDIO_EXTS: &[&str] = &["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct Level1Metadata {
    pub display_title: String,
    pub display_artist: String,
    pub display_album: Option<String>,
    pub display_cover_path: Option<String>,
    pub display_source: String,
    pub has_embedded_cover: bool,
    pub cover_data_base64: Option<String>,
    pub cover_mime: Option<String>,
    pub suspected_swapped: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub size: i64,
    pub modified: i64,
    pub audio_hash: String,
    pub display_title: String,
    pub display_artist: String,
    pub display_album: Option<String>,
    pub display_cover_path: Option<String>,
    pub display_source: String,
    pub has_embedded_cover: bool,
    pub cover_data_base64: Option<String>,
    pub cover_mime: Option<String>,
    pub suspected_swapped: bool,
}

fn compute_audio_hash(path: &str) -> String {
    let mut file = match std::fs::File::open(path) {
        Ok(f) => f,
        Err(_) => return String::new(),
    };
    let size = match file.metadata() {
        Ok(m) => m.len(),
        Err(_) => return String::new(),
    };

    let mut hasher = DefaultHasher::new();
    size.hash(&mut hasher);

    let sample = 65536u64.min(size);
    let mut buf = vec![0u8; sample as usize];

    // First 64KB (or whole file if smaller)
    if file.read_exact(&mut buf).is_ok() {
        buf.hash(&mut hasher);
    }

    // Last 64KB if file larger than 128KB
    if size > sample * 2 {
        if file.seek(SeekFrom::End(-(sample as i64))).is_ok() {
            if file.read_exact(&mut buf).is_ok() {
                buf.hash(&mut hasher);
            }
        }
    }

    format!("{:016x}", hasher.finish())
}

/// Read Level 1 display metadata from ID3 tags or filename parsing.
/// This never waits for network or fingerprinting — instant, offline metadata.
fn read_level1_metadata(path: &str) -> Level1Metadata {
    let tags = metadata::read_id3(path).unwrap_or_default();
    let has_tags = metadata::has_minimal_tags(&tags);

    let (cover_data_b64, cover_mime) = tags.cover_data.as_ref().zip(tags.cover_mime.as_ref())
        .map(|(data, mime)| (Some(base64::engine::general_purpose::STANDARD.encode(data)), Some(mime.clone())))
        .unwrap_or((None, None));

    if has_tags {
        let mut title = tags.title.clone().unwrap_or_default();
        let mut artist = tags.artist.clone().unwrap_or_default();
        let album = tags.album.clone();

        // Detect swapped title/artist using filename parser
        let fp = metadata::parse_filename(path);
        if let (Some(ft), Some(fa)) = (&fp.title, &fp.artist) {
            let need_flip = if fp.suspected_swapped {
                // Relaxed threshold when parser is unsure
                metadata::titles_match(&title, fa) || metadata::titles_match(&artist, ft)
            } else {
                metadata::titles_match(&title, fa) && metadata::titles_match(&artist, ft)
            };
            if need_flip {
                std::mem::swap(&mut title, &mut artist);
            }
        }

        // Check for local cover image in same directory
        let parent = std::path::Path::new(path).parent();
        let cover_path = parent.and_then(|dir| {
            let candidates = ["folder.jpg", "cover.jpg", "front.jpg", "Folder.jpg", "Cover.jpg", "Front.jpg"];
            for name in &candidates {
                let p = dir.join(name);
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
            None
        });

        Level1Metadata {
            display_title: if title.trim().is_empty() { "Unknown".to_string() } else { title },
            display_artist: if artist.trim().is_empty() { "Unknown".to_string() } else { artist },
            display_album: album.filter(|a| !a.trim().is_empty()),
            display_cover_path: cover_path,
            display_source: "id3".to_string(),
            has_embedded_cover: tags.cover_data.is_some(),
            cover_data_base64: cover_data_b64,
            cover_mime,
            suspected_swapped: false,
        }
    } else {
        // Fallback to filename parsing
        // Parser outputs its best guess for title/artist ordering.
        // We don't propagate suspected_swapped because it reflects internal
        // parser confidence, not an actual swap needed at display level.
        // Propagating it causes applyCanonicalUpdate to flip already-correct values.
        let fp = metadata::parse_filename(path);
        Level1Metadata {
            display_title: fp.title.unwrap_or_else(|| {
                std::path::Path::new(path)
                    .file_stem()
                    .and_then(|s| s.to_str())
                    .unwrap_or("Unknown")
                    .to_string()
            }),
            display_artist: fp.artist.unwrap_or_else(|| "Unknown".to_string()),
            display_album: fp.album,
            display_cover_path: None,
            display_source: "filename".to_string(),
            has_embedded_cover: false,
            cover_data_base64: None,
            cover_mime: None,
            suspected_swapped: false,
        }
    }
}

pub fn scan_folder(path: &Path) -> Result<Vec<ScannedFile>, String> {
    if !path.is_dir() {
        return Err(format!("Not a directory: {}", path.display()));
    }
    let mut files = Vec::new();
    for entry in WalkDir::new(path).follow_links(true) {
        let entry = entry.map_err(|e| format!("Walk error: {}", e))?;
        if !entry.file_type().is_file() { continue; }
        let ext = entry.path()
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_lowercase())
            .unwrap_or_default();
        if !AUDIO_EXTS.contains(&ext.as_str()) { continue; }
        let meta = fs::metadata(entry.path()).map_err(|e| format!("Metadata: {}", e))?;
        let modified = meta.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0);
        let apath = entry.path().to_string_lossy().to_string();
        let l1 = read_level1_metadata(&apath);
        files.push(ScannedFile {
            path: apath.clone(),
            size: meta.len() as i64,
            modified,
            audio_hash: compute_audio_hash(&apath),
            display_title: l1.display_title,
            display_artist: l1.display_artist,
            display_album: l1.display_album,
            display_cover_path: l1.display_cover_path,
            display_source: l1.display_source,
            has_embedded_cover: l1.has_embedded_cover,
            cover_data_base64: l1.cover_data_base64,
            cover_mime: l1.cover_mime,
            suspected_swapped: l1.suspected_swapped,
        });
    }
    Ok(files)
}
