import net from "node:net";
import tls from "node:tls";

import axios from "axios";
import https from "https";

import { verifyHostInputValidity } from "@app/ee/services/dynamic-secret/dynamic-secret-fns";
import { splitPemChain } from "@app/services/certificate/certificate-fns";

import { BadRequestError } from "../errors";
import { GatewayProxyProtocol } from "../gateway/types";
import { logger } from "../logger";

interface IGatewayRelayServer {
  server: net.Server;
  port: number;
  cleanup: () => Promise<void>;
  getRelayError: () => string;
}

const createRelayConnection = async ({
  relayIp,
  clientCertificate,
  clientPrivateKey,
  serverCertificateChain
}: {
  relayIp: string;
  clientCertificate: string;
  clientPrivateKey: string;
  serverCertificateChain: string;
}): Promise<net.Socket> => {
  const [targetHost] = await verifyHostInputValidity(relayIp);
  const [, portStr] = relayIp.split(":");
  const port = parseInt(portStr, 10) || 8443;

  const serverCAs = splitPemChain(serverCertificateChain);
  const tlsOptions: tls.ConnectionOptions = {
    host: targetHost,
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
        logger.error(`TLS connection timeout after 30 seconds`);
        socket.destroy();
        reject(new Error("TLS connection timeout"));
      });

      socket.setTimeout(30000);
    } catch (error: unknown) {
      reject(new Error(`Failed to create TLS connection: ${error instanceof Error ? error.message : String(error)}`));
    }
  });
};

const createGatewayConnection = async (
  relayConn: net.Socket,
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string }
): Promise<net.Socket> => {
  const tlsOptions: tls.ConnectionOptions = {
    socket: relayConn,
    cert: gateway.clientCertificate,
    key: gateway.clientPrivateKey,
    ca: splitPemChain(gateway.serverCertificateChain),
    minVersion: "TLSv1.2",
    maxVersion: "TLSv1.3",
    rejectUnauthorized: true
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

      gatewaySocket.setTimeout(30000);
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

const setupRelayServer = async ({
  protocol,
  relayIp,
  gateway,
  relay,
  httpsAgent
}: {
  protocol: GatewayProxyProtocol;
  relayIp: string;
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  httpsAgent?: https.Agent;
}): Promise<IGatewayRelayServer> => {
  const relayErrorMsg: string[] = [];

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("connection", (clientConn) => {
      void (async () => {
        try {
          clientConn.setKeepAlive(true, 30000);
          clientConn.setNoDelay(true);

          // Stage 1: Connect to relay with TLS
          const relayConn = await createRelayConnection({
            relayIp,
            clientCertificate: relay.clientCertificate,
            clientPrivateKey: relay.clientPrivateKey,
            serverCertificateChain: relay.serverCertificateChain
          });

          // Stage 2: Establish mTLS connection to gateway through the relay
          const gatewayConn = await createGatewayConnection(relayConn, gateway);

          let command = "";

          // Send protocol data to gateway
          if (protocol === GatewayProxyProtocol.Http) {
            command += "FORWARD-HTTP";
            // extract ca certificate from httpsAgent if present
            if (httpsAgent) {
              const agentOptions = httpsAgent.options;
              if (agentOptions && agentOptions.ca) {
                const caCert = Array.isArray(agentOptions.ca) ? agentOptions.ca.join("\n") : agentOptions.ca;
                const caB64 = Buffer.from(caCert as string).toString("base64");
                command += ` ca=${caB64}`;

                const rejectUnauthorized = agentOptions.rejectUnauthorized !== false;
                command += ` verify=${rejectUnauthorized}`;
              }
            }

            command += "\n";
          } else if (protocol === GatewayProxyProtocol.Tcp) {
            command += `FORWARD-TCP\n`;
          } else if (protocol === GatewayProxyProtocol.Ping) {
            command += `PING\n`;
          } else {
            throw new BadRequestError({
              message: `Invalid protocol: ${protocol as string}`
            });
          }

          gatewayConn.write(Buffer.from(command));

          // Bidirectional data forwarding
          clientConn.pipe(gatewayConn);
          gatewayConn.pipe(clientConn);

          // Handle connection closure
          clientConn.on("close", () => {
            relayConn.destroy();
            gatewayConn.destroy();
          });

          relayConn.on("close", () => {
            clientConn.destroy();
            gatewayConn.destroy();
          });

          gatewayConn.on("close", () => {
            clientConn.destroy();
            relayConn.destroy();
          });
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

    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get server port"));
        return;
      }

      resolve({
        server,
        port: address.port,
        cleanup: async () => {
          try {
            server.close();
          } catch (err) {
            logger.debug("Error closing server:", err instanceof Error ? err.message : String(err));
          }
        },
        getRelayError: () => relayErrorMsg.join(",")
      });
    });
  });
};

export const withGatewayV2Proxy = async <T>(
  callback: (port: number) => Promise<T>,
  options: {
    protocol: GatewayProxyProtocol;
    relayIp: string;
    gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
    relay: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
    httpsAgent?: https.Agent;
  }
): Promise<T> => {
  const { protocol, relayIp, gateway, relay, httpsAgent } = options;

  const { port, cleanup, getRelayError } = await setupRelayServer({
    protocol,
    relayIp,
    gateway,
    relay,
    httpsAgent
  });

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
    if (axios.isAxiosError(err) && (err.response?.data as { message?: string })?.message) {
      errorMessage = (err.response?.data as { message: string }).message;
    }

    throw new BadRequestError({ message: errorMessage });
  } finally {
    // Ensure cleanup happens regardless of success or failure
    await cleanup();
  }
};
