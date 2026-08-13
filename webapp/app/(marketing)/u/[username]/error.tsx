'use client';

import { ShareSurfaceError } from '@/app/components/ShareSurfaceError';

export default function PublicProfileError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ShareSurfaceError {...props} />;
}
