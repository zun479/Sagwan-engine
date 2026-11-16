// 서버·화면이 같이 쓰는 타입과 상수.

export const MODULES = ['games', 'memes', 'fangames', 'gallery'] as const;
export type ModuleId = (typeof MODULES)[number];

export const MEDIA_KINDS = ['image', 'gif', 'mp3'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** origin=broadcast는 방송 발췌물. 라이선스 모드 전환 대상이 아니며 권리자 요청 시 즉시 삭제. */
export type MediaOrigin = 'original' | 'broadcast';

export type LicenseMode = 'cc-by-nc-sa' | 'cc-by-sa' | 'proprietary';
export type Role = 'super' | 'manager';

export const CONTRIBUTOR_TERMS_VERSION = '2026-11-v1';

export type HomeLayout = 'diagonal' | 'tiles' | 'cards' | 'list' | 'hero';

export interface HomeButton {
  label: string;
  /** 모듈 id 또는 외부 링크 id */
  target: { kind: 'module'; module: ModuleId } | { kind: 'external'; linkId: string };
  size: 'big' | 'half';
}

export interface ThemeConfig {
  headerColor: string;
  backgroundColor: string;
  accentColor: string;
  darkMode: 'light' | 'dark' | 'user';
  font: 'pretendard' | 'rounded' | 'pixel';
  footerText: string;
  home: {
    layout: HomeLayout;
    fill: 'gradient' | 'solid';
    color1: string;
    color2: string;
    art: 'mascot' | 'custom' | 'none';
    artMediaId: number | null;
    artOpacity: number;
    buttons: HomeButton[];
  };
}

export interface NavExternalLink {
  id: string;
  label: string;
  url: string;
  sortOrder: number;
  enabled: boolean;
}

export interface SiteConfig {
  theme: ThemeConfig;
  navExternalLinks: NavExternalLink[];
  license: { mode: LicenseMode; pendingMode: LicenseMode | null; effectiveAt: number | null };
  ads: { enabled: boolean };
  trustRules: { host: string; pathPrefix?: string }[];
  allowedMediaKinds: MediaKind[];
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  theme: {
    headerColor: '#C9D1DA',
    backgroundColor: '#FFFFFF',
    accentColor: '#0A47B8',
    darkMode: 'user',
    font: 'pretendard',
    footerText: '',
    home: {
      layout: 'diagonal',
      fill: 'gradient',
      color1: '#0A47B8',
      color2: '#C86DE5',
      art: 'mascot',
      artMediaId: null,
      artOpacity: 0.42,
      buttons: [],
    },
  },
  navExternalLinks: [],
  license: { mode: 'cc-by-nc-sa', pendingMode: null, effectiveAt: null },
  ads: { enabled: false },
  trustRules: [],
  allowedMediaKinds: ['image', 'gif', 'mp3'],
};
