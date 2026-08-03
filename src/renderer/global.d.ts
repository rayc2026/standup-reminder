import type { ReminderApi } from "../shared/types";

declare global {
  interface Window {
    reminder: ReminderApi;
  }
}

export {};
