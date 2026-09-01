import { postGatewayRpc } from "./gateway-rpc";

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
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: args.endpoint,
    payload: JSON.stringify(args.body),
    timeoutMs: args.timeoutMs ?? PKCS11_RPC_TIMEOUT_MS,
    label: "PKCS#11"
  });

  if (!text) {
    return {
      ok: false,
      status,
      errorCode: "internal",
      errorMessage: `Empty response body from Gateway (status ${status})`
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return {
      ok: false,
      status,
      errorCode: "internal",
      errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}`
    };
  }
  if (status >= 200 && status < 300) {
    const { result } = parsed as { result?: T };
    if (result === undefined) {
      return { ok: false, status, errorCode: "internal", errorMessage: "Gateway response missing `result` field" };
    }
    return { ok: true, status, result };
  }
  const errEnv = (parsed as { error?: { code?: string; message?: string } }).error;
  return {
    ok: false,
    status,
    errorCode: errEnv?.code ?? "internal",
    errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}`
  };
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
