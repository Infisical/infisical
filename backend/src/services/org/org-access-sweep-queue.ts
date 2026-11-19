import { getConfig } from "@app/lib/config/env";
import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

import { TOrgDALFactory } from "./org-dal";
import { emitOrgMembershipRemoved, toOrgMembershipActors } from "./org-membership-events";

export const ORG_ACCESS_SWEEP_LIMIT = 5000;
export const ORG_ACCESS_SWEEP_STATEMENT_TIMEOUT_MS = 3 * 60_000;

type TOrgAccessSweepQueueDep = {
  cronJob: TCronJobFactory;
  orgDAL: Pick<TOrgDALFactory, "findOrphanedProjectActors">;
  eventEmitter: TEventEmitter;
};

export type TOrgAccessSweepQueueFactory = ReturnType<typeof orgAccessSweepQueueFactory>;

// Backstop for the reconcile consumer: emits an org membership removal for every project or resource row
// whose actor no longer reaches the org. Also catches data from before the events existed.
export const orgAccessSweepQueueFactory = ({ cronJob, orgDAL, eventEmitter }: TOrgAccessSweepQueueDep) => {
  const runSweep = async () => {
    const orphans = await orgDAL.findOrphanedProjectActors({
      limit: ORG_ACCESS_SWEEP_LIMIT,
      statementTimeoutMs: ORG_ACCESS_SWEEP_STATEMENT_TIMEOUT_MS
    });

    for await (const orphan of orphans) {
      await emitOrgMembershipRemoved(eventEmitter, {
        orgId: orphan.scopeOrgId,
        actors: toOrgMembershipActors({
          userIds: orphan.actorUserId ? [orphan.actorUserId] : [],
          identityIds: orphan.actorIdentityId ? [orphan.actorIdentityId] : []
        })
      });
    }

    if (orphans.length >= ORG_ACCESS_SWEEP_LIMIT) {
      logger.warn(
        `cron[org-access-reconcile-sweep]: hit the ${ORG_ACCESS_SWEEP_LIMIT} row limit; the remainder waits for the next run`
      );
    }
    return { orphans: orphans.length };
  };

  const init = () => {
    const appCfg = getConfig();
    cronJob.register({
      name: CronJobName.OrgAccessReconcileSweep,
      pattern: "0 4 * * *",
      runHashTtlS: 24 * 60 * 60,
      enabled: !appCfg.isSecondaryInstance,
      handler: async () => {
        const { orphans } = await runSweep();
        logger.info(`cron[org-access-reconcile-sweep]: queued ${orphans} actors with orphaned memberships`);
      }
    });
  };

  return { init, runSweep };
};
