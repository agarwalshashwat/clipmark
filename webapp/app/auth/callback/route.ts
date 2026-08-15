import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin, createStatelessAuthClient } from '@/lib/clients';
import { mintExtensionSession } from './extension-session';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code        = searchParams.get('code');
  const extensionId = searchParams.get('extensionId');

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll()     { return cookieStore.getAll(); },
          setAll(list: { name: string; value: string; options?: object }[]) { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options as never)); },
        },
      }
    );

    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error && data.session) {
      // Ensure profile row exists (trigger only fires on first-ever INSERT into auth.users)
      const emailPrefix = (data.session.user.email ?? '').split('@')[0].toLowerCase().replace(/[^a-z0-9_]/g, '');
      await supabase
        .from('profiles')
        .upsert({ id: data.session.user.id, username: emailPrefix }, { onConflict: 'id', ignoreDuplicates: true });

      if (extensionId) {
        // Fetch pro status to pass to extension
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_pro')
          .eq('id', data.session.user.id)
          .single();

        // Mint the extension a session in its OWN refresh-token family rather
        // than handing it the website's session verbatim — see
        // mintExtensionSession for why sharing one family signed users out of
        // one surface or the other on almost every refresh. A mint failure
        // (e.g. the email provider rejecting generateLink) falls back to the
        // old shared-session behavior rather than failing sign-in outright —
        // still a working handoff, just with the failure mode this replaces.
        const minted = await mintExtensionSession(
          getSupabaseAdmin(),
          createStatelessAuthClient(),
          data.session.user.email ?? '',
        ).catch(err => {
          console.error('mintExtensionSession failed, falling back to a shared session', err);
          return null;
        });
        const extSession = minted ?? {
          accessToken: data.session.access_token,
          refreshToken: data.session.refresh_token,
        };

        const p = new URLSearchParams({
          access_token:  extSession.accessToken,
          refresh_token: extSession.refreshToken,
          user_id:       data.session.user.id,
          user_email:    data.session.user.email || '',
          is_pro:        String(profile?.is_pro ?? false),
          extensionId,
        });
        return NextResponse.redirect(`${origin}/auth/extension-success?${p.toString()}`);
      }
      return NextResponse.redirect(`${origin}/dashboard`);
    }
  }

  return NextResponse.redirect(`${origin}/signin?error=auth_failed`);
}
