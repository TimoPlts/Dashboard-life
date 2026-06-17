import { trGetRoutine, trGetAllSessions, trGetPRs, epley } from './db.js';
import { showLoading, trLineChart } from './ui.js';

function trGetExHistoryByNameSync(allSessions, exName) {
  const sorted = [...allSessions].sort((a,b) => a.date.localeCompare(b.date));
  const out = [];
  for (const row of sorted) {
    const s = row.data;
    if (!s) continue;
    const ex = s.exercises?.find(e => e.name?.toLowerCase() === exName.toLowerCase());
    if (!ex) continue;
    const done = ex.sets.filter(s => s.done && s.weight > 0 && s.reps > 0);
    if (!done.length) continue;
    const best = Math.max(...done.map(s => epley(s.weight, s.reps)));
    const vol = done.reduce((a, s) => a + s.weight * s.reps, 0);
    out.push({ date: row.date, e1rm: Math.round(best * 10) / 10, volume: Math.round(vol) });
  }
  return out;
}

export async function trRenderProgression() {
  const container = document.getElementById('trProgressionContent');
  showLoading(container);
  const [routine, allSessions, prs] = await Promise.all([trGetRoutine(), trGetAllSessions(), trGetPRs()]);
  container.innerHTML = '';
  const units = routine.units || 'kg';

  const exFrequency = {};
  allSessions.forEach(row => {
    const s = row.data;
    if (!s) return;
    s.exercises?.forEach(ex => {
      if (!ex.name) return;
      if (!exFrequency[ex.name]) exFrequency[ex.name] = { id: ex.id, count: 0, lastDate: '' };
      exFrequency[ex.name].count++;
      if (row.date > exFrequency[ex.name].lastDate) exFrequency[ex.name].lastDate = row.date;
    });
  });

  routine.days.flatMap(d => d.exercises).forEach(ex => {
    if (!exFrequency[ex.name]) exFrequency[ex.name] = { id: ex.id, count: 0, lastDate: '' };
  });

  const allExNames = Object.keys(exFrequency).sort((a, b) => exFrequency[b].count - exFrequency[a].count);

  if (allExNames.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:40px 0;">No sessions found. Log a workout or import from Hevy.</div>';
    return;
  }

  const searchWrap = document.createElement('div');
  searchWrap.className = 'prog-search';
  const searchIcon = document.createElement('div');
  searchIcon.className = 'prog-search-icon';
  searchIcon.textContent = '🔍';
  const searchInput = document.createElement('input');
  searchInput.className = 'prog-search-input';
  searchInput.placeholder = 'Search exercises…';
  searchInput.type = 'text';
  searchWrap.appendChild(searchIcon);
  searchWrap.appendChild(searchInput);
  container.appendChild(searchWrap);

  const listWrap = document.createElement('div');
  container.appendChild(listWrap);

  function renderExList(filter) {
    listWrap.innerHTML = '';
    const filtered = allExNames.filter(n => !filter || n.toLowerCase().includes(filter.toLowerCase()));
    if (filtered.length === 0) {
      listWrap.innerHTML = '<div class="empty-state">No exercises match "' + filter + '"</div>';
      return;
    }
    filtered.forEach(exName => {
      const info = exFrequency[exName];
      const exId = info.id;
      const pr = prs[exId];
      const history = trGetExHistoryByNameSync(allSessions, exName);

      const card = document.createElement('div');
      card.className = 'tr-prog-exercise';

      const hdr = document.createElement('div');
      hdr.className = 'tr-prog-ex-header';
      const nm = document.createElement('div');
      nm.style.display = 'flex';
      nm.style.alignItems = 'center';
      nm.style.gap = '8px';
      const nmText = document.createElement('div');
      nmText.className = 'tr-prog-ex-name';
      nmText.textContent = exName;
      nm.appendChild(nmText);
      if (info.count > 1) {
        const freq = document.createElement('span');
        freq.className = 'prog-freq-badge';
        freq.textContent = info.count + 'x';
        nm.appendChild(freq);
      }
      hdr.appendChild(nm);

      if (pr) {
        const nx = document.createElement('div');
        nx.className = 'tr-prog-ex-next';
        nx.textContent = pr.maxWeight + units + ' PR';
        hdr.appendChild(nx);
      }
      card.appendChild(hdr);

      if (pr) {
        const prRow = document.createElement('div');
        prRow.className = 'tr-prog-pr-row';
        [[pr.maxWeight + units, 'Best Weight'], [pr.maxE1RM + units, 'Est. 1RM']].forEach(([val, lbl], i) => {
          const b = document.createElement('div');
          b.className = 'tr-pr-badge' + (pr.newToday ? ' new-pr' : '');
          b.innerHTML = '<div class="tr-pr-value">' + val + '</div><div class="tr-pr-label">' + lbl + (i===0 && pr.newToday ? ' <span class="tr-new-pr-flash">🏆 PR!</span>' : '') + '</div>';
          prRow.appendChild(b);
        });
        card.appendChild(prRow);
      }

      if (history.length >= 2) {
        const cw = document.createElement('div');
        cw.className = 'tr-chart-wrap';
        cw.appendChild(trLineChart(history.map(h => h.e1rm), '#6BE3A4'));
        card.appendChild(cw);
        const cl = document.createElement('div');
        cl.style.cssText = 'font-size:10px;color:var(--text-tertiary);text-align:center;margin-top:6px;';
        cl.textContent = 'Est. 1RM trend · ' + history.length + ' sessions';
        card.appendChild(cl);
      } else if (history.length === 1) {
        const nd = document.createElement('div');
        nd.className = 'empty-state';
        nd.style.padding = '8px 0';
        nd.textContent = 'Log 1 more session to see trend.';
        card.appendChild(nd);
      } else {
        const nd = document.createElement('div');
        nd.className = 'empty-state';
        nd.style.padding = '8px 0';
        nd.textContent = 'No logged sets yet.';
        card.appendChild(nd);
      }

      listWrap.appendChild(card);
    });
  }

  renderExList('');
  searchInput.addEventListener('input', () => renderExList(searchInput.value));
}
