import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import type { Server } from "node:net";
import { callBridge, PIPE_NAME, startBridgeServer } from "./bridge";

let server: Server | null = null;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

describe("local bridge", () => {
  it("round-trips an authenticated request", async () => {
    const pipeName = `${PIPE_NAME}-test-${process.pid}-${randomUUID()}`;
    server = startBridgeServer(
      "test-token",
      async (method, params) => ({ method, params }),
      undefined,
      pipeName,
    );
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
    await expect(callBridge("test-token", "get_status", { sample: true }, pipeName)).resolves.toEqual({
      method: "get_status",
      params: { sample: true },
    });
  });

  it("rejects an invalid token", async () => {
    const pipeName = `${PIPE_NAME}-test-${process.pid}-${randomUUID()}`;
    server = startBridgeServer(
      "correct-token",
      async () => ({ ok: true }),
      undefined,
      pipeName,
    );
    await new Promise<void>((resolve) => server!.once("listening", () => resolve()));
    await expect(callBridge("wrong-token", "get_status", undefined, pipeName)).rejects.toThrow(
      "未授权",
    );
  });
});
