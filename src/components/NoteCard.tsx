import React, { useState, useRef, useEffect } from 'react'
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
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPosition, setContextMenuPosition] = useState({ x: 0, y: 0 })
  const cardRef = useRef<HTMLDivElement>(null)
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const isLongPress = useRef(false)

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

  const handleMouseDown = (e: React.MouseEvent) => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      setContextMenuPosition({
        x: e.clientX,
        y: e.clientY
      })
      setShowContextMenu(true)
    }, 500) // 500ms for long press
  }

  const handleMouseUp = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleMouseLeave = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    isLongPress.current = false
    longPressTimer.current = setTimeout(() => {
      isLongPress.current = true
      const touch = e.touches[0]
      setContextMenuPosition({
        x: touch.clientX,
        y: touch.clientY
      })
      setShowContextMenu(true)
    }, 500) // 500ms for long press
  }

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const handleClick = (e: React.MouseEvent) => {
    if (!isLongPress.current) {
      e.preventDefault()
      onCopy(note)
    }
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    setContextMenuPosition({
      x: e.clientX,
      y: e.clientY
    })
    setShowContextMenu(true)
  }

  const closeContextMenu = () => {
    setShowContextMenu(false)
    isLongPress.current = false
  }

  // Close context menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close if clicking anywhere outside the context menu
      const target = event.target as Node
      const contextMenu = document.querySelector('[data-context-menu]')
      if (contextMenu && !contextMenu.contains(target)) {
        closeContextMenu()
      }
    }

    if (showContextMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [showContextMenu])

  return (
    <>
      <div 
        ref={cardRef}
        className="card group cursor-pointer select-none"
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onContextMenu={handleContextMenu}
      >
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
        </div>
      </div>

      {/* Context Menu - Rendered outside the card */}
      {showContextMenu && (
        <div 
          data-context-menu
          className="fixed z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 min-w-[120px]"
          style={{
            left: `${contextMenuPosition.x}px`,
            top: `${contextMenuPosition.y}px`,
            transform: 'translate(-50%, -100%)'
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="w-full px-4 py-2 text-left text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation()
              onEdit(note)
              closeContextMenu()
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Edit
          </button>
          <button
            className="w-full px-4 py-2 text-left text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(note)
              closeContextMenu()
            }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete
          </button>
        </div>
      )}
    </>
  )
}
