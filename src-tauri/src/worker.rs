use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use crate::db::{Database, FileEntry};
use crate::metadata::{self, IdentificationResult};

#[derive(Debug, Clone, serde::Serialize)]
pub struct QueueStatus {
    pub running: bool,
    pub paused: bool,
    pub completed: usize,
    pub total: usize,
    pub errors: Vec<String>,
    pub current: Vec<String>,
    pub processed: Vec<IdentificationResult>,
}

pub struct WorkerQueue {
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    completed: Arc<Mutex<usize>>,
    errors: Arc<Mutex<Vec<String>>>,
    current: Arc<Mutex<Vec<String>>>,
    processed: Arc<Mutex<Vec<IdentificationResult>>>,
    handles: Arc<Mutex<Vec<thread::JoinHandle<()>>>>,
    alive_workers: Arc<AtomicUsize>,
    db: Arc<Database>,
    covers_dir: String,
}

const MAX_IDLE_ROUNDS: u32 = 5;

fn count_total(db: &Database) -> usize {
    let p = db.get_pending_files().ok().map(|v| v.len()).unwrap_or(0);
    let r = db.get_needs_review_files().ok().map(|v| v.len()).unwrap_or(0);
    p + r
}

fn count_processing(db: &Database) -> usize {
    db.count_processing().unwrap_or(0)
}

impl WorkerQueue {
    pub fn new(db: Database, covers_dir: String) -> Self {
        WorkerQueue {
            running: Arc::new(AtomicBool::new(false)),
            paused: Arc::new(AtomicBool::new(false)),
            completed: Arc::new(Mutex::new(0)),
            errors: Arc::new(Mutex::new(Vec::new())),
            current: Arc::new(Mutex::new(Vec::new())),
            processed: Arc::new(Mutex::new(Vec::new())),
            handles: Arc::new(Mutex::new(Vec::new())),
            alive_workers: Arc::new(AtomicUsize::new(0)),
            db: Arc::new(db),
            covers_dir,
        }
    }

    pub fn start(&self, acoustid_key: String, concurrency: usize) -> Result<(), String> {
        if self.running.load(Ordering::Relaxed) {
            return Err("Queue already running".into());
        }

        self.running.store(true, Ordering::Relaxed);
        self.paused.store(false, Ordering::Relaxed);
        *self.completed.lock().unwrap() = 0;
        self.errors.lock().unwrap().clear();
        self.current.lock().unwrap().clear();
        self.processed.lock().unwrap().clear();

        // Reset any stale processing files
        self.db.reset_stale_processing().ok();

        let running = self.running.clone();
        let paused = self.paused.clone();
        let completed = self.completed.clone();
        let errors = self.errors.clone();
        let current = self.current.clone();
        let processed = self.processed.clone();
        let alive = self.alive_workers.clone();
        let db = self.db.clone();
        let covers_dir = self.covers_dir.clone();

        self.alive_workers.store(concurrency, Ordering::Relaxed);

        let mut handles = self.handles.lock().unwrap();
        handles.clear();
        for _ in 0..concurrency {
            let r = running.clone();
            let p = paused.clone();
            let c = completed.clone();
            let e = errors.clone();
            let cur = current.clone();
            let pr = processed.clone();
            let a = alive.clone();
            let db = db.clone();
            let key = acoustid_key.clone();
            let covers = covers_dir.clone();
            let handle = thread::spawn(move || {
                worker_loop(r, p, c, e, cur, pr, a, db, key, covers);
            });
            handles.push(handle);
        }
        Ok(())
    }

    pub fn stop(&self) {
        self.running.store(false, Ordering::Relaxed);
        self.paused.store(false, Ordering::Relaxed);
        let mut handles = self.handles.lock().unwrap();
        for h in handles.drain(..) {
            let _ = h.join();
        }
    }

    pub fn pause(&self) {
        self.paused.store(true, Ordering::Relaxed);
    }

    pub fn resume(&self) {
        self.paused.store(false, Ordering::Relaxed);
    }

    pub fn status(&self) -> QueueStatus {
        let completed = *self.completed.lock().unwrap();
        let in_flight = self.current.lock().unwrap().len();
        let processing_count = count_processing(&self.db);
        let remaining = count_total(&self.db);
        let alive = self.alive_workers.load(Ordering::Relaxed);
        QueueStatus {
            running: alive > 0 && self.running.load(Ordering::Relaxed),
            paused: self.paused.load(Ordering::Relaxed),
            completed,
            total: completed + in_flight + remaining + processing_count,
            errors: self.errors.lock().unwrap().clone(),
            current: self.current.lock().unwrap().clone(),
            processed: self.processed.lock().unwrap().clone(),
        }
    }

    pub fn drain_processed(&self) -> Vec<IdentificationResult> {
        let mut p = self.processed.lock().unwrap();
        let mut results = Vec::new();
        std::mem::swap(&mut results, &mut p);
        results
    }
}

fn worker_loop(
    running: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    completed: Arc<Mutex<usize>>,
    errors: Arc<Mutex<Vec<String>>>,
    current: Arc<Mutex<Vec<String>>>,
    processed: Arc<Mutex<Vec<IdentificationResult>>>,
    alive_workers: Arc<AtomicUsize>,
    db: Arc<Database>,
    acoustid_key: String,
    covers_dir: String,
) {
    let mut idle = 0u32;
    while running.load(Ordering::Relaxed) {
        if paused.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(100));
            continue;
        }

        let file = match get_next_file(&db) {
            Ok(Some(f)) => {
                idle = 0;
                f
            }
            Ok(None) => {
                idle += 1;
                if idle >= MAX_IDLE_ROUNDS {
                    break;
                }
                thread::sleep(Duration::from_secs(2));
                continue;
            }
            Err(_) => {
                thread::sleep(Duration::from_secs(1));
                continue;
            }
        };

        // Try to claim atomically — skip if another worker grabbed it
        match db.claim_file(file.id) {
            Ok(true) => {}
            Ok(false) => continue,
            Err(_) => continue,
        }

        // Register in current set
        let path = file.path.clone();
        current.lock().unwrap().push(path.clone());

        // Process
        db.update_file_status(file.id, "processing").ok();
        match metadata::identify_file(&db, file.id, &path, &acoustid_key, &file.audio_hash, &covers_dir) {
            Ok(res) => {
                let mut c = completed.lock().unwrap();
                *c += 1;
                processed.lock().unwrap().push(res);
            }
            Err(e) => {
                db.update_file_error(file.id, &e).ok();
                errors.lock().unwrap().push(format!("{}: {}", path, e));
            }
        }

        // Remove from current
        current.lock().unwrap().retain(|p| *p != path);
    }

    alive_workers.fetch_sub(1, Ordering::Relaxed);
}

fn get_next_file(db: &Database) -> Result<Option<FileEntry>, String> {
    let pending = db.get_pending_files()?;
    if let Some(f) = pending.into_iter().next() {
        return Ok(Some(f));
    }
    let needs_review = db.get_needs_review_files()?;
    Ok(needs_review.into_iter().next())
}
