'use client';

import { SegmentError } from '@/app/components/SegmentError';

export default function SharedCollectionError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentError
      {...props}
      title="This collection wouldn't load"
      message="Something went wrong fetching this shared collection. The link is probably fine — this is usually temporary."
    />
  );
}
