/* eslint-disable no-await-in-loop */
import net from "node:net";

import quicDefault, * as quicModule from "@infisical/quic";
import axios from "axios";
import https from "https";

import { crypto } from "@app/lib/crypto/cryptography";

import { BadRequestError } from "../errors";
import { logger } from "../logger";
import {
  GatewayProxyProtocol,
  IGatewayProxyOptions,
  IGatewayProxyServer,
  TGatewayTlsOptions,
  TPingGatewayAndVerifyDTO
} from "./types";

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY = 1000; // 1 second

const quic = quicDefault || quicModule;

const parseSubjectDetails = (data: string) => {
  const values: Record<string, string> = {};
  data.split("\n").forEach((el) => {
    const [key, value] = el.split("=");
    values[key.trim()] = value.trim();
  });
  return values;
};

const createQuicConnection = async (
  relayHost: string,
  relayPort: number,
  tlsOptions: TGatewayTlsOptions,
  identityId: string,
  orgId: string
) => {
  const client = await quic.QUICClient.createQUICClient({
    host: relayHost,
    port: relayPort,
    config: {
      ca: tlsOptions.ca,
      cert: tlsOptions.cert,
      key: tlsOptions.key,
      applicationProtos: ["infisical-gateway"],
      verifyPeer: true,
      verifyCallback: async (certs) => {
        if (!certs || certs.length === 0) return quic.native.CryptoError.CertificateRequired;
        const serverCertificate = new crypto.nativeCrypto.X509Certificate(Buffer.from(certs[0]));
        const caCertificate = new crypto.nativeCrypto.X509Certificate(tlsOptions.ca);
        const isValidServerCertificate = serverCertificate.verify(caCertificate.publicKey);
        if (!isValidServerCertificate) return quic.native.CryptoError.BadCertificate;

        const subjectDetails = parseSubjectDetails(serverCertificate.subject);
        if (subjectDetails.OU !== "Gateway" || subjectDetails.CN !== identityId || subjectDetails.O !== orgId) {
          return quic.native.CryptoError.CertificateUnknown;
        }

        if (new Date() > new Date(serverCertificate.validTo) || new Date() < new Date(serverCertificate.validFrom)) {
          return quic.native.CryptoError.CertificateExpired;
        }

        const formatedRelayHost =
          process.env.NODE_ENV === "development" ? relayHost.replace("host.docker.internal", "127.0.0.1") : relayHost;
        if (!serverCertificate.checkIP(formatedRelayHost)) return quic.native.CryptoError.BadCertificate;
      },
      maxIdleTimeout: 90000,
      keepAliveIntervalTime: 30000
    },
    crypto: {
      ops: {
        randomBytes: async (data) => {
          crypto.nativeCrypto.getRandomValues(new Uint8Array(data));
        }
      }
    }
  });
  return client;
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
  const quicClient = await createQuicConnection(relayHost, relayPort, tlsOptions, identityId, orgId).catch((err) => {
    throw new BadRequestError({
      message: (err as Error)?.message,
      error: err as Error
    });
  });

  for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
    try {
      const stream = quicClient.connection.newStream("bidi");
      const pingWriter = stream.writable.getWriter();
      await pingWriter.write(Buffer.from("PING\n"));
      pingWriter.releaseLock();

      // Read PONG response
      const reader = stream.readable.getReader();
      const { value, done } = await reader.read();

      if (done) {
        throw new Error("Gateway closed before receiving PONG");
      }

      const response = Buffer.from(value).toString();

      if (response !== "PONG\n" && response !== "PONG") {
        throw new Error(`Failed to Ping. Unexpected response: ${response}`);
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
      await quicClient.destroy();
    }
  }

  logger.error(lastError);
  throw new BadRequestError({
    message: `Failed to ping gateway after ${maxRetries} attempts. Last error: ${lastError?.message}`
  });
};

const setupProxyServer = async ({
  targetPort,
  targetHost,
  tlsOptions,
  relayHost,
  relayPort,
  identityId,
  orgId,
  protocol = GatewayProxyProtocol.Tcp,
  httpsAgent
}: {
  targetHost?: string;
  targetPort?: number;
  relayPort: number;
  relayHost: string;
  tlsOptions: TGatewayTlsOptions;
  identityId: string;
  orgId: string;
  protocol?: GatewayProxyProtocol;
  httpsAgent?: https.Agent;
}): Promise<IGatewayProxyServer> => {
  const quicClient = await createQuicConnection(relayHost, relayPort, tlsOptions, identityId, orgId).catch((err) => {
    throw new BadRequestError({
      error: err as Error
    });
  });
  const proxyErrorMsg = [""];

  return new Promise((resolve, reject) => {
    const server = net.createServer();

    let streamClosed = false;

    // eslint-disable-next-line @typescript-eslint/no-misused-promises
    server.on("connection", async (clientConn) => {
      try {
        clientConn.setKeepAlive(true, 30000); // 30 seconds
        clientConn.setNoDelay(true);

        const stream = quicClient.connection.newStream("bidi");

        const forwardWriter = stream.writable.getWriter();
        let command: string;

        if (protocol === GatewayProxyProtocol.Http) {
          if (!targetHost && !targetPort) {
            command = `FORWARD-HTTP`;
            logger.debug(`Using HTTP proxy mode, no target URL provided [command=${command.trim()}]`);
          } else {
            if (!targetHost || targetPort === undefined) {
              throw new BadRequestError({
                message: `Target host and port are required for HTTP proxy mode with custom target`
              });
            }

            const targetUrl = `${targetHost}:${targetPort}`; // note(daniel): targetHost MUST include the scheme (https|http)
            command = `FORWARD-HTTP ${targetUrl}`;
            logger.debug(`Using HTTP proxy mode, custom target URL provided [command=${command.trim()}]`);

            // extract ca certificate from httpsAgent if present
            if (httpsAgent && targetHost.startsWith("https://")) {
              const agentOptions = httpsAgent.options;
              if (agentOptions && agentOptions.ca) {
                const caCert = Array.isArray(agentOptions.ca) ? agentOptions.ca.join("\n") : agentOptions.ca;
                const caB64 = Buffer.from(caCert as string).toString("base64");
                command += ` ca=${caB64}`;

                const rejectUnauthorized = agentOptions.rejectUnauthorized !== false;
                command += ` verify=${rejectUnauthorized}`;

                logger.debug(`Using HTTP proxy mode, custom target URL provided [command=${command.trim()}]`);
              }
            }
          }

          command += "\n";
        } else if (protocol === GatewayProxyProtocol.Tcp) {
          if (!targetHost || !targetPort) {
            throw new BadRequestError({
              message: `Target host and port are required for TCP proxy mode`
            });
          }

          // For TCP mode, send FORWARD-TCP with host:port
          command = `FORWARD-TCP ${targetHost}:${targetPort}\n`;
          logger.debug(`Using TCP proxy mode: ${command.trim()}`);
        } else {
          throw new BadRequestError({
            message: `Invalid protocol: ${protocol as string}`
          });
        }

        await forwardWriter.write(Buffer.from(command));
        forwardWriter.releaseLock();

        // Set up bidirectional copy
        const setupCopy = () => {
          // Client to QUIC
          // eslint-disable-next-line
          (async () => {
            const writer = stream.writable.getWriter();

            // Create a handler for client data
            clientConn.on("data", (chunk) => {
              writer.write(chunk).catch((err) => {
                proxyErrorMsg.push((err as Error)?.message);
              });
            });

            // Handle client connection close
            clientConn.on("end", () => {
              if (!streamClosed) {
                try {
                  writer.close().catch((err) => {
                    logger.debug(err, "Error closing writer (already closed)");
                  });
                } catch (error) {
                  logger.debug(error, "Error in writer close");
                }
              }
            });

            clientConn.on("error", (clientConnErr) => {
              writer.abort(clientConnErr?.message).catch((err) => {
                proxyErrorMsg.push((err as Error)?.message);
              });
            });
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
              proxyErrorMsg.push((err as Error)?.message);
              clientConn.destroy();
            }
          })();
        };

        setupCopy();
        // Handle connection closure
        clientConn.on("close", () => {
          if (!streamClosed) {
            streamClosed = true;
            stream.destroy().catch((err) => {
              logger.debug(err, "Stream already destroyed during close event");
            });
          }
        });

        const cleanup = async () => {
          try {
            clientConn?.destroy();
          } catch (err) {
            logger.debug(err, "Error destroying client connection");
          }

          if (!streamClosed) {
            streamClosed = true;
            try {
              await stream.destroy();
            } catch (err) {
              logger.debug(err, "Error destroying stream (might be already closed)");
            }
          }
        };

        clientConn.on("error", (clientConnErr) => {
          logger.error(clientConnErr, "Client socket error");
          cleanup().catch((err) => {
            logger.error(err, "Client conn cleanup");
          });
        });

        clientConn.on("end", () => {
          cleanup().catch((err) => {
            logger.error(err, "Client conn end");
          });
        });
      } catch (err) {
        logger.error(err, "Failed to establish target connection:");
        clientConn.end();
        reject(err);
      }
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.on("close", () => {
      quicClient?.destroy().catch((err) => {
        logger.error(err, "Failed to destroy quic client");
      });
    });

    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Failed to get server port"));
        return;
      }

      logger.info(`Gateway proxy started on port ${address.port} (${protocol} mode)`);
      resolve({
        server,
        port: address.port,
        cleanup: async () => {
          try {
            server.close();
          } catch (err) {
            logger.debug(err, "Error closing server");
          }

          try {
            await quicClient?.destroy();
          } catch (err) {
            logger.debug(err, "Error destroying QUIC client");
          }
        },
        getProxyError: () => proxyErrorMsg.join(",")
      });
    });
  });
};

export const withGatewayProxy = async <T>(
  callback: (port: number, httpsAgent?: https.Agent) => Promise<T>,
  options: IGatewayProxyOptions
): Promise<T> => {
  const { targetHost, targetPort, relayDetails, protocol, httpsAgent } = options;

  // Setup the proxy server
  const { port, cleanup, getProxyError } = await setupProxyServer({
    targetHost,
    targetPort,
    relayPort: relayDetails.relayPort,
    relayHost: relayDetails.relayHost,
    tlsOptions: relayDetails.tlsOptions,
    identityId: relayDetails.identityId,
    orgId: relayDetails.orgId,
    protocol,
    httpsAgent
  });

  try {
    // Execute the callback with the allocated port
    return await callback(port, httpsAgent);
  } catch (err) {
    const proxyErrorMessage = getProxyError();
    if (proxyErrorMessage) {
      logger.error(new Error(proxyErrorMessage), "Failed to proxy");
    }
    logger.error(err, "Failed to do gateway");
    let errorMessage = proxyErrorMessage || (err as Error)?.message;
    if (axios.isAxiosError(err) && (err.response?.data as { message?: string })?.message) {
      errorMessage = (err.response?.data as { message: string }).message;
    }

    throw new BadRequestError({ message: errorMessage });
  } finally {
    // Ensure cleanup happens regardless of success or failure
    await cleanup();
  }
};
