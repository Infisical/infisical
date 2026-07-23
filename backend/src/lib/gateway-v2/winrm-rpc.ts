import http from "node:http";

import { logger } from "@app/lib/logger";

export enum WinRmRpcEndpoint {
  Test = "/v1/test-connection",
  DeliverFiles = "/v1/deliver-files",
  RemoveFiles = "/v1/remove-files",
  EnumerateAccounts = "/v1/enumerate-accounts",
  EnumerateDependencies = "/v1/enumerate-dependencies",
  RotateCredential = "/v1/rotate-credential",
  SyncDependency = "/v1/sync-dependency",
  ValidateCredential = "/v1/validate-credential"
}

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

// Must exceed the gateway's own connection deadline (op 120s + 15s flush margin) so a gateway-side timeout
// surfaces as its structured error rather than an opaque client timeout.
export const WINRM_RPC_TIMEOUT_MS = 150_000;

const MAX_WINRM_RPC_RESPONSE_BYTES = 1024 * 1024;

export const callWinRmEndpoint = async <T>(args: {
  port: number;
  endpoint: WinRmRpcEndpoint;
  body: WinRmRpcRequestBody;
}): Promise<WinRmRpcResponse<T>> => {
  const payload = JSON.stringify(args.body);
  return new Promise<WinRmRpcResponse<T>>((resolve, reject) => {
    let settled = false;
    let deadlineTimer: NodeJS.Timeout;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      run();
    };

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
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_WINRM_RPC_RESPONSE_BYTES) {
            req.destroy();
            finish(() =>
              resolve({
                ok: false,
                status: res.statusCode ?? 0,
                errorMessage: `Gateway response exceeded ${MAX_WINRM_RPC_RESPONSE_BYTES} bytes`
              })
            );
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (!text) {
            finish(() =>
              resolve({ ok: false, status, errorMessage: `Empty response body from Gateway (status ${status})` })
            );
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            finish(() =>
              resolve({
                ok: false,
                status,
                errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}`
              })
            );
            return;
          }
          if (status >= 200 && status < 300) {
            const { result } = parsed as { result?: T };
            if (result === undefined) {
              finish(() => resolve({ ok: false, status, errorMessage: "Gateway response missing `result` field" }));
              return;
            }
            finish(() => resolve({ ok: true, status, result }));
            return;
          }
          const errEnv = (parsed as { error?: { message?: string } }).error;
          finish(() =>
            resolve({ ok: false, status, errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}` })
          );
        });
        res.on("error", (err) => {
          logger.warn({ err }, `WinRM RPC response stream error [port=${args.port}]`);
          finish(() => reject(err));
        });
      }
    );
    // The socket `timeout` above resets on every byte, so a slow but steady stream never trips it.
    // This timer caps total wall-clock regardless of activity.
    deadlineTimer = setTimeout(() => {
      req.destroy(new Error(`WinRM RPC exceeded the ${WINRM_RPC_TIMEOUT_MS}ms deadline`));
    }, WINRM_RPC_TIMEOUT_MS);
    req.on("timeout", () => {
      req.destroy(new Error(`WinRM RPC timed out after ${WINRM_RPC_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `WinRM RPC request error [port=${args.port}]`);
      finish(() => reject(err));
    });
    req.write(payload);
    req.end();
  });
};
