import * as XLSX from 'xlsx'

export type ParsedSheet = {
  headers: string[]
  rows: Record<string, unknown>[]
}

/**
 * Returns a 2D matrix of cell values from the first worksheet.
 * Row 0 is the first row in the sheet.
 */
export async function parseSpreadsheetMatrix(
  file: File,
  maxRows?: number
): Promise<unknown[][]> {
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(buf, { type: 'array' })

  const sheetName = wb.SheetNames[0]
  if (!sheetName) throw new Error('No sheets found in file')

  const ws = wb.Sheets[sheetName]
  if (!ws) throw new Error('Unable to read first sheet')

  // header: 1 => array of arrays; defval keeps empty cells; blankrows false reduces noise
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: '',
    blankrows: false,
  }) as unknown[][]

  const trimmed = typeof maxRows === 'number' ? matrix.slice(0, maxRows) : matrix
  return trimmed
}

/**
 * Builds headers + object rows from a matrix using the chosen header row index (0-based).
 * - headers are normalized to strings, blanks are filled as "Column N"
 * - data rows start AFTER the header row
 */
export function buildSheetFromMatrix(matrix: unknown[][], headerRowIndex: number): ParsedSheet {
  if (!matrix || matrix.length === 0) return { headers: [], rows: [] }

  const safeHeaderRowIndex = Math.min(Math.max(headerRowIndex, 0), matrix.length - 1)
  const headerRow = matrix[safeHeaderRowIndex] ?? []

  // Determine max columns based on the widest row in the matrix (within preview/import scope)
  const maxCols = matrix.reduce((m, r) => Math.max(m, (r ?? []).length), 0)

  const headers: string[] = []
  for (let c = 0; c < maxCols; c++) {
    const raw = headerRow[c]
    const name = String(raw ?? '').trim()
    headers.push(name !== '' ? name : `Column ${c + 1}`)
  }

  const rows: Record<string, unknown>[] = []
  for (let r = safeHeaderRowIndex + 1; r < matrix.length; r++) {
    const rowArr = matrix[r] ?? []
    const obj: Record<string, unknown> = {}

    let hasAnyValue = false
    for (let c = 0; c < headers.length; c++) {
      const v = rowArr[c]
      const value = v === undefined || v === null ? '' : v
      obj[headers[c]] = value
      if (String(value).trim() !== '') hasAnyValue = true
    }

    // Skip completely empty rows
    if (hasAnyValue) rows.push(obj)
  }

  return { headers, rows }
}
