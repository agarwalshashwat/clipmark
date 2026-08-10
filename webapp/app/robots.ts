import { MetadataRoute } from 'next';
import { APP_URL } from '@/app/lib/constants';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = APP_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      // `/upgrade` is intentionally indexable — it is the pricing page, it
      // carries a self-referential canonical and is linked from across the
      // marketing site, and it is listed in sitemap.ts. (The old
      // '/upgrade/' entry never matched the real, slashless path anyway.)
      disallow: ['/api/', '/auth/', '/dashboard/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
