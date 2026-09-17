import { invoke } from "@tauri-apps/api/core";
import { logger } from "../logger";

export async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (err) {
    logger.error(`invoke ${command} falhou`, err);
    throw err;
  }
}
