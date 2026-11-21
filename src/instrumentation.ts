/**
 * Fail fast: validate the environment once when the Node server starts, so a misconfigured
 * deployment stops with an actionable error instead of failing on the first student request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { env } = await import("./server/env");
  env();
}
