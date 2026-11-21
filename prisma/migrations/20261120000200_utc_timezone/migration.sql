-- All sessions must run in UTC. Verified defect: with @prisma/adapter-pg 7.10, a non-UTC session
-- TimeZone (e.g. a server initialised as Asia/Colombo) shifts timestamptz values read via $queryRaw
-- by the UTC offset, which would corrupt deadlines. A database default applies to pooled (PgBouncer)
-- connections too. See tests/integration/tz-probe.test.ts and ADR-003.
DO $$ BEGIN
  EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'UTC');
END $$;
