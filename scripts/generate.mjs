// Terminal-style GitHub profile generator (animated SVG windows + README).
//   GH_USER=you GH_TOKEN=xxx node scripts/generate.mjs      (real data)
//   node scripts/generate.mjs --mock scripts/mock.json      (offline preview)
import fs from 'node:fs';
import path from 'node:path';

const MONO = "ui-monospace,SFMono-Regular,'JetBrains Mono',Menlo,Consolas,'Courier New',monospace";
const SANS = "'Segoe UI',system-ui,-apple-system,Helvetica,Arial,sans-serif";
const BG = '#0b1020', BAR = '#121829', LINE = '#27304f', MUTED = '#7d89b0', TXT = '#e6e9fa';
const CY = '#22d3ee', VI = '#a78bfa', PK = '#f472b6', GOLD = '#fbbf24';
const FALLBACK = ['#22d3ee', '#a78bfa', '#f472b6', '#fbbf24', '#34d399', '#60a5fa'];
const W = 900;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);
const num = (n) => Number(n).toLocaleString('en-US');
const rng = (seed) => { let s = seed; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; };
const hex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const lum = (h) => { const [r, g, b] = hex(h).map((v) => v / 255); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const mix = (h, t) => '#' + hex(h).map((v) => Math.round(v + (255 - v) * t).toString(16).padStart(2, '0')).join('');
const bright = (h) => (lum(h) < 0.35 ? mix(h, 0.45) : h);
const cfg = (() => { try { return JSON.parse(fs.readFileSync('profile.config.json', 'utf8')); } catch { return {}; } })();

// ------------------------------------------------------------------ data
const QUERY = `query($login:String!){ user(login:$login){
  name login bio avatarUrl followers{totalCount}
  pinnedItems(first:6,types:REPOSITORY){ nodes{ ... on Repository{ name url description stargazerCount pushedAt owner{login} primaryLanguage{ name color } } } }
  repositories(ownerAffiliations:OWNER,privacy:PUBLIC,first:100,orderBy:{field:PUSHED_AT,direction:DESC}){
    totalCount nodes{ name url description isFork stargazerCount pushedAt primaryLanguage{ name color }
      languages(first:10,orderBy:{field:SIZE,direction:DESC}){ edges{ size node{ name color } } } } }
  contributionsCollection{ contributionCalendar{ totalContributions weeks{ contributionDays{ date contributionCount contributionLevel } } } } } }`;

async function fetchAvatarDataUri(avatarUrl) {
  if (!avatarUrl) return '';
  const sep = avatarUrl.includes('?') ? '&' : '?';
  const url = `${avatarUrl}${sep}s=240&_t=${Date.now()}`;
  const res = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': 'profile-readme' },
  });
  if (!res.ok) return '';
  const mime = (res.headers.get('content-type') || 'image/png').split(';')[0].trim();
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buf.toString('base64')}`;
}

async function load() {
  const i = process.argv.indexOf('--mock');
  if (i > -1) {
    const f = process.argv[i + 1], u = JSON.parse(fs.readFileSync(f, 'utf8'));
    if (u.avatarFile) u.avatar = `data:image/png;base64,${fs.readFileSync(path.resolve(path.dirname(f), u.avatarFile)).toString('base64')}`;
    const r = rng(11), lv = ['NONE', 'FIRST_QUARTER', 'SECOND_QUARTER', 'THIRD_QUARTER', 'FOURTH_QUARTER'];
    const start = Date.UTC(2025, 10, 30);
    u.contributionsCollection = { contributionCalendar: { totalContributions: 94, weeks: Array.from({ length: 53 }, (_, w) => ({ contributionDays: Array.from({ length: 7 }, (_, d) => { const c = w > 24 && r() < 0.16 ? Math.ceil(r() * 9) : 0; return { date: new Date(start + (w * 7 + d) * 864e5).toISOString().slice(0, 10), contributionCount: c, contributionLevel: lv[c === 0 ? 0 : Math.min(4, Math.ceil(c / 2.3))] }; }) })) } };
    return u;
  }
  const login = process.env.GH_USER, token = process.env.GH_TOKEN;
  if (!login || !token) throw new Error('Set GH_USER and GH_TOKEN');
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    cache: 'no-store',
    headers: {
      Authorization: `bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'profile-readme',
    },
    body: JSON.stringify({ query: QUERY, variables: { login } }),
  });
  const j = await res.json();
  if (!res.ok || j.errors) throw new Error('GitHub API: ' + JSON.stringify(j.errors || res.status));
  const u = j.data.user;
  try {
    u.avatar = await fetchAvatarDataUri(u.avatarUrl);
  } catch {
    u.avatar = '';
  }
  return u;
}

// ------------------------------------------------------------------ svg kit
const CSS = `<style>
.m{font-family:${MONO}}.s{font-family:${SANS}}
.blink{animation:blink 1.1s steps(1) infinite}@keyframes blink{50%{opacity:0}}
.grow{transform-box:fill-box;transform-origin:left center;animation:grow 1.2s cubic-bezier(.2,.8,.2,1) both}@keyframes grow{from{transform:scaleX(0)}}
.cover{transform-box:fill-box;transform-origin:right center;transform:scaleX(0);animation:cover linear both}@keyframes cover{from{transform:scaleX(1)}}
.rise{animation:rise .6s ease-out both}@keyframes rise{from{opacity:0;transform:translateY(8px)}}
.pop{transform-box:fill-box;transform-origin:center;animation:pop .7s cubic-bezier(.2,.8,.2,1) both}@keyframes pop{from{opacity:0;transform:scale(.6)}}
.float{animation:float 5s ease-in-out infinite}@keyframes float{50%{transform:translateY(-5px)}}
</style>`;
const DEFS = `<defs>
<linearGradient id="acc" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${CY}"/><stop offset=".55" stop-color="${VI}"/><stop offset="1" stop-color="${PK}"/></linearGradient>
<radialGradient id="glow"><stop offset="0" stop-color="${VI}" stop-opacity=".38"/><stop offset=".6" stop-color="${CY}" stop-opacity=".08"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></radialGradient>
</defs>`;
const delay = (d) => `style="animation-delay:${d}s"`;
const prompt = (x, y, cmd, size = 14) => `<text class="m" x="${x}" y="${y}" font-size="${size}"><tspan fill="${CY}">~</tspan><tspan fill="${MUTED}">/</tspan><tspan fill="${PK}"> $</tspan><tspan fill="${TXT}"> ${esc(cmd)}</tspan></text>`;

function win(h, title, inner, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}" viewBox="0 0 ${W} ${h}" role="img" aria-label="${esc(label || title)}"><title>${esc(label || title)}</title>${CSS}${DEFS}
<rect x=".5" y=".5" width="${W - 1}" height="${h - 1}" rx="14" fill="${BG}" stroke="url(#acc)" stroke-opacity=".6"/>
<path d="M1,38 V14.5 a13.5,13.5 0 0 1 13.5,-13.5 H${W - 14.5} a13.5,13.5 0 0 1 13.5,13.5 V38 Z" fill="${BAR}"/>
<line x1="1" y1="38" x2="${W - 1}" y2="38" stroke="${LINE}"/>
<circle cx="22" cy="19" r="6" fill="#ff5f57"/><circle cx="42" cy="19" r="6" fill="#febc2e"/><circle cx="62" cy="19" r="6" fill="#28c840"/>
<text class="m" x="${W / 2}" y="23" text-anchor="middle" font-size="12" fill="${MUTED}">${esc(title)}</text>
${inner}</svg>`;
}

// ------------------------------------------------------------------ windows
function header(m) {
  const H = 300, name = m.name, fs_ = Math.min(46, Math.floor(600 / Math.max(name.length, 1) * 1.9));
  const role = `› ${m.title}`, rw = role.length * 10.8;
  let o = `<circle cx="790" cy="172" r="130" fill="url(#glow)"/>`;
  o += prompt(32, 86, 'whoami', 15);
  o += `<rect class="cover" x="28" y="66" width="130" height="26" fill="${BG}" style="animation-duration:.6s;animation-delay:.3s;animation-timing-function:steps(10,end)"/>`;
  o += `<text class="s" x="30" y="152" font-size="${fs_}" font-weight="800" fill="url(#acc)">${esc(name)}</text>`;
  o += `<rect class="cover" x="26" y="${152 - fs_}" width="${Math.ceil(name.length * fs_ * 0.7) + 40}" height="${fs_ + 22}" fill="${BG}" style="animation-duration:1.1s;animation-delay:1s;animation-timing-function:ease-out"/>`;
  o += `<text class="m" x="32" y="196" font-size="18" fill="#a5b4fc">${esc(role)}</text>`;
  o += `<rect class="cover" x="28" y="178" width="${Math.ceil(rw) + 8}" height="26" fill="${BG}" style="animation-duration:${(role.length * 0.05).toFixed(2)}s;animation-delay:2.1s;animation-timing-function:steps(${role.length},end)"/>`;
  o += `<g class="rise" ${delay(2.1 + role.length * 0.05)}><rect class="blink" x="${(32 + rw + 4).toFixed(1)}" y="181" width="10" height="19" fill="${CY}"/></g>`;
  let x = 32;
  [`${num(m.followers)} followers`, `${num(m.repoCount)} repositories`, `★ ${num(m.stars)} stars`].forEach((t, i) => {
    const w = Math.round(t.length * 7.3 + 28);
    o += `<g class="rise" ${delay(2.6 + i * 0.15)}><rect x="${x}" y="226" width="${w}" height="30" rx="15" fill="#121a38" stroke="${LINE}"/><text class="m" x="${x + 14}" y="245" font-size="12" fill="#c7d2fe">${esc(t)}</text></g>`;
    x += w + 10;
  });
  const cx = 790, cy = 172;
  o += `<g class="pop float" ${delay(0.2)}>`;
  if (m.avatar) o += `<clipPath id="av"><circle cx="${cx}" cy="${cy}" r="60"/></clipPath><image href="${m.avatar}" x="${cx - 60}" y="${cy - 60}" width="120" height="120" preserveAspectRatio="xMidYMid slice" clip-path="url(#av)"/>`;
  else o += `<circle cx="${cx}" cy="${cy}" r="60" fill="#1b2457"/><text class="s" x="${cx}" y="${cy + 16}" text-anchor="middle" font-size="48" font-weight="700" fill="${CY}">${esc(m.login[0].toUpperCase())}</text>`;
  o += `<circle cx="${cx}" cy="${cy}" r="65" fill="none" stroke="url(#acc)" stroke-width="4"/></g>`;
  return win(H, `${m.login} — zsh — 100×28`, o, `${m.name} — ${m.title}`);
}

function projects(m) {
  const list = m.projects, rowH = 64, top = 88;
  const H = top + Math.max(list.length, 1) * rowH + 8;
  let o = prompt(32, 70, m.pinned ? 'ls projects --pinned' : 'ls projects --sort=stars');
  if (!list.length) o += `<text class="m" x="32" y="${top + 24}" font-size="13" fill="${MUTED}">no public projects yet</text>`;
  list.forEach((r, i) => {
    const y = top + i * rowH, c = bright(r.color || FALLBACK[i % FALLBACK.length]);
    o += `<g class="rise" ${delay(0.15 + i * 0.12)}><rect x="24" y="${y}" width="852" height="54" rx="10" fill="#0f1630" stroke="#1f2a55"/>
<path d="M0,3 a3,3 0 0 1 3,-3 h6 l3,4 h10 a3,3 0 0 1 3,3 v11 a3,3 0 0 1 -3,3 h-19 a3,3 0 0 1 -3,-3z" fill="none" stroke="${CY}" stroke-width="1.6" transform="translate(44 ${y + 15})"/>
<text class="m" x="84" y="${y + 24}" font-size="15" font-weight="700" fill="#fff">${esc(clip(r.name, 28))}</text>
<text class="s" x="84" y="${y + 42}" font-size="12.5" fill="${MUTED}">${esc(clip(r.description || 'No description yet.', 62))}</text>
<circle cx="604" cy="${y + 27}" r="5" fill="${c}"/><text class="m" x="616" y="${y + 31}" font-size="12.5" fill="#c7d2fe">${esc(r.lang || '—')}</text>
<text class="m" x="738" y="${y + 31}" font-size="12.5" fill="${MUTED}">${esc(r.date)}</text>
<text class="m" x="856" y="${y + 31}" text-anchor="end" font-size="13" font-weight="700" fill="${GOLD}">★ ${num(r.stars)}</text></g>`;
  });
  return win(H, m.pinned ? '~/projects — ls --pinned' : '~/projects — ls --sort=stars', o, m.pinned ? 'Pinned projects' : 'Projects sorted by stars');
}

function stack(m) {
  const L = m.langs, rowH = 38, top = 106, H = top + Math.max(L.length, 1) * rowH - 12;
  const nw = Math.max(...L.map((l) => l.name.length), 4), max = Math.max(...L.map((l) => l.pct), 1), bx = 32 + nw * 8.7 + 24, tw = W - 32 - 70 - bx;
  let o = prompt(32, 70, 'cat stack.txt');
  L.forEach((l, i) => {
    const y = top + i * rowH, c = bright(l.color), w = Math.max(14, (l.pct / max) * tw);
    o += `<g class="rise" ${delay(0.1 + i * 0.1)}><text class="m" x="32" y="${y + 5}" font-size="14" fill="#fff">${esc(l.name)}</text>
<rect x="${bx}" y="${y - 7}" width="${tw}" height="14" rx="7" fill="#161d3d"/>
<rect class="grow" x="${bx}" y="${y - 7}" width="${w.toFixed(1)}" height="14" rx="7" fill="${c}" style="animation-delay:${(0.3 + i * 0.12).toFixed(2)}s"/>
<rect x="${bx}" y="${y - 7}" width="${w.toFixed(1)}" height="5" rx="2.5" fill="#fff" opacity=".18"/>
<text class="m" x="${W - 32}" y="${y + 5}" text-anchor="end" font-size="14" font-weight="700" fill="#c7d2fe">${l.pct}%</text></g>`;
  });
  return win(H, '~/stack — cat stack.txt', o, 'Language breakdown');
}

function stats(m) {
  const H = 368, tiles = [['repositories', m.repoCount], ['stars', m.stars], ['followers', m.followers], ['contributions', m.total]];
  const tw = 201, gap = 16;
  let o = prompt(32, 70, 'stats --year');
  tiles.forEach(([k, v], i) => {
    const x = 24 + i * (tw + gap);
    o += `<g class="pop" ${delay(0.1 + i * 0.12)}><rect x="${x}" y="88" width="${tw}" height="92" rx="12" fill="#0f1630" stroke="#1f2a55"/>
<text class="s" x="${x + 20}" y="136" font-size="36" font-weight="800" fill="url(#acc)">${num(v)}</text>
<text class="m" x="${x + 20}" y="162" font-size="11" letter-spacing="1.6" fill="${MUTED}">${k.toUpperCase()}</text></g>`;
  });
  o += `<text class="m" x="32" y="214" font-size="12" fill="${MUTED}">${num(m.total)} contributions in the last 12 months</text>`;
  const COL = { NONE: '#131a36', FIRST_QUARTER: '#155e75', SECOND_QUARTER: '#0891b2', THIRD_QUARTER: CY, FOURTH_QUARTER: VI };
  const x0 = 50, y0 = 228, step = 15;
  m.weeks.forEach((wk, x) => wk.forEach((d) => {
    const dow = new Date(d.date + 'T00:00:00Z').getUTCDay();
    o += `<rect x="${x0 + x * step}" y="${y0 + dow * step}" width="12" height="12" rx="3" fill="${COL[d.level] || COL.NONE}"><title>${esc(d.date)}: ${d.count}</title></rect>`;
  }));
  const lx = W - 32 - 5 * 15 - 60;
  o += `<text class="m" x="${lx}" y="${y0 + 7 * step + 12}" text-anchor="end" font-size="11" fill="${MUTED}">less</text>` + Object.values(COL).map((c, i) => `<rect x="${lx + 8 + i * 15}" y="${y0 + 7 * step + 2}" width="12" height="12" rx="3" fill="${c}"/>`).join('') + `<text class="m" x="${lx + 8 + 5 * 15 + 4}" y="${y0 + 7 * step + 12}" font-size="11" fill="${MUTED}">more</text>`;
  return win(H, '~/stats — contributions', o, `${num(m.total)} contributions in the last 12 months`);
}

function activity(m) {
  const list = m.recent, rowH = 34, top = 106, H = top + Math.max(list.length, 1) * rowH + 6;
  let o = prompt(32, 70, 'git log --pushed -5');
  list.forEach((r, i) => {
    const y = top + i * rowH;
    o += `<g class="rise" ${delay(0.1 + i * 0.1)}><circle cx="40" cy="${y - 4}" r="5" fill="${i === 0 ? CY : VI}"/>${i < list.length - 1 ? `<line x1="40" y1="${y + 1}" x2="40" y2="${y + rowH - 9}" stroke="${LINE}" stroke-width="2"/>` : ''}
<text class="m" x="64" y="${y}" font-size="13" fill="${MUTED}">${esc(r.date)}</text>
<text class="m" x="180" y="${y}" font-size="14" font-weight="700" fill="#fff">${esc(clip(r.name, 40))}</text>
<text class="m" x="${W - 32}" y="${y}" text-anchor="end" font-size="12" fill="${MUTED}">${esc(r.ago)}</text></g>`;
  });
  return win(H, '~/projects — git log', o, 'Recently pushed repositories');
}

// ------------------------------------------------------------------ model
function ago(iso) {
  const d = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 30) return `${d} days ago`;
  const mo = Math.floor(d / 30); return mo < 12 ? `${mo} mo ago` : `${Math.floor(mo / 12)} y ago`;
}
const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const u = await load();
const login = u.login, all = u.repositories.nodes;
const mine = all.filter((r) => !r.isFork && r.name.toLowerCase() !== login.toLowerCase());
const bytes = {};
for (const r of all.filter((r) => !r.isFork)) for (const e of r.languages.edges) { const b = (bytes[e.node.name] ||= { size: 0, color: e.node.color }); b.size += e.size; }
const tot = Object.values(bytes).reduce((a, b) => a + b.size, 0) || 1;
const pinnedNodes = (u.pinnedItems?.nodes || []).filter(Boolean);
const usePinned = (cfg.projectsSource || 'pinned') === 'pinned' && pinnedNodes.length > 0;
const projectSource = usePinned ? pinnedNodes : [...mine].sort((a, b) => b.stargazerCount - a.stargazerCount || a.name.localeCompare(b.name)).slice(0, cfg.maxProjects ?? 6);
const model = {
  login,
  name: cfg.name || u.name || login,
  title: (cfg.title || u.bio || 'developer').toLowerCase(),
  avatar: u.avatar,
  followers: u.followers.totalCount,
  repoCount: u.repositories.totalCount,
  stars: all.reduce((s, r) => s + r.stargazerCount, 0),
  langs: Object.entries(bytes).sort((a, b) => b[1].size - a[1].size).slice(0, cfg.maxLanguages ?? 5).map(([name, b], i) => ({ name: name.toLowerCase(), color: b.color || FALLBACK[i % FALLBACK.length], pct: Math.max(1, Math.round((b.size / tot) * 100)) })),
  pinned: usePinned,
  projects: projectSource.map((r) => ({ name: r.owner && r.owner.login.toLowerCase() !== login.toLowerCase() ? `${r.owner.login}/${r.name}` : r.name, url: r.url || `https://github.com/${login}/${r.name}`, description: r.description, stars: r.stargazerCount, lang: r.primaryLanguage?.name, color: r.primaryLanguage?.color, date: shortDate(r.pushedAt) })),
  recent: [...mine].sort((a, b) => new Date(b.pushedAt) - new Date(a.pushedAt)).slice(0, 5).map((r) => ({ name: r.name, date: r.pushedAt.slice(0, 10), ago: ago(r.pushedAt) })),
  weeks: u.contributionsCollection.contributionCalendar.weeks.map((w) => w.contributionDays.map((d) => ({ date: d.date, count: d.contributionCount, level: d.contributionLevel }))),
  total: u.contributionsCollection.contributionCalendar.totalContributions,
};

// ------------------------------------------------------------------ write
const preview = process.argv.includes('--mock'), dir = preview ? 'preview' : '.';
fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
const files = { 'header.svg': header, 'projects.svg': projects, 'stack.svg': stack, 'stats.svg': stats, 'activity.svg': activity };
for (const [f, fn] of Object.entries(files)) fs.writeFileSync(path.join(dir, 'assets', f), fn(model));

const badge = (label, url, logo, color = '22d3ee') =>
  `<a href="${url}"><img src="https://img.shields.io/badge/${encodeURIComponent(label.replace(/-/g, '--').replace(/_/g, '__'))}-0b1020?style=for-the-badge${logo ? `&logo=${logo}&logoColor=${color}` : ''}&labelColor=0b1020" alt="${esc(label)}" /></a>`;
const links = [badge('GitHub', `https://github.com/${login}`, 'github'), ...(cfg.links || []).map((l) => badge(l.label, l.url, l.logo))].join('\n  ');
const img = (f, alt) => `<p align="center">\n  <img src="./assets/${f}" alt="${esc(alt)}" width="100%" />\n</p>`;
const readme = `${img('header.svg', `${model.name} — ${model.title}`)}

${img('projects.svg', model.pinned ? 'Pinned projects' : 'Projects sorted by stars')}

<p align="center">
  <sub>${model.projects.map((p) => `<a href="${p.url}">${esc(p.name)}</a>`).join(' · ')}</sub>
</p>

${img('stack.svg', 'Language breakdown')}

${img('activity.svg', 'Recently pushed repositories')}

${img('stats.svg', 'GitHub stats and contributions')}

<p align="center">
  ${links}
</p>

<p align="center">
  <sub>auto-updated by GitHub Actions · last run ${new Date().toISOString().slice(0, 10)}</sub>
</p>
`;
fs.writeFileSync(path.join(dir, 'README.md'), readme);
console.log('Generated into', dir);