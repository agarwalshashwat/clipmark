'use server';

import { createServerSupabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function createGroup(formData: FormData) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const name = (formData.get('name') as string)?.trim();
  const type = formData.get('type') as 'custom' | 'tag';
  const tagName = ((formData.get('tag_name') as string) ?? '').trim().replace(/^#/, '') || null;

  if (!name) throw new Error('Group name is required');
  if (!['custom', 'tag'].includes(type)) throw new Error('Invalid group type');
  if (type === 'tag' && !tagName) throw new Error('Tag name is required for tag groups');

  await supabase.from('groups').insert({ user_id: user.id, name, type, tag_name: tagName });
  revalidatePath('/dashboard/groups');
}

export async function deleteGroup(groupId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('groups').delete().eq('id', groupId).eq('user_id', user.id);
  revalidatePath('/dashboard/groups');
}

export async function addCollectionToGroup(groupId: string, videoId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Verify group belongs to user
  const { data: group } = await supabase.from('groups').select('id').eq('id', groupId).eq('user_id', user.id).single();
  if (!group) throw new Error('Group not found');

  await supabase.from('group_collections').upsert({ group_id: groupId, collection_id: videoId });
  revalidatePath('/dashboard/groups');
}

export async function removeCollectionFromGroup(groupId: string, videoId: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await supabase.from('group_collections')
    .delete()
    .eq('group_id', groupId)
    .eq('collection_id', videoId);
  revalidatePath('/dashboard/groups');
}
