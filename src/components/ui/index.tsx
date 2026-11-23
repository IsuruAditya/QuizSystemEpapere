/**
 * Small in-repo design system (ADR-008): native accessible elements styled with Tailwind tokens
 * (teal theme, globals.css). Touch targets are >= 44 px for md/lg controls.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger" | "soft";
const btn: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg border border-brand hover:bg-brand-strong hover:border-brand-strong shadow-sm",
  secondary: "bg-bg text-fg border border-border-strong hover:bg-surface",
  soft: "bg-brand-soft text-brand border border-transparent hover:bg-brand-tint",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-surface-2",
  danger: "bg-danger text-white border border-danger hover:opacity-90 dark:text-bg",
};
type Size = "sm" | "md" | "lg";
export const buttonClass = (v: Variant = "primary", size: Size = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-50 select-none",
    size === "lg" ? "min-h-12 px-5 text-base" : size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-sm",
    btn[v],
  );

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button type="button" {...p} className={cx(buttonClass(variant, size), className)} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link {...p} className={cx(buttonClass(variant, size), className)} />;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("rounded-2xl border border-border bg-bg p-4 shadow-card sm:p-5", className)} />;
}

const tone = {
  info: "border-brand bg-brand-soft text-fg",
  ok: "border-ok bg-ok-soft text-fg",
  warn: "border-warn bg-warn-soft text-fg",
  danger: "border-danger bg-danger-soft text-fg",
};
export function Alert({ kind = "info", title, children, live, className }: { kind?: keyof typeof tone; title?: ReactNode; children?: ReactNode; live?: boolean; className?: string }) {
  return (
    <div role={kind === "danger" ? "alert" : live ? "status" : undefined} className={cx("rounded-xl border-l-4 p-3 text-sm", tone[kind], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

const badgeTone = {
  info: "bg-brand-soft text-brand",
  ok: "bg-ok-soft text-ok",
  warn: "bg-warn-soft text-warn",
  danger: "bg-danger-soft text-danger",
  muted: "bg-surface text-muted",
};
export function Badge({ kind = "info", children, dot }: { kind?: keyof typeof badgeTone; children: ReactNode; dot?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", badgeTone[kind])}>
      {dot && <span aria-hidden className="size-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

export function Field({ label, error, hint, id, children }: { label: ReactNode; error?: string; hint?: ReactNode; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "block w-full min-h-11 rounded-xl border border-border-strong bg-bg px-3 py-2 text-base text-fg placeholder:text-muted transition-colors hover:border-brand focus-visible:border-brand aria-[invalid=true]:border-danger disabled:opacity-60";

export function Input({ id, error, hint, className, ...p }: ComponentProps<"input"> & { id: string; error?: string; hint?: boolean }) {
  return (
    <input
      id={id}
      name={p.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined}
      {...p}
      className={cx(inputClass, className)}
    />
  );
}

export function Textarea({ id, error, className, ...p }: ComponentProps<"textarea"> & { id: string; error?: string }) {
  return (
    <textarea
      id={id}
      name={p.name ?? id}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : undefined}
      {...p}
      className={cx(inputClass, "min-h-24", className)}
    />
  );
}

export function Select({ id, error, className, ...p }: ComponentProps<"select"> & { id: string; error?: string }) {
  return <select id={id} name={p.name ?? id} aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} {...p} className={cx(inputClass, className)} />;
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl border border-dashed border-border-strong bg-bg p-8 text-center text-muted">{children}</p>;
}

/** Stat tile for dashboards (label, value, optional hint). */
export function Stat({ label, value, hint }: { label: ReactNode; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-bg p-4 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const cssString = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/[\r\n]+/g, " ")}"`;
/** Deterministic class from the labels (same on server and client; equal tables share equal rules). */
function labelsHash(cols: string[]): string {
  let h = 5381;
  for (const ch of cols.join("\u0000")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/**
 * Data table. With `columns`, it renders the header and, below 640 px, stacks each row as a card
 * that labels every cell with its column name (static admin labels only, never user content).
 */
export function Table({ children, caption, columns, stack = true }: { children: ReactNode; caption?: string; columns?: string[]; stack?: boolean }) {
  const stacked = Boolean(columns && stack);
  const cls = stacked ? `tbl-${labelsHash(columns!)}` : "";
  const labels = !stacked ? "" : columns!.map((c, i) => `.${cls} td:nth-child(${i + 1})::before{content:${cssString(c)}}`).join("");
  return (
    <div className={cx("overflow-x-auto rounded-2xl border border-border bg-bg shadow-card", stacked && "table-stack", cls)}>
      {labels && <style>{`@media (max-width:639.98px){${labels}}`}</style>}
      <table
        className={cx(
          "w-full border-collapse text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-4 [&_td]:py-3 [&_th]:bg-surface [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted [&_tbody_tr:hover]:bg-surface/60",
          stack && "min-w-[36rem]",
        )}
      >
        {caption && <caption className="sr-only">{caption}</caption>}
        {columns && (
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        {children}
      </table>
    </div>
  );
}

export function Pager({ page, pages, hrefFor, label }: { page: number; pages: number; hrefFor: (p: number) => string; label: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? (
        <ButtonLink variant="secondary" size="sm" href={hrefFor(page - 1)} aria-label="Previous page">
          ←
        </ButtonLink>
      ) : (
        <span />
      )}
      <span className="text-sm text-muted">{label}</span>
      {page < pages ? (
        <ButtonLink variant="secondary" size="sm" href={hrefFor(page + 1)} aria-label="Next page">
          →
        </ButtonLink>
      ) : (
        <span />
      )}
    </nav>
  );
}

/** Text link styled for content (no heavy underline until hover; visible focus from globals). */
export const linkClass = "font-semibold text-brand underline-offset-4 hover:underline";

export { cx };
