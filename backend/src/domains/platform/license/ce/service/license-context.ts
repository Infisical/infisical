import { TTransaction } from "@app/domains/lib/transaction-runner";
import { logger } from "@app/lib/logger";
import type { TQueueServiceFactory } from "@app/queue";

import { InstanceType } from "../model/license-types";
import { TPlan } from "../model/plan";
import { UsageQueues } from "../model/usage-queues";
import { CounterRegistry } from "./counter-registry";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { TLicenseHooks } from "./license-hooks";
import { PlanCache } from "./plan-cache";
import { RootOrgCache } from "./root-org-cache";

export type TLicenseState = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  rootOrgs: RootOrgCache;
  counters: CounterRegistry;
};

export type TLicenseContext = {
  state: TLicenseState;
  hooks: TLicenseHooks;
  queueService: Pick<TQueueServiceFactory, "queue">;
  countBillableProjects: (rootOrgId: string) => Promise<number>;
  // Set when the module was bound to a caller's transaction with within(tx).
  tx?: TTransaction;
};

// Self-hosted is one license over the whole database, so it reports usage once, under this identity.
export const SELF_HOSTED_LICENSE_ORG_ID = "self-hosted";

const USAGE_DEBOUNCE_MS = 5000;

export const isCloud = (ctx: TLicenseContext) => ctx.state.instance.get().instanceType === InstanceType.Cloud;

export const rootOrgOf = async (ctx: TLicenseContext, orgId: string) => ctx.state.rootOrgs.get(orgId);

// Queued after a short debounce, replacing an event for the same org and dimension that has not run yet.
export const emitUsage = (ctx: TLicenseContext, orgId: string, dimensionKey: string) => {
  if (!ctx.hooks.isMeteringEnabled()) return;

  void ctx.queueService
    .queue(
      UsageQueues.usageEvent,
      UsageQueues.usageEventJob,
      { orgId, dimensionKey },
      {
        delay: USAGE_DEBOUNCE_MS,
        attempts: 5,
        backoff: { type: "exponential", delay: 10_000 },
        removeOnComplete: true,
        removeOnFail: true,
        deduplication: {
          id: `usage-event-${orgId}-${dimensionKey}`,
          keepLastIfActive: true,
          replace: true
        }
      }
    )
    .catch((error) => {
      logger.error(
        error,
        `usage-metering: failed to enqueue usage event [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
      );
    });
};

// Re-emits every dimension for an org once per interval, so a dropped event or an expired last-reported
// value converges. Never blocks the caller.
export const reconcileUsage = (ctx: TLicenseContext, orgId: string) => {
  if (!ctx.hooks.isMeteringEnabled()) return;

  void (async () => {
    if (!(await ctx.state.planCache.acquireReconcileMarker(orgId))) return;
    ctx.state.counters.all().forEach((counter) => emitUsage(ctx, orgId, counter.feature.key));
  })().catch((error) => {
    logger.error(error, `usage-metering: failed to reconcile org usage [orgId=${orgId}]`);
  });
};

const fetchAndCachePlan = async (ctx: TLicenseContext, rootOrgId: string) => {
  const root = await rootOrgOf(ctx, rootOrgId);
  if (!root) throw new Error(`Organization with ID '${rootOrgId}' not found`);
  const plan = await ctx.hooks.fetchPlan(root);
  const withUsage = { ...plan, workspacesUsed: await ctx.countBillableProjects(root.id) };
  await ctx.state.planCache.write(root.id, withUsage);
  return withUsage;
};

const revalidateInBackground = (ctx: TLicenseContext, rootOrgId: string) => {
  void (async () => {
    if (!(await ctx.state.planCache.acquireRevalidateLock(rootOrgId))) return;
    await fetchAndCachePlan(ctx, rootOrgId);
  })().catch((error) => {
    logger.error(error, `getPlan: background revalidation failed [orgId=${rootOrgId}]`);
  });
};

// An org's plan. Self-hosted orgs get the instance's license. On cloud the root org's plan is cached; when
// the License Server cannot be reached the org gets the community defaults until the cache expires.
export const resolvePlan = async (ctx: TLicenseContext, orgId: string): Promise<TPlan> => {
  const instance = ctx.state.instance.get();
  if (instance.instanceType !== InstanceType.Cloud) return instance.features;

  let cacheKey = orgId;
  try {
    const root = await rootOrgOf(ctx, orgId);
    if (!root) throw new Error(`Organization with ID '${orgId}' not found`);
    cacheKey = root.id;

    const cached = await ctx.state.planCache.read(root.id, orgId);
    const plan = cached.plan ?? (await fetchAndCachePlan(ctx, root.id));
    if (cached.plan && cached.passThrough) revalidateInBackground(ctx, root.id);
    if (!cached.isReconciled && plan.slug) reconcileUsage(ctx, orgId);
    return plan;
  } catch (error) {
    logger.error(error, `getPlan: serving the fallback plan [orgId=${orgId}]`);
    const fallback = ctx.hooks.fallbackPlan(instance.features);
    await ctx.state.planCache.writeFallback(cacheKey, fallback);
    return fallback;
  }
};

export const refreshPlanFor = async (ctx: TLicenseContext, orgId: string) => {
  const instance = ctx.state.instance.get();
  if (instance.instanceType === InstanceType.Cloud) {
    const root = await rootOrgOf(ctx, orgId);
    await ctx.state.planCache.invalidate(root?.id ?? orgId);
    await resolvePlan(ctx, orgId);
    return;
  }
  const refreshed = await ctx.hooks.refreshInstanceEntitlements();
  if (refreshed) ctx.state.instance.set(refreshed);
};
