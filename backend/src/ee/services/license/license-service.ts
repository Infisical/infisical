/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable @typescript-eslint/no-unsafe-assignment

// TODO(akhilmhdh): With tony find out the api structure and fill it here

import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";
import { CronJob } from "cron";
import { Knex } from "knex";

import { OrganizationActionScope } from "@app/db/schemas";
import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { verifyOfflineLicense } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { TDualReadServiceFactory } from "@app/services/license-client/dual-read/dual-read-service";
import { projectV2ToFeatureSet } from "@app/services/license-client/dual-read/entitlement-projection";
import { TLicenseClientFactory } from "@app/services/license-client/license-client";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { OrgPermissionBillingActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { BillingPlanRows, BillingPlanTableHead } from "./licence-enums";
import { TLicenseDALFactory } from "./license-dal";
import { getDefaultOnPremFeatures, getLicenseKeyConfig, setupLicenseRequestWithStore } from "./license-fns";
import {
  InstanceType,
  LicenseType,
  TAddOrgPmtMethodDTO,
  TAddOrgTaxIdDTO,
  TCreateOrgPortalSession,
  TDelOrgPmtMethodDTO,
  TDelOrgTaxIdDTO,
  TFeatureSet,
  TGetOrgBillInfoDTO,
  TGetOrgTaxIdDTO,
  TOfflineLicense,
  TOfflineLicenseContents,
  TOrgInvoiceDTO,
  TOrgLicensesDTO,
  TOrgPlanDTO,
  TOrgPlansTableDTO,
  TOrgPmtMethodsDTO,
  TPlanBillingInfo,
  TStartOrgTrialDTO,
  TUpdateOrgBillingDetailsDTO
} from "./license-types";

type TLicenseServiceFactoryDep = {
  envConfig: Pick<
    TEnvConfig,
    | "LICENSE_SERVER_URL"
    | "LICENSE_SERVER_KEY"
    | "LICENSE_KEY"
    | "LICENSE_KEY_OFFLINE"
    | "INTERNAL_REGION"
    | "SITE_URL"
    | "LICENSE_SERVER_V2_MODE"
    | "LICENSE_SERVER_V2_SERVICE_KEY"
    | "DISABLE_LICENSE_V1_CLOUD"
  >;
  orgDAL: Pick<TOrgDALFactory, "findRootOrgDetails" | "countAllOrgMembers" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseDAL: TLicenseDALFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  projectDAL: TProjectDALFactory;
  licenseClient?: Pick<TLicenseClientFactory, "getEntitlements" | "getSubscription" | "refreshEntitlements">;
  licenseDualRead?: Pick<TDualReadServiceFactory, "compareInBackground">;
};

export type TLicenseServiceFactory = ReturnType<typeof licenseServiceFactory>;

const LICENSE_SERVER_CLOUD_LOGIN = "/api/auth/v1/license-server-login";
const LICENSE_SERVER_ON_PREM_LOGIN = "/api/auth/v1/license-login";

// A self-hosted v2 license is single-tenant: the license key identifies the tenant, so entitlement
// reads carry no real org id. This fixed id only keys the local entitlement cache for the instance.
const SELF_HOSTED_LICENSE_ORG_ID = "self-hosted";

export const licenseServiceFactory = ({
  orgDAL,
  permissionService,
  licenseDAL,
  keyStore,
  projectDAL,
  envConfig,
  licenseClient,
  licenseDualRead
}: TLicenseServiceFactoryDep) => {
  let isValidLicense = false;
  let instanceType = InstanceType.OnPrem;
  let onPremFeatures: TFeatureSet = getDefaultOnPremFeatures();
  let selfHostedLicense: TOfflineLicense | null = null;
  const licenseKeyConfig = getLicenseKeyConfig(envConfig);

  const licenseServerCloudApi = setupLicenseRequestWithStore(
    envConfig.LICENSE_SERVER_URL || "",
    LICENSE_SERVER_CLOUD_LOGIN,
    envConfig.LICENSE_SERVER_KEY || "",
    envConfig.INTERNAL_REGION
  );

  const onlineLicenseKey =
    licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Online ? licenseKeyConfig.licenseKey : "";

  const licenseServerOnPremApi = setupLicenseRequestWithStore(
    envConfig.LICENSE_SERVER_URL || "",
    LICENSE_SERVER_ON_PREM_LOGIN,
    onlineLicenseKey,
    envConfig.INTERNAL_REGION
  );

  const syncLicenseKeyOnPremFeatures = async (shouldThrow: boolean = false) => {
    logger.info("Start syncing license key features");
    try {
      const {
        data: { currentPlan }
      } = await licenseServerOnPremApi.request.get<{ currentPlan: TFeatureSet }>("/api/license/v1/plan");

      const workspacesUsed = await projectDAL.countOfBillableOrgProjects(null);
      currentPlan.workspacesUsed = workspacesUsed;

      const usedIdentitySeats = await licenseDAL.countOrgUsersAndIdentities(null);
      if (usedIdentitySeats !== currentPlan.identitiesUsed) {
        const usedSeats = await licenseDAL.countOfOrgMembers(null);
        await licenseServerOnPremApi.request.patch(`/api/license/v1/license`, {
          usedSeats,
          usedIdentitySeats
        });
        currentPlan.identitiesUsed = usedIdentitySeats;
        currentPlan.membersUsed = usedSeats;
      }

      onPremFeatures = currentPlan;
      logger.info("Successfully synchronized license key features");
    } catch (error) {
      logger.error(error, "Failed to synchronize license key features");
      if (shouldThrow) throw error;
    }
  };

  // Self-hosted equivalent of syncLicenseKeyOnPremFeatures, but sourced from License Server v2: project
  // the license's entitlements into the v1 feature shape and refresh the instance-wide onPremFeatures.
  const syncSelfHostedV2Features = async (shouldThrow: boolean = false) => {
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

      // The entitlement projection only carries feature flags; derive the plan tier from the
      // subscription/contract view. Non-fatal so a subscription read failure keeps the features.
      try {
        const subscription = await licenseClient.getSubscription(SELF_HOSTED_LICENSE_ORG_ID);
        const paidTiers = (subscription?.items ?? [])
          .map((item) => item.plan.toLowerCase())
          .filter((tier) => tier !== "free");
        if (paidTiers.some((tier) => tier.includes("enterprise"))) {
          currentPlan.slug = "enterprise";
        } else if (paidTiers.some((tier) => tier.includes("advanced"))) {
          currentPlan.slug = "advanced";
        } else if (paidTiers.length > 0) {
          currentPlan.slug = "pro";
        }
      } catch (error) {
        logger.error(error, "syncSelfHostedV2Features: failed to resolve plan tier from subscription");
      }

      // Usage is instance-wide for self-hosted (null orgId aggregates the whole instance), as in the v1 sync.
      currentPlan.workspacesUsed = await projectDAL.countOfBillableOrgProjects(null);
      currentPlan.membersUsed = await licenseDAL.countOfOrgMembers(null);
      currentPlan.identitiesUsed = await licenseDAL.countOrgUsersAndIdentities(null);

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
        isValidLicense = true;
        return;
      }

      if (envConfig.LICENSE_SERVER_KEY) {
        const token = await licenseServerCloudApi.refreshLicense();
        if (token) instanceType = InstanceType.Cloud;
        logger.info(`Instance type: ${InstanceType.Cloud}`);
        isValidLicense = true;
        return;
      }

      // New self-hosted key (prefix "infisical_lk_") resolves features from License Server v2. The key
      // authenticates directly (no on-prem login handshake); a successful entitlements sync validates it.
      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.OnlineV2) {
        await syncSelfHostedV2Features(true);
        instanceType = InstanceType.EnterpriseOnPremV2;
        logger.info(`Instance type: ${InstanceType.EnterpriseOnPremV2}`);
        isValidLicense = true;
        return;
      }

      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Online) {
        const token = await licenseServerOnPremApi.refreshLicense();
        if (token) {
          await syncLicenseKeyOnPremFeatures(true);
          instanceType = InstanceType.EnterpriseOnPrem;
          logger.info(`Instance type: ${InstanceType.EnterpriseOnPrem}`);
          isValidLicense = true;
        }
        return;
      }

      if (licenseKeyConfig.isValid && licenseKeyConfig.type === LicenseType.Offline) {
        let isValidOfflineLicense = true;
        const contents: TOfflineLicenseContents = JSON.parse(
          Buffer.from(licenseKeyConfig.licenseKey, "base64").toString("utf8")
        );
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
          onPremFeatures = {
            ...contents.license.features,
            slug: "enterprise"
          };
          instanceType = InstanceType.EnterpriseOnPremOffline;
          logger.info(`Instance type: ${InstanceType.EnterpriseOnPremOffline}`);
          isValidLicense = true;
          selfHostedLicense = contents.license;
          return;
        }
      }

      // this means this is the self-hosted oss version
      // else it would reach catch statement
      isValidLicense = true;
    } catch (error) {
      logger.error(error, `init-license: encountered an error when init license`);
    }
  };

  const initializeBackgroundSync = async () => {
    if (licenseKeyConfig?.isValid && licenseKeyConfig?.type === LicenseType.Online) {
      logger.info("Setting up background sync process for refresh onPremFeatures");
      const job = new CronJob("*/10 * * * *", syncLicenseKeyOnPremFeatures);
      job.start();
      return job;
    }
    if (licenseKeyConfig?.isValid && licenseKeyConfig?.type === LicenseType.OnlineV2) {
      logger.info("Setting up background sync process for refresh onPremFeatures from License Server v2");
      const job = new CronJob("*/10 * * * *", () => syncSelfHostedV2Features());
      job.start();
      return job;
    }
  };

  const getPlan = async (orgId: string, projectId?: string) => {
    logger.info(`getPlan: attempting to fetch plan for [orgId=${orgId}] [projectId=${projectId}]`);
    try {
      if (instanceType === InstanceType.Cloud) {
        const cachedPlan = await keyStore.getItem(KeyStorePrefixes.LicenseCloudPlan(orgId));
        if (cachedPlan) {
          logger.info(`getPlan: plan fetched from cache [orgId=${orgId}] [projectId=${projectId}]`);
          return JSON.parse(cachedPlan) as TFeatureSet;
        }

        const org = await orgDAL.findRootOrgDetails(orgId);
        if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
        const rootOrgId = org.id;

        let currentPlan: TFeatureSet;
        if (envConfig.LICENSE_SERVER_V2_MODE === "on") {
          // Serve from License Server v2, projected into the v1 plan shape so getPlan callers are unchanged.
          if (!licenseClient) {
            throw new BadRequestError({ message: "License Server v2 client is not configured" });
          }
          const entitlements = await licenseClient.getEntitlements({ id: rootOrgId, name: org.name, slug: org.slug });
          if (!entitlements) {
            throw new BadRequestError({ message: "License Server v2 entitlements are unavailable" });
          }
          currentPlan = projectV2ToFeatureSet(getDefaultOnPremFeatures(), entitlements);

          // The entitlement projection only carries feature flags, so set the plan slug from the
          // subscription tier; otherwise the org-level plan label can't reflect the real tier. Keep
          // it non-fatal so a subscription read failure doesn't drop the org to the free fallback.
          try {
            const subscription = await licenseClient.getSubscription(rootOrgId);
            const paidTiers = (subscription?.items ?? [])
              .map((item) => item.plan.toLowerCase())
              .filter((tier) => tier !== "free");
            if (paidTiers.some((tier) => tier.includes("enterprise"))) {
              currentPlan.slug = "enterprise";
            } else if (paidTiers.some((tier) => tier.includes("advanced"))) {
              currentPlan.slug = "advanced";
            } else if (paidTiers.length > 0) {
              currentPlan.slug = "pro";
            }
          } catch (error) {
            logger.error(error, `getPlan: failed to resolve plan tier from subscription [orgId=${rootOrgId}]`);
          }
        } else {
          const {
            data: { currentPlan: v1Plan }
          } = await licenseServerCloudApi.request.get<{ currentPlan: TFeatureSet }>(
            `/api/license-server/v1/customers/${org.customerId}/cloud-plan`
          );
          currentPlan = v1Plan;
        }

        currentPlan.workspacesUsed = await projectDAL.countOfBillableOrgProjects(rootOrgId);

        const membersUsed = await licenseDAL.countOfOrgMembers(rootOrgId);
        currentPlan.membersUsed = membersUsed;
        const identityUsed = await licenseDAL.countOrgUsersAndIdentities(rootOrgId);

        // Seat sync targets the v1 license server only; v2 derives usage from registered counters.
        if (
          envConfig.LICENSE_SERVER_V2_MODE !== "on" &&
          currentPlan?.identitiesUsed &&
          currentPlan.identitiesUsed !== identityUsed
        ) {
          try {
            await licenseServerCloudApi.request.patch(`/api/license-server/v1/customers/${org.customerId}/cloud-plan`, {
              quantity: membersUsed,
              quantityIdentities: identityUsed
            });
          } catch (error) {
            logger.error(
              error,
              `Update seats used: encountered an error when updating plan for customer [customerId=${org.customerId}]`
            );
          }
        }
        currentPlan.identitiesUsed = identityUsed;

        await keyStore.setItemWithExpiry(
          KeyStorePrefixes.LicenseCloudPlan(org.id),
          KeyStoreTtls.LicenseCloudPlanInSeconds,
          JSON.stringify(currentPlan)
        );

        // read-compare bake: serve v1 but shadow-compare against v2 in the background ahead of the cutover.
        if (envConfig.LICENSE_SERVER_V2_MODE === "read-compare") {
          licenseDualRead?.compareInBackground(rootOrgId, currentPlan);
        }

        return currentPlan;
      }
    } catch (error) {
      logger.error(
        error,
        `getPlan: encountered an error when fetching pan [orgId=${orgId}] [projectId=${projectId}] [error]`
      );
      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.LicenseCloudPlan(orgId),
        KeyStoreTtls.LicenseCloudPlanInSeconds,
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
      await syncLicenseKeyOnPremFeatures(true);
    }
    if (instanceType === InstanceType.EnterpriseOnPremV2) {
      // Bust the license server's cached entitlements (e.g. after a license change), then re-sync.
      await licenseClient?.refreshEntitlements({ id: SELF_HOSTED_LICENSE_ORG_ID });
      await syncSelfHostedV2Features(true);
    }
  };

  const generateOrgCustomerId = async (orgName: string, email?: string | null) => {
    if (instanceType === InstanceType.Cloud && envConfig.LICENSE_SERVER_KEY) {
      const {
        data: { customerId }
      } = await licenseServerCloudApi.request.post<{ customerId: string }>(
        "/api/license-server/v1/customers",
        {
          email: email ?? "",
          name: orgName
        },
        { timeout: 5000, signal: AbortSignal.timeout(5000) }
      );
      return customerId;
    }
  };

  const removeOrgCustomer = async (customerId: string) => {
    await licenseServerCloudApi.request.delete(`/api/license-server/v1/customers/${customerId}`);
  };

  const updateSubscriptionOrgMemberCount = async (orgId: string, tx?: Knex) => {
    const org = await orgDAL.findRootOrgDetails(orgId, tx);
    if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

    const rootOrgId = org.id;
    if (instanceType === InstanceType.Cloud && envConfig.LICENSE_SERVER_KEY) {
      const quantity = await licenseDAL.countOfOrgMembers(rootOrgId, tx);
      const quantityIdentities = await licenseDAL.countOrgUsersAndIdentities(rootOrgId, tx);
      if (org?.customerId) {
        await licenseServerCloudApi.request.patch(`/api/license-server/v1/customers/${org.customerId}/cloud-plan`, {
          quantity,
          quantityIdentities
        });
      }
      await keyStore.deleteItem(KeyStorePrefixes.LicenseCloudPlan(rootOrgId));
    } else if (instanceType === InstanceType.EnterpriseOnPrem) {
      const usedSeats = await licenseDAL.countOfOrgMembers(null, tx);
      const usedIdentitySeats = await licenseDAL.countOrgUsersAndIdentities(null, tx);
      onPremFeatures.membersUsed = usedSeats;
      onPremFeatures.identitiesUsed = usedIdentitySeats;
      await licenseServerOnPremApi.request.patch(`/api/license/v1/license`, {
        usedSeats,
        usedIdentitySeats
      });
    } else if (instanceType === InstanceType.EnterpriseOnPremV2) {
      // v2 self-hosted reports usage asynchronously via the usage-snapshot queue, not a synchronous seat
      // patch; keep the in-memory counts current so limit checks are accurate until the next sync.
      onPremFeatures.membersUsed = await licenseDAL.countOfOrgMembers(null, tx);
      onPremFeatures.identitiesUsed = await licenseDAL.countOrgUsersAndIdentities(null, tx);
    }
    await refreshPlan(rootOrgId);
  };

  // below all are api calls
  const getOrgPlansTableByBillCycle = async ({
    orgId,
    actor,
    actorId,
    actorOrgId,
    actorAuthMethod,
    billingCycle
  }: TOrgPlansTableDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);
    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
    );
    return data;
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

  const startOrgTrial = async ({
    orgId,
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    success_url
  }: TStartOrgTrialDTO) => {
    if (envConfig.DISABLE_LICENSE_V1_CLOUD) {
      throw new BadRequestError({
        message: "We're currently updating our license system. Please check back again later."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    await updateSubscriptionOrgMemberCount(orgId);

    const {
      data: { url }
    } = await licenseServerCloudApi.request.post(
      `/api/license-server/v1/customers/${organization.customerId}/session/trial`,
      { success_url }
    );
    await keyStore.deleteItem(KeyStorePrefixes.LicenseCloudPlan(orgId));
    return { url };
  };

  const createOrganizationPortalSession = async ({
    orgId,
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId
  }: TCreateOrgPortalSession) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: "Organization not found"
      });
    }

    const {
      data: { pmtMethods }
    } = await licenseServerCloudApi.request.get<{ pmtMethods: string[] }>(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods`
    );

    if (pmtMethods.length < 1) {
      // case: organization has no payment method on file
      // -> redirect to add payment method portal
      const {
        data: { url }
      } = await licenseServerCloudApi.request.post(
        `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods`,
        {
          success_url: `${envConfig.SITE_URL}/organizations/${orgId}/billing`,
          cancel_url: `${envConfig.SITE_URL}/organizations/${orgId}/billing`
        }
      );

      return { url };
    }
    // case: organization has payment method on file
    // -> redirect to billing portal
    const {
      data: { url }
    } = await licenseServerCloudApi.request.post(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/billing-portal`,
      {
        return_url: `${envConfig.SITE_URL}/organizations/${orgId}/billing`
      }
    );

    return { url };
  };

  const getUsageMetrics = async (orgId: string) => {
    const [orgMembersUsed, identityUsed, projectCount] = await Promise.all([
      orgDAL.countAllOrgMembers(orgId),
      licenseDAL.countOfOrgIdentities(orgId),
      projectDAL.countOfBillableOrgProjects(orgId)
    ]);

    return {
      orgMembersUsed,
      identityUsed,
      projectCount,
      totalIdentities: identityUsed + orgMembersUsed
    };
  };

  const getOrgBillingInfo = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }
    if (instanceType === InstanceType.Cloud) {
      const { data } = await licenseServerCloudApi.request.get<TPlanBillingInfo>(
        `/api/license-server/v1/customers/${organization.customerId}/cloud-plan/billing`
      );
      const { identityUsed, orgMembersUsed } = await getUsageMetrics(orgId);

      return {
        ...data,
        users: orgMembersUsed,
        identities: identityUsed
      };
    }

    return {
      currentPeriodStart: selfHostedLicense?.issuedAt ? Date.parse(selfHostedLicense?.issuedAt) / 1000 : undefined,
      currentPeriodEnd: selfHostedLicense?.expiresAt ? Date.parse(selfHostedLicense?.expiresAt) / 1000 : undefined,
      interval: "month",
      intervalCount: 1,
      amount: 0,
      quantity: 1,
      users: 0,
      identities: 0
    };
  };

  const calculateUsageValue = (
    rowName: string,
    field: string,
    projectCount: number,
    totalIdentities: number
  ): string => {
    if (rowName === BillingPlanRows.WorkspaceLimit.name || field === BillingPlanRows.WorkspaceLimit.field) {
      return projectCount.toString();
    }
    if (rowName === BillingPlanRows.IdentityLimit.name || field === BillingPlanRows.IdentityLimit.field) {
      return totalIdentities.toString();
    }
    return "-";
  };

  const fetchPlanTableFromServer = async (customerId: string | null | undefined) => {
    const baseUrl = `/api/license-server/v1/customers`;

    if (instanceType === InstanceType.Cloud) {
      if (!customerId) {
        throw new NotFoundError({ message: "Organization customer ID is required for plan table retrieval" });
      }
      const { data } = await licenseServerCloudApi.request.get<{
        head: { name: string }[];
        rows: { name: string; allowed: boolean }[];
      }>(`${baseUrl}/${customerId}/cloud-plan/table`);
      return data;
    }

    if (instanceType === InstanceType.EnterpriseOnPrem) {
      const { data } = await licenseServerOnPremApi.request.get<{
        head: { name: string }[];
        rows: { name: string; allowed: boolean }[];
      }>(`${baseUrl}/on-prem-plan/table`);
      return data;
    }

    throw new Error(`Unsupported instance type for server-based plan table: ${instanceType}`);
  };

  // returns org current plan feature table
  const getOrgPlanTable = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const { projectCount, totalIdentities } = await getUsageMetrics(orgId);

    if (instanceType === InstanceType.Cloud || instanceType === InstanceType.EnterpriseOnPrem) {
      const tableResponse = await fetchPlanTableFromServer(organization.customerId);

      return {
        head: tableResponse.head,
        rows: tableResponse.rows.map((row) => ({
          ...row,
          used: calculateUsageValue(row.name, "", projectCount, totalIdentities)
        }))
      };
    }

    const mappedRows = Object.values(BillingPlanRows).map(({ name, field }) => ({
      name,
      allowed: onPremFeatures[field as keyof TFeatureSet] as boolean | number | null,
      used: calculateUsageValue(name, field, projectCount, totalIdentities)
    }));

    return {
      head: Object.values(BillingPlanTableHead),
      rows: mappedRows
    };
  };

  const getOrgBillingDetails = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details`
    );
    return data;
  };

  const updateOrgBillingDetails = async ({
    actorId,
    actor,
    actorOrgId,
    actorAuthMethod,
    orgId,
    name,
    email
  }: TUpdateOrgBillingDetailsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }
    const { data } = await licenseServerCloudApi.request.patch(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details`,
      {
        name,
        email
      }
    );
    return data;
  };

  const getOrgPmtMethods = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TOrgPmtMethodsDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const {
      data: { pmtMethods }
    } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods`
    );
    return pmtMethods;
  };

  const addOrgPmtMethods = async ({
    orgId,
    actor,
    actorId,
    actorAuthMethod,
    actorOrgId,
    success_url,
    cancel_url
  }: TAddOrgPmtMethodDTO) => {
    if (envConfig.DISABLE_LICENSE_V1_CLOUD) {
      throw new BadRequestError({
        message: "We're currently updating our license system. Please check back again later."
      });
    }

    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }
    const {
      data: { url }
    } = await licenseServerCloudApi.request.post(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods`,
      {
        success_url,
        cancel_url
      }
    );
    return { url };
  };

  const delOrgPmtMethods = async ({
    actorId,
    actor,
    actorAuthMethod,
    actorOrgId,
    orgId,
    pmtMethodId
  }: TDelOrgPmtMethodDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    try {
      const { data } = await licenseServerCloudApi.request.delete(
        `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods/${pmtMethodId}`
      );
      return data;
    } catch (error) {
      if (error instanceof AxiosError) {
        throw new BadRequestError({
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          message: `Failed to remove payment method: ${error.response?.data?.message}`
        });
      }
      throw new BadRequestError({
        message: "Unable to remove payment method"
      });
    }
  };

  const getOrgTaxIds = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }
    const {
      data: { tax_ids: taxIds }
    } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/tax-ids`
    );
    return taxIds;
  };

  const addOrgTaxId = async ({ actorId, actor, actorAuthMethod, actorOrgId, orgId, type, value }: TAddOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const { data } = await licenseServerCloudApi.request.post(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/tax-ids`,
      {
        type,
        value
      }
    );
    return data;
  };

  const delOrgTaxId = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId, taxId }: TDelOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const { data } = await licenseServerCloudApi.request.delete(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/tax-ids/${taxId}`
    );
    return data;
  };

  const getOrgTaxInvoices = async ({ actorId, actor, actorOrgId, actorAuthMethod, orgId }: TOrgInvoiceDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const {
      data: { invoices }
    } = await licenseServerCloudApi.request.get(`/api/license-server/v1/customers/${organization.customerId}/invoices`);
    return invoices;
  };

  const getOrgLicenses = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TOrgLicensesDTO) => {
    const { permission } = await permissionService.getOrgPermission({
      actorId,
      actor,
      orgId,
      actorOrgId,
      actorAuthMethod,
      scope: OrganizationActionScope.ParentOrganization
    });
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await requestMemoize(requestMemoKeys.orgFindById(orgId), () => orgDAL.findById(orgId));
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const {
      data: { licenses }
    } = await licenseServerCloudApi.request.get(`/api/license-server/v1/customers/${organization.customerId}/licenses`);
    return licenses;
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
    generateOrgCustomerId,
    removeOrgCustomer,
    init,
    get isValidLicense() {
      return isValidLicense;
    },
    getInstanceType() {
      return instanceType;
    },
    get onPremFeatures() {
      return onPremFeatures;
    },
    getPlan,
    getCustomerId,
    getLicenseId,
    invalidateGetPlan,
    updateSubscriptionOrgMemberCount,
    getOrgPlan,
    getOrgPlansTableByBillCycle,
    startOrgTrial,
    createOrganizationPortalSession,
    getOrgBillingInfo,
    getOrgPlanTable,
    getOrgBillingDetails,
    updateOrgBillingDetails,
    addOrgPmtMethods,
    delOrgPmtMethods,
    getOrgPmtMethods,
    getOrgLicenses,
    getOrgTaxInvoices,
    getOrgTaxIds,
    addOrgTaxId,
    delOrgTaxId,
    initializeBackgroundSync
  };
};
