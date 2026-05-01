import { ForbiddenError } from "@casl/ability";
import picomatch from "picomatch";

import { ActionProjectType } from "@app/db/schemas";
import { TPamAccountDALFactory } from "@app/ee/services/pam-account/pam-account-dal";
import { TPamResourceDALFactory } from "@app/ee/services/pam-resource/pam-resource-dal";
import { TPamResourceRotationRulesDALFactory } from "@app/ee/services/pam-resource/pam-resource-rotation-rules-dal";
import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service-types";
import {
  ProjectPermissionPamInsightsActions,
  ProjectPermissionSub
} from "@app/ee/services/permission/project-permission";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { OrgServiceActor } from "@app/lib/types";

const SESSION_ACTIVITY_DAYS = 30;
const TOP_ACTORS_DAYS = 30;
const TOP_ACTORS_LIMIT = 10;
const FAILED_ROTATIONS_LIMIT = 25;

type TPamInsightsServiceFactoryDep = {
  permissionService: Pick<TPermissionServiceFactory, "getProjectPermission">;
  pamSessionDAL: Pick<TPamSessionDALFactory, "countActiveByProject" | "countDailyByProject" | "findTopActorsByProject">;
  pamResourceDAL: Pick<
    TPamResourceDALFactory,
    "countByProject" | "countWithRotationByProject" | "countByProjectGroupedByType"
  >;
  pamAccountDAL: Pick<
    TPamAccountDALFactory,
    | "countByProject"
    | "countFailedRotationsByProject"
    | "findFailedRotationsByProject"
    | "findRotationCandidatesByProject"
  >;
  pamResourceRotationRulesDAL: Pick<TPamResourceRotationRulesDALFactory, "findByResourceIds">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem">;
};

export type TPamInsightsServiceFactory = ReturnType<typeof pamInsightsServiceFactory>;

const checkPamInsightsPermission = async (
  permissionService: TPamInsightsServiceFactoryDep["permissionService"],
  projectId: string,
  actor: OrgServiceActor
) => {
  const { permission } = await permissionService.getProjectPermission({
    actor: actor.type,
    actorId: actor.id,
    projectId,
    actorAuthMethod: actor.authMethod,
    actorOrgId: actor.orgId,
    actionProjectType: ActionProjectType.PAM
  });

  ForbiddenError.from(permission).throwUnlessCan(
    ProjectPermissionPamInsightsActions.Read,
    ProjectPermissionSub.PamInsights
  );
};

const getStartOfDayUtc = (offsetDays: number): Date => {
  const now = new Date();
  const utcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(utcMidnight - offsetDays * 24 * 60 * 60 * 1000);
};

export const pamInsightsServiceFactory = ({
  permissionService,
  pamSessionDAL,
  pamResourceDAL,
  pamAccountDAL,
  pamResourceRotationRulesDAL,
  keyStore
}: TPamInsightsServiceFactoryDep) => {
  const getSummary = async (projectId: string, actor: OrgServiceActor) => {
    await checkPamInsightsPermission(permissionService, projectId, actor);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.InsightsCache(projectId, "pam:summary"),
      ttlSeconds: 15,
      fetcher: async () => {
        const [
          totalResources,
          resourcesWithRotation,
          totalAccounts,
          failedRotations,
          failedRotationAccounts,
          activeSessions,
          resourceTypeCount
        ] = await Promise.all([
          pamResourceDAL.countByProject(projectId),
          pamResourceDAL.countWithRotationByProject(projectId),
          pamAccountDAL.countByProject(projectId),
          pamAccountDAL.countFailedRotationsByProject(projectId),
          pamAccountDAL.findFailedRotationsByProject(projectId, FAILED_ROTATIONS_LIMIT),
          pamSessionDAL.countActiveByProject(projectId),
          pamResourceDAL.countByProjectGroupedByType(projectId)
        ]);

        return {
          totalResources,
          resourcesWithRotation,
          totalAccounts,
          failedRotations,
          failedRotationAccounts: failedRotationAccounts.map((a) => ({
            accountId: a.id,
            accountName: a.name,
            resourceId: a.resourceId,
            resourceName: a.resourceName,
            resourceType: a.resourceType,
            lastRotatedAt: a.lastRotatedAt
          })),
          activeSessions,
          resourceTypeCount: resourceTypeCount.length
        };
      }
    });
  };

  const getSessionActivity = async (projectId: string, actor: OrgServiceActor) => {
    await checkPamInsightsPermission(permissionService, projectId, actor);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.InsightsCache(projectId, "pam:session-activity"),
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const startDate = getStartOfDayUtc(SESSION_ACTIVITY_DAYS - 1);
        const rows = await pamSessionDAL.countDailyByProject(projectId, startDate);

        const dayCounts = new Map<string, number>();
        for (let i = SESSION_ACTIVITY_DAYS - 1; i >= 0; i -= 1) {
          const d = getStartOfDayUtc(i);
          dayCounts.set(d.toISOString().slice(0, 10), 0);
        }
        rows.forEach((row) => {
          if (dayCounts.has(row.date)) dayCounts.set(row.date, row.count);
        });

        const days = Array.from(dayCounts.entries()).map(([date, count]) => ({ date, count }));
        const total = days.reduce((sum, d) => sum + d.count, 0);
        const avgPerDay = days.length > 0 ? Math.round(total / days.length) : 0;

        return { days, avgPerDay };
      }
    });
  };

  const getTopActors = async (projectId: string, actor: OrgServiceActor) => {
    await checkPamInsightsPermission(permissionService, projectId, actor);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.InsightsCache(projectId, "pam:top-actors"),
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const startDate = getStartOfDayUtc(TOP_ACTORS_DAYS - 1);
        const rows = await pamSessionDAL.findTopActorsByProject(projectId, startDate, TOP_ACTORS_LIMIT);

        return {
          actors: rows.map((row) => ({
            actorName: row.actorName,
            actorEmail: row.actorEmail,
            sessionCount: row.sessionCount,
            isService: row.userId === null
          }))
        };
      }
    });
  };

  const getResourceBreakdown = async (projectId: string, actor: OrgServiceActor) => {
    await checkPamInsightsPermission(permissionService, projectId, actor);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.InsightsCache(projectId, "pam:resource-breakdown"),
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        const resourceCounts = await pamResourceDAL.countByProjectGroupedByType(projectId);

        const breakdown = resourceCounts.map((row) => ({
          resourceType: row.resourceType,
          resourceCount: row.count
        }));

        breakdown.sort((a, b) => b.resourceCount - a.resourceCount);

        return { breakdown };
      }
    });
  };

  const getRotationCalendar = async (projectId: string, month: number, year: number, actor: OrgServiceActor) => {
    await checkPamInsightsPermission(permissionService, projectId, actor);

    return withCache({
      keyStore,
      key: KeyStorePrefixes.InsightsCache(projectId, `pam:rotation-calendar:${year}-${month}`),
      ttlSeconds: KeyStoreTtls.InsightsCacheInSeconds,
      fetcher: async () => {
        // Build the visible calendar grid range: from the Monday on/before the 1st through
        // the Sunday on/after the last day of the month, mirroring how the frontend renders.
        const monthStart = new Date(Date.UTC(year, month - 1, 1));
        const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        // weekday: 0=Sun..6=Sat. For Monday-start weeks, offset = (day + 6) % 7
        const startOffset = (monthStart.getUTCDay() + 6) % 7;
        const endOffset = 6 - ((monthEnd.getUTCDay() + 6) % 7);
        const rangeStart = new Date(monthStart.getTime() - startOffset * 24 * 60 * 60 * 1000);
        const rangeEnd = new Date(monthEnd.getTime() + endOffset * 24 * 60 * 60 * 1000);

        const candidates = await pamAccountDAL.findRotationCandidatesByProject(projectId);
        if (!candidates.length) return { rotations: [] };

        const resourceIds = [...new Set(candidates.map((c) => c.resourceId))];
        const allRules = await pamResourceRotationRulesDAL.findByResourceIds(resourceIds);
        if (!allRules.length) return { rotations: [] };

        const rulesByResource: Record<string, typeof allRules> = {};
        for (const rule of allRules) {
          if (!rulesByResource[rule.resourceId]) rulesByResource[rule.resourceId] = [];
          rulesByResource[rule.resourceId].push(rule);
        }

        type TCalendarRotationEvent = {
          id: string;
          accountId: string;
          accountName: string;
          resourceId: string;
          resourceName: string;
          resourceType: string;
          intervalSeconds: number;
          nextRotationAt: Date;
        };

        const events: TCalendarRotationEvent[] = [];
        const rangeStartMs = rangeStart.getTime();
        const rangeEndMs = rangeEnd.getTime();
        const MAX_EVENTS_PER_ACCOUNT = 100;

        for (const candidate of candidates) {
          const rules = rulesByResource[candidate.resourceId];
          // eslint-disable-next-line no-continue
          if (!rules) continue;

          const matchedRule = rules.find((rule) => picomatch.isMatch(candidate.name, rule.namePattern));
          // eslint-disable-next-line no-continue
          if (!matchedRule || !matchedRule.enabled || !matchedRule.intervalSeconds) continue;

          const baseMs = candidate.lastRotatedAt
            ? new Date(candidate.lastRotatedAt).getTime()
            : candidate.createdAt.getTime();
          const intervalMs = matchedRule.intervalSeconds * 1000;
          if (intervalMs <= 0) {
            // eslint-disable-next-line no-continue
            continue;
          }

          // Fast-forward to the first occurrence within the visible range.
          let occurrenceMs = baseMs;
          if (occurrenceMs < rangeStartMs) {
            const skips = Math.ceil((rangeStartMs - occurrenceMs) / intervalMs);
            occurrenceMs = baseMs + skips * intervalMs;
          }

          let count = 0;
          while (occurrenceMs <= rangeEndMs && count < MAX_EVENTS_PER_ACCOUNT) {
            events.push({
              id: `${candidate.id}-${occurrenceMs}`,
              accountId: candidate.id,
              accountName: candidate.name,
              resourceId: candidate.resourceId,
              resourceName: candidate.resourceName,
              resourceType: candidate.resourceType,
              intervalSeconds: matchedRule.intervalSeconds,
              nextRotationAt: new Date(occurrenceMs)
            });
            occurrenceMs += intervalMs;
            count += 1;
          }
        }

        events.sort((a, b) => a.nextRotationAt.getTime() - b.nextRotationAt.getTime());

        return { rotations: events };
      },
      reviver: (parsed) => {
        parsed.rotations.forEach((r) => {
          // eslint-disable-next-line no-param-reassign
          r.nextRotationAt = new Date(r.nextRotationAt);
        });
        return parsed;
      }
    });
  };

  return {
    getSummary,
    getSessionActivity,
    getTopActors,
    getResourceBreakdown,
    getRotationCalendar
  };
};
