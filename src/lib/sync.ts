import { db, Note, Mutation, initializeDatabase } from './db'
import { supabase } from './supabase'

// Cache for user ID to avoid repeated auth calls
let userIdCache: string | null = null;
let userIdCacheTime = 0;
const USER_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Sync state management
let isSyncing = false;
let syncQueue: (() => Promise<void>)[] = [];
let lastSyncTime = 0;
const SYNC_COOLDOWN = 5 * 1000; // Reduced to 5 seconds for more responsive sync

// Real-time subscription management
let realtimeSubscription: any = null;
let isRealtimeEnabled = false;

function isoNow() {
  return new Date().toISOString()
}

export async function getUserId(): Promise<string | null> {
  // Check cache first
  const now = Date.now();
  if (userIdCache && (now - userIdCacheTime) < USER_CACHE_DURATION) {
    return userIdCache;
  }

  try {
    const { data } = await supabase.auth.getUser()
    console.log('getUserId called, user data:', data.user ? 'User found' : 'No user')
    if (data.user) {
      console.log('User ID:', data.user.id)
      userIdCache = data.user.id;
      userIdCacheTime = now;
    }
    return data.user?.id ?? null
  } catch (error) {
    console.error('Error getting user ID:', error);
    return null;
  }
}

export async function upsertNoteLocal(note: Note) {
  await db.updateNote(note)
}

export async function queueMutation(m: Mutation) {
  await db.mutations.add(m)
  
  // Trigger sync immediately for better responsiveness
  if (!isSyncing) {
    scheduleSync();
  }
}

// Debounced sync to prevent excessive API calls
function scheduleSync() {
  const now = Date.now();
  if (now - lastSyncTime < SYNC_COOLDOWN) {
    // Wait for cooldown
    setTimeout(() => {
      if (!isSyncing) {
        performSync();
      }
    }, SYNC_COOLDOWN - (now - lastSyncTime));
  } else {
    performSync();
  }
}

export async function performSync() {
  if (isSyncing) return;
  
  isSyncing = true;
  try {
    await flushQueue();
    await pullRemote();
    lastSyncTime = Date.now();
  } catch (error) {
    console.error('Sync failed:', error);
  } finally {
    isSyncing = false;
    
    // Process any queued syncs
    if (syncQueue.length > 0) {
      const nextSync = syncQueue.shift();
      if (nextSync) {
        setTimeout(nextSync, 1000); // Wait 1 second before next sync
      }
    }
  }
}

export async function flushQueue() {
  const user_id = await getUserId()
  if (!user_id) return // require login to sync

  const toSend = await db.mutations.orderBy('ts').toArray()
  if (toSend.length === 0) return;

  console.log(`Flushing ${toSend.length} mutations`);

  // Process mutations in batches for better performance
  const batchSize = 10;
  for (let i = 0; i < toSend.length; i += batchSize) {
    const batch = toSend.slice(i, i + batchSize);
    
    for (const m of batch) {
      try {
        if (m.type === 'upsert') {
          const note = await db.getNote(m.noteId);
          if (!note) { 
            await db.mutations.delete(m.id!); 
            continue; 
          }
          
          if (note.deleted) {
            // If marked deleted, send delete instead
            const rid = note.remote_id
            if (rid) {
              const { error } = await supabase.from('notes').delete().eq('id', rid)
              if (!error) {
                // Mark as deleted instead of permanently deleting
                await db.updateNote({ ...note, dirty: false })
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
            await db.updateNote({ ...note, remote_id: data.id, user_id, dirty: false })
          }
        } else if (m.type === 'delete') {
          const note = await db.getNote(m.noteId)
          if (note?.remote_id) {
            const { error } = await supabase.from('notes').delete().eq('id', note.remote_id)
            if (error) throw error
          }
          // Mark as deleted instead of permanently deleting
          await db.updateNote({ ...note, deleted: true, dirty: false })
        }
        await db.mutations.delete(m.id!)
      } catch (e) {
        // stop processing on first failure to avoid hammering
        console.error('Flush error', e)
        break
      }
    }
  }
}

export async function pullRemote() {
  const user_id = await getUserId()
  if (!user_id) {
    console.log('No user_id found, skipping pullRemote')
    return // require login to sync
  }
  
  console.log('Pulling remote notes for user:', user_id)
  
  try {
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(100); // Limit to prevent overwhelming the client
    
    if (error) {
      console.error('Error pulling remote notes:', error)
      throw error
    }
    
    console.log('Remote notes found:', data.length)
    
    // Process notes in batches
    const batchSize = 20;
    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      const notesToUpdate: Note[] = [];
      
      for (const r of batch) {
        const existing = await db.notes.where('remote_id').equals(r.id).first()
        const localNewer = existing && existing.updated_at > r.updated_at
        
        if (!localNewer) {
          notesToUpdate.push({
            id: existing?.id ?? crypto.randomUUID(),
            remote_id: r.id,
            title: r.title ?? '',
            body: r.body ?? '',
            created_at: r.created_at ?? new Date().toISOString(),
            updated_at: r.updated_at ?? new Date().toISOString(),
            user_id: r.user_id,
            dirty: false,
            deleted: false
          });
        }
      }
      
      if (notesToUpdate.length > 0) {
        await db.batchUpdateNotes(notesToUpdate);
        console.log(`Synced ${notesToUpdate.length} remote notes`);
      }
    }
  } catch (error) {
    console.error('Pull remote failed:', error);
    throw error;
  }
}

// Real-time subscription setup
export async function setupRealtimeSubscription() {
  const user_id = await getUserId();
  if (!user_id || isRealtimeEnabled) return;

  try {
    console.log('Setting up real-time subscription for user:', user_id);
    
    realtimeSubscription = supabase
      .channel('notes-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notes',
          filter: `user_id=eq.${user_id}`
        },
        async (payload) => {
          console.log('Real-time change detected:', payload);
          
          // Handle different types of changes
          if (payload.eventType === 'INSERT') {
            await handleRemoteInsert(payload.new);
          } else if (payload.eventType === 'UPDATE') {
            await handleRemoteUpdate(payload.new);
          } else if (payload.eventType === 'DELETE') {
            await handleRemoteDelete(payload.old);
          }
          
          // Trigger UI update
          window.dispatchEvent(new CustomEvent('notes-updated'));
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        isRealtimeEnabled = status === 'SUBSCRIBED';
      });

  } catch (error) {
    console.error('Failed to setup real-time subscription:', error);
  }
}

// Handle remote insert
async function handleRemoteInsert(newNote: any) {
  const existing = await db.notes.where('remote_id').equals(newNote.id).first();
  if (!existing) {
    const note: Note = {
      id: crypto.randomUUID(),
      remote_id: newNote.id,
      title: newNote.title ?? '',
      body: newNote.body ?? '',
      created_at: newNote.created_at ?? new Date().toISOString(),
      updated_at: newNote.updated_at ?? new Date().toISOString(),
      user_id: newNote.user_id,
      dirty: false,
      deleted: false
    };
    await db.updateNote(note);
  }
}

// Handle remote update
async function handleRemoteUpdate(updatedNote: any) {
  const existing = await db.notes.where('remote_id').equals(updatedNote.id).first();
  if (existing) {
    // Only update if remote is newer
    if (existing.updated_at < updatedNote.updated_at) {
      const note: Note = {
        ...existing,
        title: updatedNote.title ?? existing.title,
        body: updatedNote.body ?? existing.body,
        updated_at: updatedNote.updated_at ?? existing.updated_at,
        dirty: false
      };
      await db.updateNote(note);
    }
  }
}

// Handle remote delete
async function handleRemoteDelete(deletedNote: any) {
  const existing = await db.notes.where('remote_id').equals(deletedNote.id).first();
  if (existing) {
    const note: Note = {
      ...existing,
      deleted: true,
      dirty: false
    };
    await db.updateNote(note);
  }
}

// Cleanup real-time subscription
export function cleanupRealtimeSubscription() {
  if (realtimeSubscription) {
    supabase.removeChannel(realtimeSubscription);
    realtimeSubscription = null;
    isRealtimeEnabled = false;
    console.log('Real-time subscription cleaned up');
  }
}

export async function initSync() {
  // Initialize database first
  await initializeDatabase();
  
  // Setup real-time subscription
  await setupRealtimeSubscription();
  
  // Run initial sync
  await performSync();
}

// Enhanced sync with retry logic
export async function syncWithRetry(maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await performSync();
      return; // Success
    } catch (error) {
      console.error(`Sync attempt ${attempt} failed:`, error);
      if (attempt === maxRetries) {
        throw error; // Give up after max retries
      }
      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}

// Listen for SW messages
window.addEventListener('app-sync-pending', () => {
  if (!isSyncing) {
    performSync();
  } else {
    // Queue sync if already in progress
    syncQueue.push(performSync);
  }
})

// Also run when back online
window.addEventListener('online', () => {
  console.log('App is back online, triggering sync');
  if (!isSyncing) {
    performSync();
  } else {
    syncQueue.push(performSync);
  }
  
  // Re-setup real-time subscription
  setupRealtimeSubscription();
  
  if ('serviceWorker' in navigator && 'SyncManager' in window) {
    navigator.serviceWorker.ready.then(reg => reg.sync.register('sync-notes')).catch(() => {})
  }
})

// Listen for online status changes from service worker
window.addEventListener('online-status-change', (event: CustomEvent) => {
  const { online } = event.detail;
  console.log('Online status changed:', online);
  
  if (online && !isSyncing) {
    performSync();
    setupRealtimeSubscription();
  } else if (!online) {
    cleanupRealtimeSubscription();
  }
});

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

// Performance monitoring
export async function getSyncStats() {
  const stats = await db.getStats();
  return {
    ...stats,
    isSyncing,
    syncQueueLength: syncQueue.length,
    lastSyncTime,
    userIdCached: !!userIdCache,
    realtimeEnabled: isRealtimeEnabled
  };
}

// Clear all caches (useful for debugging)
export function clearAllCaches() {
  db.clearCache();
  userIdCache = null;
  userIdCacheTime = 0;
  console.log('All caches cleared');
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  cleanupRealtimeSubscription();
});
