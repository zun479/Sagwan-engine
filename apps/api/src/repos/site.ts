import { DEFAULT_SITE_CONFIG, type SiteConfig } from '@sagwan/shared';
import type { DbAdapter } from '../db/types.ts';

export async function getSite(db: DbAdapter) {
  const row = await db.first<{ name: string; config: string }>('SELECT name, config FROM site WHERE id = 1');
  if (!row) return null;
  let saved: Partial<SiteConfig> = {};
  try {
    saved = JSON.parse(row.config) as Partial<SiteConfig>;
  } catch { /* 손상된 설정은 기본값으로 */ }
  const config: SiteConfig = { ...DEFAULT_SITE_CONFIG, ...saved, theme: { ...DEFAULT_SITE_CONFIG.theme, ...saved.theme } };
  const modules = await db.all<{ module: string; enabled: number; sort_order: number }>('SELECT module, enabled, sort_order FROM site_modules ORDER BY sort_order');
  return { name: row.name, config, modules: modules.map((m) => ({ id: m.module, enabled: m.enabled === 1 })) };
}

export async function isModuleEnabled(db: DbAdapter, module: string) {
  const r = await db.first<{ enabled: number }>('SELECT enabled FROM site_modules WHERE module = ?', module);
  return r?.enabled === 1;
}

export function saveConfig(db: DbAdapter, config: SiteConfig, now: number) {
  return db.run('UPDATE site SET config = ?, updated_at = ? WHERE id = 1', JSON.stringify(config), now);
}

export function setModule(db: DbAdapter, module: string, enabled: boolean, by: number, now: number) {
  return db.run('UPDATE site_modules SET enabled = ?, updated_by = ?, updated_at = ? WHERE module = ?', enabled, by, now, module);
}

export function getLegal(db: DbAdapter, slug: string) {
  return db.first<{ body: string; updated_at: number }>('SELECT body, updated_at FROM legal_pages WHERE slug = ?', slug);
}

export function setLegal(db: DbAdapter, slug: string, body: string, by: number, now: number) {
  return db.run(
    'INSERT INTO legal_pages (slug, body, updated_by, updated_at) VALUES (?,?,?,?) ON CONFLICT(slug) DO UPDATE SET body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at',
    slug, body, by, now,
  );
}
