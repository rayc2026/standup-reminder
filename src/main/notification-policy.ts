import type { ReminderMode } from "../shared/types";

export interface PopupPresentation {
  show: boolean;
  focus: boolean;
  allowFullscreenSuppression: boolean;
}

export function getPopupPresentation(
  reminderMode: ReminderMode,
  portable: boolean,
): PopupPresentation {
  return {
    // Portable executables do not install the Start Menu identity that makes
    // Windows toast delivery reliable, so retain an in-app fallback there.
    show: reminderMode !== "notification" || portable,
    focus: reminderMode === "persistent_popup",
    allowFullscreenSuppression: !portable,
  };
}
