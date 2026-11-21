/**
 * Next.js Server Lifecycle Instrumentation Hook.
 * Automatically bootstraps the background sync daemon when Next.js server starts
 * ONLY if explicitly enabled (preventing rogue background processes in serverless environments).
 */
export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.ENABLE_IN_APP_DAEMON === "true"
  ) {
    const { initBackgroundDaemon } = await import("@/lib/background-sync");
    initBackgroundDaemon();
  }
}
