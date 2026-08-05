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
  if (name.length > 255) throw new Error('Group name must be 255 characters or fewer');
  if (!['custom', 'tag'].includes(type)) throw new Error('Invalid group type');
  if (type === 'tag' && !tagName) throw new Error('Tag name is required for tag groups');
  if (tagName && tagName.length > 50) throw new Error('Tag name must be 50 characters or fewer');

  // New groups go to the end of the user's ordered list, matching the
  // extension's array-push-to-end behavior (dashboard.js's createGroup).
  // If migrations/015_groups_position.sql hasn't been applied yet, this
  // select errors (position column doesn't exist) — data comes back null,
  // which maxRow?.position already handles fine via optional chaining.
  const { data: maxRow } = await supabase
    .from('groups')
    .select('position')
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextPosition = (maxRow?.position ?? -1) + 1;

  let { data: created, error: insertError } = await supabase
    .from('groups')
    .insert({ user_id: user.id, name, type, tag_name: tagName, position: nextPosition })
    .select('id')
    .single();

  if (insertError) {
    // Pre-migration environment: inserting a value for a column that
    // doesn't exist fails the whole insert (nothing gets created), silently
    // as far as the caller is concerned — supabase-js returns { error }
    // rather than throwing. Retry without `position` so group creation
    // still works (just without persisted ordering) until the migration
    // runs, instead of quietly doing nothing.
    console.warn('[groups] insert with position failed (migration 015 not applied yet?) — retrying without it:', insertError.message);
    ({ data: created, error: insertError } = await supabase
      .from('groups')
      .insert({ user_id: user.id, name, type, tag_name: tagName })
      .select('id')
      .single());
  }

  if (insertError) throw new Error(insertError.message);

  // Also revalidate '/dashboard' — GroupPickerModal (rendered there) can
  // create a group inline and needs the new group to show up without a
  // full page reload.
  revalidatePath('/dashboard/groups');
  revalidatePath('/dashboard');
  return { id: created?.id as string | undefined };
}

// Mirrors extension/src/popup/dashboard.js's renameGroup (inline
// contentEditable there; a prompt() here, same as the "Save filter" naming
// flow already used elsewhere in this dashboard for a lightweight rename).
export async function renameGroup(groupId: string, name: string) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const trimmed = name.trim();
  if (!trimmed) throw new Error('Group name is required');
  if (trimmed.length > 255) throw new Error('Group name must be 255 characters or fewer');

  await supabase.from('groups').update({ name: trimmed }).eq('id', groupId).eq('user_id', user.id);
  revalidatePath('/dashboard/groups');
  revalidatePath('/dashboard');
}

// Swaps this group's `position` with its immediate neighbor in the user's
// ordered list. Mirrors extension/src/popup/dashboard.js's move-up/move-down
// buttons (saveVideoGroups after an array swap) — the web equivalent needed
// a persisted `position` column (migrations/015_groups_position.sql) since
// groups were previously always ordered by created_at with no way to
// customize that.
export async function reorderGroup(groupId: string, direction: 'up' | 'down') {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: groups, error } = await supabase
    .from('groups')
    .select('id, position')
    .eq('user_id', user.id)
    .order('position', { ascending: true })
    .order('created_at', { ascending: false });

  // Pre-migration environment (position column doesn't exist yet): the
  // query above errors and `groups` comes back null. No-op rather than
  // throw — reordering just isn't available until migrations/
  // 015_groups_position.sql is applied; the rest of the Groups page
  // still works via page.tsx's own fallback to created_at ordering.
  if (error) console.warn('[groups] reorder query failed (migration 015 not applied yet?) — reorder is a no-op:', error.message);
  if (!groups) return;
  const idx = groups.findIndex(g => g.id === groupId);
  if (idx === -1) return;
  const neighborIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (neighborIdx < 0 || neighborIdx >= groups.length) return;

  const current = groups[idx];
  const neighbor = groups[neighborIdx];

  await Promise.all([
    supabase.from('groups').update({ position: neighbor.position }).eq('id', current.id).eq('user_id', user.id),
    supabase.from('groups').update({ position: current.position }).eq('id', neighbor.id).eq('user_id', user.id),
  ]);

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
