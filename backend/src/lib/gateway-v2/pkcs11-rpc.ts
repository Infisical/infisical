import http from "node:http";

import { logger } from "@app/lib/logger";

export type Pkcs11RpcEndpoint = "/v1/test" | "/v1/generate-key-pair" | "/v1/sign" | "/v1/get-public-key";

export type Pkcs11RpcRequestBody = {
  slotLabel: string;
  pin: string;
  params: Record<string, unknown>;
};

export type Pkcs11RpcSuccess<T> = { ok: true; status: number; result: T };
export type Pkcs11RpcFailure = {
  ok: false;
  status: number;
  errorCode: string;
  errorMessage: string;
};
export type Pkcs11RpcResponse<T> = Pkcs11RpcSuccess<T> | Pkcs11RpcFailure;

export const PKCS11_RPC_TIMEOUT_MS = 30_000;

export const callPkcs11Endpoint = async <T>(args: {
  port: number;
  endpoint: Pkcs11RpcEndpoint;
  body: Pkcs11RpcRequestBody;
  timeoutMs?: number;
}): Promise<Pkcs11RpcResponse<T>> => {
  const payload = JSON.stringify(args.body);
  return new Promise<Pkcs11RpcResponse<T>>((resolve, reject) => {
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
        timeout: args.timeoutMs ?? PKCS11_RPC_TIMEOUT_MS
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (!text) {
            resolve({
              ok: false,
              status,
              errorCode: "internal",
              errorMessage: `Empty response body from Gateway (status ${status})`
            });
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            resolve({
              ok: false,
              status,
              errorCode: "internal",
              errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}`
            });
            return;
          }
          if (status >= 200 && status < 300) {
            const { result } = parsed as { result?: T };
            if (result === undefined) {
              resolve({
                ok: false,
                status,
                errorCode: "internal",
                errorMessage: "Gateway response missing `result` field"
              });
              return;
            }
            resolve({ ok: true, status, result });
            return;
          }
          const errEnv = (parsed as { error?: { code?: string; message?: string } }).error;
          resolve({
            ok: false,
            status,
            errorCode: errEnv?.code ?? "internal",
            errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}`
          });
        });
        res.on("error", (err) => {
          logger.warn({ err }, `PKCS#11 RPC response stream error [port=${args.port}]`);
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`PKCS#11 RPC timed out after ${args.timeoutMs ?? PKCS11_RPC_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `PKCS#11 RPC request error [port=${args.port}]`);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
};

export const isRetryablePkcs11RpcError = (failure: Pkcs11RpcFailure): boolean => {
  if (failure.status === 502 || failure.status === 503 || failure.status === 504) return true;
  switch (failure.errorCode) {
    case "driver_unavailable":
    case "gateway_timeout":
    case "pkcs11_not_supported":
      return true;
    default:
      return false;
  }
};
