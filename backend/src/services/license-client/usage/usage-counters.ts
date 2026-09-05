import { TLicenseDALFactory } from "@app/ee/services/license/license-dal";

import { TFeatureCounterFn, TLimitFeatureDescriptor } from "../feature";
import {
  ActiveCerts,
  AgentVaultIdentities,
  IdentitiesMeter,
  InternalCas,
  PamIdentities,
  SecretIdentities,
  UserIdentities
} from "../features";
import { TUsageCounterDALFactory } from "./usage-counter-dal";

export type TMeteredFeature = {
  feature: TLimitFeatureDescriptor;
  count: TFeatureCounterFn;
};

// Static list of every metered dimension key (no DAL needed). For callers that only need the keys, not
// the count fns — e.g. background reconciliation emitting one event per dimension for an org.
export const METERED_DIMENSION_KEYS: string[] = [
  IdentitiesMeter,
  InternalCas,
  ActiveCerts,
  SecretIdentities,
  PamIdentities,
  AgentVaultIdentities,
  UserIdentities
].map((feature) => feature.key);

type TBuildMeteredFeaturesDep = {
  licenseDAL: Pick<TLicenseDALFactory, "countOrgUsersAndIdentities" | "countOfOrgMembers">;
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
  { feature: IdentitiesMeter, count: (orgId) => licenseDAL.countOrgUsersAndIdentities(isCloud ? orgId : null) },
  { feature: InternalCas, count: (orgId) => usageCounterDAL.countInternalCas(orgId) },
  { feature: ActiveCerts, count: (orgId) => usageCounterDAL.countActiveCerts(orgId) },
  {
    feature: SecretIdentities,
    count: (orgId) => usageCounterDAL.countSecretManagementIdentities(isCloud ? orgId : undefined)
  },
  {
    feature: PamIdentities,
    count: (orgId) => usageCounterDAL.countPamIdentities(isCloud ? orgId : undefined)
  },
  {
    feature: AgentVaultIdentities,
    count: (orgId) => usageCounterDAL.countAgentVaultIdentities(isCloud ? orgId : undefined)
  },
  {
    // Human users only (org members), never machine identities. Legacy per-user plans.
    feature: UserIdentities,
    count: (orgId) => licenseDAL.countOfOrgMembers(isCloud ? orgId : null)
  }
];
