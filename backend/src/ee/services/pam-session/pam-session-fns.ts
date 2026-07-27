import net from "net";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamAccountType, PamSessionEndReason } from "../pam/pam-enums";

// PAM session events are reported from gateway-authenticated routes and background jobs, so there is no
// request actor to fall back on -- getTelemetryDistinctId would yield "unknown-auth-data" for both.
export const resolvePamSessionDistinctId = async ({
  session,
  userDAL
}: {
  session: { actorEmail: string; userId?: string | null };
  userDAL: Pick<TUserDALFactory, "findById">;
}) => {
  if (session.userId) {
    const user = await userDAL.findById(session.userId);
    if (user?.username) return user.username;
  }
  return session.actorEmail;
};

// Sessions end from three places -- the gateway calling /end, the web-access socket tearing down and
// the expiration queue -- and whichever gets there first flips the row, so the others see an already
// ended session. Reporting from here keeps every path on one event instead of only the gateway one.
export const reportPamSessionEnded = async ({
  session,
  orgId,
  endReason,
  telemetryService,
  userDAL
}: {
  session: {
    accountType: string;
    actorEmail: string;
    userId?: string | null;
    accessMethod?: string | null;
    startedAt?: Date | null;
    endedAt?: Date | null;
  };
  orgId: string;
  endReason: PamSessionEndReason;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  userDAL: Pick<TUserDALFactory, "findById">;
}) => {
  // Only sessions that reached Active have a meaningful length; for the rest createdAt would fold the
  // "Starting" wait into the reported duration and skew the metric.
  const durationMs = session.startedAt
    ? Math.max(0, (session.endedAt ?? new Date()).getTime() - session.startedAt.getTime())
    : undefined;

  // Every other PAM event keys on username, which is the externalId for SCIM users rather than their
  // email, so keying on email here would split one person into two.
  const distinctId = await resolvePamSessionDistinctId({ session, userDAL });

  void telemetryService
    .sendPostHogEvents({
      event: PostHogEventTypes.PamSessionEnded,
      distinctId,
      organizationId: orgId,
      properties: {
        accountType: session.accountType,
        orgId,
        endReason,
        durationMs,
        // Rows predating the column default to CLI, which is the only access method they could have had.
        accessMethod: session.accessMethod ?? PamAccessMethod.Cli
      }
    })
    .catch(() => {});
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
