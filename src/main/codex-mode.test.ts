import { describe, expect, it } from "vitest";
import { codexModeAllows } from "./codex-mode";

describe("Codex integration permissions", () => {
  it("allows controls only in sync mode", () => {
    expect(codexModeAllows("sync", "start_break")).toBe(true);
    expect(codexModeAllows("daily_summary", "start_break")).toBe(false);
    expect(codexModeAllows("status_check", "update_settings")).toBe(false);
  });

  it("limits each read-only mode to its advertised extra tool", () => {
    expect(codexModeAllows("daily_summary", "get_daily_summary")).toBe(true);
    expect(codexModeAllows("daily_summary", "acknowledge_codex_reminder")).toBe(false);
    expect(codexModeAllows("status_check", "acknowledge_codex_reminder")).toBe(true);
    expect(codexModeAllows("status_check", "get_daily_summary")).toBe(false);
  });

  it("keeps common status reads available in every enabled mode", () => {
    expect(codexModeAllows("sync", "get_status")).toBe(true);
    expect(codexModeAllows("daily_summary", "get_today_stats")).toBe(true);
    expect(codexModeAllows("status_check", "get_status")).toBe(true);
    expect(codexModeAllows("off", "get_status")).toBe(false);
  });
});
