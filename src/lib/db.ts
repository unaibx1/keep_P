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

export class AppDB extends Dexie {
  notes!: Table<Note, string>
  mutations!: Table<Mutation, number>

  constructor() {
    super('prompt_manager_db')
    this.version(1).stores({
      notes: 'id, remote_id, updated_at, user_id, dirty, deleted',
      mutations: '++id, type, noteId, ts'
    })
  }
}

export const db = new AppDB()
