/** Number formatting — money and ounces, everywhere. */

export function fmtMoney(v: number): string {
  const sign = v < 0 ? '−' : '';
  const a = Math.abs(v);
  if (a >= 1e9) return `${sign}$${(a / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${sign}$${(a / 1e3).toFixed(0)}k`;
  return `${sign}$${a.toFixed(0)}`;
}

export function fmtOz(v: number): string {
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)}Moz`;
  return `${Math.round(v / 1000)}koz`;
}
