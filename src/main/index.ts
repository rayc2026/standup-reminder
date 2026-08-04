import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  Notification,
  powerMonitor,
  screen,
  shell,
  Tray,
} from "electron";
import { join } from "node:path";
import type { Server } from "node:net";
import { DEFAULT_SETTINGS, createDailyStats } from "../shared/defaults";
import type {
  CodexMode,
  EngineEffect,
  PublicState,
  ReminderMode,
  Settings,
  TimerStatus,
  UserAction,
} from "../shared/types";
import { ReminderEngine } from "./engine";
import { LocalStore } from "./store";
import { startBridgeServer } from "./bridge";
import { codexModeAllows } from "./codex-mode";
import { isForegroundWindowFullscreen } from "./fullscreen";
import { getPopupPresentation } from "./notification-policy";
import { formatStateForCodex, runMcpServer } from "../mcp/server";

const APP_ID = "io.github.rayc2026.standupreminder";
const APP_NAME = "起身提醒";
const RENDERER_PATH = join(__dirname, "..", "dist", "index.html");
const PRELOAD_PATH = join(__dirname, "preload.cjs");

app.setName(APP_NAME);

if (process.argv.includes("--mcp")) {
  void app.whenReady().then(async () => {
    const store = new LocalStore(app.getPath("userData"));
    await runMcpServer(() => store.getIntegrationToken());
  });
} else {
  startDesktopApp();
}

function startDesktopApp(): void {
  const acquiredLock = app.requestSingleInstanceLock();
  if (!acquiredLock) {
    app.quit();
    return;
  }

  let tray: Tray | null = null;
  let engine: ReminderEngine;
  let settings: Settings;
  let store: LocalStore;
  let bridgeServer: Server | null = null;
  let idleConfirmationPending = false;
  let idleThresholdReached = false;
  let lastBridgeConnectionAt = 0;
  let lastCodexReminderAt = 0;
  let lastTick = performance.now();
  let lastPersistAt = 0;
  let lastTraySignature = "";
  let quitting = false;
  const windows = new Map<string, BrowserWindow>();

  const portable = Boolean(process.env.PORTABLE_EXECUTABLE_FILE);

  app.on("second-instance", () => showWindow("dashboard", true));
  app.on("window-all-closed", () => {
    // A tray application intentionally stays alive without visible windows.
  });

  app.whenReady().then(() => {
    app.setAppUserModelId(APP_ID);
    Menu.setApplicationMenu(null);
    store = new LocalStore(app.getPath("userData"));
    settings = store.loadSettings();
    const now = Date.now();
    const date = localDate(now);
    engine = new ReminderEngine(
      settings,
      store.loadSnapshot(now),
      store.loadStats(date),
    );
    engine.recoverFromOffline(now);

    configureLoginItem();
    configureBridge();
    createTray();
    configureIpc();
    configurePowerEvents();
    configureNotificationActivation();

    setInterval(tick, 1_000);
    if (!process.argv.includes("--hidden")) {
      showWindow("dashboard", true);
    }
    publishState();
  });

  app.on("before-quit", () => {
    quitting = true;
    persist();
    bridgeServer?.close();
  });

  function tick(): void {
    const now = Date.now();
    const currentPerformance = performance.now();
    const deltaSeconds = Math.min(2, Math.max(0, (currentPerformance - lastTick) / 1000));
    lastTick = currentPerformance;

    rolloverStatsIfNeeded(now);
    handleEffects(engine.tick(deltaSeconds, now));
    pollIdleState();
    publishState();

    if (now - lastPersistAt >= 15_000) {
      persist();
      lastPersistAt = now;
    }
  }

  function pollIdleState(): void {
    const snapshot = engine.getSnapshot();
    if (snapshot.status === "locked" || snapshot.status === "paused" || snapshot.status === "break_active") {
      idleThresholdReached = false;
      return;
    }
    const idleSeconds = powerMonitor.getSystemIdleTime();
    if (idleSeconds >= settings.idleMinutes * 60) {
      idleThresholdReached = true;
    } else if (idleThresholdReached && idleSeconds <= 2 && !idleConfirmationPending) {
      idleThresholdReached = false;
      idleConfirmationPending = true;
      showWindow("idle", true);
    }
  }

  function handleEffects(effects: EngineEffect[]): void {
    for (const effect of effects) {
      if (effect.type === "remind") showReminder(effect.attempt);
      if (effect.type === "break_complete") {
        showSimpleNotification("活动完成", "做得好，下一轮专注计时已经开始。");
        closeWindow("break");
      }
    }
    if (effects.length > 0) persist();
  }

  function showReminder(_attempt: number): void {
    playReminderSound();

    const popup = getPopupPresentation(settings.reminderMode, portable);
    if (popup.show) {
      void showPopupUnlessSuppressed(popup.focus, popup.allowFullscreenSuppression);
    }

    const showNativeFailureFallback = () => {
      void showPopupUnlessSuppressed(false, false);
    };

    if (Notification.isSupported()) {
      try {
        const notification = new Notification({
          id: "standup-reminder-due",
          groupId: "standup-reminder",
          title: "该起身活动了",
          body: `已经连续使用电脑 ${Math.floor(engine.getSnapshot().workElapsedSeconds / 60)} 分钟，起来走动 ${settings.breakMinutes} 分钟吧。`,
          // Sound is played independently so portable builds do not depend on
          // Windows accepting the native toast before the user hears anything.
          silent: true,
          actions: [
            { type: "button", text: "开始活动" },
            { type: "button", text: `延后 ${settings.retryMinutes} 分钟` },
          ],
        });
        notification.on("action", (_event, actionIndex) => {
          if (actionIndex === 0) perform({ type: "start_break" });
          if (actionIndex === 1) perform({ type: "snooze" });
        });
        notification.on("click", () => showWindow("popup", true));
        notification.on("failed", showNativeFailureFallback);
        notification.show();
      } catch {
        showNativeFailureFallback();
      }
    }
  }

  async function showPopupUnlessSuppressed(
    focus: boolean,
    allowFullscreenSuppression: boolean,
  ): Promise<void> {
    if (allowFullscreenSuppression && (await shouldSuppressPopup())) return;
    if (engine.getSnapshot().status !== "break_due") return;
    showWindow("popup", focus);
  }

  function showSimpleNotification(title: string, body: string): void {
    playReminderSound();
    if (!Notification.isSupported()) return;
    try {
      new Notification({ title, body, silent: true }).show();
    } catch {
      // The independent sound already delivered the non-visual completion cue.
    }
  }

  function playReminderSound(): void {
    if (settings.sound) shell.beep();
  }

  async function shouldSuppressPopup(): Promise<boolean> {
    if (!settings.suppressPopupFullscreen) return false;
    const focused = BrowserWindow.getFocusedWindow();
    if (focused?.isFullScreen()) return true;
    return isForegroundWindowFullscreen((rectangle) =>
      screen.getDisplayMatching(rectangle).bounds,
    );
  }

  function configureNotificationActivation(): void {
    if (process.platform !== "win32") return;
    Notification.handleActivation((details) => {
      if (details.type === "action" && details.actionIndex === 0) {
        perform({ type: "start_break" });
      } else if (details.type === "action" && details.actionIndex === 1) {
        perform({ type: "snooze" });
      } else {
        showWindow("popup", true);
      }
    });
  }

  function configurePowerEvents(): void {
    powerMonitor.on("lock-screen", () => handleEffects(engine.lock(Date.now())));
    powerMonitor.on("suspend", () => handleEffects(engine.lock(Date.now())));
    powerMonitor.on("unlock-screen", () => handleEffects(engine.unlock(Date.now())));
    powerMonitor.on("resume", () => handleEffects(engine.unlock(Date.now())));
  }

  function configureIpc(): void {
    ipcMain.handle("reminder:get-state", () => getPublicState());
    ipcMain.handle("reminder:get-codex-config", () => createCodexConfig());
    ipcMain.handle("reminder:update-settings", (_event, patch: Partial<Settings>) => {
      settings = sanitizeSettings({ ...settings, ...patch });
      engine.updateSettings(settings);
      store.saveSettings(settings);
      configureLoginItem();
      configureBridge();
      publishState();
      return getPublicState();
    });
    ipcMain.handle("reminder:perform", (_event, action: UserAction) => perform(action));
  }

  function perform(action: UserAction): PublicState {
    const now = Date.now();
    let effects: EngineEffect[] = [];
    switch (action.type) {
      case "start_break":
        effects = engine.startBreak(now);
        closeWindow("popup");
        showWindow("break", true);
        break;
      case "finish_break_early":
        effects = engine.finishBreakEarly(now);
        closeWindow("break");
        break;
      case "snooze":
        effects = engine.snooze(now);
        closeWindow("popup");
        break;
      case "pause":
        effects = engine.pause(now, action.minutes);
        closeWindow("popup");
        closeWindow("break");
        break;
      case "resume":
        effects = engine.resume(now);
        break;
      case "confirm_idle":
        idleConfirmationPending = false;
        effects = engine.confirmIdleBreak(now, action.wasAway);
        closeWindow("idle");
        break;
      case "open_settings":
      case "open_stats":
        showWindow("dashboard", true);
        break;
      case "quit":
        quitting = true;
        app.quit();
        break;
    }
    handleEffects(effects);
    publishState();
    return getPublicState();
  }

  function createTray(): void {
    tray = new Tray(createTrayImage("working"));
    tray.setToolTip(APP_NAME);
    tray.on("click", () => showWindow("dashboard", true));
    updateTray(true);
  }

  function updateTray(force = false): void {
    if (!tray) return;
    const state = getPublicState();
    const minute = Math.ceil(state.workRemainingSeconds / 60);
    const signature = `${state.status}:${minute}:${state.pauseUntil ?? ""}`;
    tray.setToolTip(createTooltip(state));
    if (!force && signature === lastTraySignature) return;
    lastTraySignature = signature;
    tray.setImage(createTrayImage(state.status));
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: createTooltip(state), enabled: false },
        { type: "separator" },
        { label: "开始活动", click: () => perform({ type: "start_break" }) },
        { label: `延后 ${settings.retryMinutes} 分钟`, enabled: state.status === "break_due", click: () => perform({ type: "snooze" }) },
        {
          label: state.status === "paused" ? "恢复提醒" : "暂停提醒",
          submenu:
            state.status === "paused"
              ? [{ label: "立即恢复", click: () => perform({ type: "resume" }) }]
              : [15, 30, 60].map((minutes) => ({
                  label: `${minutes} 分钟`,
                  click: () => perform({ type: "pause", minutes }),
                })),
        },
        { type: "separator" },
        { label: "今日统计与设置", click: () => showWindow("dashboard", true) },
        { label: "退出", click: () => perform({ type: "quit" }) },
      ]),
    );
  }

  function createTrayImage(status: TimerStatus) {
    const iconPath = app.isPackaged
      ? join(process.resourcesPath, "tray-icon.png")
      : join(app.getAppPath(), "build", "icon.png");
    const pngIcon = nativeImage.createFromPath(iconPath);
    if (!pngIcon.isEmpty()) {
      return pngIcon.resize({ width: 16, height: 16, quality: "best" });
    }

    // Keep a generated fallback so a missing resource never prevents the
    // tray application from starting. Windows builds normally use the PNG.
    const color =
      status === "break_due"
        ? "#ef4444"
        : status === "break_active"
          ? "#3b82f6"
          : status === "paused" || status === "locked"
            ? "#94a3b8"
            : engine && engine.getSnapshot().workElapsedSeconds >= settings.workMinutes * 60 - 300
              ? "#f59e0b"
              : "#22c55e";
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="${color}"/><circle cx="16" cy="10" r="3" fill="white"/><path d="M10 24c1-6 3-9 6-9s5 3 6 9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"/><path d="M9 17h14" stroke="white" stroke-width="2" stroke-linecap="round"/></svg>`;
    const url = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
    return nativeImage.createFromDataURL(url).resize({ width: 16, height: 16 });
  }

  function createTooltip(state: PublicState): string {
    if (state.status === "break_due") return "该起身活动了";
    if (state.status === "break_active") return `活动还剩 ${formatDuration(state.breakRemainingSeconds)}`;
    if (state.status === "paused") return "提醒已暂停";
    if (state.status === "locked") return "电脑已锁定";
    return `距离活动还有 ${formatDuration(state.workRemainingSeconds)}`;
  }

  function showWindow(view: string, focus: boolean): void {
    const existing = windows.get(view);
    if (existing && !existing.isDestroyed()) {
      if (focus) existing.show();
      else existing.showInactive();
      if (focus) existing.focus();
      return;
    }

    const isDashboard = view === "dashboard";
    const isBreak = view === "break";
    const size = isDashboard
      ? { width: 880, height: 720 }
      : isBreak
        ? { width: 390, height: 460 }
        : { width: 430, height: 280 };
    const window = new BrowserWindow({
      ...size,
      title: APP_NAME,
      show: false,
      frame: isDashboard || isBreak,
      resizable: isDashboard,
      alwaysOnTop: !isDashboard,
      skipTaskbar: !isDashboard,
      backgroundColor: "#f7f4ed",
      webPreferences: {
        preload: PRELOAD_PATH,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
    windows.set(view, window);
    window.on("closed", () => windows.delete(view));
    window.on("close", (event) => {
      if (quitting) return;
      if (view === "break") return;
      if (isDashboard) {
        event.preventDefault();
        window.hide();
      }
    });
    void window.loadFile(RENDERER_PATH, { query: { view } }).then(() => {
      if (!isDashboard) positionNearTray(window);
      if (focus) {
        window.show();
        window.focus();
      } else {
        window.showInactive();
      }
    });
  }

  function closeWindow(view: string): void {
    const window = windows.get(view);
    if (!window || window.isDestroyed()) return;
    windows.delete(view);
    window.destroy();
  }

  function positionNearTray(window: BrowserWindow): void {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const bounds = window.getBounds();
    window.setPosition(
      display.workArea.x + display.workArea.width - bounds.width - 18,
      display.workArea.y + display.workArea.height - bounds.height - 18,
    );
  }

  function publishState(): void {
    const state = getPublicState();
    for (const window of windows.values()) {
      if (!window.isDestroyed()) window.webContents.send("reminder:state", state);
    }
    updateTray();
  }

  function getPublicState(): PublicState {
    const snapshot = engine.getSnapshot();
    return {
      status: snapshot.status,
      workElapsedSeconds: snapshot.workElapsedSeconds,
      workRemainingSeconds: Math.max(0, settings.workMinutes * 60 - snapshot.workElapsedSeconds),
      breakElapsedSeconds: snapshot.breakElapsedSeconds,
      breakRemainingSeconds: Math.max(0, settings.breakMinutes * 60 - snapshot.breakElapsedSeconds),
      retryCount: snapshot.retryCount,
      pauseUntil: snapshot.pauseUntil,
      idleConfirmationPending,
      settings,
      stats: engine.getStats(),
      codexConnected: Date.now() - lastBridgeConnectionAt < 15_000,
      portable,
    };
  }

  function persist(): void {
    if (!store || !engine) return;
    store.saveSnapshot(engine.getSnapshot());
    store.saveStats(engine.getStats());
  }

  function rolloverStatsIfNeeded(now: number): void {
    const current = engine.getStats();
    const date = localDate(now);
    if (current.date === date) return;
    store.saveStats(current);
    engine.replaceStats(store.loadStats(date) ?? createDailyStats(date));
  }

  function configureLoginItem(): void {
    if (!app.isPackaged || portable) return;
    app.setLoginItemSettings({
      openAtLogin: settings.launchAtLogin,
      path: process.execPath,
      args: ["--hidden"],
    });
  }

  function configureBridge(): void {
    const enabled = settings.codexMode !== "off";
    if (!enabled && bridgeServer) {
      bridgeServer.close();
      bridgeServer = null;
      return;
    }
    if (!enabled || bridgeServer) return;
    bridgeServer = startBridgeServer(
      store.getIntegrationToken(),
      async (method, params) => handleBridgeCall(method, params),
      () => {
        lastBridgeConnectionAt = Date.now();
      },
    );
    bridgeServer.on("error", () => {
      bridgeServer = null;
    });
  }

  async function handleBridgeCall(method: string, params: unknown): Promise<unknown> {
    if (!codexModeAllows(settings.codexMode, method)) {
      throw new Error(`当前 Codex 集成模式不支持操作：${method}`);
    }
    switch (method) {
      case "get_status": {
        const state = getPublicState();
        return {
          ...formatStateForCodex(state),
          codexReminderEligible:
            settings.codexMode === "status_check" &&
            state.status === "break_due" &&
            Date.now() - lastCodexReminderAt >= 15 * 60_000,
        };
      }
      case "get_today_stats":
        return engine.getStats();
      case "get_daily_summary":
        return createDailySummary(engine.getStats());
      case "start_break":
        return perform({ type: "start_break" });
      case "snooze":
        return perform({ type: "snooze" });
      case "pause": {
        const value = params as { minutes?: number | null } | undefined;
        return perform({ type: "pause", minutes: value?.minutes ?? null });
      }
      case "update_settings": {
        settings = sanitizeSettings({ ...settings, ...(params as Partial<Settings>) });
        engine.updateSettings(settings);
        store.saveSettings(settings);
        publishState();
        return getPublicState();
      }
      case "acknowledge_codex_reminder":
        lastCodexReminderAt = Date.now();
        return { acknowledged: true, at: lastCodexReminderAt };
      default:
        throw new Error(`不支持的操作：${method}`);
    }
  }

  function createCodexConfig(): string {
    const launchExecutable = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    const command = launchExecutable.replaceAll("'", "''");
    const args = app.isPackaged
      ? ["--mcp"]
      : [app.getAppPath(), "--mcp"];
    return [
      "[mcp_servers.standup_reminder]",
      `command = '${command}'`,
      `args = [${args.map((value) => `'${value.replaceAll("'", "''")}'`).join(", ")}]`,
    ].join("\n");
  }
}

function sanitizeSettings(value: Settings): Settings {
  const reminderModes: ReminderMode[] = ["notification", "gentle_popup", "persistent_popup"];
  const codexModes: CodexMode[] = ["off", "sync", "daily_summary", "status_check"];
  return {
    version: 1,
    workMinutes: clamp(value.workMinutes, 10, 180),
    breakMinutes: clamp(value.breakMinutes, 1, 30),
    idleMinutes: clamp(value.idleMinutes, 1, 30),
    retryMinutes: clamp(value.retryMinutes, 1, 30),
    maxRetries: clamp(value.maxRetries, 0, 10),
    reminderMode: reminderModes.includes(value.reminderMode) ? value.reminderMode : DEFAULT_SETTINGS.reminderMode,
    sound: Boolean(value.sound),
    launchAtLogin: Boolean(value.launchAtLogin),
    suppressPopupFullscreen: Boolean(value.suppressPopupFullscreen),
    codexMode: codexModes.includes(value.codexMode) ? value.codexMode : "off",
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(Number(value) || minimum)));
}

function localDate(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDuration(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(safe / 60);
  const remainder = safe % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function createDailySummary(stats: ReturnType<ReminderEngine["getStats"]>) {
  const activeMinutes = Math.floor(stats.activeSeconds / 60);
  const longestMinutes = Math.floor(stats.longestSessionSeconds / 60);
  const summary = [
    `今天电脑活跃 ${activeMinutes} 分钟，最长连续使用 ${longestMinutes} 分钟。`,
    `完成 ${stats.completedBreaks} 次完整活动，提前结束 ${stats.shortenedBreaks} 次，延后提醒 ${stats.snoozes} 次。`,
  ].join("");
  return { date: stats.date, summary, stats };
}
