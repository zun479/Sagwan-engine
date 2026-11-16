import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseYouTube, parseTimestamp, embedUrl } from '../src/youtube.ts';

test('여러 형태의 유튜브 주소', () => {
  assert.deepEqual(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), { id: 'dQw4w9WgXcQ', startSec: 0 });
  assert.deepEqual(parseYouTube('https://youtu.be/dQw4w9WgXcQ?t=3735'), { id: 'dQw4w9WgXcQ', startSec: 3735 });
  assert.deepEqual(parseYouTube('https://www.youtube.com/shorts/dQw4w9WgXcQ'), { id: 'dQw4w9WgXcQ', startSec: 0 });
  assert.deepEqual(parseYouTube('https://www.youtube.com/live/dQw4w9WgXcQ?t=1h2m15s'), { id: 'dQw4w9WgXcQ', startSec: 3735 });
  assert.deepEqual(parseYouTube('https://m.youtube.com/watch?v=dQw4w9WgXcQ&t=45s'), { id: 'dQw4w9WgXcQ', startSec: 45 });
});

test('유튜브가 아니거나 ID가 이상하면 null', () => {
  assert.equal(parseYouTube('https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=short'), null);
  assert.equal(parseYouTube('https://www.youtube.com/watch?v=dQw4w9WgXcQ"><script>'), null);
  assert.equal(parseYouTube('javascript:alert(1)'), null);
});

test('시간 표기', () => {
  assert.equal(parseTimestamp('62m'), 3720);
  assert.equal(parseTimestamp('abc'), 0);
  assert.equal(parseTimestamp(null), 0);
});

test('nocookie 임베드 주소', () => {
  assert.equal(embedUrl({ id: 'dQw4w9WgXcQ', startSec: 90 }), 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?start=90');
});
