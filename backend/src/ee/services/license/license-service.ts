/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable @typescript-eslint/no-unsafe-assignment

// TODO(akhilmhdh): With tony find out the api structure and fill it here

import { ForbiddenError } from "@casl/ability";
import { AxiosError } from "axios";
import { CronJob } from "cron";
import { Knex } from "knex";

import { OrganizationActionScope } from "@app/db/schemas";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { TEnvConfig } from "@app/lib/config/env";
import { verifyOfflineLicense } from "@app/lib/crypto";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
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
    "LICENSE_SERVER_URL" | "LICENSE_SERVER_KEY" | "LICENSE_KEY" | "LICENSE_KEY_OFFLINE" | "INTERNAL_REGION" | "SITE_URL"
  >;
  orgDAL: Pick<TOrgDALFactory, "findRootOrgDetails" | "countAllOrgMembers" | "findById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseDAL: TLicenseDALFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  projectDAL: TProjectDALFactory;
};

export type TLicenseServiceFactory = ReturnType<typeof licenseServiceFactory>;

const LICENSE_SERVER_CLOUD_LOGIN = "/api/auth/v1/license-server-login";
const LICENSE_SERVER_ON_PREM_LOGIN = "/api/auth/v1/license-login";

const LICENSE_SERVER_CLOUD_PLAN_TTL = 5 * 60; // 5 mins
const FEATURE_CACHE_KEY = (orgId: string) => `infisical-cloud-plan-${orgId}`;

export const licenseServiceFactory = ({
  orgDAL,
  permissionService,
  licenseDAL,
  keyStore,
  projectDAL,
  envConfig
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

      const workspacesUsed = await projectDAL.countOfOrgProjects(null);
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

  const init = async () => {
    try {
      if (envConfig.LICENSE_SERVER_KEY) {
        const token = await licenseServerCloudApi.refreshLicense();
        if (token) instanceType = InstanceType.Cloud;
        logger.info(`Instance type: ${InstanceType.Cloud}`);
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
  };

  const getPlan = async (orgId: string, projectId?: string) => {
    logger.info(`getPlan: attempting to fetch plan for [orgId=${orgId}] [projectId=${projectId}]`);
    try {
      if (instanceType === InstanceType.Cloud) {
        const cachedPlan = await keyStore.getItem(FEATURE_CACHE_KEY(orgId));
        if (cachedPlan) {
          logger.info(`getPlan: plan fetched from cache [orgId=${orgId}] [projectId=${projectId}]`);
          return JSON.parse(cachedPlan) as TFeatureSet;
        }

        const org = await orgDAL.findRootOrgDetails(orgId);
        if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
        const rootOrgId = org.id;

        const {
          data: { currentPlan }
        } = await licenseServerCloudApi.request.get<{ currentPlan: TFeatureSet }>(
          `/api/license-server/v1/customers/${org.customerId}/cloud-plan`
        );
        const workspacesUsed = await projectDAL.countOfOrgProjects(rootOrgId);
        currentPlan.workspacesUsed = workspacesUsed;

        const membersUsed = await licenseDAL.countOfOrgMembers(rootOrgId);
        currentPlan.membersUsed = membersUsed;
        const identityUsed = await licenseDAL.countOrgUsersAndIdentities(rootOrgId);

        if (currentPlan?.identitiesUsed && currentPlan.identitiesUsed !== identityUsed) {
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
          FEATURE_CACHE_KEY(org.id),
          LICENSE_SERVER_CLOUD_PLAN_TTL,
          JSON.stringify(currentPlan)
        );

        return currentPlan;
      }
    } catch (error) {
      logger.error(
        error,
        `getPlan: encountered an error when fetching pan [orgId=${orgId}] [projectId=${projectId}] [error]`
      );
      await keyStore.setItemWithExpiry(
        FEATURE_CACHE_KEY(orgId),
        LICENSE_SERVER_CLOUD_PLAN_TTL,
        JSON.stringify(onPremFeatures)
      );
      return onPremFeatures;
    } finally {
      logger.info(`getPlan: Process done for [orgId=${orgId}] [projectId=${projectId}]`);
    }
    return onPremFeatures;
  };

  const refreshPlan = async (orgId: string) => {
    await keyStore.deleteItem(FEATURE_CACHE_KEY(orgId));
    if (instanceType === InstanceType.Cloud) {
      await getPlan(orgId);
    }
    if (instanceType === InstanceType.EnterpriseOnPrem) {
      await syncLicenseKeyOnPremFeatures(true);
    }
  };

  const generateOrgCustomerId = async (orgName: string, email?: string | null) => {
    if (instanceType === InstanceType.Cloud) {
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
    if (instanceType === InstanceType.Cloud) {
      const quantity = await licenseDAL.countOfOrgMembers(rootOrgId, tx);
      const quantityIdentities = await licenseDAL.countOrgUsersAndIdentities(rootOrgId, tx);
      if (org?.customerId) {
        await licenseServerCloudApi.request.patch(`/api/license-server/v1/customers/${org.customerId}/cloud-plan`, {
          quantity,
          quantityIdentities
        });
      }
      await keyStore.deleteItem(FEATURE_CACHE_KEY(rootOrgId));
    } else if (instanceType === InstanceType.EnterpriseOnPrem) {
      const usedSeats = await licenseDAL.countOfOrgMembers(null, tx);
      const usedIdentitySeats = await licenseDAL.countOrgUsersAndIdentities(null, tx);
      onPremFeatures.membersUsed = usedSeats;
      onPremFeatures.identitiesUsed = usedIdentitySeats;
      await licenseServerOnPremApi.request.patch(`/api/license/v1/license`, {
        usedSeats,
        usedIdentitySeats
      });
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

    const organization = await orgDAL.findById(orgId);
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
    await keyStore.deleteItem(FEATURE_CACHE_KEY(orgId));
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

    const organization = await orgDAL.findById(orgId);
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
      projectDAL.countOfOrgProjects(orgId)
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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
      allowed: onPremFeatures[field as keyof TFeatureSet] || false,
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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

    const organization = await orgDAL.findById(orgId);
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
    await keyStore.deleteItem(FEATURE_CACHE_KEY(orgId));
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
