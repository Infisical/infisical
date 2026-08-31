import { Knex } from "knex";
import net from "net";

import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { GatewayProxyProtocol } from "@app/lib/gateway/types";
import { createGatewayConnection, createRelayConnection } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";
import { ActorType } from "@app/services/auth/auth-type";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { PostHogEventTypes } from "@app/services/telemetry/telemetry-types";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { PamAccessMethod, PamAccountType, PamSessionEndReason, PamSessionStatus } from "../pam/pam-enums";
import { TPamSessionDALFactory } from "./pam-session-dal";

export const LIVE_PAM_SESSION_STATUSES = [PamSessionStatus.Active, PamSessionStatus.Starting];

export const isPamSessionLive = (session: { status: string; expiresAt: Date }) =>
  LIVE_PAM_SESSION_STATUSES.includes(session.status as PamSessionStatus) &&
  new Date(session.expiresAt).getTime() > Date.now();

export const pamSessionRemainingSeconds = (session: { expiresAt: Date }) =>
  Math.max(1, Math.floor((new Date(session.expiresAt).getTime() - Date.now()) / 1000));

export const resolvePamSessionDistinctId = async ({
  session,
  userDAL
}: {
  session: { actorEmail: string; actorName?: string | null; userId?: string | null };
  userDAL: Pick<TUserDALFactory, "findById">;
}) => {
  if (session.userId) {
    const user = await userDAL.findById(session.userId);
    if (user?.username) return user.username;
  }
  // Machine identity sessions have no email; fall back to the identity name
  return session.actorEmail || session.actorName || "unknown";
};

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
  // Callers fire this without awaiting, so it must never reject: the actor lookup hits the DB and an
  // unhandled rejection would take the process down in development.
  try {
    // Unstarted sessions have no meaningful length, so they report none rather than a "Starting" wait.
    const durationMs = session.startedAt
      ? Math.max(0, (session.endedAt ?? new Date()).getTime() - session.startedAt.getTime())
      : undefined;

    await telemetryService.sendPostHogEvents({
      event: PostHogEventTypes.PamSessionEnded,
      distinctId: await resolvePamSessionDistinctId({ session, userDAL }),
      organizationId: orgId,
      properties: {
        accountType: session.accountType,
        orgId,
        endReason,
        durationMs,
        accessMethod: session.accessMethod ?? PamAccessMethod.Cli
      }
    });
  } catch (err) {
    logger.error(err, "Failed to report PAM session ended telemetry");
  }
};

// Flipping a session row to terminated does not cut a live tunnel; only this ALPN signal does. Sent
// best-effort (fire-and-forget) so callers don't block on the gateway round-trip, and shared by every
// termination path (manual terminate, grant revocation, expiry) so they can't drift.
export const sendPamSessionCancellationSignal = ({
  sessionId,
  gatewayId,
  accountType,
  actorId,
  actorType = ActorType.USER,
  actorEmail,
  gatewayV2Service
}: {
  sessionId: string;
  gatewayId: string;
  accountType: string;
  actorId: string;
  actorType?: ActorType.USER | ActorType.IDENTITY;
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
        actorMetadata: { id: actorId, type: actorType, name: actorEmail }
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

// Flips a set of session rows to terminated and returns the callback that cuts their live tunnels. The
// two halves are deliberately separate: the row update is undone by a rollback, the ALPN signal is not.
// A caller inside a transaction that can still fail (account deletion, which can be blocked by the
// rotationAccountId FK guard) must pass `tx` and invoke the returned callback only after COMMIT, or a
// failed operation kills privileged tunnels it then claims never to have touched. Callers with no
// transaction can invoke it immediately.
export const terminatePamSessions = async ({
  sessions,
  actorId,
  actorEmail,
  pamSessionDAL,
  gatewayV2Service,
  tx
}: {
  sessions: { id: string; gatewayId?: string | null; accountType: string }[];
  actorId: string;
  actorEmail: string;
  pamSessionDAL: Pick<TPamSessionDALFactory, "update">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  tx?: Knex;
}) => {
  // One statement rather than one per session: callers run this inside a transaction, holding a connection.
  await pamSessionDAL.update(
    {
      $in: {
        id: sessions.map((session) => session.id),
        status: LIVE_PAM_SESSION_STATUSES
      }
    },
    { status: PamSessionStatus.Terminated, endedAt: new Date() },
    tx
  );

  return () => {
    for (const session of sessions) {
      if (session.gatewayId) {
        sendPamSessionCancellationSignal({
          sessionId: session.id,
          gatewayId: session.gatewayId,
          accountType: session.accountType,
          actorId,
          actorEmail,
          gatewayV2Service
        });
      }
    }
  };
};
