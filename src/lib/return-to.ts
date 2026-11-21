/** Only same-origin relative paths are allowed as return targets (prevents open redirects). */
export function safeReturnTo(v: string | null | undefined): string {
  if (!v || !v.startsWith("/") || v.startsWith("//") || v.startsWith("/\\") || /[\r\n\t]/.test(v)) return "/";
  return v.slice(0, 300);
}
