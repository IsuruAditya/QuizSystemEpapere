"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";
import { IconClose, IconMenu } from "./ui/icons";

export interface NavItem {
  href: string;
  label: string;
}

/** The section root ("/admin") is active only on itself; deeper items match their sub-paths. */
function isActive(pathname: string, href: string, items: NavItem[]): boolean {
  const isRoot = items.some((i) => i.href !== href && i.href.startsWith(href + "/"));
  return isRoot ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

/** Inline navigation for >= lg screens, with the current page marked (aria-current). */
export function DesktopNav({ items, label }: { items: NavItem[]; label: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label={label} className="hidden items-center gap-1 lg:flex">
      {items.map((n) => {
        const active = isActive(pathname, n.href, items);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cx(
              "min-h-11 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors",
              active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface hover:text-fg",
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Menu button + panel for < lg screens. Closes on navigation, Escape and outside click. */
export function MobileNav({ items, label, openLabel, closeLabel }: { items: NavItem[]; label: string; openLabel: string; closeLabel: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPath, setLastPath] = useState(pathname);
  const ref = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  if (lastPath !== pathname) {
    setLastPath(pathname);
    setOpen(false);
  }
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);
  return (
    <div ref={ref} className="lg:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((o) => !o)}
        className="grid min-h-11 min-w-11 place-items-center rounded-xl text-fg hover:bg-surface"
      >
        {open ? <IconClose /> : <IconMenu />}
      </button>
      {open && (
        <nav id="mobile-nav" aria-label={label} className="absolute inset-x-0 top-full z-40 border-b border-border bg-bg shadow-card">
          <ul className="mx-auto grid max-w-6xl gap-1 p-3 sm:grid-cols-2">
            {items.map((n) => {
              const active = isActive(pathname, n.href, items);
              return (
                <li key={n.href}>
                  <Link
                    href={n.href}
                    aria-current={active ? "page" : undefined}
                    className={cx("flex min-h-12 items-center rounded-xl px-4 text-base font-semibold", active ? "bg-brand-soft text-brand" : "hover:bg-surface")}
                  >
                    {n.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      )}
    </div>
  );
}
