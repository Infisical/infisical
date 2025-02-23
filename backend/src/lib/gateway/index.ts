/* eslint-disable no-await-in-loop */
import net from "node:net";
import tls from "node:tls";

import { BadRequestError } from "../errors";
import { logger } from "../logger";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

const createTLSConnection = (relayHost: string, relayPort: number, tlsOptions: tls.TlsOptions = {}) => {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    // @ts-expect-error this is resolved in next connect
    const socket = new tls.TLSSocket(null, {
      rejectUnauthorized: true,
      ...tlsOptions
    });

    const cleanup = () => {
      socket.removeAllListeners();
      socket.end();
    };

    socket.once("error", (err) => {
      cleanup();
      reject(err);
    });

    socket.connect(relayPort, relayHost, () => {
      resolve(socket);
    });
  });
};

type TPingGatewayAndVerifyDTO = {
  relayHost: string;
  relayPort: number;
  tlsOptions: tls.TlsOptions;
  maxRetries?: number;
  identityId: string;
  orgId: string;
};

export const pingGatewayAndVerify = async ({
  relayHost,
  relayPort,
  tlsOptions = {},
  maxRetries = DEFAULT_MAX_RETRIES,
  identityId,
  orgId
}: TPingGatewayAndVerifyDTO) => {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const socket = await createTLSConnection(relayHost, relayPort, tlsOptions);
      socket.setTimeout(2000);

      const pingResult = await new Promise((resolve, reject) => {
        socket.once("timeout", () => {
          socket.destroy();
          reject(new Error("Timeout"));
        });
        socket.once("close", () => {
          socket.destroy();
        });

        socket.once("end", () => {
          socket.destroy();
        });
        socket.once("error", (err) => {
          reject(err);
        });

        socket.write(Buffer.from("PING\n"), () => {
          socket.once("data", (data) => {
            const response = (data as string).toString();
            const certificate = socket.getPeerCertificate();

            if (certificate.subject.CN !== identityId || certificate.subject.O !== orgId) {
              throw new BadRequestError({
                message: `Invalid gateway. Certificate not found for ${identityId} in organization ${orgId}`
              });
            }

            if (response === "PONG") {
              resolve(true);
            } else {
              reject(new Error(`Unexpected response: ${response}`));
            }
          });
        });
      });

      socket.end();
      return pingResult;
    } catch (err) {
      lastError = err as Error;

      if (attempt < maxRetries) {
        await new Promise((resolve) => {
          setTimeout(resolve, DEFAULT_RETRY_DELAY);
        });
      }
    }
  }

  throw new Error(`Failed to ping gateway after ${maxRetries} attempts. Last error: ${lastError?.message}`);
};

interface TProxyServer {
  server: net.Server;
  port: number;
  cleanup: () => void;
}

const setupProxyServer = ({
  targetPort,
  targetHost,
  tlsOptions = {},
  relayHost,
  relayPort
}: {
  targetHost: string;
  targetPort: number;
  relayPort: number;
  relayHost: string;
  tlsOptions: tls.TlsOptions;
}): Promise<TProxyServer> => {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.on("connection", async (clientSocket) => {
      try {
        const targetSocket = await createTLSConnection(relayHost, relayPort, tlsOptions);

        targetSocket.write(Buffer.from(`FORWARD-TCP ${targetHost}:${targetPort}\n`), () => {
          clientSocket.on("data", (data) => {
            const flushed = targetSocket.write(data);
            if (!flushed) {
              clientSocket.pause();
              targetSocket.once("drain", () => {
                clientSocket.resume();
              });
            }
          });

          targetSocket.on("data", (data) => {
            const flushed = clientSocket.write(data as string);
            if (!flushed) {
              targetSocket.pause();
              clientSocket.once("drain", () => {
                targetSocket.resume();
              });
            }
          });
        });

        const cleanup = () => {
          clientSocket?.unpipe();
          clientSocket?.end();
          targetSocket?.unpipe();
          targetSocket?.end();
        };

        clientSocket.on("error", (err) => {
          logger.error(err, "Client socket error");
          cleanup();
          reject(err);
        });

        targetSocket.on("error", (err) => {
          logger.error(err, "Target socket error");
          cleanup();
          reject(err);
        });

        clientSocket.on("end", cleanup);
        targetSocket.on("end", cleanup);
      } catch (err) {
        logger.error(err, "Failed to establish target connection:");
        clientSocket.end();
        reject(err);
      }
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

      logger.info("Gateway proxy started");
      resolve({
        server,
        port: address.port,
        cleanup: () => {
          server.close();
        }
      });
    });
  });
};

interface ProxyOptions {
  targetHost: string;
  targetPort: number;
  relayHost: string;
  relayPort: number;
  tlsOptions?: tls.TlsOptions;
  maxRetries?: number;
  identityId: string;
  orgId: string;
}

export const withGatewayProxy = async (
  callback: (port: number) => Promise<void>,
  options: ProxyOptions
): Promise<void> => {
  const {
    relayHost,
    relayPort,
    targetHost,
    targetPort,
    tlsOptions = {},
    maxRetries = DEFAULT_MAX_RETRIES,
    identityId,
    orgId
  } = options;

  // First, try to ping the gateway
  await pingGatewayAndVerify({
    relayHost,
    relayPort,
    tlsOptions,
    maxRetries,
    identityId,
    orgId
  });

  // Setup the proxy server
  const { port, cleanup } = await setupProxyServer({ targetHost, targetPort, relayPort, relayHost, tlsOptions });

  try {
    // Execute the callback with the allocated port
    await callback(port);
  } finally {
    // Ensure cleanup happens regardless of success or failure
    cleanup();
  }
};
