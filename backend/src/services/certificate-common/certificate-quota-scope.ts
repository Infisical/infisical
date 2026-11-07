import { TLicenseService, InstanceType } from "@app/domains/platform/license/ce/module";

export const isInstanceWidePkiQuota = (license: Pick<TLicenseService, "getInstanceType">) => {
  const instanceType = license.getInstanceType();
  return instanceType === InstanceType.EnterpriseOnPrem || instanceType === InstanceType.EnterpriseOnPremOffline;
};

export const PKI_INSTANCE_QUOTA_SCOPE = "instance";
