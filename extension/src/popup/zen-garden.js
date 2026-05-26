// ─── Zen Garden ──────────────────────────────────────────────────────────────
// Interactive canvas-based zen garden. Call initZenGarden(canvas, opts) to
// start. Returns { reset } to clear rake lines.
// Uses only globals — no ES module imports.

(function () {
  const TINES      = 5;
  const TINE_GAP   = 5;       // px between rake tines
  const TINE_DEPTH = 1.5;     // visual depth of each groove
  const GROOVE_W   = 1;       // stroke width of a single groove

  // Normalised rock definitions [cx, cy, rx, ry, angle]
  const ROCK_DEFS = [
    { cx: 0.22, cy: 0.38, rx: 0.062, ry: 0.048, angle: 0.4  },
    { cx: 0.74, cy: 0.58, rx: 0.045, ry: 0.034, angle: -0.3 },
    { cx: 0.52, cy: 0.70, rx: 0.034, ry: 0.026, angle: 0.1  },
    { cx: 0.14, cy: 0.72, rx: 0.028, ry: 0.022, angle: 0.8  },
    { cx: 0.82, cy: 0.28, rx: 0.022, ry: 0.018, angle: -0.6 },
  ];

  // Each groove line: { x1, y1, x2, y2 } for every tine
  function initZenGarden(canvas) {
    const ctx    = canvas.getContext('2d');
    let grooves  = [];       // array of {x1,y1,x2,y2} segments
    let dragging = false;
    let lx       = 0;
    let ly       = 0;

    // ── Helpers ──────────────────────────────────────────────────────────────

    function tineOffsets(dx, dy) {
      // Returns TINES positions perpendicular to motion direction
      const len = Math.hypot(dx, dy) || 1;
      const nx  = -dy / len;
      const ny  =  dx / len;
      const half = ((TINES - 1) * TINE_GAP) / 2;
      return Array.from({ length: TINES }, (_, i) => ({
        ox: nx * (i * TINE_GAP - half),
        oy: ny * (i * TINE_GAP - half),
      }));
    }

    function addGrooves(x, y, dx, dy) {
      if (Math.hypot(dx, dy) < 1) return;
      const offsets = tineOffsets(dx, dy);
      offsets.forEach(({ ox, oy }) => {
        grooves.push({ x1: lx + ox, y1: ly + oy, x2: x + ox, y2: y + oy });
      });
    }

    function rocksAt(w, h) {
      return ROCK_DEFS.map(d => ({
        cx: d.cx * w,
        cy: d.cy * h,
        rx: d.rx * w,
        ry: d.ry * h,
        angle: d.angle,
      }));
    }

    function isInsideRock(x, y, rocks) {
      return rocks.some(r => {
        const cos = Math.cos(-r.angle);
        const sin = Math.sin(-r.angle);
        const lx  = cos * (x - r.cx) - sin * (y - r.cy);
        const ly  = sin * (x - r.cx) + cos * (y - r.cy);
        return (lx * lx) / (r.rx * r.rx) + (ly * ly) / (r.ry * r.ry) <= 1;
      });
    }

    // ── Draw ─────────────────────────────────────────────────────────────────

    function drawSand(w, h) {
      const grad = ctx.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0,   '#f2e8d0');
      grad.addColorStop(0.5, '#ecdfc4');
      grad.addColorStop(1,   '#e4d4b2');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }

    function drawGrooves(rocks) {
      ctx.save();
      ctx.lineWidth   = GROOVE_W;
      ctx.lineCap     = 'round';

      grooves.forEach(g => {
        // Clip away any groove that goes through a rock
        if (isInsideRock(g.x1, g.y1, rocks) || isInsideRock(g.x2, g.y2, rocks)) return;

        // Shadow groove (depth illusion)
        ctx.strokeStyle = 'rgba(120, 88, 40, 0.22)';
        ctx.lineWidth   = GROOVE_W + TINE_DEPTH;
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1 + 1);
        ctx.lineTo(g.x2, g.y2 + 1);
        ctx.stroke();

        // Main groove
        ctx.strokeStyle = 'rgba(160, 118, 55, 0.35)';
        ctx.lineWidth   = GROOVE_W;
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();
      });
      ctx.restore();
    }

    function drawRocks(rocks) {
      rocks.forEach(r => {
        ctx.save();
        ctx.translate(r.cx, r.cy);
        ctx.rotate(r.angle);

        // Drop shadow
        ctx.shadowColor   = 'rgba(0,0,0,0.25)';
        ctx.shadowBlur    = 8;
        ctx.shadowOffsetX = 3;
        ctx.shadowOffsetY = 4;

        // Rock body gradient
        const rg = ctx.createRadialGradient(-r.rx * 0.25, -r.ry * 0.25, r.rx * 0.1, 0, 0, r.rx);
        rg.addColorStop(0,   '#b0aaaa');
        rg.addColorStop(0.6, '#8a8585');
        rg.addColorStop(1,   '#6b6666');
        ctx.fillStyle = rg;

        ctx.beginPath();
        ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2);
        ctx.fill();

        // Subtle rim
        ctx.shadowColor = 'transparent';
        ctx.strokeStyle = 'rgba(80,72,72,0.4)';
        ctx.lineWidth   = 0.8;
        ctx.stroke();

        ctx.restore();
      });
    }

    function draw() {
      const w = canvas.width;
      const h = canvas.height;
      const rocks = rocksAt(w, h);
      drawSand(w, h);
      drawGrooves(rocks);
      drawRocks(rocks);
    }

    // ── Resize ───────────────────────────────────────────────────────────────

    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      draw();
    });
    ro.observe(canvas);

    canvas.width  = canvas.clientWidth  || canvas.offsetWidth;
    canvas.height = canvas.clientHeight || canvas.offsetHeight;
    draw();

    // ── Mouse events ─────────────────────────────────────────────────────────

    function startDrag(x, y) {
      dragging = true;
      lx = x; ly = y;
    }

    function moveDrag(x, y) {
      if (!dragging) return;
      const dx = x - lx;
      const dy = y - ly;
      addGrooves(x, y, dx, dy);
      lx = x; ly = y;
      draw();
    }

    function endDrag() { dragging = false; }

    canvas.addEventListener('mousedown',  e => startDrag(e.offsetX, e.offsetY));
    canvas.addEventListener('mousemove',  e => moveDrag(e.offsetX, e.offsetY));
    canvas.addEventListener('mouseup',    endDrag);
    canvas.addEventListener('mouseleave', endDrag);

    // ── Touch events ─────────────────────────────────────────────────────────

    function touchXY(e) {
      const rect = canvas.getBoundingClientRect();
      const t    = e.changedTouches[0];
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    canvas.addEventListener('touchstart', e => {
      e.preventDefault();
      const { x, y } = touchXY(e);
      startDrag(x, y);
    }, { passive: false });

    canvas.addEventListener('touchmove', e => {
      e.preventDefault();
      const { x, y } = touchXY(e);
      moveDrag(x, y);
    }, { passive: false });

    canvas.addEventListener('touchend', endDrag);

    // ── Public API ────────────────────────────────────────────────────────────

    return {
      reset() {
        grooves = [];
        draw();
      },
    };
  }

  // Expose globally (no ES module system in extension)
  window.initZenGarden = initZenGarden;
})();
