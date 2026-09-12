/**
 * Signed-in dark-mode audit for the dashboard.
 *
 * NOT part of CI: the dashboard is behind auth, so this needs a local Supabase
 * stack with seeded users — which the fast gates deliberately don't carry. Run
 * it by hand when touching dashboard colours.
 *
 *   supabase start
 *   npm --prefix webapp run db:bootstrap
 *   (cd webapp && npx tsx scripts/migrate.ts && npm run db:reload && npm run db:seed)
 *   # build + start webapp against the local stack, with:
 *   #   NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY
 *   #   ENABLE_PASSWORD_LOGIN=true   (next start runs NODE_ENV=production, which
 *   #                                 otherwise hides the test-only password form)
 *   node tests/manual/dark-mode-audit.cjs
 *
 * It signs in as the seeded user, switches to dark, and reports two things per
 * route: any element painting a LIGHT background under a dark page, and any text
 * failing AA against the background it actually sits on. Source-level checks
 * can't do this — they can't tell a deliberate dark panel from a light-pinned
 * one, which is why the marketing sweep and this one were both driven from
 * rendered measurements.
 */
const { chromium } = require('playwright');
const BASE = 'http://127.0.0.1:3120';
const ROUTES = ['/dashboard', '/dashboard/videos', '/dashboard/groups', '/dashboard/queue',
                '/dashboard/shared', '/dashboard/analytics'];

async function signIn(page) {
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.locator('input[name="email"]').fill('user-a@example.test');
  await page.locator('input[name="password"]').fill('test-password-123!');
  await page.locator('form:has(input[name="password"])').evaluate((f) => f.requestSubmit());
  await page.waitForURL(/dashboard/, { timeout: 20000 }).catch(() => {});
  return page.url();
}

(async () => {
  const b = await chromium.launch();
  const page = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const landed = await signIn(page);
  console.log('signed in →', landed);
  await page.evaluate(() => localStorage.setItem('theme', 'dark'));

  const report = {};
  for (const route of ROUTES) {
    await page.goto(BASE + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const f = await page.evaluate(() => {
      const lin=(c)=>{const v=c/255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4;};
      const parse=(s)=>{const m=(s||'').match(/[\d.]+/g);return m?m.slice(0,4).map(Number):null;};
      const lum=([r,g,bb])=>0.2126*lin(r)+0.7152*lin(g)+0.0722*lin(bb);
      const ratio=(a,c)=>{const[h,l]=[lum(a),lum(c)].sort((x,y)=>y-x);return (h+0.05)/(l+0.05);};
      function bgOf(el){let n=el;while(n&&n!==document.documentElement){const c=parse(getComputedStyle(n).backgroundColor);if(c&&(c[3]===undefined||c[3]>0.5))return c.slice(0,3);n=n.parentElement;}return[10,10,15];}
      const cls=(el)=>{const c=typeof el.className==='string'?el.className:'';return el.tagName.toLowerCase()+(c?'.'+c.trim().split(/\s+/)[0]:'');};
      const slabs=new Map(), text=new Map();
      for (const el of document.querySelectorAll('body *')) {
        const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
        if(cs.display==='none'||cs.visibility==='hidden'||r.width<60||r.height<24) continue;
        const own=parse(cs.backgroundColor);
        if(own&&(own[3]===undefined||own[3]>0.5)&&lum(own.slice(0,3))>0.5){
          const k=cls(el); if(!slabs.has(k)) slabs.set(k,{k,bg:cs.backgroundColor,area:Math.round(r.width*r.height)});
        }
        const hasText=[...el.childNodes].some(n=>n.nodeType===3&&n.textContent.trim().length>1);
        if(!hasText) continue;
        const size=parseFloat(cs.fontSize), w=parseInt(cs.fontWeight)||400;
        const need=(size>=24||(size>=18.66&&w>=700))?3:4.5;
        const fg=parse(cs.color); if(!fg) continue;
        const cr=ratio(fg.slice(0,3),bgOf(el));
        if(cr<need){const k=cls(el); if(!text.has(k)) text.set(k,{k,ratio:+cr.toFixed(2),need,sample:el.textContent.trim().slice(0,32)});}
      }
      return {slabs:[...slabs.values()],text:[...text.values()]};
    });
    if (f.slabs.length || f.text.length) report[route]=f;
  }

  let s=0,t=0;
  for (const [route,f] of Object.entries(report)) {
    console.log(`\n══ ${route}`);
    f.slabs.sort((a,b)=>b.area-a.area).forEach(x=>{console.log(`  LIGHT SLAB   ${x.k.padEnd(38)} ${x.bg}`);s++;});
    f.text.sort((a,b)=>a.ratio-b.ratio).forEach(x=>{console.log(`  LOW CONTRAST ${String(x.ratio).padStart(5)}:1 (need ${x.need})  ${x.k.padEnd(28)} "${x.sample}"`);t++;});
  }
  console.log(`\nTOTAL: ${s} light slabs / ${t} low-contrast`);
  await b.close();
})();
