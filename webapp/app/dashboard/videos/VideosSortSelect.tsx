'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface Props {
  current: string;
  className?: string;
}

export default function VideosSortSelect({ current, className }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', e.target.value);
    router.replace('/dashboard/videos?' + params.toString());
  };

  return (
    <select defaultValue={current} onChange={handleChange} className={className}>
      <option value="recently_updated">Recently updated</option>
      <option value="most_bookmarks">Most bookmarks</option>
      <option value="oldest_first">Oldest first</option>
    </select>
  );
}
