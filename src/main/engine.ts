import { createDailyStats, createSnapshot } from "../shared/defaults";
import type {
  DailyStats,
  EngineEffect,
  EngineSnapshot,
  Settings,
  TimerStatus,
} from "../shared/types";

const ACTIVE_STATES = new Set<TimerStatus>(["working", "break_due"]);

export class ReminderEngine {
  private effects: EngineEffect[] = [];

  constructor(
    private settings: Settings,
    private snapshot: EngineSnapshot,
    private stats: DailyStats,
  ) {}

  static fresh(settings: Settings, now: number, date: string): ReminderEngine {
    return new ReminderEngine(settings, createSnapshot(now), createDailyStats(date));
  }

  updateSettings(settings: Settings): void {
    this.settings = settings;
  }

  replaceStats(stats: DailyStats): void {
    this.stats = stats;
  }

  recoverFromOffline(now: number): void {
    const offlineSeconds = Math.max(0, (now - this.snapshot.savedAt) / 1000);
    if (offlineSeconds >= this.settings.idleMinutes * 60) {
      if (ACTIVE_STATES.has(this.snapshot.status)) {
        this.stats.automaticBreaks += 1;
      }
      this.resetWork(now);
    }
    this.snapshot.savedAt = now;
  }

  tick(deltaSeconds: number, now: number): EngineEffect[] {
    const delta = Math.max(0, deltaSeconds);

    if (ACTIVE_STATES.has(this.snapshot.status)) {
      this.snapshot.workElapsedSeconds += delta;
      this.stats.activeSeconds += delta;
      this.stats.longestSessionSeconds = Math.max(
        this.stats.longestSessionSeconds,
        this.snapshot.workElapsedSeconds,
      );
    } else if (this.snapshot.status === "break_active") {
      this.snapshot.breakElapsedSeconds += delta;
      if (this.snapshot.breakElapsedSeconds >= this.settings.breakMinutes * 60) {
        this.stats.completedBreaks += 1;
        this.effects.push({ type: "break_complete" });
        this.resetWork(now);
      }
    } else if (
      this.snapshot.status === "paused" &&
      this.snapshot.pauseUntil !== null &&
      now >= this.snapshot.pauseUntil
    ) {
      this.resume(now);
      this.effects.push({ type: "pause_complete" });
    }

    if (
      this.snapshot.status === "working" &&
      this.snapshot.workElapsedSeconds >= this.settings.workMinutes * 60
    ) {
      this.snapshot.status = "break_due";
      this.snapshot.retryCount = 0;
      this.snapshot.nextReminderAt = now;
      this.effects.push({ type: "state_changed" });
    }

    if (
      this.snapshot.status === "break_due" &&
      this.snapshot.nextReminderAt !== null &&
      now >= this.snapshot.nextReminderAt
    ) {
      const maxAttempts = 1 + this.settings.maxRetries;
      if (this.snapshot.retryCount < maxAttempts) {
        if (this.snapshot.retryCount > 0) {
          this.stats.ignoredReminders += 1;
        }
        this.snapshot.retryCount += 1;
        this.effects.push({ type: "remind", attempt: this.snapshot.retryCount });
        this.snapshot.nextReminderAt =
          this.snapshot.retryCount < maxAttempts
            ? now + this.settings.retryMinutes * 60_000
            : null;
      }
    }

    this.snapshot.savedAt = now;
    return this.drainEffects();
  }

  startBreak(now: number): EngineEffect[] {
    this.snapshot.status = "break_active";
    this.snapshot.statusBeforeInterruption = null;
    this.snapshot.breakElapsedSeconds = 0;
    this.snapshot.retryCount = 0;
    this.snapshot.nextReminderAt = null;
    this.snapshot.pauseUntil = null;
    this.snapshot.savedAt = now;
    this.effects.push({ type: "state_changed" });
    return this.drainEffects();
  }

  finishBreakEarly(now: number): EngineEffect[] {
    if (this.snapshot.status === "break_active") {
      this.stats.shortenedBreaks += 1;
    }
    this.resetWork(now);
    return this.drainEffects();
  }

  snooze(now: number): EngineEffect[] {
    if (this.snapshot.status === "break_due") {
      this.stats.snoozes += 1;
      this.snapshot.nextReminderAt = now + this.settings.retryMinutes * 60_000;
      this.snapshot.savedAt = now;
      this.effects.push({ type: "state_changed" });
    }
    return this.drainEffects();
  }

  pause(now: number, minutes: number | null): EngineEffect[] {
    if (this.snapshot.status !== "paused") {
      this.snapshot.statusBeforeInterruption = this.snapshot.status;
    }
    this.snapshot.status = "paused";
    this.snapshot.pauseUntil = minutes === null ? null : now + minutes * 60_000;
    this.snapshot.nextReminderAt = null;
    this.snapshot.savedAt = now;
    this.effects.push({ type: "state_changed" });
    return this.drainEffects();
  }

  resume(now: number): EngineEffect[] {
    const previous = this.snapshot.statusBeforeInterruption;
    this.snapshot.status = previous === "break_due" ? "break_due" : "working";
    this.snapshot.statusBeforeInterruption = null;
    this.snapshot.pauseUntil = null;
    if (this.snapshot.status === "break_due") {
      this.snapshot.nextReminderAt = now;
    }
    this.snapshot.savedAt = now;
    this.effects.push({ type: "state_changed" });
    return this.drainEffects();
  }

  lock(now: number): EngineEffect[] {
    if (this.snapshot.status === "locked") {
      return [];
    }
    this.snapshot.statusBeforeInterruption = this.snapshot.status;
    this.snapshot.status = "locked";
    this.snapshot.lockStartedAt = now;
    this.snapshot.savedAt = now;
    this.effects.push({ type: "state_changed" });
    return this.drainEffects();
  }

  unlock(now: number): EngineEffect[] {
    if (this.snapshot.status !== "locked") {
      return [];
    }
    const lockedSeconds = Math.max(
      0,
      (now - (this.snapshot.lockStartedAt ?? now)) / 1000,
    );
    const previous = this.snapshot.statusBeforeInterruption;
    if (lockedSeconds >= this.settings.idleMinutes * 60) {
      if (previous && ACTIVE_STATES.has(previous)) {
        this.stats.automaticBreaks += 1;
      }
      this.resetWork(now);
    } else {
      this.snapshot.status = previous ?? "working";
      this.snapshot.statusBeforeInterruption = null;
      this.snapshot.lockStartedAt = null;
      this.snapshot.savedAt = now;
      this.effects.push({ type: "state_changed" });
    }
    return this.drainEffects();
  }

  confirmIdleBreak(now: number, wasAway: boolean): EngineEffect[] {
    if (wasAway) {
      this.stats.confirmedBreaks += 1;
      this.resetWork(now);
    }
    this.snapshot.savedAt = now;
    return this.drainEffects();
  }

  getSnapshot(): EngineSnapshot {
    return structuredClone(this.snapshot);
  }

  getStats(): DailyStats {
    return structuredClone(this.stats);
  }

  private resetWork(now: number): void {
    this.snapshot.status = "working";
    this.snapshot.statusBeforeInterruption = null;
    this.snapshot.workElapsedSeconds = 0;
    this.snapshot.breakElapsedSeconds = 0;
    this.snapshot.retryCount = 0;
    this.snapshot.nextReminderAt = null;
    this.snapshot.pauseUntil = null;
    this.snapshot.lockStartedAt = null;
    this.snapshot.savedAt = now;
    this.effects.push({ type: "state_changed" });
  }

  private drainEffects(): EngineEffect[] {
    const effects = this.effects;
    this.effects = [];
    return effects;
  }
}
