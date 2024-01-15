import { ForbiddenError } from "@casl/ability";
import NodeCache from "node-cache";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { TOrgDalFactory } from "@app/services/org/org-dal";

import { OrgPermissionActions, OrgPermissionSubjects } from "../permission/org-permission";
import { TPermissionServiceFactory } from "../permission/permission-service";
import { getDefaultOnPremFeatures, setupLicenceRequestWithStore } from "./licence-fns";
import { TLicenseDalFactory } from "./license-dal";
import {
  InstanceType,
  TAddOrgPmtMethodDTO,
  TAddOrgTaxIdDTO,
  TDelOrgPmtMethodDTO,
  TDelOrgTaxIdDTO,
  TFeatureSet,
  TGetOrgBillInfoDTO,
  TGetOrgTaxIdDTO,
  TOrgInvoiceDTO,
  TOrgLicensesDTO,
  TOrgPlanDTO,
  TOrgPlansTableDTO,
  TOrgPmtMethodsDTO,
  TStartOrgTrailDTO,
  TUpdateOrgBillingDetailsDTO
} from "./license-types";

type TLicenseServiceFactoryDep = {
  orgDal: Pick<TOrgDalFactory, "findOrgById">;
  permissionService: Pick<TPermissionServiceFactory, "getOrgPermission">;
  licenseDal: TLicenseDalFactory;
};

export type TLicenseServiceFactory = ReturnType<typeof licenseServiceFactory>;

const LICENSE_SERVER_CLOUD_LOGIN = "/api/auth/v1/license-server-login";
const LICENSE_SERVER_ON_PREM_LOGIN = "/api/auth/v1/licence-login";

const FEATURE_CACHE_KEY = (orgId: string, projectId?: string) => `${orgId}-${projectId || ""}`;
export const licenseServiceFactory = ({
  orgDal,
  permissionService,
  licenseDal
}: TLicenseServiceFactoryDep) => {
  let isValidLicense = false;
  let instanceType = InstanceType.OnPrem;
  let onPremFeatures: TFeatureSet = getDefaultOnPremFeatures();
  const featureStore = new NodeCache({ stdTTL: 60 });

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
          } = await licenseServerOnPremApi.request.get<{ currentPlan: TFeatureSet }>(
            "/api/license/v1/plan"
          );
          onPremFeatures = currentPlan;
          instanceType = InstanceType.EnterpriseOnPrem;
          logger.info(`Instance type: ${InstanceType.EnterpriseOnPrem}`);
          isValidLicense = true;
        }
        return;
      }
      // this means this is self hosted oss version
      // else it would reach catch statement
      isValidLicense = true;
    } catch (error) {
      logger.error(error);
    }
  };

  const getPlan = async (orgId: string, projectId?: string) => {
    try {
      if (instanceType === InstanceType.Cloud) {
        const cachedPlan = featureStore.get<TFeatureSet>(FEATURE_CACHE_KEY(orgId, projectId));
        if (cachedPlan) return cachedPlan;

        const org = await orgDal.findOrgById(orgId);
        if (!org) throw new BadRequestError({ message: "Org not found" });
        const {
          data: { currentPlan }
        } = await licenseServerCloudApi.request.get<{ currentPlan: TFeatureSet }>(
          `/api/license-server/v1/customers/${org.customerId}/cloud-plan`,
          {
            params: {
              workspaceId: projectId
            }
          }
        );
        featureStore.set(FEATURE_CACHE_KEY(org.id, projectId), currentPlan);
        return currentPlan;
      }
    } catch (error) {
      logger.error(error);
      return onPremFeatures;
    }
    return onPremFeatures;
  };

  const refreshPlan = async (orgId: string, projectId?: string) => {
    if (instanceType === InstanceType.Cloud) {
      featureStore.del(FEATURE_CACHE_KEY(orgId, projectId));
      await getPlan(orgId, projectId);
    }
  };

  const generateOrgCustomerId = async (orgName: string, email: string) => {
    if (instanceType === InstanceType.Cloud) {
      const {
        data: { customerId }
      } = await licenseServerCloudApi.request.post(
        "/api/license-server/v1/customers",
        {
          email,
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
      const org = await orgDal.findOrgById(orgId);
      if (!org) throw new BadRequestError({ message: "Org not found" });

      const count = await licenseDal.countOfOrgMembers(orgId);
      if (org?.customerId) {
        await licenseServerCloudApi.request.patch(
          `/api/license-server/v1/customers/${org.customerId}/cloud-plan`,
          {
            quantity: count
          }
        );
      }
      featureStore.del(orgId);
    } else if (instanceType === InstanceType.EnterpriseOnPrem) {
      const usedSeats = await licenseDal.countOfOrgMembers(null);
      await licenseServerOnPremApi.request.patch(`/api/license/v1/license`, { usedSeats });
    }
    await refreshPlan(orgId);
  };

  // below all are api calls
  const getOrgPlansTableByBillCycle = async ({
    orgId,
    actor,
    actorId,
    billingCycle
  }: TOrgPlansTableDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );
    const { data } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/cloud-products?billing-cycle=${billingCycle}`
    );
    return data;
  };

  const getOrgPlan = async ({ orgId, actor, actorId, projectId }: TOrgPlanDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );
    const plan = await getPlan(orgId, projectId);
    return plan;
  };

  const startOrgTrail = async ({ orgId, actorId, actor, success_url }: TStartOrgTrailDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Create,
      OrgPermissionSubjects.Billing
    );
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Edit,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const {
      data: { url }
    } = await licenseServerCloudApi.request.post(
      `/api/license-server/v1/customers/${organization.customerId}/session/trail`,
      { success_url }
    );
    featureStore.del(FEATURE_CACHE_KEY(orgId));
    return { url };
  };

  const getOrgBillingInfo = async ({ orgId, actor, actorId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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
  const getOrgPlanTable = async ({ orgId, actor, actorId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const getOrgBillingDetails = async ({ orgId, actor, actorId }: TGetOrgBillInfoDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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
    orgId,
    name,
    email
  }: TUpdateOrgBillingDetailsDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const getOrgPmtMethods = async ({ orgId, actor, actorId }: TOrgPmtMethodsDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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
    success_url,
    cancel_url
  }: TAddOrgPmtMethodDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const delOrgPmtMethods = async ({ actorId, actor, orgId, pmtMethodId }: TDelOrgPmtMethodDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const getOrgTaxIds = async ({ orgId, actor, actorId }: TGetOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const addOrgTaxId = async ({ actorId, actor, orgId, type, value }: TAddOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const delOrgTaxId = async ({ orgId, actor, actorId, taxId }: TDelOrgTaxIdDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
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

  const getOrgTaxInvoices = async ({ actorId, actor, orgId }: TOrgInvoiceDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const {
      data: { invoices }
    } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/invoices`
    );
    return invoices;
  };

  const getOrgLicenses = async ({ orgId, actor, actorId }: TOrgLicensesDTO) => {
    const { permission } = await permissionService.getOrgPermission(actor, actorId, orgId);
    ForbiddenError.from(permission).throwUnlessCan(
      OrgPermissionActions.Read,
      OrgPermissionSubjects.Billing
    );

    const organization = await orgDal.findOrgById(orgId);
    if (!organization) {
      throw new BadRequestError({
        message: "Failed to find organization"
      });
    }

    const {
      data: { licenses }
    } = await licenseServerCloudApi.request.get(
      `/api/license-server/v1/customers/${organization.customerId}/licenses`
    );
    return licenses;
  };

  return {
    generateOrgCustomerId,
    removeOrgCustomer,
    init,
    get isValidLicense() {
      return isValidLicense;
    },
    getPlan,
    updateSubscriptionOrgMemberCount,
    refreshPlan,
    getOrgPlan,
    getOrgPlansTableByBillCycle,
    startOrgTrail,
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
