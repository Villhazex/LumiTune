use std::path::Path;
use std::fs;
use std::hash::{Hash, Hasher};
use std::collections::hash_map::DefaultHasher;
use std::io::{Read, Seek, SeekFrom};
use walkdir::WalkDir;

const AUDIO_EXTS: &[&str] = &["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub size: i64,
    pub modified: i64,
    pub audio_hash: String,
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
        files.push(ScannedFile {
            path: apath.clone(),
            size: meta.len() as i64,
            modified,
            audio_hash: compute_audio_hash(&apath),
        });
    }
    Ok(files)
}
