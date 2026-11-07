import { EventType, TAuditLogServiceFactory } from "@app/ee/services/audit-log/audit-log-types";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { ActorType } from "@app/services/auth/auth-type";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { TTelemetryServiceFactory } from "@app/services/telemetry/telemetry-service";
import { TUserDALFactory } from "@app/services/user/user-dal";

import { TPamWebAppSessionDAL } from "../pam-web-app-session/pam-web-app-session-dal";
import { isWebWorkerTerminal } from "../pam-web-app-session/pam-web-app-session-fns";
import { PAM_WEB_APP_SESSION_TABLE } from "../pam-web-app-session/pam-web-app-session-types";
import { PamSessionEndReason } from "../pam/pam-enums";
import { resolveSessionActor } from "./pam-session-access-fns";
import { TPamSessionDALFactory } from "./pam-session-dal";
import { reportPamSessionEnded, sendPamSessionCancellationSignal } from "./pam-session-fns";

type TPamSessionExpirationServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pamSessionDAL: Pick<TPamSessionDALFactory, "endSessionById">;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  telemetryService: Pick<TTelemetryServiceFactory, "sendPostHogEvents">;
  userDAL: Pick<TUserDALFactory, "findById">;
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPAMConnectionDetails">;
  pamWebAppSessionDAL: TPamWebAppSessionDAL;
  auditLogService: Pick<TAuditLogServiceFactory, "createAuditLog">;
  cronJob: Pick<TCronJobFactory, "register">;
};

export type TPamSessionExpirationServiceFactory = ReturnType<typeof pamSessionExpirationServiceFactory>;

export const pamSessionExpirationServiceFactory = ({
  queueService,
  pamSessionDAL,
  projectDAL,
  telemetryService,
  userDAL,
  gatewayV2Service,
  pamWebAppSessionDAL,
  auditLogService,
  cronJob
}: TPamSessionExpirationServiceFactoryDep) => {
  const appCfg = getConfig();
  const reconcileUnreportedWebApps = async () => {
    const candidates = await pamWebAppSessionDAL
      .db(PAM_WEB_APP_SESSION_TABLE)
      .where((query) => {
        void query.where({ allocationGen: 0, workerState: "ending" }).orWhere((expired) => {
          void expired
            .where({ workerReportSeq: 0 })
            .where("allocationGen", ">", 0)
            .where("leaseUntil", "<", new Date())
            .whereNotIn("workerState", ["failed", "stopped"]);
        });
      })
      .orderBy("leaseUntil")
      .limit(100)
      .select<{ sessionId: string }[]>("sessionId");
    let reconciled = 0;
    for (const candidate of candidates) {
      // Recheck under the session locks so a concurrent report or attachment can renew the lease.
      // eslint-disable-next-line no-await-in-loop
      const result = await pamWebAppSessionDAL.transaction(async (tx) => {
        const record = await pamWebAppSessionDAL.lockRecord(candidate.sessionId, tx);
        if (record?.web.allocationGen === 0 && record.web.workerState === "ending") {
          await tx(PAM_WEB_APP_SESSION_TABLE)
            .where({ sessionId: candidate.sessionId })
            .update({ workerState: "stopped", workerStateReason: "never-allocated", stopConfirmedAt: new Date() });
          const ended = await pamSessionDAL.endSessionById(candidate.sessionId, tx);
          return { record, ended, failed: false };
        }
        if (
          !record ||
          record.web.workerReportSeq !== 0 ||
          !record.web.leaseUntil ||
          record.web.leaseUntil.getTime() >= Date.now() ||
          isWebWorkerTerminal(record.web.workerState)
        )
          return null;
        await tx(PAM_WEB_APP_SESSION_TABLE)
          .where({ sessionId: candidate.sessionId })
          .update({ workerState: "failed", workerStateReason: "no-gateway-report" });
        const ended = await pamSessionDAL.endSessionById(candidate.sessionId, tx);
        return { record, ended, failed: true };
      });
      if (result) {
        reconciled += 1;
        const { record, ended } = result;
        if (result.failed && record.web.gatewayId)
          sendPamSessionCancellationSignal({
            sessionId: candidate.sessionId,
            gatewayId: record.web.gatewayId,
            accountType: record.session.accountType,
            actorId: record.web.createdByUserId ?? record.session.id,
            actorType: record.web.createdByUserId ? ActorType.USER : ActorType.PLATFORM,
            actorEmail: record.session.actorEmail,
            gatewayV2Service
          });
        const audit = (type: EventType.PAM_WEB_APP_SESSION_WORKER_FAILED | EventType.PAM_SESSION_END) =>
          auditLogService.createAuditLog({
            actor: { type: ActorType.PLATFORM, metadata: {} },
            orgId: record.session.orgId,
            projectId: record.session.projectId,
            event: {
              type,
              metadata: {
                sessionId: candidate.sessionId,
                accountId: record.web.accountId ?? undefined,
                accountName: record.session.accountName,
                ...(type === EventType.PAM_WEB_APP_SESSION_WORKER_FAILED ? { reason: "no-gateway-report" } : {})
              }
            }
          });
        // eslint-disable-next-line no-await-in-loop
        if (result.failed) await audit(EventType.PAM_WEB_APP_SESSION_WORKER_FAILED);
        if (ended) {
          // eslint-disable-next-line no-await-in-loop
          await audit(EventType.PAM_SESSION_END);
          void reportPamSessionEnded({
            session: ended,
            orgId: record.session.orgId,
            endReason: PamSessionEndReason.Completed,
            telemetryService,
            userDAL
          });
        }
      }
    }
    return reconciled;
  };

  const init = () => {
    cronJob.register({
      name: CronJobName.PamWebAppReconcile,
      pattern: "* * * * *",
      runHashTtlS: 600,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        await reconcileUnreportedWebApps();
      }
    });
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(QueueName.PamSessionExpiration, async (job) => {
      const { sessionId } = job.data;
      try {
        logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: expiring session [sessionId=${sessionId}]`);
        const updated = await pamSessionDAL.endSessionById(sessionId);
        if (updated) {
          logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: session expired [sessionId=${sessionId}]`);

          // endSessionById is status-filtered, so reaching here means nothing else has signalled the gateway
          if (updated.gatewayId) {
            const sessionActor = resolveSessionActor(updated);
            sendPamSessionCancellationSignal({
              sessionId,
              gatewayId: updated.gatewayId,
              accountType: updated.accountType,
              actorId: sessionActor?.id ?? "",
              actorType: sessionActor?.type,
              // Machine identity sessions carry no email
              actorEmail: updated.actorEmail || updated.actorName,
              gatewayV2Service
            });
          }

          const project = await projectDAL.findById(updated.projectId);
          if (project?.orgId) {
            void reportPamSessionEnded({
              session: updated,
              orgId: project.orgId,
              endReason: PamSessionEndReason.Expired,
              telemetryService,
              userDAL
            });
          }
        } else {
          logger.info(
            { sessionId },
            `${QueueName.PamSessionExpiration}: session already ended or not found [sessionId=${sessionId}]`
          );
        }
      } catch (error) {
        logger.error(error, `${QueueName.PamSessionExpiration}: failed to expire session [sessionId=${sessionId}]`);
        throw error;
      }
    });
  };

  const scheduleSessionExpiration = async (sessionId: string, expiresAt: Date) => {
    const delayMs = Math.max(0, expiresAt.getTime() - Date.now());

    await queueService.queue(
      QueueName.PamSessionExpiration,
      QueueJobs.PamSessionExpiration,
      { sessionId },
      {
        jobId: `pam-session-expiration-${sessionId}`,
        delay: delayMs
      }
    );

    logger.info(
      { sessionId, expiresAt: expiresAt.toISOString(), delayMs },
      `${QueueName.PamSessionExpiration}: scheduled expiration [sessionId=${sessionId}]`
    );
  };

  return {
    init,
    reconcileUnreportedWebApps,
    scheduleSessionExpiration
  };
};
