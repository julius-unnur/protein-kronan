(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  // Íslenskt snið án Intl, því sumir vafrar vantar is-IS gögn: 5.807 og 13,2
  const group3 = s => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const nf = {format: n => (n < 0 ? '-' : '') + group3(String(Math.round(Math.abs(n))))};
  const sf = {format: n => { const [i, d] = Math.abs(n).toFixed(1).split('.'); return (n < 0 ? '-' : '') + group3(i) + ',' + d; }};
  const fmt = (n, dec) => Number.isFinite(n) ? (dec ? sf : nf).format(n) : '—';
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const norm = s => String(s ?? '').toLocaleLowerCase('is').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ð/g, 'd').replace(/þ/g, 'th').replace(/æ/g, 'ae');

  const TYPES = [
    ['Kjöt og innmatur', '--c-kjot'], ['Kjúklingur og kalkúnn', '--c-kjukl'], ['Fiskur og sjávarfang', '--c-fisk'],
    ['Skyr og mjólkurvörur', '--c-mjolk'], ['Egg', '--c-egg'], ['Próteinduft', '--c-duft'], ['Próteindrykkir', '--c-drykk'],
    ['Baunir og plöntuprótein', '--c-baun'], ['Korn, pasta og brauð', '--c-korn'], ['Annað', '--c-annad'],
  ];
  const color = t => `var(${(TYPES.find(x => x[0] === t) || TYPES[TYPES.length - 1])[1]})`;
  const PREP = {ready: 'Tilbúið að borða', cook: 'Þarf að elda', mix: 'Þarf að blanda', check: 'Sjá umbúðir'};
  const BEST_CAP = 400;
  const DEFAULTS = {q: '', t: '', cap: '400', prep: '', sort: 'score', all: ''};

  const state = {items: [], ranked: [], limit: 30, rows: [], hidden: new Set(), ...DEFAULTS};

  // --- URL state ---
  function readUrl() {
    const p = new URLSearchParams(location.search);
    for (const k of Object.keys(DEFAULTS)) if (p.has(k)) state[k] = p.get(k);
  }
  function writeUrl() {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(DEFAULTS)) if (state[k] !== v) p.set(k, state[k]);
    const qs = p.toString();
    history.replaceState(null, '', qs ? `?${qs}${location.hash}` : location.pathname + location.hash);
  }
  function syncControls() {
    $('q').value = state.q; $('cap').value = state.cap; $('prep').value = state.prep; $('sort').value = state.sort;
    $('unranked').checked = state.all === '1';
    document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.t === state.t)));
  }

  // --- filtering ---
  const cap = () => Number(state.cap) || Infinity;
  function matches(r, {ignoreCap = false} = {}) {
    const words = norm(state.q).split(/\s+/).filter(Boolean);
    if (words.length && !words.every(w => r._n.includes(w))) return false;
    if (state.t && r.type !== state.t) return false;
    if (state.prep && r.preparation !== state.prep) return false;
    if (!ignoreCap && Number.isFinite(r.cal) && r.cal > cap()) return false;
    return true;
  }
  function filtered() {
    const base = state.all === '1' ? state.items : state.ranked;
    const rows = base.filter(r => matches(r, {ignoreCap: !Number.isFinite(r.score)}));
    const key = state.sort;
    return rows.sort((a, b) => key === 'name' ? a.name.localeCompare(b.name, 'is')
      : (a[key] ?? Infinity) - (b[key] ?? Infinity) || a.name.localeCompare(b.name, 'is'));
  }

  // --- best cards ---
  function renderBest() {
    const pool = state.ranked.filter(r => !r.flag && r.cal <= BEST_CAP);
    $('best-grid').innerHTML = TYPES.filter(([t]) => t !== 'Annað').map(([t]) => {
      const list = pool.filter(r => r.type === t).sort((a, b) => a.score - b.score);
      if (!list.length) return '';
      const [b, ...rest] = list;
      const runners = rest.slice(0, 2).map(r => `<span>${esc(r.name)} (${fmt(r.score, 1)})</span>`).join(', ');
      return `<button class="best" type="button" data-sku="${esc(b.sku)}">
        <span class="type"><span class="swatch" style="background:${color(t)}"></span>${esc(t)}</span>
        <span class="name">${esc(b.name)}</span>
        <span class="nums"><span><b>${fmt(b.cost)} kr.</b>fyrir 30 g</span><span><b>${fmt(b.cal)}</b>kcal</span><span><b>${fmt(b.score, 1)}</b>stuðull</span></span>
        ${runners ? `<span class="runner">Næst: ${runners}</span>` : ''}
      </button>`;
    }).join('');
  }

  // --- chart ---
  const H = 520, M = {l: 58, r: 20, t: 26, b: 48};
  let W = 1100;
  function renderChart() {
    const svg = $('chart');
    W = svg.parentElement.clientWidth < 640 ? 560 : 1100;
    const yMax = Number.isFinite(cap()) ? cap() : 1000, yMin = 100, xMax = 800;
    const X = v => M.l + v / xMax * (W - M.l - M.r);
    const Y = v => H - M.b - (v - yMin) / (yMax - yMin) * (H - M.t - M.b);
    const pts = state.ranked.filter(r => matches(r) && !state.hidden.has(r.type));
    const inView = pts.filter(r => r.cost <= xMax);
    const off = pts.length - inView.length;
    const xt = W < 800 ? [0, 200, 400, 600, 800] : [0, 100, 200, 300, 400, 500, 600, 700, 800];
    const step = yMax <= 200 ? 25 : yMax <= 400 ? 50 : 100;
    const yt = []; for (let v = Math.ceil(yMin / step) * step; v <= yMax; v += step) yt.push(v);
    const iso = [25, 50, 100, 200].map(s => {
      const d = []; for (let k = 8; k <= xMax; k += 4) { const c = s * 1000 / k; if (c >= yMin && c <= yMax) d.push(`${X(k).toFixed(1)},${Y(c).toFixed(1)}`); }
      if (!d.length) return '';
      const [lx, ly] = d[0].split(',');
      return `<path d="M${d.join('L')}" fill="none" stroke="#b9bdb2" stroke-dasharray="4 5"/><text x="${+lx + 5}" y="${+ly + 12}" font-size="11" fill="#8a948c">${s === 25 ? 'stuðull ' : ''}${s}</text>`;
    }).join('');
    const best = new Set(TYPES.map(([t]) => inView.filter(r => r.type === t && !r.flag).sort((a, b) => a.score - b.score)[0]).filter(Boolean).map(r => r.sku));
    const ordered = inView.slice().sort((a, b) => best.has(a.sku) - best.has(b.sku));
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `
      ${yt.map(v => `<line x1="${M.l}" x2="${W - M.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#eceee6"/><text x="${M.l - 10}" y="${Y(v) + 4}" text-anchor="end" font-size="12" fill="#66726a">${v}</text>`).join('')}
      ${xt.map(v => `<text x="${X(v)}" y="${H - M.b + 20}" text-anchor="middle" font-size="12" fill="#66726a">${v}</text>`).join('')}
      <line x1="${M.l}" x2="${W - M.r}" y1="${H - M.b}" y2="${H - M.b}" stroke="#c9ccc1"/>
      <text x="${W - M.r}" y="${H - 8}" text-anchor="end" font-size="12" fill="#66726a">kr. fyrir 30 g prótein →</text>
      <text x="${M.l - 10}" y="${M.t - 10}" text-anchor="end" font-size="12" fill="#66726a">kcal</text>
      ${off ? `<text x="${W - M.r}" y="${M.t - 10}" text-anchor="end" font-size="11" fill="#8a948c">${off} dýrari vörur utan grafs</text>` : ''}
      ${iso}
      ${ordered.map(r => { const b = best.has(r.sku); return `<circle class="pt" data-sku="${esc(r.sku)}" cx="${X(r.cost).toFixed(1)}" cy="${Y(r.cal).toFixed(1)}" r="${b ? 7 : 4}" fill="${color(r.type)}" fill-opacity="${b ? 1 : .55}" ${b ? 'stroke="#fff" stroke-width="2"' : ''}/>`; }).join('')}`;
  }
  function renderLegend() {
    $('legend').innerHTML = TYPES.map(([t]) => `<button type="button" data-legend="${esc(t)}" aria-pressed="${!state.hidden.has(t)}"><span class="swatch" style="background:${color(t)}"></span>${esc(t)}</button>`).join('');
  }

  // --- table ---
  function scoreClass(s) { return s < 40 ? 's1' : s < 60 ? 's2' : ''; }
  function renderTable() {
    const rows = state.rows = filtered();
    const total = state.all === '1' ? state.items.length : state.ranked.length;
    $('count').textContent = `${nf.format(rows.length)} af ${nf.format(total)} vörum`;
    $('rows').innerHTML = rows.length ? rows.slice(0, state.limit).map(r => {
      const ranked = Number.isFinite(r.score);
      const sub = `<span class="t"><span class="swatch" style="background:${color(r.type)}"></span>${esc(r.type)}</span><span>${r.amount ? `${fmt(r.price)} kr. / ${fmt(r.amount)} ${esc(r.unit)}` : esc(r.group)}</span><span>${esc(PREP[r.preparation] || '')}</span>${r.flag ? '<span class="flag">⚠ Gögn standast ekki</span>' : ''}${!ranked ? `<span class="flag">${esc(r.status)}</span>` : ''}`;
      return `<tr>
        <td class="rank num">${ranked ? r.rank : ''}</td>
        <td class="c-name"><button class="name-button" type="button" data-sku="${esc(r.sku)}">${esc(r.name)}</button><div class="sub">${sub}</div></td>
        <td class="num c-num" data-l="Magn">${ranked ? `${fmt(r.portion)} <span class="unit">${esc(r.unit)}</span>` : '<span class="muted">—</span>'}</td>
        <td class="num c-num" data-l="Kr.">${ranked ? fmt(r.cost) : '<span class="muted">—</span>'}</td>
        <td class="num c-num" data-l="kcal">${ranked ? fmt(r.cal) : '<span class="muted">—</span>'}</td>
        <td class="num c-num">${ranked ? `<span class="score ${scoreClass(r.score)}">${fmt(r.score, 1)}</span>` : ''}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6" class="empty">Engar vörur passa við síurnar.</td></tr>';
    $('shown').textContent = rows.length ? `Sýni ${nf.format(Math.min(rows.length, state.limit))} af ${nf.format(rows.length)}` : '';
    $('more').hidden = state.limit >= rows.length;
    $('download').disabled = !rows.length;
  }
  function renderChips() {
    const counts = {}; state.ranked.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
    $('type-chips').innerHTML = `<button type="button" class="chip" data-t="">Allar tegundir</button>` +
      TYPES.map(([t]) => `<button type="button" class="chip" data-t="${esc(t)}"><span class="swatch" style="background:${color(t)}"></span>${esc(t)} <small>${nf.format(counts[t] || 0)}</small></button>`).join('');
  }
  function update({resetLimit = true} = {}) {
    if (resetLimit) state.limit = 30;
    writeUrl(); syncControls(); renderTable(); renderChart();
  }

  // --- detail ---
  function showDetail(sku) {
    const r = state.items.find(x => x.sku === sku); if (!r) return;
    const ranked = Number.isFinite(r.score);
    const nutr = Object.entries(r.nutrition || {}).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
    $('detail-body').innerHTML = `
      <p class="eyebrow" style="color:${color(r.type)}">${esc(r.type)}</p>
      <h3>${esc(r.name)}</h3>
      <p class="small">${esc(r.packLabel || '')}${r.price ? ` · ${fmt(r.price)} kr. pakkinn` : ''} · ${esc(PREP[r.preparation] || '')}</p>
      ${r.flag ? `<div class="note">⚠ ${esc(r.flag)}</div>` : ''}
      ${ranked ? `<div class="metrics"><div><b>${fmt(r.cost)} kr.</b>fyrir 30 g prótein</div><div><b>${fmt(r.cal)}</b>kcal fyrir 30 g</div><div><b>${fmt(r.score, 1)}</b>stuðull · sæti ${r.rank}</div></div>
        <p class="small">30 g prótein = <b>${fmt(r.portion)} ${esc(r.unit)}</b> af vörunni.</p>` : `<div class="note">${esc(r.status)}. ${esc((r.notes || []).join(' '))}</div>`}
      ${ranked && r.notes ? `<p class="small">${esc(r.notes.join(' '))}</p>` : ''}
      <h4 style="font-size:13px;margin:18px 0 0">Næringargildi í 100 g / ml</h4>
      <table class="nutr"><tbody>${nutr || '<tr><td>Engin næringargildi í gögnunum.</td></tr>'}</tbody></table>
      ${r.url ? `<a class="button" href="${esc(r.url)}" target="_blank" rel="noopener">Skoða á kronan.is ↗</a>` : ''}`;
    $('detail').showModal();
  }

  // --- events ---
  const bind = (id, key, ev = 'change') => $(id).addEventListener(ev, () => { state[key] = $(id).value; update(); });
  bind('q', 'q', 'input'); bind('cap', 'cap'); bind('prep', 'prep'); bind('sort', 'sort');
  $('unranked').addEventListener('change', e => { state.all = e.target.checked ? '1' : ''; update(); });
  $('type-chips').addEventListener('click', e => { const c = e.target.closest('.chip'); if (!c) return; state.t = state.t === c.dataset.t ? '' : c.dataset.t; state.hidden.clear(); renderLegend(); update(); });
  $('legend').addEventListener('click', e => {
    const b = e.target.closest('[data-legend]'); if (!b) return;
    const t = b.dataset.legend; state.hidden.has(t) ? state.hidden.delete(t) : state.hidden.add(t);
    renderLegend(); renderChart();
  });
  $('reset').addEventListener('click', () => { Object.assign(state, DEFAULTS); state.hidden.clear(); renderLegend(); update(); });
  $('more').addEventListener('click', () => { state.limit += 60; renderTable(); });
  document.addEventListener('click', e => { const b = e.target.closest('[data-sku]'); if (b && !e.target.closest('#chart')) showDetail(b.dataset.sku); });
  $('close').addEventListener('click', () => $('detail').close());
  $('detail').addEventListener('click', e => { if (e.target === $('detail')) $('detail').close(); });

  const tip = $('tip');
  $('chart').addEventListener('mousemove', e => {
    const p = e.target.closest('.pt'); if (!p) { tip.hidden = true; return; }
    const r = state.items.find(x => x.sku === p.dataset.sku);
    tip.innerHTML = `<b>${esc(r.name)}</b>${fmt(r.cost)} kr. · ${fmt(r.cal)} kcal · stuðull ${fmt(r.score, 1)}<br><span style="opacity:.7">${esc(r.type)}</span>`;
    const box = $('chart').parentElement.getBoundingClientRect();
    let x = e.clientX - box.left + 14, y = e.clientY - box.top + 14;
    tip.hidden = false;
    if (x + tip.offsetWidth > box.width) x = e.clientX - box.left - tip.offsetWidth - 14;
    tip.style.left = `${x}px`; tip.style.top = `${y}px`;
  });
  $('chart').addEventListener('mouseleave', () => { tip.hidden = true; });
  $('chart').addEventListener('click', e => { const p = e.target.closest('.pt'); if (p) showDetail(p.dataset.sku); });

  $('share').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(location.href); $('share').textContent = 'Hlekkur afritaður ✓'; }
    catch { $('share').textContent = 'Afritaðu slóðina'; }
    setTimeout(() => { $('share').textContent = 'Afrita hlekk'; }, 2000);
  });
  $('download').addEventListener('click', () => {
    const head = ['Sæti', 'Vara', 'Tegund', 'Flokkur Krónunnar', 'Undirbúningur', 'Pakkaverð kr.', 'Pakkamagn', 'Eining', 'Prótein / 100', 'kcal / 100', 'Magn fyrir 30 g prótein', 'Kr. fyrir 30 g prótein', 'kcal fyrir 30 g prótein', 'Stuðull', 'Staða', 'Athugasemd', 'Slóð'];
    const body = state.rows.map(r => [r.rank, r.name, r.type, r.group, PREP[r.preparation], r.price, r.amount, r.unit, r.protein, r.kcal, r.portion, r.cost, r.cal, r.score, r.status, [r.flag, ...(r.notes || [])].filter(Boolean).join(' '), r.url]);
    const csv = '﻿' + [head, ...body].map(row => row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8'}));
    a.download = 'protein-kronan.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  let lastW = 0;
  window.addEventListener('resize', () => { const w = $('chart').parentElement.clientWidth < 640; if (w !== lastW && state.items.length) { lastW = w; renderChart(); } });

  // --- load ---
  readUrl();
  fetch('data.json').then(r => { if (!r.ok) throw new Error(r.status); return r.json(); }).then(d => {
    d.items.forEach(r => { r._n = norm(`${r.name} ${r.type} ${r.group}`); });
    state.items = d.items;
    state.ranked = d.items.filter(r => Number.isFinite(r.score));
    $('stat-total').textContent = nf.format(d.items.length);
    $('stat-ranked').textContent = nf.format(state.ranked.length);
    const cheapest = state.ranked.filter(r => !r.flag && r.cal <= BEST_CAP).sort((a, b) => a.cost - b.cost)[0];
    if (cheapest) $('stat-cheapest').textContent = `${fmt(cheapest.cost)} kr.`;
    renderChips(); renderLegend(); renderBest(); update({resetLimit: false});
  }).catch(() => { $('data-error').hidden = false; $('count').textContent = ''; });
})();
