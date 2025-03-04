/* eslint-disable no-await-in-loop */
import crypto from "node:crypto";
import net from "node:net";

import { QUICClient } from "@infisical/quic";
import { CryptoError } from "@infisical/quic/dist/native";

import { BadRequestError } from "../errors";
import { logger } from "../logger";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

const parseSubjectDetails = (data: string) => {
  const values: Record<string, string> = {};
  data.split("\n").forEach((el) => {
    const [key, value] = el.split("=");
    values[key.trim()] = value.trim();
  });
  return values;
};

type TTlsOption = { ca: string; cert: string; key: string };

const createQuicConnection = async (
  relayHost: string,
  relayPort: number,
  tlsOptions: TTlsOption,
  identityId: string,
  orgId: string
) => {
  const client = await QUICClient.createQUICClient({
    host: relayHost,
    port: relayPort,
    config: {
      ca: tlsOptions.ca,
      cert: tlsOptions.cert,
      key: tlsOptions.key,
      applicationProtos: ["infisical-gateway"],
      verifyPeer: true,
      verifyCallback: async (certs) => {
        if (!certs || certs.length === 0) return CryptoError.CertificateRequired;
        const serverCertificate = new crypto.X509Certificate(Buffer.from(certs[0]));
        const caCertificate = new crypto.X509Certificate(tlsOptions.ca);
        const isValidServerCertificate = serverCertificate.checkIssued(caCertificate);
        if (!isValidServerCertificate) return CryptoError.BadCertificate;

        const subjectDetails = parseSubjectDetails(serverCertificate.subject);
        if (subjectDetails.OU !== "Gateway" || subjectDetails.CN !== identityId || subjectDetails.O !== orgId) {
          return CryptoError.CertificateUnknown;
        }

        if (new Date() > new Date(serverCertificate.validTo) || new Date() < new Date(serverCertificate.validFrom)) {
          return CryptoError.CertificateExpired;
        }

        const formatedRelayHost =
          process.env.NODE_ENV === "development" ? relayHost.replace("host.docker.internal", "127.0.0.1") : relayHost;
        if (!serverCertificate.checkIP(formatedRelayHost)) return CryptoError.BadCertificate;
      },
      maxIdleTimeout: 90000,
      keepAliveIntervalTime: 30000
    },
    crypto: {
      ops: {
        randomBytes: async (data) => {
          crypto.getRandomValues(new Uint8Array(data));
        }
      }
    }
  });
  return client;
};

type TPingGatewayAndVerifyDTO = {
  relayHost: string;
  relayPort: number;
  tlsOptions: TTlsOption;
  maxRetries?: number;
  identityId: string;
  orgId: string;
};

export const pingGatewayAndVerify = async ({
  relayHost,
  relayPort,
  tlsOptions,
  maxRetries = DEFAULT_MAX_RETRIES,
  identityId,
  orgId
}: TPingGatewayAndVerifyDTO) => {
  let lastError: Error | null = null;
  const quic = await createQuicConnection(relayHost, relayPort, tlsOptions, identityId, orgId).catch((err) => {
    throw new BadRequestError({
      error: err as Error
    });
  });
  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const stream = quic.connection.newStream("bidi");
      const pingWriter = stream.writable.getWriter();
      await pingWriter.write(Buffer.from("PING\n"));
      pingWriter.releaseLock();

      // Read PONG response
      const reader = stream.readable.getReader();
      const { value, done } = await reader.read();

      if (done) {
        throw new BadRequestError({
          message: "Gateway closed before receiving PONG"
        });
      }

      const response = Buffer.from(value).toString();

      if (response !== "PONG\n" && response !== "PONG") {
        throw new BadRequestError({
          message: `Failed to Ping. Unexpected response: ${response}`
        });
      }

      reader.releaseLock();
      return;
    } catch (err) {
      lastError = err as Error;

      if (attempt < maxRetries) {
        await new Promise((resolve) => {
          setTimeout(resolve, DEFAULT_RETRY_DELAY);
        });
      }
    } finally {
      await quic.destroy();
    }
  }

  logger.error(lastError);
  throw new BadRequestError({
    message: `Failed to ping gateway after ${maxRetries} attempts. Last error: ${lastError?.message}`
  });
};

interface TProxyServer {
  server: net.Server;
  port: number;
  cleanup: () => Promise<void>;
}

const setupProxyServer = async ({
  targetPort,
  targetHost,
  tlsOptions,
  relayHost,
  relayPort,
  identityId,
  orgId
}: {
  targetHost: string;
  targetPort: number;
  relayPort: number;
  relayHost: string;
  tlsOptions: TTlsOption;
  identityId: string;
  orgId: string;
}): Promise<TProxyServer> => {
  const quic = await createQuicConnection(relayHost, relayPort, tlsOptions, identityId, orgId).catch((err) => {
    throw new BadRequestError({
      error: err as Error
    });
  });

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.on("connection", async (clientConn) => {
      try {
        clientConn.setKeepAlive(true, 30000); // 30 seconds
        clientConn.setNoDelay(true);

        const stream = quic.connection.newStream("bidi");
        // Send FORWARD-TCP command
        const forwardWriter = stream.writable.getWriter();
        await forwardWriter.write(Buffer.from(`FORWARD-TCP ${targetHost}:${targetPort}\n`));
        forwardWriter.releaseLock();
        /* eslint-disable @typescript-eslint/no-misused-promises */
        // Set up bidirectional copy
        const setupCopy = async () => {
          // Client to QUIC
          // eslint-disable-next-line
          (async () => {
            try {
              const writer = stream.writable.getWriter();

              // Create a handler for client data
              clientConn.on("data", async (chunk) => {
                await writer.write(chunk);
              });

              // Handle client connection close
              clientConn.on("end", async () => {
                await writer.close();
              });

              clientConn.on("error", async (err) => {
                await writer.abort(err);
              });
            } catch (err) {
              clientConn.destroy();
            }
          })();

          // QUIC to Client
          void (async () => {
            try {
              const reader = stream.readable.getReader();

              let reading = true;
              while (reading) {
                const { value, done } = await reader.read();

                if (done) {
                  reading = false;
                  clientConn.end(); // Close client connection when QUIC stream ends
                  break;
                }

                // Write data to TCP client
                const canContinue = clientConn.write(Buffer.from(value));

                // Handle backpressure
                if (!canContinue) {
                  await new Promise((res) => {
                    clientConn.once("drain", res);
                  });
                }
              }
            } catch (err) {
              clientConn.destroy();
            }
          })();
        };
        await setupCopy();
        //
        // Handle connection closure
        clientConn.on("close", async () => {
          await stream.destroy();
        });

        const cleanup = async () => {
          clientConn?.destroy();
          await stream.destroy();
        };

        clientConn.on("error", (err) => {
          logger.error(err, "Client socket error");
          void cleanup();
          reject(err);
        });

        clientConn.on("end", cleanup);
      } catch (err) {
        logger.error(err, "Failed to establish target connection:");
        clientConn.end();
        reject(err);
      }
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.on("close", async () => {
      await quic?.destroy();
    });

    /* eslint-enable */

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
        cleanup: async () => {
          server.close();
          await quic?.destroy();
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
  tlsOptions: TTlsOption;
  identityId: string;
  orgId: string;
}

export const withGatewayProxy = async (
  callback: (port: number) => Promise<void>,
  options: ProxyOptions
): Promise<void> => {
  const { relayHost, relayPort, targetHost, targetPort, tlsOptions, identityId, orgId } = options;

  // Setup the proxy server
  const { port, cleanup } = await setupProxyServer({
    targetHost,
    targetPort,
    relayPort,
    relayHost,
    tlsOptions,
    identityId,
    orgId
  });

  try {
    // Execute the callback with the allocated port
    await callback(port);
  } catch (err) {
    logger.error(err, "Failed to proxy");
    throw new BadRequestError({ message: (err as Error)?.message });
  } finally {
    // Ensure cleanup happens regardless of success or failure
    await cleanup();
  }
};
