import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callPortSweep, callSshExec, SshExecCredentials } from "@app/lib/gateway-v2/ssh-rpc";

import { verifyHostInputValidity } from "../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";

type TGatewayDep = Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">;

const SWEEP_RESPONSE_TIMEOUT_MS = 10 * 60 * 1000;

// runs a command on the target via the gateway's ssh-exec handler; the gateway performs the ssh login (any auth
// method, including certificates), so the backend never needs an ssh client of its own
export const sshExecWithGateway = async (
  targetHost: string,
  targetPort: number,
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  command: string,
  credentials: SshExecCredentials,
  timeoutMs: number,
  signal?: AbortSignal
): Promise<string> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });
  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort
  });
  if (!platform) throw new BadRequestError({ message: "Unable to connect to gateway" });

  return withGatewayV2Proxy(
    async (proxyPort) => {
      const response = await callSshExec({ port: proxyPort, command, credentials, timeoutMs, signal });
      if (!response.ok) throw new Error(response.errorMessage);
      return response.result.stdout;
    },
    {
      protocol: GatewayProxyProtocol.Discovery,
      relayHost: platform.relayHost,
      gateway: platform.gateway,
      relay: platform.relay
    }
  );
};

// opens a gateway TCP proxy to targetHost:targetPort and runs the operation against the local proxy port
export const executeWithGateway = async <T>(
  targetHost: string,
  targetPort: number,
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  operation: (proxyPort: number) => Promise<T>
): Promise<T> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });
  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort
  });
  if (!platform) throw new BadRequestError({ message: "Unable to connect to gateway" });

  return withGatewayV2Proxy((proxyPort) => operation(proxyPort), {
    protocol: GatewayProxyProtocol.Tcp,
    relayHost: platform.relayHost,
    gateway: platform.gateway,
    relay: platform.relay
  });
};

// one gateway round-trip that TCP-probes every target and returns the reachable "host:port" set,
// so a scan can filter a whole CIDR to live hosts
export const sweepReachableTargets = async (
  targets: { host: string; port: number }[],
  gatewayId: string,
  gatewayV2Service: TGatewayDep,
  dialTimeoutMs: number,
  signal?: AbortSignal
): Promise<Set<string>> => {
  if (!targets.length) return new Set();

  const [host] = await verifyHostInputValidity({ host: targets[0].host, isGateway: true, isDynamicSecret: false });
  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort: targets[0].port
  });
  if (!platform) throw new BadRequestError({ message: "Unable to connect to gateway" });

  const hostPorts = targets.map((t) => `${t.host}:${t.port}`);

  return withGatewayV2Proxy(
    (proxyPort) =>
      callPortSweep({
        port: proxyPort,
        targets: hostPorts,
        dialTimeoutMs,
        responseTimeoutMs: SWEEP_RESPONSE_TIMEOUT_MS,
        signal
      }),
    {
      protocol: GatewayProxyProtocol.Discovery,
      relayHost: platform.relayHost,
      gateway: platform.gateway,
      relay: platform.relay,
      longLived: true
    }
  );
};
