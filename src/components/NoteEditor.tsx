import React, { useEffect, useState, useRef } from 'react'
import { Note } from '@/lib/db'

export function NoteEditor({
  initial,
  onSave,
  onCancel
}: {
  initial: Note | null,
  onSave: (n: Note) => void,
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [body, setBody] = useState(initial?.body ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(initial?.title ?? '')
    setBody(initial?.body ?? '')
    // Focus title input when modal opens
    setTimeout(() => titleRef.current?.focus(), 100)
  }, [initial])

  const handleSave = async () => {
    if (!initial) return
    setIsSaving(true)
    
    // Simulate save delay for better UX
    await new Promise(resolve => setTimeout(resolve, 300))
    
    onSave({ 
      ...initial, 
      title: title.trim() || 'Untitled', 
      body: body.trim(), 
      updated_at: new Date().toISOString(), 
      dirty: true 
    })
    setIsSaving(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !isSaving) {
      onCancel()
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      handleSave()
    }
  }

  return (
    <div className="modal-backdrop animate-fadeIn" onClick={onCancel}>
      <div 
        className="modal-content animate-slideUp" 
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gradient">
            {initial?.id ? 'Edit Note' : 'New Note'}
          </h2>
          <button
            onClick={onCancel}
            className="btn-icon"
            aria-label="Close modal"
            disabled={isSaving}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="space-y-4">
          <div>
            <label htmlFor="note-title" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Title
            </label>
            <input
              ref={titleRef}
              id="note-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Enter a title for your note..."
              className="input-field"
              disabled={isSaving}
            />
          </div>
          
          <div>
            <label htmlFor="note-body" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
              Content
            </label>
            <textarea
              id="note-body"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Write your prompt or note content here..."
              rows={10}
              className="input-field resize-none"
              disabled={isSaving}
            />
            <div className="flex justify-between items-center mt-2">
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {body.length} characters
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                Press <kbd className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 rounded">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 text-xs bg-slate-100 dark:bg-slate-700 rounded">S</kbd> to save
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-200 dark:border-slate-700">
          <button 
            className="btn min-w-[100px]" 
            onClick={onCancel}
            disabled={isSaving}
          >
            Cancel
          </button>
          <button 
            className="btn-primary min-w-[100px] flex items-center justify-center gap-2" 
            onClick={handleSave}
            disabled={isSaving}
          >
            {isSaving ? (
              <>
                <div className="spinner"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Save</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
