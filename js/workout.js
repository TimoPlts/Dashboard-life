import {
  trGetRoutine, trSaveRoutine, trGetSession, trSaveSession,
  trGetAllSessions, trGetPRs, trGenId, epley,
  invalidateCaches, dbSavePR
} from './db.js';
import { showLoading, showToast, pad2, getActiveDateString, formatDate } from './ui.js';

let trRestInterval = null;
let trRestSecs = 0;

function trDetectTodayDay(allSessions) {
  const todayDow = new Date().getDay();
  const dowDayName = {};
  allSessions.forEach(row => {
    const s = row.data;
    if (!s || !s.day || !row.date) return;
    const [y,m,d] = row.date.split('-').map(Number);
    const dow = new Date(y, m-1, d).getDay();
    if (!dowDayName[dow]) dowDayName[dow] = {};
    dowDayName[dow][s.day] = (dowDayName[dow][s.day] || 0) + 1;
  });
  const candidates = dowDayName[todayDow];
  if (!candidates) return null;
  return Object.entries(candidates).sort((a,b) => b[1]-a[1])[0][0];
}

function trLastSessionForEx(allSessions, exName) {
  const sorted = [...allSessions].sort((a,b) => b.date.localeCompare(a.date));
  for (const row of sorted) {
    const s = row.data;
    if (!s) continue;
    const ex = s.exercises?.find(e => e.name.toLowerCase() === exName.toLowerCase());
    if (!ex) continue;
    const doneSets = ex.sets.filter(s => s.done && s.weight > 0);
    if (doneSets.length === 0) continue;
    return { date: row.date, sets: doneSets };
  }
  return null;
}

async function trUpdatePRs(exId, exName, weight, reps, date) {
  const prs = await trGetPRs();
  const cur = prs[exId] || { maxWeight: 0, maxE1RM: 0, date: '' };
  const e1rm = Math.round(epley(weight, reps) * 10) / 10;
  let newPR = false;
  if (weight > cur.maxWeight) { cur.maxWeight = weight; newPR = true; }
  if (e1rm > cur.maxE1RM) { cur.maxE1RM = e1rm; newPR = true; }
  cur.name = exName;
  if (newPR) { cur.date = date; cur.newToday = true; }
  prs[exId] = cur;
  await dbSavePR(exId, cur);
}

function trStartRest() {
  trStopRest();
  trRestSecs = 0;
  const timer = document.getElementById('trRestTimer');
  if (timer) timer.classList.add('active');
  trRestInterval = setInterval(() => {
    trRestSecs++;
    const lbl = document.getElementById('trRestLabel');
    if (lbl) lbl.textContent = 'Rest: ' + Math.floor(trRestSecs/60) + ':' + pad2(trRestSecs%60);
  }, 1000);
}

function trStopRest() {
  if (trRestInterval) { clearInterval(trRestInterval); trRestInterval = null; }
  const timer = document.getElementById('trRestTimer');
  if (timer) timer.classList.remove('active');
}

export function stopRest() { trStopRest(); }

export async function trRenderWorkout(onNavHistory, onRefreshTiles) {
  const container = document.getElementById('trWorkoutContent');
  showLoading(container);
  const [routine, allSessions] = await Promise.all([trGetRoutine(), trGetAllSessions()]);
  container.innerHTML = '';
  const units = routine.units || 'kg';
  const today = getActiveDateString();
  const todaySession = await trGetSession(today);

  // Units toggle
  const unitsRow = document.createElement('div');
  unitsRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;';
  const unitsLabel = document.createElement('span');
  unitsLabel.style.cssText = 'font-size:10px;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:0.14em;font-weight:700;';
  unitsLabel.textContent = 'Units';
  const tog = document.createElement('div');
  tog.className = 'tr-units-toggle';
  ['kg', 'lb'].forEach(u => {
    const b = document.createElement('button');
    b.className = 'tr-units-btn' + (units === u ? ' active' : '');
    b.textContent = u;
    b.addEventListener('click', async () => {
      routine.units = u;
      await trSaveRoutine(routine);
      invalidateCaches();
      trRenderWorkout(onNavHistory, onRefreshTiles);
    });
    tog.appendChild(b);
  });
  unitsRow.appendChild(unitsLabel);
  unitsRow.appendChild(tog);
  container.appendChild(unitsRow);

  const suggestedDay = todaySession ? todaySession.day : trDetectTodayDay(allSessions);
  const DOW_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const todayDowName = DOW_NAMES[new Date().getDay()];

  if (!todaySession) {
    const banner = document.createElement('div');
    banner.className = 'wk-day-banner';
    banner.innerHTML =
      '<div><div class="wk-day-name">' + todayDowName + '</div>' +
      '<div class="wk-day-sub">What are you training today?</div></div>' +
      (suggestedDay ? '<div class="wk-day-badge">Suggested: ' + suggestedDay + '</div>' : '');
    container.appendChild(banner);

    if (routine.days.length > 0) {
      const tabs = document.createElement('div');
      tabs.className = 'tr-day-tabs';
      tabs.style.marginBottom = '14px';
      routine.days.forEach(day => {
        const tab = document.createElement('button');
        tab.className = 'tr-day-tab' + (day.name === suggestedDay ? ' active' : '');
        tab.textContent = day.name;
        tab.addEventListener('click', () => {
          trStartSessionFromRoutine(day.name, today, routine, allSessions, onNavHistory, onRefreshTiles);
        });
        tabs.appendChild(tab);
      });
      container.appendChild(tabs);
    }

    const emptyWrap = document.createElement('div');
    emptyWrap.className = 'wk-empty-start';
    if (routine.days.length === 0) {
      emptyWrap.innerHTML =
        '<div class="wk-empty-icon">🏋️</div>' +
        '<div class="wk-empty-text">No routine configured</div>' +
        '<div class="wk-empty-sub">Start an empty workout or import your Hevy history</div>';
    } else {
      emptyWrap.style.paddingTop = '18px';
      emptyWrap.style.paddingBottom = '16px';
      emptyWrap.innerHTML = '<div class="wk-empty-sub">Or start a free-form session</div>';
    }
    const startBtn = document.createElement('button');
    startBtn.className = 'tr-primary-btn';
    startBtn.style.maxWidth = '260px';
    startBtn.textContent = '+ Start Empty Workout';
    startBtn.addEventListener('click', () => {
      trStartEmptySession(today).then(() => trRenderWorkout(onNavHistory, onRefreshTiles));
    });
    emptyWrap.appendChild(startBtn);
    container.appendChild(emptyWrap);
  } else {
    const banner = document.createElement('div');
    banner.className = 'wk-day-banner';
    const setsTotal = todaySession.exercises.reduce((a, ex) => a + ex.sets.length, 0);
    const setsDone = todaySession.exercises.reduce((a, ex) => a + ex.sets.filter(s => s.done).length, 0);
    banner.innerHTML =
      '<div><div class="wk-day-name">' + todaySession.day + '</div>' +
      '<div class="wk-day-sub">' + todayDowName + ' · ' + formatDate(today) + '</div></div>' +
      '<div class="wk-day-badge">' + (todaySession.done ? '✓ Done' : setsDone + '/' + setsTotal) + '</div>';
    container.appendChild(banner);
    trRenderNewSessionSets(container, today, units, allSessions, onRefreshTiles, () => trRenderWorkout(onNavHistory, onRefreshTiles));
  }

  // Add exercises to existing session
  if (todaySession && !todaySession.done) {
    const addExCard = document.createElement('div');
    addExCard.style.cssText = 'background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-md);padding:14px;margin-top:4px;margin-bottom:10px;';
    const addLabel = document.createElement('div');
    addLabel.className = 'eyebrow';
    addLabel.textContent = 'Add Exercise';
    const addRow = document.createElement('div');
    addRow.style.cssText = 'display:flex;gap:8px;';
    const addInput = document.createElement('input');
    addInput.className = 'tr-input';
    addInput.placeholder = 'Exercise name…';
    addInput.style.flex = '1';
    const addBtn = document.createElement('button');
    addBtn.className = 'tr-secondary-btn';
    addBtn.textContent = '+ Add';
    addBtn.addEventListener('click', async () => {
      const n = addInput.value.trim();
      if (!n) return;
      const s = await trGetSession(today);
      const sessions = await trGetAllSessions();
      const last = trLastSessionForEx(sessions, n);
      const defW = last ? last.sets[0].weight : 20;
      const defR = last ? last.sets[0].reps : 8;
      s.exercises.push({ id: trGenId(), name: n, sets: [
        { weight: defW, reps: defR, done: false },
        { weight: defW, reps: defR, done: false },
        { weight: defW, reps: defR, done: false },
      ]});
      await trSaveSession(today, s);
      trRenderWorkout(onNavHistory, onRefreshTiles);
    });
    addInput.addEventListener('keydown', e => { if (e.key === 'Enter') addBtn.click(); });
    addRow.appendChild(addInput);
    addRow.appendChild(addBtn);
    addExCard.appendChild(addLabel);
    addExCard.appendChild(addRow);
    container.appendChild(addExCard);
  }

  // Editor toggle
  const editBtn = document.createElement('button');
  editBtn.className = 'tr-secondary-btn';
  editBtn.style.cssText = 'width:100%;margin-top:4px;margin-bottom:8px;';
  editBtn.textContent = '⚙️ Edit Training Split';
  let editorOpen = false;
  const editorWrap = document.createElement('div');
  editorWrap.style.display = 'none';
  editBtn.addEventListener('click', async () => {
    editorOpen = !editorOpen;
    editorWrap.style.display = editorOpen ? '' : 'none';
    editBtn.textContent = editorOpen ? '✕ Close Editor' : '⚙️ Edit Training Split';
    if (editorOpen) trBuildRoutineEditor(editorWrap, routine, units, onNavHistory, onRefreshTiles);
  });
  container.appendChild(editBtn);
  trBuildRoutineEditor(editorWrap, routine, units, onNavHistory, onRefreshTiles);
  container.appendChild(editorWrap);

  // History link
  const histLink = document.createElement('button');
  histLink.className = 'wk-history-link';
  histLink.innerHTML = '📅 View Session History';
  histLink.addEventListener('click', () => { if (onNavHistory) onNavHistory(); });
  container.appendChild(histLink);
}

export async function trStartSessionFromRoutine(dayName, date, routine, allSessions, onNavHistory, onRefreshTiles) {
  const existing = await trGetSession(date);
  if (existing && existing.day === dayName) return trRenderWorkout(onNavHistory, onRefreshTiles);
  const day = routine.days.find(d => d.name === dayName);
  if (!day) return;
  const sessions = allSessions || await trGetAllSessions();
  const session = {
    day: dayName, done: false, date,
    exercises: day.exercises.map(ex => {
      const last = trLastSessionForEx(sessions, ex.name);
      const defW = last ? last.sets[0].weight : (ex.weight || 20);
      const defR = last ? last.sets[0].reps : (ex.repMin || 8);
      return {
        id: ex.id, name: ex.name,
        sets: Array.from({ length: ex.sets || 3 }, () => ({ weight: defW, reps: defR, done: false }))
      };
    })
  };
  await trSaveSession(date, session);
  trRenderWorkout(onNavHistory, onRefreshTiles);
}

export async function trStartEmptySession(date) {
  const session = { day: 'Workout', done: false, date, exercises: [] };
  await trSaveSession(date, session);
}

export async function trRenderNewSessionSets(container, date, units, allSessions, onRefreshTiles, onRerender) {
  const session = await trGetSession(date);
  if (!session) return;
  const prs = await trGetPRs();

  const restEl = document.createElement('div');
  restEl.className = 'tr-rest-timer';
  restEl.id = 'trRestTimer';
  restEl.innerHTML = '<div class="tr-rest-label" id="trRestLabel">Rest: 0:00</div><button class="tr-rest-stop" id="trRestStop">Stop</button>';
  container.appendChild(restEl);
  document.getElementById('trRestStop').addEventListener('click', trStopRest);

  session.exercises.forEach((ex, exIdx) => {
    const last = trLastSessionForEx(allSessions || [], ex.name);
    const card = document.createElement('div');
    card.className = 'wk-ex-card';

    const hdr = document.createElement('div');
    hdr.className = 'wk-ex-header';
    const nameEl = document.createElement('div');
    nameEl.className = 'wk-ex-name';
    nameEl.textContent = ex.name;
    hdr.appendChild(nameEl);
    if (prs[ex.id]?.newToday) {
      const badge = document.createElement('span');
      badge.className = 'tr-new-pr-flash';
      badge.textContent = '🏆 PR';
      hdr.appendChild(badge);
    }
    card.appendChild(hdr);

    if (last) {
      const lastEl = document.createElement('div');
      lastEl.className = 'wk-ex-last';
      const bestSet = last.sets.reduce((a, s) => epley(s.weight, s.reps) > epley(a.weight, a.reps) ? s : a);
      lastEl.textContent = 'Last (' + formatDate(last.date) + '): ' + bestSet.weight + units + ' × ' + bestSet.reps;
      card.appendChild(lastEl);
    }

    ex.sets.forEach((set, setIdx) => {
      const row = document.createElement('div');
      row.className = 'wk-set-row';

      const num = document.createElement('div');
      num.className = 'wk-set-num';
      num.textContent = 'S' + (setIdx + 1);

      const wInp = document.createElement('input');
      wInp.className = 'wk-set-input';
      wInp.type = 'number';
      wInp.value = set.weight;
      wInp.min = '0';
      wInp.step = '0.5';
      wInp.inputMode = 'decimal';

      const xEl = document.createElement('span');
      xEl.className = 'wk-set-x';
      xEl.textContent = '×';

      const rInp = document.createElement('input');
      rInp.className = 'wk-set-input';
      rInp.type = 'number';
      rInp.value = set.reps;
      rInp.min = '0';
      rInp.step = '1';
      rInp.inputMode = 'numeric';

      const ghost = document.createElement('div');
      ghost.className = 'wk-set-ghost';
      if (last && last.sets[setIdx]) {
        const gs = last.sets[setIdx];
        ghost.textContent = gs.weight + '×' + gs.reps;
      }

      const check = document.createElement('div');
      check.className = 'wk-set-check' + (set.done ? ' done' : '');
      check.textContent = set.done ? '✓' : '';
      check.addEventListener('click', async () => {
        const s = await trGetSession(date);
        const w = parseFloat(wInp.value) || 0;
        const r = parseInt(rInp.value) || 0;
        s.exercises[exIdx].sets[setIdx].weight = w;
        s.exercises[exIdx].sets[setIdx].reps = r;
        const wasDone = s.exercises[exIdx].sets[setIdx].done;
        s.exercises[exIdx].sets[setIdx].done = !wasDone;
        await trSaveSession(date, s);
        if (!wasDone && w > 0 && r > 0) {
          await trUpdatePRs(ex.id, ex.name, w, r, date);
          trStartRest();
        }
        if (onRerender) onRerender();
      });

      row.appendChild(num);
      row.appendChild(wInp);
      row.appendChild(xEl);
      row.appendChild(rInp);
      row.appendChild(ghost);
      row.appendChild(check);
      card.appendChild(row);
    });

    container.appendChild(card);
  });

  if (session.exercises.length > 0) {
    const completeBtn = document.createElement('button');
    completeBtn.className = 'tr-primary-btn';
    completeBtn.style.marginTop = '4px';
    if (session.done) {
      completeBtn.textContent = '✓ Session Complete';
      completeBtn.disabled = true;
    } else {
      completeBtn.textContent = 'Complete Session ✓';
      completeBtn.addEventListener('click', async () => {
        const s = await trGetSession(date);
        s.done = true;
        await trSaveSession(date, s);
        trStopRest();
        if (onRerender) onRerender();
        if (onRefreshTiles) onRefreshTiles();
      });
    }
    container.appendChild(completeBtn);
  }
}

export function trBuildRoutineEditor(wrap, routine, units, onNavHistory, onRefreshTiles) {
  wrap.innerHTML = '';
  const card = document.createElement('div');
  card.className = 'card';

  const title = document.createElement('div');
  title.className = 'eyebrow';
  title.textContent = 'Training Split';
  card.appendChild(title);

  routine.days.forEach((day, dayIdx) => {
    const dc = document.createElement('div');
    dc.style.cssText = 'background:var(--surface);border-radius:var(--radius-md);border:1px solid var(--border);padding:14px;margin-bottom:10px;';

    const dh = document.createElement('div');
    dh.style.cssText = 'display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;';
    const dn = document.createElement('span');
    dn.style.cssText = 'font-weight:700;font-size:14px;color:var(--text-primary);';
    dn.textContent = day.name;
    const db = document.createElement('button');
    db.className = 'tr-icon-btn danger';
    db.textContent = '🗑';
    db.addEventListener('click', async () => {
      if (!confirm('Delete "' + day.name + '" and all its exercises?')) return;
      routine.days.splice(dayIdx, 1);
      await trSaveRoutine(routine);
      invalidateCaches();
      trRenderWorkout(onNavHistory, onRefreshTiles);
    });
    dh.appendChild(dn);
    dh.appendChild(db);
    dc.appendChild(dh);

    day.exercises.forEach((ex, exIdx) => {
      const er = document.createElement('div');
      er.style.cssText = 'display:flex;align-items:center;gap:6px;margin-bottom:6px;';
      const el = document.createElement('span');
      el.style.cssText = 'flex:1;font-size:12px;color:var(--text-secondary);';
      el.textContent = ex.name + ' — ' + ex.sets + '×' + ex.repMin + '–' + ex.repMax + ' @ ' + ex.weight + units;
      const xb = document.createElement('button');
      xb.className = 'tr-icon-btn danger';
      xb.textContent = '×';
      xb.addEventListener('click', async () => {
        if (!confirm('Remove "' + ex.name + '"?')) return;
        day.exercises.splice(exIdx, 1);
        await trSaveRoutine(routine);
        invalidateCaches();
        trRenderWorkout(onNavHistory, onRefreshTiles);
      });
      er.appendChild(el);
      er.appendChild(xb);
      dc.appendChild(er);
    });

    const sep = document.createElement('div');
    sep.style.cssText = 'border-top:1px solid var(--border);padding-top:10px;margin-top:10px;';
    const fl = document.createElement('div');
    fl.className = 'tr-form-label';
    fl.textContent = 'Add Exercise';
    const ni = document.createElement('input');
    ni.className = 'tr-input';
    ni.style.marginBottom = '8px';
    ni.placeholder = 'Exercise name…';

    const lblRow = document.createElement('div');
    lblRow.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:3px;';
    ['Sets','Min','Max','Wt','Inc'].forEach(t => {
      const l = document.createElement('div');
      l.className = 'tr-form-label';
      l.style.textAlign = 'center';
      l.textContent = t;
      lblRow.appendChild(l);
    });

    const numRow = document.createElement('div');
    numRow.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:5px;margin-bottom:8px;';
    const numInps = ['3','8','12','20','2.5'].map(d => {
      const i = document.createElement('input');
      i.className = 'tr-input';
      i.style.textAlign = 'center';
      i.type = 'number';
      i.value = d;
      i.min = '0';
      i.step = '0.5';
      numRow.appendChild(i);
      return i;
    });

    const addExBtn = document.createElement('button');
    addExBtn.className = 'tr-secondary-btn';
    addExBtn.style.width = '100%';
    addExBtn.textContent = '+ Add Exercise';
    addExBtn.addEventListener('click', async () => {
      const n = ni.value.trim();
      if (!n) return;
      day.exercises.push({ id: trGenId(), name: n, sets: parseInt(numInps[0].value)||3, repMin: parseInt(numInps[1].value)||8, repMax: parseInt(numInps[2].value)||12, weight: parseFloat(numInps[3].value)||20, increment: parseFloat(numInps[4].value)||2.5 });
      await trSaveRoutine(routine);
      invalidateCaches();
      ni.value = '';
      trRenderWorkout(onNavHistory, onRefreshTiles);
    });
    ni.addEventListener('keydown', e => { if (e.key === 'Enter') addExBtn.click(); });

    sep.appendChild(fl);
    sep.appendChild(ni);
    sep.appendChild(lblRow);
    sep.appendChild(numRow);
    sep.appendChild(addExBtn);
    dc.appendChild(sep);
    card.appendChild(dc);
  });

  const addDay = document.createElement('div');
  addDay.style.cssText = 'border-top:1px solid var(--border);padding-top:14px;margin-top:4px;';
  const adl = document.createElement('div');
  adl.className = 'tr-form-label';
  adl.textContent = 'Add Training Day';
  const adr = document.createElement('div');
  adr.style.cssText = 'display:flex;gap:8px;';
  const adi = document.createElement('input');
  adi.className = 'tr-input';
  adi.placeholder = 'e.g. Push, Pull, Legs…';
  const adb = document.createElement('button');
  adb.className = 'tr-primary-btn';
  adb.style.cssText = 'width:auto;padding:12px 20px;';
  adb.textContent = '+ Day';
  adb.addEventListener('click', async () => {
    const n = adi.value.trim();
    if (!n) return;
    routine.days.push({ name: n, exercises: [] });
    await trSaveRoutine(routine);
    invalidateCaches();
    adi.value = '';
    trRenderWorkout(onNavHistory, onRefreshTiles);
  });
  adi.addEventListener('keydown', e => { if (e.key === 'Enter') adb.click(); });
  adr.appendChild(adi);
  adr.appendChild(adb);
  addDay.appendChild(adl);
  addDay.appendChild(adr);
  card.appendChild(addDay);
  wrap.appendChild(card);
}
