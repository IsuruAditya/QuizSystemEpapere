/**
 * Spreadsheet formula-injection neutralisation for CSV exports (OWASP CSV injection guidance):
 * cells beginning with = + - @ TAB or CR are prefixed with a single quote. Numbers we generate
 * are passed as numbers and are not altered.
 */
export function csvSafeCell(v: unknown): string | number {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? v : "";
  const s = v instanceof Date ? v.toISOString() : String(v);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}
