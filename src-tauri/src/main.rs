#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod metadata;
mod scanner;
mod worker;

use std::path::PathBuf;
use std::process::Command;
use serde::Serialize;
use tauri::Manager;

struct AppPaths {
    covers_dir: PathBuf,
    downloads_dir: PathBuf,
}

#[derive(Serialize)]
struct VideoInfo {
    title: String,
    author_name: String,
    thumbnail_url: String,
    format: String,
    duration: i64,
}

#[derive(Serialize)]
struct DownloadResult {
    bytes: Vec<u8>,
    mime: String,
    title: String,
    author: String,
}

#[derive(Serialize)]
struct DownloadFileResult {
    file_path: String,
    title: String,
    author: String,
}

fn yt_bin() -> PathBuf {
    let bundled = PathBuf::from("./resources/yt-dlp.exe");
    if bundled.exists() { return bundled; }
    PathBuf::from("yt-dlp.exe")
}

fn run_yt(args: &[&str]) -> Result<Vec<u8>, String> {
    let out = Command::new(yt_bin())
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("yt-dlp: {}", &stderr[..500.min(stderr.len())]));
    }
    Ok(out.stdout)
}

#[tauri::command]
fn yt_info(url: String) -> Result<VideoInfo, String> {
    let stdout = run_yt(&[
        &url, "--dump-json", "--no-check-certificates", "--no-warnings",
        "--skip-download",
    ])?;
    let v: serde_json::Value = serde_json::from_slice(&stdout)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    Ok(VideoInfo {
        title: v["title"].as_str().unwrap_or("").into(),
        author_name: v["uploader"].as_str().or(v["channel"].as_str()).unwrap_or("").into(),
        thumbnail_url: v["thumbnail"].as_str().unwrap_or("").into(),
        format: v["ext"].as_str().unwrap_or("").into(),
        duration: v["duration"].as_i64().unwrap_or(0),
    })
}

#[tauri::command]
fn yt_download(url: String) -> Result<DownloadResult, String> {
    let info_out = run_yt(&[
        &url, "--dump-json", "--no-check-certificates", "--no-warnings",
        "--prefer-free-formats", "--skip-download",
    ])?;
    let v: serde_json::Value = serde_json::from_slice(&info_out)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    let formats = v["formats"].as_array().ok_or("No formats found")?;
    let audio: Vec<&serde_json::Value> = formats.iter()
        .filter(|f| f["resolution"].as_str() == Some("audio only") && f["filesize"].as_i64().is_some())
        .collect();
    let best = audio.iter().max_by_key(|f| f["filesize"].as_i64().unwrap_or(0))
        .ok_or("No audio-only format found")?;
    let fid = best["format_id"].as_str().ok_or("No format_id")?;
    let ext = best["ext"].as_str().unwrap_or("m4a");
    let mime = match ext {
        "m4a" => "audio/mp4",
        "webm" => "audio/webm",
        "mp3" => "audio/mpeg",
        "opus" => "audio/ogg",
        _ => "audio/mp4",
    };

    let audio_bytes = run_yt(&[
        &url, "-o", "-", "-f", fid,
        "--no-check-certificates", "--no-warnings", "--prefer-free-formats",
    ])?;

    Ok(DownloadResult {
        bytes: audio_bytes,
        mime: mime.into(),
        title: v["title"].as_str().unwrap_or("").into(),
        author: v["uploader"].as_str().or(v["channel"].as_str()).unwrap_or("").into(),
    })
}

#[tauri::command]
fn yt_download_mp3(url: String) -> Result<DownloadResult, String> {
    let info_out = run_yt(&[
        &url, "--dump-json", "--no-check-certificates", "--no-warnings",
        "--prefer-free-formats", "--skip-download",
    ])?;
    let v: serde_json::Value = serde_json::from_slice(&info_out)
        .map_err(|e| format!("Invalid JSON: {}", e))?;

    let audio_bytes = run_yt(&[
        &url, "-x", "--audio-format", "mp3", "--audio-quality", "0", "-o", "-",
        "--no-check-certificates", "--no-warnings", "--prefer-free-formats",
    ])?;

    Ok(DownloadResult {
        bytes: audio_bytes,
        mime: "audio/mpeg".into(),
        title: v["title"].as_str().unwrap_or("").into(),
        author: v["uploader"].as_str().or(v["channel"].as_str()).unwrap_or("").into(),
    })
}

#[tauri::command]
fn yt_download_file(url: String, download_dir: Option<String>, app_paths: tauri::State<AppPaths>) -> Result<DownloadFileResult, String> {
    let info_out = run_yt(&[
        &url, "--dump-json", "--no-check-certificates", "--no-warnings",
        "--prefer-free-formats", "--skip-download",
    ])?;
    let v: serde_json::Value = serde_json::from_slice(&info_out)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    let title = v["title"].as_str().unwrap_or("").to_string();
    let author = v["uploader"].as_str().or(v["channel"].as_str()).unwrap_or("").to_string();

    let dl_dir = match download_dir {
        Some(ref d) => std::path::PathBuf::from(d),
        None => app_paths.downloads_dir.clone(),
    };
    std::fs::create_dir_all(&dl_dir).map_err(|e| format!("Create dir: {}", e))?;

    let safe_title: String = title.chars()
        .map(|c| if matches!(c, '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*') { '_' } else { c })
        .take(100)
        .collect();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
        .as_millis();
    let out_path = dl_dir.join(format!("{}-{}", safe_title, ts));

    let output = Command::new(yt_bin())
        .args(&[
            &url, "-o", out_path.to_str().unwrap_or("audio"), "-x",
            "--audio-format", "mp3", "--audio-quality", "0",
            "--no-check-certificates", "--no-warnings", "--prefer-free-formats",
        ])
        .output()
        .map_err(|e| format!("Failed to run yt-dlp: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp: {}", &stderr[..500.min(stderr.len())]));
    }

    // Find the actual file (yt-dlp appends .mp3)
    let actual = std::fs::read_dir(&dl_dir)
        .map_err(|_| "Cannot list downloads dir".to_string())?
        .filter_map(|e| e.ok())
        .map(|e| e.path())
        .filter(|p| {
            let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("");
            name.starts_with(&safe_title)
        })
        .max_by_key(|p| {
            p.metadata().ok()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_nanos())
                .unwrap_or(0)
        })
        .ok_or("No output MP3 file found after download".to_string())?;

    Ok(DownloadFileResult {
        file_path: actual.to_string_lossy().to_string(),
        title,
        author,
    })
}

// ── Title bar (Tauri window controls) ──

use raw_window_handle::HasRawWindowHandle;

fn get_hwnds(window: &tauri::Window) -> Result<windows_sys::Win32::Foundation::HWND, String> {
    let handle = window.raw_window_handle();
    match handle {
        raw_window_handle::RawWindowHandle::Win32(win) => {
            let child = win.hwnd as windows_sys::Win32::Foundation::HWND;
            Ok(unsafe {
                windows_sys::Win32::UI::WindowsAndMessaging::GetAncestor(
                    child,
                    windows_sys::Win32::UI::WindowsAndMessaging::GA_ROOT,
                )
            })
        }
        _ => Err("Not a Windows window".into()),
    }
}

fn show_on_root(window: &tauri::Window, cmd: std::ffi::c_int) -> Result<(), String> {
    let hwnd = get_hwnds(window)?;
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(hwnd, cmd);
    }
    Ok(())
}

#[tauri::command]
fn tb_minimize(window: tauri::Window) -> Result<(), String> {
    show_on_root(&window, windows_sys::Win32::UI::WindowsAndMessaging::SW_MINIMIZE)
}

#[tauri::command]
fn tb_maximize(window: tauri::Window) -> Result<(), String> {
    let hwnd = get_hwnds(&window)?;
    unsafe {
        let style = windows_sys::Win32::UI::WindowsAndMessaging::GetWindowLongW(
            hwnd,
            windows_sys::Win32::UI::WindowsAndMessaging::GWL_STYLE,
        );
        let is_max = (style as u32 & windows_sys::Win32::UI::WindowsAndMessaging::WS_MAXIMIZE) != 0;
        let cmd = if is_max {
            windows_sys::Win32::UI::WindowsAndMessaging::SW_RESTORE
        } else {
            windows_sys::Win32::UI::WindowsAndMessaging::SW_MAXIMIZE
        };
        windows_sys::Win32::UI::WindowsAndMessaging::ShowWindow(hwnd, cmd);
    }
    Ok(())
}

#[tauri::command]
fn tb_is_maximized(window: tauri::Window) -> Result<bool, String> {
    let hwnd = get_hwnds(&window)?;
    unsafe {
        let style = windows_sys::Win32::UI::WindowsAndMessaging::GetWindowLongW(
            hwnd,
            windows_sys::Win32::UI::WindowsAndMessaging::GWL_STYLE,
        );
        Ok((style as u32 & windows_sys::Win32::UI::WindowsAndMessaging::WS_MAXIMIZE) != 0)
    }
}

#[tauri::command]
fn tb_close(window: tauri::Window) -> Result<(), String> {
    let hwnd = get_hwnds(&window)?;
    unsafe {
        windows_sys::Win32::UI::WindowsAndMessaging::SendMessageW(
            hwnd,
            windows_sys::Win32::UI::WindowsAndMessaging::WM_CLOSE,
            0,
            0,
        );
    }
    Ok(())
}

// ── Metadata identification ──

#[tauri::command]
fn pick_folder() -> Result<Option<String>, String> {
    let path = tauri::api::dialog::blocking::FileDialogBuilder::new()
        .pick_folder();
    Ok(path.map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
fn scan_library(db: tauri::State<db::Database>, path: String) -> Result<Vec<scanner::ScannedFile>, String> {
    let files = scanner::scan_folder(std::path::Path::new(&path))?;
    for f in &files {
        db.upsert_file(
            &f.path, f.size, f.modified, &f.audio_hash,
            &f.display_title, &f.display_artist,
            f.display_album.as_deref(),
            f.display_cover_path.as_deref(),
            &f.display_source,
        )?;
    }
    Ok(files)
}

#[tauri::command]
fn identify_next(db: tauri::State<db::Database>, acoustid_key: String, paths: tauri::State<AppPaths>) -> Result<Option<metadata::IdentificationResult>, String> {
    // Priority: pending files first, then needs_review
    let file = match db.get_pending_files()?.into_iter().next() {
        Some(f) => f,
        None => match db.get_needs_review_files()?.into_iter().next() {
            Some(f) => f,
            None => return Ok(None),
        },
    };

    db.update_file_attempt(file.id)?;

    let covers_dir = paths.covers_dir.to_string_lossy().to_string();
    match metadata::identify_file(&db, file.id, &file.path, &acoustid_key, &file.audio_hash, &covers_dir) {
        Ok(r) => Ok(Some(r)),
        Err(e) => {
            db.update_file_error(file.id, &e)?;
            Ok(Some(metadata::IdentificationResult {
                file_id: file.id,
                path: file.path,
                success: false,
                title: String::new(),
                artist: String::new(),
                album: None,
                year: None,
                genre: None,
                duration: None,
                cover_data_base64: None,
                cover_mime: None,
                cover_path: None,
                method: String::new(),
                confidence: None,
                error: Some(e),
                fallback_reason: None,
                reliability: "low".into(),
                title_similarity: 0.0,
                artist_similarity: 0.0,
                final_score: 0.0,
                is_trusted: false,
                suspected_swapped: false,
            }))
        }
    }
}

#[tauri::command]
fn get_scan_stats(db: tauri::State<db::Database>) -> Result<(i64, i64, i64, i64), String> {
    db.get_stats()
}

#[tauri::command]
fn get_pending_ids(db: tauri::State<db::Database>) -> Result<Vec<db::FileEntry>, String> {
    db.get_pending_files()
}

#[tauri::command]
fn retry_failed(db: tauri::State<db::Database>) -> Result<usize, String> {
    db.reset_failed_files()
}

#[tauri::command]
fn identify_single_file(db: tauri::State<db::Database>, path: String, acoustid_key: String, paths: tauri::State<AppPaths>) -> Result<metadata::IdentificationResult, String> {
    let file_id = db.mark_file_pending_by_path(&path)?;
    let file = db.get_file_entry(file_id)?;
    let covers_dir = paths.covers_dir.to_string_lossy().to_string();
    metadata::identify_file(&db, file.id, &file.path, &acoustid_key, &file.audio_hash, &covers_dir)
}

#[tauri::command]
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Read file: {}", e))
}

#[tauri::command]
fn fetch_song_cover(title: String, artist: String, paths: tauri::State<AppPaths>) -> Result<Option<(String, String)>, String> {
    let covers_dir = paths.covers_dir.to_string_lossy().to_string();
    match metadata::fetch_and_save_manual_cover(&title, &artist, &covers_dir) {
        Ok(Some((data, mime, _path))) => {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
            Ok(Some((b64, mime)))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn save_yt_thumbnail(thumbnail_url: String, title: String, artist: String, paths: tauri::State<AppPaths>) -> Result<Option<(String, String, String)>, String> {
    let covers_dir = paths.covers_dir.to_string_lossy().to_string();
    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .user_agent("LumiTune/1.0")
        .build().map_err(|e| format!("Client: {}", e))?;
    let resp = client.get(&thumbnail_url).send().map_err(|e| format!("Fetch thumbnail: {}", e))?;
    let bytes = resp.bytes().map_err(|e| format!("Read thumbnail: {}", e))?;
    let mime = if thumbnail_url.ends_with(".png") { "image/png" } else { "image/jpeg" };
    let _path = metadata::save_raw_cover_to_dir(&title, &artist, &bytes, mime, &covers_dir);
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &bytes);
    let ext = if mime.contains("png") { "png" } else { "jpg" };
    let key = format!("yt_{:x}.{}", metadata::metadata_hash(&title, &artist), ext);
    Ok(Some((b64, mime.to_string(), key)))
}

#[tauri::command]
fn save_custom_cover(data: String, mime: String, title: String, artist: String, paths: tauri::State<AppPaths>) -> Result<Option<(String, String, String)>, String> {
    let bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &data)
        .map_err(|e| format!("base64 decode: {}", e))?;
    let covers_dir = paths.covers_dir.to_string_lossy().to_string();
    let _path = metadata::save_raw_cover_to_dir(&title, &artist, &bytes, &mime, &covers_dir);
    let ext = if mime.contains("png") { "png" } else if mime.contains("webp") { "webp" } else { "jpg" };
    let key = format!("yt_{:x}.{}", metadata::metadata_hash(&title, &artist), ext);
    Ok(Some((data, mime, key)))
}

#[tauri::command]
fn search_deezer_cover(title: String, artist: String, index: usize) -> Result<Vec<metadata::DeezerMatch>, String> {
    metadata::search_deezer(&title, &artist, 25, index)
}

#[tauri::command]
fn pick_deezer_cover(cover_url: String, title: String, artist: String, paths: tauri::State<AppPaths>) -> Result<Option<(String, String, String)>, String> {
    let covers_dir = paths.covers_dir.to_string_lossy().to_string();
    match metadata::download_deezer_cover(&cover_url, &title, &artist, &covers_dir) {
        Ok(Some((data, mime))) => {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
            let ext = if mime.contains("png") { "png" } else if mime.contains("webp") { "webp" } else { "jpg" };
            let key = format!("yt_{:x}.{}", metadata::metadata_hash(&title, &artist), ext);
            Ok(Some((b64, mime, key)))
        }
        Ok(None) => Ok(None),
        Err(e) => Err(e),
    }
}

#[tauri::command]
fn read_cover(key: String, paths: tauri::State<AppPaths>) -> Result<Option<(String, String)>, String> {
    let path = paths.covers_dir.join(&key);
    if !path.exists() { return Ok(None); }
    let data = std::fs::read(&path).map_err(|e| format!("Read cover: {}", e))?;
    let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("jpg");
    let mime = match ext { "png" => "image/png", "webp" => "image/webp", _ => "image/jpeg" };
    let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
    Ok(Some((b64, mime.to_string())))
}

#[tauri::command]
fn extract_file_cover(path: String) -> Result<Option<(String, String)>, String> {
    let tags = metadata::read_id3(&path).map_err(|e| format!("Read ID3: {}", e))?;
    match (tags.cover_data, tags.cover_mime) {
        (Some(data), Some(mime)) => {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
            Ok(Some((b64, mime)))
        }
        _ => Ok(None),
    }
}

#[tauri::command]
fn batch_get_covers(db: tauri::State<db::Database>, paths: Vec<String>) -> Result<Vec<(String, String, String)>, String> {
    let results = db.get_covers_by_paths(&paths)?;
    let encoded: Vec<(String, String, String)> = results.into_iter()
        .map(|(path, data, mime)| {
            let b64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
            (path, b64, mime)
        })
        .collect();
    Ok(encoded)
}

// ── Worker queue commands ──

#[tauri::command]
fn start_queue(queue: tauri::State<worker::WorkerQueue>, acoustid_key: String, concurrency: u8) -> Result<(), String> {
    let c = concurrency.max(1).min(8) as usize;
    queue.start(acoustid_key, c)
}

#[tauri::command]
fn stop_queue(queue: tauri::State<worker::WorkerQueue>) -> Result<(), String> {
    queue.stop();
    Ok(())
}

#[tauri::command]
fn pause_queue(queue: tauri::State<worker::WorkerQueue>) -> Result<(), String> {
    queue.pause();
    Ok(())
}

#[tauri::command]
fn resume_queue(queue: tauri::State<worker::WorkerQueue>) -> Result<(), String> {
    queue.resume();
    Ok(())
}

#[tauri::command]
fn get_queue_status(queue: tauri::State<worker::WorkerQueue>) -> Result<worker::QueueStatus, String> {
    Ok(queue.status())
}

#[tauri::command]
fn drain_processed(queue: tauri::State<worker::WorkerQueue>) -> Result<Vec<metadata::IdentificationResult>, String> {
    Ok(queue.drain_processed())
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app.path_resolver().app_data_dir()
                .ok_or_else(|| "Failed to resolve app data dir".to_string())?;
            std::fs::create_dir_all(&app_dir)
                .map_err(|e| format!("Create app dir: {}", e))?;
            let db_path = app_dir.join("lumitune.db");
            let database = db::Database::open(&db_path)
                .map_err(|e| format!("Failed to open DB: {}", e))?;
            let worker_db = db::Database::open(&db_path)
                .map_err(|e| format!("Failed to open worker DB: {}", e))?;
            app.manage(database);

            let covers_dir = app_dir.join("covers");
            std::fs::create_dir_all(&covers_dir).ok();
            let downloads_dir = app_dir.join("downloads");
            std::fs::create_dir_all(&downloads_dir).ok();
            app.manage(AppPaths { covers_dir: covers_dir.clone(), downloads_dir: downloads_dir.clone() });

            let queue = worker::WorkerQueue::new(worker_db, covers_dir.to_string_lossy().to_string());
            app.manage(queue);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            yt_info, yt_download, yt_download_mp3, yt_download_file,
            tb_minimize, tb_maximize, tb_close, tb_is_maximized,
            scan_library, identify_next, identify_single_file, get_scan_stats, get_pending_ids, pick_folder, read_file_bytes, read_cover, fetch_song_cover, save_yt_thumbnail, extract_file_cover, batch_get_covers, retry_failed,
            search_deezer_cover, pick_deezer_cover, save_custom_cover,
            start_queue, stop_queue, pause_queue, resume_queue, get_queue_status, drain_processed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
