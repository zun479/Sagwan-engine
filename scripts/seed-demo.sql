-- 개발용 샘플 데이터 (실제 스트리머 이름 없이). 운영 DB에는 넣지 않는다.
UPDATE site SET name = '샘플 스트리머' WHERE id = 1;
INSERT INTO genres (name) VALUES ('플랫포머'), ('협동'), ('샌드박스'), ('힐링');
INSERT INTO tags (name) VALUES ('분노유발'), ('장기방송'), ('합방'), ('공포');
INSERT INTO games (slug, title, description, released, platforms, genre_id, status, created_at, updated_at) VALUES
  ('getting-over-it', 'Getting Over It', '항아리에 들어간 남자가 망치 하나로 산을 오르는 게임.', '2017-12', 'PC, 모바일', 1, 'verified', unixepoch(), unixepoch()),
  ('lethal-company', 'Lethal Company', '동료들과 폐허에서 고철을 모으는 협동 공포 게임.', '2023-10', 'PC', 2, 'verified', unixepoch(), unixepoch()),
  ('only-up', 'Only Up!', '끝없이 위로만 올라가는 게임.', '2023-06', 'PC', 1, 'pending', unixepoch(), unixepoch());
INSERT INTO plays (game_id, first_played_at, comment) VALUES (1, 1709337600, '다시는 안 한다'), (2, 1705708800, '');
INSERT INTO game_tags VALUES (1, 1), (1, 2), (2, 3), (2, 4), (3, 1);
INSERT INTO memes (slug, title, description, status, created_at, updated_at) VALUES
  ('one-more', '한 칸만 더', '무리인 걸 알면서도 딱 한 번만 더 해보겠다는 다짐.', 'verified', unixepoch(), unixepoch());
INSERT INTO meme_games VALUES (1, 1);
INSERT INTO banned_words (word, created_at) VALUES ('스팸광고', unixepoch());
