// Shared by tests/design-consistency.spec.ts (the two extension surfaces) and
// tests/visual/design-consistency.spec.ts (the webapp), so all three surfaces
// are judged by exactly the same rendered-DOM rules.
/**
 * The audit that runs inside the page. Returns findings rather than asserting so
 * a failure names every offender at once instead of stopping at the first.
 */
export const PAGE_AUDIT = `(() => {
  const findings = [];

  // ── contrast maths, on COMPUTED colours ─────────────────────────────────
  const parse = (c) => {
    const m = c.match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(s => parseFloat(s));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
  const lum = (c) => 0.2126*lin(c.r) + 0.7152*lin(c.g) + 0.0722*lin(c.b);
  const ratio = (a, b) => { const [x,y] = [lum(a), lum(b)].sort((p,q)=>q-p); return (x+0.05)/(y+0.05); };
  // Walk up for the nearest opaque backdrop, and flatten any translucency onto
  // it. An absolutely-positioned child can sit OUTSIDE its parent's box (a label
  // offset above a coloured bar, say), in which case that parent is not what is
  // actually behind it — so require the two boxes to overlap before accepting an
  // ancestor as the backdrop. Without this, such labels are judged against a
  // colour they never touch.
  const overlaps = (a, b) =>
    a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
  const backdrop = (el) => {
    const box = el.getBoundingClientRect();
    let n = el;
    while (n && n !== document.documentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a >= 0.999 && (n === el || overlaps(box, n.getBoundingClientRect()))) return c;
      n = n.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  };
  const flatten = (fg, bg) => fg.a >= 0.999 ? fg : {
    r: fg.r*fg.a + bg.r*(1-fg.a),
    g: fg.g*fg.a + bg.g*(1-fg.a),
    b: fg.b*fg.a + bg.b*(1-fg.a), a: 1,
  };

  const label = (el) => (el.className && typeof el.className === 'string'
    ? '.' + el.className.trim().split(/\\s+/).slice(0,2).join('.')
    : el.tagName.toLowerCase()) + (el.id ? '#' + el.id : '');

  // Fallback content inside <video>/<audio>/<noscript>/<template> is in the DOM
  // but never painted in a browser that supports the element.
  const UNPAINTED = 'VIDEO AUDIO NOSCRIPT TEMPLATE CANVAS OBJECT'.split(' ');
  for (const el of document.querySelectorAll('*')) {
    if (UNPAINTED.includes(el.tagName)) continue;
    if (el.closest('video, audio, noscript, template')) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    const box = el.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) continue;

    // Only leaf-ish text nodes, so we judge the element that owns the glyphs.
    const ownText = [...el.childNodes]
      .filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
    if (!ownText) continue;

    const px = parseFloat(cs.fontSize);

    // R3 — the 11px floor, as RENDERED.
    if (px && px < 11) findings.push({ rule: 'R3', el: label(el), detail: px + 'px' });

    // Icon glyphs are single ligatures, not prose — skip them for contrast.
    if (el.classList.contains('material-symbols-outlined')) continue;

    // R2 — AA on the computed pair. 3:1 for large text (>=18.66px, or >=14px bold).
    const bg = backdrop(el);
    const fg = flatten(parse(cs.color) || { r:0,g:0,b:0,a:1 }, bg);
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = px >= 18.66 || (px >= 14 && weight >= 700);
    const need = large ? 3 : 4.5;
    const r = ratio(fg, bg);
    if (r < need) {
      findings.push({ rule: 'R2', el: label(el), detail:
        r.toFixed(2) + ':1 (needs ' + need + ') ' + cs.color + ' on rgb(' +
        [bg.r,bg.g,bg.b].map(Math.round).join(',') + ') @' + px + 'px/' + weight +
        ' "' + ownText.slice(0, 28) + '"' });
    }
  }

  // R6 — the icon font really loaded, proven by ligature width rather than by
  // document.fonts (which reports "loaded" for a face that renders tofu).
  const icons = [...document.querySelectorAll('.material-symbols-outlined')]
    .filter(e => e.getBoundingClientRect().width > 0);
  for (const e of icons.slice(0, 25)) {
    const w = e.getBoundingClientRect().width;
    const fs = parseFloat(getComputedStyle(e).fontSize);
    if (w > fs * 1.8) findings.push({ rule: 'R6', el: label(e),
      detail: 'icon "' + e.textContent.trim() + '" is ' + w.toFixed(0) + 'px wide at ' +
              fs + 'px font-size — ligature did not resolve' });
  }

  const rs = getComputedStyle(document.documentElement);
  return {
    findings,
    iconsChecked: icons.length,
    navBg: rs.getPropertyValue('--nav-bg').trim(),
    brandInk: rs.getPropertyValue('--brand-ink').trim(),
    accentStrong: rs.getPropertyValue('--accent-strong').trim(),
  };
})()`;

export type Finding = { rule: string; el: string; detail: string };
export type AuditResult = {
  findings: Finding[];
  iconsChecked: number;
  navBg: string;
  brandInk: string;
  accentStrong: string;
};
