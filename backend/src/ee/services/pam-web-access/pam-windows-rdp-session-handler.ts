import { Socket as NetSocket, createConnection } from "node:net";
import { TLSSocket, connect as tlsConnect } from "node:tls";

import {
  TWindowsAccountCredentials,
  TWindowsResourceConnectionDetails
} from "@app/ee/services/pam-resource/windows-server/windows-server-resource-types";
import { logger } from "@app/lib/logger";

import {
  certChainBytes,
  decodeRDCleanPath,
  encodeRDCleanPath,
  newRDCleanPathGeneralError,
  newRDCleanPathResponse,
  newRDCleanPathTlsError,
  newRDCleanPathWsaError,
  x224Bytes
} from "./rdcleanpath";
import { SessionEndReason, TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";

type TWindowsSessionParams = {
  connectionDetails: TWindowsResourceConnectionDetails;
  credentials: TWindowsAccountCredentials;
};

/**
 * Browser-facing RDP session handler.
 *
 * Speaks Devolutions' RDCleanPath protocol over the incoming WebSocket:
 *
 *   1. Read one binary WS frame -- the browser's RDCleanPath Request
 *      (DER-encoded ASN.1 carrying destination + proxyAuth + X.224 CR).
 *   2. Open a TCP connection to the gateway relay, forward the X.224 CR,
 *      read the X.224 CC.
 *   3. Perform a TLS handshake with the target through the tunnel.
 *      Capture the server cert chain during the handshake.
 *   4. Send an RDCleanPath Response frame (X.224 CC + cert chain +
 *      server addr).
 *   5. Enter transparent passthrough mode: WebSocket binary frames
 *      become writes to the TLS socket (which encrypts + forwards to
 *      target), and TLS reads become binary WS frames to the browser.
 *
 * The gateway side needs to treat this session's relay tunnel as raw
 * TCP to target:3389 (no protocol break). The existing Pam-protocol
 * relay used by SSH/DB/Redis handlers does its own RDP protocol
 * handling, which would fight us. Gateway-side work: a "browser mode"
 * flag in the session's cert extensions that the RDP handler reads to
 * decide whether to do protocol break (CLI flow) or raw forwarding
 * (browser flow). Tracked as Phase 4 follow-up.
 */
const RDCLEAN_PATH_READ_LIMIT = 128 * 1024;
const X224_HEADER_LEN = 4;
const HANDSHAKE_TIMEOUT_MS = 15_000;

const readFirstBinaryFrame = (ctx: TSessionContext, limit: number): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for first WebSocket frame"));
    }, HANDSHAKE_TIMEOUT_MS);

    const onMessage = (raw: unknown, isBinary: boolean) => {
      clearTimeout(timer);
      ctx.socket.off("message", onMessage);
      ctx.socket.off("close", onClose);
      if (!isBinary) {
        reject(new Error("Expected binary frame"));
        return;
      }
      const buf = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw as Buffer[])
          : Buffer.from(raw as ArrayBuffer);
      if (buf.byteLength > limit) {
        reject(new Error(`Frame too large: ${buf.byteLength} bytes`));
        return;
      }
      resolve(buf);
    };
    const onClose = () => {
      clearTimeout(timer);
      reject(new Error("Socket closed before first frame"));
    };
    ctx.socket.on("message", onMessage);
    ctx.socket.on("close", onClose);
  });
};

const readExact = (socket: NetSocket, length: number, timeoutMs: number): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let received = 0;
    const timer = setTimeout(() => {
      socket.off("data", onData);
      socket.off("error", onError);
      reject(new Error("Timed out reading from relay"));
    }, timeoutMs);

    const finish = (err: Error | null, buf?: Buffer) => {
      clearTimeout(timer);
      socket.off("data", onData);
      socket.off("error", onError);
      if (err) reject(err);
      else resolve(buf!);
    };

    const onData = (chunk: Buffer) => {
      received += chunk.byteLength;
      if (received <= length) {
        chunks.push(chunk);
      } else {
        // Overshoot: keep exactly what we need and push the rest back.
        const need = length - (received - chunk.byteLength);
        chunks.push(chunk.subarray(0, need));
        const rest = chunk.subarray(need);
        socket.unshift(rest);
      }
      if (received >= length) {
        finish(null, Buffer.concat(chunks, length));
      }
    };
    const onError = (err: Error) => finish(err);
    socket.on("data", onData);
    socket.on("error", onError);
  });
};

/** Read one TPKT-framed PDU from a socket. TPKT header is 4 bytes with total length at [2..4]. */
const readTpktPdu = async (socket: NetSocket, timeoutMs: number): Promise<Buffer> => {
  const header = await readExact(socket, X224_HEADER_LEN, timeoutMs);
  if (header[0] !== 0x03 || header[1] !== 0x00) {
    throw new Error(`Not a TPKT frame: ${header.toString("hex")}`);
  }
  const totalLength = (header[2] << 8) | header[3];
  if (totalLength < X224_HEADER_LEN) {
    throw new Error(`TPKT length too small: ${totalLength}`);
  }
  const body = await readExact(socket, totalLength - X224_HEADER_LEN, timeoutMs);
  return Buffer.concat([header, body]);
};

export const handleWindowsRdpSession = async (
  ctx: TSessionContext,
  params: TWindowsSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, relayPort, sessionId, onCleanup } = ctx;

  // 1. Read the RDCleanPath Request from the browser.
  let requestBytes: Buffer;
  try {
    requestBytes = await readFirstBinaryFrame(ctx, RDCLEAN_PATH_READ_LIMIT);
  } catch (err) {
    logger.warn({ sessionId, err }, "RDCleanPath: failed to read first frame");
    sendEncodedError(ctx, newRDCleanPathGeneralError());
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  let request;
  try {
    request = decodeRDCleanPath(new Uint8Array(requestBytes));
  } catch (err) {
    logger.warn({ sessionId, err }, "RDCleanPath: failed to decode request");
    sendEncodedError(ctx, newRDCleanPathGeneralError());
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  const x224Cr = x224Bytes(request);
  if (!x224Cr || !request.destination) {
    logger.warn({ sessionId }, "RDCleanPath: request missing destination or x224 pdu");
    sendEncodedError(ctx, newRDCleanPathGeneralError());
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  // 2. Open TCP to the gateway relay and perform the X.224 handshake.
  //    NOTE: the relay must route this session as raw TCP to the target.
  //    See module-doc for the gateway-side branch we need.
  let tcpSocket: NetSocket;
  try {
    tcpSocket = await dialRelay(relayPort);
  } catch (err) {
    logger.error({ sessionId, err }, "RDCleanPath: relay dial failed");
    sendEncodedError(ctx, newRDCleanPathWsaError(10061));
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  try {
    tcpSocket.write(x224Cr);
  } catch (err) {
    logger.error({ sessionId, err }, "RDCleanPath: failed to write X.224 CR");
    tcpSocket.destroy();
    sendEncodedError(ctx, newRDCleanPathGeneralError());
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  let x224Cc: Buffer;
  try {
    x224Cc = await readTpktPdu(tcpSocket, HANDSHAKE_TIMEOUT_MS);
  } catch (err) {
    logger.warn({ sessionId, err }, "RDCleanPath: failed to read X.224 CC");
    tcpSocket.destroy();
    sendEncodedError(ctx, newRDCleanPathGeneralError());
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  // 3. TLS handshake with the target through the tunnel.
  let tls: TLSSocket;
  let certChain: Uint8Array[];
  try {
    const result = await upgradeToTls(tcpSocket, params.connectionDetails.hostname);
    tls = result.tls;
    certChain = result.certChain;
  } catch (err) {
    logger.error({ sessionId, err }, "RDCleanPath: TLS handshake failed");
    tcpSocket.destroy();
    sendEncodedError(ctx, newRDCleanPathTlsError(40));
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  // 4. Send RDCleanPath Response.
  const response = newRDCleanPathResponse({
    serverAddr: `${params.connectionDetails.hostname}:${params.connectionDetails.port}`,
    x224ConnectionPdu: new Uint8Array(x224Cc),
    serverCertChain: certChain
  });
  try {
    ctx.socket.send(encodeRDCleanPath(response), { binary: true });
  } catch (err) {
    logger.error({ sessionId, err }, "RDCleanPath: failed to send response");
    tls.destroy();
    safeClose(ctx);
    onCleanup();
    return { endReason: SessionEndReason.SetupFailed };
  }

  logger.info(
    { sessionId, target: params.connectionDetails.hostname },
    "RDCleanPath: handshake complete, entering passthrough"
  );

  // 5. Bi-directional passthrough.
  return new Promise((resolve) => {
    let settled = false;
    const end = (reason: SessionEndReason) => {
      if (settled) return;
      settled = true;
      tls.destroy();
      safeClose(ctx);
      onCleanup();
      resolve({ endReason: reason });
    };

    ctx.socket.on("message", (raw, isBinary) => {
      if (!isBinary) return;
      const buf = Buffer.isBuffer(raw)
        ? raw
        : Array.isArray(raw)
          ? Buffer.concat(raw as Buffer[])
          : Buffer.from(raw as ArrayBuffer);
      if (!tls.writable) return;
      tls.write(buf);
    });
    ctx.socket.on("close", () => end(SessionEndReason.UserInitiated));
    ctx.socket.on("error", () => end(SessionEndReason.UserInitiated));

    tls.on("data", (chunk: Buffer) => {
      try {
        ctx.socket.send(chunk, { binary: true });
      } catch {
        end(SessionEndReason.UserInitiated);
      }
    });
    tls.on("close", () => end(SessionEndReason.UserInitiated));
    tls.on("error", (err) => {
      logger.warn({ sessionId, err }, "RDCleanPath: TLS error mid-session");
      end(SessionEndReason.UserInitiated);
    });
  });
};

const dialRelay = (port: number): Promise<NetSocket> =>
  new Promise((resolve, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => resolve(socket));
    socket.once("error", (err) => reject(err));
  });

const upgradeToTls = (
  tcpSocket: NetSocket,
  servername: string
): Promise<{ tls: TLSSocket; certChain: Uint8Array[] }> =>
  new Promise((resolve, reject) => {
    const tls = tlsConnect({
      socket: tcpSocket,
      servername,
      rejectUnauthorized: false // RDP hosts usually present self-signed certs
    });
    tls.once("secureConnect", () => {
      const chain = extractCertChain(tls);
      resolve({ tls, certChain: chain });
    });
    tls.once("error", (err) => reject(err));
  });

const extractCertChain = (tls: TLSSocket): Uint8Array[] => {
  const chain: Uint8Array[] = [];
  let cert = tls.getPeerCertificate(true);
  const seen = new Set<string>();
  while (cert && cert.raw && !seen.has(cert.fingerprint)) {
    seen.add(cert.fingerprint);
    chain.push(new Uint8Array(cert.raw));
    if (cert.issuerCertificate && cert.issuerCertificate !== cert) {
      cert = cert.issuerCertificate;
    } else {
      break;
    }
  }
  return chain;
};

const sendEncodedError = (ctx: TSessionContext, pdu: ReturnType<typeof newRDCleanPathGeneralError>) => {
  try {
    ctx.socket.send(encodeRDCleanPath(pdu), { binary: true });
  } catch {
    // Socket already going down; nothing to do.
  }
};

const safeClose = (ctx: TSessionContext) => {
  try {
    ctx.socket.close(1000, "session ended");
  } catch {
    // Already closed.
  }
};
