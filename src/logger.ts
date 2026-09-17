import { invoke } from "@tauri-apps/api/core";

type Level = "ERROR" | "WARN" | "INFO" | "DEBUG";

/** Kept in sync by `AuthContext` (a `useEffect` on its `user` state, so it
 * stays correct no matter which path changed it — `login()`, `logout()`, the
 * raw `setUser()` some pages call directly, or the initial `getActiveUser()`
 * fetch). Every log line gets tagged with whoever was logged in at the time,
 * so a log the user forwards can actually be traced back to an operator —
 * `null` (printed as "no session") for anything logged before login, e.g. a
 * failed login attempt itself. */
let currentUser: { id: number; name: string } | null = null;

export function setLoggerUser(user: { id: number; name: string } | null) {
  currentUser = user;
}

function userTag(): string {
  return currentUser ? `[user ${currentUser.id}:${currentUser.name}]` : "[no session]";
}

function serialize(args: unknown[]): string {
  return args
    .map((a) => {
      if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ""}`;
      if (typeof a === "object" && a !== null) {
        try {
          return JSON.stringify(a);
        } catch {
          return String(a);
        }
      }
      return String(a);
    })
    .join(" ");
}

function send(level: Level, ...args: unknown[]) {
  const message = `${userTag()} ${serialize(args)}`;
  invoke("write_log", { level, message }).catch(() => {});
}

export const logger = {
  error(...args: unknown[]) {
    console.error(...args);
    send("ERROR", ...args);
  },
  warn(...args: unknown[]) {
    console.warn(...args);
    send("WARN", ...args);
  },
  info(...args: unknown[]) {
    console.info(...args);
    send("INFO", ...args);
  },
  debug(...args: unknown[]) {
    console.debug(...args);
    send("DEBUG", ...args);
  },
};
