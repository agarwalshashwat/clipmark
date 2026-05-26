const STORAGE_KEY = 'clipmark-stack-dropper-best';

function readBestScore() {
  try {
    const value = Number(localStorage.getItem(STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeBestScore(score) {
  try {
    localStorage.setItem(STORAGE_KEY, String(score));
  } catch {
    // Ignore persistence errors.
  }
}

function roundRect(ctx, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, safeRadius);
  ctx.arcTo(x + width, y + height, x, y + height, safeRadius);
  ctx.arcTo(x, y + height, x, y, safeRadius);
  ctx.arcTo(x, y, x + width, y, safeRadius);
  ctx.closePath();
}

export function initStackDropper(root) {
  if (!root) return null;
  if (root.__stackDropperInstance) return root.__stackDropperInstance;

  const stage = root.querySelector('[data-stack-dropper-stage]');
  const canvas = root.querySelector('[data-stack-dropper-canvas]');
  const scoreEl = root.querySelector('[data-stack-dropper-score]');
  const bestEl = root.querySelector('[data-stack-dropper-best]');
  const statusEl = root.querySelector('[data-stack-dropper-status]');
  const overlayEl = root.querySelector('[data-stack-dropper-overlay]');
  const restartBtn = root.querySelector('[data-stack-dropper-restart]');

  if (!stage || !canvas || !scoreEl || !bestEl || !statusEl || !overlayEl || !restartBtn) {
    return null;
  }

  const ctx = canvas.getContext('2d');
  const state = {
    width: 0,
    height: 0,
    dpr: 1,
    score: 0,
    best: readBestScore(),
    blocks: [],
    mover: null,
    gameOver: false,
    messageTimer: null,
    running: true,
    lastTs: 0,
    rafId: 0,
  };

  const blockHeight = 24;
  const blockGap = 6;
  const step = blockHeight + blockGap;
  const minWidth = 64;
  const baseSpeed = 2.8;
  const speedStep = 0.12;
  const perfectWindow = 6;

  function updateStats() {
    scoreEl.textContent = String(state.score);
    bestEl.textContent = String(state.best);
  }

  function showMessage(text) {
    statusEl.textContent = text;
    statusEl.classList.add('is-visible');
    if (state.messageTimer) clearTimeout(state.messageTimer);
    state.messageTimer = setTimeout(() => {
      statusEl.classList.remove('is-visible');
    }, 900);
  }

  function resizeCanvas() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(240, Math.floor(rect.width || root.clientWidth || 280));
    const height = Math.max(320, Math.floor(rect.height || width * 1.22 || 360));
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    state.width = width;
    state.height = height;
    state.dpr = dpr;

    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    draw();
  }

  function buildBlocks() {
    const baseWidth = Math.min(158, Math.max(124, Math.floor(state.width * 0.56)));
    const baseX = Math.floor((state.width - baseWidth) / 2);
    const baseY = state.height - 56;
    state.blocks = [{
      x: baseX,
      width: baseWidth,
      y: baseY,
      level: 0,
      color: '#14B8A6',
    }];
  }

  function createMover() {
    const topBlock = state.blocks[state.blocks.length - 1];
    const width = Math.max(minWidth, topBlock.width);
    const y = topBlock.y - step;
    const speed = baseSpeed + state.score * speedStep;

    state.mover = {
      x: 12,
      y,
      width,
      speed,
      direction: 1,
    };
  }

  function resetGame() {
    state.score = 0;
    state.gameOver = false;
    state.running = true;
    state.lastTs = 0;
    overlayEl.textContent = 'Tap to drop';
    buildBlocks();
    createMover();
    updateStats();
    draw();
  }

  function endGame() {
    state.gameOver = true;
    state.running = false;
    overlayEl.textContent = `Game over · score ${state.score}`;
    draw();
  }

  function dropBlock() {
    if (state.gameOver) {
      resetGame();
      return;
    }

    const mover = state.mover;
    const previous = state.blocks[state.blocks.length - 1];
    const overlapLeft = Math.max(previous.x, mover.x);
    const overlapRight = Math.min(previous.x + previous.width, mover.x + mover.width);
    const overlap = overlapRight - overlapLeft;

    if (overlap <= 0) {
      endGame();
      return;
    }

    const perfect = Math.abs(overlap - previous.width) <= perfectWindow || overlap / previous.width >= 0.92;
    state.score += perfect ? 2 : 1;

    if (state.score > state.best) {
      state.best = state.score;
      writeBestScore(state.best);
    }

    const block = {
      x: overlapLeft,
      width: Math.max(minWidth, overlap),
      y: previous.y - step,
      level: previous.level + 1,
      color: perfect ? '#7dd3fc' : '#2dd4bf',
    };

    state.blocks.push(block);
    createMover();
    updateStats();
    showMessage(perfect ? 'Perfect drop' : 'Nice stack');
    draw();
  }

  function drawBlock(block, isMover = false) {
    const radius = 8;
    const lift = Math.max(0, (state.blocks.length - 7) * step);
    const y = block.y + lift;
    const x = block.x;
    const width = block.width;
    const height = blockHeight;

    ctx.save();
    ctx.shadowColor = 'rgba(15, 23, 42, 0.22)';
    ctx.shadowBlur = 12;
    ctx.shadowOffsetY = 5;
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    if (isMover) {
      gradient.addColorStop(0, '#f59e0b');
      gradient.addColorStop(1, '#fb7185');
    } else {
      gradient.addColorStop(0, block.color);
      gradient.addColorStop(1, '#0f766e');
    }
    ctx.fillStyle = gradient;
    roundRect(ctx, x, y, width, height, radius);
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    roundRect(ctx, x + 0.5, y + 0.5, width - 1, height - 1, radius);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;

    const width = state.width || stage.getBoundingClientRect().width || root.clientWidth || 280;
    const height = state.height || stage.getBoundingClientRect().height || 360;

    const background = ctx.createLinearGradient(0, 0, 0, height);
    background.addColorStop(0, '#0f172a');
    background.addColorStop(0.55, '#111b2d');
    background.addColorStop(1, '#172554');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let gx = 16; gx < width; gx += 24) {
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.lineTo(gx, height);
      ctx.stroke();
    }
    for (let gy = 16; gy < height; gy += 24) {
      ctx.beginPath();
      ctx.moveTo(0, gy);
      ctx.lineTo(width, gy);
      ctx.stroke();
    }
    ctx.restore();

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(18, height - 40);
    ctx.lineTo(width - 18, height - 40);
    ctx.stroke();
    ctx.restore();

    state.blocks.forEach(block => drawBlock(block));

    if (state.mover) {
      drawBlock(state.mover, true);
    }

    if (state.gameOver) {
      ctx.save();
      ctx.fillStyle = 'rgba(15, 23, 42, 0.28)';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#fff';
      ctx.font = '700 24px "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Tap to restart', width / 2, height / 2 - 6);
      ctx.font = '500 13px Inter, sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.82)';
      ctx.fillText(`Best score ${state.best}`, width / 2, height / 2 + 18);
      ctx.restore();
    }
  }

  function updateMover(ts) {
    if (!state.running || state.gameOver || !state.mover) return;

    const delta = state.lastTs ? Math.min(32, ts - state.lastTs) : 16;
    state.lastTs = ts;

    state.mover.x += state.mover.direction * state.mover.speed * delta / 16;

    const minX = 12;
    const maxX = Math.max(minX, state.width - state.mover.width - 12);

    if (state.mover.x <= minX) {
      state.mover.x = minX;
      state.mover.direction = 1;
    } else if (state.mover.x >= maxX) {
      state.mover.x = maxX;
      state.mover.direction = -1;
    }
  }

  function loop(ts) {
    updateMover(ts);
    draw();
    state.rafId = window.requestAnimationFrame(loop);
  }

  function onPrimaryAction(event) {
    if (event && typeof event.button === 'number' && event.button !== 0) return;
    if (event) event.preventDefault();
    dropBlock();
  }

  function onKeyDown(event) {
    if (window.getComputedStyle(root).display === 'none') return;
    if (event.code !== 'Space' && event.code !== 'Enter' && event.code !== 'ArrowUp') return;
    const tag = event.target?.tagName?.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || event.target?.isContentEditable) return;
    event.preventDefault();
    dropBlock();
  }

  function restart() {
    resizeCanvas();
    resetGame();
  }

  const resizeObserver = typeof ResizeObserver !== 'undefined'
    ? new ResizeObserver(() => resizeCanvas())
    : null;

  stage.addEventListener('pointerdown', onPrimaryAction, { passive: false });
  restartBtn.addEventListener('click', restart);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('resize', resizeCanvas);
  resizeObserver?.observe(stage);

  requestAnimationFrame(() => {
    resizeCanvas();
    resetGame();
    state.rafId = window.requestAnimationFrame(loop);
  });

  const api = {
    restart,
    resize: resizeCanvas,
    destroy() {
      window.cancelAnimationFrame(state.rafId);
      stage.removeEventListener('pointerdown', onPrimaryAction);
      restartBtn.removeEventListener('click', restart);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', resizeCanvas);
      resizeObserver?.disconnect();
      if (state.messageTimer) clearTimeout(state.messageTimer);
      delete root.__stackDropperInstance;
    },
  };

  root.__stackDropperInstance = api;
  return api;
}
