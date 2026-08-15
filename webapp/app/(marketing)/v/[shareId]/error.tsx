'use client';

import { RouteError } from '@/app/components/RouteError';

export default function SharedCollectionError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="We couldn't load this collection"
      message="Something went wrong fetching these clips. It's most likely temporary — try again, and the link will still work once it clears."
    />
  );
}
