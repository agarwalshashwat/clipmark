'use client';

import { RouteError } from '@/app/components/RouteError';

export default function ProfileError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteError
      {...props}
      title="We couldn't load this profile"
      message="Something went wrong fetching this creator's public clips. It's most likely temporary — try again in a moment."
    />
  );
}
