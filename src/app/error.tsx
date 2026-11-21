"use client";
import { useEffect } from "react";

/** Generic error boundary: no internal details are shown. Bilingual because the language cookie is not readable here. */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest lets support correlate with server logs without exposing details.
  }, [error]);
  return (
    <main id="main" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="text-2xl font-bold" lang="si">යම් දෝෂයක් සිදු විය.</h1>
      <p className="mt-1 text-lg" lang="en">Something went wrong.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">Ref: {error.digest}</p>}
      <button type="button" onClick={reset} className="mt-6 min-h-11 rounded-lg bg-brand px-4 font-semibold text-brand-fg">
        නැවත උත්සාහ කරන්න / Try again
      </button>
    </main>
  );
}
