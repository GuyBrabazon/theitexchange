import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

// Legacy endpoint stubbed: PDF generation moved to /api/po/render
export async function GET() {
  return NextResponse.json({ ok: false, message: 'Use /api/po/render for PO PDFs' }, { status: 410 })
}

export async function POST() {
  return NextResponse.json({ ok: false, message: 'Use /api/po/render for PO PDFs' }, { status: 410 })
}
