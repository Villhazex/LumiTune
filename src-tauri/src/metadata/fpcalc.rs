use std::path::Path;
use std::process::Command;
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const FPCALC_NAME: &str = "fpcalc.exe";

fn fpcalc_bin() -> String {
    let candidates = [
        "resources/fpcalc.exe",
        "src-tauri/resources/fpcalc.exe",
        "../src-tauri/resources/fpcalc.exe",
    ];
    for p in &candidates {
        if Path::new(p).exists() {
            return p.to_string();
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for up in &[".", "..", "../..", "../../.."] {
                let c = dir.join(up).join("resources/fpcalc.exe");
                if c.exists() {
                    return c.to_string_lossy().to_string();
                }
            }
        }
    }
    FPCALC_NAME.to_string()
}

pub fn run_fpcalc(path: &str) -> Result<(String, i64), String> {
    let bin = fpcalc_bin();
    let arg_path = path.to_string();
    let (tx, rx) = mpsc::channel();
    thread::spawn(move || {
        tx.send(Command::new(&bin).args(["-length", "120", &arg_path]).output()).ok();
    });
    let out = rx.recv_timeout(Duration::from_secs(30))
        .map_err(|_| "fpcalc timeout (30s)".to_string())?
        .map_err(|e| format!("fpcalc run: {}", e))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("fpcalc: {}", &stderr[..500.min(stderr.len())]));
    }
    let stdout = String::from_utf8_lossy(&out.stdout);
    let mut fingerprint = String::new();
    let mut duration: i64 = 0;
    for line in stdout.lines() {
        if let Some(v) = line.strip_prefix("FINGERPRINT=") {
            fingerprint = v.to_string();
        } else if let Some(v) = line.strip_prefix("DURATION=") {
            duration = v.parse().unwrap_or(0);
        }
    }
    if fingerprint.is_empty() {
        return Err("No fingerprint generated".into());
    }
    Ok((fingerprint, duration))
}
