import {
  dbGetNutritionTargets, dbGetNutritionLog, dbSaveNutritionLog,
  dbSaveNutritionTargets, dbGetBodyWeight
} from './db.js';
import { showLoading, getActiveDateString } from './ui.js';

function trRingSvg(pct, color, size) {
  const r = size * 0.36, c = size / 2, circ = 2 * Math.PI * r;
  const sw = size * 0.10;
  const offset = circ * (1 - Math.min(1, Math.max(0, pct)));
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative;width:' + size + 'px;height:' + size + 'px;flex-shrink:0;';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + size + ' ' + size);
  svg.setAttribute('width', size); svg.setAttribute('height', size);
  const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  track.setAttribute('cx', c); track.setAttribute('cy', c); track.setAttribute('r', r);
  track.setAttribute('fill', 'none'); track.setAttribute('stroke', 'rgba(255,255,255,0.07)'); track.setAttribute('stroke-width', sw);
  svg.appendChild(track);
  const fill = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fill.setAttribute('cx', c); fill.setAttribute('cy', c); fill.setAttribute('r', r);
  fill.setAttribute('fill', 'none'); fill.setAttribute('stroke', color); fill.setAttribute('stroke-width', sw);
  fill.setAttribute('stroke-linecap', 'round'); fill.setAttribute('transform', 'rotate(-90 ' + c + ' ' + c + ')');
  fill.setAttribute('stroke-dasharray', circ); fill.setAttribute('stroke-dashoffset', offset);
  fill.style.transition = 'stroke-dashoffset 0.6s cubic-bezier(0.22,1,0.36,1)';
  svg.appendChild(fill);
  const ov = document.createElement('div');
  ov.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;';
  ov.innerHTML = '<div style="font-family:var(--font-mono);font-size:' + Math.round(size*0.20) + 'px;font-weight:800;color:var(--text-primary);font-variant-numeric:tabular-nums;">' + Math.round((pct||0)*100) + '</div><div style="font-size:9px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.06em;">%</div>';
  wrap.appendChild(svg); wrap.appendChild(ov);
  return wrap;
}

export async function trRenderNutrition(onRefreshTiles) {
  const container = document.getElementById('trNutritionContent');
  showLoading(container);
  const today = getActiveDateString();
  const [targets, log] = await Promise.all([dbGetNutritionTargets(), dbGetNutritionLog(today)]);
  container.innerHTML = '';
  if (!targets) { trNutritionSetup(container, false, onRefreshTiles); return; }
  const logData = log || { kcal: 0, protein: 0, carbs: 0, fat: 0 };

  const sc = document.createElement('div');
  sc.className = 'card';
  sc.style.marginBottom = '14px';

  const calRow = document.createElement('div');
  calRow.style.cssText = 'display:flex;align-items:center;gap:18px;margin-bottom:20px;';
  const rsvg = trRingSvg((logData.kcal || 0) / targets.kcal, '#F2C063', 82);
  calRow.appendChild(rsvg);
  const calInfo = document.createElement('div');
  const remaining = Math.max(0, targets.kcal - (logData.kcal || 0));
  calInfo.innerHTML =
    '<div style="font-size:28px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-0.04em;line-height:1;">' + (logData.kcal || 0).toLocaleString() + '</div>' +
    '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary);margin-top:4px;">of ' + targets.kcal.toLocaleString() + ' kcal goal</div>' +
    '<div style="font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);margin-top:3px;">' + remaining.toLocaleString() + ' remaining</div>';
  calRow.appendChild(calInfo);
  sc.appendChild(calRow);

  [['Protein', 'protein', '#6BE3A4'], ['Carbs', 'carbs', '#F2C063'], ['Fat', 'fat', '#FF6B6B']].forEach(([lbl, key, col]) => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';
    const ll = document.createElement('div');
    ll.style.cssText = 'width:52px;font-size:10.5px;color:var(--text-tertiary);font-weight:700;text-transform:uppercase;letter-spacing:0.08em;';
    ll.textContent = lbl;
    const bw = document.createElement('div');
    bw.className = 'tr-seg-bar';
    bw.style.flex = '1';
    const bf = document.createElement('div');
    bf.className = 'tr-seg-bar-fill';
    bf.style.width = Math.min(100, Math.round((logData[key] || 0) / (targets[key] || 1) * 100)) + '%';
    bf.style.background = col;
    bw.appendChild(bf);
    const nm = document.createElement('div');
    nm.style.cssText = 'font-family:var(--font-mono);font-size:11px;color:var(--text-secondary);font-variant-numeric:tabular-nums;width:60px;text-align:right;white-space:nowrap;';
    nm.textContent = (logData[key] || 0) + '/' + targets[key] + 'g';
    row.appendChild(ll); row.appendChild(bw); row.appendChild(nm);
    sc.appendChild(row);
  });
  container.appendChild(sc);

  const lc = document.createElement('div');
  lc.className = 'card';
  const lt = document.createElement('div');
  lt.className = 'eyebrow';
  lt.textContent = "Log Today's Macros";
  lc.appendChild(lt);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11.5px;color:var(--text-tertiary);margin-bottom:14px;line-height:1.5;';
  hint.textContent = 'Enter your daily totals from MyFitnessPal below.';
  lc.appendChild(hint);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;';

  const fields = [
    ['Calories (kcal)', 'kcal', logData.kcal || 0],
    ['Protein (g)', 'protein', logData.protein || 0],
    ['Carbs (g)', 'carbs', logData.carbs || 0],
    ['Fat (g)', 'fat', logData.fat || 0],
  ];
  const inps = {};
  fields.forEach(([lbl, key, val]) => {
    const w = document.createElement('div');
    const l = document.createElement('label');
    l.className = 'tr-form-label';
    l.textContent = lbl;
    const i = document.createElement('input');
    i.className = 'tr-input';
    i.type = 'number';
    i.min = '0';
    i.value = val;
    i.inputMode = 'numeric';
    i.style.textAlign = 'center';
    inps[key] = i;
    w.appendChild(l); w.appendChild(i);
    grid.appendChild(w);
  });
  lc.appendChild(grid);

  const saveBtn = document.createElement('button');
  saveBtn.className = 'tr-primary-btn';
  saveBtn.textContent = "Save Today's Macros";
  saveBtn.addEventListener('click', async () => {
    const entry = {
      kcal: parseInt(inps.kcal.value) || 0,
      protein: parseInt(inps.protein.value) || 0,
      carbs: parseInt(inps.carbs.value) || 0,
      fat: parseInt(inps.fat.value) || 0,
    };
    await dbSaveNutritionLog(today, entry);
    trRenderNutrition(onRefreshTiles);
    if (onRefreshTiles) onRefreshTiles();
  });
  lc.appendChild(saveBtn);
  container.appendChild(lc);

  const sb = document.createElement('button');
  sb.className = 'tr-secondary-btn';
  sb.style.cssText = 'width:100%;margin-top:12px;';
  sb.textContent = '⚙️ Edit Targets';
  sb.addEventListener('click', () => { container.innerHTML = ''; trNutritionSetup(container, true, onRefreshTiles); });
  container.appendChild(sb);
}

export async function trNutritionSetup(container, hasBack, onRefreshTiles) {
  const existing = (await dbGetNutritionTargets()) || { mode: 'maintain', kcal: 2200, protein: 170, carbs: 220, fat: 60 };
  if (hasBack) {
    const bb = document.createElement('button');
    bb.className = 'tr-secondary-btn';
    bb.style.marginBottom = '14px';
    bb.textContent = '← Back';
    bb.addEventListener('click', () => trRenderNutrition(onRefreshTiles));
    container.appendChild(bb);
  }

  const card = document.createElement('div');
  card.className = 'card';
  const tl = document.createElement('div');
  tl.className = 'eyebrow';
  tl.textContent = 'Nutrition Targets';
  card.appendChild(tl);

  const inps = {};
  [
    ['Goal Mode', 'mode', 'select', [['cut', 'Cut (deficit)'], ['maintain', 'Maintain'], ['bulk', 'Bulk (surplus)']]],
    ['Daily Calories (kcal)', 'kcal', 'number'],
    ['Protein (g)', 'protein', 'number'],
    ['Carbs (g)', 'carbs', 'number'],
    ['Fat (g)', 'fat', 'number'],
  ].forEach(([lbl, key, type, opts]) => {
    const w = document.createElement('div');
    w.style.marginBottom = '10px';
    const l = document.createElement('label');
    l.className = 'tr-form-label';
    l.textContent = lbl;
    let inp;
    if (type === 'select') {
      inp = document.createElement('select');
      inp.className = 'tr-input';
      opts.forEach(([v, t]) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (v === existing[key]) o.selected = true; inp.appendChild(o); });
    } else {
      inp = document.createElement('input');
      inp.className = 'tr-input';
      inp.type = 'number';
      inp.value = existing[key] || 0;
      inp.min = '0';
      inp.inputMode = 'numeric';
    }
    inps[key] = inp;
    w.appendChild(l); w.appendChild(inp);
    card.appendChild(w);
  });

  const bwData = await dbGetBodyWeight();
  if (bwData.length > 0) {
    const bw = bwData[bwData.length - 1].kg;
    const hint = document.createElement('div');
    hint.style.cssText = 'font-size:11px;color:var(--text-tertiary);margin-bottom:10px;padding:10px 12px;background:var(--surface);border-radius:var(--radius-sm);border:1px solid var(--border);';
    hint.innerHTML = 'Body: <strong style="color:var(--text-secondary);">' + bw + 'kg</strong> — <button style="background:none;border:none;color:var(--warning);cursor:pointer;font-size:11px;font-family:var(--font-sans);text-decoration:underline;" id="trSuggestBtn">Auto-suggest targets</button>';
    card.appendChild(hint);
    setTimeout(() => {
      const btn = document.getElementById('trSuggestBtn');
      if (btn) btn.addEventListener('click', () => {
        const mode = inps.mode.value;
        const base = Math.round(bw * 24);
        const adj = mode === 'cut' ? base - 400 : mode === 'bulk' ? base + 300 : base;
        inps.kcal.value = adj;
        inps.protein.value = Math.round(bw * 2.2);
        inps.carbs.value = Math.round(adj * 0.40 / 4);
        inps.fat.value = Math.round(adj * 0.25 / 9);
      });
    }, 0);
  }

  const sv = document.createElement('button');
  sv.className = 'tr-primary-btn';
  sv.style.marginTop = '4px';
  sv.textContent = 'Save Targets';
  sv.addEventListener('click', async () => {
    await dbSaveNutritionTargets({
      mode: inps.mode.value,
      kcal: parseInt(inps.kcal.value) || 2200,
      protein: parseInt(inps.protein.value) || 170,
      carbs: parseInt(inps.carbs.value) || 220,
      fat: parseInt(inps.fat.value) || 60,
    });
    container.innerHTML = '';
    trRenderNutrition(onRefreshTiles);
    if (onRefreshTiles) onRefreshTiles();
  });
  card.appendChild(sv);
  container.appendChild(card);
}
