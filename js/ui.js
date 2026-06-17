export function showToast(msg, type) {
  const t = document.createElement('div');
  const ok = type !== 'error';
  t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:10px 18px;border-radius:10px;font-size:12.5px;font-weight:600;z-index:9999;pointer-events:none;transition:opacity 0.3s;white-space:nowrap;' +
    (ok ? 'background:rgba(107,227,164,0.12);border:1px solid rgba(107,227,164,0.25);color:#6BE3A4;' : 'background:rgba(255,107,107,0.12);border:1px solid rgba(255,107,107,0.25);color:#FF6B6B;');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000);
}

export function showLoading(container) {
  container.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;padding:48px 0;color:var(--text-tertiary);font-size:12px;font-family:var(--font-mono);letter-spacing:0.1em;gap:10px;"><span style="width:16px;height:16px;border:2px solid rgba(255,255,255,0.14);border-top-color:var(--text-primary);border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite;"></span>Loading</div>';
}

export function pad2(n) { return String(n).padStart(2, '0'); }

export function getActiveDateString() {
  const now = new Date();
  if (now.getHours() < 6) {
    const d = new Date(now);
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`;
  }
  return `${now.getFullYear()}-${pad2(now.getMonth()+1)}-${pad2(now.getDate())}`;
}

export function formatDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${d}`;
}

export function formatDateLong(str) {
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return `${days[dt.getDay()]}, ${months[dt.getMonth()]} ${d}`;
}

export function fmtHM(totalMinutes) {
  const h = Math.floor(totalMinutes / 60);
  const m = Math.round(totalMinutes % 60);
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

export function fmtClock(now) {
  let h = now.getHours();
  const m = pad2(now.getMinutes());
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

export function trLineChart(values, color) {
  const W = 300, H = 60;
  const mn = Math.min(...values), mx = Math.max(...values);
  const rng = mx - mn || 1;
  const pts = values.map((v, i) => [
    (i / (values.length - 1)) * (W - 20) + 10,
    H - 8 - ((v - mn) / rng) * (H - 18)
  ]);
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
  svg.setAttribute('preserveAspectRatio', 'none');

  const areaD = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ') +
    ' L' + pts[pts.length-1][0] + ',' + H + ' L' + pts[0][0] + ',' + H + ' Z';
  const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  area.setAttribute('d', areaD);
  area.setAttribute('fill', color + '18');
  svg.appendChild(area);

  const lineD = pts.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', lineD);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', color);
  line.setAttribute('stroke-width', '2');
  line.setAttribute('stroke-linecap', 'round');
  line.setAttribute('stroke-linejoin', 'round');
  const L = pts.reduce((a, p, i) => i ? a + Math.hypot(p[0]-pts[i-1][0], p[1]-pts[i-1][1]) : 0, 0) + 10;
  line.style.cssText = 'stroke-dasharray:' + L + ';stroke-dashoffset:' + L + ';transition:stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1);';
  svg.appendChild(line);

  const [lx, ly] = pts[pts.length - 1];
  const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  dot.setAttribute('cx', lx); dot.setAttribute('cy', ly); dot.setAttribute('r', '3');
  dot.setAttribute('fill', color);
  svg.appendChild(dot);

  requestAnimationFrame(() => requestAnimationFrame(() => { line.style.strokeDashoffset = '0'; }));
  return svg;
}
