import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import { callBridge } from "../main/bridge";
import type { PublicState, Settings } from "../shared/types";

type TokenProvider = () => string;

export async function runMcpServer(getToken: TokenProvider): Promise<void> {
  const server = new McpServer(
    { name: "standup-reminder", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const textResult = (value: unknown) => ({
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  });

  const safeCall = async (method: string, params?: unknown) => {
    try {
      return textResult(await callBridge(getToken(), method, params));
    } catch (error) {
      return {
        content: [
          {
            type: "text" as const,
            text: error instanceof Error ? error.message : "起身提醒连接失败",
          },
        ],
        isError: true,
      };
    }
  };

  server.registerTool(
    "get_status",
    { title: "查看久坐提醒状态", description: "查询托盘应用的唯一实时状态和剩余时间。" },
    async () => safeCall("get_status"),
  );

  server.registerTool(
    "start_break",
    { title: "开始活动", description: "在托盘应用中开始活动倒计时。" },
    async () => safeCall("start_break"),
  );

  server.registerTool(
    "snooze_reminder",
    { title: "延后提醒", description: "按应用设置延后下一次提醒。" },
    async () => safeCall("snooze"),
  );

  server.registerTool(
    "pause_reminders",
    {
      title: "暂停提醒",
      description: "暂停指定分钟；省略分钟数表示暂停到手动恢复。",
      inputSchema: z.object({ minutes: z.number().int().min(1).max(480).nullable().optional() }),
    },
    async ({ minutes }) => safeCall("pause", { minutes: minutes ?? null }),
  );

  server.registerTool(
    "get_today_stats",
    { title: "查看今日统计", description: "读取托盘应用记录的今日电脑使用与活动统计。" },
    async () => safeCall("get_today_stats"),
  );

  server.registerTool(
    "get_daily_summary",
    {
      title: "生成今日活动总结",
      description: "在“按需总结”集成模式下，根据托盘应用数据生成今日摘要。",
    },
    async () => safeCall("get_daily_summary"),
  );

  server.registerTool(
    "update_settings",
    {
      title: "修改提醒设置",
      description: "修改久坐、活动或空闲确认分钟数。",
      inputSchema: z.object({
        workMinutes: z.number().int().min(10).max(180).optional(),
        breakMinutes: z.number().int().min(1).max(30).optional(),
        idleMinutes: z.number().int().min(1).max(30).optional(),
      }),
    },
    async (patch) => safeCall("update_settings", patch satisfies Partial<Settings>),
  );

  server.registerTool(
    "acknowledge_codex_reminder",
    {
      title: "确认 Codex 已提醒",
      description: "记录本次 Codex 提醒，避免状态检查任务反复发送相同提醒。",
    },
    async () => safeCall("acknowledge_codex_reminder"),
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

export function formatStateForCodex(state: PublicState): Record<string, unknown> {
  return {
    status: state.status,
    workElapsedMinutes: Math.floor(state.workElapsedSeconds / 60),
    workRemainingMinutes: Math.ceil(state.workRemainingSeconds / 60),
    breakRemainingMinutes: Math.ceil(state.breakRemainingSeconds / 60),
    pausedUntil: state.pauseUntil,
    today: state.stats,
  };
}
