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
    pub musicbrainz_id: Option<String>,
    pub acoustid_id: Option<String>,
    pub confidence: Option<f64>,
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
        Ok(())
    }

    pub fn upsert_file(&self, path: &str, size: i64, modified: i64) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "INSERT INTO files (path, size, modified, status) VALUES (?1, ?2, ?3, 'pending')
             ON CONFLICT(path) DO UPDATE SET size=excluded.size, modified=excluded.modified, status='pending'",
            params![path, size, modified],
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

    pub fn get_pending_files(&self) -> Result<Vec<FileEntry>, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let mut stmt = conn.prepare(
            "SELECT id, path, size, modified, status FROM files WHERE status = 'pending' ORDER BY id"
        ).map_err(|e| format!("DB prepare: {}", e))?;
        let rows = stmt.query_map([], |r| {
            Ok(FileEntry {
                id: r.get(0)?,
                path: r.get(1)?,
                size: r.get(2)?,
                modified: r.get(3)?,
                status: r.get(4)?,
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
            "UPDATE files SET status = 'pending' WHERE status = 'failed'",
            [],
        ).map_err(|e| format!("DB reset failed: {}", e))?;
        Ok(count)
    }

    pub fn cache_metadata(&self, entry: &MetadataEntry) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        conn.execute(
            "INSERT INTO metadata_cache (fingerprint, source, title, artist, album, year, genre, cover_data, cover_mime, musicbrainz_id, acoustid_id, confidence)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
            params![
                entry.fingerprint, entry.source, entry.title, entry.artist,
                entry.album, entry.year, entry.genre, entry.cover_data,
                entry.cover_mime, entry.musicbrainz_id, entry.acoustid_id, entry.confidence,
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
            "SELECT id, fingerprint, source, title, artist, album, year, genre, cover_data, cover_mime, musicbrainz_id, acoustid_id, confidence
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
                musicbrainz_id: r.get(10)?,
                acoustid_id: r.get(11)?,
                confidence: r.get(12)?,
            })
        }).map_err(|e| format!("DB query: {}", e))?;
        match rows.next() {
            Some(Ok(entry)) => Ok(Some(entry)),
            _ => Ok(None),
        }
    }

    pub fn get_stats(&self) -> Result<(i64, i64, i64), String> {
        let conn = self.conn.lock().map_err(|e| format!("DB lock: {}", e))?;
        let total: i64 = conn.query_row("SELECT COUNT(*) FROM files", [], |r| r.get(0)).unwrap_or(0);
        let identified: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'identified'", [], |r| r.get(0)
        ).unwrap_or(0);
        let failed: i64 = conn.query_row(
            "SELECT COUNT(*) FROM files WHERE status = 'failed'", [], |r| r.get(0)
        ).unwrap_or(0);
        Ok((total, identified, failed))
    }
}
