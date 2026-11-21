"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Coarse, jittered refresh while a result is awaiting grading (bounded: stops after ~5 minutes). */
export function ResultAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    let n = 0;
    let h: number;
    const loop = () => {
      if (n++ > 20) return;
      h = window.setTimeout(() => {
        router.refresh();
        loop();
      }, 10_000 + Math.random() * 5_000);
    };
    loop();
    return () => window.clearTimeout(h);
  }, [router]);
  return null;
}
