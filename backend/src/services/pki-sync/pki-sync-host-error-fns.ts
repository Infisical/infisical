import RE2 from "re2";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { logger } from "@app/lib/logger";

const UNREACHABLE_PATTERN = new RE2(
  "failed to connect|connection refused|no such host|i/o timeout|dial tcp|EHOSTUNREACH|ETIMEDOUT|ENOTFOUND|getaddrinfo",
  "i"
);

export const resolveGatewayLabel = async (
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getGatewayById"> | undefined,
  gatewayId: string | null | undefined
): Promise<string | undefined> => {
  if (!gatewayV2Service || !gatewayId) return undefined;

  try {
    const gateway = await gatewayV2Service.getGatewayById({ gatewayId });
    return gateway?.name;
  } catch (err) {
    logger.warn({ err }, `Unable to read the Gateway name for an unreachable host [gatewayId=${gatewayId}]`);
    return undefined;
  }
};

export const PKI_SYNC_REACHABILITY_PROBE_TIMEOUT_MS = 12_000;

export class HostProbeTimeoutError extends Error {}

export const withReachabilityDeadline = async <T>(probe: () => Promise<T>): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      probe(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new HostProbeTimeoutError("Reachability probe deadline exceeded")),
          PKI_SYNC_REACHABILITY_PROBE_TIMEOUT_MS
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export const describeHostFailure = ({
  error,
  host,
  gatewayLabel,
  transport
}: {
  error: unknown;
  host: string | undefined;
  gatewayLabel: string | undefined;
  transport: "WinRM" | "SSH";
}): string => {
  const message = (error as Error)?.message ?? "Unknown error";
  const isUnreachable = error instanceof HostProbeTimeoutError || UNREACHABLE_PATTERN.test(message);
  if (!host || !isUnreachable) return message;

  const via = gatewayLabel ? ` from Gateway "${gatewayLabel}"` : " from the Gateway assigned to this connection";
  return `Could not reach the target host "${host}" over ${transport}${via}. Check that the Gateway can resolve and reach it, and that the ${transport} service is listening.`;
};
