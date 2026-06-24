import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callPkcs11Endpoint, isRetryablePkcs11RpcError, Pkcs11RpcEndpoint } from "@app/lib/gateway-v2/pkcs11-rpc";
import { logger } from "@app/lib/logger";

import {
  THsmConnectorCredentials,
  THsmConnectorTestMemberResult,
  THsmConnectorTestResult
} from "./hsm-connector-types";

const PKCS11_POOL_RETRY_LIMIT = 2;
const TEST_FANOUT_MAX = 10;
const PKCS11_TARGET_HOST = "pkcs11";

type TGatewayRouting = {
  gatewayId: string | null | undefined;
  gatewayPoolId: string | null | undefined;
};

type THsmConnectorRoutingDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "listHealthyGateways">;
};

const isPkcs11Capable = (capabilities: unknown): boolean => {
  const caps = (capabilities as Record<string, unknown> | null | undefined) ?? {};
  return caps.pkcs11 === true;
};

export const hsmConnectorRoutingFactory = ({ gatewayV2Service, gatewayPoolService }: THsmConnectorRoutingDeps) => {
  const pickGateway = async (connector: TGatewayRouting, triedGatewayIds: Set<string>): Promise<string> => {
    if (connector.gatewayId) {
      if (triedGatewayIds.has(connector.gatewayId)) {
        throw new BadRequestError({
          message:
            "Gateway is unreachable for HSM operations. Ensure the gateway is online and has HSM support enabled."
        });
      }
      return connector.gatewayId;
    }
    if (!connector.gatewayPoolId) {
      throw new BadRequestError({ message: "Connector has neither gatewayId nor gatewayPoolId set." });
    }
    const healthy = await gatewayPoolService.listHealthyGateways(connector.gatewayPoolId);
    const capable = healthy.filter((g) => isPkcs11Capable(g.capabilities) && !triedGatewayIds.has(g.id));
    if (capable.length === 0) {
      throw new BadRequestError({
        message:
          "No HSM-capable gateway available in the pool. Ensure at least one gateway in the pool has HSM support enabled."
      });
    }
    return capable[Math.floor(Math.random() * capable.length)].id;
  };

  const dispatchPkcs11 = async <T>(args: {
    connector: TGatewayRouting;
    credentials: THsmConnectorCredentials;
    endpoint: Pkcs11RpcEndpoint;
    params: Record<string, unknown>;
  }): Promise<T> => {
    const triedGatewayIds = new Set<string>();
    let lastError: { code: string; message: string } | undefined;

    // Retry across pool members must be sequential: each attempt depends on the
    // previous attempt's outcome (which gateway failed, whether the error is
    // retryable, etc.). Parallelising would fire redundant PKCS#11 calls.
    /* eslint-disable no-await-in-loop */
    for (let attempt = 0; attempt <= PKCS11_POOL_RETRY_LIMIT; attempt += 1) {
      const gatewayId = await pickGateway(args.connector, triedGatewayIds);
      triedGatewayIds.add(gatewayId);

      const conn = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
        gatewayId,
        targetHost: PKCS11_TARGET_HOST,
        targetPort: 0
      });
      if (!conn) {
        throw new NotFoundError({
          message: `Gateway connection details for gateway ${gatewayId} not found.`
        });
      }

      try {
        const response = await withGatewayV2Proxy(
          async (port) =>
            callPkcs11Endpoint<T>({
              port,
              endpoint: args.endpoint,
              body: {
                slotLabel: args.credentials.slotLabel,
                pin: args.credentials.pin,
                params: args.params
              }
            }),
          {
            protocol: GatewayProxyProtocol.Pkcs11,
            relayHost: conn.relayHost,
            gateway: conn.gateway,
            relay: conn.relay
          }
        );
        if (response.ok) return response.result;
        lastError = { code: response.errorCode, message: response.errorMessage };
        const retryable = isRetryablePkcs11RpcError({
          ok: false,
          status: response.status,
          errorCode: response.errorCode,
          errorMessage: response.errorMessage
        });
        if (!args.connector.gatewayPoolId || !retryable) {
          break;
        }
        logger.warn(
          { attempt, gatewayId, code: response.errorCode },
          `PKCS#11 RPC failed with retryable error; re-rolling pool [gatewayId=${gatewayId}]`
        );
      } catch (err) {
        lastError = {
          code: "gateway_unreachable",
          message: err instanceof Error ? err.message : String(err)
        };
        if (!args.connector.gatewayPoolId) break;
        logger.warn({ attempt, gatewayId, err }, `PKCS#11 RPC threw; re-rolling pool member [gatewayId=${gatewayId}]`);
      }
    }
    /* eslint-enable no-await-in-loop */

    throw new BadRequestError({
      message:
        lastError !== undefined
          ? `PKCS#11 request failed (${lastError.code}): ${lastError.message}`
          : "PKCS#11 request failed against the HSM gateway."
    });
  };

  const testOneGateway = async (
    gatewayId: string,
    credentials: THsmConnectorCredentials
  ): Promise<THsmConnectorTestMemberResult> => {
    const conn = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
      gatewayId,
      targetHost: PKCS11_TARGET_HOST,
      targetPort: 0
    });
    if (!conn) {
      return { gatewayId, ok: false, errorCode: "gateway_not_found", errorMessage: `Gateway ${gatewayId} not found.` };
    }
    try {
      const response = await withGatewayV2Proxy(
        async (port) =>
          callPkcs11Endpoint<{ slotInfo: { manufacturer: string; model: string; firmware: string } }>({
            port,
            endpoint: "/v1/test",
            body: {
              slotLabel: credentials.slotLabel,
              pin: credentials.pin,
              params: {}
            }
          }),
        {
          protocol: GatewayProxyProtocol.Pkcs11,
          relayHost: conn.relayHost,
          gateway: conn.gateway,
          relay: conn.relay
        }
      );
      if (response.ok) {
        return { gatewayId, ok: true, slotInfo: response.result.slotInfo };
      }
      return { gatewayId, ok: false, errorCode: response.errorCode, errorMessage: response.errorMessage };
    } catch (err) {
      return {
        gatewayId,
        ok: false,
        errorCode: "gateway_unreachable",
        errorMessage: err instanceof Error ? err.message : String(err)
      };
    }
  };

  const runTestRoundTrip = async (args: {
    gatewayId: string | null;
    gatewayPoolId: string | null;
    credentials: THsmConnectorCredentials;
  }): Promise<THsmConnectorTestResult> => {
    const targets: string[] = [];
    if (args.gatewayId) {
      targets.push(args.gatewayId);
    } else if (args.gatewayPoolId) {
      const healthy = await gatewayPoolService.listHealthyGateways(args.gatewayPoolId);
      for (const g of healthy) {
        if (isPkcs11Capable(g.capabilities)) targets.push(g.id);
      }
      if (targets.length === 0) {
        throw new BadRequestError({
          message:
            "No HSM-capable gateway available in the pool. Ensure at least one gateway in the pool has HSM support enabled."
        });
      }
    }

    let probeTargets = targets;
    if (targets.length > TEST_FANOUT_MAX) {
      const buf = [...targets];
      for (let i = 0; i < TEST_FANOUT_MAX; i += 1) {
        const j = i + Math.floor(Math.random() * (buf.length - i));
        [buf[i], buf[j]] = [buf[j], buf[i]];
      }
      probeTargets = buf.slice(0, TEST_FANOUT_MAX);
    }

    const members = await Promise.all(probeTargets.map((gwId) => testOneGateway(gwId, args.credentials)));
    const ok = members.every((m) => m.ok);
    return { ok, members };
  };

  return { dispatchPkcs11, runTestRoundTrip };
};

export type THsmConnectorRoutingFactory = ReturnType<typeof hsmConnectorRoutingFactory>;
