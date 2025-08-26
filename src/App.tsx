import React, { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { db, Note } from '@/lib/db'
import { ensureSyncRegistered, flushQueue, initSync, newLocalNote, queueMutation, upsertNoteLocal } from '@/lib/sync'
import { NoteCard } from '@/components/NoteCard'
import { NoteEditor } from '@/components/NoteEditor'

function useDarkMode() {
  const [dark, setDark] = useState(false)
  useEffect(() => {
    // Initialize theme from localStorage only on client side
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const initialTheme = savedTheme ? savedTheme === 'dark' : prefersDark
    setDark(initialTheme)
  }, [])
  
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = document.documentElement
      if (dark) {
        root.classList.add('dark')
        localStorage.setItem('theme', 'dark')
      } else {
        root.classList.remove('dark')
        localStorage.setItem('theme', 'light')
      }
    }
  }, [dark])
  return { dark, setDark }
}

export default function App() {
  const { dark, setDark } = useDarkMode()
  const [notes, setNotes] = useState<Note[]>([])
  const [editing, setEditing] = useState<Note | null>(null)
  const [installEvt, setInstallEvt] = useState<any>(null)
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'synced'>('idle')

  useEffect(() => {
    db.notes.orderBy('updated_at').reverse().toArray().then(setNotes)
    db.notes.hook('creating', function () {}) // dummy to keep Dexie imported
    const interval = setInterval(async () => {
      const all = await db.notes.orderBy('updated_at').reverse().toArray()
      setNotes(all.filter(n => !n.deleted))
    }, 500)
    return () => {
      clearInterval(interval);
    }
  }, [])

  useEffect(() => {
    const autoSignIn = async () => {
      try {
        console.log('Attempting auto sign-in...')
        console.log('Supabase URL:', import.meta.env.VITE_SUPABASE_URL)
        console.log('Supabase Key exists:', !!import.meta.env.VITE_SUPABASE_ANON_KEY)
        
        const { error } = await supabase.auth.signInWithPassword({
          email: 'personal@localhost.app',
          password: 'personal-use-only-2024'
        })
        
        if (error && error.message.includes('Invalid login')) {
          console.log('Account not found, creating new account...')
          const { error: signUpError } = await supabase.auth.signUp({
            email: 'personal@localhost.app',
            password: 'personal-use-only-2024'
          })
          
          if (!signUpError) {
            console.log('Personal account created and signed in')
          } else {
            console.error('Sign up error:', signUpError)
          }
        } else if (error) {
          console.error('Sign in error:', error)
        } else {
          console.log('Successfully signed in')
        }
        
        console.log('Initializing sync...')
        // Add a small delay to ensure auth is fully established
        setTimeout(async () => {
          await initSync()
          ensureSyncRegistered()
        }, 1000)
      } catch (err) {
        console.error('Auto sign-in error:', err)
      }
    }
    
    autoSignIn()
  }, [])

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      setSyncStatus('syncing')
      await flushQueue()
      setSyncStatus('synced')
      setTimeout(() => setSyncStatus('idle'), 2000)
    }
    
    const handleOffline = () => {
      setIsOnline(false)
      setSyncStatus('idle')
    }
    
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    
    if (navigator.onLine) {
      handleOnline()
    }
    
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault()
      setInstallEvt(e)
    }
    window.addEventListener('beforeinstallprompt', handler as any)
    return () => window.removeEventListener('beforeinstallprompt', handler as any)
  }, [])

  const installApp = async () => {
    if (!installEvt) return
    installEvt.prompt()
    await installEvt.userChoice
    setInstallEvt(null)
  }

  async function createNote() {
    const n = newLocalNote();
    setEditing(n);
  }

  async function saveNote(n: Note) {
    // Only save if the note has content
    if (n.title.trim() || n.body.trim()) {
      await upsertNoteLocal(n)
      await queueMutation({ type: 'upsert', noteId: n.id, ts: Date.now(), payload: { title: n.title, body: n.body } })
      await flushQueue()
    }
    setEditing(null)
  }

  async function deleteNote(n: Note) {
    await db.notes.put({ ...n, deleted: true, dirty: true, updated_at: new Date().toISOString() })
    await queueMutation({ type: 'delete', noteId: n.id, ts: Date.now() })
    await flushQueue()
  }

  async function copyBody(n: Note) {
    try {
      await navigator.clipboard.writeText(n.body || '')
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-slideUp'
      toast.textContent = 'Copied to clipboard!'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 2000)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = n.body || ''
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
      
      const toast = document.createElement('div')
      toast.className = 'fixed bottom-20 left-1/2 transform -translate-x-1/2 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg z-50 animate-slideUp'
      toast.textContent = 'Copied to clipboard!'
      document.body.appendChild(toast)
      setTimeout(() => toast.remove(), 2000)
    }
  }

  async function forceSync() {
    setSyncStatus('syncing')
    try {
      console.log('Force syncing...')
      
      // First check authentication status
      const { data: { user } } = await supabase.auth.getUser()
      console.log('Current user:', user)
      
      if (!user) {
        console.log('No user found, attempting to sign in again...')
        const { error } = await supabase.auth.signInWithPassword({
          email: 'personal@localhost.app',
          password: 'personal-use-only-2024'
        })
        
        if (error && error.message.includes('Invalid login')) {
          console.log('Account not found, creating new account...')
          const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: 'personal@localhost.app',
            password: 'personal-use-only-2024'
          })
          
          if (signUpError) {
            console.error('Account creation failed:', signUpError)
            setSyncStatus('idle')
            return
          }
          
          console.log('Account creation response:', signUpData)
          
          if (signUpData.user && !signUpData.user.email_confirmed_at) {
            console.log('Account created but email confirmation required')
            // For development, we can try to sign in anyway
          }
          
          console.log('Account created successfully')
          
          // Try to sign in again after creating the account
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: 'personal@localhost.app',
            password: 'personal-use-only-2024'
          })
          
          if (signInError) {
            console.error('Sign in after creation failed:', signInError)
            setSyncStatus('idle')
            return
          }
          
          console.log('Sign in after account creation successful')
        } else if (error) {
          console.error('Re-authentication failed:', error)
          setSyncStatus('idle')
          return
        } else {
          console.log('Re-authentication successful')
        }
      }
      
      // Test database connection
      console.log('Testing database connection...')
      const { data: testData, error: testError } = await supabase
        .from('notes')
        .select('count')
        .limit(1)
      
      if (testError) {
        console.error('Database connection test failed:', testError)
        setSyncStatus('idle')
        return
      }
      
      console.log('Database connection successful')
      
      await initSync()
      setSyncStatus('synced')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch (error) {
      console.error('Force sync error:', error)
      setSyncStatus('idle')
    }
  }

  return (
    <div className="min-h-screen">
      <header className="header-bar">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold">PWA App</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Your personal AI prompt organizer</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                {isOnline ? (
                  <div className="flex items-center gap-2">
                    {syncStatus === 'syncing' && (
                      <>
                        <div className="spinner"></div>
                        <span className="text-xs text-blue-600 dark:text-blue-400">Syncing...</span>
                      </>
                    )}
                    {syncStatus === 'synced' && (
                      <>
                        <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-xs text-green-600 dark:text-green-400">Synced</span>
                      </>
                    )}
                    {syncStatus === 'idle' && (
                      <>
                        <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                        <span className="text-xs text-slate-500 dark:text-slate-400">Online</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-slate-400"></div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Offline</span>
                  </div>
                )}
              </div>
              
              <button
                className="btn-icon"
                onClick={forceSync}
                aria-label="Force sync"
                title="Force sync"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
              <button
                className="btn-icon"
                onClick={() => setDark(!dark)}
                aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {dark ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                  </svg>
                )}
              </button>
              {installEvt && (
                <button className="btn-primary flex items-center gap-2" onClick={installApp}>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Install</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-3">
        <section className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {/* Removed the button and total notes count */}
          </div>
        </section>

        {notes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-24 h-24 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
              <svg className="w-12 h-12 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-slate-700 dark:text-slate-300 mb-2">No notes yet</h3>
            <p className="text-slate-500 dark:text-slate-400 text-center max-w-md mb-6">
              Start organizing your AI prompts and ideas. Create your first note to get started!
            </p>
            <button className="btn-primary flex items-center gap-2" onClick={createNote}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Your First Note</span>
            </button>
          </div>
        ) : (
          <section className="note-grid">
            {notes.map(n => (
              <NoteCard
                key={n.id}
                note={n}
                onCopy={copyBody}
                onEdit={setEditing}
                onDelete={deleteNote}
                isOnline={isOnline} // Ensure this line is present only once
              />
            ))}
          </section>
        )}
      </div>

      {editing && (
        <NoteEditor
          initial={editing}
          onSave={saveNote}
          onCancel={() => setEditing(null)}
        />
      )}

      <button className="fab" onClick={createNote} aria-label="Create new note">
        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}
