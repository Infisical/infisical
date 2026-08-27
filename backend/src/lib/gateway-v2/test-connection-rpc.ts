import { postGatewayRpc } from "./gateway-rpc";

// The gateway classifies a probe failure at the source, where the driver error still exists. Older gateways
// send no kind, which the caller must treat as unclassified rather than as either outcome.
export type GatewayFailureKind = "auth" | "transport" | "unknown";

export type TestConnectionResponse =
  | { ok: true; status: number }
  | { ok: false; status: number; errorMessage: string; kind: GatewayFailureKind | null };

export const TEST_CONNECTION_RPC_TIMEOUT_MS = 60_000;

const MAX_RPC_RESPONSE_BYTES = 1024 * 1024;

// calls the gateway's /v1/test-connection handler with an opaque request body
export const callTestConnection = async (args: {
  port: number;
  body: Record<string, unknown>;
  timeoutMs: number;
  signal?: AbortSignal;
}): Promise<TestConnectionResponse> => {
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: "/v1/test-connection",
    payload: JSON.stringify({ ...args.body, timeoutMs: args.timeoutMs }),
    timeoutMs: TEST_CONNECTION_RPC_TIMEOUT_MS,
    maxResponseBytes: MAX_RPC_RESPONSE_BYTES,
    signal: args.signal,
    label: "Test connection"
  });

  if (status >= 200 && status < 300) return { ok: true, status };

  const errEnv = (() => {
    try {
      return (JSON.parse(text) as { error?: { message?: string; kind?: GatewayFailureKind } }).error;
    } catch {
      return undefined;
    }
  })();
  return {
    ok: false,
    status,
    errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}`,
    kind: errEnv?.kind ?? null
  };
};
