/* charts.js – Self-contained SVG chart module. No dependencies. */
(function () {
  const NS = 'http://www.w3.org/2000/svg';
  const DFL = '#4f8cff';
  const el = (tag, attrs = {}, parent) => {
    const e = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (parent) parent.appendChild(e);
    return e;
  };
  const div = (cls, parent) => { const d = document.createElement('div'); d.className = cls; if (parent) parent.appendChild(d); return d; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const observe = (node, cb) => {
    if (!('IntersectionObserver' in window)) { cb(); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { cb(); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(node);
  };

  /* ── lineChart ─────────────────────────────────────────────── */
  function lineChart(container, data, opts = {}) {
    container.innerHTML = '';
    if (!data || !data.length) return;
    const { color = DFL, targetValue, showDots = true, showArea = true, height = 200, animated = true } = opts;
    const W = 600, H = height, pad = { t: 20, r: 20, b: 30, l: 45 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const vals = data.map(d => d.value);
    let min = Math.min(...vals), max = Math.max(...vals);
    if (targetValue !== undefined) { min = Math.min(min, targetValue); max = Math.max(max, targetValue); }
    if (min === max) { min -= 1; max += 1; }
    const yScale = v => pad.t + ch - ((v - min) / (max - min)) * ch;
    const xScale = (_, i) => pad.l + (i / (data.length - 1 || 1)) * cw;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.display = 'block';
    container.appendChild(svg);

    // Y-axis labels
    [min, (min + max) / 2, max].forEach(v => {
      const t = el('text', { x: pad.l - 8, y: yScale(v) + 4, fill: '#888', 'font-size': '11', 'text-anchor': 'end', 'font-family': 'sans-serif' }, svg);
      t.textContent = Number.isInteger(v) ? v : v.toFixed(1);
    });

    // X-axis labels
    const step = Math.max(1, Math.floor(data.length / 6));
    data.forEach((d, i) => {
      if (i % step !== 0 && i !== data.length - 1) return;
      const t = el('text', { x: xScale(d, i), y: H - 6, fill: '#888', 'font-size': '10', 'text-anchor': 'middle', 'font-family': 'sans-serif' }, svg);
      t.textContent = d.label;
    });

    // Build points
    const pts = data.map((d, i) => [xScale(d, i), yScale(d.value)]);

    // Catmull-Rom to cubic bezier path
    const crPath = (points) => {
      if (points.length < 2) return `M${points[0][0]},${points[0][1]}`;
      let d = `M${points[0][0]},${points[0][1]}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i - 1] || points[i];
        const p1 = points[i], p2 = points[i + 1], p3 = points[i + 2] || p2;
        const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
        const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
        const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
        const cp2y = p2[1] - (p3[1] - p1[1]) / 6;
        d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
      }
      return d;
    };
    const pathD = crPath(pts);

    // Area
    if (showArea) {
      const defs = el('defs', {}, svg);
      const grad = el('linearGradient', { id: 'lc-ag', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
      el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': '0.25' }, grad);
      el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': '0' }, grad);
      const areaD = pathD + ` L${pts[pts.length - 1][0]},${pad.t + ch} L${pts[0][0]},${pad.t + ch} Z`;
      el('path', { d: areaD, fill: 'url(#lc-ag)' }, svg);
    }

    // Target line
    if (targetValue !== undefined) {
      const ty = yScale(targetValue);
      el('line', { x1: pad.l, y1: ty, x2: W - pad.r, y2: ty, stroke: '#ff6b6b', 'stroke-dasharray': '6,4', 'stroke-width': '1.5' }, svg);
      const tl = el('text', { x: W - pad.r + 4, y: ty + 4, fill: '#ff6b6b', 'font-size': '10', 'font-family': 'sans-serif' }, svg);
      tl.textContent = targetValue;
    }

    // Line
    const line = el('path', { d: pathD, fill: 'none', stroke: color, 'stroke-width': '2.5', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
    const len = line.getTotalLength ? line.getTotalLength() : 1000;
    if (animated) {
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      line.style.transition = 'none';
      observe(container, () => { requestAnimationFrame(() => { line.style.transition = 'stroke-dashoffset 1s ease'; line.style.strokeDashoffset = '0'; }); });
    }

    // Dots
    if (showDots) pts.forEach(([cx, cy]) => el('circle', { cx, cy, r: '3.5', fill: color, stroke: '#181c25', 'stroke-width': '2' }, svg));
  }

  /* ── barChart ───────────────────────────────────────────────── */
  function barChart(container, data, opts = {}) {
    container.innerHTML = '';
    if (!data || !data.length) return;
    const { color = DFL, height = 220, animated = true, showValues = true } = opts;
    const W = Math.max(400, data.length * 60), H = height, pad = { t: 28, r: 20, b: 32, l: 20 };
    const cw = W - pad.l - pad.r, ch = H - pad.t - pad.b;
    const max = Math.max(...data.map(d => d.value), 1);
    const barW = Math.min(36, cw / data.length * 0.6);
    const gap = cw / data.length;

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.display = 'block';
    container.appendChild(svg);

    data.forEach((d, i) => {
      const bh = (d.value / max) * ch;
      const x = pad.l + gap * i + (gap - barW) / 2;
      const y = pad.t + ch - bh;
      const bar = el('rect', { x, y, width: barW, height: bh, rx: '4', fill: d.color || color }, svg);
      if (animated) {
        bar.setAttribute('y', pad.t + ch);
        bar.setAttribute('height', 0);
        bar.style.transition = 'none';
        observe(container, () => {
          requestAnimationFrame(() => {
            bar.style.transition = `y 0.5s ease ${i * 0.05}s, height 0.5s ease ${i * 0.05}s`;
            bar.setAttribute('y', y);
            bar.setAttribute('height', bh);
          });
        });
      }
      if (showValues) {
        const vt = el('text', { x: x + barW / 2, y: y - 6, fill: '#ccc', 'font-size': '11', 'text-anchor': 'middle', 'font-family': 'sans-serif' }, svg);
        vt.textContent = d.value;
      }
      const lt = el('text', { x: x + barW / 2, y: H - 8, fill: '#888', 'font-size': '10', 'text-anchor': 'middle', 'font-family': 'sans-serif' }, svg);
      lt.textContent = d.label;
    });
  }

  /* ── progressRing ──────────────────────────────────────────── */
  function progressRing(container, percentage, opts = {}) {
    container.innerHTML = '';
    const { size = 120, strokeWidth = 8, color = DFL, label, sublabel, animated = true } = opts;
    const r = (size - strokeWidth) / 2, circ = 2 * Math.PI * r;
    const pct = clamp(percentage, 0, 100);
    const offset = circ - (pct / 100) * circ;

    const svg = el('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size });
    svg.style.display = 'block';
    container.appendChild(svg);

    el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: '#23272f', 'stroke-width': strokeWidth }, svg);
    const fg = el('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': strokeWidth,
      'stroke-linecap': 'round', 'stroke-dasharray': circ, 'stroke-dashoffset': animated ? circ : offset,
      transform: `rotate(-90 ${size / 2} ${size / 2})`
    }, svg);
    if (animated) {
      fg.style.transition = 'none';
      observe(container, () => { requestAnimationFrame(() => { fg.style.transition = 'stroke-dashoffset 0.8s ease'; fg.setAttribute('stroke-dashoffset', offset); }); });
    }

    const pctText = el('text', { x: size / 2, y: size / 2 + (label ? -2 : 5), fill: '#eee', 'font-size': size * 0.22, 'text-anchor': 'middle', 'font-family': 'sans-serif', 'font-weight': '700' }, svg);
    pctText.textContent = `${Math.round(pct)}%`;
    if (label) {
      const lt = el('text', { x: size / 2, y: size / 2 + size * 0.15, fill: '#aaa', 'font-size': size * 0.1, 'text-anchor': 'middle', 'font-family': 'sans-serif' }, svg);
      lt.textContent = label;
    }
    if (sublabel) {
      const st = el('text', { x: size / 2, y: size / 2 + size * 0.26, fill: '#666', 'font-size': size * 0.08, 'text-anchor': 'middle', 'font-family': 'sans-serif' }, svg);
      st.textContent = sublabel;
    }
  }

  /* ── heatmap ────────────────────────────────────────────────── */
  function heatmap(container, data, opts = {}) {
    container.innerHTML = '';
    const { color = DFL, weeks = 12, cellSize = 14, cellGap = 3 } = opts;
    const rows = 7, cols = weeks;
    const labelW = 28;
    const W = labelW + cols * (cellSize + cellGap), H = rows * (cellSize + cellGap);

    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', preserveAspectRatio: 'xMidYMid meet' });
    svg.style.display = 'block';
    container.appendChild(svg);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const startDay = today.getDay();
    const totalDays = rows * cols;
    const startDate = new Date(today); startDate.setDate(startDate.getDate() - totalDays + 1 - startDay);

    const dayLabels = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
    dayLabels.forEach((l, i) => {
      if (!l) return;
      const t = el('text', { x: 0, y: i * (cellSize + cellGap) + cellSize - 2, fill: '#666', 'font-size': '9', 'font-family': 'sans-serif' }, svg);
      t.textContent = l;
    });

    const opacities = [0.08, 0.25, 0.5, 0.75, 1];
    const cursor = new Date(startDate);
    for (let col = 0; col < cols; col++) {
      for (let row = 0; row < rows; row++) {
        const key = cursor.toISOString().slice(0, 10);
        const intensity = clamp(data[key] || 0, 0, 4);
        const x = labelW + col * (cellSize + cellGap);
        const y = row * (cellSize + cellGap);
        el('rect', { x, y, width: cellSize, height: cellSize, rx: '3', fill: color, opacity: opacities[intensity] }, svg);
        cursor.setDate(cursor.getDate() + 1);
      }
    }
  }

  /* ── miniBar ────────────────────────────────────────────────── */
  function miniBar(container, value, max, opts = {}) {
    container.innerHTML = '';
    const { color = DFL, height = 8, animated = true, showLabel = false } = opts;
    const pct = clamp((value / (max || 1)) * 100, 0, 100);
    const full = value >= max && max > 0;

    const wrap = div('mini-bar-wrap', container);
    wrap.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%';
    const track = div('', wrap);
    track.style.cssText = `flex:1;height:${height}px;background:#23272f;border-radius:${height}px;overflow:hidden;position:relative`;
    const bar = div('', track);
    bar.style.cssText = `height:100%;width:${animated ? 0 : pct}%;background:${color};border-radius:${height}px;transition:width 0.6s ease`;
    if (full) bar.style.boxShadow = `0 0 8px ${color}`;

    if (animated) observe(container, () => requestAnimationFrame(() => { bar.style.width = pct + '%'; }));

    if (full) {
      const styleId = 'minibar-pulse';
      if (!document.getElementById(styleId)) {
        const s = document.createElement('style'); s.id = styleId;
        s.textContent = `@keyframes mb-pulse{0%,100%{opacity:1}50%{opacity:.6}}`;
        document.head.appendChild(s);
      }
      bar.style.animation = 'mb-pulse 1.5s ease-in-out infinite';
    }

    if (showLabel) {
      const lbl = div('', wrap);
      lbl.style.cssText = 'font-size:12px;color:#888;white-space:nowrap;font-family:sans-serif';
      lbl.textContent = `${value}/${max}`;
    }
  }

  window.Charts = { lineChart, barChart, progressRing, heatmap, miniBar };
})();
