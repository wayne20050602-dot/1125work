
// Block 3-V：往後若要用 vibe coding 增加互動功能，可從這個檔案修改。
// 選單、圖例、節點資訊都依 network-data 裡的欄位自動產生，欄位數量不固定。
(() => {
  const data = JSON.parse(document.getElementById('network-data').textContent);
  const sizeSelect = document.getElementById('size-select');
  const colorSelect = document.getElementById('color-select');
  const viewTitle = document.getElementById('view-title');
  const legendBox = document.getElementById('legend');
  const infoBox = document.getElementById('selected-info');

  const PALETTE = ['#4e79a7','#f28e2b','#e15759','#76b7b2','#59a14f','#edc948','#b07aa1','#ff9da7','#9c755f','#8cd17d'];
  const DEFAULT_COLOR = '#4d91c5', OTHER_COLOR = '#b8c2cc', MISSING_COLOR = '#e3e7ec';
  const GRADIENT = [[219, 233, 246], [8, 81, 156]];   // 數值上色：淺 → 深
  const OTHER = '其他', MISSING = '（無資料）';
  const MIN_SIZE = 14, MAX_SIZE = 48;   // 節點半徑範圍；排開節點時一律以 MAX_SIZE 計算
  const NODE_GAP = 6;                   // 兩個節點邊緣之間至少留的空隙

  const fmt = v => (v === null || v === undefined) ? '—'
    : (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toFixed(3)) : String(v));
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; };

  // ── 依資料產生選單 ──
  function fillSelect(select, options, selected) {
    select.replaceChildren(...options.map(([value, text]) => {
      const o = el('option', null, text); o.value = value; o.selected = value === selected; return o;
    }));
  }
  fillSelect(sizeSelect, [['', '（固定大小）'], ...data.numericColumns.map(c => [c, c])], data.defaultSize || '');
  fillSelect(colorSelect, [['', '（不上色）'], ...data.colorColumns.map(c => [c, c])], '');

  // ── 大小與顏色的對應 ──
  function range(column) {
    const vs = data.nodes.map(n => n.values[column]).filter(v => v !== null);
    return vs.length ? [Math.min(...vs), Math.max(...vs)] : [0, 0];
  }
  const scale = (v, [low, high]) => v === null ? null : (high === low ? 0.5 : (v - low) / (high - low));
  const mix = t => 'rgb(' + GRADIENT[0].map((a, i) => Math.round(a + (GRADIENT[1][i] - a) * t)).join(',') + ')';

  function sizeFunction(column) {
    if (!column) return () => 20;
    const r = range(column);
    return node => { const t = scale(node.values[column], r); return t === null ? 8 : MIN_SIZE + t * (MAX_SIZE - MIN_SIZE); };
  }

  // ── 節點不重疊：開頁時把太近的節點推開一次，之後位置固定 ──
  // 以最大半徑計算間距，所以不論切換到哪個欄位，節點都不會重疊。
  function spreadNodes(list) {
    const minDistance = MAX_SIZE * 2 + NODE_GAP;
    const points = list.map(n => ({ x: n.x, y: n.y }));
    for (let round = 0; round < 500; round++) {
      let moved = false;
      for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
          let dx = points[j].x - points[i].x, dy = points[j].y - points[i].y;
          let distance = Math.hypot(dx, dy);
          if (distance >= minDistance) continue;
          if (distance < 0.01) { dx = Math.cos(i + j); dy = Math.sin(i + j); distance = 1; }   // 完全重疊時隨便選個方向
          const push = (minDistance - distance) / 2 + 0.5;
          const ux = dx / distance, uy = dy / distance;
          points[i].x -= ux * push; points[i].y -= uy * push;
          points[j].x += ux * push; points[j].y += uy * push;
          moved = true;
        }
      }
      if (!moved) break;
    }
    return points;
  }

  function categoryColors(column) {
    const colors = {}; let i = 0;
    data.categoryOrder[column].forEach(c => {
      colors[c] = c === OTHER ? OTHER_COLOR : c === MISSING ? MISSING_COLOR : PALETTE[i++ % PALETTE.length];
    });
    return colors;
  }

  function colorFunction(column) {
    if (!column) return () => DEFAULT_COLOR;
    if (data.categoryOrder[column]) { const colors = categoryColors(column); return node => colors[node.values[column]] || MISSING_COLOR; }
    const r = range(column);
    return node => { const t = scale(node.values[column], r); return t === null ? MISSING_COLOR : mix(t); };
  }

  // ── 圖例 ──
  function renderLegend(sizeColumn, colorColumn) {
    const parts = [];
    if (sizeColumn) {
      const [low, high] = range(sizeColumn);
      const row = el('div', 'legend-row');
      row.append(el('span', 'dot-small'), el('span', null, fmt(low)), el('span', 'dot-large'), el('span', null, fmt(high)));
      parts.push(el('div', 'legend-title', '大小：' + sizeColumn), row);
    }
    if (colorColumn) {
      parts.push(el('div', 'legend-title', '顏色：' + colorColumn));
      if (data.categoryOrder[colorColumn]) {
        const colors = categoryColors(colorColumn);
        data.categoryOrder[colorColumn].forEach(c => {
          const row = el('div', 'legend-row'); const sw = el('span', 'swatch'); sw.style.background = colors[c];
          row.append(sw, el('span', null, c)); parts.push(row);
        });
      } else {
        const [low, high] = range(colorColumn); const r = el('div', 'range');
        r.append(el('span', null, fmt(low)), el('span', null, fmt(high)));
        parts.push(el('div', 'gradient'), r);
      }
    }
    legendBox.replaceChildren(...parts);
  }

  // ── 節點資訊：列出這個節點在結果表裡的所有欄位 ──
  function tooltip(node, sizeColumn, colorColumn) {
    const lines = [node.label];
    [sizeColumn, colorColumn].filter((c, i, a) => c && a.indexOf(c) === i).forEach(c => lines.push(c + '：' + fmt(node.values[c])));
    const div = el('div', null, lines.join('\n')); div.style.whiteSpace = 'pre-line'; return div;
  }

  function displaySelection(nodeId) {
    const node = data.nodes.find(n => n.id === nodeId);
    if (!node) { infoBox.textContent = '點選節點可以查看它的所有資料。'; return; }
    infoBox.replaceChildren(el('strong', null, node.label),
      ...Object.entries(node.values).map(([k, v]) => el('div', null, k + '：' + fmt(v))));
  }

  const positions = spreadNodes(data.nodes);
  const nodes = new vis.DataSet(data.nodes.map((n, i) => ({ id: n.id, label: n.label, x: positions[i].x, y: positions[i].y })));
  const edges = new vis.DataSet(data.edges);
  const network = new vis.Network(document.getElementById('network'), { nodes, edges }, {
    autoResize: true,
    physics: false,
    interaction: { dragNodes:true, dragView:true, zoomView:true, hover:true },
    nodes: { shape:'dot', borderWidth:1.5, font:{ size:15, color:'#263445' } },
    edges: { color:{color:'#b6c4d2',highlight:'#7297b7'}, width:1.4, smooth:false, arrows: { to: { enabled: data.directed } } }
  });

  // 只更新節點大小與顏色，不重新建立 network，維持節點座標。
  function refresh() {
    const sizeColumn = sizeSelect.value, colorColumn = colorSelect.value;
    const sizeOf = sizeFunction(sizeColumn), colorOf = colorFunction(colorColumn);
    nodes.update(data.nodes.map(n => {
      const c = colorOf(n);
      return { id: n.id, size: sizeOf(n), title: tooltip(n, sizeColumn, colorColumn),
               color: { background: c, border: '#5b6b7c', highlight: { background: '#dd9858', border: '#af6826' }, hover: { background: c, border: '#263445' } } };
    }));
    viewTitle.textContent = '大小：' + (sizeColumn || '固定') + '｜顏色：' + (colorColumn || '不上色');
    renderLegend(sizeColumn, colorColumn);
  }

  sizeSelect.addEventListener('change', refresh);
  colorSelect.addEventListener('change', refresh);
  network.on('selectNode', params => displaySelection(params.nodes[0]));
  network.on('deselectNode', () => displaySelection(null));
  refresh();
})();
