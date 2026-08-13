'use client';

import { SegmentError } from '@/app/components/SegmentError';

export default function EmbedError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentError
      {...props}
      compact
      title="Couldn't load these clips"
      message="This embedded collection didn't load. It's usually temporary."
    />
  );
}
