import { postGatewayRpc } from "./gateway-rpc";
import { SshExecCredentials } from "./ssh-rpc";
import { GatewayFailureKind } from "./test-connection-rpc";

const CERTIFICATE_SCAN_RPC_TIMEOUT_MS = 12 * 60 * 1000;

const MAX_CERTIFICATE_SCAN_RESPONSE_BYTES = 16 * 1024 * 1024;

export enum CertificateScanRpcStatus {
  Busy = 503,
  Timeout = 504
}

export type TCertificateScanRequest = {
  searchFolderPaths: string[];
  skipFolderPaths: string[];
  maxFolderDepth: number;
  maxFileSizeBytes: number;
  filePaths: string[];
  keystorePasswords: { path: string; password: string }[];
};

export type TCertificateScanRpcFailure = {
  ok: false;
  status: number;
  kind: GatewayFailureKind | null;
  detail: string;
};

export const callCertificateScan = async (args: {
  port: number;
  credentials: SshExecCredentials;
  request: TCertificateScanRequest;
}): Promise<{ ok: true; result: unknown } | TCertificateScanRpcFailure> => {
  const { status, text } = await postGatewayRpc({
    port: args.port,
    path: "/v1/scan-certificates",
    payload: JSON.stringify({ ...args.credentials, ...args.request }),
    timeoutMs: CERTIFICATE_SCAN_RPC_TIMEOUT_MS,
    maxResponseBytes: MAX_CERTIFICATE_SCAN_RESPONSE_BYTES,
    label: "Certificate scan"
  });

  if (status >= 200 && status < 300) return { ok: true, result: (JSON.parse(text) as { result?: unknown }).result };

  const error = (() => {
    try {
      return (JSON.parse(text) as { error?: { message?: string; kind?: GatewayFailureKind } }).error;
    } catch {
      return undefined;
    }
  })();
  return { ok: false, status, kind: error?.kind ?? null, detail: error?.message ?? `HTTP ${status}` };
};
