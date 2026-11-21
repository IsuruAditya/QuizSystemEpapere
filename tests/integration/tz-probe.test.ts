import { it, expect } from "vitest";
import { db } from "@/server/db";

// Regression test for the adapter/session-timezone defect fixed by migration 20261120000200_utc_timezone.
it("sessions run in UTC and timestamptz round-trips as the correct instant", async () => {
  const [r] = (await db.$queryRaw<{ now: Date; tz: string }[]>`SELECT clock_timestamp() AS now, current_setting('TimeZone') AS tz`) as [{ now: Date; tz: string }];
  expect(r.tz).toBe("UTC");
  expect(Math.abs(r.now.getTime() - Date.now())).toBeLessThan(5000);
  const e = new Date("2026-12-01T04:30:00.123Z");
  const [b] = (await db.$queryRaw<{ v: Date }[]>`SELECT ${e}::timestamptz AS v`) as [{ v: Date }];
  expect(b.v.toISOString()).toBe(e.toISOString());
});
