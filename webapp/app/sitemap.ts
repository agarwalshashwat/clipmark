import { MetadataRoute } from 'next';
import { createClient } from '@supabase/supabase-js';

const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://clipmark.mithahara.com';

// Direct Supabase client for sitemap generation (read-only)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 1. Static pages
  const staticPages: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    {
      url: `${baseUrl}/signin`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: new Date(),
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];

  // 2. Public Shared Collections
  try {
    const { data: collections } = await supabase
      .from('collections')
      .select('id, created_at')
      .order('created_at', { ascending: false })
      .limit(50000);

    const collectionPages: MetadataRoute.Sitemap = (collections || []).map((col) => ({
      url: `${baseUrl}/v/${col.id}`,
      lastModified: new Date(col.created_at),
      changeFrequency: 'weekly',
      priority: 0.8,
    }));

    return [...staticPages, ...collectionPages];
  } catch (error) {
    console.error('Error generating sitemap collections:', error);
    return staticPages;
  }
}
