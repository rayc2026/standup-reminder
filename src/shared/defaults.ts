import type { DailyStats, EngineSnapshot, Settings } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  workMinutes: 50,
  breakMinutes: 5,
  idleMinutes: 5,
  retryMinutes: 5,
  maxRetries: 3,
  reminderMode: "notification",
  sound: true,
  launchAtLogin: true,
  suppressPopupFullscreen: true,
  codexMode: "off",
};

export function createDailyStats(date: string): DailyStats {
  return {
    date,
    activeSeconds: 0,
    longestSessionSeconds: 0,
    completedBreaks: 0,
    shortenedBreaks: 0,
    automaticBreaks: 0,
    confirmedBreaks: 0,
    snoozes: 0,
    ignoredReminders: 0,
  };
}

export function createSnapshot(now: number): EngineSnapshot {
  return {
    version: 1,
    status: "working",
    statusBeforeInterruption: null,
    workElapsedSeconds: 0,
    breakElapsedSeconds: 0,
    retryCount: 0,
    nextReminderAt: null,
    pauseUntil: null,
    lockStartedAt: null,
    savedAt: now,
  };
}
