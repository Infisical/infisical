import net from "net";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";

import { PamAccountType } from "../pam/pam-enums";

// Flipping a session row to terminated does not cut a live tunnel; only this ALPN signal does. Sent
// best-effort (fire-and-forget) so callers don't block on the gateway round-trip, and shared by every
// termination path (manual terminate, grant revocation) so they can't drift.
export const sendPamSessionCancellationSignal = ({
  sessionId,
  gatewayId,
  accountType,
  actorId,
  actorEmail,
  gatewayV2Service
}: {
  sessionId: string;
  gatewayId: string;
  accountType: string;
  actorId: string;
  actorEmail: string;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
}) => {
  void (async () => {
    let relayConn: net.Socket | null = null;
    try {
      const certs = await gatewayV2Service.getPAMConnectionDetails({
        gatewayId,
        sessionId,
        accountType: accountType as PamAccountType,
        host: "0.0.0.0",
        port: 0,
        actorMetadata: { id: actorId, type: ActorType.USER, name: actorEmail }
      });
      if (!certs) {
        logger.error(
          { sessionId, gatewayId },
          `Failed to get gateway [gatewayId=${gatewayId}] connection details for PAM session [sessionId=${sessionId}] termination`
        );
        return;
      }
      relayConn = await createRelayConnection({
        relayHost: certs.relayHost,
        clientCertificate: certs.relay.clientCertificate,
        clientPrivateKey: certs.relay.clientPrivateKey,
        serverCertificateChain: certs.relay.serverCertificateChain
      });
      const cancelConn = await createGatewayConnection(
        relayConn,
        certs.gateway,
        GatewayProxyProtocol.PamSessionCancellation
      );
      cancelConn.end();
    } catch (err) {
      logger.error({ sessionId, err }, `Session [sessionId=${sessionId}] termination ALPN signal failed (best-effort)`);
    } finally {
      relayConn?.destroy();
    }
  })();
};
