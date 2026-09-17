import { invoke } from "@tauri-apps/api/core";

type Level = "ERROR" | "WARN" | "INFO" | "DEBUG";

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
  const message = serialize(args);
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
