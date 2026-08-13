import { connect, createServer, Server } from "node:net";

import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { setupRelayServer } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { TPamSessionServiceFactory } from "../pam-session/pam-session-service";

/**
 * Opens one brokered database session per granted PAM account.
 *
 * This deliberately does not shell out to `infisical pam db access`. That command resolves auth from
 * the CLI's stored *interactive* login session and ignores INFISICAL_TOKEN, so a machine identity can
 * never satisfy it. It calls the same service the CLI's endpoint calls instead, as the sandbox's own
 * identity, so the Connector role, approval gates and session policies are all enforced rather than
 * assumed. The relay authenticates upstream, so the database credential is never handed to the
 * sandbox, which receives only a TCP port.
 */

export type TPamTarget = {
  accountId: string;
  accountName: string;
  resourceName: string;
  projectId: string;
  resourceType: string;
};

export type TPamProxy = {
  accountId: string;
  accountName: string;
  resourceName: string;
  port: number;
  username?: string;
  database?: string;
};

export type TSandboxPamDeps = {
  pamSessionService: Pick<TPamSessionServiceFactory, "access" | "terminateSession">;
};

type TSandboxPamState = {
  proxies: TPamProxy[];
  relays: Awaited<ReturnType<typeof setupRelayServer>>[];
  forwarders: Server[];
  sessions: string[];
};

const states = new Map<string, TSandboxPamState>();

/**
 * The relay listens on the API's loopback, which a sandbox container cannot reach. This republishes
 * it on the sandbox network. The credential still never leaves the API: the sandbox gets a port.
 */
const forwardToLoopback = (localPort: number) =>
  new Promise<{ server: Server; port: number }>((resolve, reject) => {
    const server = createServer((downstream) => {
      const upstream = connect(localPort, "127.0.0.1");
      downstream.on("error", () => upstream.destroy());
      upstream.on("error", () => downstream.destroy());
      downstream.pipe(upstream);
      upstream.pipe(downstream);
    });

    server.once("error", reject);
    server.listen(0, "0.0.0.0", () => resolve({ server, port: (server.address() as { port: number }).port }));
  });

export const startPamProxies = async (
  { pamSessionService }: TSandboxPamDeps,
  sandboxId: string,
  targets: TPamTarget[],
  actor: { identityId: string; identityName: string; orgId: string }
): Promise<TPamProxy[]> => {
  if (!targets.length) return [];

  const state: TSandboxPamState = { proxies: [], relays: [], forwarders: [], sessions: [] };

  for (const target of targets) {
    try {
      // eslint-disable-next-line no-await-in-loop -- one gateway handshake at a time, by design
      const access = await pamSessionService.access({
        // The service addresses an account as 'folderName/accountName'.
        path: `${target.resourceName}/${target.accountName}`,
        projectId: target.projectId,
        actor: {
          actorId: actor.identityId,
          actor: ActorType.IDENTITY,
          actorOrgId: actor.orgId,
          actorAuthMethod: null
        },
        actorEmail: "",
        actorName: actor.identityName,
        actorIp: "127.0.0.1",
        actorUserAgent: "infisical-sandbox",
        reason: `Infisical Sandbox ${sandboxId}`
      });

      if (
        !access.relayHost ||
        !access.relayClientCertificate ||
        !access.relayClientPrivateKey ||
        !access.relayServerCertificateChain ||
        !access.gatewayClientCertificate ||
        !access.gatewayClientPrivateKey ||
        !access.gatewayServerCertificateChain
      ) {
        // Non-database account types return a session without relay certificates.
        throw new Error("this account type does not expose a database connection");
      }

      // eslint-disable-next-line no-await-in-loop
      const relay = await setupRelayServer({
        protocol: GatewayProxyProtocol.Pam,
        relayHost: access.relayHost,
        relay: {
          clientCertificate: access.relayClientCertificate,
          clientPrivateKey: access.relayClientPrivateKey,
          serverCertificateChain: access.relayServerCertificateChain
        },
        gateway: {
          clientCertificate: access.gatewayClientCertificate,
          clientPrivateKey: access.gatewayClientPrivateKey,
          serverCertificateChain: access.gatewayServerCertificateChain
        },
        longLived: true
      });
      state.relays.push(relay);

      // eslint-disable-next-line no-await-in-loop
      const forwarder = await forwardToLoopback(relay.port);
      state.forwarders.push(forwarder.server);
      state.sessions.push(access.sessionId);

      state.proxies.push({
        accountId: target.accountId,
        accountName: access.accountName,
        resourceName: target.resourceName,
        port: forwarder.port,
        username: access.metadata?.username,
        database: access.metadata?.database
      });

      logger.info(
        `Sandbox PAM session open [sandboxId=${sandboxId}] [account=${access.accountName}] [port=${forwarder.port}]`
      );
    } catch (error) {
      // One unreachable account must not cost the sandbox the others, and a half-open port would
      // hand the agent something that hangs, so the failure is reported and the account left out.
      logger.error(
        error,
        `Sandbox could not open a PAM session [sandboxId=${sandboxId}] [account=${target.accountName}]: ${
          (error as Error).message
        }`
      );
    }
  }

  states.set(sandboxId, state);
  logger.info(`PAM sessions opened [sandboxId=${sandboxId}] [count=${state.proxies.length}]`);

  return state.proxies;
};

export const stopPamProxies = (
  { pamSessionService }: TSandboxPamDeps,
  sandboxId: string,
  actor: { identityId: string; orgId: string }
) => {
  const state = states.get(sandboxId);
  if (!state) return;

  states.delete(sandboxId);
  state.forwarders.forEach((server) => server.close());
  state.relays.forEach((relay) => {
    void relay.cleanup().catch(() => {
      // already torn down
    });
  });

  // Without this the session stays Active in PAM until it expires, so the audit trail would show a
  // sandbox holding a database open long after it stopped.
  state.sessions.forEach((sessionId) => {
    void pamSessionService
      .terminateSession(sessionId, {
        actorId: actor.identityId,
        actor: ActorType.IDENTITY,
        actorOrgId: actor.orgId,
        actorAuthMethod: null
      })
      .catch((error: Error) =>
        logger.error(error, `Could not end the sandbox PAM session [sandboxId=${sandboxId}] [sessionId=${sessionId}]`)
      );
  });
};

export const getPamProxies = (sandboxId: string) => states.get(sandboxId)?.proxies ?? [];
