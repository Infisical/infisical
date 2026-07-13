import http from "node:http";

import { logger } from "@app/lib/logger";

export type WinRmRpcEndpoint = "/v1/test" | "/v1/deliver" | "/v1/remove";

export type WinRmTransportParams = {
  useHttps?: boolean;
  insecure?: boolean;
  caCertificate?: string;
};

export type WinRmDeliverFile = {
  path: string;
  contentBase64: string;
};

export type WinRmRpcRequestBody = {
  username: string;
  password: string;
  params?: Record<string, unknown>;
};

export type WinRmTestResult = { ok: boolean };
export type WinRmDeliverResult = { delivered: number };
export type WinRmRemoveResult = { removed: number };

export type WinRmRpcSuccess<T> = { ok: true; status: number; result: T };
export type WinRmRpcFailure = { ok: false; status: number; errorMessage: string };
export type WinRmRpcResponse<T> = WinRmRpcSuccess<T> | WinRmRpcFailure;

// A WinRM session sets up NTLM and runs one or more PowerShell commands per file,
// each of which can take a few seconds on a loaded host, so allow a generous ceiling.
// This must exceed the gateway's own connection deadline (op 120s + 15s flush margin) so a
// gateway-side timeout surfaces as its structured error rather than an opaque client timeout.
export const WINRM_RPC_TIMEOUT_MS = 150_000;

export const callWinRmEndpoint = async <T>(args: {
  port: number;
  endpoint: WinRmRpcEndpoint;
  body: WinRmRpcRequestBody;
}): Promise<WinRmRpcResponse<T>> => {
  const payload = JSON.stringify(args.body);
  return new Promise<WinRmRpcResponse<T>>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: args.port,
        path: args.endpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          Connection: "close"
        },
        timeout: WINRM_RPC_TIMEOUT_MS
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (!text) {
            resolve({ ok: false, status, errorMessage: `Empty response body from Gateway (status ${status})` });
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            resolve({ ok: false, status, errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}` });
            return;
          }
          if (status >= 200 && status < 300) {
            const { result } = parsed as { result?: T };
            if (result === undefined) {
              resolve({ ok: false, status, errorMessage: "Gateway response missing `result` field" });
              return;
            }
            resolve({ ok: true, status, result });
            return;
          }
          const errEnv = (parsed as { error?: { message?: string } }).error;
          resolve({ ok: false, status, errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}` });
        });
        res.on("error", (err) => {
          logger.warn({ err }, `WinRM RPC response stream error [port=${args.port}]`);
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`WinRM RPC timed out after ${WINRM_RPC_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `WinRM RPC request error [port=${args.port}]`);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
};
