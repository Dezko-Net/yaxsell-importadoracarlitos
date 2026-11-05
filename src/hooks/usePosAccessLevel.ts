'use client'

import { useEffect, useState } from 'react'
import { authReady } from '@/lib/firebase'
import { useAuth } from '@/hooks/useAuth'
import { isAdminEmail } from '@/lib/admin-access'
import { getErpUserByEmail } from '@/lib/erpUserService'
import { normalizePosAccessLevel, type PosAccessLevel } from '@/lib/posAccessLevels'
import { isSellerCargo, normalizePosSellerRole, type PosSellerRole } from '@/lib/posSellerRoles'

export function usePosAccessLevel() {
  const { user, isLoading } = useAuth()
  const [level, setLevel] = useState<PosAccessLevel>('bajo')
  const [isSupreme, setIsSupreme] = useState(false)
  const [ready, setReady] = useState(false)
  const [workerId, setWorkerId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [sellerRole, setSellerRole] = useState<PosSellerRole | null>(null)

  useEffect(() => {
    let active = true
    setReady(false)
    ;(async () => {
      if (isLoading) return
      if (isAdminEmail(user?.email)) {
        if (active) { setLevel('alto'); setIsSupreme(true); setWorkerId(''); setDisplayName(user?.name || user?.email || ''); setSellerRole(null); setReady(true) }
        return
      }
      if (!user?.email) {
        if (active) { setLevel('bajo'); setIsSupreme(false); setWorkerId(''); setDisplayName(''); setSellerRole(null); setReady(true) }
        return
      }
      try {
        await authReady
        const account = await getErpUserByEmail(user.email)
        let next = normalizePosAccessLevel(account?.nivelAccesoPos, account?.modules?.includes('pos_admin'))
        let nextName = account?.displayName || user.name || user.email.split('@')[0]
        let nextWorkerId = account?.trabajadorId || ''
        let nextSellerRole = account?.rolOperativoPos || null
        let sellerCargo = isSellerCargo(account?.role)
        if (account?.trabajadorId || account?.displayName) {
          const { fetchTrabajadoresERP } = await import('@/lib/trabajadoresErpService')
          const workers = await fetchTrabajadoresERP()
          const normalizedName = (value: string) => value.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
          const worker = workers.find(item => item.$id === account?.trabajadorId)
            || workers.find(item => normalizedName(item.nombre) === normalizedName(account?.displayName || ''))
          if (worker) {
            nextWorkerId = worker.$id
            nextName = worker.nombre || nextName
            sellerCargo = isSellerCargo(worker.cargo)
            nextSellerRole = sellerCargo ? (worker.rolOperativoPos || nextSellerRole) : null
          }
        }
        if (sellerCargo) next = 'bajo'
        if (active) { setLevel(next); setIsSupreme(false); setWorkerId(nextWorkerId); setDisplayName(nextName); setSellerRole(sellerCargo ? normalizePosSellerRole(nextSellerRole) : null); setReady(true) }
      } catch {
        if (active) { setLevel('bajo'); setIsSupreme(false); setWorkerId(''); setDisplayName(''); setSellerRole(null); setReady(true) }
      }
    })()
    return () => { active = false }
  }, [isLoading, user?.email, user?.name])

  return { level, isSupreme, ready, workerId, displayName, sellerRole }
}
