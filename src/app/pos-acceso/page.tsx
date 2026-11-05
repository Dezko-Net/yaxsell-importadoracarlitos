'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { isAdminEmail } from '@/lib/admin-access'
import { getErpUserByEmail } from '@/lib/erpUserService'
import { normalizePosAccessLevel } from '@/lib/posAccessLevels'
import { isSellerCargo } from '@/lib/posSellerRoles'
import type { TrabajadorERP } from '@/lib/trabajadoresErpService'
import { workerBranchSlugs } from '@/lib/posBranchAccess'
import { DEFAULT_SEDE } from '@/types'
import { ShieldCheck } from 'lucide-react'

export default function PosAccessRedirectPage() {
  const router = useRouter()
  const { user, isLoading, isLoggedIn } = useAuth()
  const [accessError, setAccessError] = useState('')

  useEffect(() => {
    if (isLoading) return

    if (!isLoggedIn || !user?.email) {
      router.replace('/admin/login?next=%2Fpos-acceso')
      return
    }
    const email = user.email
    if (isAdminEmail(email)) {
      router.replace(`/pos-admin/${DEFAULT_SEDE}`)
      return
    }

    let active = true
    void (async () => {
      try {
        // Refresca permisos al entrar para no reutilizar una ficha antigua del navegador.
        const account = await getErpUserByEmail(email, true)
        if (!active) return

        if (account?.modules.includes('admin_supreme')) {
          router.replace(`/pos-admin/${DEFAULT_SEDE}`)
          return
        }

        let worker: TrabajadorERP | undefined
        if (account?.trabajadorId || account?.displayName || email) {
          try {
            const { fetchTrabajadorERP } = await import('@/lib/trabajadoresErpService')
            worker = await fetchTrabajadorERP(account?.trabajadorId, account?.displayName) || undefined
          } catch (error) {
            console.warn('[pos-acceso] No se pudo resolver trabajador vinculado:', error)
          }
        }
        if (!active) return

        const cargo = worker?.cargo || account?.role || ''
        const level = normalizePosAccessLevel(
          worker?.nivelAccesoPos || account?.nivelAccesoPos,
          worker?.puedeGestionarCaja || account?.modules.includes('pos_admin'),
        )
        const canOpenPosAdmin = !isSellerCargo(cargo) && level !== 'bajo'

        // Si la cuenta tiene sucursal asignada en planilla, abrir su panel en esa sucursal.
        const branch = workerBranchSlugs(worker)[0] || (account?.trabajadorId ? '' : account?.branchSlugs[0])
        if (!branch) {
          setAccessError('Tu cuenta no tiene una sucursal asignada. Pide que la configuren en Planilla unificada.')
          return
        }
        router.replace(canOpenPosAdmin ? `/pos-admin/${branch}` : `/pos/${branch}`)
      } catch (error) {
        console.error('[pos-acceso] No se pudo resolver el destino POS:', error)
        if (active) setAccessError('No pudimos verificar tu sucursal. Vuelve a intentarlo en un momento.')
      }
    })()

    return () => { active = false }
  }, [isLoading, isLoggedIn, user?.email, router])

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-sky-700 shadow-sm ring-1 ring-slate-200">
        <ShieldCheck size={26} />
      </div>
      <div>
        <h1 className="text-base font-bold text-slate-800">{accessError ? 'Acceso pendiente' : 'Abriendo tu caja'}</h1>
        <p className="mt-1 text-sm text-slate-500">{accessError || 'Revisando el acceso de esta cuenta…'}</p>
      </div>
      {!accessError && <div className="h-1.5 w-28 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full w-1/2 animate-pulse rounded-full bg-sky-600" />
      </div>}
    </main>
  )
}
