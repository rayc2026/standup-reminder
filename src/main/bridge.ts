import { createServer, createConnection, type Server } from "node:net";
import { randomUUID } from "node:crypto";

export const PIPE_NAME = "\\\\.\\pipe\\codex-standup-reminder-v1";

interface BridgeRequest {
  id: string;
  token: string;
  method: string;
  params?: unknown;
}

interface BridgeResponse {
  id: string;
  result?: unknown;
  error?: string;
}

export type BridgeHandler = (method: string, params: unknown) => Promise<unknown>;

export function startBridgeServer(
  token: string,
  handler: BridgeHandler,
  onConnection?: () => void,
  pipeName = PIPE_NAME,
): Server {
  const server = createServer((socket) => {
    onConnection?.();
    socket.setEncoding("utf8");
    let buffer = "";
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      void handleLine(line);
    });

    const handleLine = async (line: string) => {
      let request: BridgeRequest | null = null;
      try {
        request = JSON.parse(line) as BridgeRequest;
        if (!request.id || request.token !== token || !request.method) {
          throw new Error("未授权的本地连接");
        }
        const result = await handler(request.method, request.params);
        socket.end(`${JSON.stringify({ id: request.id, result } satisfies BridgeResponse)}\n`);
      } catch (error) {
        socket.end(
          `${JSON.stringify({
            id: request?.id ?? "unknown",
            error: error instanceof Error ? error.message : "本地连接失败",
          } satisfies BridgeResponse)}\n`,
        );
      }
    };
  });
  server.listen(pipeName);
  return server;
}

export function callBridge<T>(
  token: string,
  method: string,
  params?: unknown,
  pipeName = PIPE_NAME,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = randomUUID();
    const socket = createConnection(pipeName);
    let buffer = "";
    const timeout = setTimeout(() => {
      socket.destroy();
      reject(new Error("起身提醒应用没有响应"));
    }, 3_000);

    socket.setEncoding("utf8");
    socket.on("connect", () => {
      socket.write(`${JSON.stringify({ id, token, method, params } satisfies BridgeRequest)}\n`);
    });
    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const newline = buffer.indexOf("\n");
      if (newline < 0) return;
      clearTimeout(timeout);
      const response = JSON.parse(buffer.slice(0, newline)) as BridgeResponse;
      socket.end();
      if (response.error) reject(new Error(response.error));
      else resolve(response.result as T);
    });
    socket.on("error", () => {
      clearTimeout(timeout);
      reject(new Error("起身提醒未运行或 Codex 集成未开启"));
    });
  });
}
