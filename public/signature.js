export function attachSignature(canvas, initial = []) {
  let strokes = structuredClone(initial), current = null;
  const ctx = canvas.getContext('2d');
  function draw() {
    const rect = canvas.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.scale(dpr, dpr); ctx.strokeStyle = '#183b5a'; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const stroke of strokes) { ctx.beginPath(); stroke.forEach(([x,y], i) => i ? ctx.lineTo(x / 100 * rect.width, y / 100 * rect.height) : ctx.moveTo(x / 100 * rect.width, y / 100 * rect.height)); ctx.stroke(); }
  }
  const point = e => { const r = canvas.getBoundingClientRect(); return [Math.min(100, Math.max(0, (e.clientX - r.left) / r.width * 100)), Math.min(100, Math.max(0, (e.clientY - r.top) / r.height * 100))]; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); current = [point(e)]; strokes.push(current); draw(); });
  canvas.addEventListener('pointermove', e => { if (current && current.length < 2000) { current.push(point(e)); draw(); } });
  const finish = () => { if (current?.length < 2) strokes.pop(); current = null; draw(); };
  canvas.addEventListener('pointerup', finish); canvas.addEventListener('pointercancel', finish);
  const observer = new ResizeObserver(draw); observer.observe(canvas);
  draw();
  return { value: () => structuredClone(strokes), clear: () => { strokes = []; draw(); }, destroy: () => observer.disconnect() };
}

export function signatureSVG(strokes) {
  if (!strokes?.length) return '<span class="muted">Awaiting signature</span>';
  const points = strokes.map(s => s.filter(p => Array.isArray(p) && p.every(Number.isFinite)).map(p => p.join(',')).join(' '));
  return `<svg class="signed-mark" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Recorded signature">${points.map(p => `<polyline points="${p}" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>`).join('')}</svg>`;
}
