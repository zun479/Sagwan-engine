// 슈퍼 운영자 계정 SQL을 만든다 (Wiki Hub 설치 단계와 "슈퍼 비밀번호 분실" 복구에 쓰임).
// 비밀번호는 명령줄 인자로 받지 않는다(셸 기록에 남음). 표준 입력 또는 SAGWAN_PASSWORD 환경변수.
//   echo -n '비밀번호' | node scripts/super-sql.ts <아이디> <표시이름> > super.sql
//   wrangler d1 execute DB --remote --file super.sql && rm super.sql
import { hashPassword } from '@sagwan/shared';

const [username, name] = process.argv.slice(2);
if (!username || !name || !/^[A-Za-z0-9_.-]{3,40}$/.test(username)) {
  console.error('사용법: node scripts/super-sql.ts <아이디(영문·숫자 3~40)> <표시이름>');
  process.exit(2);
}
let password = process.env.SAGWAN_PASSWORD ?? '';
if (!password) for await (const chunk of process.stdin) password += chunk;
password = password.replace(/\r?\n$/, '');

const hash = await hashPassword(password); // 10자 미만이면 여기서 오류
const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const now = Math.floor(Date.now() / 1000);
// 슈퍼가 이미 있으면 비밀번호만 다시 쓴다. 기존 세션은 모두 끊는다.
process.stdout.write(`INSERT INTO managers (username, name, role, password_hash, last_active_at, created_at)
VALUES (${q(username)}, ${q(name)}, 'super', ${q(hash)}, ${now}, ${now})
ON CONFLICT(username) DO UPDATE SET password_hash = excluded.password_hash, status = 'active';
DELETE FROM sessions WHERE manager_id = (SELECT id FROM managers WHERE username = ${q(username)});
`);
