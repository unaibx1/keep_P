import React from 'react'
import { Note } from '@/lib/db'

export function NoteCard({
  note,
  onCopy,
  onEdit,
  onDelete,
  isOnline,
}: {
  note: Note
  onCopy: (n: Note) => void
  onEdit: (n: Note) => void
  onDelete: (n: Note) => void
  isOnline: boolean
}) {
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))
    
    if (days === 0) return 'Today'
    if (days === 1) return 'Yesterday'
    if (days < 7) return `${days} days ago`
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`
    if (days < 365) return `${Math.floor(days / 30)} months ago`
    return `${Math.floor(days / 365)} years ago`
  }

  return (
    <div className="card group">
      <div className="flex flex-col h-full">
        <div className="flex justify-between items-start mb-2">
          <h3 className="font-semibold text-lg line-clamp-1 text-slate-800 dark:text-slate-100">
            {note.title || 'Untitled'}
          </h3>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`}></div>
        </div>
        
        <p className="text-sm text-slate-600 dark:text-slate-400 mb-2 flex-grow overflow-hidden">
          <span className="line-clamp-4">
            {note.body || 'No content yet...'}
          </span>
        </p>
        
        <div className="text-xs text-slate-400 dark:text-slate-500 mt-auto pt-2 border-t border-slate-100 dark:border-slate-700/50">
          {formatDate(note.updated_at)}
        </div>

        <div className="card-actions group-hover:opacity-100">
          <button 
            className="btn-icon" 
            onClick={(e) => { e.stopPropagation(); onCopy(note) }} 
            title="Copy content"
            aria-label="Copy note content"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button 
            className="btn-icon" 
            onClick={(e) => { e.stopPropagation(); onEdit(note) }} 
            title="Edit note"
            aria-label="Edit note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button 
            className="btn-icon !border-red-300 dark:!border-red-700 hover:!bg-red-50 dark:hover:!bg-red-900/20 text-red-600 dark:text-red-400" 
            onClick={(e) => { e.stopPropagation(); onDelete(note) }} 
            title="Delete note"
            aria-label="Delete note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
