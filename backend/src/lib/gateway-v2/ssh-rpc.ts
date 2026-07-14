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
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
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
