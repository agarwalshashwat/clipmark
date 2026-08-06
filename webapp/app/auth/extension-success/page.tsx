'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { rememberExtensionId } from '@/app/dashboard/_utils/extension';
import { parseExtensionAuthParams } from './params';

function ExtensionSuccessInner() {
  const params    = useSearchParams();
  const [status, setStatus] = useState<'sending' | 'done' | 'error'>('sending');

  useEffect(() => {
    const parsed = parseExtensionAuthParams(params);
    if (!parsed.ok) { setStatus('error'); return; }

    // This is the one moment Chrome tells the web app which extension it's
    // talking to — remember it so the dashboard can start Active Recall later.
    rememberExtensionId(parsed.extensionId);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr = (window as any).chrome?.runtime;
      if (cr?.sendMessage) {
        cr.sendMessage(parsed.extensionId, parsed.message);
      }
      setStatus('done');
      setTimeout(() => window.close(), 1800);
    } catch {
      setStatus('error');
    }
  }, [params]);

  return (
    <main style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', gap: 16,
      fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    }}>
      {status === 'sending' && <p style={{ color: '#6b7280' }}>Completing sign-in…</p>}
      {status === 'done'    && (
        <>
          <span style={{
            width: 56, height: 56, background: '#f0fdfa', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, color: '#14B8A6',
          }}>✓</span>
          <p style={{ fontSize: 18, fontWeight: 700, color: '#111827' }}>Signed in to Clipmark!</p>
          <p style={{ fontSize: 13, color: '#6b7280' }}>You can close this tab and return to YouTube.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <span style={{ fontSize: 40 }}>✗</span>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#111827' }}>Sign-in failed</p>
          <p style={{ fontSize: 13, color: '#6b7280' }}>Please close this tab and try again.</p>
        </>
      )}
    </main>
  );
}

export default function ExtensionSuccessPage() {
  return (
    <Suspense>
      <ExtensionSuccessInner />
    </Suspense>
  );
}
