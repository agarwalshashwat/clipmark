import { MetadataRoute } from 'next';
import { APP_URL } from '@/app/lib/constants';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = APP_URL;

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/auth/', '/dashboard/', '/upgrade/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
