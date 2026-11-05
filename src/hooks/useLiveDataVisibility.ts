'use client'

import { useEffect, useState } from 'react'

/** Mantiene el listener durante cambios breves de pestaña y lo pausa en segundo plano. */
export function useLiveDataVisibility(graceMs = 5 * 60 * 1000): boolean {
  const [active, setActive] = useState(true)

  useEffect(() => {
    let hiddenTimer: ReturnType<typeof setTimeout> | null = null
    const onVisibilityChange = () => {
      if (hiddenTimer) clearTimeout(hiddenTimer)
      hiddenTimer = null
      if (document.visibilityState === 'visible') {
        setActive(true)
      } else {
        hiddenTimer = setTimeout(() => setActive(false), graceMs)
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    onVisibilityChange()
    return () => {
      if (hiddenTimer) clearTimeout(hiddenTimer)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [graceMs])

  return active
}
