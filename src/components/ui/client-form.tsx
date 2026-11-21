"use client";
import { useSyncExternalStore, type ComponentProps } from "react";

const noop = () => () => {};

/**
 * Form handled entirely by a JS `onSubmit`. Two safeguards for slow networks:
 * - `method="post"`: if the browser ever submits natively, field values (e.g. passwords) are never
 *   put into the URL, history or server logs.
 * - Controls are disabled until hydration, so nothing can be submitted before the handler exists
 *   (prevents a native reload that silently discards what the user typed).
 */
export function ClientForm({ children, ...props }: Omit<ComponentProps<"form">, "method" | "action">) {
  const hydrated = useSyncExternalStore(noop, () => true, () => false);
  return (
    <form method="post" {...props}>
      <fieldset disabled={!hydrated} aria-busy={!hydrated} className="contents">
        {children}
      </fieldset>
    </form>
  );
}
