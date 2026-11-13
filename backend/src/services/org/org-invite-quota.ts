import { TLicenseService } from "@app/domains/platform/license/ce/module";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { DailyQuotaExceededError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

export const MAX_NEW_MEMBERS_PER_INVITE = 10;
export const FREE_ORG_DAILY_INVITE_LIMIT = 50;

// Outlives the UTC day it counts, so the key is never dropped while that day is still running.
const DAILY_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

type TOrgInviteQuotaFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "incrementByIfUnderLimitWithFixedExpiry" | "getItem">;
  licenseService: Pick<TLicenseService, "getPlan" | "getLastKnownPlan">;
};

export type TOrgInviteQuota = ReturnType<typeof orgInviteQuotaFactory>;

export const orgInviteQuotaFactory = ({ keyStore, licenseService }: TOrgInviteQuotaFactoryDep) => {
  const $isCapped = async (orgId: string) => {
    if (!getConfig().isCloud) return false;

    const plan = await licenseService.getPlan(orgId);
    if (!plan.isFallback) return !plan.isPaid;

    const lastKnown = await licenseService.getLastKnownPlan(orgId);
    return !(lastKnown?.plan ?? plan).isPaid;
  };

  const admit = async (orgId: string, count: number) => {
    if (count <= 0 || !(await $isCapped(orgId))) return;

    const day = new Date().toISOString().slice(0, 10);
    const key = KeyStorePrefixes.OrgInviteDailyCount(orgId, day);
    const total = await keyStore.incrementByIfUnderLimitWithFixedExpiry(
      key,
      count,
      FREE_ORG_DAILY_INVITE_LIMIT,
      DAILY_COUNTER_TTL_SECONDS
    );
    if (total !== -1) return;

    const used = Number(await keyStore.getItem(key)) || 0;
    const remaining = Math.max(0, FREE_ORG_DAILY_INVITE_LIMIT - used);
    logger.warn(
      `orgInviteQuota: free plan organization reached its daily invite limit [orgId=${orgId}] [day=${day}] [requested=${count}] [used=${used}]`
    );

    throw new DailyQuotaExceededError({
      message:
        remaining === 0
          ? `Organizations on the free plan can send up to ${FREE_ORG_DAILY_INVITE_LIMIT} invitations per day, and this organization has sent all of today's. Try again after 00:00 UTC, or upgrade your plan to remove the limit.`
          : `Organizations on the free plan can send up to ${FREE_ORG_DAILY_INVITE_LIMIT} invitations per day. This organization has ${remaining} left today, so invite at most ${remaining} more people, or upgrade your plan to remove the limit.`
    });
  };

  return { admit };
};
