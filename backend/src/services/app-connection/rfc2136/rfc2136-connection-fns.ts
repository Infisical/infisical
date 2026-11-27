import net from "net";

import { RuleViolationError } from "@app/domains/lib/errors";
import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { isBase64 } from "@app/lib/base64";
import {
  createDnsUpdateClient,
  DnsRcode,
  DnsUpdateError,
  DnsUpdateErrorReason,
  MAX_DNS_MESSAGE_LENGTH,
  TDnsTransport,
  TDnsUpdateClient,
  TsigError
} from "@app/lib/dns-update";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { getMissingGatewayMessage } from "@app/lib/gateway-v2/gateway-errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { Rfc2136ConnectionMethod } from "./rfc2136-connection-enums";
import { TRfc2136Connection, TRfc2136ConnectionConfig } from "./rfc2136-connection-types";

export const RFC2136_REQUEST_TIMEOUT_MS = 10_000;
const LOOPBACK_HOST = "127.0.0.1";

export type TRfc2136GatewayDeps = {
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

type TRfc2136ClientTarget = Pick<TRfc2136Connection, "credentials" | "gatewayId" | "gatewayPoolId">;

export const getRfc2136ConnectionListItem = () => {
  return {
    name: "DNS Server (RFC 2136)" as const,
    app: AppConnection.Rfc2136 as const,
    methods: Object.values(Rfc2136ConnectionMethod) as [Rfc2136ConnectionMethod.TsigKey]
  };
};

// One DNS message over TCP: a 2-byte length prefix each way (RFC 1035 §4.2.2), then the connection is closed.
const createTcpTransport =
  ({ host, port, abortSignal }: { host: string; port: number; abortSignal?: AbortSignal }): TDnsTransport =>
  (message) =>
    new Promise<Buffer>((resolve, reject) => {
      let received = Buffer.alloc(0);
      let settled = false;
      let onAbort = () => {};
      const socket = net.connect({ host, port });

      // socket.setTimeout only catches silence, so a server trickling bytes needs a fixed deadline too
      let deadline: NodeJS.Timeout | undefined;

      const finish = (error: Error | null, reply?: Buffer) => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        abortSignal?.removeEventListener("abort", onAbort);
        socket.destroy();
        if (error) reject(error);
        else resolve(reply as Buffer);
      };

      onAbort = () => finish(new Error("the request was cancelled"));

      if (abortSignal?.aborted) {
        onAbort();
        return;
      }
      abortSignal?.addEventListener("abort", onAbort);

      const onTimeout = () => finish(new Error("the DNS server did not answer in time"));
      deadline = setTimeout(onTimeout, RFC2136_REQUEST_TIMEOUT_MS);
      socket.setTimeout(RFC2136_REQUEST_TIMEOUT_MS, onTimeout);
      socket.on("connect", () => {
        const length = Buffer.alloc(2);
        length.writeUInt16BE(message.length, 0);
        socket.write(Buffer.concat([length, message]));
      });
      socket.on("data", (chunk: Buffer) => {
        received = Buffer.concat([received, chunk]);
        if (received.length > MAX_DNS_MESSAGE_LENGTH + 2) {
          finish(new Error("the DNS server sent a reply larger than a DNS message can be"));
          return;
        }
        if (received.length >= 2 && received.length >= 2 + received.readUInt16BE(0)) {
          finish(null, received.subarray(2, 2 + received.readUInt16BE(0)));
        }
      });
      socket.on("error", (error: NodeJS.ErrnoException) =>
        finish(new Error(`could not connect to the DNS server (${error.code ?? error.message})`))
      );
      socket.on("close", () => finish(new Error("the DNS server closed the connection without answering")));
    });

// Runs the operation with a client whose every message goes directly to the server or through one Gateway proxy.
export const executeWithRfc2136Client = async <T>(
  connection: TRfc2136ClientTarget,
  { gatewayV2Service, gatewayPoolService }: TRfc2136GatewayDeps,
  operation: (client: TDnsUpdateClient) => Promise<T>,
  abortSignal?: AbortSignal
): Promise<T> => {
  const { credentials, gatewayId: directGatewayId, gatewayPoolId } = connection;
  const key = {
    name: credentials.tsigKeyName,
    algorithm: credentials.tsigAlgorithm,
    secret: Buffer.from(credentials.tsigSecret, "base64")
  };

  if (gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({
      message: "This DNS Server (RFC 2136) connection uses a Gateway pool, which is not supported on this operation"
    });
  }

  const gatewayId =
    gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({ gatewayId: directGatewayId, gatewayPoolId })
      : directGatewayId;

  if (!gatewayId) {
    // Dial the address that passed the private-IP check, so a second DNS lookup cannot point somewhere else.
    const [address] = await verifyHostInputValidity({
      host: credentials.host,
      isGateway: false,
      isDynamicSecret: false
    });
    const transport = createTcpTransport({ host: address, port: credentials.port, abortSignal });
    return operation(createDnsUpdateClient({ transport, key }));
  }

  if (!gatewayV2Service) {
    throw new BadRequestError({
      message: "This DNS Server (RFC 2136) connection uses a Gateway, which is not supported on this operation"
    });
  }

  const [targetHost] = await verifyHostInputValidity({
    host: credentials.host,
    isGateway: true,
    isDynamicSecret: false
  });
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: credentials.port
  });

  // Falling through to the direct path would bypass the gateway the connection is pinned to.
  if (!platformConnectionDetails) {
    throw new NotFoundError({ message: getMissingGatewayMessage(gatewayId) });
  }

  return withGatewayV2Proxy(
    (proxyPort) => {
      const transport = createTcpTransport({ host: LOOPBACK_HOST, port: proxyPort, abortSignal });
      return operation(createDnsUpdateClient({ transport, key }));
    },
    { protocol: GatewayProxyProtocol.Tcp, ...platformConnectionDetails }
  );
};

const RCODE_MESSAGES: Partial<Record<DnsRcode, string>> = {
  [DnsRcode.FormErr]: "the DNS server could not parse the update request",
  [DnsRcode.ServFail]: "the DNS server failed to process the request",
  [DnsRcode.NotImp]: "the DNS server does not accept dynamic updates",
  // Servers reuse REFUSED and NOTAUTH for several causes (PowerDNS for a wrong secret or clock, Knot for an unknown
  // key or an ACL denial), so these name every cause rather than guess one
  [DnsRcode.Refused]:
    "the DNS server refused the update. Possible causes: wrong key name, secret or algorithm; the server's clock is more than 5 minutes off; the key isn't allowed to update this name; the server doesn't accept updates from Infisical's address; or Host isn't the zone's primary server",
  [DnsRcode.NotAuth]:
    "the DNS server did not accept the update for this zone. Possible causes: wrong zone; wrong key name or algorithm; or the key isn't allowed to update this name",
  [DnsRcode.NotZone]: "the record name is not inside the zone"
};

const TSIG_ERROR_MESSAGES: Partial<Record<TsigError, string>> = {
  [TsigError.BadKey]: "the DNS server does not recognize the TSIG key name or its algorithm",
  [TsigError.BadSig]: "the TSIG secret or algorithm does not match the key configured on the DNS server",
  [TsigError.BadTrunc]: "the DNS server rejected the TSIG signature length"
};

// A secret copied out of a Kubernetes Secret or a CI variable is often base64 of the base64 the server expects.
// Only a hint once the server rejects the key: a hand-made key can legitimately decode to base64-looking text.
const looksDoubleEncoded = (secret: string) => {
  const decoded = Buffer.from(secret, "base64").toString("latin1");
  return decoded.length >= 16 && isBase64(decoded);
};

const DOUBLE_ENCODED_HINT =
  ". The secret also looks base64-encoded twice; paste it exactly as it appears in the key file";

// Turns a protocol error into a sentence a DNS admin can act on; messages never include the secret.
export const getRfc2136ErrorMessage = (error: unknown, tsigSecret?: string): string => {
  if (!(error instanceof DnsUpdateError)) return (error as Error)?.message || "unknown error";

  // PowerDNS reports a wrong secret as REFUSED to an update and a bare NOTAUTH to a query, rather than BADSIG
  const isKeyRejection =
    error.tsigError === TsigError.BadSig ||
    error.rcode === DnsRcode.Refused ||
    (error.reason === DnsUpdateErrorReason.TsigRejected && error.tsigError === undefined);
  if (isKeyRejection && tsigSecret && looksDoubleEncoded(tsigSecret)) {
    return `${getRfc2136ErrorMessage(error)}${DOUBLE_ENCODED_HINT}`;
  }

  switch (error.reason) {
    case DnsUpdateErrorReason.TsigRejected:
      if (error.tsigError === TsigError.BadTime) {
        return `the DNS server rejected the request because its clock differs from Infisical's by more than 5 minutes${
          error.serverTime ? ` (server time ${new Date(error.serverTime * 1000).toISOString()})` : ""
        }`;
      }
      if (error.tsigError === undefined) {
        return "the DNS server rejected the TSIG key. Possible causes: wrong key name, secret or algorithm; or the server's clock is more than 5 minutes off";
      }
      return TSIG_ERROR_MESSAGES[error.tsigError as TsigError] ?? error.message;
    case DnsUpdateErrorReason.Rcode:
      return RCODE_MESSAGES[error.rcode as DnsRcode] ?? error.message;
    default:
      return error.message;
  }
};

export const validateRfc2136ConnectionCredentials = async (
  config: TRfc2136ConnectionConfig,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  const { host, port } = config.credentials;

  const toValidationError = (error: unknown) => {
    logger.warn(error, `DNS Server (RFC 2136) connection check failed [host=${host}] [port=${port}]`);
    return new BadRequestError({
      message: `Unable to validate DNS Server (RFC 2136) connection to '${host}:${port}': ${getRfc2136ErrorMessage(error, config.credentials.tsigSecret)}`
    });
  };

  try {
    const result = await executeWithRfc2136Client(config, { gatewayV2Service }, async (client) => {
      // Mapped here: the Gateway proxy rethrows anything from inside as a BadRequestError carrying only the message
      try {
        return await client.checkKey();
      } catch (error) {
        throw toValidationError(error);
      }
    });
    if (result === "unverified") {
      logger.info(
        `DNS Server (RFC 2136) connection check: server reachable but did not sign its reply, key not verified [host=${host}] [port=${port}]`
      );
    }
  } catch (error) {
    if (error instanceof BadRequestError || error instanceof NotFoundError || error instanceof RuleViolationError) {
      throw error;
    }
    throw toValidationError(error);
  }

  return config.credentials;
};
