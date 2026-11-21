/**
 * Small in-repo design system (ADR-008): native accessible elements styled with Tailwind tokens.
 */
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

type Variant = "primary" | "secondary" | "ghost" | "danger";
const btn: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:opacity-90 border border-brand",
  secondary: "bg-surface text-fg border border-border hover:bg-surface-2",
  ghost: "bg-transparent text-fg border border-transparent hover:bg-surface-2",
  danger: "bg-danger text-white border border-danger hover:opacity-90 dark:text-bg",
};
export const buttonClass = (v: Variant = "primary", size: "md" | "lg" | "sm" = "md") =>
  cx(
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-55",
    size === "lg" ? "min-h-12 px-5 text-base" : size === "sm" ? "min-h-9 px-3 text-sm" : "min-h-11 px-4 text-sm",
    btn[v],
  );

export function Button({ variant = "primary", size = "md", className, ...p }: ComponentProps<"button"> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <button type="button" {...p} className={cx(buttonClass(variant, size), className)} />;
}

export function ButtonLink({ variant = "primary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: Variant; size?: "md" | "lg" | "sm" }) {
  return <Link {...p} className={cx(buttonClass(variant, size), className)} />;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section {...p} className={cx("rounded-xl border border-border bg-bg p-4 shadow-sm sm:p-5", className)} />;
}

const tone = {
  info: "border-brand bg-brand-soft text-fg",
  ok: "border-ok bg-ok-soft text-fg",
  warn: "border-warn bg-warn-soft text-fg",
  danger: "border-danger bg-danger-soft text-fg",
};
export function Alert({ kind = "info", title, children, live, className }: { kind?: keyof typeof tone; title?: ReactNode; children?: ReactNode; live?: boolean; className?: string }) {
  return (
    <div role={kind === "danger" ? "alert" : live ? "status" : undefined} className={cx("rounded-lg border-l-4 p-3 text-sm", tone[kind], className)}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1" : ""}>{children}</div>}
    </div>
  );
}

export function Badge({ kind = "info", children }: { kind?: keyof typeof tone | "muted"; children: ReactNode }) {
  const c = kind === "muted" ? "border-border bg-surface text-muted" : tone[kind];
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold", c)}>{children}</span>;
}

export function Field({ label, error, hint, id, children }: { label: ReactNode; error?: string; hint?: ReactNode; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
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
  "block w-full min-h-11 rounded-lg border border-border bg-bg px-3 py-2 text-base text-fg placeholder:text-muted aria-[invalid=true]:border-danger";

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
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold leading-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-border p-6 text-center text-muted">{children}</p>;
}

export function Table({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[36rem] border-collapse text-sm [&_td]:border-t [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_th]:bg-surface [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold">
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function Pager({ page, pages, hrefFor, label }: { page: number; pages: number; hrefFor: (p: number) => string; label: string }) {
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center justify-between gap-2">
      {page > 1 ? <ButtonLink variant="secondary" size="sm" href={hrefFor(page - 1)}>←</ButtonLink> : <span />}
      <span className="text-sm text-muted">{label}</span>
      {page < pages ? <ButtonLink variant="secondary" size="sm" href={hrefFor(page + 1)}>→</ButtonLink> : <span />}
    </nav>
  );
}

export { cx };
