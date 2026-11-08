import { InstanceType, TLicenseDomain } from "@app/domains/platform/license/ce/module";

export const isInstanceWidePkiQuota = (licenseDomain: TLicenseDomain) => {
  const instanceType = licenseDomain.getInstanceType();
  return instanceType === InstanceType.EnterpriseOnPrem || instanceType === InstanceType.EnterpriseOnPremOffline;
};

export const PKI_INSTANCE_QUOTA_SCOPE = "instance";
