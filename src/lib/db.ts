import Dexie, { Table } from 'dexie'

export type Note = {
  id: string;              // local UUID
  remote_id?: string;      // Supabase id (uuid)
  title: string;
  body: string;
  created_at: string;      // ISO
  updated_at: string;      // ISO
  user_id?: string | null; // supabase user
  dirty?: boolean;         // needs sync
  deleted?: boolean;       // soft delete
}

export type Mutation = {
  id?: number;
  type: 'upsert' | 'delete';
  noteId: string;       // local id
  payload?: Partial<Note>;
  ts: number;
}

// Cache for frequently accessed data
const noteCache = new Map<string, Note>();
const cacheTimeout = 5 * 60 * 1000; // 5 minutes

export class AppDB extends Dexie {
  notes!: Table<Note, string>
  mutations!: Table<Mutation, number>

  constructor() {
    super('prompt_manager_db')
    
    // Optimize database configuration for better performance
    this.version(1).stores({
      notes: 'id, remote_id, updated_at, user_id, dirty, deleted',
      mutations: '++id, type, noteId, ts'
    });

    // Add indexes for better query performance
    this.version(2).stores({
      notes: 'id, remote_id, updated_at, user_id, dirty, deleted, *title, *body',
      mutations: '++id, type, noteId, ts'
    });

    // Enable debugging in development
    if (process.env.NODE_ENV === 'development') {
      this.on('ready', () => {
        console.log('Database ready with optimized configuration');
      });
    }
  }

  // Optimized note retrieval with caching
  async getNote(id: string): Promise<Note | undefined> {
    // Check cache first
    const cached = noteCache.get(id);
    if (cached) {
      return cached;
    }

    // Get from database
    const note = await this.notes.get(id);
    if (note) {
      // Cache the result
      noteCache.set(id, note);
      // Clear cache after timeout
      setTimeout(() => noteCache.delete(id), cacheTimeout);
    }
    return note;
  }

  // Optimized note updates with cache invalidation and duplicate prevention
  async updateNote(note: Note): Promise<void> {
    // Check if note already exists with same content to prevent unnecessary updates
    const existing = await this.notes.get(note.id);
    if (existing && 
        existing.title === note.title && 
        existing.body === note.body && 
        existing.updated_at === note.updated_at) {
      return; // No changes, skip update
    }
    
    await this.notes.put(note);
    // Invalidate cache
    noteCache.delete(note.id);
  }



  // Batch operations for better performance
  async batchUpdateNotes(notes: Note[]): Promise<void> {
    await this.notes.bulkPut(notes);
    // Clear cache for updated notes
    notes.forEach(note => noteCache.delete(note.id));
  }

  // Optimized query with pagination
  async getNotesPaginated(page: number = 1, limit: number = 20): Promise<Note[]> {
    const offset = (page - 1) * limit;
    return await this.notes
      .where('deleted')
      .equals(false)
      .reverse()
      .sortBy('updated_at')
      .then(notes => notes.slice(offset, offset + limit));
  }

  // Search notes with full-text search
  async searchNotes(query: string): Promise<Note[]> {
    const lowerQuery = query.toLowerCase();
    return await this.notes
      .where('deleted')
      .equals(false)
      .filter(note => 
        note.title.toLowerCase().includes(lowerQuery) ||
        note.body.toLowerCase().includes(lowerQuery)
      )
      .toArray();
  }

  // Get notes that need syncing
  async getDirtyNotes(): Promise<Note[]> {
    return await this.notes
      .where('dirty')
      .equals(true)
      .toArray();
  }

  // Clear old mutations to prevent database bloat
  async cleanupOldMutations(daysOld: number = 7): Promise<void> {
    const cutoff = Date.now() - (daysOld * 24 * 60 * 60 * 1000);
    await this.mutations
      .where('ts')
      .below(cutoff)
      .delete();
  }

  // Get database statistics
  async getStats(): Promise<{ notes: number; mutations: number; cacheSize: number }> {
    const notes = await this.notes.count();
    const mutations = await this.mutations.count();
    return {
      notes,
      mutations,
      cacheSize: noteCache.size
    };
  }

  // Clear all caches
  clearCache(): void {
    noteCache.clear();
  }
}

export const db = new AppDB()

// Initialize database with optimizations
export const initializeDatabase = async () => {
  try {
    // Open database connection
    await db.open();
    
    // Clean up old mutations periodically
    await db.cleanupOldMutations();
    
    console.log('Database initialized successfully');
    
    // Log database stats in development
    if (process.env.NODE_ENV === 'development') {
      const stats = await db.getStats();
      console.log('Database stats:', stats);
    }
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
};
