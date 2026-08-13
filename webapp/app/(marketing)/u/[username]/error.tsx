'use client';

import { SegmentError } from '@/app/components/SegmentError';

export default function ProfileError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <SegmentError
      {...props}
      title="This profile wouldn't load"
      message="Something went wrong fetching this profile. The link is probably fine — this is usually temporary."
    />
  );
}
