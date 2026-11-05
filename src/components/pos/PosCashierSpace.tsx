'use client'

import React, { type CSSProperties, type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  Check,
  ChevronDown,
  Circle,
  Edit3,
  Heart,
  ImagePlus,
  Loader2,
  NotebookPen,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '@/lib/firebase'

export type CashierSpaceView = 'notes' | 'inspiration'

export function PosCashierSpaceButton({
  onSelect,
  label = 'Mi espacio',
  mobileLabel = 'Espacio',
}: {
  onSelect: (view: CashierSpaceView) => void
  label?: string
  mobileLabel?: string
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 8 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setMenuPosition({
        top: Math.max(8, Math.min(rect.bottom + 8, window.innerHeight - 112)),
        left: Math.max(8, Math.min(rect.left, window.innerWidth - 200)),
      })
    }
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setMenuOpen(false)
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [menuOpen])

  const choose = (view: CashierSpaceView) => {
    onSelect(view)
    setMenuOpen(false)
  }

  return (
    <div ref={wrapperRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setMenuOpen(value => !value)}
        aria-expanded={menuOpen}
        aria-haspopup="menu"
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-rose-200 bg-gradient-to-r from-rose-50 via-white to-pink-50 px-2.5 text-[11px] font-bold text-rose-700 shadow-sm transition hover:border-rose-300 hover:from-rose-100 hover:to-pink-100 hover:text-rose-800 active:scale-[.98] sm:px-3 sm:text-xs"
        title="Abrir tus notas o inspiración"
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-rose-100">
          <Sparkles size={12} className="text-rose-600" />
        </span>
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">{mobileLabel}</span>
        <ChevronDown size={12} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
      </button>
      {menuOpen && (
        <div role="menu" style={{ position: 'fixed', top: menuPosition.top, left: menuPosition.left }} className="z-[100] w-48 overflow-hidden rounded-xl border border-rose-100 bg-white p-1.5 shadow-xl">
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('notes')}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700"
          >
            <NotebookPen size={17} className="text-rose-600" />
            Notas
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose('inspiration')}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition hover:bg-rose-50 hover:text-rose-700"
          >
            <Heart size={17} className="text-pink-600" />
            Inspiración
          </button>
        </div>
      )}
    </div>
  )
}

interface CashierNote {
  id: string
  text: string
  done: boolean
  createdAtMs: number
}

type InspirationColor = 'white' | 'gold' | 'rose' | 'sky' | 'mint'
type InspirationFont = 'bold' | 'rounded' | 'serif'
type InspirationAnimation = 'none' | 'breathe' | 'shine'

interface InspirationStyle {
  color: InspirationColor
  font: InspirationFont
  animation: InspirationAnimation
}

const DEFAULT_INSPIRATION_STYLE: InspirationStyle = { color: 'gold', font: 'bold', animation: 'breathe' }

const INSPIRATION_COLORS: Array<{ id: InspirationColor; label: string; value: string }> = [
  { id: 'white', label: 'Blanco', value: '#ffffff' },
  { id: 'gold', label: 'Dorado', value: '#ffe28a' },
  { id: 'rose', label: 'Rosa', value: '#ffc4d6' },
  { id: 'sky', label: 'Celeste', value: '#b9e5ff' },
  { id: 'mint', label: 'Menta', value: '#b7f4d2' },
]

const INSPIRATION_FONTS: Array<{ id: InspirationFont; label: string; family: string }> = [
  { id: 'bold', label: 'Fuerte', family: 'Arial, Helvetica, sans-serif' },
  { id: 'rounded', label: 'Suave', family: 'Trebuchet MS, Arial, sans-serif' },
  { id: 'serif', label: 'Clásica', family: 'Georgia, serif' },
]

const INSPIRATION_ANIMATIONS: Array<{ id: InspirationAnimation; label: string }> = [
  { id: 'none', label: 'Quieta' },
  { id: 'breathe', label: 'Respirar' },
  { id: 'shine', label: 'Destello' },
]

const parseInspirationStyle = (data: Record<string, unknown>): InspirationStyle => ({
  color: INSPIRATION_COLORS.some(option => option.id === data.inspirationColor)
    ? data.inspirationColor as InspirationColor
    : DEFAULT_INSPIRATION_STYLE.color,
  font: INSPIRATION_FONTS.some(option => option.id === data.inspirationFont)
    ? data.inspirationFont as InspirationFont
    : DEFAULT_INSPIRATION_STYLE.font,
  animation: INSPIRATION_ANIMATIONS.some(option => option.id === data.inspirationAnimation)
    ? data.inspirationAnimation as InspirationAnimation
    : DEFAULT_INSPIRATION_STYLE.animation,
})

export function PosCashierSpacePanel({
  view,
  cashierId,
  cashierName,
  onClose,
}: {
  view: CashierSpaceView
  cashierId: string
  cashierName: string
  onClose: () => void
}) {
  const cashierKey = useMemo(() => encodeURIComponent(String(cashierId || '').trim()), [cashierId])
  const [notes, setNotes] = useState<CashierNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [phrase, setPhrase] = useState('')
  const [phraseDraft, setPhraseDraft] = useState('')
  const [inspirationStyle, setInspirationStyle] = useState<InspirationStyle>(DEFAULT_INSPIRATION_STYLE)
  const [savedInspirationStyle, setSavedInspirationStyle] = useState<InspirationStyle>(DEFAULT_INSPIRATION_STYLE)
  const [imageUrl, setImageUrl] = useState('')
  const [imagePath, setImagePath] = useState('')
  const [imageFileDraft, setImageFileDraft] = useState<File | null>(null)
  const [removeImageDraft, setRemoveImageDraft] = useState(false)
  const [imagePreviewUrl, setImagePreviewUrl] = useState('')
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null)
  const [inspirationStageSize, setInspirationStageSize] = useState({ width: 0, height: 0 })
  const [editingInspiration, setEditingInspiration] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingNote, setSavingNote] = useState(false)
  const [savingPhrase, setSavingPhrase] = useState(false)
  const [dataError, setDataError] = useState('')
  const [actionError, setActionError] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const inspirationStageRef = useRef<HTMLDivElement>(null)
  const profileInitializedRef = useRef(false)

  useEffect(() => {
    if (!imagePreviewUrl) return
    return () => URL.revokeObjectURL(imagePreviewUrl)
  }, [imagePreviewUrl])

  useEffect(() => {
    setNotes([])
    setPhrase('')
    setPhraseDraft('')
    setInspirationStyle(DEFAULT_INSPIRATION_STYLE)
    setSavedInspirationStyle(DEFAULT_INSPIRATION_STYLE)
    setImageUrl('')
    setImagePath('')
    setImageFileDraft(null)
    setRemoveImageDraft(false)
    setImagePreviewUrl('')
    setImageDimensions(null)
    setEditingInspiration(false)
    profileInitializedRef.current = false
    setDataError('')
    setActionError('')
    setNewNote('')
    setLoading(true)

    if (!cashierKey || cashierKey === 'default') {
      setLoading(false)
      return
    }

    const notesRef = collection(db, 'pos_cashier_notes', cashierKey, 'items')
    const profileRef = doc(db, 'pos_cashier_profiles', cashierKey)
    const stopNotes = onSnapshot(notesRef, snapshot => {
      const nextNotes = snapshot.docs.map(noteDoc => {
        const data = noteDoc.data()
        return {
          id: noteDoc.id,
          text: String(data.text || ''),
          done: Boolean(data.done),
          createdAtMs: Number(data.createdAtMs || 0),
        }
      }).sort((a, b) => a.createdAtMs - b.createdAtMs)
      setNotes(nextNotes)
      setLoading(false)
      setDataError('')
    }, error => {
      console.error('[POS espacio] Error al cargar notas:', error)
      setDataError('No se pudieron sincronizar tus notas. Revisa tu conexión e inténtalo de nuevo.')
      setLoading(false)
    })
    const stopProfile = onSnapshot(profileRef, snapshot => {
      const data = snapshot.data() || {}
      const savedPhrase = String(data.inspirationPhrase || '')
      const savedImageUrl = String(data.inspirationImageUrl || '')
      setPhrase(savedPhrase)
      setImageUrl(savedImageUrl)
      setImagePath(String(data.inspirationImagePath || ''))
      if (!profileInitializedRef.current) {
        const savedStyle = parseInspirationStyle(data)
        setPhraseDraft(savedPhrase)
        setInspirationStyle(savedStyle)
        setSavedInspirationStyle(savedStyle)
        setEditingInspiration(!savedPhrase && !savedImageUrl)
        profileInitializedRef.current = true
      }
    }, error => {
      console.error('[POS espacio] Error al cargar inspiración:', error)
      setDataError('No se pudo cargar tu inspiración. Revisa tu conexión e inténtalo de nuevo.')
    })

    return () => {
      stopNotes()
      stopProfile()
    }
  }, [cashierKey])

  const addNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = newNote.trim()
    if (!text || !cashierKey || cashierKey === 'default') return
    setSavingNote(true)
    setActionError('')
    try {
      const notesRef = collection(db, 'pos_cashier_notes', cashierKey, 'items')
      await setDoc(doc(notesRef), {
        text,
        done: false,
        createdAtMs: Date.now(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      setNewNote('')
    } catch (error) {
      console.error('[POS espacio] Error al guardar nota:', error)
      setActionError('No se pudo guardar la nota. Inténtalo de nuevo.')
    } finally {
      setSavingNote(false)
    }
  }

  const toggleNote = async (note: CashierNote) => {
    if (!cashierKey || cashierKey === 'default') return
    setActionError('')
    try {
      await updateDoc(doc(db, 'pos_cashier_notes', cashierKey, 'items', note.id), {
        done: !note.done,
        updatedAt: serverTimestamp(),
      })
    } catch (error) {
      console.error('[POS espacio] Error al actualizar nota:', error)
      setActionError('No se pudo actualizar la nota. Inténtalo de nuevo.')
    }
  }

  const removeNote = async (noteId: string) => {
    if (!cashierKey || cashierKey === 'default') return
    setActionError('')
    try {
      await deleteDoc(doc(db, 'pos_cashier_notes', cashierKey, 'items', noteId))
    } catch (error) {
      console.error('[POS espacio] Error al eliminar nota:', error)
      setActionError('No se pudo eliminar la nota. Inténtalo de nuevo.')
    }
  }

  const saveInspiration = async () => {
    if (!cashierKey || cashierKey === 'default') return
    if (!imageUrl && !imageFileDraft && !phraseDraft.trim() && !removeImageDraft && !phrase) {
      setActionError('Agrega una foto o escribe una frase antes de guardar.')
      return
    }
    setSavingPhrase(true)
    setActionError('')
    let uploadedImagePath = ''
    try {
      let nextImageUrl = removeImageDraft ? '' : imageUrl
      let nextImagePath = removeImageDraft ? '' : imagePath
      if (imageFileDraft) {
        const safeName = imageFileDraft.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        nextImagePath = `pos/inspiracion/${cashierKey}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`
        uploadedImagePath = nextImagePath
        const imageRef = ref(storage, nextImagePath)
        await uploadBytes(imageRef, imageFileDraft, { contentType: imageFileDraft.type })
        nextImageUrl = await getDownloadURL(imageRef)
      }
      await setDoc(doc(db, 'pos_cashier_profiles', cashierKey), {
        inspirationPhrase: phraseDraft.trim(),
        inspirationColor: inspirationStyle.color,
        inspirationFont: inspirationStyle.font,
        inspirationAnimation: inspirationStyle.animation,
        inspirationImageUrl: nextImageUrl,
        inspirationImagePath: nextImagePath,
        updatedAt: serverTimestamp(),
      }, { merge: true })
      setPhrase(phraseDraft.trim())
      setSavedInspirationStyle({ ...inspirationStyle })
      setImageUrl(nextImageUrl)
      setImagePath(nextImagePath)
      setImageFileDraft(null)
      setRemoveImageDraft(false)
      setImagePreviewUrl('')
      if (imagePath && imagePath !== nextImagePath) {
        try { await deleteObject(ref(storage, imagePath)) } catch {}
      }
      setEditingInspiration(false)
    } catch (error) {
      if (uploadedImagePath) {
        try { await deleteObject(ref(storage, uploadedImagePath)) } catch {}
      }
      console.error('[POS espacio] Error al guardar inspiración:', error)
      setActionError('No se pudo guardar tu inspiración. Inténtalo de nuevo.')
    } finally {
      setSavingPhrase(false)
    }
  }

  const selectInspirationImage = (file?: File) => {
    if (!file || !cashierKey || cashierKey === 'default') return
    setActionError('')
    if (!file.type.startsWith('image/')) {
      setActionError('Elige una imagen en formato JPG, PNG o similar.')
      return
    }
    if (file.size > 8 * 1024 * 1024) {
      setActionError('La imagen debe pesar menos de 8 MB.')
      return
    }

    setImageFileDraft(file)
    setRemoveImageDraft(false)
    setImagePreviewUrl(URL.createObjectURL(file))
    setImageDimensions(null)
  }

  const cancelInspirationEdit = () => {
    setPhraseDraft(phrase)
    setInspirationStyle(savedInspirationStyle)
    setImageFileDraft(null)
    setRemoveImageDraft(false)
    setImagePreviewUrl('')
    setImageDimensions(null)
    setActionError('')
    setEditingInspiration(false)
  }

  const unavailableAccount = !cashierKey || cashierKey === 'default'
  const activeNotes = notes.filter(note => !note.done).length
  const isInspiration = view === 'inspiration'
  const inspirationImage = imagePreviewUrl || (removeImageDraft ? '' : imageUrl)
  const isPortraitImage = Boolean(imageDimensions && imageDimensions.height > imageDimensions.width)
  const selectedColor = INSPIRATION_COLORS.find(option => option.id === inspirationStyle.color) || INSPIRATION_COLORS[1]
  const selectedFont = INSPIRATION_FONTS.find(option => option.id === inspirationStyle.font) || INSPIRATION_FONTS[0]
  const cardMotionClass = inspirationStyle.animation === 'shine'
    ? 'pos-inspiration-motion-shine'
    : inspirationStyle.animation === 'breathe'
      ? 'pos-inspiration-motion-breathe'
      : ''
  const cardAspect = inspirationImage && isPortraitImage ? 4 / 5 : 16 / 9
  const fittedCardWidth = Math.min(inspirationStageSize.width, inspirationStageSize.height * cardAspect)
  const fittedCardHeight = fittedCardWidth > 0 ? fittedCardWidth / cardAspect : 0
  const inspirationCardStyle: CSSProperties = fittedCardWidth > 0 && fittedCardHeight > 0
    ? { width: fittedCardWidth, height: fittedCardHeight }
    : inspirationImage && isPortraitImage
      ? { height: '100%', width: 'auto', aspectRatio: '4 / 5', maxWidth: '100%' }
      : { width: '100%', height: 'auto', aspectRatio: '16 / 9', maxHeight: '100%' }

  useEffect(() => {
    if (!isInspiration || loading || unavailableAccount || !inspirationStageRef.current) return
    const stage = inspirationStageRef.current
    const measure = () => {
      const rect = stage.getBoundingClientRect()
      const next = { width: Math.round(rect.width), height: Math.round(rect.height) }
      setInspirationStageSize(current => current.width === next.width && current.height === next.height ? current : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    measure()
    return () => observer.disconnect()
  }, [isInspiration, loading, unavailableAccount, editingInspiration])

  const renderInspirationCard = (editable: boolean) => {
    const currentPhrase = editable ? phraseDraft : phrase
    return (
      <div ref={inspirationStageRef} className={`relative flex w-full ${editable ? 'h-[min(42dvh,320px)] sm:h-[min(50dvh,420px)] lg:h-[min(68dvh,600px)]' : 'h-full'} items-center justify-center overflow-hidden`}>
      <div
        data-pos="cashier-inspiration-card"
        className={`pos-inspiration-card relative isolate mx-auto overflow-hidden rounded-[26px] bg-slate-900 shadow-[0_18px_50px_-22px_rgba(15,23,42,.65)] ${cardMotionClass} ${inspirationImage && isPortraitImage ? '' : 'w-full'}`}
        style={inspirationCardStyle}
      >
        {inspirationImage ? (
          <img
            src={inspirationImage}
            alt="Vista previa de tu foto de inspiración"
            className="absolute inset-0 h-full w-full object-cover"
            onLoad={event => setImageDimensions({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          />
        ) : (
          <div data-pos="cashier-inspiration-backdrop" className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(255,226,138,.24),transparent_34%),linear-gradient(145deg,#122938,#193847_48%,#442b42)]" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/5" />
        <div className="absolute inset-x-0 bottom-0 z-10 p-5 text-left sm:p-7">
          {currentPhrase ? (
            <p
              className={`max-w-[22ch] whitespace-pre-wrap break-words text-[clamp(1.55rem,4vw,2.55rem)] font-black leading-[1.04] tracking-[-.035em] drop-shadow-[0_2px_12px_rgba(0,0,0,.55)] ${inspirationStyle.animation === 'breathe' ? 'pos-inspiration-text-breathe' : ''}`}
              style={{ color: selectedColor.value, fontFamily: selectedFont.family }}
            >
              {currentPhrase}
            </p>
          ) : (
            <p className="text-xl font-bold text-white/75">Tu frase aparecerá aquí</p>
          )}
        </div>
        {editable && inspirationImage && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-black/45 px-3 py-1.5 text-[10px] font-bold text-white backdrop-blur-sm">
            {isPortraitImage ? 'Foto vertical · llena el alto' : 'Foto horizontal · llena el ancho'}
          </span>
        )}
        {!editable && (
          <button
            type="button"
            onClick={() => { setPhraseDraft(phrase); setActionError(''); setEditingInspiration(true) }}
            aria-label="Editar mi espacio"
            title="Editar mi espacio"
            className="absolute right-3 top-3 z-20 grid h-10 w-10 place-items-center rounded-full border border-white/35 bg-slate-950/55 text-white shadow-lg backdrop-blur-md transition hover:scale-105 hover:bg-slate-950/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/50"
          >
            <Edit3 size={18} />
          </button>
        )}
      </div>
      </div>
    )
  }

  return (
    <div className={isInspiration ? 'mx-auto h-full min-h-0 w-full max-w-none' : 'mx-auto w-full max-w-2xl px-2 py-3 sm:px-4 sm:py-5'}>
      <style jsx global>{`
        @keyframes pos-inspiration-breathe {
          0%, 100% { box-shadow: 0 18px 50px -22px rgba(15,23,42,.65); }
          50% { box-shadow: 0 24px 58px -18px rgba(15,23,42,.55); }
        }
        @keyframes pos-inspiration-text-breathe {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes pos-inspiration-shine {
          0% { transform: translateX(-140%) skewX(-18deg); opacity: 0; }
          18% { opacity: .16; }
          52%, 100% { transform: translateX(160%) skewX(-18deg); opacity: 0; }
        }
        .pos-inspiration-motion-breathe { animation: pos-inspiration-breathe 5s ease-in-out infinite; }
        .pos-inspiration-text-breathe { animation: pos-inspiration-text-breathe 4s ease-in-out infinite; }
        .pos-inspiration-motion-shine::after {
          content: ''; position: absolute; z-index: 5; inset: -20% auto -20% -45%; width: 42%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,.22), transparent);
          animation: pos-inspiration-shine 5.5s ease-in-out infinite; pointer-events: none;
        }
        @media (prefers-reduced-motion: reduce) {
          .pos-inspiration-motion-breathe, .pos-inspiration-text-breathe,
          .pos-inspiration-motion-shine::after { animation: none !important; }
        }
      `}</style>
      <section data-pos="cashier-space-panel" className={`overflow-hidden rounded-[26px] border bg-white shadow-sm dark:bg-slate-900 ${isInspiration ? 'flex h-full min-h-0 flex-col border-slate-200 dark:border-slate-700' : 'border-slate-200 dark:border-slate-700'}`}>
        {!isInspiration && (
          <div data-pos="cashier-space-header" className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900 sm:px-5">
            <div className="flex min-w-0 items-center gap-3">
              <div data-pos="cashier-accent-icon" className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-300">
                <NotebookPen size={20} />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-black text-slate-800 dark:text-slate-100 sm:text-base">Mis notas</h2>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">Notas de {cashierName || 'tu cuenta'} · sincronizadas en la nube</p>
              </div>
            </div>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200" title="Volver al POS" aria-label="Cerrar Mis notas">
              <X size={18} />
            </button>
          </div>
        )}

        <div data-pos="cashier-space-body" className={isInspiration ? `flex min-h-0 flex-1 flex-col p-0 ${editingInspiration ? 'overflow-y-auto overscroll-contain pb-6' : ''}` : 'p-4 sm:p-5'}>
          {unavailableAccount ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-5 text-center text-sm font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              Inicia sesión con tu cuenta del POS para guardar tu espacio personal.
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm font-semibold text-slate-500">
              <Loader2 size={18} className="animate-spin" /> Cargando tu espacio…
            </div>
          ) : view === 'notes' ? (
            <div>
              <div className="mb-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">Tareas y apuntes rápidos para tu turno.</p>
                <span data-pos="cashier-note-count" className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-200">{activeNotes} pendiente{activeNotes === 1 ? '' : 's'}</span>
              </div>
              <form onSubmit={addNote} className="flex gap-2">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={newNote}
                    onChange={event => setNewNote(event.target.value)}
                    maxLength={240}
                    placeholder="Escribe una tarea o apunte…"
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 pr-9 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-emerald-500 dark:focus:ring-emerald-950"
                  />
                  {newNote && <button type="button" onClick={() => setNewNote('')} className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg text-slate-400 hover:text-slate-700" aria-label="Borrar texto de la nota" title="Borrar texto"><X size={15} /></button>}
                </div>
                <button data-pos="cashier-primary-action" type="submit" disabled={!newNote.trim() || savingNote} className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50 sm:px-4 sm:text-sm">
                  {savingNote ? <Loader2 size={15} className="animate-spin" /> : <NotebookPen size={15} />}
                  <span className="hidden sm:inline">Agregar</span>
                </button>
              </form>
              {dataError && <p className="mt-3 text-xs font-medium text-rose-600">{dataError}</p>}
              {actionError && <p className="mt-3 text-xs font-medium text-rose-600">{actionError}</p>}
              {notes.length === 0 ? (
                <div className="mt-5 rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-700">
                  <NotebookPen size={24} className="mx-auto mb-2 text-emerald-300" />
                  <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">Todavía no tienes notas</p>
                  <p className="mt-1 text-xs text-slate-400">Agrega una tarea y aparecerá aquí en tus otros equipos.</p>
                </div>
              ) : (
                <ul data-pos="cashier-note-list" className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
                  {notes.map(note => (
                    <li key={note.id} data-pos="cashier-note-card" data-complete={note.done} className={`group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition ${note.done ? 'border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60' : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/30'}`}>
                      <button type="button" onClick={() => void toggleNote(note)} className={`grid h-6 w-6 shrink-0 place-items-center rounded-full transition ${note.done ? 'bg-emerald-500 text-white' : 'text-slate-300 hover:text-emerald-600'}`} aria-label={note.done ? 'Marcar pendiente' : 'Marcar como completada'}>
                        {note.done ? <Check size={15} /> : <Circle size={20} />}
                      </button>
                      <span className={`min-w-0 flex-1 break-words text-sm ${note.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'}`}>{note.text}</span>
                      <button type="button" onClick={() => void removeNote(note.id)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-300 opacity-100 transition hover:bg-rose-50 hover:text-rose-500 sm:opacity-0 sm:group-hover:opacity-100" aria-label="Eliminar nota" title="Eliminar nota">
                        <Trash2 size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : editingInspiration ? (
            <div className="grid min-h-max gap-0 lg:grid-cols-[minmax(0,1.15fr)_minmax(290px,.85fr)] lg:items-start lg:gap-5">
              <div className="min-w-0">
                {renderInspirationCard(true)}
              </div>

              <div data-pos="cashier-inspiration-editor" className="space-y-4 border-t border-slate-200 p-4 dark:border-slate-700 sm:p-5 lg:border-0 lg:pl-0">
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-black text-slate-700 dark:text-slate-200" htmlFor="pos-inspiration-phrase">Tu frase</label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold tabular-nums text-slate-400">{phraseDraft.length}/180</span>
                      {phraseDraft && <button type="button" onClick={() => setPhraseDraft('')} disabled={savingPhrase} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Borrar frase" title="Borrar frase"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                  <textarea
                    id="pos-inspiration-phrase"
                    value={phraseDraft}
                    onChange={event => setPhraseDraft(event.target.value)}
                    maxLength={180}
                    rows={3}
                    placeholder="Escribe algo que te dé fuerza cada día…"
                    className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-4 focus:ring-amber-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:border-amber-500 dark:focus:ring-amber-950"
                  />
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <p className="text-xs font-black text-slate-700 dark:text-slate-200">Foto</p>
                    {inspirationImage ? (
                      <button type="button" onClick={() => { setImageFileDraft(null); setImagePreviewUrl(''); setImageDimensions(null); setRemoveImageDraft(true); setActionError('') }} disabled={savingPhrase} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50" aria-label="Quitar foto de inspiración" title="Quitar foto"><Trash2 size={14} /></button>
                    ) : removeImageDraft && imageUrl ? (
                      <button type="button" onClick={() => setRemoveImageDraft(false)} disabled={savingPhrase} className="grid h-7 w-7 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" aria-label="Restaurar foto de inspiración" title="Restaurar foto"><RotateCcw size={14} /></button>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={savingPhrase}
                    data-pos="cashier-photo-picker"
                    className="flex w-full items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white px-3.5 py-3 text-left transition hover:border-amber-400 hover:bg-amber-50/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:hover:border-amber-500 dark:hover:bg-slate-800"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
                      {imageFileDraft ? <Check size={19} /> : inspirationImage ? <Upload size={19} /> : <ImagePlus size={19} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-black text-slate-800 dark:text-slate-100">
                        {imageFileDraft ? 'Foto lista para guardar' : inspirationImage ? 'Cambiar foto' : 'Elegir una foto'}
                      </span>
                      <span className="mt-0.5 block text-[10px] text-slate-500 dark:text-slate-400">JPG, PNG o similar · máximo 8 MB</span>
                    </span>
                    <ChevronDown size={16} className="-rotate-90 shrink-0 text-slate-400" />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0]
                      event.target.value = ''
                      selectInspirationImage(file)
                    }}
                  />
                </div>

                <fieldset>
                  <legend className="mb-2 text-xs font-black text-slate-700 dark:text-slate-200">Color de la frase</legend>
                  <div className="flex flex-wrap gap-2">
                    {INSPIRATION_COLORS.map(color => (
                      <button
                        key={color.id}
                        type="button"
                        onClick={() => setInspirationStyle(current => ({ ...current, color: color.id }))}
                        aria-label={color.label}
                        aria-pressed={inspirationStyle.color === color.id}
                        title={color.label}
                        className={`grid h-9 w-9 place-items-center rounded-full border-2 transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100 dark:focus-visible:ring-amber-950 ${inspirationStyle.color === color.id ? 'scale-110 border-slate-800 shadow-md dark:border-white' : 'border-white shadow-sm hover:scale-105 dark:border-slate-700'}`}
                        style={{ backgroundColor: color.value }}
                      >
                        {inspirationStyle.color === color.id && <Check size={15} className="text-slate-800 drop-shadow-sm" />}
                      </button>
                    ))}
                    <span className="self-center pl-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{selectedColor.label}</span>
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-xs font-black text-slate-700 dark:text-slate-200">Estilo de letra</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {INSPIRATION_FONTS.map(font => (
                      <button
                        key={font.id}
                        type="button"
                        onClick={() => setInspirationStyle(current => ({ ...current, font: font.id }))}
                        aria-pressed={inspirationStyle.font === font.id}
                        data-pos="cashier-style-option"
                        className={`rounded-xl border px-2 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100 dark:focus-visible:ring-amber-950 ${inspirationStyle.font === font.id ? 'border-slate-800 bg-slate-800 text-white shadow-sm dark:border-amber-300 dark:bg-amber-300 dark:text-slate-950' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
                        style={{ fontFamily: font.family, fontWeight: font.id === 'serif' ? 700 : 900 }}
                      >
                        {font.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <fieldset>
                  <legend className="mb-2 text-xs font-black text-slate-700 dark:text-slate-200">Animación</legend>
                  <div className="grid grid-cols-3 gap-2">
                    {INSPIRATION_ANIMATIONS.map(animation => (
                      <button
                        key={animation.id}
                        type="button"
                        onClick={() => setInspirationStyle(current => ({ ...current, animation: animation.id }))}
                        aria-pressed={inspirationStyle.animation === animation.id}
                        data-pos="cashier-style-option"
                        className={`rounded-xl border px-2 py-2 text-[11px] font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-100 dark:focus-visible:ring-amber-950 ${inspirationStyle.animation === animation.id ? 'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-100' : 'border-slate-200 bg-white text-slate-600 hover:border-amber-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
                      >
                        {animation.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {(dataError || actionError) && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">{actionError || dataError}</p>}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={cancelInspirationEdit}
                    disabled={savingPhrase}
                    className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveInspiration()}
                    disabled={savingPhrase || (!imageUrl && !imageFileDraft && !phraseDraft.trim() && !removeImageDraft && !phrase)}
                    data-pos="cashier-primary-action"
                    className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white shadow-[0_8px_18px_-8px_rgba(15,23,42,.65)] transition hover:-translate-y-0.5 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-amber-200 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0 dark:bg-amber-300 dark:text-slate-950 dark:hover:bg-amber-200"
                  >
                    {savingPhrase ? <Loader2 size={17} className="animate-spin" /> : <Save size={17} />}
                    {savingPhrase ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </div>
            </div>
          ) : imageUrl || phrase ? (
            <div className="h-full min-h-0 w-full">
              {renderInspirationCard(false)}
              {(dataError || actionError) && <p role="alert" className="mt-3 text-xs font-medium text-rose-600">{actionError || dataError}</p>}
            </div>
          ) : (
            <button type="button" data-pos="cashier-inspiration-empty" onClick={() => { setPhraseDraft(phrase); setEditingInspiration(true) }} className="mx-auto flex min-h-56 w-full max-w-xl flex-col items-center justify-center rounded-[22px] border border-dashed border-amber-300 bg-[radial-gradient(circle_at_50%_0%,#fff7dd,transparent_55%),#fafaf8] px-5 py-8 text-center transition hover:border-amber-400 hover:bg-amber-50 dark:border-slate-700 dark:bg-slate-800/60">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"><ImagePlus size={25} /></span>
              <span className="mt-3 text-base font-black text-slate-800 dark:text-slate-100">Crea tu espacio especial</span>
              <span className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">Elige una foto, escribe una frase y personaliza cómo se verá mientras trabajas.</span>
              <span className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-black text-white dark:bg-amber-300 dark:text-slate-950"><Edit3 size={14} /> Personalizar ahora</span>
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
