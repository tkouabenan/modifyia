export const schema = `
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, email TEXT UNIQUE, password_hash TEXT, name TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('guest','user','admin')),
 credits INTEGER NOT NULL DEFAULT 0 CHECK(credits >= 0), email_verified INTEGER NOT NULL DEFAULT 0,
 suspended INTEGER NOT NULL DEFAULT 0, stripe_customer_id TEXT UNIQUE, google_id TEXT UNIQUE,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS profiles (
 user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
 locale TEXT NOT NULL DEFAULT 'en', notifications INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_tokens (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 kind TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS video_uploads (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, kind TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL,
 storage_key TEXT NOT NULL UNIQUE, metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS character_assets (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES video_uploads(id) ON DELETE CASCADE,
 name TEXT NOT NULL, collection TEXT NOT NULL DEFAULT 'My characters', favorite INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS projects (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT NOT NULL, prompt TEXT NOT NULL DEFAULT '', source_id TEXT REFERENCES video_uploads(id) ON DELETE SET NULL,
 character_ids TEXT NOT NULL DEFAULT '[]', trim_start REAL NOT NULL DEFAULT 0,
 trim_end REAL NOT NULL DEFAULT 0, aspect TEXT NOT NULL DEFAULT 'original', audio TEXT NOT NULL DEFAULT 'preserve',
 status TEXT NOT NULL DEFAULT 'draft', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS generation_jobs (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 status TEXT NOT NULL CHECK(status IN ('queued','uploading','processing','completed','failed','cancelled')),
 stage TEXT NOT NULL, cost INTEGER NOT NULL CHECK(cost >= 0), duration REAL NOT NULL,
 input TEXT NOT NULL, provider_request_id TEXT, provider_status_url TEXT, provider_cancel_url TEXT,
 provider_output_url TEXT, source_url TEXT, image_urls TEXT,
 prepared_source_id TEXT REFERENCES video_uploads(id) ON DELETE SET NULL,
 lease_owner TEXT, lease_until TEXT, attempts INTEGER NOT NULL DEFAULT 0,
 error TEXT, refunded_at TEXT, started_at TEXT, completed_at TEXT,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS generated_videos (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
 job_id TEXT NOT NULL UNIQUE REFERENCES generation_jobs(id) ON DELETE CASCADE,
 asset_id TEXT NOT NULL REFERENCES video_uploads(id), created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subscriptions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stripe_subscription_id TEXT UNIQUE, plan TEXT NOT NULL, status TEXT NOT NULL,
 current_period_end TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS credit_transactions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 amount INTEGER NOT NULL, reason TEXT NOT NULL, reference_id TEXT UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS payment_transactions (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 stripe_event_id TEXT UNIQUE NOT NULL, amount INTEGER NOT NULL, currency TEXT NOT NULL,
 status TEXT NOT NULL, invoice_url TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS webhook_events (id TEXT PRIMARY KEY, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS provider_usage (
 id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES generation_jobs(id) ON DELETE CASCADE,
 event TEXT NOT NULL, duration REAL, estimated_cost_cents INTEGER, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS admin_audit_logs (
 id TEXT PRIMARY KEY, admin_id TEXT NOT NULL, action TEXT NOT NULL, target_id TEXT,
 details TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 message TEXT NOT NULL, read_at TEXT, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at TEXT NOT NULL);
CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_one_active_project ON generation_jobs(project_id) WHERE status IN ('queued','uploading','processing');
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_uploads_user ON video_uploads(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id, updated_at);
CREATE INDEX IF NOT EXISTS idx_characters_user ON character_assets(user_id);
CREATE INDEX IF NOT EXISTS idx_jobs_queue ON generation_jobs(status, lease_until, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_user ON generation_jobs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_credits_user ON credit_transactions(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at);
`;
