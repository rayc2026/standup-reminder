import "./styles.css";
import type { CodexMode, PublicState, ReminderMode, UserAction } from "../shared/types";

const root = document.querySelector<HTMLElement>("#app")!;

const view = new URLSearchParams(window.location.search).get("view") ?? "dashboard";
let currentState: PublicState | null = null;
let rendered = false;

void window.reminder.getState().then((state) => {
  currentState = state;
  renderShell(state);
  updateState(state);
});

window.reminder.onState((state) => {
  currentState = state;
  if (!rendered) renderShell(state);
  updateState(state);
});

function renderShell(state: PublicState): void {
  rendered = true;
  root.className = `view-${view}`;
  if (view === "popup") root.innerHTML = reminderPopup();
  else if (view === "break") root.innerHTML = breakWindow();
  else if (view === "idle") root.innerHTML = idleWindow();
  else root.innerHTML = dashboard(state);
  bindActions();
  if (view === "dashboard") bindSettings();
}

function dashboard(state: PublicState): string {
  return `
    <div class="dashboard-shell">
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark" aria-hidden="true">伸</span>
          <div><strong>起身提醒</strong><small>让专注和活动自然交替</small></div>
        </div>
        <span class="edition-badge">${state.portable ? "便携试用版" : "安装版"}</span>
      </header>

      <section class="hero-card">
        <div class="timer-ring" data-ring="work">
          <div class="timer-core">
            <span class="eyebrow" data-text="status">专注中</span>
            <strong data-text="primary-time">50:00</strong>
            <small data-text="timer-caption">距离下次活动</small>
          </div>
        </div>
        <div class="hero-copy">
          <span class="section-kicker">当前节奏</span>
          <h1 data-text="headline">身体也需要一次保存</h1>
          <p data-text="description">保持舒展，下一次提醒会在合适的时候出现。</p>
          <div class="action-row">
            <button class="button primary" data-action="start_break" data-role="start-break">开始活动</button>
            <button class="button ghost" data-action="pause" data-minutes="30" data-role="pause">暂停 30 分钟</button>
            <button class="button ghost hidden" data-action="resume" data-role="resume">恢复提醒</button>
          </div>
        </div>
      </section>

      <section class="stats-grid" aria-label="今日统计">
        ${statCard("今日电脑活跃", "active", "0 分钟", "focus")}
        ${statCard("最长连续使用", "longest", "0 分钟", "long")}
        ${statCard("完整活动", "completed", "0 次", "done")}
        ${statCard("延后提醒", "snoozes", "0 次", "delay")}
      </section>

      <div class="content-grid">
        <section class="panel settings-panel">
          <div class="panel-heading"><div><span class="section-kicker">偏好设置</span><h2>提醒节奏</h2></div><span class="save-hint" data-text="save-hint">自动保存</span></div>
          <form id="settings-form">
            <div class="field-grid">
              ${numberField("workMinutes", "连续使用", state.settings.workMinutes, "分钟", 10, 180)}
              ${numberField("breakMinutes", "活动时长", state.settings.breakMinutes, "分钟", 1, 30)}
              ${numberField("idleMinutes", "空闲确认", state.settings.idleMinutes, "分钟", 1, 30)}
              ${numberField("retryMinutes", "再次提醒", state.settings.retryMinutes, "分钟", 1, 30)}
            </div>
            <label class="select-field"><span>提醒方式</span><select name="reminderMode">
              ${option("notification", "仅系统通知", state.settings.reminderMode)}
              ${option("gentle_popup", "通知 + 轻量弹窗", state.settings.reminderMode)}
              ${option("persistent_popup", "持续弹窗", state.settings.reminderMode)}
            </select></label>
            <div class="toggle-list">
              ${toggle("sound", "提示音", "系统通知出现时播放声音", state.settings.sound)}
              ${toggle("launchAtLogin", "开机自动启动", state.portable ? "便携版不提供此功能" : "登录 Windows 后在托盘静默启动", state.settings.launchAtLogin, state.portable)}
              ${toggle("suppressPopupFullscreen", "全屏时减少打扰", "前台应用全屏时仅保留系统通知", state.settings.suppressPopupFullscreen)}
            </div>
          </form>
        </section>

        <section class="panel codex-panel">
          <div class="panel-heading"><div><span class="section-kicker">可选连接</span><h2>Codex 集成</h2></div><span class="connection-dot" data-role="connection"></span></div>
          <p>托盘始终是唯一数据源。Codex 只会按所选模式调用本地工具，不会主动上传数据。</p>
          <label class="select-field"><span>集成模式</span><select id="codex-mode">
            ${option("off", "关闭", state.settings.codexMode)}
            ${option("sync", "同步 + 计时控制", state.settings.codexMode)}
            ${option("daily_summary", "只读同步 + 按需总结", state.settings.codexMode)}
            ${option("status_check", "只读同步 + 状态检查", state.settings.codexMode)}
          </select></label>
          <div class="codex-status"><strong data-text="codex-status">未启用</strong><small data-text="codex-detail">无需 Codex，托盘仍可独立运行。</small></div>
          <details data-role="codex-config">
            <summary>查看 MCP 连接配置</summary>
            <textarea id="codex-config" readonly aria-label="Codex MCP 配置"></textarea>
            <button class="button ghost small" id="copy-config" type="button">复制配置</button>
          </details>
        </section>
      </div>
    </div>`;
}

function reminderPopup(): string {
  return `<section class="compact-card due-card">
    <button class="icon-close" aria-label="关闭" data-action="close">×</button>
    <span class="pulse-icon" aria-hidden="true">↗</span>
    <span class="section-kicker">活动时间到了</span>
    <h1>起来舒展一下吧</h1>
    <p>你已经连续使用电脑 <strong data-text="elapsed-minutes">50</strong> 分钟。走动片刻，眼睛也看看远处。</p>
    <div class="compact-actions">
      <button class="button primary" data-action="start_break">开始活动</button>
      <button class="button ghost" data-action="snooze" data-text="snooze-label">延后 5 分钟</button>
      <button class="text-button" data-action="pause" data-minutes="30">暂停 30 分钟</button>
    </div>
  </section>`;
}

function breakWindow(): string {
  return `<section class="break-card">
    <span class="section-kicker">活动进行中</span>
    <h1>让身体松一口气</h1>
    <div class="timer-ring break-ring" data-ring="break"><div class="timer-core"><strong data-text="break-time">05:00</strong><small>剩余活动时间</small></div></div>
    <div class="movement-tip"><span aria-hidden="true">✦</span><p data-text="movement-tip">慢慢转动肩膀，放松颈部。</p></div>
    <button class="text-button" data-action="finish_break_early">提前结束并开始下一轮</button>
  </section>`;
}

function idleWindow(): string {
  return `<section class="compact-card idle-card">
    <span class="question-icon" aria-hidden="true">?</span>
    <span class="section-kicker">确认一下</span>
    <h1>刚才有离开座位吗？</h1>
    <p>检测到一段时间没有键鼠输入。阅读或看视频也会出现这种情况，所以需要你确认。</p>
    <div class="compact-actions two">
      <button class="button primary" data-action="confirm_idle" data-away="true">是的，活动过了</button>
      <button class="button ghost" data-action="confirm_idle" data-away="false">没有，继续计时</button>
    </div>
  </section>`;
}

function bindActions(): void {
  root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
    element.addEventListener("click", () => {
      const action = element.dataset.action;
      if (action === "close") {
        window.close();
        return;
      }
      let payload: UserAction;
      if (action === "pause") payload = { type: "pause", minutes: Number(element.dataset.minutes) };
      else if (action === "confirm_idle") payload = { type: "confirm_idle", wasAway: element.dataset.away === "true" };
      else payload = { type: action as UserAction["type"] } as UserAction;
      void window.reminder.perform(payload);
    });
  });
}

function bindSettings(): void {
  const form = root.querySelector<HTMLFormElement>("#settings-form");
  form?.addEventListener("change", () => {
    const data = new FormData(form);
    const reminderMode = data.get("reminderMode") as ReminderMode;
    void saveSettings({
      workMinutes: Number(data.get("workMinutes")),
      breakMinutes: Number(data.get("breakMinutes")),
      idleMinutes: Number(data.get("idleMinutes")),
      retryMinutes: Number(data.get("retryMinutes")),
      reminderMode,
      sound: data.get("sound") === "on",
      launchAtLogin: data.get("launchAtLogin") === "on",
      suppressPopupFullscreen: data.get("suppressPopupFullscreen") === "on",
    });
  });

  root.querySelector<HTMLSelectElement>("#codex-mode")?.addEventListener("change", (event) => {
    const mode = (event.target as HTMLSelectElement).value as CodexMode;
    void saveSettings({ codexMode: mode }).then(() => loadCodexConfig());
  });
  root.querySelector<HTMLButtonElement>("#copy-config")?.addEventListener("click", async () => {
    const value = root.querySelector<HTMLTextAreaElement>("#codex-config")?.value ?? "";
    await navigator.clipboard.writeText(value);
    const button = root.querySelector<HTMLButtonElement>("#copy-config");
    if (button) button.textContent = "已复制";
  });
  void loadCodexConfig();
}

async function saveSettings(patch: Parameters<typeof window.reminder.updateSettings>[0]) {
  setText("save-hint", "正在保存…");
  const state = await window.reminder.updateSettings(patch);
  setText("save-hint", "已保存");
  window.setTimeout(() => setText("save-hint", "自动保存"), 1_200);
  return state;
}

async function loadCodexConfig(): Promise<void> {
  const textarea = root.querySelector<HTMLTextAreaElement>("#codex-config");
  if (textarea) textarea.value = await window.reminder.getCodexConfig();
}

function updateState(state: PublicState): void {
  currentState = state;
  if (view === "dashboard") updateDashboard(state);
  else if (view === "popup") {
    setText("elapsed-minutes", String(Math.floor(state.workElapsedSeconds / 60)));
    setText("snooze-label", `延后 ${state.settings.retryMinutes} 分钟`);
  }
  else if (view === "break") updateBreak(state);
}

function updateDashboard(state: PublicState): void {
  syncSettingsForm(state);
  const statusCopy = getStatusCopy(state);
  setText("status", statusCopy.label);
  setText("headline", statusCopy.headline);
  setText("description", statusCopy.description);
  setText("primary-time", formatClock(state.status === "break_active" ? state.breakRemainingSeconds : state.workRemainingSeconds));
  setText("timer-caption", state.status === "break_active" ? "活动剩余时间" : "距离下次活动");
  setText("active", formatMinutes(state.stats.activeSeconds));
  setText("longest", formatMinutes(state.stats.longestSessionSeconds));
  setText("completed", `${state.stats.completedBreaks} 次`);
  setText("snoozes", `${state.stats.snoozes} 次`);

  const ring = root.querySelector<HTMLElement>("[data-ring='work']");
  const total = state.status === "break_active" ? state.settings.breakMinutes * 60 : state.settings.workMinutes * 60;
  const elapsed = state.status === "break_active" ? state.breakElapsedSeconds : state.workElapsedSeconds;
  ring?.style.setProperty("--progress", `${Math.min(100, (elapsed / total) * 100)}%`);
  ring?.setAttribute("data-status", state.status);

  root.querySelector<HTMLElement>("[data-role='resume']")?.classList.toggle("hidden", state.status !== "paused");
  root.querySelector<HTMLElement>("[data-role='start-break']")?.classList.toggle(
    "hidden",
    state.status === "break_active" || state.status === "paused" || state.status === "locked",
  );
  root.querySelector<HTMLElement>("[data-role='pause']")?.classList.toggle(
    "hidden",
    state.status === "break_active" || state.status === "paused" || state.status === "locked",
  );

  const connection = root.querySelector<HTMLElement>("[data-role='connection']");
  connection?.classList.toggle("connected", state.codexConnected);
  setText("codex-status", state.settings.codexMode === "off" ? "未启用" : state.codexConnected ? "Codex 已连接" : "等待 Codex 连接");
  setText(
    "codex-detail",
    state.settings.codexMode === "off"
      ? "无需 Codex，托盘仍可独立运行。"
      : state.codexConnected
        ? "查询和操作都会使用当前托盘状态。"
        : "复制下方配置到 Codex 后即可连接。",
  );
  root.querySelector<HTMLElement>("[data-role='codex-config']")?.classList.toggle("hidden", state.settings.codexMode === "off");
}

function syncSettingsForm(state: PublicState): void {
  const numberValues = {
    workMinutes: state.settings.workMinutes,
    breakMinutes: state.settings.breakMinutes,
    idleMinutes: state.settings.idleMinutes,
    retryMinutes: state.settings.retryMinutes,
  };
  for (const [name, value] of Object.entries(numberValues)) {
    const input = root.querySelector<HTMLInputElement>(`input[name='${name}']`);
    if (input && document.activeElement !== input) input.value = String(value);
  }

  const reminderMode = root.querySelector<HTMLSelectElement>("select[name='reminderMode']");
  if (reminderMode && document.activeElement !== reminderMode) {
    reminderMode.value = state.settings.reminderMode;
  }
  const codexMode = root.querySelector<HTMLSelectElement>("#codex-mode");
  if (codexMode && document.activeElement !== codexMode) codexMode.value = state.settings.codexMode;

  for (const name of ["sound", "launchAtLogin", "suppressPopupFullscreen"] as const) {
    const input = root.querySelector<HTMLInputElement>(`input[name='${name}']`);
    if (input && document.activeElement !== input) input.checked = state.settings[name];
  }
}

function updateBreak(state: PublicState): void {
  setText("break-time", formatClock(state.breakRemainingSeconds));
  const ring = root.querySelector<HTMLElement>("[data-ring='break']");
  ring?.style.setProperty("--progress", `${Math.min(100, (state.breakElapsedSeconds / (state.settings.breakMinutes * 60)) * 100)}%`);
  const suggestions = [
    "慢慢转动肩膀，放松颈部。",
    "站起来喝口水，让双腿活动起来。",
    "看向远处，让眼睛从屏幕上休息一下。",
    "做几次深呼吸，伸展背部和手腕。",
  ];
  setText("movement-tip", suggestions[Math.floor(state.breakElapsedSeconds / 45) % suggestions.length] ?? suggestions[0]!);
}

function getStatusCopy(state: PublicState) {
  if (state.status === "break_due") return { label: "该活动了", headline: "身体也需要一次保存", description: "站起来走动几分钟，让下一段专注更轻松。" };
  if (state.status === "break_active") return { label: "活动中", headline: "很好，保持舒展", description: "活动完成后会自动开始下一轮计时。" };
  if (state.status === "paused") return { label: "已暂停", headline: "提醒暂时安静了", description: state.pauseUntil ? `将在 ${new Date(state.pauseUntil).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 自动恢复。` : "准备好后可以随时恢复。" };
  if (state.status === "locked") return { label: "已锁屏", headline: "正在判断离座时间", description: "超过空闲阈值后，回来会自动开始新一轮。" };
  return { label: "专注中", headline: "保持节奏，也照顾身体", description: "下一次活动提醒会在合适的时候出现。" };
}

function statCard(label: string, key: string, value: string, icon: string): string {
  return `<article class="stat-card"><span class="stat-icon ${icon}" aria-hidden="true"></span><div><small>${label}</small><strong data-text="${key}">${value}</strong></div></article>`;
}

function numberField(name: string, label: string, value: number, suffix: string, min: number, max: number): string {
  return `<label class="number-field"><span>${label}</span><div><input name="${name}" type="number" value="${value}" min="${min}" max="${max}"/><small>${suffix}</small></div></label>`;
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`;
}

function toggle(name: string, title: string, description: string, checked: boolean, disabled = false): string {
  return `<label class="toggle-row ${disabled ? "disabled" : ""}"><div><strong>${title}</strong><small>${description}</small></div><input name="${name}" type="checkbox" ${checked ? "checked" : ""} ${disabled ? "disabled" : ""}/><span class="toggle-control"></span></label>`;
}

function setText(key: string, value: string): void {
  const element = root.querySelector<HTMLElement>(`[data-text='${key}']`);
  if (element) element.textContent = value;
}

function formatClock(seconds: number): string {
  const safe = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function formatMinutes(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  return `${Math.floor(minutes / 60)}小时 ${minutes % 60}分`;
}
