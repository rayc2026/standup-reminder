import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";

const execFileAsync = promisify(execFile);

export interface WindowRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FOREGROUND_BOUNDS_SCRIPT = String.raw`
Add-Type @"
using System;
using System.Runtime.InteropServices;
public static class CodexStandupForegroundWindow {
  [StructLayout(LayoutKind.Sequential)]
  public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] [return: MarshalAs(UnmanagedType.Bool)]
  public static extern bool GetWindowRect(IntPtr handle, out RECT rectangle);
}
"@
$handle = [CodexStandupForegroundWindow]::GetForegroundWindow()
$rectangle = New-Object CodexStandupForegroundWindow+RECT
if ($handle -ne [IntPtr]::Zero -and [CodexStandupForegroundWindow]::GetWindowRect($handle, [ref]$rectangle)) {
  Write-Output ("{0},{1},{2},{3}" -f $rectangle.Left, $rectangle.Top, $rectangle.Right, $rectangle.Bottom)
}
`;

export async function isForegroundWindowFullscreen(
  getDisplayBounds: (rectangle: WindowRectangle) => WindowRectangle,
): Promise<boolean> {
  if (process.platform !== "win32") return false;
  try {
    const powershell = join(
      process.env.SystemRoot ?? "C:\\Windows",
      "System32",
      "WindowsPowerShell",
      "v1.0",
      "powershell.exe",
    );
    const { stdout } = await execFileAsync(
      powershell,
      ["-NoProfile", "-NonInteractive", "-Command", FOREGROUND_BOUNDS_SCRIPT],
      { timeout: 2_000, windowsHide: true },
    );
    const rectangle = parseWindowRectangle(stdout);
    if (!rectangle) return false;
    return isRectangleFullscreen(rectangle, getDisplayBounds(rectangle));
  } catch {
    return false;
  }
}

export function parseWindowRectangle(value: string): WindowRectangle | null {
  const match = value.trim().match(/^(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/);
  if (!match) return null;
  const [left, top, right, bottom] = match.slice(1).map(Number) as [number, number, number, number];
  if (right <= left || bottom <= top) return null;
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function isRectangleFullscreen(
  rectangle: WindowRectangle,
  displayBounds: WindowRectangle,
  tolerance = 12,
): boolean {
  return (
    Math.abs(rectangle.x - displayBounds.x) <= tolerance &&
    Math.abs(rectangle.y - displayBounds.y) <= tolerance &&
    Math.abs(rectangle.x + rectangle.width - (displayBounds.x + displayBounds.width)) <= tolerance &&
    Math.abs(rectangle.y + rectangle.height - (displayBounds.y + displayBounds.height)) <= tolerance
  );
}
