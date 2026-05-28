#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;
mod metadata;
mod scanner;

use std::path::PathBuf;
use std::process::Command;
use serde::Serialize;
use tauri::Manager;

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
        "--prefer-free-formats", "--skip-download",
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
        db.upsert_file(&f.path, f.size, f.modified)?;
    }
    Ok(files)
}

#[tauri::command]
fn identify_next(db: tauri::State<db::Database>, acoustid_key: String) -> Result<Option<metadata::IdentificationResult>, String> {
    let pending = db.get_pending_files()?;
    let file = match pending.into_iter().next() {
        Some(f) => f,
        None => return Ok(None),
    };
    match metadata::identify_file(&db, file.id, &file.path, &acoustid_key) {
        Ok(r) => Ok(Some(r)),
        Err(e) => {
            db.update_file_status(file.id, "failed")?;
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
                method: String::new(),
                confidence: None,
                error: Some(e),
                fallback_reason: None,
            }))
        }
    }
}

#[tauri::command]
fn get_scan_stats(db: tauri::State<db::Database>) -> Result<(i64, i64, i64), String> {
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
fn read_file_bytes(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| format!("Read file: {}", e))
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
            app.manage(database);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            yt_info, yt_download, yt_download_mp3,
            tb_minimize, tb_maximize, tb_close, tb_is_maximized,
            scan_library, identify_next, get_scan_stats, get_pending_ids, pick_folder, read_file_bytes, retry_failed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
