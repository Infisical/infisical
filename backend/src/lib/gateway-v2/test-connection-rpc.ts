import http from "node:http";

import { logger } from "@app/lib/logger";

export type TestConnectionResponse = { ok: true; status: number } | { ok: false; status: number; errorMessage: string };

export const TEST_CONNECTION_RPC_TIMEOUT_MS = 60_000;

const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;

// calls the gateway's /v1/test-connection handler over the local relay proxy with an opaque request body
export const callTestConnection = (args: {
  port: number;
  body: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TestConnectionResponse> => {
  const payload = JSON.stringify({ ...args.body, timeoutMs: args.timeoutMs });
  return new Promise<TestConnectionResponse>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: args.port,
        path: "/v1/test-connection",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          Connection: "close"
        },
        timeout: TEST_CONNECTION_RPC_TIMEOUT_MS,
        signal: args.signal
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RPC_RESPONSE_BYTES) {
            res.destroy(new Error(`Test connection response exceeded ${MAX_RPC_RESPONSE_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          const errEnv = (() => {
            try {
              return (JSON.parse(text) as { error?: { message?: string } }).error;
            } catch {
              return undefined;
            }
          })();
          if (status >= 200 && status < 300) {
            resolve({ ok: true, status });
            return;
          }
          resolve({ ok: false, status, errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}` });
        });
        res.on("error", (err) => {
          logger.warn({ err }, `Test connection RPC response stream error [port=${args.port}]`);
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Test connection RPC timed out after ${TEST_CONNECTION_RPC_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `Test connection RPC request error [port=${args.port}]`);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
};
