import { postGatewayRpc } from "./gateway-rpc";

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
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: args.endpoint,
    payload: JSON.stringify(args.body),
    timeoutMs: WINRM_RPC_TIMEOUT_MS,
    deadlineMs: WINRM_RPC_TIMEOUT_MS,
    maxResponseBytes: MAX_WINRM_RPC_RESPONSE_BYTES,
    label: "WinRM"
  });

  if (!text) {
    return { ok: false, status, errorMessage: `Empty response body from Gateway (status ${status})` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, status, errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}` };
  }
  if (status >= 200 && status < 300) {
    const { result } = parsed as { result?: T };
    if (result === undefined) {
      return { ok: false, status, errorMessage: "Gateway response missing `result` field" };
    }
    return { ok: true, status, result };
  }
  const errEnv = (parsed as { error?: { message?: string } }).error;
  return { ok: false, status, errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}` };
};
