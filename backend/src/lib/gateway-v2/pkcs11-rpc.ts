import { postGatewayRpc } from "./gateway-rpc";

export type Pkcs11RpcEndpoint =
  | "/v1/test"
  | "/v1/generate-key-pair"
  | "/v1/sign"
  | "/v1/get-public-key"
  | "/v1/find-keys";

export enum Pkcs11ErrorCode {
  KeyNotFound = "key_not_found",
  KeyAmbiguous = "key_ambiguous",
  KeyTypeMismatch = "key_type_mismatch",
  SignatureMismatch = "signature_mismatch",
  MechanismInvalid = "mechanism_invalid",
  BadRequest = "bad_request",
  Internal = "internal",
  DriverUnavailable = "driver_unavailable",
  GatewayTimeout = "gateway_timeout",
  NotSupported = "pkcs11_not_supported",
  UnsupportedGatewayVersion = "unsupported_gateway_version",
  GatewayUnreachable = "gateway_unreachable",
  GatewayNotFound = "gateway_not_found"
}

export const isPkcs11Error = (err: unknown, code: Pkcs11ErrorCode) =>
  err instanceof Error && err.message.includes(`(${code})`);

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

  if (status === 404) {
    return {
      ok: false,
      status,
      errorCode: Pkcs11ErrorCode.UnsupportedGatewayVersion,
      errorMessage: "This gateway version does not support this operation. Update the gateway to the latest version."
    };
  }
  if (!text) {
    return {
      ok: false,
      status,
      errorCode: Pkcs11ErrorCode.Internal,
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
      errorCode: Pkcs11ErrorCode.Internal,
      errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}`
    };
  }
  if (status >= 200 && status < 300) {
    const { result } = parsed as { result?: T };
    if (result === undefined) {
      return {
        ok: false,
        status,
        errorCode: Pkcs11ErrorCode.Internal,
        errorMessage: "Gateway response missing `result` field"
      };
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
    case Pkcs11ErrorCode.DriverUnavailable:
    case Pkcs11ErrorCode.GatewayTimeout:
    case Pkcs11ErrorCode.NotSupported:
    case Pkcs11ErrorCode.UnsupportedGatewayVersion:
      return true;
    default:
      return false;
  }
};
