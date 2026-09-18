import http from "node:http";

import { logger } from "@app/lib/logger";

export type GatewayRpcRawResponse = { status: number; text: string };

// shared transport for the gateway RPCs sent over the local relay proxy
export const postGatewayRpc = (args: {
  port: number;
  path: string;
  payload: string;
  timeoutMs: number;
  deadlineMs?: number;
  maxResponseBytes?: number;
  signal?: AbortSignal;
  label: string;
}): Promise<GatewayRpcRawResponse> => {
  const { port, path, payload, timeoutMs, deadlineMs, maxResponseBytes, signal, label } = args;
  return new Promise<GatewayRpcRawResponse>((resolve, reject) => {
    let settled = false;
    let deadlineTimer: NodeJS.Timeout | undefined;
    const finish = (run: () => void) => {
      if (settled) return;
      settled = true;
      if (deadlineTimer) clearTimeout(deadlineTimer);
      run();
    };

    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          Connection: "close"
        },
        timeout: timeoutMs,
        signal
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (maxResponseBytes !== undefined && received > maxResponseBytes) {
            req.destroy();
            finish(() => reject(new Error(`${label} RPC response exceeded ${maxResponseBytes} bytes`)));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          finish(() => resolve({ status: res.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }))
        );
        res.on("error", (err) => {
          logger.warn({ err }, `${label} RPC response stream error [port=${port}]`);
          finish(() => reject(err));
        });
      }
    );

    if (deadlineMs !== undefined) {
      deadlineTimer = setTimeout(() => {
        req.destroy(new Error(`${label} RPC exceeded the ${deadlineMs}ms deadline`));
      }, deadlineMs);
    }
    req.on("timeout", () => {
      req.destroy(new Error(`${label} RPC timed out after ${timeoutMs}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `${label} RPC request error [port=${port}]`);
      finish(() => reject(err));
    });
    req.write(payload);
    req.end();
  });
};
