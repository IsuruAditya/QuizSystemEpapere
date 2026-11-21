"use client";
import { useEffect, useRef, useState } from "react";
import type { ServerClock } from "@/lib/attempt/browser";
import type { T } from "@/lib/i18n/dictionaries";

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

export function Countdown({ deadline, clock, onExpire, tr }: { deadline: string; clock: ServerClock; onExpire: () => void; tr: T }) {
  const end = Date.parse(deadline);
  const [left, setLeft] = useState(() => end - clock.now());
  const [announce, setAnnounce] = useState("");
  const fired = useRef(false);
  const warned = useRef({ five: false, one: false });
  useEffect(() => {
    const tick = () => {
      const l = end - clock.now();
      setLeft(l);
      if (l <= 5 * 60_000 && !warned.current.five && l > 60_000) {
        warned.current.five = true;
        setAnnounce(tr("fiveMinutesLeft"));
      }
      if (l <= 60_000 && !warned.current.one && l > 0) {
        warned.current.one = true;
        setAnnounce(tr("oneMinuteLeft"));
      }
      if (l <= 0 && !fired.current) {
        fired.current = true;
        onExpire();
      }
    };
    tick();
    const h = window.setInterval(tick, 500);
    return () => window.clearInterval(h);
  }, [end, clock, onExpire, tr]);
  const urgent = left <= 5 * 60_000;
  return (
    <div className="text-right">
      <p className="text-[11px] text-muted">{tr("timeLeft")}</p>
      <p className={`font-mono text-lg font-bold tabular-nums ${urgent ? "text-danger" : ""}`} aria-hidden>
        {urgent && "⏰ "}
        {fmt(left)}
      </p>
      <span className="sr-only">{tr("timeLeftSr", { minutes: Math.max(0, Math.ceil(left / 60_000)) })}</span>
      <span className="sr-only" role="alert">
        {announce}
      </span>
    </div>
  );
}
