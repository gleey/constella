/**
 * Next.js Server Lifecycle Instrumentation Hook.
 * Automatically bootstraps the background sync daemon when Next.js server starts.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initBackgroundDaemon } = await import("@/lib/background-sync");
    initBackgroundDaemon();
  }
}
