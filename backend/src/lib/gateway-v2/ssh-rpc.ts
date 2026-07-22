import { postGatewayRpc } from "./gateway-rpc";

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
export const callSshExec = async (args: {
  port: number;
  command: string;
  credentials: SshExecCredentials;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<SshExecResponse> => {
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: "/v1/exec",
    payload: JSON.stringify({ command: args.command, ...args.credentials, timeoutMs: args.timeoutMs }),
    timeoutMs: SSH_EXEC_RPC_TIMEOUT_MS,
    maxResponseBytes: MAX_RPC_RESPONSE_BYTES,
    signal: args.signal,
    label: "SSH exec"
  });

  if (!text) return { ok: false, status, errorMessage: `Empty response from gateway (status ${status})` };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status, errorMessage: `Malformed response from gateway: ${text.slice(0, 256)}` };
  }
  if (status >= 200 && status < 300) {
    const { result } = parsed as { result?: SshExecResult };
    if (!result) return { ok: false, status, errorMessage: "Gateway response missing `result` field" };
    return { ok: true, status, result };
  }
  const errEnv = (parsed as { error?: { message?: string } }).error;
  return { ok: false, status, errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}` };
};

// calls the gateway's port-sweep handler over the local relay proxy; the gateway TCP-probes every target
// in-network and returns the reachable "host:port" set, so a scan can filter a whole CIDR to live hosts
export const callPortSweep = async (args: {
  port: number;
  targets: string[];
  dialTimeoutMs: number;
  responseTimeoutMs: number;
  signal?: AbortSignal;
}): Promise<Set<string>> => {
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: "/v1/sweep",
    payload: JSON.stringify({ targets: args.targets, timeoutMs: args.dialTimeoutMs }),
    timeoutMs: args.responseTimeoutMs,
    maxResponseBytes: MAX_RPC_RESPONSE_BYTES,
    signal: args.signal,
    label: "Port sweep"
  });

  if (status < 200 || status >= 300) {
    const errEnv = (() => {
      try {
        return (JSON.parse(text) as { error?: { message?: string } }).error;
      } catch {
        return undefined;
      }
    })();
    throw new Error(errEnv?.message ?? `Port sweep returned HTTP ${status}`);
  }
  try {
    const parsed = JSON.parse(text) as { open?: string[] };
    return new Set(parsed.open ?? []);
  } catch {
    throw new Error("Invalid port sweep response");
  }
};
