PRAGMA foreign_keys=ON;

CREATE TABLE IF NOT EXISTS qsos(
 id TEXT PRIMARY KEY,
 my_callsign TEXT NOT NULL,
 their_callsign TEXT NOT NULL,
 qso_datetime_utc TEXT NOT NULL,
 frequency_hz INTEGER,
 frequency_display TEXT,
 band TEXT,
 mode TEXT NOT NULL DEFAULT 'UNKNOWN',
 rst_sent TEXT,
 rst_received TEXT,
 my_qth TEXT,
 their_qth TEXT,
 my_grid TEXT,
 their_grid TEXT,
 my_equipment TEXT,
 their_equipment TEXT,
 my_antenna TEXT,
 their_antenna TEXT,
 my_power_w REAL,
 their_power_w REAL,
 notes TEXT,
 weather TEXT,
 their_weather TEXT,
 qsl_sent INTEGER NOT NULL DEFAULT 0 CHECK(qsl_sent IN(0,1)),
 qsl_sent_at TEXT,
 qsl_received INTEGER NOT NULL DEFAULT 0 CHECK(qsl_received IN(0,1)),
 qsl_received_at TEXT,
 is_public INTEGER NOT NULL DEFAULT 1 CHECK(is_public IN(0,1)),
 managed_by TEXT NOT NULL DEFAULT 'local' CHECK(managed_by IN('local','external')),
 fingerprint TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_qsos_public_time ON qsos(is_public,deleted_at,qso_datetime_utc DESC);
CREATE INDEX IF NOT EXISTS idx_qsos_my_call ON qsos(my_callsign,qso_datetime_utc DESC);
CREATE INDEX IF NOT EXISTS idx_qsos_their_call ON qsos(their_callsign,qso_datetime_utc DESC);
CREATE INDEX IF NOT EXISTS idx_qsos_mode_band ON qsos(mode,band);

CREATE TABLE IF NOT EXISTS qso_sources(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 qso_id TEXT NOT NULL,
 source TEXT NOT NULL,
 source_id TEXT NOT NULL,
 raw_json TEXT,
 first_seen_at TEXT NOT NULL,
 last_seen_at TEXT NOT NULL,
 UNIQUE(source,source_id),
 FOREIGN KEY(qso_id) REFERENCES qsos(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_qso_sources_qso ON qso_sources(qso_id);

CREATE TABLE IF NOT EXISTS sync_runs(
 id TEXT PRIMARY KEY,
 source TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN('running','success','failed')),
 started_at TEXT NOT NULL,
 finished_at TEXT,
 fetched_count INTEGER NOT NULL DEFAULT 0,
 inserted_count INTEGER NOT NULL DEFAULT 0,
 updated_count INTEGER NOT NULL DEFAULT 0,
 error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_time ON sync_runs(source,started_at DESC);

CREATE TABLE IF NOT EXISTS audit_logs(
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 action TEXT NOT NULL,
 entity_type TEXT NOT NULL,
 entity_id TEXT,
 detail_json TEXT,
 created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_time ON audit_logs(created_at DESC);
