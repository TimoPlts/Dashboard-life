import {
  trGetAllSessions, trGetPRs, trGenId, epley,
  dbSaveSession, dbSavePR, setPRsCache, invalidateCaches
} from './db.js';
import { showLoading, showToast, formatDate } from './ui.js';

function hevyParseCSV(text) {
  const lines = text.split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));

  function col(row, name) {
    const idx = header.indexOf(name);
    if (idx === -1) return '';
    const val = row[idx] || '';
    return val.replace(/^"|"$/g, '').trim();
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = [];
    let cur = '', inQ = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { row.push(cur); cur = ''; }
      else { cur += ch; }
    }
    row.push(cur);
    rows.push(row);
  }

  const sessionMap = new Map();
  rows.forEach(row => {
    const title = col(row, 'title');
    const startTime = col(row, 'start_time');
    if (!title || !startTime) return;

    const sessionKey = title + '|' + startTime;
    if (!sessionMap.has(sessionKey)) {
      const dateMatch = startTime.match(/(\d{4}-\d{2}-\d{2})/);
      const dateStr = dateMatch ? dateMatch[1] : startTime.slice(0, 10);
      sessionMap.set(sessionKey, {
        day: title,
        date: dateStr,
        done: true,
        exercises: [],
        _exMap: new Map(),
      });
    }

    const session = sessionMap.get(sessionKey);
    const exTitle = col(row, 'exercise_title');
    if (!exTitle) return;

    if (!session._exMap.has(exTitle)) {
      const exObj = { id: trGenId(), name: exTitle, sets: [] };
      session._exMap.set(exTitle, exObj);
      session.exercises.push(exObj);
    }

    const ex = session._exMap.get(exTitle);
    const setType = col(row, 'set_type');
    if (setType === 'warmup') return;

    let weightKg = parseFloat(col(row, 'weight_kg'));
    if (isNaN(weightKg) || weightKg === 0) {
      const lbs = parseFloat(col(row, 'weight_lbs'));
      weightKg = isNaN(lbs) ? 0 : Math.round(lbs / 2.20462 * 4) / 4;
    }
    const reps = parseInt(col(row, 'reps')) || 0;

    if (weightKg > 0 || reps > 0) {
      ex.sets.push({ weight: weightKg, reps, done: true });
    }
  });

  return Array.from(sessionMap.values()).map(s => {
    delete s._exMap;
    return s;
  });
}

async function hevyImport(sessions) {
  let imported = 0, skipped = 0;
  const existingRows = await trGetAllSessions();
  const existingDates = new Set(existingRows.map(r => r.date));
  const prs = await trGetPRs();

  for (const session of sessions) {
    if (existingDates.has(session.date)) { skipped++; continue; }

    session.exercises.forEach(ex => {
      ex.sets.forEach(set => {
        if (set.weight > 0 && set.reps > 0) {
          const cur = prs[ex.id] || { maxWeight: 0, maxE1RM: 0, date: '' };
          const e1rm = Math.round(epley(set.weight, set.reps) * 10) / 10;
          if (set.weight > cur.maxWeight) cur.maxWeight = set.weight;
          if (e1rm > cur.maxE1RM) cur.maxE1RM = e1rm;
          cur.name = ex.name;
          cur.date = session.date;
          prs[ex.id] = cur;
        }
      });
    });

    await dbSaveSession(session.date, session);
    imported++;
  }

  setPRsCache(prs);
  for (const [exId, pr] of Object.entries(prs)) await dbSavePR(exId, pr);
  invalidateCaches();
  return { imported, skipped };
}

function hevyShowImportUI(container, onRefreshTiles, onNavHistory) {
  container.innerHTML = '';

  const bb = document.createElement('button');
  bb.className = 'tr-secondary-btn';
  bb.style.marginBottom = '16px';
  bb.textContent = '← Back';
  bb.addEventListener('click', () => { if (onNavHistory) onNavHistory(); else trRenderHistory(onRefreshTiles); });
  container.appendChild(bb);

  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('div');
  title.className = 'eyebrow';
  title.textContent = 'Import from Hevy';
  card.appendChild(title);

  const steps = document.createElement('div');
  steps.style.cssText = 'font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:18px;';
  steps.innerHTML =
    '<strong style="color:var(--text-primary);">How to export from Hevy:</strong><br>' +
    '1. Open Hevy → Profile → ⚙️ Settings<br>' +
    '2. Export &amp; Import Data → <strong style="color:var(--text-primary);">Export Workouts</strong><br>' +
    '3. Save the CSV file, then select it below.';
  card.appendChild(steps);

  const note = document.createElement('div');
  note.style.cssText = 'font-size:11px;color:var(--text-tertiary);padding:9px 12px;background:rgba(242,192,99,0.07);border:1px solid rgba(242,192,99,0.18);border-radius:var(--radius-sm);margin-bottom:18px;';
  note.textContent = 'Already-imported sessions are skipped automatically. Warmup sets are ignored.';
  card.appendChild(note);

  const dropZone = document.createElement('label');
  dropZone.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:28px 20px;border:1.5px dashed var(--border-strong);border-radius:var(--radius-md);cursor:pointer;transition:border-color 0.15s,background 0.15s;text-align:center;';
  dropZone.innerHTML =
    '<span style="font-size:28px;">📂</span>' +
    '<span style="font-size:13px;font-weight:600;color:var(--text-primary);">Select Hevy CSV file</span>' +
    '<span style="font-size:11px;color:var(--text-tertiary);">or drag and drop here</span>';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.csv,text/csv';
  fileInput.style.display = 'none';
  dropZone.appendChild(fileInput);

  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--success)'; dropZone.style.background = 'rgba(107,227,164,0.05)'; });
  dropZone.addEventListener('dragleave', () => { dropZone.style.borderColor = ''; dropZone.style.background = ''; });
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.style.borderColor = ''; dropZone.style.background = '';
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) processFile(fileInput.files[0]); });
  card.appendChild(dropZone);

  const statusEl = document.createElement('div');
  statusEl.style.cssText = 'margin-top:14px;font-size:12.5px;color:var(--text-tertiary);text-align:center;min-height:20px;';
  card.appendChild(statusEl);

  container.appendChild(card);

  function processFile(file) {
    statusEl.textContent = 'Reading file…';
    statusEl.style.color = 'var(--text-tertiary)';
    const reader = new FileReader();
    reader.onload = async e => {
      try {
        const sessions = hevyParseCSV(e.target.result);
        if (sessions.length === 0) {
          statusEl.textContent = "No workouts found in file — check it's the Hevy export CSV.";
          statusEl.style.color = 'var(--danger)';
          return;
        }
        statusEl.textContent = 'Importing ' + sessions.length + ' sessions…';
        const { imported, skipped } = await hevyImport(sessions);
        statusEl.style.color = 'var(--success)';
        statusEl.textContent = '✓ Imported ' + imported + ' session' + (imported !== 1 ? 's' : '') +
          (skipped > 0 ? ' · ' + skipped + ' already existed' : '') + '.';
        if (onRefreshTiles) onRefreshTiles();
        setTimeout(() => trRenderHistory(onRefreshTiles), 1200);
      } catch (err) {
        statusEl.textContent = 'Failed: ' + err.message;
        statusEl.style.color = 'var(--danger)';
      }
    };
    reader.readAsText(file);
  }
}

export async function trRenderHistory(onRefreshTiles) {
  const container = document.getElementById('trHistoryContent');
  showLoading(container);
  const allSessions = await trGetAllSessions();
  container.innerHTML = '';

  const importBtn = document.createElement('button');
  importBtn.className = 'tr-secondary-btn';
  importBtn.style.cssText = 'width:100%;margin-bottom:14px;display:flex;align-items:center;justify-content:center;gap:8px;';
  importBtn.innerHTML = '📥 Import from Hevy (CSV)';
  importBtn.addEventListener('click', () => hevyShowImportUI(container, onRefreshTiles, () => trRenderHistory(onRefreshTiles)));
  container.appendChild(importBtn);

  if (allSessions.length === 0) {
    const e = document.createElement('div');
    e.className = 'empty-state';
    e.style.padding = '40px 0';
    e.textContent = 'No sessions yet — log a workout or import from Hevy.';
    container.appendChild(e);
    return;
  }

  allSessions.forEach(row => {
    const session = row.data;
    if (!session) return;
    const dateStr = row.date;
    const doneSets = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    const totalSets = session.exercises.reduce((a, ex) => a + ex.sets.length, 0);
    const vol = session.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).reduce((b, s) => b + s.weight * s.reps, 0), 0);

    const entry = document.createElement('div');
    entry.className = 'hist-entry';

    const header = document.createElement('div');
    header.className = 'hist-entry-header';
    const icon = document.createElement('div');
    icon.className = 'hist-entry-icon';
    icon.textContent = session.done ? '✅' : '🏋️';
    const info = document.createElement('div');
    info.className = 'hist-entry-info';
    info.innerHTML =
      '<div class="hist-entry-day">' + session.day + '</div>' +
      '<div class="hist-entry-meta">' + formatDate(dateStr) + ' · ' + session.exercises.length + ' exercises · ' + doneSets + '/' + totalSets + ' sets</div>';
    const volEl = document.createElement('div');
    volEl.className = 'hist-entry-vol';
    volEl.textContent = vol > 0 ? (vol >= 1000 ? (vol/1000).toFixed(1) + 't' : Math.round(vol) + 'kg') : '—';
    const chev = document.createElement('div');
    chev.className = 'hist-entry-chevron';
    chev.textContent = '›';
    header.appendChild(icon);
    header.appendChild(info);
    header.appendChild(volEl);
    header.appendChild(chev);

    const detail = document.createElement('div');
    detail.className = 'hist-entry-detail';

    session.exercises.forEach(ex => {
      const exBlock = document.createElement('div');
      exBlock.className = 'hist-ex-block';
      const exName = document.createElement('div');
      exName.className = 'hist-ex-name';
      exName.textContent = ex.name;
      exBlock.appendChild(exName);
      ex.sets.forEach((s, i) => {
        if (!s.done) return;
        const line = document.createElement('div');
        line.className = 'hist-set-line';
        line.innerHTML =
          '<span>S' + (i+1) + '</span>' +
          '<span>' + s.weight + ' kg × ' + s.reps + '</span>' +
          '<span style="color:var(--text-tertiary);">≈ ' + (Math.round(epley(s.weight,s.reps)*10)/10) + ' e1RM</span>';
        exBlock.appendChild(line);
      });
      detail.appendChild(exBlock);
    });

    header.addEventListener('click', () => {
      entry.classList.toggle('open');
    });

    entry.appendChild(header);
    entry.appendChild(detail);
    container.appendChild(entry);
  });
}
