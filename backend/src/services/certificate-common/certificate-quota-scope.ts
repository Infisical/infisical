import { TLicenseServiceFactory } from "@app/ee/services/license/license-service";
import { InstanceType } from "@app/ee/services/license/license-types";

export const isInstanceWidePkiQuota = (licenseService: Pick<TLicenseServiceFactory, "getInstanceType">) => {
  const instanceType = licenseService.getInstanceType();
  return instanceType === InstanceType.EnterpriseOnPrem || instanceType === InstanceType.EnterpriseOnPremOffline;
};

export const PKI_INSTANCE_QUOTA_SCOPE = "instance";
