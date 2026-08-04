import { describe, expect, it } from "vitest";
import { getPopupPresentation } from "./notification-policy";

describe("reminder popup presentation", () => {
  it("shows the gentle popup on the first reminder", () => {
    expect(getPopupPresentation("gentle_popup", false)).toEqual({
      show: true,
      focus: false,
      allowFullscreenSuppression: true,
    });
  });

  it("focuses persistent reminders", () => {
    expect(getPopupPresentation("persistent_popup", false)).toEqual({
      show: true,
      focus: true,
      allowFullscreenSuppression: true,
    });
  });

  it("uses a popup fallback for notification-only portable builds", () => {
    expect(getPopupPresentation("notification", true)).toEqual({
      show: true,
      focus: false,
      allowFullscreenSuppression: false,
    });
  });

  it("keeps notification-only installed builds notification-only", () => {
    expect(getPopupPresentation("notification", false)).toEqual({
      show: false,
      focus: false,
      allowFullscreenSuppression: true,
    });
  });
});
