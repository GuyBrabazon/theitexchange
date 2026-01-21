import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const auth = await requireAuth(request)
  if (auth instanceof NextResponse) {
    return auth
  }
  try {
    const { data, error } = await auth.supa
      .from('buyers')
      .select('id,name,company,email,oem_tags,model_tags,tags')
      .eq('tenant_id', auth.tenantId)
      .eq('is_active', true)
      .order('name', { ascending: true })
    if (error) throw error
    return NextResponse.json({ ok: true, buyers: data ?? [] })
  } catch (error) {
    return NextResponse.json({ ok: false, message: (error as Error).message }, { status: 500 })
  }
}
