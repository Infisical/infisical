import http from "node:http";

import { logger } from "@app/lib/logger";

export type SshExecCredentials = {
  authMethod: string;
  username: string;
  password?: string;
  privateKey?: string;
  certificate?: string;
};

export type SshExecResult = { stdout: string; stderr: string; exitCode: number };

export type SshExecSuccess = { ok: true; status: number; result: SshExecResult };
export type SshExecFailure = { ok: false; status: number; errorMessage: string };
export type SshExecResponse = SshExecSuccess | SshExecFailure;

export const SSH_EXEC_RPC_TIMEOUT_MS = 120_000;

const MAX_RPC_RESPONSE_BYTES = 16 * 1024 * 1024;

// calls the gateway's ssh-exec handler over the local relay proxy; the gateway performs the ssh login (any auth
// method, including certificates the node client can't present) and returns the command output
export const callSshExec = (args: {
  port: number;
  command: string;
  credentials: SshExecCredentials;
  timeoutMs: number;
}): Promise<SshExecResponse> => {
  const payload = JSON.stringify({ command: args.command, ...args.credentials, timeoutMs: args.timeoutMs });
  return new Promise<SshExecResponse>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: args.port,
        path: "/v1/exec",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          Connection: "close"
        },
        timeout: SSH_EXEC_RPC_TIMEOUT_MS
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RPC_RESPONSE_BYTES) {
            res.destroy(new Error(`SSH exec response exceeded ${MAX_RPC_RESPONSE_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (!text) {
            resolve({ ok: false, status, errorMessage: `Empty response from gateway (status ${status})` });
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            resolve({ ok: false, status, errorMessage: `Malformed response from gateway: ${text.slice(0, 256)}` });
            return;
          }
          if (status >= 200 && status < 300) {
            const { result } = parsed as { result?: SshExecResult };
            if (!result) {
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
          logger.warn({ err }, `SSH exec RPC response stream error [port=${args.port}]`);
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`SSH exec RPC timed out after ${SSH_EXEC_RPC_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `SSH exec RPC request error [port=${args.port}]`);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
};

// calls the gateway's port-sweep handler over the local relay proxy; the gateway TCP-probes every target
// in-network and returns the reachable "host:port" set, so a scan can filter a whole CIDR to live hosts
export const callPortSweep = (args: {
  port: number;
  targets: string[];
  dialTimeoutMs: number;
  responseTimeoutMs: number;
}): Promise<Set<string>> => {
  const payload = JSON.stringify({ targets: args.targets, timeoutMs: args.dialTimeoutMs });
  return new Promise<Set<string>>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: args.port,
        path: "/v1/sweep",
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          Connection: "close"
        },
        timeout: args.responseTimeoutMs
      },
      (res) => {
        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RPC_RESPONSE_BYTES) {
            res.destroy(new Error(`Port sweep response exceeded ${MAX_RPC_RESPONSE_BYTES} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          const text = Buffer.concat(chunks).toString("utf8");
          if (status < 200 || status >= 300) {
            const errEnv = (() => {
              try {
                return (JSON.parse(text) as { error?: { message?: string } }).error;
              } catch {
                return undefined;
              }
            })();
            reject(new Error(errEnv?.message ?? `Port sweep returned HTTP ${status}`));
            return;
          }
          try {
            const parsed = JSON.parse(text) as { open?: string[] };
            resolve(new Set(parsed.open ?? []));
          } catch {
            reject(new Error("Invalid port sweep response"));
          }
        });
        res.on("error", reject);
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`Port sweep timed out after ${args.responseTimeoutMs}ms`));
    });
    req.on("error", reject);
    req.write(payload);
    req.end();
  });
};
