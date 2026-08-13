'use client';

import { ShareSurfaceError } from '@/app/components/ShareSurfaceError';

export default function SharedCollectionError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ShareSurfaceError {...props} />;
}
