import ldapjs from "@infisical/ldapjs";

import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { callPortSweep, callSshExec, SshExecCredentials } from "@app/lib/gateway-v2/ssh-rpc";
import { callWinRmEndpoint, WinRmRpcEndpoint } from "@app/lib/gateway-v2/winrm-rpc";

import { verifyHostInputValidity } from "../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../gateway-v2/gateway-v2-service";
import { resolveDnsTcp } from "./active-directory/dns-over-dc";

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

// Resolve hostnames to IPs through the DC's DNS in one gateway session. Used at rotation-sync time so a
// dependency's machine is targeted by a fresh IP (a scan-time snapshot can go stale via DHCP). Never throws;
// unresolved hosts are simply absent from the map.
export const resolveHostsViaDcDns = async (
  hostnames: string[],
  dcAddress: string,
  gatewayId: string,
  gatewayV2Service: TGatewayDep
): Promise<Map<string, string>> => {
  if (!hostnames.length) return new Map();
  return executeWithGateway(dcAddress, 53, gatewayId, gatewayV2Service, async (proxyPort) => {
    const resolved = new Map<string, string>();
    for (const hostname of hostnames) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const ip = await resolveDnsTcp(hostname, proxyPort);
        if (ip) resolved.set(hostname, ip);
      } catch {
        // leave unresolved; the caller falls back to a stored IP or the hostname
      }
    }
    return resolved;
  });
};

const LDAP_BIND_CHECK_TIMEOUT_MS = 15 * 1000;

// Confirms directory credentials by performing an LDAP simple bind through the gateway. Used to verify a
// rotated domain account's new password: an LDAP bind needs only the credential, unlike a WinRM logon that
// most service accounts lack. Returns whether the bind succeeds; never throws.
export const ldapBindCheckViaGateway = async (
  {
    dcAddress,
    port,
    useLdaps,
    rejectUnauthorized,
    caCert,
    tlsServerName,
    bindDn,
    password
  }: {
    dcAddress: string;
    port: number;
    useLdaps: boolean;
    rejectUnauthorized: boolean;
    caCert?: string;
    tlsServerName?: string;
    bindDn: string;
    password: string;
  },
  gatewayId: string,
  gatewayV2Service: TGatewayDep
): Promise<boolean> =>
  executeWithGateway(
    dcAddress,
    port,
    gatewayId,
    gatewayV2Service,
    (proxyPort) =>
      new Promise<boolean>((resolve) => {
        const client = ldapjs.createClient({
          url: `${useLdaps ? "ldaps" : "ldap"}://localhost:${proxyPort}`,
          connectTimeout: LDAP_BIND_CHECK_TIMEOUT_MS,
          timeout: LDAP_BIND_CHECK_TIMEOUT_MS,
          ...(useLdaps && {
            tlsOptions: {
              rejectUnauthorized,
              servername: tlsServerName || dcAddress,
              ...(caCert && { ca: [caCert] })
            }
          })
        });

        let settled = false;
        const done = (ok: boolean) => {
          if (settled) return;
          settled = true;
          try {
            client.unbind();
          } catch {
            // client may already be destroyed
          }
          resolve(ok);
        };

        // Unhandled 'error' events (e.g. TLS mismatch) would crash the process, so capture them as a failed bind.
        client.on("error", () => done(false));
        client.bind(bindDn, password, (err) => done(!err));
      })
  );

export type TWinRmGatewayCredentials = {
  username: string;
  password: string;
  useHttps?: boolean;
  insecure?: boolean;
  caCertificate?: string;
};

// runs one WinRM operation on the gateway inside the customer network. Node can't perform WinRM message
// sealing, so the gateway (Go/masterzen) owns the WinRM client; the backend only names a vetted operation
// and its params. Targets internal hosts by design, so it uses the gateway host validator (not the SSRF block).
export const winrmRpcWithGateway = async <T>({
  targetHost,
  targetPort,
  gatewayId,
  gatewayV2Service,
  endpoint,
  credentials,
  params
}: {
  targetHost: string;
  targetPort: number;
  gatewayId: string;
  gatewayV2Service: TGatewayDep;
  endpoint: WinRmRpcEndpoint;
  credentials: TWinRmGatewayCredentials;
  params?: Record<string, unknown>;
}): Promise<T> => {
  const [host] = await verifyHostInputValidity({ host: targetHost, isGateway: true, isDynamicSecret: false });
  const platform = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost: host,
    targetPort
  });
  if (!platform) throw new BadRequestError({ message: "Unable to connect to gateway" });

  const response = await withGatewayV2Proxy(
    (proxyPort) =>
      callWinRmEndpoint<T>({
        port: proxyPort,
        endpoint,
        body: {
          username: credentials.username,
          password: credentials.password,
          params: {
            useHttps: credentials.useHttps ?? false,
            insecure: credentials.insecure ?? false,
            ...(credentials.caCertificate ? { caCertificate: credentials.caCertificate } : {}),
            ...params
          }
        }
      }),
    {
      protocol: GatewayProxyProtocol.WinRm,
      relayHost: platform.relayHost,
      gateway: platform.gateway,
      relay: platform.relay
    }
  );

  if (!response.ok) {
    throw new BadRequestError({ message: `WinRM gateway operation failed: ${response.errorMessage ?? ""}` });
  }
  return response.result;
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
