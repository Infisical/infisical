import { logger } from "@app/lib/logger";

import {
  TWindowsAccountCredentials,
  TWindowsResourceConnectionDetails
} from "@app/ee/services/pam-resource/windows-server/windows-server-resource-types";

import { SessionEndReason, TSessionContext, TSessionHandlerResult } from "./pam-web-access-types";

type TWindowsSessionParams = {
  connectionDetails: TWindowsResourceConnectionDetails;
  credentials: TWindowsAccountCredentials;
};

/**
 * Browser-facing RDP session handler (scaffold).
 *
 * Phase 4 work. The ironrdp-web WASM client speaks RDCleanPath over the
 * WebSocket -- a Devolutions protocol that wraps the RDP X.224 handshake
 * in an ASN.1 PDU before raw bytes flow. To make browser-based RDP work
 * end-to-end we have to:
 *
 *   1. Switch this socket to binary mode (send/receive Buffer directly
 *      instead of JSON envelopes like the SSH / Postgres / Redis
 *      handlers use).
 *   2. Read the initial RDCleanPathPdu request from the browser (it's a
 *      DER-encoded ASN.1 structure wrapping an X.224 Connection Request
 *      plus auth token fields). Parsing requires an ASN.1 library.
 *   3. Forward the wrapped X.224 Connection Request to the gateway via
 *      `relayPort` (the local port the gateway tunnel surfaces through).
 *      The gateway's existing ALPN routing will take it from there via
 *      the RDP handler we already wired up on the CLI side.
 *   4. Receive the target's X.224 Connection Confirm + TLS cert chain
 *      back from the gateway, wrap it in an RDCleanPathPdu response,
 *      send to the browser.
 *   5. After the handshake, pipe raw bytes in both directions
 *      (socket <-> relay) without any further framing.
 *
 *   Reference implementation of RDCleanPath: the `ironrdp-rdcleanpath`
 *   crate inside github.com/Devolutions/IronRDP.
 *
 * Until that's done, this handler rejects the session cleanly with a
 * descriptive error so the frontend can display a useful message rather
 * than stalling on a silent protocol mismatch.
 */
export const handleWindowsRdpSession = async (
  ctx: TSessionContext,
  params: TWindowsSessionParams
): Promise<TSessionHandlerResult> => {
  const { socket, sessionId, sendSessionEnd, onCleanup } = ctx;

  logger.warn(
    { sessionId, resource: params.connectionDetails.hostname },
    "Windows RDP web-access session attempted but RDCleanPath bridge is not yet implemented"
  );

  // Send a session-end message so the frontend gets a clear signal. The
  // message flows through the same JSON envelope SSH/DB use; the browser
  // RDP client will never reach the point of interpreting the binary
  // stream, so this is safe to send as JSON.
  sendSessionEnd(SessionEndReason.SetupFailed);

  try {
    socket.close(1011, "Windows RDP browser access not yet available -- see rdp-poc-e2e.md");
  } catch {
    // Close already in progress; fine.
  }

  onCleanup();

  return {
    endReason: SessionEndReason.SetupFailed
  };
};
