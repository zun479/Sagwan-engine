import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 개발 중에는 /api 를 wrangler dev(8787)로 넘긴다. 배포 시에는 같은 도메인에서 Workers가 /api 를 받는다.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://127.0.0.1:8787' } },
  build: { sourcemap: false },
});
