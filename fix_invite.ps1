$p = 'src/app/invite/[token]/page.tsx'
$text = Get-Content $p -Raw
$old = "          const { data: liData, error: liErr } = await supabase`n            .from('line_items')`n            .select(``n              `n              id,lot_id,description,model,qty,serial_tag,cpu,cpu_qty,memory_part_numbers,memory_qty,network_card,expansion_card,gpu,asking_price,specs`n            ``n            )`n            .eq('lot_id', data.lot_id)`n            .order('id', { ascending: true })`n            .limit(500)`n"
$new = "          const { data: liData, error: liErr } = await supabase`n            .from('line_items')`n            .select(``n              `n              id,lot_id,description,model,qty,serial_tag,cpu,cpu_qty,memory_part_numbers,memory_qty,network_card,expansion_card,gpu,asking_price,specs`n            ``n            )`n            .eq('lot_id', normalizedInvite.lot_id)`n            .order('id', { ascending: true })`n            .limit(500)`n"
$text = $text -replace [regex]::Escape($old), [System.Text.RegularExpressions.RegexEscape]($new)
Set-Content $p -Value $text -Encoding utf8
