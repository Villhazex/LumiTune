use rusqlite::{Connection, params};
use std::path::Path;
use std::sync::Mutex;

pub struct Database {
    conn: Mutex<Connection>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct FileEntry {
    pub id: i64,
    pub path: String,
    pub size: i64,
    pub modified: i64,
    pub status: String,
    pub audio_hash: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MetadataEntry {
    pub id: i64,
    pub file_id: Option<i64>,
    pub fingerprint: Option<String>,
    pub source: String,
    pub title: String,
    pub artist: String,
    pub album: Option<String>,
    pub year: Option<i32>,
    pub genre: Option<String>,
    pub cover_data: Option<Vec<u8>>,
    pub cover_mime: Option<String>,
    pub cover_path: Option<String>,
    pub musicbrainz_id: Option<String>,
    pub acoustid_id: Option<String>,
    pub confidence: Option<f64>,
    pub title_similarity: Option<f64>,
    pub artist_similarity: Option<f64>,
    pub final_score: Option<f64>,
    pub is_trusted: Option<bool>,
    pub candidates_log: Option<String>,
}

impl Database {
    pub fn open(path: &Path) -> Result<Self, String> {
        let conn = Connection::open(path).map_err(|e| format!("DB open: {}", e))?;
        let db = Database { conn: Mutex::new(conn) };
        db.migrate()?;
        Ok(db)
    }

    fn migrate(&self) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;

        // Performance PRAGMAs
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")
            .map_err(|e| format!("DB pragma: {}", e))?;

        conn.execute_batch("
            CREATE TABLE IF NOT EXISTS files (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL UNIQUE,
                size        INTEGER NOT NULL DEFAULT 0,
                modified    INTEGER NOT NULL DEFAULT 0,
                status      TEXT NOT NULL DEFAULT 'pending',
                created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS metadata_cache (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                fingerprint   TEXT,
                source        TEXT NOT NULL DEFAULT 'unknown',
                title         TEXT NOT NULL DEFAULT '',
                artist        TEXT NOT NULL DEFAULT '',
                album         TEXT DEFAULT '',
                year          INTEGER DEFAULT NULL,
                genre         TEXT DEFAULT '',
                cover_data    BLOB DEFAULT NULL,
                cover_mime    TEXT DEFAULT NULL,
                musicbrainz_id TEXT DEFAULT NULL,
                acoustid_id   TEXT DEFAULT NULL,
                confidence    REAL DEFAULT NULL,
                created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now'))
            );
            CREATE TABLE IF NOT EXISTS identifications (
                file_id       INTEGER NOT NULL REFERENCES files(id),
                metadata_id   INTEGER NOT NULL REFERENCES metadata_cache(id),
                confidence    REAL DEFAULT NULL,
                method        TEXT NOT NULL DEFAULT 'fingerprint',
                auto_accept   INTEGER NOT NULL DEFAULT 0,
                created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
                PRIMARY KEY (file_id, metadata_id)
            );
            CREATE INDEX IF NOT EXISTS idx_files_status ON files(status);
            CREATE INDEX IF NOT EXISTS idx_files_path ON files(path);
            CREATE INDEX IF NOT EXISTS idx_meta_fingerprint ON metadata_cache(fingerprint);
        ").map_err(|e| format!("DB migrate: {}", e))?;

        // Migration: add columns if not exist (ignore errors if already added)
        for col in &[
            "ALTER TABLE files ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0",
            "ALTER TABLE files ADD COLUMN last_error TEXT DEFAULT NULL",
            "ALTER TABLE files ADD COLUMN last_attempt_at INTEGER DEFAULT NULL",
            "ALTER TABLE files ADD COLUMN audio_hash TEXT DEFAULT NULL",
        ] {
            conn.execute(*col, []).ok();
        }
        conn.execute("CREATE INDEX IF NOT EXISTS idx_files_audio_hash ON files(audio_hash)", []).ok();

        // Migration: cover_path column for disk-based cover storage
        conn.execute("ALTER TABLE metadata_cache ADD COLUMN cover_path TEXT DEFAULT NULL", []).ok();

        // Migration: Level 1 display metadata columns on files table
        conn.execute("ALTER TABLE files ADD COLUMN display_title TEXT NOT NULL DEFAULT ''", []).ok();
        conn.execute("ALTER TABLE files ADD COLUMN display_artist TEXT NOT NULL DEFAULT ''", []).ok();
        conn.execute("ALTER TABLE files ADD COLUMN display_album TEXT DEFAULT NULL", []).ok();
        conn.execute("ALTER TABLE files ADD COLUMN display_cover_path TEXT DEFAULT NULL", []).ok();
        conn.execute("ALTER TABLE files ADD COLUMN display_source TEXT NOT NULL DEFAULT 'filename'", []).ok();
        conn.execute("ALTER TABLE files ADD COLUMN metadata_source TEXT NOT NULL DEFAULT 'auto'", []).ok();

        // Migration: verification scoring columns on metadata_cache
        conn.execute("ALTER TABLE metadata_cache ADD COLUMN title_similarity REAL DEFAULT NULL", []).ok();
        conn.execute("ALTER TABLE metadata_cache ADD COLUMN artist_similarity REAL DEFAULT NULL", []).ok();
        conn.execute("ALTER TABLE metadata_cache ADD COLUMN final_score REAL DEFAULT NULL", []).ok();
        conn.execute("ALTER TABLE metadata_cache ADD COLUMN is_trusted INTEGER DEFAULT NULL", []).ok();
        conn.execute("ALTER TABLE metadata_cache ADD COLUMN candidates_log TEXT DEFAULT NULL", []).ok();

        Ok(())
    }

    pub fn upsert_file(&self, path: &str, size: i64, modified: i64, audio_hash: &str,
        display_title: &str, display_artist: &str, display_album: Option<&str>,
        display_cover_path: Option<&str>, display_source: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "INSERT INTO files (path, size, modified, status, retry_count, last_error, audio_hash,
                display_title, display_artist, display_album, display_cover_path, display_source)
             VALUES (?1, ?2, ?3, 'pending', 0, NULL, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(path) DO UPDATE SET
                size=excluded.size, modified=excluded.modified,
                status='pending', retry_count=0, last_error=NULL, audio_hash=excluded.audio_hash,
                display_title=excluded.display_title, display_artist=excluded.display_artist,
                display_album=excluded.display_album, display_cover_path=excluded.display_cover_path,
                display_source=excluded.display_source",
            params![path, size, modified, audio_hash,
                display_title, display_artist, display_album, display_cover_path, display_source],
        ).map_err(|e| format!("DB upsert file: {}", e))?;
        let id: i64 = conn.query_row(
            "SELECT id FROM files WHERE path = ?1", params![path],
            |r| r.get(0),
        ).map_err(|e| format!("DB get file id: {}", e))?;
        Ok(id)
    }

    pub fn update_file_status(&self, id: i64, status: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "UPDATE files SET status = ?1 WHERE id = ?2",
            params![status, id],
        ).map_err(|e| format!("DB update status: {}", e))?;
        Ok(())
    }

    pub fn update_file_attempt(&self, id: i64) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "UPDATE files SET status = 'processing', retry_count = retry_count + 1, last_attempt_at = strftime('%s','now') WHERE id = ?1",
            params![id],
        ).map_err(|e| format!("DB update attempt: {}", e))?;
        Ok(())
    }

    pub fn update_file_error(&self, id: i64, error: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "UPDATE files SET status = 'failed', last_error = ?1 WHERE id = ?2",
            params![error, id],
        ).map_err(|e| format!("DB update error: {}", e))?;
        Ok(())
    }

    pub fn claim_file(&self, id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let rows = conn.execute(
            "UPDATE files SET status = 'processing', retry_count = retry_count + 1, last_attempt_at = strftime('%s','now') WHERE id = ?1 AND (status = 'pending' OR status = 'needs_review')",
            params![id],
        ).map_err(|e| format!("DB claim: {}", e))?;
        Ok(rows > 0)
    }

    pub fn count_processing(&self) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let count: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'processing'", [], |r| r.get(0)
        ).unwrap_or(0);
        Ok(count as usize)
    }

    pub fn reset_stale_processing(&self) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        // Reset files stuck in 'processing' for more than 5 minutes
        let count = conn.execute(
            "UPDATE files SET status = 'pending' WHERE status = 'processing' AND last_attempt_at < strftime('%s','now') - 300",
            [],
        ).map_err(|e| format!("DB reset stale: {}", e))?;
        Ok(count)
    }

    pub fn get_needs_review_files(&self) -> Result<Vec<FileEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, path, size, modified, status, audio_hash FROM files WHERE status = 'needs_review' ORDER BY id"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let rows = stmt.query_map([], |r| {
            Ok(FileEntry {
                id: r.get(0)?,
                path: r.get(1)?,
                size: r.get(2)?,
                modified: r.get(3)?,
                status: r.get(4)?,
                audio_hash: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        }).map_err(|e| format!("DB query: {}", e))?;
        let mut files = Vec::new();
        for row in rows {
            files.push(row.map_err(|e| format!("DB row: {}", e))?);
        }
        Ok(files)
    }

    pub fn get_pending_file_by_path(&self, path: &str) -> Result<Option<FileEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, path, size, modified, status, audio_hash FROM files WHERE status = 'pending' AND path = ?1 LIMIT 1"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let rows = stmt.query_map(params![path], |r| {
            Ok(FileEntry {
                id: r.get(0)?,
                path: r.get(1)?,
                size: r.get(2)?,
                modified: r.get(3)?,
                status: r.get(4)?,
                audio_hash: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        }).map_err(|e| format!("DB query: {}", e))?;
        for row in rows {
            return Ok(Some(row.map_err(|e| format!("DB row: {}", e))?));
        }
        Ok(None)
    }

    pub fn get_pending_files(&self) -> Result<Vec<FileEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, path, size, modified, status, audio_hash FROM files WHERE status = 'pending' ORDER BY id"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let rows = stmt.query_map([], |r| {
            Ok(FileEntry {
                id: r.get(0)?,
                path: r.get(1)?,
                size: r.get(2)?,
                modified: r.get(3)?,
                status: r.get(4)?,
                audio_hash: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        }).map_err(|e| format!("DB query: {}", e))?;
        let mut files = Vec::new();
        for row in rows {
            files.push(row.map_err(|e| format!("DB row: {}", e))?);
        }
        Ok(files)
    }

    pub fn reset_failed_files(&self) -> Result<usize, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let count = conn.execute(
            "UPDATE files SET status = 'pending', retry_count = 0, last_error = NULL WHERE status IN ('failed', 'needs_review')",
            [],
        ).map_err(|e| format!("DB reset failed: {}", e))?;
        Ok(count)
    }

    pub fn cache_metadata(&self, entry: &MetadataEntry) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "INSERT INTO metadata_cache (fingerprint, source, title, artist, album, year, genre, cover_data, cover_mime, cover_path, musicbrainz_id, acoustid_id, confidence, title_similarity, artist_similarity, final_score, is_trusted, candidates_log)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)",
            params![
                entry.fingerprint, entry.source, entry.title, entry.artist,
                entry.album, entry.year, entry.genre, entry.cover_data,
                entry.cover_mime, entry.cover_path, entry.musicbrainz_id, entry.acoustid_id, entry.confidence,
                entry.title_similarity, entry.artist_similarity, entry.final_score, entry.is_trusted, entry.candidates_log,
            ],
        ).map_err(|e| format!("DB cache metadata: {}", e))?;
        let id: i64 = conn.last_insert_rowid();
        Ok(id)
    }

    pub fn link_identification(&self, file_id: i64, metadata_id: i64, confidence: Option<f64>, method: &str, auto_accept: bool) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "INSERT OR REPLACE INTO identifications (file_id, metadata_id, confidence, method, auto_accept)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![file_id, metadata_id, confidence, method, if auto_accept { 1 } else { 0 }],
        ).map_err(|e| format!("DB link: {}", e))?;
        Ok(())
    }

    pub fn find_by_fingerprint(&self, fp: &str) -> Result<Option<MetadataEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, fingerprint, source, title, artist, album, year, genre, cover_data, cover_mime, cover_path, musicbrainz_id, acoustid_id, confidence, title_similarity, artist_similarity, final_score, is_trusted, candidates_log
             FROM metadata_cache WHERE fingerprint = ?1 LIMIT 1"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let mut rows = stmt.query_map(params![fp], |r| {
            Ok(MetadataEntry {
                id: r.get(0)?,
                file_id: None,
                fingerprint: r.get(1)?,
                source: r.get(2)?,
                title: r.get(3)?,
                artist: r.get(4)?,
                album: r.get(5)?,
                year: r.get(6)?,
                genre: r.get(7)?,
                cover_data: r.get(8)?,
                cover_mime: r.get(9)?,
                cover_path: r.get(10)?,
                musicbrainz_id: r.get(11)?,
                acoustid_id: r.get(12)?,
                confidence: r.get(13)?,
                title_similarity: r.get(14)?,
                artist_similarity: r.get(15)?,
                final_score: r.get(16)?,
                is_trusted: r.get(17)?,
                candidates_log: r.get(18)?,
            })
        }).map_err(|e| format!("DB query: {}", e))?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }

    pub fn find_identified_by_audio_hash(&self, hash: &str) -> Result<Option<MetadataEntry>, String> {
        if hash.is_empty() {
            return Ok(None);
        }
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT m.id, m.fingerprint, m.source, m.title, m.artist, m.album, m.year, m.genre, m.cover_data, m.cover_mime, m.cover_path, m.musicbrainz_id, m.acoustid_id, m.confidence, m.title_similarity, m.artist_similarity, m.final_score, m.is_trusted, m.candidates_log
             FROM files f
             JOIN identifications i ON i.file_id = f.id
             JOIN metadata_cache m ON m.id = i.metadata_id
             WHERE f.audio_hash = ?1 AND f.status = 'identified'
             LIMIT 1"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let mut rows = stmt.query_map(params![hash], |r| {
            Ok(MetadataEntry {
                id: r.get(0)?,
                file_id: None,
                fingerprint: r.get(1)?,
                source: r.get(2)?,
                title: r.get(3)?,
                artist: r.get(4)?,
                album: r.get(5)?,
                year: r.get(6)?,
                genre: r.get(7)?,
                cover_data: r.get(8)?,
                cover_mime: r.get(9)?,
                cover_path: r.get(10)?,
                musicbrainz_id: r.get(11)?,
                acoustid_id: r.get(12)?,
                confidence: r.get(13)?,
                title_similarity: r.get(14)?,
                artist_similarity: r.get(15)?,
                final_score: r.get(16)?,
                is_trusted: r.get(17)?,
                candidates_log: r.get(18)?,
            })
        }).map_err(|e| format!("DB query: {}", e))?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }

    pub fn get_display_metadata(&self, id: i64) -> Result<Option<(String, String, Option<String>, Option<String>, String, String)>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT display_title, display_artist, display_album, display_cover_path, display_source, metadata_source
             FROM files WHERE id = ?1"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let mut rows = stmt.query_map(params![id], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, Option<String>>(2)?,
                r.get::<_, Option<String>>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
            ))
        }).map_err(|e| format!("DB query: {}", e))?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }

    pub fn update_display_metadata(&self, id: i64, title: &str, artist: &str, source: &str) -> Result<(), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "UPDATE files SET display_title = ?1, display_artist = ?2, display_source = ?3 WHERE id = ?4 AND metadata_source != 'manual'",
            params![title, artist, source, id],
        ).map_err(|e| format!("DB update display: {}", e))?;
        Ok(())
    }

    pub fn get_file_metadata_source(&self, id: i64) -> Result<String, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let val: String = conn.query_row(
            "SELECT metadata_source FROM files WHERE id = ?1",
            params![id],
            |r| r.get(0),
        ).unwrap_or_else(|_| "auto".to_string());
        Ok(val)
    }

    pub fn get_file_entry(&self, id: i64) -> Result<FileEntry, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.query_row(
            "SELECT id, path, size, modified, status, audio_hash FROM files WHERE id = ?1",
            params![id],
            |r| Ok(FileEntry {
                id: r.get(0)?,
                path: r.get(1)?,
                size: r.get(2)?,
                modified: r.get(3)?,
                status: r.get(4)?,
                audio_hash: r.get::<_, Option<String>>(5)?.unwrap_or_default(),
            })
        ).map_err(|e| format!("DB get file: {}", e))
    }

    pub fn mark_file_pending_by_path(&self, path: &str) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let id: i64 = conn.query_row(
            "SELECT id FROM files WHERE path = ?1",
            params![path],
            |r| r.get(0),
        ).map_err(|e| format!("File not found in DB: {}", e))?;
        conn.execute(
            "UPDATE files SET status = 'pending', retry_count = 0, last_error = NULL, last_attempt_at = NULL WHERE id = ?1",
            params![id],
        ).map_err(|e| format!("DB update: {}", e))?;
        Ok(id)
    }

    pub fn get_stats(&self) -> Result<(i64, i64, i64, i64), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap_or(0);
        let identified: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'identified'", [], |r| r.get(0)
        ).unwrap_or(0);
        let needs_review: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'needs_review'", [], |r| r.get(0)
        ).unwrap_or(0);
        let failed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'failed'", [], |r| r.get(0)
        ).unwrap_or(0);
        Ok((total, identified, needs_review, failed))
    }

    /// Batch-get cover data from metadata_cache for given file paths.
    /// Returns Vec of (path, cover_data_bytes, cover_mime) where cover_data is found.
    pub fn get_covers_by_paths(&self, paths: &[String]) -> Result<Vec<(String, Vec<u8>, String)>, String> {
        if paths.is_empty() {
            return Ok(Vec::new());
        }
        let placeholders: Vec<String> = paths.iter().enumerate()
            .map(|(i, _)| format!("?{}", i + 1))
            .collect();
        let sql = format!(
            "SELECT f.path, m.cover_data, m.cover_mime
             FROM files f
             JOIN identifications i ON i.file_id = f.id
             JOIN metadata_cache m ON m.id = i.metadata_id
             WHERE m.cover_data IS NOT NULL
             AND f.path IN ({})",
            placeholders.join(",")
        );
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(&sql).map_err(|e| format!("DB prepare: {}", e))?;
        let params: Vec<&dyn rusqlite::types::ToSql> = paths.iter().map(|p| p as &dyn rusqlite::types::ToSql).collect();
        let rows = stmt.query_map(params.as_slice(), |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, Vec<u8>>(1)?,
                r.get::<_, String>(2)?,
            ))
        }).map_err(|e| format!("DB query: {}", e))?;
        let mut results = Vec::new();
        for row in rows {
            if let Ok(entry) = row {
                results.push(entry);
            }
        }
        Ok(results)
    }
}
