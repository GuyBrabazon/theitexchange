export type EmailLine = {
  partNumber: string
  description: string | null
  qty: number | null
  askingPrice: number | null
}

type BatchBodyOptions = {
  lines: EmailLine[]
  currencySymbol: string
  buyerName?: string | null
}

