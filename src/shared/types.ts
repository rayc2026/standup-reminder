export type ReminderMode = "notification" | "gentle_popup" | "persistent_popup";
export type CodexMode = "off" | "sync" | "daily_summary" | "status_check";
export type TimerStatus = "working" | "break_due" | "break_active" | "paused" | "locked";

export interface Settings {
  version: 1;
  workMinutes: number;
  breakMinutes: number;
  idleMinutes: number;
  retryMinutes: number;
  maxRetries: number;
  reminderMode: ReminderMode;
  sound: boolean;
  launchAtLogin: boolean;
  suppressPopupFullscreen: boolean;
  codexMode: CodexMode;
}

export interface DailyStats {
  date: string;
  activeSeconds: number;
  longestSessionSeconds: number;
  completedBreaks: number;
  shortenedBreaks: number;
  automaticBreaks: number;
  confirmedBreaks: number;
  snoozes: number;
  ignoredReminders: number;
}

export interface EngineSnapshot {
  version: 1;
  status: TimerStatus;
  statusBeforeInterruption: TimerStatus | null;
  workElapsedSeconds: number;
  breakElapsedSeconds: number;
  retryCount: number;
  nextReminderAt: number | null;
  pauseUntil: number | null;
  lockStartedAt: number | null;
  savedAt: number;
}

export type EngineEffect =
  | { type: "remind"; attempt: number }
  | { type: "break_complete" }
  | { type: "pause_complete" }
  | { type: "state_changed" };

export interface PublicState {
  status: TimerStatus;
  workElapsedSeconds: number;
  workRemainingSeconds: number;
  breakElapsedSeconds: number;
  breakRemainingSeconds: number;
  retryCount: number;
  pauseUntil: number | null;
  idleConfirmationPending: boolean;
  settings: Settings;
  stats: DailyStats;
  codexConnected: boolean;
  portable: boolean;
}

export type UserAction =
  | { type: "start_break" }
  | { type: "finish_break_early" }
  | { type: "snooze" }
  | { type: "pause"; minutes: number | null }
  | { type: "resume" }
  | { type: "confirm_idle"; wasAway: boolean }
  | { type: "open_settings" }
  | { type: "open_stats" }
  | { type: "quit" };

export interface ReminderApi {
  getState(): Promise<PublicState>;
  getCodexConfig(): Promise<string>;
  updateSettings(patch: Partial<Settings>): Promise<PublicState>;
  perform(action: UserAction): Promise<PublicState>;
  onState(callback: (state: PublicState) => void): () => void;
}
