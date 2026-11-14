import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2DALFactory } from "@app/ee/services/gateway-v2/gateway-v2-dal";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import {
  callPkcs11Endpoint,
  isRetryablePkcs11RpcError,
  Pkcs11ErrorCode,
  Pkcs11RpcEndpoint
} from "@app/lib/gateway-v2/pkcs11-rpc";
import { GatewayProxyProtocol } from "@app/lib/gateway-v2/types";
import { logger } from "@app/lib/logger";

import { HsmGatewayCapability } from "./hsm-connector-fns";
import {
  THsmConnectorCredentials,
  THsmConnectorTestMemberResult,
  THsmConnectorTestResult
} from "./hsm-connector-types";

const PKCS11_POOL_RETRY_LIMIT = 2;
const TEST_FANOUT_MAX = 10;
const PKCS11_TARGET_HOST = "pkcs11";
const NO_CAPABLE_MEMBER_MESSAGE =
  "No HSM-capable gateway available in the pool. Ensure at least one gateway in the pool has HSM support enabled.";
type TMissingCapabilityMessages = { outdatedGateway: string; unsupportedHsm: string };
const POOL_MISSING_CAPABILITY_MESSAGES: Record<HsmGatewayCapability, TMissingCapabilityMessages> = {
  [HsmGatewayCapability.MlDsa]: {
    outdatedGateway:
      "No HSM-capable gateway in the pool supports ML-DSA keys. Update the pool's gateways to the latest version.",
    unsupportedHsm:
      "None of the HSMs attached to the pool's gateways support ML-DSA keys. Check that your HSM's PKCS#11 driver supports ML-DSA."
  }
};
const GATEWAY_MISSING_CAPABILITY_MESSAGES: Record<HsmGatewayCapability, TMissingCapabilityMessages> = {
  [HsmGatewayCapability.MlDsa]: {
    outdatedGateway:
      "The HSM Connector's gateway does not support ML-DSA keys. Update the gateway to the latest version.",
    unsupportedHsm:
      "The HSM attached to the HSM Connector's gateway does not support ML-DSA keys. Check that your HSM's PKCS#11 driver supports ML-DSA."
  }
};

type TGatewayRouting = {
  gatewayId: string | null | undefined;
  gatewayPoolId: string | null | undefined;
};

type THsmConnectorRoutingDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayV2DAL: Pick<TGatewayV2DALFactory, "findById">;
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "listHealthyGateways" | "selectGatewayFromPool">;
};

const isPkcs11Capable = (capabilities: unknown, requiredCapability?: HsmGatewayCapability): boolean => {
  const caps = (capabilities as Record<string, unknown> | null | undefined) ?? {};
  return caps.pkcs11 === true && (!requiredCapability || caps[requiredCapability] === true);
};

const isOutdatedForCapability = (capabilities: unknown, requiredCapability: HsmGatewayCapability): boolean => {
  const caps = (capabilities as Record<string, unknown> | null | undefined) ?? {};
  return caps[requiredCapability] === undefined;
};

const pickMissingCapabilityMessage = (messages: TMissingCapabilityMessages, isOutdated: boolean): string =>
  isOutdated ? messages.outdatedGateway : messages.unsupportedHsm;

export const hsmConnectorRoutingFactory = ({
  gatewayV2Service,
  gatewayV2DAL,
  gatewayPoolService
}: THsmConnectorRoutingDeps) => {
  const pickGateway = async (
    connector: TGatewayRouting,
    triedGatewayIds: Set<string>,
    requiredCapability?: HsmGatewayCapability
  ): Promise<string> => {
    if (connector.gatewayId) {
      if (triedGatewayIds.has(connector.gatewayId)) {
        throw new BadRequestError({
          message:
            "Gateway is unreachable for HSM operations. Ensure the gateway is online and has HSM support enabled."
        });
      }
      if (requiredCapability) {
        const gateway = await gatewayV2DAL.findById(connector.gatewayId);
        if (
          gateway &&
          isPkcs11Capable(gateway.capabilities) &&
          !isPkcs11Capable(gateway.capabilities, requiredCapability)
        ) {
          throw new BadRequestError({
            message: pickMissingCapabilityMessage(
              GATEWAY_MISSING_CAPABILITY_MESSAGES[requiredCapability],
              isOutdatedForCapability(gateway.capabilities, requiredCapability)
            )
          });
        }
      }
      return connector.gatewayId;
    }
    if (!connector.gatewayPoolId) {
      throw new BadRequestError({ message: "Connector has neither gatewayId nor gatewayPoolId set." });
    }

    // Key material is not portable between HSMs, so a member without the module attached is not an
    // acceptable substitute no matter how idle it is.
    const poolId = connector.gatewayPoolId;
    const selected = await gatewayPoolService
      .selectGatewayFromPool({
        poolId,
        exclude: triedGatewayIds,
        filter: (gateway) => isPkcs11Capable(gateway.capabilities, requiredCapability),
        unavailableMessage: NO_CAPABLE_MEMBER_MESSAGE
      })
      .catch(async (err: unknown) => {
        if (!requiredCapability || !(err instanceof BadRequestError)) throw err;
        const healthyGateways = await gatewayPoolService.listHealthyGateways(poolId);
        const otherPkcs11Members = healthyGateways.filter(
          (gateway) => !triedGatewayIds.has(gateway.id) && isPkcs11Capable(gateway.capabilities)
        );
        if (otherPkcs11Members.length > 0) {
          throw new BadRequestError({
            message: pickMissingCapabilityMessage(
              POOL_MISSING_CAPABILITY_MESSAGES[requiredCapability],
              otherPkcs11Members.some((gateway) => isOutdatedForCapability(gateway.capabilities, requiredCapability))
            )
          });
        }
        throw err;
      });
    return selected.id;
  };

  const dispatchPkcs11 = async <T>(args: {
    connector: TGatewayRouting;
    credentials: THsmConnectorCredentials;
    endpoint: Pkcs11RpcEndpoint;
    params: Record<string, unknown>;
    requiredCapability?: HsmGatewayCapability;
  }): Promise<T> => {
    const triedGatewayIds = new Set<string>();
    let lastError: { code: string; message: string } | undefined;

    // Retry across pool members must be sequential: each attempt depends on the
    // previous attempt's outcome (which gateway failed, whether the error is
    // retryable, etc.). Parallelising would fire redundant PKCS#11 calls.
    /* eslint-disable no-await-in-loop */
    for (let attempt = 0; attempt <= PKCS11_POOL_RETRY_LIMIT; attempt += 1) {
      let gatewayId;
      try {
        gatewayId = await pickGateway(args.connector, triedGatewayIds, args.requiredCapability);
      } catch (err) {
        // Once every capable member has been tried, the accumulated PKCS#11 failure is the useful
        // error. Reporting "no HSM-capable gateway" instead points operators at the wrong problem.
        if (!lastError) throw err;
        break;
      }
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
          { ...conn, protocol: GatewayProxyProtocol.Pkcs11 }
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
          code: Pkcs11ErrorCode.GatewayUnreachable,
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
      return {
        gatewayId,
        ok: false,
        errorCode: Pkcs11ErrorCode.GatewayNotFound,
        errorMessage: `Gateway ${gatewayId} not found.`
      };
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
        { ...conn, protocol: GatewayProxyProtocol.Pkcs11 }
      );
      if (response.ok) {
        return { gatewayId, ok: true, slotInfo: response.result.slotInfo };
      }
      return { gatewayId, ok: false, errorCode: response.errorCode, errorMessage: response.errorMessage };
    } catch (err) {
      return {
        gatewayId,
        ok: false,
        errorCode: Pkcs11ErrorCode.GatewayUnreachable,
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
        throw new BadRequestError({ message: NO_CAPABLE_MEMBER_MESSAGE });
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
