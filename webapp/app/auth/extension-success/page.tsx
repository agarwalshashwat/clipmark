'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { rememberExtensionId } from '@/app/dashboard/_utils/extension';

function ExtensionSuccessInner() {
  const params    = useSearchParams();
  const [status, setStatus] = useState<'sending' | 'done' | 'error'>('sending');

  useEffect(() => {
    const extensionId  = params.get('extensionId');
    const accessToken  = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const userId       = params.get('user_id');
    const userEmail    = params.get('user_email');
    const isPro        = params.get('is_pro') === 'true';

    if (!extensionId || !accessToken) { setStatus('error'); return; }

    // This is the one moment Chrome tells the web app which extension it's
    // talking to — remember it so the dashboard can start Active Recall later.
    rememberExtensionId(extensionId);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cr = (window as any).chrome?.runtime;
      if (cr?.sendMessage) {
        cr.sendMessage(extensionId, { type: 'AUTH_SUCCESS', accessToken, refreshToken, userId, userEmail, isPro });
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
      {status === 'sending' && <p style={{ color: 'var(--text-muted)' }}>Completing sign-in…</p>}
      {status === 'done'    && (
        <>
          <span style={{
            width: 56, height: 56, background: 'var(--teal-50)', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, color: 'var(--brand-ink)',
          }}>✓</span>
          <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--gray-900)' }}>Signed in to ClipMark!</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>You can close this tab and return to YouTube.</p>
        </>
      )}
      {status === 'error' && (
        <>
          <span style={{ fontSize: 40 }}>✗</span>
          <p style={{ fontSize: 16, fontWeight: 600, color: 'var(--gray-900)' }}>Sign-in failed</p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>Please close this tab and try again.</p>
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
