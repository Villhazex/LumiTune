use std::fs::OpenOptions;
use std::io::Write;
use std::path::Path;
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

const FPCALC_NAME: &str = "fpcalc.exe";

fn fpcalc_log_path() -> String {
    let appdata = std::env::var("APPDATA").unwrap_or_else(|_| ".".into());
    format!(r"{}\com.lumitune.app\fpcalc-debug.log", appdata)
}

fn log_to_file(msg: &str) {
    let logpath = fpcalc_log_path();
    if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&logpath) {
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH).unwrap_or_default()
            .as_secs();
        let _ = writeln!(f, "[{}] {}", ts, msg);
    }
}

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

/// Hide the console window created for a spawned child process.
/// Attaches to the child's console, hides the window, then detaches.
#[cfg(windows)]
fn hide_child_console(child_pid: u32) {
    use windows_sys::Win32::System::Console::{AttachConsole, FreeConsole, GetConsoleWindow, SetStdHandle, STD_INPUT_HANDLE, STD_OUTPUT_HANDLE, STD_ERROR_HANDLE};
    use windows_sys::Win32::UI::WindowsAndMessaging::{ShowWindow, SW_HIDE};

    for _ in 0..50 {
        unsafe {
            if AttachConsole(child_pid) != 0 {
                let hwnd = GetConsoleWindow();
                if !hwnd.is_null() {
                    ShowWindow(hwnd, SW_HIDE);
                }
                FreeConsole();
                // Reset std handles — FreeConsole leaves them dangling
                SetStdHandle(STD_INPUT_HANDLE, std::ptr::null_mut());
                SetStdHandle(STD_OUTPUT_HANDLE, std::ptr::null_mut());
                SetStdHandle(STD_ERROR_HANDLE, std::ptr::null_mut());
                return;
            }
        }
        thread::sleep(Duration::from_millis(20));
    }
    log_to_file("hide_child_console: failed to AttachConsole after 50 tries");
}

#[cfg(not(windows))]
fn hide_child_console(_child_pid: u32) {}

pub fn run_fpcalc(path: &str) -> Result<(String, i64), String> {
    let bin = fpcalc_bin();
    log_to_file(&format!("run_fpcalc: bin={:?} path={:?}", bin, path));

    // Check if file exists
    if !Path::new(path).exists() {
        log_to_file("run_fpcalc: file does not exist");
        return Err(format!("fpcalc: file not found: {}", path));
    }

    let arg_path = path.to_string();
    let (tx, rx) = mpsc::channel();

    thread::spawn(move || {
        let mut cmd = Command::new(&bin);
        cmd.args(["-length", "120", &arg_path])
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        let child = match cmd.spawn() {
            Ok(c) => {
                log_to_file("spawn: ok");
                c
            }
            Err(e) => {
                log_to_file(&format!("spawn: error {:?}", e));
                tx.send(Err(e)).ok();
                return;
            }
        };

        let pid = child.id();
        log_to_file(&format!("spawn: pid={}", pid));
        let hide_h = thread::spawn(move || hide_child_console(pid));

        let result = child.wait_with_output();
        hide_h.join().ok();
        log_to_file("wait_with_output: done");
        tx.send(result).ok();
    });

    let out = match rx.recv_timeout(Duration::from_secs(30)) {
        Ok(v) => v,
        Err(_) => {
            log_to_file("recv_timeout: timeout (30s)");
            return Err("fpcalc timeout (30s)".to_string());
        }
    };

    let out = match out {
        Ok(v) => v,
        Err(e) => {
            log_to_file(&format!("fpcalc run error: {:?}", e));
            return Err(format!("fpcalc run: {}", e));
        }
    };

    log_to_file(&format!(
        "exit={:?} stdout_len={} stderr_len={}",
        out.status.code(),
        out.stdout.len(),
        out.stderr.len()
    ));

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        log_to_file(&format!("stderr: {}", &stderr[..500.min(stderr.len())]));
        return Err(format!("fpcalc: {}", &stderr[..500.min(stderr.len())]));
    }

    if !out.stderr.is_empty() {
        let s = String::from_utf8_lossy(&out.stderr);
        log_to_file(&format!("fpcalc warnings:\n{}", s));
    }

    let stdout = String::from_utf8_lossy(&out.stdout);
    log_to_file(&format!("stdout:\n{}", stdout));

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
        log_to_file("no fingerprint in output");
        return Err("No fingerprint generated".into());
    }

    log_to_file(&format!("success fingerprint={} duration={}", fingerprint.len(), duration));
    Ok((fingerprint, duration))
}
