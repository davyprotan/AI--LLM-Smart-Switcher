import { invoke, isTauri } from "@tauri-apps/api/core";

export async function safeInvoke<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  if (!isTauri()) {
    return null;
  }

  try {
    return await invoke<T>(command, args);
  } catch (error) {
    console.error(`[tauri] command "${command}" failed:`, error);
    return null;
  }
}
