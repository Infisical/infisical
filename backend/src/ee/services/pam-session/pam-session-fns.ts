import net from "net";

import { TPamSessions } from "@app/db/schemas";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamAccountType } from "../pam/pam-enums";

// Every normal session end (CLI /end, web-access websocket cleanup, expiration queue) funnels through
// this helper so `PAM Session Ended` fires from a single place with consistent attribution and duration.
// The gateway /end route only ever ends CLI sessions (web sessions are ended by their websocket cleanup
// before the gateway is signalled, and AWS IAM sessions have no gateway), so emitting only from there
// would leave web/expired/AWS ends untracked.
export const emitPamSessionEndedEvent = async ({
  telemetryService,
  userDAL,
  session,
  orgId
}: {
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  userDAL: Pick<TUserDALFactory, "findById">;
  // The ended session row (post-update), so endedAt/startedAt/accessMethod reflect the final state.
  session: Pick<TPamSessions, "accountType" | "accessMethod" | "startedAt" | "endedAt" | "userId" | "actorEmail">;
  orgId: string;
}) => {
  try {
    // Attribute to the user's telemetry distinctId (username), matching every other PAM event.
    // actorEmail differs from username for SCIM users, so falling back to it would split their events.
    const user = session.userId ? await userDAL.findById(session.userId) : undefined;
    const distinctId = user?.username || session.actorEmail || "unknown-auth-data";

    // Only report duration for sessions that actually reached Active (startedAt set); otherwise the
    // "Starting" wait time would be folded into the reported length and skew duration metrics.
    const endTime = session.endedAt ?? new Date();
    const durationMs = session.startedAt ? Math.max(0, endTime.getTime() - session.startedAt.getTime()) : undefined;

    await telemetryService.sendPostHogEvents({
      event: PostHogEventTypes.PamSessionEnded,
      distinctId,
      organizationId: orgId,
      properties: {
        accountType: session.accountType,
        orgId,
        durationMs,
        accessMethod: session.accessMethod ?? PamAccessMethod.Cli
      }
    });
  } catch (err) {
    logger.error(err, "Failed to emit PAM Session Ended telemetry");
  }
};

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
