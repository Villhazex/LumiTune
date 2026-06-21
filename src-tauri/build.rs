fn main() {
    #[cfg(windows)]
    fix_windows_sdk_path();
    tauri_build::build()
}

#[cfg(windows)]
fn fix_windows_sdk_path() {
    let kits = r"C:\Program Files (x86)\Windows Kits\10\bin";
    let rc_dir = std::path::Path::new(kits);
    if !rc_dir.exists() {
        return;
    }
    let mut dirs: Vec<std::ffi::OsString> = std::fs::read_dir(kits)
        .into_iter()
        .flat_map(|r| r)
        .filter_map(|e| {
            let e = e.ok()?;
            let name = e.file_name();
            let p = rc_dir.join(&name).join("x64");
            if p.join("rc.exe").exists() {
                Some(name)
            } else {
                None
            }
        })
        .collect();
    dirs.sort();
    if let Some(latest) = dirs.last() {
        let rc_path = format!("{}\\{}\\x64", kits, latest.to_string_lossy());
        let cur = std::env::var("PATH").unwrap_or_default();
        let cleaned: Vec<_> = cur.split(';').filter(|s| !s.contains('\0')).collect();
        let mut new = rc_path;
        if !cleaned.is_empty() {
            new.push(';');
            new.push_str(&cleaned.join(";"));
        }
        std::env::set_var("PATH", &new);
    }
}
