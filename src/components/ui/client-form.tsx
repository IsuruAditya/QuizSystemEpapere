"use client";
import { useSyncExternalStore, type ComponentProps } from "react";
import { cx } from "./index";

const noop = () => () => {};

/**
 * Form handled entirely by a JS `onSubmit`. Two safeguards for slow networks:
 * - `method="post"`: if the browser ever submits natively, field values (e.g. passwords) are never
 *   put into the URL, history or server logs.
 * - Controls are disabled until hydration, so nothing can be submitted before the handler exists
 *   (prevents a native reload that silently discards what the user typed).
 *
 * Layout classes (`className`, e.g. space-y-4 / grid) are applied to the inner fieldset, which is the
 * direct parent of the fields, so spacing and grid layouts work exactly as on a plain <form>.
 */
export function ClientForm({ children, className, ...props }: Omit<ComponentProps<"form">, "method" | "action">) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return (
    <form method="post" {...props}>
      <fieldset disabled={!hydrated} aria-busy={!hydrated} className={cx("form-fields", className)}>
        {children}
      </fieldset>
    </form>
  );
}
