import { Knex } from "knex";

import { Plan, PlanLimit, TLicenseService } from "@app/domains/platform/license/ce/module";
import { KeyStorePrefixes, PgSqlLock, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, DailyQuotaExceededError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TOrgMembershipDALFactory } from "@app/services/org-membership/org-membership-dal";

export const MAX_NEW_MEMBERS_PER_INVITE = 10;
export const FREE_ORG_DAILY_INVITE_LIMIT = 50;

// Outlives the UTC day it counts, so the key is never dropped while that day is still running.
const DAILY_COUNTER_TTL_SECONDS = 2 * 24 * 60 * 60;

type TOrgInviteQuotaFactoryDep = {
  keyStore: Pick<TKeyStoreFactory, "incrementByIfUnderLimitWithFixedExpiry" | "incrementBy" | "getItemPrimary">;
  licenseService: Pick<TLicenseService, "getPlan" | "getLastKnownPlan">;
  orgMembershipDAL: Pick<TOrgMembershipDALFactory, "countSeatHolders">;
};

export type TOrgInviteReservation = { release: () => Promise<void> };

export type TOrgInviteQuota = ReturnType<typeof orgInviteQuotaFactory>;

const noReservation: TOrgInviteReservation = { release: async () => {} };

export const orgInviteQuotaFactory = ({ keyStore, licenseService, orgMembershipDAL }: TOrgInviteQuotaFactoryDep) => {
  const $getFreePlan = async (orgId: string): Promise<Plan | null> => {
    if (!getConfig().isCloud) return null;

    let plan = await licenseService.getPlan(orgId);
    if (plan.isFallback) {
      const lastKnown = await licenseService.getLastKnownPlan(orgId);
      plan = lastKnown?.plan ?? plan;
    }
    return plan.isPaid ? null : plan;
  };

  const getSeatPlan = async (orgId: string): Promise<Plan | null> => {
    const plan = await $getFreePlan(orgId);
    return plan?.isLimited(PlanLimit.Identities) ? plan : null;
  };

  const assertSeatsForInvites = async (
    { orgId, plan, count }: { orgId: string; plan: Plan | null; count: number },
    tx: Knex
  ) => {
    if (!plan || count <= 0) return;

    await tx.raw("SELECT pg_advisory_xact_lock(?)", [PgSqlLock.OrgInviteSeats(orgId)]);
    const held = await orgMembershipDAL.countSeatHolders(orgId, tx);
    if (!plan.exceeds(PlanLimit.Identities, held, count)) return;

    const limit = plan.limit(PlanLimit.Identities) as number;
    const remaining = Math.max(0, limit - held);
    throw new BadRequestError({
      name: "InviteUser",
      message:
        remaining === 0
          ? `Organizations on the free plan can have up to ${limit} members and machine identities, and pending invitations count toward that. This organization has none left. Revoke a pending invitation or upgrade your plan to add more.`
          : `Organizations on the free plan can have up to ${limit} members and machine identities, and pending invitations count toward that. This organization has ${remaining} left, so invite at most ${remaining} more people, revoke a pending invitation, or upgrade your plan to add more.`
    });
  };

  const admit = async (orgId: string, count: number): Promise<TOrgInviteReservation> => {
    if (count <= 0 || !(await $getFreePlan(orgId))) return noReservation;

    const day = new Date().toISOString().slice(0, 10);
    const key = KeyStorePrefixes.OrgInviteDailyCount(orgId, day);
    const total = await keyStore.incrementByIfUnderLimitWithFixedExpiry(
      key,
      count,
      FREE_ORG_DAILY_INVITE_LIMIT,
      DAILY_COUNTER_TTL_SECONDS
    );
    if (total !== -1) {
      return {
        release: async () => {
          try {
            await keyStore.incrementBy(key, -count);
          } catch (error) {
            logger.error(error, `orgInviteQuota: failed to release invite reservation [orgId=${orgId}] [day=${day}]`);
          }
        }
      };
    }

    const used = Number(await keyStore.getItemPrimary(key)) || 0;
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

  return { admit, getSeatPlan, assertSeatsForInvites };
};
