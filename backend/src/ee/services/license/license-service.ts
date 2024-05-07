/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable @typescript-eslint/no-unsafe-assignment

// TODO(akhilmhdh): With tony find out the api structure and fill it here

import { ForbiddenError } from "@casl/ability";

import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { verifyOfflineLicense } from "@app/lib/crypto";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TOrgDALFactory } from "@app/services/org/org-dal";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { getDefaultOnPremFeatures, setupLicenceRequestWithStore } from "./licence-fns";
import { TLicenseDALFactory } from "./license-dal";
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
  orgDAL: Pick<TOrgDALFactory, "findOrgById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseDAL: TLicenseDALFactory;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiry" | "getItem" | "deleteItem">;
};

export type TLicenseServiceFactory = ReturnType<typeof licenseServiceFactory>;

const LICENSE_SERVER_CLOUD_LOGIN = "/api/auth/v1/license-server-login";
const LICENSE_SERVER_ON_PREM_LOGIN = "/api/auth/v1/license-login";

const LICENSE_SERVER_CLOUD_PLAN_TTL = 30; // 30 second
const FEATURE_CACHE_KEY = (orgId: string) => `infisical-cloud-plan-${orgId}`;

export const licenseServiceFactory = ({
  orgDAL,
  permissionService,
  licenseDAL,
  keyStore
}: TLicenseServiceFactoryDep) => {
  let isValidLicense = false;
  let instanceType = InstanceType.OnPrem;
  let onPremFeatures: TFeatureSet = getDefaultOnPremFeatures();

  const appCfg = getConfig();
  const licenseServerCloudApi = setupLicenceRequestWithStore(
    appCfg.LICENSE_SERVER_URL || "",
    LICENSE_SERVER_CLOUD_LOGIN,
    appCfg.LICENSE_SERVER_KEY || ""
  );

  const licenseServerOnPremApi = setupLicenceRequestWithStore(
    appCfg.LICENSE_SERVER_URL || "",
    LICENSE_SERVER_ON_PREM_LOGIN,
    appCfg.LICENSE_KEY || ""
  );

  const init = async () => {
    try {
      if (appCfg.LICENSE_SERVER_KEY) {
        const token = await licenseServerCloudApi.refreshLicence();
        if (token) instanceType = InstanceType.Cloud;
        logger.info(`Instance type: ${InstanceType.Cloud}`);
        isValidLicense = true;
        return;
      }

      if (appCfg.LICENSE_KEY) {
        const token = await licenseServerOnPremApi.refreshLicence();
        if (token) {
          const {
            data: { currentPlan }
          } = await licenseServerOnPremApi.request.get<{ currentPlan: TFeatureSet }>("/api/license/v1/plan");
          onPremFeatures = currentPlan;
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
          return;
        }
      }

      // this means this is self hosted oss version
      // else it would reach catch statement
      isValidLicense = true;
    } catch (error) {
      logger.error(error, `init-license: encountered an error when init license`);
    }
  };

  const getPlan = async (orgId: string, projectId?: string) => {
    logger.info(`getPlan: attempting to fetch plan for [orgId=${orgId}] [projectId=${projectId}]`);
    try {
      if (instanceType === InstanceType.Cloud) {
        const cachedPlan = await keyStore.getItem(FEATURE_CACHE_KEY(orgId));
        if (cachedPlan) return JSON.parse(cachedPlan) as TFeatureSet;

        const org = await orgDAL.findOrgById(orgId);
        if (!org) throw new BadRequestError({ message: "Org not found" });
        const {
          data: { currentPlan }
        } = await licenseServerCloudApi.request.get<{ currentPlan: TFeatureSet }>(
          `/api/license-server/v1/customers/${org.customerId}/cloud-plan`
        );
        await keyStore.setItemWithExpiry(
          FEATURE_CACHE_KEY(org.id),
          LICENSE_SERVER_CLOUD_PLAN_TTL,
          JSON.stringify(currentPlan)
        );
        return currentPlan;
      }
    } catch (error) {
      logger.error(
        `getPlan: encountered an error when fetching pan [orgId=${orgId}] [projectId=${projectId}] [error]`,
        error
      );
      await keyStore.setItemWithExpiry(
        FEATURE_CACHE_KEY(orgId),
        LICENSE_SERVER_CLOUD_PLAN_TTL,
        JSON.stringify(onPremFeatures)
      );
      return onPremFeatures;
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

  const updateSubscriptionOrgMemberCount = async (orgId: string) => {
    if (instanceType === InstanceType.Cloud) {
      const org = await orgDAL.findOrgById(orgId);
      if (!org) throw new BadRequestError({ message: "Org not found" });

      const count = await licenseDAL.countOfOrgMembers(orgId);
      if (org?.customerId) {
        await licenseServerCloudApi.request.patch(`/api/license-server/v1/customers/${org.customerId}/cloud-plan`, {
          quantity: count
        });
      }
      await keyStore.deleteItem(FEATURE_CACHE_KEY(orgId));
    } else if (instanceType === InstanceType.EnterpriseOnPrem) {
      const usedSeats = await licenseDAL.countOfOrgMembers(null);
      await licenseServerOnPremApi.request.patch(`/api/license/v1/license`, { usedSeats });
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);
    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
    );
    return data;
  };

  const getOrgPlan = async ({ orgId, actor, actorId, actorOrgId, actorAuthMethod, projectId }: TOrgPlanDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Billing);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Create, OrgPermissionSubjects.Billing);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Edit, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
          success_url: `${appCfg.SITE_URL}/dashboard`,
          cancel_url: `${appCfg.SITE_URL}/dashboard`
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
        return_url: `${appCfg.SITE_URL}/dashboard`
      }
    );

    return { url };
  };

  const getOrgBillingInfo = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }
    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/cloud-plan/billing`
    );
    return data;
  };

  // returns org current plan feature table
  const getOrgPlanTable = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }
    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/cloud-plan/table`
    );
    return data;
  };

  const getOrgBillingDetails = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const { data } = await licenseServerCloudApi.request.delete(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/payment-methods/${pmtMethodId}`
    );
    return data;
  };

  const getOrgTaxIds = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TGetOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
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
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const { data } = await licenseServerCloudApi.request.delete(
      `/api/license-server/v1/customers/${organization.customerId}/billing-details/tax-ids/${taxId}`
    );
    return data;
  };

  const getOrgTaxInvoices = async ({ actorId, actor, actorOrgId, actorAuthMethod, orgId }: TOrgInvoiceDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const {
      data: { invoices }
    } = await licenseServerCloudApi.request.get(`/api/license-server/v1/customers/${organization.customerId}/invoices`);
    return invoices;
  };

  const getOrgLicenses = async ({ orgId, actor, actorId, actorAuthMethod, actorOrgId }: TOrgLicensesDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId, actorAuthMethod, actorOrgId);
    ForbiddenError.from(permission).throwUnlessCan(OrgPermissionActions.Read, OrgPermissionSubjects.Billing);

    const organization = await orgDAL.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const {
      data: { licenses }
    } = await licenseServerCloudApi.request.get(`/api/license-server/v1/customers/${organization.customerId}/licenses`);
    return licenses;
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
    getPlan,
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
    delOrgTaxId
  };
};
