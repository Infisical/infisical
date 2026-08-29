import net from "node:net";
import tls from "node:tls";

import { isAxiosError } from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ConnectionDetails } from "@app/ee/services/gateway-v2/gateway-v2-types";
import { splitPemChain } from "@app/services/certificate/certificate-fns";

import { getConfig } from "../config/env";
import { BadRequestError, GatewayTransportError } from "../errors";
import { GatewayProxyProtocol } from "../gateway/types";
import { logger } from "../logger";
import { markAttemptTransportFailure, markAttemptTunnelEstablished } from "./gateway-attempt-context";
import { getGatewayLoadTracker } from "./gateway-load-tracker";
import { isGatewayTransportFailure } from "./gateway-retry";

interface IGatewayRelayServer {
  server: net.Server;
  port: number;
  cleanup: () => Promise<void>;
  getRelayError: () => string;
  hasEstablishedChannel: () => boolean;
}

const DEFAULT_RELAY_CONNECTION_TIMEOUT_MS = 100000;

export const createRelayConnection = async ({
  relayHost,
  clientCertificate,
  clientPrivateKey,
  serverCertificateChain,
  timeoutMs = DEFAULT_RELAY_CONNECTION_TIMEOUT_MS
}: {
  relayHost: string;
  clientCertificate: string;
  clientPrivateKey: string;
  serverCertificateChain: string;
  timeoutMs?: number;
}): Promise<net.Socket> => {
  const [targetHost] = await verifyHostInputValidity({ host: relayHost, isDynamicSecret: false });
  const [, portStr] = relayHost.split(":");
  const port = parseInt(portStr, 10) || 8443;

  const serverCAs = splitPemChain(serverCertificateChain);
  const tlsOptions: tls.ConnectionOptions = {
    host: targetHost,
    servername: relayHost,
    port,
    cert: clientCertificate,
    key: clientPrivateKey,
    ca: serverCAs,
    minVersion: "TLSv1.2",
    rejectUnauthorized: true
  };

  return new Promise((resolve, reject) => {
    try {
      const socket = tls.connect(tlsOptions, () => {
        logger.info("Relay TLS connection established successfully");
        resolve(socket);
      });

      socket.on("error", (err: Error) => {
        reject(new Error(`TLS connection error: ${err.message}`));
      });

      socket.on("close", (hadError: boolean) => {
        if (hadError) {
          logger.error("TLS connection closed with error");
        }
      });

      socket.on("timeout", () => {
        logger.error(`TLS connection timeout after ${timeoutMs / 1000}s`);
        socket.destroy();
        reject(new Error("TLS connection timeout"));
      });

      socket.setTimeout(timeoutMs);
    } catch (error: unknown) {
      reject(new Error(`Failed to create TLS connection: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
};

export const createGatewayConnection = async (
  relayConn: net.Socket,
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string },
  protocol: GatewayProxyProtocol
): Promise<net.Socket> => {
  const appCfg = getConfig();

  const protocolToAlpn: Record<string, string[]> = {
    [GatewayProxyProtocol.Http]: ["infisical-http-proxy"],
    [GatewayProxyProtocol.Tcp]: ["infisical-tcp-proxy"],
    [GatewayProxyProtocol.Ping]: ["infisical-ping"],
    [GatewayProxyProtocol.Health]: ["infisical-health", "infisical-ping"],
    [GatewayProxyProtocol.Pam]: ["infisical-pam-proxy"],
    [GatewayProxyProtocol.PamRdpBrowser]: ["infisical-pam-rdp-browser"],
    [GatewayProxyProtocol.PamSessionCancellation]: ["infisical-pam-session-cancellation"],
    [GatewayProxyProtocol.Pkcs11]: ["infisical-pkcs11"],
    [GatewayProxyProtocol.Adcs]: ["infisical-adcs"],
    [GatewayProxyProtocol.Discovery]: ["infisical-discovery"],
    [GatewayProxyProtocol.ConnectionTest]: ["infisical-connection-test"],
    [GatewayProxyProtocol.WinRm]: ["infisical-winrm"]
  };

  const tlsOptions: tls.ConnectionOptions = {
    socket: relayConn,
    cert: gateway.clientCertificate,
    key: gateway.clientPrivateKey,
    ca: splitPemChain(gateway.serverCertificateChain),
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    rejectUnauthorized: true,
    ALPNProtocols: protocolToAlpn[protocol],
    checkServerIdentity: appCfg.isDevelopmentMode ? () => undefined : tls.checkServerIdentity
  };

  return new Promise((resolve, reject) => {
    try {
      const gatewaySocket = tls.connect(tlsOptions, () => {
        if (!gatewaySocket.authorized) {
          const error = gatewaySocket.authorizationError;
          gatewaySocket.destroy();
          reject(new Error(`Gateway TLS authorization failed: ${error?.message}`));
          return;
        }

        logger.info("Gateway mTLS connection established successfully");
        resolve(gatewaySocket);
      });

      gatewaySocket.on("error", (err: Error) => {
        reject(new Error(`Failed to establish gateway mTLS: ${err.message}`));
      });

      gatewaySocket.setTimeout(120000);
      gatewaySocket.on("timeout", () => {
        gatewaySocket.destroy();
        reject(new Error("Gateway connection timeout"));
      });
    } catch (error: unknown) {
      reject(
        new Error(`Failed to create gateway TLS connection: ${error instanceof Error ? error.message : String(error)}`)
      );
    }
  });
};

export const setupRelayServer = async ({
  gatewayId,
  protocol,
  relayHost,
  gateway,
  relay,
  httpsAgent,
  longLived,
  eager
}: {
  gatewayId: string;
  protocol: GatewayProxyProtocol;
  relayHost: string;
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  httpsAgent?: https.Agent;
  longLived?: boolean;
  /**
   * Opens the tunnel during setup and hands it to the first client, so an unreachable gateway fails
   * here rather than once a user is already attached. Reused rather than probed and dropped, so the
   * gateway sees one channel that becomes the session.
   */
  eager?: boolean;
}): Promise<IGatewayRelayServer> => {
  const relayErrorMsg: string[] = [];
  let establishedChannel = false;
  const loadTracker = getGatewayLoadTracker();

  type TUpstream = {
    relayConn: net.Socket;
    gatewayConn: net.Socket;
    releaseChannel: () => void;
  };

  const openUpstream = async (): Promise<TUpstream> => {
    // Stage 1: Connect to relay with TLS
    const relayConn = await createRelayConnection({
      relayHost,
      clientCertificate: relay.clientCertificate,
      clientPrivateKey: relay.clientPrivateKey,
      serverCertificateChain: relay.serverCertificateChain
    });

    let gatewayConn: net.Socket;
    try {
      // Stage 2: Establish mTLS connection to gateway through the relay
      gatewayConn = await createGatewayConnection(relayConn, gateway, protocol);
    } catch (err) {
      relayConn.destroy();
      throw err;
    }

    // The gateway dials the target the moment it accepts the channel, so from here the attempt is
    // no longer safe to replay even if we abandon this connection.
    establishedChannel = true;
    markAttemptTunnelEstablished();

    if (longLived) {
      // Disable the 30s idle-activity timeout that was set during connection establishment.
      // Without this, the socket is destroyed after 30s of no data, killing idle sessions.
      relayConn.setTimeout(0);
      gatewayConn.setTimeout(0);

      // Enable TCP keep-alive probes every 30s to detect dead connections
      // without terminating idle-but-alive ones.
      relayConn.setKeepAlive(true, 30000);
      gatewayConn.setKeepAlive(true, 30000);
    }

    // Send protocol-specific configuration for HTTP requests
    if (protocol === GatewayProxyProtocol.Http) {
      if (httpsAgent) {
        const agentOptions = httpsAgent.options;
        if (agentOptions && agentOptions.ca) {
          const caCert = Array.isArray(agentOptions.ca) ? agentOptions.ca.join("\n") : agentOptions.ca;
          const caB64 = Buffer.from(caCert as string).toString("base64");
          const rejectUnauthorized = agentOptions.rejectUnauthorized !== false;

          const configCommand = `CONFIG ca=${caB64} verify=${rejectUnauthorized}\n`;
          gatewayConn.write(Buffer.from(configCommand));
        } else {
          // Send empty config to signal end of configuration
          gatewayConn.write(Buffer.from("CONFIG\n"));
        }
      } else {
        // Send empty config to signal end of configuration
        gatewayConn.write(Buffer.from("CONFIG\n"));
      }
    }

    // Per channel, not per operation: one operation can open many, and the channel is what costs
    // the gateway a goroutine.
    loadTracker?.channelOpened(gatewayId);
    let released = false;

    return {
      relayConn,
      gatewayConn,
      releaseChannel: () => {
        if (released) return;
        released = true;
        loadTracker?.channelClosed(gatewayId);
      }
    };
  };

  // Holds the tunnel opened during eager setup until a client claims it.
  let pendingUpstream: TUpstream | null = null;

  const discardPendingUpstream = () => {
    if (!pendingUpstream) return;
    const { relayConn, gatewayConn, releaseChannel } = pendingUpstream;
    pendingUpstream = null;
    releaseChannel();
    relayConn.destroy();
    gatewayConn.destroy();
  };

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("connection", (clientConn) => {
      void (async () => {
        try {
          clientConn.setKeepAlive(true, 30000);
          clientConn.setNoDelay(true);

          const claimed = pendingUpstream;
          pendingUpstream = null;
          const { relayConn, gatewayConn, releaseChannel } = claimed ?? (await openUpstream());

          // Its "close" already fired, so the teardown listeners below would never run and the
          // channel would stay counted for the life of the pod.
          if (clientConn.destroyed) {
            releaseChannel();
            relayConn.destroy();
            gatewayConn.destroy();
            return;
          }

          const destroyAll = () => {
            releaseChannel();
            clientConn.destroy();
            relayConn.destroy();
            gatewayConn.destroy();
          };

          clientConn.on("error", () => destroyAll());
          relayConn.on("error", () => destroyAll());
          gatewayConn.on("error", () => destroyAll());

          // Bidirectional data forwarding
          clientConn.pipe(gatewayConn);
          gatewayConn.pipe(clientConn);

          clientConn.on("close", destroyAll);
          relayConn.on("close", destroyAll);
          gatewayConn.on("close", destroyAll);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          relayErrorMsg.push(errorMsg);
          clientConn.destroy();
        }
      })();
    });

    server.on("error", (err) => {
      reject(err);
    });

    // bind to loopback only so the ephemeral relay port is not reachable from other hosts/interfaces
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get server port"));
        return;
      }

      const relayServer: IGatewayRelayServer = {
        server,
        port: address.port,
        cleanup: async () => {
          discardPendingUpstream();
          try {
            server.close();
          } catch (err) {
            logger.debug("Error closing server:", err instanceof Error ? err.message : String(err));
          }
        },
        getRelayError: () => relayErrorMsg.join(","),
        hasEstablishedChannel: () => establishedChannel
      };

      if (!eager) {
        resolve(relayServer);
        return;
      }

      void (async () => {
        try {
          const upstream = await openUpstream();
          pendingUpstream = upstream;

          // Dropped before anyone claims it, so the next client dials fresh rather than inheriting
          // a dead socket.
          const dropIfUnclaimed = () => {
            if (pendingUpstream === upstream) discardPendingUpstream();
          };
          upstream.relayConn.once("close", dropIfUnclaimed);
          upstream.gatewayConn.once("close", dropIfUnclaimed);
          upstream.relayConn.once("error", dropIfUnclaimed);
          upstream.gatewayConn.once("error", dropIfUnclaimed);

          resolve(relayServer);
        } catch (err) {
          await relayServer.cleanup();
          markAttemptTransportFailure();
          await getGatewayLoadTracker()?.markSuspect(gatewayId);
          reject(
            new GatewayTransportError({
              message: err instanceof Error ? err.message : String(err),
              gatewayId
            })
          );
        }
      })();
    });
  });
};

export const withGatewayV2Proxy = async <T>(
  callback: (port: number) => Promise<T>,
  options: {
    protocol: GatewayProxyProtocol;
    httpsAgent?: https.Agent;
    // keeps the relay connection alive through long idle stretches (e.g. a port sweep dialing many hosts)
    longLived?: boolean;
  } & TGatewayV2ConnectionDetails
): Promise<T> => {
  const { gatewayId, protocol, relayHost, gateway, relay, httpsAgent, longLived } = options;

  let relayServer;
  try {
    relayServer = await setupRelayServer({
      gatewayId,
      protocol,
      relayHost,
      gateway,
      relay,
      httpsAgent,
      longLived
    });
  } catch (err) {
    // The local listener never came up, so no tunnel was attempted and nothing reached the target.
    markAttemptTransportFailure();
    throw new GatewayTransportError({
      message: err instanceof Error ? err.message : String(err),
      gatewayId
    });
  }

  const { port, cleanup, getRelayError, hasEstablishedChannel } = relayServer;

  try {
    // Execute the callback with the allocated port
    return await callback(port);
  } catch (err) {
    const relayErrorMessage = getRelayError();
    if (relayErrorMessage) {
      logger.error("Relay error:", relayErrorMessage);
    }
    logger.error("Gateway error:", err instanceof Error ? err.message : String(err));
    let errorMessage = relayErrorMessage || (err instanceof Error ? err.message : String(err));
    if (isAxiosError(err) && (err.response?.data as { message?: string })?.message) {
      errorMessage = (err.response?.data as { message: string }).message;
    }

    if (isGatewayTransportFailure({ relayError: relayErrorMessage, establishedChannel: hasEstablishedChannel() })) {
      markAttemptTransportFailure();
      await getGatewayLoadTracker()?.markSuspect(gatewayId);
      throw new GatewayTransportError({ message: errorMessage, gatewayId });
    }

    throw new BadRequestError({ message: errorMessage });
  } finally {
    // Ensure cleanup happens regardless of success or failure
    await cleanup();
  }
};
