'use client';

/**
 * Client-side consent state — the hook every future non-essential tracker
 * should gate on.
 *
 *   const { allows } = useConsent();
 *   if (allows('product_analytics')) sendEvent(...);
 *
 * The record itself lives in the `clipmark_consent` cookie (app/lib/consent.ts),
 * not in React state, because the server has to be able to read the same answer
 * — `/r/[code]` decides whether to set the attribution cookie during a redirect,
 * long before any of this has mounted.
 *
 * ── Why nothing is decided on the server ─────────────────────────────────────
 * Reading cookies in the root layout would opt every marketing page out of
 * static rendering. So the banner renders nothing until after mount, then reads
 * `document.cookie`. The cost is that it fades in a beat after first paint;
 * the benefit is that /privacy, /faq and the landing page stay static.
 *
 * ── The pending referral code ────────────────────────────────────────────────
 * `/r/<code>` redirects to `/?ref=<code>` WITHOUT setting a cookie when consent
 * has not been given (that is the whole point of this feature). If the visitor
 * then accepts, the code has to come from somewhere — so it is read off the URL
 * at mount and held in a ref. Deliberately in memory only: stashing it in
 * sessionStorage would be storing information on the visitor's device for a
 * non-essential purpose, i.e. the exact thing consent is meant to authorise.
 * Surviving client-side navigation is free; a full page load loses it, and that
 * lost attribution is the honest price of asking first.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';

import {
  CONSENT_COOKIE,
  CONSENT_MAX_AGE_SECONDS,
  makeConsentRecord,
  needsPrompt,
  parseConsent,
  serializeConsent,
  consentAllows,
  type ConsentCategory,
  type ConsentRecord,
} from '../lib/consent';

interface ConsentContextValue {
  /** False until the cookie has been read on the client. Nothing consent-gated
   *  should run while this is false — "unknown" must never read as "allowed". */
  ready: boolean;
  record: ConsentRecord | null;
  allows: (category: ConsentCategory) => boolean;
  /** True when the banner should be on screen (unanswered, or reopened). */
  promptOpen: boolean;
  /** A current-version answer already exists. Drives whether the banner may be
   *  dismissed without choosing: on first run it may not — walking away from an
   *  unanswered banner must not be read as either an accept or a reject. */
  hasAnswer: boolean;
  accept: () => void;
  reject: () => void;
  /** Reopen the banner so a previous answer can be changed. */
  openPreferences: () => void;
  /** Close a reopened banner leaving the existing answer untouched. No-op when
   *  there is no answer yet. */
  closePreferences: () => void;
}

const ConsentCtx = createContext<ConsentContextValue>({
  ready: false,
  record: null,
  allows: () => false,
  promptOpen: false,
  hasAnswer: false,
  accept: () => {},
  reject: () => {},
  openPreferences: () => {},
  closePreferences: () => {},
});

function readConsentCookie(): ConsentRecord | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie
    .split('; ')
    .find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  return parseConsent(match?.slice(CONSENT_COOKIE.length + 1));
}

function writeConsentCookie(record: ConsentRecord) {
  // Not httpOnly: the banner must read its own answer on a static page. Nothing
  // security-sensitive is in it — the worst a forged value does is silence the
  // banner for the person who forged it, and every cookie we actually set is
  // still gated server-side in app/api/consent/attribution.
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie =
    `${CONSENT_COOKIE}=${serializeConsent(record)}` +
    `; Path=/; Max-Age=${CONSENT_MAX_AGE_SECONDS}; SameSite=Lax${secure}`;
}

/** Affiliate (`/r/<code>` → `/?ref=`) and user-referral (`/ref/<code>` →
 *  `/upgrade?uref=`) codes waiting to be claimed if consent is given. */
function readPendingCodes(): { affiliate?: string; user?: string } {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const affiliate = params.get('ref') ?? undefined;
  const user = params.get('uref') ?? undefined;
  return { affiliate, user };
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [record, setRecord] = useState<ConsentRecord | null>(null);
  const [reopened, setReopened] = useState(false);
  const pending = useRef<{ affiliate?: string; user?: string }>({});

  useEffect(() => {
    pending.current = readPendingCodes();
    setRecord(readConsentCookie());
    setReady(true);
  }, []);

  // Keep capturing codes across client-side navigations — a visitor can land on
  // /?ref=x, click through to /upgrade, and only then answer the banner.
  useEffect(() => {
    const codes = readPendingCodes();
    if (codes.affiliate) pending.current.affiliate = codes.affiliate;
    if (codes.user) pending.current.user = codes.user;
  });

  const decide = useCallback(
    (granted: boolean) => {
      const next = makeConsentRecord(granted, Date.now());
      writeConsentCookie(next);
      setRecord(next);
      setReopened(false);

      // The attribution cookies are httpOnly, so only the server can set or
      // clear them. Fire-and-forget: a failed request must not block the UI
      // from recording the choice, and the worst case is an uncredited
      // referral, never an un-actioned rejection of a cookie we already hold
      // (the reject path is retried by the next page load's server-side gate,
      // which simply stops honouring the cookie).
      if (granted) {
        const { affiliate, user } = pending.current;
        if (!affiliate && !user) return;
        void fetch('/api/consent/attribution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ affiliate, user }),
        })
          .then((res) => {
            // Refresh so the server components that read the cookie (the
            // homepage referrer line, the /upgrade discount banner) pick it up
            // without the visitor having to reload.
            if (res.ok) router.refresh();
          })
          .catch(() => {});
      } else {
        void fetch('/api/consent/attribution', { method: 'DELETE' })
          .then((res) => {
            if (res.ok) router.refresh();
          })
          .catch(() => {});
      }
    },
    [router],
  );

  const value = useMemo<ConsentContextValue>(() => {
    const hasAnswer = !needsPrompt(record);
    return {
      ready,
      record,
      allows: (category: ConsentCategory) => consentAllows(record, category),
      promptOpen: ready && (reopened || !hasAnswer),
      hasAnswer,
      accept: () => decide(true),
      reject: () => decide(false),
      openPreferences: () => setReopened(true),
      closePreferences: () => setReopened(false),
    };
  }, [ready, record, reopened, decide]);

  return <ConsentCtx.Provider value={value}>{children}</ConsentCtx.Provider>;
}

export const useConsent = () => useContext(ConsentCtx);
