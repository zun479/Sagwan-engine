-- Sagwan Engine 초기 스키마 (SQLite / Cloudflare D1)
-- 설치 1회 = 위키 1개. streamer_id 없음. 시간은 모두 Unix 초.

-- ───────────── 위키 기본 정보 ─────────────
CREATE TABLE site (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL,                        -- 스트리머(위키) 이름
  config TEXT NOT NULL DEFAULT '{}',         -- SiteConfig JSON (packages/shared/src/types.ts)
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE site_modules (
  module TEXT PRIMARY KEY CHECK (module IN ('games','memes','fangames','gallery')),
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES managers(id),
  updated_at INTEGER NOT NULL
);

CREATE TABLE legal_pages (
  slug TEXT PRIMARY KEY CHECK (slug IN ('terms','privacy')),
  body TEXT NOT NULL,
  updated_by INTEGER REFERENCES managers(id),
  updated_at INTEGER NOT NULL
);

-- ───────────── 운영자 (백업 제외 대상) ─────────────
CREATE TABLE managers (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,  -- 위키 사이트 로그인 아이디
  name TEXT NOT NULL,                            -- 표시 이름
  role TEXT NOT NULL CHECK (role IN ('super','manager')),
  password_hash TEXT NOT NULL,                   -- pbkdf2$sha256$100000$salt$hash
  auth_ref_hash TEXT UNIQUE,                     -- (선택) HMAC-SHA256(이메일)
  auth_ref_enc TEXT,                             -- (선택) AES-256-GCM(이메일)
  auth_ref_masked TEXT,                          -- (선택) zo***@gmail.com
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending_removal','resigned','handover_support')),
  last_active_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
-- 슈퍼 운영자는 정확히 1명
CREATE UNIQUE INDEX one_super ON managers(role) WHERE role = 'super';

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,                   -- SHA-256(세션 토큰). 원문은 저장 안 함
  manager_id INTEGER NOT NULL REFERENCES managers(id),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  manager_id INTEGER NOT NULL REFERENCES managers(id),
  created_by INTEGER NOT NULL REFERENCES managers(id),
  expires_at INTEGER NOT NULL,
  used_at INTEGER
);

CREATE TABLE manager_proposals (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('invite','remove','transfer_super','license_change')),
  target_manager_id INTEGER REFERENCES managers(id),
  candidate_name TEXT,
  candidate_username TEXT,
  candidate_password_hash TEXT,                  -- 임명 확정 시 계정 생성에 사용, 부결·만료 시 즉시 삭제
  payload_json TEXT NOT NULL DEFAULT '{}',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','expired','cancelled')),
  proposed_by INTEGER NOT NULL REFERENCES managers(id),
  effective_at INTEGER,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE manager_votes (
  proposal_id INTEGER NOT NULL REFERENCES manager_proposals(id),
  manager_id INTEGER NOT NULL REFERENCES managers(id),
  decision TEXT NOT NULL CHECK (decision IN ('approve','reject')),
  voted_at INTEGER NOT NULL,
  PRIMARY KEY (proposal_id, manager_id)
);

-- ───────────── 감사 로그 (해시 체인) ─────────────
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY,
  actor_manager_id INTEGER REFERENCES managers(id),
  action TEXT NOT NULL,
  target_info TEXT NOT NULL DEFAULT '',
  detail_json TEXT NOT NULL DEFAULT '{}',
  prev_hash TEXT NOT NULL UNIQUE,                 -- 같은 이전 해시에 두 행이 붙는 경쟁 상태를 DB가 거부
  hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);

-- ───────────── 차단 · 금칙어 · 속도 제한 ─────────────
CREATE TABLE ip_bans (
  id INTEGER PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  reason TEXT NOT NULL CHECK (length(reason) > 0),
  expires_at INTEGER,                            -- NULL = 영구
  created_by INTEGER NOT NULL REFERENCES managers(id),
  created_at INTEGER NOT NULL,
  lifted_at INTEGER,
  lifted_by INTEGER REFERENCES managers(id)
);
CREATE INDEX idx_ip_bans_active ON ip_bans(ip_hash) WHERE lifted_at IS NULL;

CREATE TABLE banned_words (
  id INTEGER PRIMARY KEY,
  word TEXT NOT NULL UNIQUE,                     -- normalizeForFilter() 결과로 저장
  created_by INTEGER REFERENCES managers(id),
  created_at INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  bucket TEXT NOT NULL,                          -- 예: write:<ip_hash>
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (bucket, window_start)
);

-- ───────────── 미디어 ─────────────
CREATE TABLE media (
  id INTEGER PRIMARY KEY,
  storage_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind IN ('image','gif','mp3')),
  mime TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL UNIQUE,
  duration_sec INTEGER,
  width INTEGER,
  height INTEGER,
  origin TEXT NOT NULL DEFAULT 'original' CHECK (origin IN ('original','broadcast')),
  status TEXT NOT NULL DEFAULT 'visible' CHECK (status IN ('visible','pending','removed')),
  uploader_ip_hash TEXT,
  uploaded_by INTEGER REFERENCES managers(id),
  created_at INTEGER NOT NULL
);

-- ───────────── 게임 사전 ─────────────
CREATE TABLE genres (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE tags (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE games (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  released TEXT NOT NULL DEFAULT '',
  platforms TEXT NOT NULL DEFAULT '',
  thumbnail_media_id INTEGER REFERENCES media(id),
  genre_id INTEGER REFERENCES genres(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','hidden')),
  current_revision_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE plays (
  id INTEGER PRIMARY KEY,
  game_id INTEGER NOT NULL UNIQUE REFERENCES games(id),
  first_played_at INTEGER,
  comment TEXT NOT NULL DEFAULT ''
);

CREATE TABLE videos (
  id INTEGER PRIMARY KEY,
  play_id INTEGER REFERENCES plays(id),
  meme_id INTEGER REFERENCES memes(id),
  youtube_id TEXT NOT NULL CHECK (length(youtube_id) = 11),
  start_sec INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE links (
  id INTEGER PRIMARY KEY,
  game_id INTEGER REFERENCES games(id),
  meme_id INTEGER REFERENCES memes(id),
  fangame_id INTEGER REFERENCES fangames(id),
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  link_class TEXT NOT NULL CHECK (link_class IN ('trusted','untrusted'))
);

CREATE TABLE game_tags (
  game_id INTEGER NOT NULL REFERENCES games(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (game_id, tag_id)
);

-- ───────────── 밈 사전 ─────────────
CREATE TABLE memes (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  origin_date INTEGER,
  media_id INTEGER REFERENCES media(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','hidden')),
  current_revision_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE meme_tags (
  meme_id INTEGER NOT NULL REFERENCES memes(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (meme_id, tag_id)
);

CREATE TABLE meme_games (
  meme_id INTEGER NOT NULL REFERENCES memes(id),
  game_id INTEGER NOT NULL REFERENCES games(id),
  PRIMARY KEY (meme_id, game_id)
);

-- ───────────── 리비전 ─────────────
CREATE TABLE revisions (
  id INTEGER PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('game','play','meme','fangame','gallery_item')),
  entity_id INTEGER NOT NULL,
  data TEXT NOT NULL,                            -- 변경 후 전체 스냅샷 JSON
  changed_fields TEXT NOT NULL,                  -- JSON 배열 → 파란색 표시
  summary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'applied' CHECK (status IN ('applied','reverted','patrolled')),
  ip_hash TEXT NOT NULL,
  manager_id INTEGER REFERENCES managers(id),
  base_revision_id INTEGER REFERENCES revisions(id), -- 편집 시작 시점 리비전 (충돌 검사)
  terms_version TEXT NOT NULL,                   -- 동의한 기여 약관 버전
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_rev_entity ON revisions(entity_type, entity_id, created_at DESC);
CREATE INDEX idx_rev_recent ON revisions(created_at DESC);

CREATE TABLE entity_media (
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  media_id INTEGER NOT NULL REFERENCES media(id),
  caption TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (entity_type, entity_id, media_id)
);

-- ───────────── 팬게임 보관소 ─────────────
CREATE TABLE fangames (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  game_id INTEGER REFERENCES games(id),
  thumbnail_media_id INTEGER REFERENCES media(id),
  origin_url TEXT,
  origin_link_class TEXT CHECK (origin_link_class IN ('trusted','untrusted')),
  origin_status TEXT NOT NULL DEFAULT 'unknown' CHECK (origin_status IN ('alive','dead','unknown')),
  preservation_status TEXT NOT NULL DEFAULT 'link_only' CHECK (preservation_status IN ('hosted','link_only','lost')),
  permission_status TEXT NOT NULL DEFAULT 'unknown' CHECK (permission_status IN ('permitted','public_release','unknown')),
  downloadable INTEGER NOT NULL DEFAULT 0,
  current_build_id INTEGER,
  released_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','hidden')),
  current_revision_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE fangame_tags (
  fangame_id INTEGER NOT NULL REFERENCES fangames(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (fangame_id, tag_id)
);

CREATE TABLE fangame_builds (
  id INTEGER PRIMARY KEY,
  fangame_id INTEGER NOT NULL REFERENCES fangames(id),
  version_label TEXT NOT NULL,
  storage_prefix TEXT NOT NULL,
  entry_path TEXT NOT NULL DEFAULT 'index.html',
  source_zip_key TEXT,
  total_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  uploaded_by INTEGER NOT NULL REFERENCES managers(id),
  created_at INTEGER NOT NULL
);

-- ───────────── 갤러리 (온라인 전시관) ─────────────
CREATE TABLE gallery_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  default_upload_policy TEXT NOT NULL DEFAULT 'staff_only' CHECK (default_upload_policy IN ('staff_only','approval'))
);

CREATE TABLE exhibitions (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  cover_media_id INTEGER REFERENCES media(id),
  upload_policy TEXT CHECK (upload_policy IN ('staff_only','approval')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE gallery_items (
  id INTEGER PRIMARY KEY,
  exhibition_id INTEGER REFERENCES exhibitions(id),
  media_id INTEGER NOT NULL REFERENCES media(id),
  thumb_media_id INTEGER REFERENCES media(id),
  title TEXT NOT NULL DEFAULT '',
  artist_name TEXT NOT NULL DEFAULT '미상',
  source_url TEXT,
  source_link_class TEXT CHECK (source_link_class IN ('trusted','untrusted')),
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','visible','rejected','removed')),
  reject_reason TEXT,
  submitted_by_ip_hash TEXT,
  reviewed_by INTEGER REFERENCES managers(id),
  reviewed_at INTEGER,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE TABLE gallery_item_tags (
  item_id INTEGER NOT NULL REFERENCES gallery_items(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (item_id, tag_id)
);

-- ───────────── 시청자 인증 퀴즈 ─────────────
CREATE TABLE quiz_questions (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('text','image_blank','audio_blank','choice')),
  prompt TEXT NOT NULL,
  media_id INTEGER REFERENCES media(id),
  answers TEXT NOT NULL,                         -- JSON 배열
  choices TEXT,                                  -- JSON 배열 (choice)
  difficulty INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  shown_count INTEGER NOT NULL DEFAULT 0,
  correct_count INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER REFERENCES managers(id),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE quiz_gate_settings (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  title TEXT,
  description TEXT,
  answer_placeholder TEXT,
  submit_label TEXT,
  wrong_message TEXT,
  success_message TEXT,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  cooldown_minutes INTEGER NOT NULL DEFAULT 10,
  pass_minutes INTEGER NOT NULL DEFAULT 0,
  updated_by INTEGER REFERENCES managers(id),
  updated_at INTEGER NOT NULL
);

CREATE TABLE quiz_challenges (
  id TEXT PRIMARY KEY,                           -- 랜덤 토큰
  question_id INTEGER NOT NULL REFERENCES quiz_questions(id),
  ip_hash TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_quiz_challenges_ip ON quiz_challenges(ip_hash, created_at DESC);

-- ───────────── 검색 (FTS5 trigram: 한국어 부분 일치) ─────────────
CREATE VIRTUAL TABLE games_fts USING fts5(title, description, content='games', content_rowid='id', tokenize='trigram');
CREATE TRIGGER games_ai AFTER INSERT ON games BEGIN
  INSERT INTO games_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER games_ad AFTER DELETE ON games BEGIN
  INSERT INTO games_fts(games_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER games_au AFTER UPDATE OF title, description ON games BEGIN
  INSERT INTO games_fts(games_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO games_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

CREATE VIRTUAL TABLE memes_fts USING fts5(title, description, content='memes', content_rowid='id', tokenize='trigram');
CREATE TRIGGER memes_ai AFTER INSERT ON memes BEGIN
  INSERT INTO memes_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;
CREATE TRIGGER memes_ad AFTER DELETE ON memes BEGIN
  INSERT INTO memes_fts(memes_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
END;
CREATE TRIGGER memes_au AFTER UPDATE OF title, description ON memes BEGIN
  INSERT INTO memes_fts(memes_fts, rowid, title, description) VALUES ('delete', old.id, old.title, old.description);
  INSERT INTO memes_fts(rowid, title, description) VALUES (new.id, new.title, new.description);
END;

-- ───────────── 기본값 ─────────────
INSERT INTO site (id, name, config, created_at, updated_at) VALUES (1, '새 위키', '{}', unixepoch(), unixepoch());
INSERT INTO gallery_settings (id, default_upload_policy) VALUES (1, 'staff_only');
INSERT INTO quiz_gate_settings (id, updated_at) VALUES (1, unixepoch());
INSERT INTO site_modules (module, enabled, sort_order, updated_at) VALUES
  ('games', 1, 0, unixepoch()), ('memes', 1, 1, unixepoch()), ('fangames', 1, 2, unixepoch()), ('gallery', 1, 3, unixepoch());
