/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable @typescript-eslint/no-unsafe-assignment

// TODO(akhilmhdh): With tony find out the api structure and fill it here

import { ForbiddenError } from "@casl/ability";
import { CronJob } from "cron";
import { Knex } from "knex";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { verifyOfflineLicense } from "@app/lib/crypto";
import { NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TIdentityOrgDALFactory } from "@app/services/identity/identity-org-dal";
import { TOrgDALFactory } from "@app/services/org/org-dal";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { OrgPermissionBillingActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service-types";
import { BillingPlanRows, BillingPlanTableHead } from "./licence-enums";
import { TLicenseDALFactory } from "./license-dal";
import { getDefaultOnPremFeatures, setupLicenseRequestWithStore } from "./license-fns";
import {
  InstanceType,
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
  TStartOrgTrialDTO,
  TUpdateOrgBillingDetailsDTO
} from "./license-types";

type TLicenseServiceFactoryDep = {
  orgDAL: Pick<TOrgDALFactory, "findOrgById" | "countAllOrgMembers">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseDAL: TLicenseDALFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
  identityOrgMembershipDAL: TIdentityOrgDALFactory;
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
  identityOrgMembershipDAL,
  projectDAL
}: TLicenseServiceFactoryDep) => {
  let isValidLicense = false;
  let instanceType = InstanceType.OnPrem;
  let onPremFeatures: TFeatureSet = getDefaultOnPremFeatures();
  let selfHostedLicense: TOfflineLicense | null = null;

  const appCfg = getConfig();
  const licenseServerCloudApi = setupLicenseRequestWithStore(
    appCfg.LICENSE_SERVER_URL || "",
    LICENSE_SERVER_CLOUD_LOGIN,
    appCfg.LICENSE_SERVER_KEY || "",
    appCfg.INTERNAL_REGION
  );

  const licenseServerOnPremApi = setupLicenseRequestWithStore(
    appCfg.LICENSE_SERVER_URL || "",
    LICENSE_SERVER_ON_PREM_LOGIN,
    appCfg.LICENSE_KEY || "",
    appCfg.INTERNAL_REGION
  );

  const syncLicenseKeyOnPremFeatures = async (shouldThrow: boolean = false) => {
    logger.info("Start syncing license key features");
    try {
      const {
        data: { currentPlan }
      } = await licenseServerOnPremApi.request.get<{ currentPlan: TFeatureSet }>("/api/license/v1/plan");

      const workspacesUsed = await projectDAL.countOfOrgProjects(null);
      currentPlan.workspacesUsed = workspacesUsed;

      onPremFeatures = currentPlan;
      logger.info("Successfully synchronized license key features");
    } catch (error) {
      logger.error(error, "Failed to synchronize license key features");
      if (shouldThrow) throw error;
    }
  };

  const init = async () => {
    try {
      if (appCfg.LICENSE_SERVER_KEY) {
        const token = await licenseServerCloudApi.refreshLicense();
        if (token) instanceType = InstanceType.Cloud;
        logger.info(`Instance type: ${InstanceType.Cloud}`);
        isValidLicense = true;
        return;
      }

      if (appCfg.LICENSE_KEY) {
        const token = await licenseServerOnPremApi.refreshLicense();
        if (token) {
          await syncLicenseKeyOnPremFeatures(true);
          instanceType = InstanceType.EnterpriseOnPrem;
          logger.info(`Instance type: ${InstanceType.EnterpriseOnPrem}`);
          isValidLicense = true;
        }
        return;
      }

      if (appCfg.LICENSE_KEY_OFFLINE) {
        let isValidOfflineLicense = true;
        const contents: TOfflineLicenseContents = JSON.parse(
          Buffer.from(appCfg.LICENSE_KEY_OFFLINE, "base64").toString("utf8")
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
          onPremFeatures = contents.license.features;
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
    if (appCfg.LICENSE_KEY) {
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

        const org = await orgDAL.findOrgById(orgId);
        if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
        const {
          data: { currentPlan }
        } = await licenseServerCloudApi.request.get<{ currentPlan: TFeatureSet }>(
          `/api/license-server/v1/customers/${org.customerId}/cloud-plan`
        );
        const workspacesUsed = await projectDAL.countOfOrgProjects(orgId);
        currentPlan.workspacesUsed = workspacesUsed;

        const membersUsed = await licenseDAL.countOfOrgMembers(orgId);
        currentPlan.membersUsed = membersUsed;
        const identityUsed = await licenseDAL.countOrgUsersAndIdentities(orgId);
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
    if (instanceType === InstanceType.Cloud) {
      await keyStore.deleteItem(FEATURE_CACHE_KEY(orgId));
      await getPlan(orgId);
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
    if (instanceType === InstanceType.Cloud) {
      const org = await orgDAL.findOrgById(orgId);
      if (!org) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });

      const quantity = await licenseDAL.countOfOrgMembers(orgId, tx);
      const quantityIdentities = await licenseDAL.countOrgUsersAndIdentities(orgId, tx);
      if (org?.customerId) {
        await licenseServerCloudApi.request.patch(`/api/license-server/v1/customers/${org.customerId}/cloud-plan`, {
          quantity,
          quantityIdentities
        });
      }
      await keyStore.deleteItem(FEATURE_CACHE_KEY(orgId));
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
    await refreshPlan(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);
    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
    );
    return data;
  };

  const getOrgPlan = async ({ orgId, actor, actorId, actorOrgId, actorAuthMethod, projectId }: TOrgPlanDTO) => {
    await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    const plan = await getPlan(orgId, projectId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
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
          success_url: `${appCfg.SITE_URL}/organization/billing`,
          cancel_url: `${appCfg.SITE_URL}/organization/billing`
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
        return_url: `${appCfg.SITE_URL}/organization/billing`
      }
    );

    return { url };
  };

  const getOrgBillingInfo = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }
    if (instanceType === InstanceType.Cloud) {
      const { data } = await licenseServerCloudApi.request.get(
        `/api/license-server/v1/customers/${organization.customerId}/cloud-plan/billing`
      );
      return data;
    }

    return {
      currentPeriodStart: selfHostedLicense?.issuedAt ? Date.parse(selfHostedLicense?.issuedAt) / 1000 : undefined,
      currentPeriodEnd: selfHostedLicense?.expiresAt ? Date.parse(selfHostedLicense?.expiresAt) / 1000 : undefined,
      interval: "month",
      intervalCount: 1,
      amount: 0,
      quantity: 1
    };
  };

  // returns org current plan feature table
  const getOrgPlanTable = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const orgMembersUsed = await orgDAL.countAllOrgMembers(orgId);
    const identityUsed = await identityOrgMembershipDAL.countAllOrgIdentities({ orgId });
    const projects = await projectDAL.find({ orgId });
    const projectCount = projects.length;

    if (instanceType === InstanceType.Cloud) {
      const { data } = await licenseServerCloudApi.request.get<{
        head: { name: string }[];
        rows: { name: string; allowed: boolean }[];
      }>(`/api/license-server/v1/customers/${organization.customerId}/cloud-plan/table`);

      const formattedData = {
        head: data.head,
        rows: data.rows.map((el) => {
          let used = "-";

          if (el.name === BillingPlanRows.MemberLimit.name) {
            used = orgMembersUsed.toString();
          } else if (el.name === BillingPlanRows.WorkspaceLimit.name) {
            used = projectCount.toString();
          } else if (el.name === BillingPlanRows.IdentityLimit.name) {
            used = (identityUsed + orgMembersUsed).toString();
          }

          return {
            ...el,
            used
          };
        })
      };
      return formattedData;
    }

    const mappedRows = await Promise.all(
      Object.values(BillingPlanRows).map(async ({ name, field }: { name: string; field: string }) => {
        const allowed = onPremFeatures[field as keyof TFeatureSet];
        let used = "-";

        if (field === BillingPlanRows.MemberLimit.field) {
          used = orgMembersUsed.toString();
        } else if (field === BillingPlanRows.WorkspaceLimit.field) {
          used = projectCount.toString();
        } else if (field === BillingPlanRows.IdentityLimit.field) {
          used = identityUsed.toString();
        }

        return {
          name,
          allowed,
          used
        };
      })
    );

    return {
      head: Object.values(BillingPlanTableHead),
      rows: mappedRows
    };
  };

  const getOrgBillingDetails = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new NotFoundError({
        message: `Organization with ID '${orgId}' not found`
      });
    }

    const { data } = await licenseServerCloudApi.request.delete(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods/${pmtMethodId}`
    );
    return data;
  };

  const getOrgTaxIds = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionBillingActions.ManageBilling,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
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
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionBillingActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
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
    invalidateGetPlan,
    updateSubscriptionOrgMemberCount,
    refreshPlan,
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
