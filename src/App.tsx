import React, { useEffect, useMemo, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { db, Note } from '@/lib/db'
import { ensureSyncRegistered, flushQueue, initSync, newLocalNote, queueMutation, upsertNoteLocal, performSync, getSyncStats } from '@/lib/sync'
import { NoteCard } from '@/components/NoteCard'
import { NoteEditor } from '@/components/NoteEditor'
import { AuthPage } from '@/components/AuthPage'

// Polyfill for requestIdleCallback
const requestIdleCallback = window.requestIdleCallback || ((cb: Function) => setTimeout(cb, 1))

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
  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    // Load notes immediately with better performance
    const loadNotes = async () => {
      try {
        const all = await db.notes.orderBy('updated_at').reverse().toArray()
        setNotes(all.filter(n => !n.deleted))
      } catch (error) {
        console.error('Error loading notes:', error)
      }
    }
    
    loadNotes()
    
    // Listen for real-time updates from other devices
    const handleNotesUpdated = () => {
      console.log('Notes updated from real-time sync, reloading...')
      loadNotes()
    }
    
    window.addEventListener('notes-updated', handleNotesUpdated)
    
    // Set up periodic refresh for local changes
    const refreshInterval = setInterval(loadNotes, 2000) // Refresh every 2 seconds
    
    return () => {
      window.removeEventListener('notes-updated', handleNotesUpdated)
      clearInterval(refreshInterval)
    }
  }, [])

  useEffect(() => {
    // Optimized user session check
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error) {
          console.error('Error checking user:', error)
        }
        
        setUser(user)
        
        if (user) {
          // Initialize sync in background with lower priority
          requestIdleCallback(() => {
            initSync().catch(console.error)
            ensureSyncRegistered()
          })
          
          // Set up periodic sync every 30 seconds for reliability
          const periodicSync = setInterval(async () => {
            if (navigator.onLine) {
              const stats = await getSyncStats()
              if (!stats.isSyncing) {
                performSync().catch(console.error)
              }
            }
          }, 30000)
          
          return () => clearInterval(periodicSync)
        }
      } catch (error) {
        console.error('Error in checkUser:', error)
      } finally {
        setIsLoading(false)
      }
    }
    
    // Faster timeout for better UX
    const timeoutId = setTimeout(() => {
      setIsLoading(false)
    }, 1500) // Reduced timeout for faster loading
    
    checkUser()
    
    return () => clearTimeout(timeoutId)
    
    // Optimized auth state change listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null)
      
      if (session?.user) {
        // Use requestIdleCallback for non-critical sync initialization
        requestIdleCallback(() => {
          initSync().catch(console.error)
          ensureSyncRegistered()
        })
      }
    })
    
    return () => subscription.unsubscribe()
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
    try {
      const updatedNote = { ...n, deleted: true, dirty: true, updated_at: new Date().toISOString() }
      await db.notes.put(updatedNote)
      await queueMutation({ type: 'delete', noteId: n.id, ts: Date.now() })
      
      // Update the local state immediately for better UX
      setNotes(prevNotes => prevNotes.filter(note => note.id !== n.id))
      
      // Don't force flush immediately - let it sync naturally
      // await flushQueue()
    } catch (error) {
      console.error('Error deleting note:', error)
    }
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
    if (!user) {
      console.log('No user authenticated, cannot sync')
      return
    }
    
    setSyncStatus('syncing')
    try {
      console.log('Force syncing...')
      await initSync()
      setSyncStatus('synced')
      setTimeout(() => setSyncStatus('idle'), 2000)
    } catch (error) {
      console.error('Force sync error:', error)
      setSyncStatus('idle')
    }
  }

  const handleAuthSuccess = () => {
    console.log('Authentication successful')
  }

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus search
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        const searchInput = document.querySelector('input[placeholder="Search notes..."]') as HTMLInputElement
        if (searchInput) {
          searchInput.focus()
        }
      }
      // Escape to clear search
      if (e.key === 'Escape' && searchQuery) {
        setSearchQuery('')
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [searchQuery])

  // Debounced search for better performance
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 150) // 150ms debounce delay
    
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Optimized filtered notes with memoization
  const filteredNotes = useMemo(() => {
    if (!debouncedSearchQuery.trim()) return notes
    const query = debouncedSearchQuery.toLowerCase().trim()
    return notes.filter(note =>
      note.title?.toLowerCase().includes(query) ||
      note.body?.toLowerCase().includes(query)
    )
  }, [notes, debouncedSearchQuery])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900">
        <div className="text-center">
          <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg mx-auto mb-4">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div className="spinner mb-4"></div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100 mb-2">Loading App</h2>
          <p className="text-sm text-slate-600 dark:text-slate-400">Getting your notes ready...</p>
          <button 
            onClick={() => window.location.reload()} 
            className="mt-4 px-4 py-2 text-sm bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors"
          >
            Reload if stuck
          </button>
        </div>
      </div>
    )
  }

  if (!user) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 dark:bg-slate-900/80 border-b border-slate-200/50 dark:border-slate-700/50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-indigo-600 flex items-center justify-center shadow-lg transform hover:scale-105 transition-transform duration-200">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="absolute -top-1 -right-1 w-4 h-4 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full animate-pulse"></div>
              </div>
              <div className="flex flex-col">
                <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                  Prompt Man
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  Your AI companion
                </p>
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
              <button
                className="btn-icon"
                onClick={async () => {
                  await supabase.auth.signOut()
                }}
                aria-label="Sign out"
                title="Sign out"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
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

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Search Bar Section */}
        <section className="mb-8">
          <div className="relative max-w-lg mx-auto">
            {searchQuery && (
              <div className="text-sm text-slate-600 dark:text-slate-300 mb-3 text-center font-medium">
                Found {filteredNotes.length} of {notes.length} notes
              </div>
            )}
            <div className="relative group">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <svg className="h-5 w-5 text-slate-400 group-focus-within:text-blue-500 transition-colors duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search your prompts... (Ctrl+K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="block w-full pl-12 pr-12 py-4 border-2 border-slate-200 dark:border-slate-600 rounded-2xl shadow-sm placeholder-slate-400 dark:placeholder-slate-500 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 text-center transition-all duration-300 hover:shadow-lg focus:shadow-xl hover:scale-[1.02]"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center hover:bg-slate-100 dark:hover:bg-slate-700 rounded-r-2xl transition-colors duration-200"
                >
                  <svg className="h-5 w-5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </section>

        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24">
            <div className="relative mb-8">
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900/20 dark:to-purple-900/20 flex items-center justify-center shadow-lg">
                <svg className="w-16 h-16 text-blue-500 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="absolute -top-2 -right-2 w-8 h-8 bg-gradient-to-r from-pink-500 to-rose-500 rounded-full animate-bounce"></div>
            </div>
            <h3 className="text-2xl font-bold text-slate-800 dark:text-slate-200 mb-3">
              {searchQuery ? 'No prompts found' : 'Ready to create magic?'}
            </h3>
            <p className="text-slate-600 dark:text-slate-400 text-center max-w-md mb-8 leading-relaxed">
              {searchQuery 
                ? `No prompts found matching "${searchQuery}". Try a different search term or create something new!`
                : 'Start organizing your AI prompts and ideas. Your first prompt is just a click away! ✨'
              }
            </p>
            <button className="group relative px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 flex items-center gap-3" onClick={createNote}>
              <svg className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Your First Prompt</span>
            </button>
          </div>
        ) : (
          <section className="note-grid">
            {filteredNotes.map(n => (
              <NoteCard
                key={n.id}
                note={n}
                onCopy={copyBody}
                onEdit={setEditing}
                onDelete={deleteNote}
                isOnline={isOnline}
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

      <button className="group fixed bottom-6 right-6 w-16 h-16 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-full shadow-2xl hover:shadow-3xl transform hover:scale-110 transition-all duration-300 flex items-center justify-center z-50" onClick={createNote} aria-label="Create new prompt">
        <svg className="w-7 h-7 group-hover:rotate-90 transition-transform duration-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  )
}
