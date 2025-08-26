import { db, Note, Mutation } from './db'
import { supabase } from './supabase'

function isoNow() {
  return new Date().toISOString()
}

export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser()
  return data.user?.id ?? null
}

export async function upsertNoteLocal(note: Note) {
  await db.notes.put(note)
}

export async function queueMutation(m: Mutation) {
  await db.mutations.add(m)
}

export async function flushQueue() {
  const user_id = await getUserId()
  if (!user_id) return // require login to sync

  const toSend = await db.mutations.orderBy('ts').toArray()
  for (const m of toSend) {
    try {
      if (m.type === 'upsert') {
        const note = await db.notes.get(m.noteId)
        if (!note) { await db.mutations.delete(m.id!); continue }
        if (note.deleted) {
          // If marked deleted, send delete instead
          const rid = note.remote_id
          if (rid) {
            const { error } = await supabase.from('notes').delete().eq('id', rid)
            if (!error) {
              await db.notes.delete(note.id)
            }
          }
        } else {
          const { data, error } = await supabase.from('notes').upsert({
            id: note.remote_id,
            title: note.title,
            body: note.body,
            user_id,
            updated_at: note.updated_at,
            created_at: note.created_at
          }).select().single()

          if (error) throw error
          await db.notes.put({ ...note, remote_id: data.id, user_id, dirty: false })
        }
      } else if (m.type === 'delete') {
        const note = await db.notes.get(m.noteId)
        if (note?.remote_id) {
          const { error } = await supabase.from('notes').delete().eq('id', note.remote_id)
          if (error) throw error
        }
        await db.notes.delete(m.noteId)
      }
      await db.mutations.delete(m.id!)
    } catch (e) {
      // stop processing on first failure to avoid hammering
      console.error('Flush error', e)
      break
    }
  }
}

export async function pullRemote() {
  const user_id = await getUserId()
  if (!user_id) return // require login to sync
  const { data, error } = await supabase.from('notes').select('*').order('updated_at', { ascending: false })
  if (error) throw error
  // Merge
  for (const r of data) {
    const existing = await db.notes.where('remote_id').equals(r.id).first()
    const localNewer = existing && existing.updated_at > r.updated_at
    if (!localNewer) {
      await db.notes.put({
        id: existing?.id ?? crypto.randomUUID(),
        remote_id: r.id,
        title: r.title ?? '',
        body: r.body ?? '',
        created_at: r.created_at ?? new Date().toISOString(),
        updated_at: r.updated_at ?? new Date().toISOString(),
        user_id: r.user_id,
        dirty: false,
        deleted: false
      })
    }
  }
}

export async function initSync() {
  // Run on app load and when SW nudges us
  await flushQueue()
  await pullRemote()
}

// Listen for SW messages
window.addEventListener('app-sync-pending', () => {
  initSync()
})

// Also run when back online
window.addEventListener('online', () => {
  initSync()
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-notes')).catch(() => {})
  }
})

export async function ensureSyncRegistered() {
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    const reg = await navigator.serviceWorker.ready
    try { await reg.sync.register('sync-notes') } catch {}
  }
}

export function newLocalNote(): Note {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    title: '',
    body: '',
    created_at: now,
    updated_at: now,
    dirty: true,
    deleted: false
  }
}
