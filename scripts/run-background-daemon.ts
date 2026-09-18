/**
 * Dedicated Background Daemon Process.
 * Runs continuous periodic sync of media, characters, relationships, and images
 * using live AniList and Fandom Wiki APIs.
 *
 * Can be run via CLI, systemd, docker, or PM2:
 *   npm run sync:daemon
 */

import { initBackgroundDaemon } from "../src/lib/background-sync";

console.log("Starting Background Sync Daemon...");
initBackgroundDaemon(6);

// Keep the process alive indefinitely
setInterval(() => {}, 1 << 30);
