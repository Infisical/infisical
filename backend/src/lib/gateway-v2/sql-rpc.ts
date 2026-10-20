import { postGatewayRpc } from "./gateway-rpc";
import { GatewayFailureKind } from "./test-connection-rpc";

const SQL_RPC_TIMEOUT_MS = 60_000;

const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;

export type TSqlRpcResponse = { ok: true } | { ok: false; errorMessage: string; kind: GatewayFailureKind | null };

export const callSqlRotateCredential = async (args: {
  port: number;
  body: Record<string, unknown>;
  timeoutMs: number;
}): Promise<TSqlRpcResponse> => {
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: "/v1/rotate-credential",
    payload: JSON.stringify({ ...args.body, timeoutMs: args.timeoutMs }),
    timeoutMs: SQL_RPC_TIMEOUT_MS,
    maxResponseBytes: MAX_RPC_RESPONSE_BYTES,
    label: "SQL rotation"
  });

  if (status >= 200 && status < 300) return { ok: true };

  const errEnv = (() => {
    try {
      return (JSON.parse(text) as { error?: { message?: string; kind?: GatewayFailureKind } }).error;
    } catch {
      return undefined;
    }
  })();
  return {
    ok: false,
    errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}`,
    kind: errEnv?.kind ?? null
  };
};
