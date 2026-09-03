import { CronJob } from "cron";
import { Knex } from "knex";

import { OrganizationActionScope } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { verifyOfflineLicense } from "@app/lib/crypto";
import { applyJitter } from "@app/lib/dates";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { UserIdentities } from "@app/services/license-client";
import { projectV2ToFeatureSet } from "@app/services/license-client/entitlement-projection";
import { TLicenseClientFactory } from "@app/services/license-client/license-client";
import { TUsageMeteringServiceFactory } from "@app/services/license-client/usage";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { TLicenseDALFactory } from "./license-dal";
import { getDefaultOnPremFeatures, getLicenseKeyConfig } from "./license-fns";
import {
  InstanceType,
  LicenseType,
  TFeatureSet,
  TOfflineLicense,
  TOfflineLicenseContents,
  TOrgPlanDTO,
  TOrgSeatUsage
} from "./license-types";

type TLicenseServiceFactoryDep = {
  envConfig: Pick<TEnvConfig, "LICENSE_KEY" | "LICENSE_KEY_OFFLINE" | "LICENSE_SERVER_V2_SERVICE_KEY" | "isCloud">;
  orgDAL: Pick<TOrgDALFactory, "findRootOrgDetails">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseDAL: Pick<TLicenseDALFactory, "countBillableOrgActors">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "setItemWithExpiryNX" | "getItems" | "deleteItem">;
  projectDAL: Pick<TProjectDALFactory, "countOfBillableOrgProjects">;
  licenseClient?: Pick<
    TLicenseClientFactory,
    "getEntitlements" | "getSubscription" | "refreshEntitlements" | "cancelSubscription" | "invalidateEntitlements"
  >;
  usageMeteringService?: Pick<TUsageMeteringServiceFactory, "emit" | "reconcile">;
};

export type TLicenseServiceFactory = ReturnType<typeof licenseServiceFactory>;

// A self-hosted v2 license is single-tenant: the license key identifies the tenant, so entitlement
// reads carry no real org id. This fixed id only keys the local entitlement cache for the instance.
const SELF_HOSTED_LICENSE_ORG_ID = "self-hosted";

const jitteredLicenseCloudPlanTtl = () => applyJitter(KeyStoreTtls.LicenseCloudPlanInSeconds, 90);

export const licenseServiceFactory = ({
  orgDAL,
  permissionService,
  licenseDAL,
  keyStore,
  projectDAL,
  envConfig,
  licenseClient,
  usageMeteringService
}: TLicenseServiceFactoryDep) => {
  let instanceType = InstanceType.OnPrem;
  let onPremFeatures: TFeatureSet = getDefaultOnPremFeatures();
  let selfHostedLicense: TOfflineLicense | null = null;
  const licenseKeyConfig = getLicenseKeyConfig(envConfig);

  // Self-hosted online license: project the license's entitlements (from License Server v2) into the v1
  // feature shape and refresh the instance-wide onPremFeatures.
  const syncSelfHostedFeatures = async (shouldThrow: boolean = false) => {
    logger.info("Start syncing self-hosted license features from License Server v2");
    try {
      if (!licenseClient) {
        throw new BadRequestError({ message: "License Server v2 client is not configured" });
      }

      const entitlements = await licenseClient.getEntitlements({ id: SELF_HOSTED_LICENSE_ORG_ID });
      if (!entitlements) {
        throw new BadRequestError({ message: "License Server v2 entitlements are unavailable" });
      }
      const currentPlan = projectV2ToFeatureSet(getDefaultOnPremFeatures(), entitlements);

      onPremFeatures = currentPlan;
      logger.info("Successfully synced self-hosted license features from License Server v2");
    } catch (error) {
      logger.error(error, "Failed to sync self-hosted license features from License Server v2");
      if (shouldThrow) throw error;
    }
  };

  const init = async () => {
    try {
      if (envConfig.LICENSE_SERVER_V2_SERVICE_KEY) {
        instanceType = InstanceType.Cloud;
        logger.info(`Instance type: ${InstanceType.Cloud}`);
        return;
      }

      // Self-hosted online license: features resolve from License Server v2. The key authenticates via
      // the token endpoint (handled inside the license client); a successful entitlements sync validates it.
      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Online) {
        await syncSelfHostedFeatures(true);
        instanceType = InstanceType.EnterpriseOnPrem;
        logger.info(`Instance type: ${InstanceType.EnterpriseOnPrem}`);
        return;
      }

      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline) {
        let isValidOfflineLicense = true;
        const contents = JSON.parse(
          Buffer.from(licenseKeyConfig.licenseKey, "base64").toString("utf8")
        ) as TOfflineLicenseContents;
        const isVerified = await verifyOfflineLicense(JSON.stringify(contents.license), contents.signature);

        if (!isVerified) {
          isValidOfflineLicense = false;
          logger.warn(`Infisical EE offline license verification failed`);
        }

        if (contents.license.terminatesAt) {
          const terminationDate = new Date(contents.license.terminatesAt);
          if (terminationDate < new Date()) {
            isValidOfflineLicense = false;
            logger.warn(`Infisical EE offline license has expired`);
          }
        }

        if (isValidOfflineLicense) {
          // v2 offline licenses carry License Server v2 entitlements; project them into the feature
          // shape. A v1 feature set is a snapshot frozen when the key was issued, so it is layered over
          // current defaults: otherwise every flag added since reads as undefined on an air-gapped
          // instance, withdrawing features the license paid for.
          const features =
            contents.license.version === 2 && contents.license.entitlements
              ? projectV2ToFeatureSet(getDefaultOnPremFeatures(), contents.license.entitlements)
              : { ...getDefaultOnPremFeatures(), ...contents.license.features };

          onPremFeatures = {
            ...features,
            slug: "enterprise",
            isOffline: true
          };
          instanceType = InstanceType.EnterpriseOnPremOffline;
          logger.info(`Instance type: ${InstanceType.EnterpriseOnPremOffline}`);
          selfHostedLicense = contents.license;
        }
      }

      // anything that reaches here without setting an instance type is the self-hosted OSS version,
      // which keeps the default onPremFeatures.
    } catch (error) {
      logger.error(error, `init-license: encountered an error when init license`);
    }
  };

  const initializeBackgroundSync = async () => {
    if (licenseKeyConfig?.isValid && licenseKeyConfig?.type === LicenseType.Online) {
      logger.info("Setting up background sync process to refresh onPremFeatures from License Server v2");
      const job = new CronJob("*/10 * * * *", () => syncSelfHostedFeatures());
      job.start();
      return job;
    }
  };

  const getOrgSeatUsage = async (orgId: string, tx?: Knex): Promise<TOrgSeatUsage> => {
    let scopedOrgId: string | null = null;
    if (instanceType === InstanceType.Cloud) {
      const org = tx
        ? await orgDAL.findRootOrgDetails(orgId, tx)
        : await requestMemoize(requestMemoKeys.orgFindRootOrgDetails(orgId), () => orgDAL.findRootOrgDetails(orgId));
      if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
      scopedOrgId = org.id;
    }

    const { users, identities } = await licenseDAL.countBillableOrgActors(scopedOrgId, tx);
    return { membersUsed: users, identitiesUsed: users + identities };
  };

  // Fetches the org's cloud plan fresh (v2 entitlements projected into the v1 shape), enriches it with
  // the live project count, writes it to the plan cache, and returns it. Throws on any failure — it
  // never persists the free-tier fallback itself, so callers control that decision.
  const fetchAndCacheCloudPlan = async (orgId: string): Promise<TFeatureSet> => {
    const org = await requestMemoize(requestMemoKeys.orgFindRootOrgDetails(orgId), () =>
      orgDAL.findRootOrgDetails(orgId)
    );
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
    const rootOrgId = org.id;

    // Serve from the License Server, projected into the legacy plan shape so getPlan callers are unchanged.
    if (!licenseClient) {
      throw new BadRequestError({ message: "License Server client is not configured" });
    }
    const entitlements = await licenseClient.getEntitlements({ id: rootOrgId, name: org.name, slug: org.slug });
    if (!entitlements) {
      throw new BadRequestError({ message: "License Server entitlements are unavailable" });
    }
    const currentPlan = projectV2ToFeatureSet(getDefaultOnPremFeatures(), entitlements);

    currentPlan.workspacesUsed = await projectDAL.countOfBillableOrgProjects(rootOrgId);

    await keyStore.setItemWithExpiry(
      KeyStorePrefixes.LicenseCloudPlan(org.id),
      jitteredLicenseCloudPlanTtl(),
      JSON.stringify(currentPlan)
    );

    return currentPlan;
  };

  // Stale-while-revalidate refresh fired (fire-and-forget) when a cache hit carries the passThrough
  // marker a billing mutation set. Single-flight via a self-expiring NX lock, which doubles as a
  // throttle (at most one refresh per org per lock window). Recomputes and overwrites the plan cache
  // only on success — it never deletes the existing valid plan first, so a transient License Server / DB
  // failure can't downgrade a paid org to the free-tier fallback mid-refresh. Never throws.
  const revalidatePlanInBackground = async (orgId: string) => {
    try {
      const acquired = await keyStore.setItemWithExpiryNX(
        KeyStorePrefixes.LicenseCacheRevalidateLock(orgId),
        KeyStoreTtls.LicenseCacheRevalidateLockInSeconds,
        "1"
      );
      if (acquired !== "OK") {
        return;
      }

      await fetchAndCacheCloudPlan(orgId);
    } catch (error) {
      logger.error(error, `getPlan: background revalidation failed [orgId=${orgId}]`);
    }
  };

  const getPlan = async (orgId: string, projectId?: string) => {
    logger.info(`getPlan: attempting to fetch plan for [orgId=${orgId}] [projectId=${projectId}]`);
    try {
      if (instanceType === InstanceType.Cloud) {
        // One MGET for the plan cache + the two markers instead of three separate round-trips.
        const [cachedPlan, passThrough, reconcileMarker] = await keyStore.getItems([
          KeyStorePrefixes.LicenseCloudPlan(orgId),
          KeyStorePrefixes.LicenseCachePassThrough(orgId),
          KeyStorePrefixes.LicenseUsageReconcileMarker(orgId)
        ]);

        // Demand-driven usage reconciliation: for a billable org (a paid plan → non-null slug) that
        // hasn't been reconciled this interval, re-emit its meters in the background. reconcile()
        // self-throttles on the same marker, so this is a no-op on the vast majority of calls and never
        // blocks the request. Free orgs (null slug) never enter the reconcile path.
        const maybeReconcile = (plan: TFeatureSet) => {
          if (!reconcileMarker && plan.slug) {
            usageMeteringService?.reconcile(orgId);
          }
        };

        if (cachedPlan) {
          // A billing mutation flagged this org: serve the cached plan now but kick a background refresh
          // so the cache converges as the license server reconciles, instead of waiting out the TTL.
          if (passThrough) {
            void revalidatePlanInBackground(orgId);
          }
          const plan = JSON.parse(cachedPlan) as TFeatureSet;
          maybeReconcile(plan);
          logger.info(`getPlan: plan fetched from cache [orgId=${orgId}] [projectId=${projectId}]`);
          return plan;
        }

        const currentPlan = await fetchAndCacheCloudPlan(orgId);
        maybeReconcile(currentPlan);
        return currentPlan;
      }
    } catch (error) {
      logger.error(
        error,
        `getPlan: encountered an error when fetching pan [orgId=${orgId}] [projectId=${projectId}] [error]`
      );
      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.LicenseCloudPlan(orgId),
        jitteredLicenseCloudPlanTtl(),
        JSON.stringify(onPremFeatures)
      );
      return onPremFeatures;
    } finally {
      logger.info(`getPlan: Process done for [orgId=${orgId}] [projectId=${projectId}]`);
    }
    return onPremFeatures;
  };

  const refreshPlan = async (orgId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.LicenseCloudPlan(orgId));
    if (instanceType === InstanceType.Cloud) {
      await getPlan(orgId);
    }
    if (instanceType === InstanceType.EnterpriseOnPrem) {
      // Bust the license server's cached entitlements (e.g. after a license change), then re-sync.
      await licenseClient?.refreshEntitlements({ id: SELF_HOSTED_LICENSE_ORG_ID });
      await syncSelfHostedFeatures(true);
    }
  };

  // Called after an org is deleted so it stops billing. Cloud-only
  const cancelOrgSubscription = async (orgId: string) => {
    if (!envConfig.isCloud) {
      return;
    }

    try {
      await licenseClient?.cancelSubscription(orgId);
    } catch (error) {
      if (error instanceof BadRequestError) {
        logger.info(`cancelOrgSubscription: no subscription to cancel [orgId=${orgId}]`);
      } else {
        throw error;
      }
    }

    await licenseClient?.invalidateEntitlements(orgId);
  };

  const updateSubscriptionOrgMemberCount = async (orgId: string, tx?: Knex) => {
    const org = await orgDAL.findRootOrgDetails(orgId, tx);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    const rootOrgId = org.id;

    // This is the single "org member count changed" signal in the codebase (invite/signup, SSO/SCIM
    // provisioning, member removal all call it), so emit the user-seat meter here. Fire-and-forget and
    // no-op when no license server is configured; extra fires on identity-only changes re-count and
    // report-only-if-changed, so they're harmless.
    usageMeteringService?.emit(rootOrgId, UserIdentities.key);

    await refreshPlan(rootOrgId);
  };

  const getOrgPlan = async ({
    orgId,
    actor,
    actorId,
    actorOrgId,
    rootOrgId,
    actorAuthMethod,
    projectId,
    refreshCache
  }: TOrgPlanDTO) => {
    await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.Any
    });
    if (refreshCache) {
      await refreshPlan(rootOrgId);
    }
    const plan = await getPlan(rootOrgId, projectId);
    return plan;
  };

  const invalidateGetPlan = async (orgId: string) => {
    await keyStore.deleteItem(KeyStorePrefixes.LicenseCloudPlan(orgId));
  };

  const getCustomerId = () => {
    if (!selfHostedLicense) return "unknown";
    return selfHostedLicense?.customerId;
  };

  const getLicenseId = () => {
    if (!selfHostedLicense) return "unknown";
    return selfHostedLicense?.licenseId;
  };

  return {
    cancelOrgSubscription,
    init,
    getInstanceType() {
      return instanceType;
    },
    get onPremFeatures() {
      return onPremFeatures;
    },
    getPlan,
    getOrgSeatUsage,
    getCustomerId,
    getLicenseId,
    invalidateGetPlan,
    updateSubscriptionOrgMemberCount,
    getOrgPlan,
    initializeBackgroundSync
  };
};
