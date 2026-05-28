use std::path::Path;
use std::fs;
use walkdir::WalkDir;

const AUDIO_EXTS: &[&str] = &["mp3", "wav", "ogg", "flac", "m4a", "aac", "wma", "opus"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct ScannedFile {
    pub path: String,
    pub size: i64,
    pub modified: i64,
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
        files.push(ScannedFile {
            path: entry.path().to_string_lossy().to_string(),
            size: meta.len() as i64,
            modified,
        });
    }
    Ok(files)
}
