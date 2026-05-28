#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;
use std::process::Command;
use serde::Serialize;

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

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![yt_info, yt_download, yt_download_mp3])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
