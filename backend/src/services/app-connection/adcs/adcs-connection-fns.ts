import { TGatewayServiceFactory } from "@app/ee/services/gateway/gateway-service";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { AdcsRpcEndpoint, AdcsTemplatesResult, callAdcsEndpoint } from "@app/lib/gateway-v2/adcs-rpc";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { ADCSConnectionMethod } from "./adcs-connection-enums";
import { TADCSConnectionConfig } from "./adcs-connection-types";

export type TADCSGatewayDeps = {
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">;
};

export const getADCSConnectionListItem = () => ({
  name: "ADCS" as const,
  app: AppConnection.ADCS as const,
  methods: Object.values(ADCSConnectionMethod) as [ADCSConnectionMethod.UsernamePassword]
});

/**
 * Runs a single MS-WCCE operation on the gateway that sits inside the customer
 * network. AD CS speaks DCOM, which the control plane cannot reach directly, so
 * a gateway is always required for this connection.
 */
export const executeAdcsGatewayOperation = async <T>(
  args: {
    gatewayId?: string | null;
    gatewayPoolId?: string | null;
    credentials: { host: string; username: string; password: string };
    endpoint: AdcsRpcEndpoint;
    caName?: string;
    params?: Record<string, unknown>;
  },
  deps: TADCSGatewayDeps
): Promise<T> => {
  const { gatewayV2Service, gatewayPoolService } = deps;

  if (args.gatewayPoolId && !gatewayPoolService) {
    throw new BadRequestError({ message: "Pool-backed connections require gatewayPoolService at the call site" });
  }

  const gatewayId =
    args.gatewayPoolId && gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: args.gatewayId,
          gatewayPoolId: args.gatewayPoolId
        })
      : args.gatewayId;

  if (!gatewayId) {
    throw new BadRequestError({
      message: "ADCS connections require a gateway to reach the certificate authority."
    });
  }

  const connectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: args.credentials.host,
    targetPort: 0
  });
  if (!connectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  const response = await withGatewayV2Proxy(
    async (port) =>
      callAdcsEndpoint<T>({
        port,
        endpoint: args.endpoint,
        body: {
          username: args.credentials.username,
          password: args.credentials.password,
          caName: args.caName,
          params: args.params
        }
      }),
    {
      protocol: GatewayProxyProtocol.Adcs,
      relayHost: connectionDetails.relayHost,
      gateway: connectionDetails.gateway,
      relay: connectionDetails.relay
    }
  );

  if (!response.ok) {
    const errorMessage = response.errorMessage ?? "";
    // E_INVALIDARG (0x80070057) from the CA almost always means the CA authority name
    // or the requested template is wrong, rather than a transport-level failure.
    if (errorMessage.includes("E_INVALIDARG") || errorMessage.includes("0x80070057")) {
      throw new BadRequestError({
        message:
          "The certificate authority rejected the request (E_INVALIDARG). Verify the certificate authority name and template are correct for this host."
      });
    }
    throw new BadRequestError({ message: `ADCS gateway operation failed: ${errorMessage}` });
  }
  return response.result;
};

type TAdcsConnectionTarget = {
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  credentials: { host: string; username: string; password: string };
};

/**
 * Confirms the certificate authority name is correct and reachable by listing its templates over
 * the gateway. AD CS rejects an unknown authority name with E_INVALIDARG, so a successful listing
 * proves both that the gateway/credentials work and that the name matches a CA published on the
 * host. Throws an actionable BadRequestError otherwise.
 */
const assertAdcsCaIsReachable = async (
  caName: string,
  target: TAdcsConnectionTarget,
  deps: TADCSGatewayDeps,
  wasDiscovered: boolean
): Promise<void> => {
  try {
    await executeAdcsGatewayOperation<AdcsTemplatesResult>({ ...target, endpoint: "/v1/templates", caName }, deps);
  } catch (error) {
    // A wrong name surfaces as E_INVALIDARG, whose message repeats the same guidance, so only append
    // the underlying detail when it adds something (e.g. a transport failure like an SMB/DCOM timeout).
    const detail = (error as Error)?.message ?? "";
    const extraDetail = detail && !detail.includes("E_INVALIDARG") ? ` (${detail})` : "";
    const guidance = wasDiscovered
      ? `The certificate authority name "${caName}" was discovered from the host, but the gateway could not reach the certificate authority to list its templates. Verify the gateway can connect to the AD CS host over DCOM (MS-WCCE).`
      : `Could not reach certificate authority "${caName}" through the gateway. Verify the certificate authority name is correct and that the gateway can connect to the AD CS host.`;
    throw new BadRequestError({ message: `${guidance}${extraDetail}` });
  }
};

/**
 * Returns the caller-supplied CA name, or discovers it from the CA host's registry over the
 * gateway (the CertSvc "Active" value) when omitted. `getTarget` is only invoked when a gateway
 * call is needed, so callers that already have a CA name and do not request validation pay no
 * gateway/credential cost. When `ensureReachable` is set, the resolved name is validated against
 * the CA before it is returned.
 */
export const resolveAdcsCaName = async (
  caName: string | undefined,
  getTarget: () => Promise<TAdcsConnectionTarget>,
  deps: TADCSGatewayDeps,
  options?: { ensureReachable?: boolean }
): Promise<string> => {
  const ensureReachable = options?.ensureReachable ?? false;

  if (caName) {
    if (ensureReachable) {
      await assertAdcsCaIsReachable(caName, await getTarget(), deps, false);
    }
    return caName;
  }

  const target = await getTarget();
  const discovered = await executeAdcsGatewayOperation<{ caName: string }>(
    { ...target, endpoint: "/v1/discover-ca" },
    deps
  );
  if (!discovered?.caName) {
    throw new BadRequestError({
      message:
        "Could not automatically discover the certificate authority name from the host. Provide the Certificate Authority name explicitly."
    });
  }

  // Discovery above proves SMB/registry reachability plus credentials; this second check proves the CA is
  // reachable over the different DCOM/MS-WCCE path and can list templates, which is what issuance actually
  // needs. A CA that discovers but cannot list templates is exactly the broken state we reject up front.
  if (ensureReachable) {
    await assertAdcsCaIsReachable(discovered.caName, target, deps, true);
  }

  return discovered.caName;
};

export const validateADCSConnectionCredentials = async (
  config: TADCSConnectionConfig,
  _gatewayService: Pick<TGatewayServiceFactory, "fnGetGatewayClientTlsByGatewayId">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">
) => {
  try {
    await executeAdcsGatewayOperation<{ ok: boolean }>(
      {
        gatewayId: config.gatewayId,
        gatewayPoolId: config.gatewayPoolId,
        credentials: config.credentials,
        endpoint: "/v1/test"
      },
      { gatewayV2Service }
    );

    return config.credentials;
  } catch (error) {
    throw new BadRequestError({
      message: `Unable to validate connection: ${
        (error as Error)?.message?.replaceAll(config.credentials.password, "********************") ??
        "verify credentials"
      }`
    });
  }
};
