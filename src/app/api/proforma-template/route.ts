import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

export async function GET() {
  const headers = [
    'OEM',
    'Model',
    'CPU',
    'CPU qty',
    'Memory',
    'Memory qty',
    'GPU',
    'Drives',
    'Drives qty',
    'Machine qty',
    'Asking Price',
  ]

  const sample = [
    {
      OEM: 'Dell',
      Model: 'R740',
      CPU: 'Gold 6144',
      'CPU qty': 2,
      Memory: '16GB PC4',
      'Memory qty': 16,
      GPU: 'Nvidia T4',
      Drives: '3.84TB SSD',
      'Drives qty': 10,
      'Machine qty': 1,
      'Asking Price': 1200,
    },
  ]

  const ws = XLSX.utils.json_to_sheet(sample, { header: headers })
  // Ensure header order even if sample is removed
  XLSX.utils.sheet_add_aoa(ws, [headers], { origin: 'A1' })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Proforma')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="proforma_stock_template.xlsx"',
    },
  })
}
