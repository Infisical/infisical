import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";
import { logger } from "@app/lib/logger";
import { TEventEmitter } from "@app/services/event-outbox/event-outbox-types";

import { TOrgDALFactory } from "./org-dal";
import { emitOrgMembershipRemoved, toOrgMembershipActors } from "./org-membership-events";

// per run; a run that hits it logs and the next run picks up the rest
export const ORG_ACCESS_SWEEP_LIMIT = 5000;

type TOrgAccessSweepQueueDep = {
  cronJob: TCronJobFactory;
  orgDAL: Pick<TOrgDALFactory, "findOrphanedProjectActors">;
  eventEmitter: TEventEmitter;
};

export type TOrgAccessSweepQueueFactory = ReturnType<typeof orgAccessSweepQueueFactory>;

// Backstop for the reconcile consumer: finds project rows whose actor no longer reaches the org and
// reports each as an org membership that is gone. Also repairs data from before the events existed.
export const orgAccessSweepQueueFactory = ({ cronJob, orgDAL, eventEmitter }: TOrgAccessSweepQueueDep) => {
  const runSweep = async () => {
    const orphans = await orgDAL.findOrphanedProjectActors({ limit: ORG_ACCESS_SWEEP_LIMIT });

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
    cronJob.register({
      name: CronJobName.OrgAccessReconcileSweep,
      pattern: "0 4 * * *",
      runHashTtlS: 24 * 60 * 60,
      handler: async () => {
        const { orphans } = await runSweep();
        logger.info(`cron[org-access-reconcile-sweep]: queued ${orphans} orphaned project memberships`);
      }
    });
  };

  return { init, runSweep };
};
