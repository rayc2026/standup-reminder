import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, createDailyStats, createSnapshot } from "../shared/defaults";
import { ReminderEngine } from "./engine";

const start = new Date("2026-08-03T09:00:00+08:00").getTime();

function createEngine(overrides = {}) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides };
  return new ReminderEngine(
    settings,
    createSnapshot(start),
    createDailyStats("2026-08-03"),
  );
}

describe("ReminderEngine", () => {
  it("reminds when the work interval is reached", () => {
    const engine = createEngine({ workMinutes: 1 });
    const effects = engine.tick(60, start + 60_000);
    expect(engine.getSnapshot().status).toBe("break_due");
    expect(effects).toContainEqual({ type: "remind", attempt: 1 });
  });

  it("retries three times after the initial reminder", () => {
    const engine = createEngine({ workMinutes: 1, retryMinutes: 1, maxRetries: 3 });
    engine.tick(60, start + 60_000);
    expect(engine.tick(60, start + 120_000)).toContainEqual({ type: "remind", attempt: 2 });
    expect(engine.tick(60, start + 180_000)).toContainEqual({ type: "remind", attempt: 3 });
    expect(engine.tick(60, start + 240_000)).toContainEqual({ type: "remind", attempt: 4 });
    expect(engine.tick(60, start + 300_000)).not.toContainEqual(
      expect.objectContaining({ type: "remind" }),
    );
  });

  it("completes a full movement break", () => {
    const engine = createEngine({ breakMinutes: 1 });
    engine.startBreak(start);
    const effects = engine.tick(60, start + 60_000);
    expect(effects).toContainEqual({ type: "break_complete" });
    expect(engine.getSnapshot().status).toBe("working");
    expect(engine.getStats().completedBreaks).toBe(1);
  });

  it("preserves progress after a short lock", () => {
    const engine = createEngine({ idleMinutes: 5 });
    engine.tick(120, start + 120_000);
    engine.lock(start + 120_000);
    engine.unlock(start + 240_000);
    expect(engine.getSnapshot().workElapsedSeconds).toBe(120);
  });

  it("resets after a long lock", () => {
    const engine = createEngine({ idleMinutes: 5 });
    engine.tick(120, start + 120_000);
    engine.lock(start + 120_000);
    engine.unlock(start + 480_000);
    expect(engine.getSnapshot().workElapsedSeconds).toBe(0);
    expect(engine.getStats().automaticBreaks).toBe(1);
  });

  it("only resets idle time after confirmation", () => {
    const engine = createEngine();
    engine.tick(600, start + 600_000);
    engine.confirmIdleBreak(start + 600_000, false);
    expect(engine.getSnapshot().workElapsedSeconds).toBe(600);
    engine.confirmIdleBreak(start + 600_000, true);
    expect(engine.getSnapshot().workElapsedSeconds).toBe(0);
    expect(engine.getStats().confirmedBreaks).toBe(1);
  });
});
