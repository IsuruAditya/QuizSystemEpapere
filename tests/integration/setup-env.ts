// Runs before each integration test file: point the app at the dedicated test database.
const url = process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54329/epapere_test";
process.env.APP_ENV = "test";
process.env.DATABASE_URL = url;
process.env.DIRECT_DATABASE_URL = url;
process.env.DATABASE_POOL_MAX = "20";
process.env.BETTER_AUTH_SECRET ??= "test-secret-test-secret-test-secret-0123456789";
process.env.CRON_SECRET ??= "test-cron-secret-test-cron-secret-0123456789";
process.env.APP_ORIGIN = "http://localhost:3000";
process.env.MEDIA_STORE = "local";
process.env.MEDIA_LOCAL_DIR = ".local-media";
process.env.LOG_LEVEL = "error";
