import { dbGetBodyWeight, dbAddBodyWeight, dbDeleteBodyWeight, trGetRoutine } from './db.js';
import { showLoading, getActiveDateString, trLineChart } from './ui.js';

export async function trRenderBody(onRefreshTiles) {
  const container = document.getElementById('trBodyContent');
  showLoading(container);
  const [entries, routine] = await Promise.all([dbGetBodyWeight(), trGetRoutine()]);
  container.innerHTML = '';
  const units = routine.units || 'kg';

  if (entries.length > 0) {
    const last = entries[entries.length - 1];
    const statsRow = document.createElement('div');
    statsRow.className = 'tr-body-stat-row';

    function sc(val, lbl, delta, dir) {
      const c = document.createElement('div');
      c.className = 'tr-stat-card';
      c.innerHTML = '<div class="tr-stat-value">' + val + '</div><div class="tr-stat-label">' + lbl + '</div>' +
        (delta !== undefined ? '<div class="tr-stat-delta ' + dir + '">' + delta + '</div>' : '');
      return c;
    }

    const disp = units === 'lb' ? (last.kg * 2.20462).toFixed(1) + ' lb' : last.kg + ' kg';
    statsRow.appendChild(sc(disp, 'Current'));

    if (entries.length >= 2) {
      const d = (last.kg - entries[entries.length-2].kg).toFixed(1);
      statsRow.appendChild(sc((+d>0?'+':'')+d+' kg', 'vs Last', undefined, +d<0?'down':+d>0?'up':'same'));
    }
    if (entries.length >= 8) {
      const avg = entries.slice(-8,-1).reduce((a,e)=>a+e.kg,0)/7;
      const d7 = (last.kg - avg).toFixed(1);
      statsRow.appendChild(sc((+d7>0?'+':'')+d7+' kg', '7-day avg', undefined, +d7<0?'down':+d7>0?'up':'same'));
    }
    container.appendChild(statsRow);

    if (entries.length >= 2) {
      const cc = document.createElement('div');
      cc.className = 'card';
      cc.style.marginBottom = '14px';
      const ctl = document.createElement('div');
      ctl.className = 'eyebrow';
      ctl.textContent = 'Bodyweight Trend';
      cc.appendChild(ctl);
      const cw = document.createElement('div');
      cw.className = 'tr-chart-wrap';
      cw.style.height = '82px';
      cw.appendChild(trLineChart(entries.map(e => e.kg), '#F2C063'));
      cc.appendChild(cw);
      const dr = document.createElement('div');
      dr.style.cssText = 'display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:10px;color:var(--text-tertiary);margin-top:6px;';
      dr.innerHTML = '<span>' + entries[0].date + '</span><span>' + entries[entries.length-1].date + '</span>';
      cc.appendChild(dr);
      container.appendChild(cc);
    }
  }

  const lc = document.createElement('div');
  lc.className = 'card';
  const lt = document.createElement('div');
  lt.className = 'eyebrow';
  lt.textContent = 'Weight Log';
  lc.appendChild(lt);

  if (entries.length === 0) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.textContent = 'No weight entries yet.';
    lc.appendChild(e);
  } else {
    [...entries].reverse().slice(0, 12).forEach(entry => {
      const row = document.createElement('div');
      row.className = 'tr-row';
      const kd = units === 'lb' ? (entry.kg * 2.20462).toFixed(1) + ' lb' : entry.kg + ' kg';
      const inf = document.createElement('div');
      inf.style.flex = '1';
      inf.innerHTML = '<div style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums;">' + kd + '</div><div style="font-size:11px;color:var(--text-tertiary);margin-top:2px;">' + entry.date + (entry.measurements?.waist ? ' · waist ' + entry.measurements.waist + 'cm' : '') + '</div>';
      const db = document.createElement('button');
      db.className = 'tr-icon-btn danger';
      db.textContent = '×';
      db.addEventListener('click', async () => {
        if (!confirm('Delete this entry?')) return;
        await dbDeleteBodyWeight(entry.id);
        trRenderBody(onRefreshTiles);
        if (onRefreshTiles) onRefreshTiles();
      });
      row.appendChild(inf); row.appendChild(db);
      lc.appendChild(row);
    });
  }

  const as = document.createElement('div');
  as.style.cssText = 'border-top:1px solid var(--border);padding-top:14px;margin-top:14px;';
  const al = document.createElement('div');
  al.className = 'tr-form-label';
  al.textContent = 'Log Weight';
  const fr = document.createElement('div');
  fr.style.cssText = 'display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;';
  const ki = document.createElement('input');
  ki.className = 'tr-input';
  ki.type = 'number';
  ki.step = '0.1';
  ki.min = '0';
  ki.placeholder = 'Weight (kg)';
  ki.inputMode = 'decimal';
  ki.style.flex = '1';
  const wi = document.createElement('input');
  wi.className = 'tr-input';
  wi.type = 'number';
  wi.step = '0.5';
  wi.min = '0';
  wi.placeholder = 'Waist cm (opt.)';
  wi.inputMode = 'decimal';
  wi.style.flex = '1';
  fr.appendChild(ki); fr.appendChild(wi);
  const ab = document.createElement('button');
  ab.className = 'tr-primary-btn';
  ab.textContent = '+ Log Weight';
  ab.addEventListener('click', async () => {
    const kg = parseFloat(ki.value);
    if (!kg || kg <= 0) return;
    const entry = { date: getActiveDateString(), kg };
    const w = parseFloat(wi.value);
    if (w > 0) entry.measurements = { waist: w };
    await dbAddBodyWeight(entry);
    ki.value = ''; wi.value = '';
    trRenderBody(onRefreshTiles);
    if (onRefreshTiles) onRefreshTiles();
  });
  ki.addEventListener('keydown', e => { if (e.key === 'Enter') ab.click(); });
  as.appendChild(al); as.appendChild(fr); as.appendChild(ab);
  lc.appendChild(as);
  container.appendChild(lc);
}
