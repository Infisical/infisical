import { InstanceType, TLicenseService } from "@app/domains/platform/license/ce/module";

export const isInstanceWidePkiQuota = (licenseService: TLicenseService) => {
  const instanceType = licenseService.getInstanceType();
  return instanceType === InstanceType.EnterpriseOnPrem || instanceType === InstanceType.EnterpriseOnPremOffline;
};

export const PKI_INSTANCE_QUOTA_SCOPE = "instance";
