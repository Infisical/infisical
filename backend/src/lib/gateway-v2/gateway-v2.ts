import net from "node:net";
import tls from "node:tls";

import https from "https";

import { splitPemChain } from "@app/services/certificate/certificate-fns";

import { BadRequestError } from "../errors";
import { GatewayProxyProtocol } from "../gateway/types";
import { logger } from "../logger";

interface IGatewayProxyServer {
  server: net.Server;
  port: number;
  cleanup: () => Promise<void>;
  getProxyError: () => string;
}

const createProxyConnection = async ({
  proxyIp,
  clientCertificate,
  clientPrivateKey,
  serverCertificateChain
}: {
  proxyIp: string;
  clientCertificate: string;
  clientPrivateKey: string;
  serverCertificateChain: string;
}): Promise<net.Socket> => {
  const [host, portStr] = proxyIp.split(":");
  const port = parseInt(portStr, 10) || 443;

  const serverCAs = splitPemChain(serverCertificateChain);
  const tlsOptions: tls.ConnectionOptions = {
    host,
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
        logger.info("Proxy TLS connection established successfully");
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
  proxyConn: net.Socket,
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string }
): Promise<net.Socket> => {
  const tlsOptions: tls.ConnectionOptions = {
    socket: proxyConn,
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

const setupProxyServer = async ({
  protocol,
  proxyIp,
  gateway,
  proxy,
  httpsAgent
}: {
  protocol: GatewayProxyProtocol;
  proxyIp: string;
  gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  proxy: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
  httpsAgent?: https.Agent;
}): Promise<IGatewayProxyServer> => {
  const proxyErrorMsg: string[] = [];

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.on("connection", (clientConn) => {
      void (async () => {
        try {
          clientConn.setKeepAlive(true, 30000);
          clientConn.setNoDelay(true);

          // Stage 1: Connect to proxy relay with TLS
          const proxyConn = await createProxyConnection({
            proxyIp,
            clientCertificate: proxy.clientCertificate,
            clientPrivateKey: proxy.clientPrivateKey,
            serverCertificateChain: proxy.serverCertificateChain
          });

          // Stage 2: Establish mTLS connection to gateway through the proxy
          const gatewayConn = await createGatewayConnection(proxyConn, gateway);

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
            proxyConn.destroy();
            gatewayConn.destroy();
          });

          proxyConn.on("close", () => {
            clientConn.destroy();
            gatewayConn.destroy();
          });

          gatewayConn.on("close", () => {
            clientConn.destroy();
            proxyConn.destroy();
          });
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          proxyErrorMsg.push(errorMsg);
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
        getProxyError: () => proxyErrorMsg.join(",")
      });
    });
  });
};

export const withGatewayV2Proxy = async <T>(
  callback: (port: number) => Promise<T>,
  options: {
    protocol: GatewayProxyProtocol;
    proxyIp: string;
    gateway: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
    proxy: { clientCertificate: string; clientPrivateKey: string; serverCertificateChain: string };
    httpsAgent?: https.Agent;
  }
): Promise<T> => {
  const { protocol, proxyIp, gateway, proxy, httpsAgent } = options;

  const { port, cleanup, getProxyError } = await setupProxyServer({
    protocol,
    proxyIp,
    gateway,
    proxy,
    httpsAgent
  });

  try {
    // Execute the callback with the allocated port
    return await callback(port);
  } catch (err) {
    const proxyErrorMessage = getProxyError();
    if (proxyErrorMessage) {
      logger.error("Proxy error:", proxyErrorMessage);
    }
    logger.error("Gateway error:", err instanceof Error ? err.message : String(err));

    const errorMessage = proxyErrorMessage || (err instanceof Error ? err.message : String(err));
    throw new Error(errorMessage);
  } finally {
    // Ensure cleanup happens regardless of success or failure
    await cleanup();
  }
};
