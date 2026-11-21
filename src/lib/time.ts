/** Asia/Colombo display helpers. Storage is always UTC; Sri Lanka is UTC+05:30 with no DST. */
export const TZ = "Asia/Colombo";
const OFFSET_MIN = 330;

export function formatColombo(d: Date | string | null | undefined, lang: "si" | "en" = "si"): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat(lang === "si" ? "si-LK" : "en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** Value for <input type="datetime-local"> showing Colombo wall time. */
export function toColomboInput(d: Date | string | null | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const local = new Date(date.getTime() + OFFSET_MIN * 60_000);
  return local.toISOString().slice(0, 16);
}

/** Parse "YYYY-MM-DDTHH:mm" entered as Colombo wall time → UTC Date. */
export function colomboInputToUtc(v: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number) as [number, number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi) - OFFSET_MIN * 60_000;
  const out = new Date(utc);
  return Number.isNaN(out.getTime()) ? null : out;
}

export function formatDuration(seconds: number | null, lang: "si" | "en" = "si"): string {
  if (seconds === null) return lang === "si" ? "කාල සීමාවක් නැත" : "Untimed";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (lang === "si") return h ? `පැය ${h} මිනිත්තු ${m}` : `මිනිත්තු ${m}`;
  return h ? `${h} h ${m} min` : `${m} min`;
}
