import { NextResponse } from 'next/server'
import { getAdminDb } from '@/lib/db-server'

export const dynamic = 'force-dynamic'

const ERP_CONFIG_CACHE_TTL = 30 * 60 * 1000 // 30 minutos en RAM del servidor
const gErpCfg = globalThis as unknown as {
  __yaxsellErpConfigCache?: { data: string; time: number } | null
}

export async function GET() {
  try {
    const cached = gErpCfg.__yaxsellErpConfigCache
    if (cached && Date.now() - cached.time < ERP_CONFIG_CACHE_TTL) {
      return NextResponse.json({ ok: true, data: cached.data }, {
        headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
      })
    }

    const adminDb = getAdminDb()
    const doc = await adminDb.collection('erp_config').doc('config').get()
    if (doc.exists) {
      const data = doc.data()
      if (data?.data && typeof data.data === 'string' && data.data.trim().length > 2) {
        gErpCfg.__yaxsellErpConfigCache = { data: data.data, time: Date.now() }
        return NextResponse.json({ ok: true, data: data.data }, {
          headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
        })
      }
    }

    console.log('[admin-supreme/load-config] doc does not exist or is empty, creating Importadora Carlitos fallback config')
    // Fallback: construir configuración oficial de Importadora Carlitos
    let empresaData: any = null
    let storeData: any = null
    try {
      const [empDoc, storeDoc] = await Promise.all([
        adminDb.collection('config_pos').doc('empresa').get(),
        adminDb.collection('store_settings').doc('main').get(),
      ])
      if (empDoc.exists) empresaData = empDoc.data()
      if (storeDoc.exists) storeData = storeDoc.data()
    } catch (err) {
      console.warn('[admin-supreme/load-config] error fetching fallback sources:', err)
    }

    const companyName = empresaData?.nombreEmpresa || storeData?.STORENAME || 'Importadora Carlitos'
    const companyEmail = empresaData?.email || ''
    const logoUrl = storeData?.logoUrl || storeData?.LOGOURL || '/images/optimized/logo-carlitos.svg'
    const avatarUrl = '/avatar.png'

    const fallbackConfig = {
      companyName,
      legalName: empresaData?.nombreEmpresa || companyName,
      companyDescription: storeData?.DESCRIPTION || 'Importadora Carlitos - Tienda Oficial y Mayorista',
      supremeAdminEmail: 'dezkonet@gmail.com',
      sparkMode: true,
      branding: {
        companyLogoUrl: logoUrl,
        defaultUserAvatarUrl: avatarUrl,
        titleColor: '#3b82f6',
      },
      ownerProfile: {
        displayName: 'Administrador',
        email: 'dezkonet@gmail.com',
        photoURL: avatarUrl,
      },
      firebase: {
        projectId: 'importadora-carlitos',
        apiKey: 'AIzaSyClqpsQ5eHECOQAXz3ls6-RUgoH8nthdkE',
        authDomain: 'importadora-carlitos.firebaseapp.com',
        appId: '1:289604179340:web:9d3f876c8aafeceedef2a9',
        storageBucket: 'importadora-carlitos.firebasestorage.app',
        messagingSenderId: '289604179340',
        recaptchaV3SiteKey: '',
      },
      branches: [
        { slug: 'donbalato-central', name: 'Importadora Carlitos Central', region: 'Santiago', icon: '🏪', color: 'blue', imageUrl: '', managerEmail: '', active: true },
      ],
      empresa: empresaData || {
        nombreEmpresa: 'Importadora Carlitos',
        rut: '77.890.123-4',
        giro: 'Comercializadora y Retail',
        direccion: 'Santiago, Chile',
        telefono: '+56 9 6729 4975',
        email: '',
        modoVentaPOS: 'cajera_cobra',
      },
    }

    const serialized = JSON.stringify(fallbackConfig)

    // Guardar para que las siguientes peticiones lo tengan persistente
    try {
      await adminDb.collection('erp_config').doc('config').set({
        docId: 'config',
        data: serialized,
        updatedAt: Date.now(),
      }, { merge: true })
    } catch (saveErr) {
      console.error('[admin-supreme/load-config] error persisting fallback config:', saveErr)
    }

    gErpCfg.__yaxsellErpConfigCache = { data: serialized, time: Date.now() }
    return NextResponse.json({ ok: true, data: serialized }, {
      headers: { 'Cache-Control': 'private, max-age=60, stale-while-revalidate=300' },
    })
  } catch (e: any) {
    console.error('[admin-supreme/load-config] error:', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 500 })
  }
}
