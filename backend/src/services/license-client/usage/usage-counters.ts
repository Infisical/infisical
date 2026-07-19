import { TLicenseDALFactory } from "@app/ee/services/license/license-dal";

import { TFeatureCounterFn, TLimitFeatureDescriptor } from "../feature";
import { MaxActiveCerts, MaxIdentities, MaxInternalCas, MaxPamResources, SecretIdentities } from "../features";
import { TUsageCounterDALFactory } from "./usage-counter-dal";

export type TMeteredFeature = {
  feature: TLimitFeatureDescriptor;
  count: TFeatureCounterFn;
};

type TBuildMeteredFeaturesDep = {
  licenseDAL: Pick<TLicenseDALFactory, "countOrgUsersAndIdentities">;
  usageCounterDAL: TUsageCounterDALFactory;
  // Cloud meters per org; self-hosted meters the whole instance (a single license covers the DB).
  isCloud: boolean;
};

// The single source of truth pairing each metered feature with its live-count fn. Reused by the
// worker (count + report) and by registerCounter (so canUse() resolves current usage).
export const buildMeteredFeatures = ({
  licenseDAL,
  usageCounterDAL,
  isCloud
}: TBuildMeteredFeaturesDep): TMeteredFeature[] => [
  { feature: MaxIdentities, count: (orgId) => licenseDAL.countOrgUsersAndIdentities(orgId) },
  { feature: MaxInternalCas, count: (orgId) => usageCounterDAL.countInternalCas(orgId) },
  { feature: MaxActiveCerts, count: (orgId) => usageCounterDAL.countActiveCerts(orgId) },
  { feature: MaxPamResources, count: (orgId) => usageCounterDAL.countPamResources(orgId) },
  {
    feature: SecretIdentities,
    count: (orgId) => usageCounterDAL.countSecretManagementIdentities(isCloud ? orgId : undefined)
  }
];
