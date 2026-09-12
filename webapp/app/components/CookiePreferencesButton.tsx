'use client';

/**
 * "Change your choice later" control — the other half of a valid consent
 * mechanism. Withdrawing consent has to be as easy as giving it, so this sits in
 * the footer of every page (next to the privacy policy) and again in §6 of
 * /privacy itself.
 *
 * A button, not a link, because it reopens the banner in place rather than
 * navigating. `variant` only picks the styling — the footer wants something that
 * reads as one of its links, the policy wants a visible control.
 *
 * It renders nothing until the provider has read the cookie, so it can never
 * offer to reopen a banner that is already on screen unanswered.
 */

import { useConsent } from './ConsentProvider';

export function CookiePreferencesButton({
  variant = 'link',
  children = 'Cookie preferences',
}: {
  variant?: 'link' | 'inline';
  children?: React.ReactNode;
}) {
  const { ready, openPreferences, promptOpen } = useConsent();

  if (!ready || promptOpen) return null;

  return (
    <button
      type="button"
      onClick={openPreferences}
      className={variant === 'link' ? 'footer-link cc-pref-link' : 'cc-pref-inline'}
    >
      {children}
    </button>
  );
}
