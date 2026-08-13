'use client';

import { ShareSurfaceError } from '@/app/components/ShareSurfaceError';

/** `compact` — this renders inside someone else's iframe, not a full page. */
export default function EmbedError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ShareSurfaceError {...props} compact />;
}
