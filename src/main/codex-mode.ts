import type { CodexMode } from "../shared/types";

const READ_METHODS = new Set(["get_status", "get_today_stats"]);
const CONTROL_METHODS = new Set(["start_break", "snooze", "pause", "update_settings"]);

export function codexModeAllows(mode: CodexMode, method: string): boolean {
  if (mode === "off") return false;
  if (READ_METHODS.has(method)) return true;
  if (mode === "sync") return CONTROL_METHODS.has(method);
  if (mode === "daily_summary") return method === "get_daily_summary";
  if (mode === "status_check") return method === "acknowledge_codex_reminder";
  return false;
}
