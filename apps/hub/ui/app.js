// Wiki Hub 화면. 토큰은 주소의 # 뒤에서 읽고 바로 지운다.
'use strict';
const TOKEN = location.hash.slice(1);
history.replaceState(null, '', '/');

let state = { infra: [], wikis: [] };

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: { 'X-Hub-Token': TOKEN, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || '요청 실패');
  return data;
}

const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const k of kids) if (k != null) e.append(k);
  return e;
};

// 입력한 만료일 기준 D-n. 날짜는 PC 현지 기준으로 센다.
function dday(expires) {
  const [y, m, d] = expires.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((end - today) / 86400000);
}

function dueLabel(b) {
  if (!b.expires) return b.autoRenew ? { text: '자동 연장', cls: '' } : { text: '만료일 지정되지 않음', cls: 'none' };
  const n = dday(b.expires);
  const prefix = b.autoRenew ? '자동 연장 · ' : '';
  if (n < 0) return { text: `${prefix}만료됨 (D+${-n})`, cls: 'none' };
  if (n === 0) return { text: `${prefix}오늘 만료 (D-day)`, cls: 'soon' };
  return { text: `${prefix}D-${n} · ${b.expires}`, cls: n <= 14 && !b.autoRenew ? 'soon' : '' };
}

function renderInfra() {
  const box = document.getElementById('blocks');
  box.replaceChildren();
  if (!state.infra.length) {
    box.append(el('p', { class: 'empty' }, '아직 블록이 없습니다. [블록 추가]로 쓰고 있는 서버·DB·도메인을 등록하세요.'));
    return;
  }
  for (const b of state.infra) {
    const due = dueLabel(b);
    const svc = serviceOf(b.kind);
    const block = el('button', {
      class: 'block',
      title: b.url || '주소 없음 (우클릭해서 추가)',
      onclick: async () => {
        if (!b.url) return openEdit(b);
        try { await api('/api/open', 'POST', { url: b.url }); } catch (e) { alert(e.message); }
      },
      oncontextmenu: (e) => { e.preventDefault(); openEdit(b); },
    },
      el('span', { class: 'kind' }, svc.id === 'other' ? '직접 입력' : svc.name),
      el('span', { class: 'name' }, b.name),
      el('span', { class: `due ${due.cls}` }, due.text),
    );
    block.style.background = serviceColor(svc); // CSSOM으로 지정 (CSP가 인라인 style 속성을 막음)
    box.append(block);
  }
}

function renderWikis() {
  const box = document.getElementById('wikis');
  box.replaceChildren();
  if (!state.wikis.length) {
    box.append(el('p', { class: 'empty' }, '이 PC에서 배포한 위키가 없습니다. 배포 마법사는 다음 버전에서 열립니다.'));
    return;
  }
  const list = el('div', { class: 'list' });
  for (const w of state.wikis) {
    list.append(el('div', { class: 'item' },
      el('div', { class: 'grow' }, el('div', {}, w.name), el('div', { class: 'meta' }, `${w.url} · 엔진 ${w.engineVersion || '?'}`)),
      el('button', { onclick: () => api('/api/open', 'POST', { url: w.url }).catch((e) => alert(e.message)) }, '사이트 열기'),
      el('button', { class: 'primary', disabled: '' }, '업데이트 배포'),
    ));
  }
  box.append(list);
}

async function renderReleases() {
  const box = document.getElementById('releases');
  box.replaceChildren(el('p', { class: 'empty' }, '불러오는 중…'));
  try {
    const rels = await api('/api/releases');
    box.replaceChildren();
    if (!rels.length) return box.append(el('p', { class: 'empty' }, '아직 공개된 버전이 없습니다.'));
    const list = el('div', { class: 'list' });
    for (const r of rels) {
      list.append(el('div', { class: 'item' },
        el('div', { class: 'grow' },
          el('div', {}, r.tag, r.prerelease ? el('span', { class: 'tag' }, '미리보기') : null, r === rels[0] ? el('span', { class: 'tag' }, '최신') : null),
          el('div', { class: 'meta' }, `${(r.published || '').slice(0, 10)} · 파일 ${r.assets.length}개`),
          r.body ? el('div', { class: 'notes' }, r.body.slice(0, 600)) : null),
        el('button', { onclick: () => api('/api/open', 'POST', { url: r.page }).catch((e) => alert(e.message)) }, '릴리스 보기'),
        el('button', { class: 'primary', disabled: '', title: '배포 마법사와 함께 열립니다' }, '위키에 적용'),
      ));
    }
    box.append(list);
  } catch (e) {
    box.replaceChildren(el('p', { class: 'empty' }, e.message));
  }
}

// ── 블록 편집 (우클릭) ──
const dlg = document.getElementById('edit');
const form = document.getElementById('edit-form');
let editing = null;

function fillKindSelect() {
  const sel = document.getElementById('kind');
  sel.replaceChildren();
  for (const c of CATEGORIES) {
    const g = el('optgroup', { label: c.name });
    for (const s of CATALOG.filter((x) => x.cat === c.id)) g.append(el('option', { value: s.id }, s.name));
    sel.append(g);
  }
}

function openEdit(b, preset) {
  editing = b;
  const svc = preset ?? (b ? serviceOf(b.kind) : serviceOf('other'));
  document.getElementById('edit-title').textContent = b ? '블록 편집' : `블록 추가 · ${svc.name}`;
  document.getElementById('del').hidden = !b;
  document.getElementById('edit-err').textContent = '';
  form.name.value = b?.name ?? (svc.id === 'other' || svc.id === 'domain' ? '' : svc.name);
  form.kind.value = svc.id;
  form.url.value = b?.url ?? svc.url;
  form.expires.value = b?.expires ?? '';
  form.autoRenew.checked = b?.autoRenew ?? false;
  dlg.showModal();
}

document.getElementById('save').addEventListener('click', async (e) => {
  e.preventDefault();
  try {
    const st = await api('/api/infra', 'PUT', {
      id: editing?.id ?? '', name: form.name.value, kind: form.kind.value,
      url: form.url.value.trim(), expires: form.expires.value, autoRenew: form.autoRenew.checked,
    });
    state = st;
    renderInfra();
    dlg.close();
    if (!editing) showTab('infra');
  } catch (err) {
    document.getElementById('edit-err').textContent = err.message;
  }
});
document.getElementById('del').addEventListener('click', async () => {
  if (!editing || !confirm(`'${editing.name}' 블록을 지울까요? (서비스 자체는 지워지지 않습니다)`)) return;
  state = await api(`/api/infra/${editing.id}`, 'DELETE');
  renderInfra();
  dlg.close();
});
document.getElementById('cancel').addEventListener('click', () => dlg.close());
document.getElementById('add-block').addEventListener('click', () => showTab('add'));
document.getElementById('back-infra').addEventListener('click', () => showTab('infra'));

// ── 서비스 추가 (목록형 선택 화면) ──
let cat = 'all';
function renderCatalog() {
  const q = document.getElementById('q').value.trim().toLowerCase();
  const cats = document.getElementById('cats');
  cats.replaceChildren(...[{ id: 'all', name: '전체' }, ...CATEGORIES].map((c) =>
    el('button', { role: 'tab', 'aria-selected': String(c.id === cat), class: c.id === cat ? 'on' : '', onclick: () => { cat = c.id; renderCatalog(); } }, c.name)));
  const box = document.getElementById('svc');
  box.replaceChildren();
  let shown = 0;
  for (const c of CATEGORIES) {
    if (cat !== 'all' && cat !== c.id) continue;
    const items = CATALOG.filter((s) => s.cat === c.id && (!q || s.name.toLowerCase().includes(q) || s.desc.toLowerCase().includes(q)));
    if (!items.length) continue;
    box.append(el('div', { class: 'sec' }, c.name, c.id === 'hosting' ? el('small', {}, '배포 지원 = 새 위키 설치에서 고를 수 있음') : null));
    for (const s of items) {
      const lo = el('span', { class: 'lo', 'aria-hidden': 'true' }, s.mono);
      if (s.color) lo.style.background = s.color; // 그 밖은 중립 회색 (목록이 한 색으로 뭉치지 않게)
      box.append(el('div', { class: s.id === 'other' ? 'svc custom' : 'svc' },
        lo,
        el('span', { class: 'tx' }, el('div', { class: 'nm' }, s.name, s.deploy ? el('span', { class: 'chip' }, '배포 지원') : null), el('div', { class: 'dc' }, s.desc)),
        el('button', { onclick: () => openEdit(null, s), 'aria-label': `${s.name} 추가` }, '추가'),
      ));
      shown++;
    }
  }
  if (!shown) box.append(el('p', { class: 'empty' }, '찾는 서비스가 없습니다. 맨 아래 [직접 입력]으로 추가하세요.'),
    el('div', { class: 'svc custom' }, el('span', { class: 'tx' }, el('div', { class: 'nm' }, '직접 입력')), el('button', { onclick: () => openEdit(null, serviceOf('other')) }, '추가')));
}
document.getElementById('q').addEventListener('input', renderCatalog);
document.getElementById('reload-rel').addEventListener('click', renderReleases);
document.getElementById('new-wiki').addEventListener('click', () => alert('배포 마법사는 다음 버전(0.2)에서 열립니다.'));

// ── 탭 ──
function showTab(tab) {
  const navTab = tab === 'add' ? 'infra' : tab;
  for (const b of document.querySelectorAll('.side nav button')) b.classList.toggle('active', b.dataset.tab === navTab);
  for (const s of document.querySelectorAll('.tab')) s.hidden = s.id !== `tab-${tab}`;
  if (tab === 'engines') renderReleases();
  if (tab === 'add') { cat = 'all'; document.getElementById('q').value = ''; renderCatalog(); document.getElementById('q').focus(); }
}
for (const btn of document.querySelectorAll('.side nav button')) btn.addEventListener('click', () => showTab(btn.dataset.tab));
fillKindSelect();

// 창이 열려 있다는 신호. 끊기면 Hub가 스스로 종료한다.
setInterval(() => api('/api/ping', 'POST', {}).catch(() => {}), 5000);
// 자정이 지나면 D-n 갱신
setInterval(renderInfra, 60 * 60 * 1000);

api('/api/state').then((d) => {
  state = d.state;
  document.getElementById('ver').textContent = `Wiki Hub ${d.version}`;
  renderInfra();
  renderWikis();
}).catch((e) => {
  document.body.textContent = `Wiki Hub를 다시 실행해 주세요. (${e.message})`;
});
