'use client';

import { RouteError } from '@/app/components/RouteError';

/**
 * Embeds render inside someone else's page, often only a few hundred pixels
 * tall, so this uses the compact variant: no icon badge, no "back to home" link
 * that would navigate the host's iframe somewhere unexpected.
 */
export default function EmbedError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      compact
      title="Couldn't load these clips"
      message="This ClipMark embed failed to load. Try again in a moment."
    />
  );
}
