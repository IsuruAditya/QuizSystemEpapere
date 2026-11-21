# Testing rules

- Unit: `npm test` (pure modules, `tests/unit`). Integration: `npm run test:integration` against real PostgreSQL (`TEST_DATABASE_URL`, default local embedded server db `epapere_test`). E2E: `npm run test:e2e` (Playwright, builds and starts the app on db `epapere_e2e`).
- Never replace PostgreSQL with mocks/SQLite for transactional behaviour. Concurrency tests use parallel real connections.
- Fixtures have independently computed expected scores; use at least two exams to catch cross-exam leaks.
- Never weaken a grading/ranking assertion to make a test pass. Fix the code.
- Report results honestly in `docs/test-report.md` with exact commands; anything not executed is NOT RUN.
- Load tests (`load/k6/*.js`) are never run against a live exam without explicit authorisation.
