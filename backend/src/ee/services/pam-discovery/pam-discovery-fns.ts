import net from "node:net";

import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callSshExec, SshExecCredentials } from "@app/lib/gateway-v2/ssh-rpc";

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
  timeoutMs: number
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
      const response = await callSshExec({ port: proxyPort, command, credentials, timeoutMs });
      if (!response.ok) throw new Error(response.errorMessage);
      return response.result.stdout;
    },
    {
      protocol: GatewayProxyProtocol.SshExec,
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
  dialTimeoutMs: number
): Promise<Set<string>> => {
  if (!targets.length) return new Set();

  const [host] = await verifyHostInputValidity({ host: targets[0].host, isGateway: true, isDynamicSecret: false });
  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort: targets[0].port
  });
  if (!platform) throw new BadRequestError({ message: "Unable to connect to gateway" });

  const request = `${JSON.stringify({ targets: targets.map((t) => `${t.host}:${t.port}`), timeoutMs: dialTimeoutMs })}\n`;

  return withGatewayV2Proxy(
    (proxyPort) =>
      new Promise<Set<string>>((resolve, reject) => {
        const socket = net.connect({ host: "127.0.0.1", port: proxyPort });
        let buffer = "";
        const timer = setTimeout(() => {
          socket.destroy();
          reject(new Error("Port sweep timed out"));
        }, SWEEP_RESPONSE_TIMEOUT_MS);
        const finish = (err: Error | null) => {
          clearTimeout(timer);
          socket.destroy();
          if (err) return reject(err);
          try {
            const parsed = JSON.parse(buffer) as { open?: string[] };
            return resolve(new Set(parsed.open ?? []));
          } catch {
            return reject(new Error("Invalid port sweep response"));
          }
        };
        socket.on("connect", () => socket.write(request));
        socket.on("data", (chunk) => {
          buffer += chunk.toString("utf-8");
        });
        socket.on("end", () => finish(null));
        socket.on("error", (err) => finish(err));
      }),
    {
      protocol: GatewayProxyProtocol.PortSweep,
      relayHost: platform.relayHost,
      gateway: platform.gateway,
      relay: platform.relay,
      longLived: true
    }
  );
};
