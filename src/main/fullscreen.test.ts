import { describe, expect, it } from "vitest";
import { isRectangleFullscreen, parseWindowRectangle } from "./fullscreen";

describe("foreground fullscreen detection", () => {
  it("parses Win32 window bounds including negative monitor coordinates", () => {
    expect(parseWindowRectangle("-1920,0,0,1080\r\n")).toEqual({
      x: -1920,
      y: 0,
      width: 1920,
      height: 1080,
    });
  });

  it("accepts small invisible window-border differences", () => {
    expect(
      isRectangleFullscreen(
        { x: -8, y: -8, width: 1936, height: 1096 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toBe(true);
  });

  it("does not treat a maximized work-area window as fullscreen", () => {
    expect(
      isRectangleFullscreen(
        { x: 0, y: 0, width: 1920, height: 1040 },
        { x: 0, y: 0, width: 1920, height: 1080 },
      ),
    ).toBe(false);
  });
});
