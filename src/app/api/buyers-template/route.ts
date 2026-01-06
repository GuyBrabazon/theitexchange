import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

export async function GET() {
  const headers = [
    'Name',
    'Email',
    'Company',
    'Phone',
    'Tags',
    'Credit OK',
    'Payment terms',
    'Reliability score',
    'Active',
    'Do not invite',
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Buyers')
  const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' })

  return new NextResponse(buf, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="buyer_import_template.xlsx"',
    },
  })
}
