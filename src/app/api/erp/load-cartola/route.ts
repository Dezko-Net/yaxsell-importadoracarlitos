import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const downloadsDir = path.join(os.homedir(), 'Downloads')
    let foundPath = ''
    let wasFromDownloads = false

    // 1. Buscar prioritariamente en Descargas (Downloads)
    if (fs.existsSync(downloadsDir)) {
      try {
        const files = fs.readdirSync(downloadsDir)
        // Buscar cualquier cartola*.xls o cartola*.xlsx
        const cartolaFiles = files
          .filter(f => /^cartola.*\.xlsx?$/i.test(f))
          .map(f => {
            const fullPath = path.join(downloadsDir, f)
            try {
              const stat = fs.statSync(fullPath)
              return { name: f, fullPath, mtime: stat.mtimeMs }
            } catch {
              return { name: f, fullPath, mtime: 0 }
            }
          })
          .sort((a, b) => b.mtime - a.mtime) // El más reciente primero

        if (cartolaFiles.length > 0) {
          foundPath = cartolaFiles[0].fullPath
          wasFromDownloads = true
        }
      } catch (err) {
        console.warn('[load-cartola] Error explorando Downloads:', err)
      }
    }

    // 2. Si no está en Downloads, buscar en AUTOMATIZACIONES
    if (!foundPath) {
      const fallbackPaths = [
        'C:\\Proyectos\\AUTOMATIZACIONES\\cartola.xls',
        'C:\\Proyectos\\AUTOMATIZACIONES\\cartola.xlsx',
        path.join(process.cwd(), '..', 'AUTOMATIZACIONES', 'cartola.xls'),
        path.join(process.cwd(), '..', 'AUTOMATIZACIONES', 'cartola.xlsx'),
      ]
      for (const p of fallbackPaths) {
        if (fs.existsSync(p)) {
          foundPath = p
          break
        }
      }
    }

    if (!foundPath) {
      return NextResponse.json(
        {
          ok: false,
          error:
            'No se encontró ningún archivo de cartola en la carpeta Descargas (C:\\Users\\Yanpo\\Downloads) ni en AUTOMATIZACIONES.',
        },
        { status: 404 }
      )
    }

    // 3. Leer a memoria
    const fileBuffer = fs.readFileSync(foundPath)
    const wb = XLSX.read(fileBuffer, { type: 'buffer' })
    const sheetName = wb.SheetNames[0]
    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

    const header: any = {}
    let headerRowIdx = -1

    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const row = rows[i]
      if (!Array.isArray(row)) continue
      const rowStr = row.map(c => String(c || '').trim()).join(' ')
      if (rowStr.includes('Nombre Empresa:')) {
        const idx = row.findIndex(c => String(c).includes('Nombre Empresa:'))
        if (idx !== -1 && row[idx + 1] !== undefined) header.empresa = String(row[idx + 1] || row[idx + 2] || '').trim()
      }
      if (rowStr.includes('Sr(a).:')) {
        const idx = row.findIndex(c => String(c).includes('Sr(a).:'))
        if (idx !== -1) header.titular = String(row[idx + 1] || row[idx + 2] || '').trim()
      }
      if (rowStr.includes('Rut:')) {
        const idx = row.findIndex(c => String(c).includes('Rut:'))
        if (idx !== -1) header.rut = String(row[idx + 1] || row[idx + 2] || '').trim()
      }
      if (rowStr.includes('Cuenta N°:') || rowStr.includes('Cuenta:')) {
        const idx = row.findIndex(c => String(c).includes('Cuenta'))
        if (idx !== -1) header.cuenta = String(row[idx + 1] || row[idx + 2] || '').trim()
      }
      if (row.some(c => /Descripci[oó]n/i.test(String(c))) && row.some(c => /Abonos|Cargos|Fecha/i.test(String(c)))) {
        headerRowIdx = i
      }
    }

    if (headerRowIdx === -1) {
      headerRowIdx = rows.findIndex(r => Array.isArray(r) && r.some(c => /Abonos/i.test(String(c))))
    }

    const movements: any[] = []
    const datesSet = new Set<string>()

    if (headerRowIdx !== -1) {
      const headerCols = rows[headerRowIdx].map(c => String(c || '').toLowerCase())
      const fechaCol = headerCols.findIndex(c => c.includes('fecha'))
      const descCol = headerCols.findIndex(c => c.includes('descripci'))
      const canalCol = headerCols.findIndex(c => c.includes('canal') || c.includes('sucursal'))
      const docCol = headerCols.findIndex(c => c.includes('docto') || c.includes('doc'))
      const abonoCol = headerCols.findIndex(c => c.includes('abono'))
      const saldoCol = headerCols.findIndex(c => c.includes('saldo'))

      for (let i = headerRowIdx + 1; i < rows.length; i++) {
        const row = rows[i]
        if (!row || row.length === 0) continue

        const rawFecha = String(row[fechaCol !== -1 ? fechaCol : 1] || '').trim()
        const rawDesc = String(row[descCol !== -1 ? descCol : 3] || '').trim()
        const rawCanal = String(row[canalCol !== -1 ? canalCol : 5] || '').trim()
        const rawDoc = String(row[docCol !== -1 ? docCol : 6] || '').trim()
        const rawAbono = Number(row[abonoCol !== -1 ? abonoCol : 8] || 0)
        const rawSaldo = Number(row[saldoCol !== -1 ? saldoCol : 9] || 0)

        if (rawAbono > 0 && rawFecha) {
          let fechaYMD = rawFecha
          const m = rawFecha.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/)
          if (m) {
            const dd = m[1].padStart(2, '0')
            const mm = m[2].padStart(2, '0')
            const yyyy = m[3]
            fechaYMD = `${yyyy}-${mm}-${dd}`
          }

          let emisor = rawDesc
            .replace(/^Traspaso De:\s*/i, '')
            .replace(/^Transferencia De:\s*/i, '')
            .replace(/^Abono De:\s*/i, '')
            .replace(/^TEF De:\s*/i, '')
            .trim()

          movements.push({
            id: `bank_${fechaYMD}_${i}_${rawAbono}`,
            fecha: rawFecha,
            fechaYMD,
            descripcion: rawDesc,
            emisor,
            canal: rawCanal,
            nroDoc: rawDoc,
            monto: rawAbono,
            saldo: rawSaldo,
          })
          datesSet.add(fechaYMD)
        }
      }
    }

    const availableDates = Array.from(datesSet).sort((a, b) => b.localeCompare(a))

    // 4. Si fue leído de Descargas (Downloads), eliminarlo y limpiar cualquier cartola*.xls residual
    // para que la próxima descarga del banco vuelva a llamarse limpiamente cartola.xls y nunca cartola(1).xls
    let deletedCount = 0
    if (wasFromDownloads) {
      try {
        if (fs.existsSync(foundPath)) {
          fs.unlinkSync(foundPath)
          deletedCount++
        }
        // Limpiar también cualquier otro archivo residual cartola*.xls o cartola*.xlsx en Downloads
        if (fs.existsSync(downloadsDir)) {
          const remaining = fs.readdirSync(downloadsDir).filter(f => /^cartola.*\.xlsx?$/i.test(f))
          for (const rem of remaining) {
            try {
              fs.unlinkSync(path.join(downloadsDir, rem))
              deletedCount++
            } catch {}
          }
        }
      } catch (delErr) {
        console.warn('[load-cartola] Error al eliminar cartola de Descargas:', delErr)
      }
    }

    return NextResponse.json({
      ok: true,
      foundPath,
      fileName: path.basename(foundPath),
      wasFromDownloads,
      deletedFromDownloads: wasFromDownloads,
      deletedFilesCount: deletedCount,
      header,
      movements,
      availableDates,
      totalCount: movements.length,
    })
  } catch (error: any) {
    console.error('[API /api/erp/load-cartola GET] Error:', error)
    return NextResponse.json(
      { ok: false, error: error?.message || 'Error procesando la cartola' },
      { status: 500 }
    )
  }
}
