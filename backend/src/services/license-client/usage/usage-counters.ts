import { TLicenseDALFactory } from "@app/ee/services/license/license-dal";

import { TFeatureCounterFn, TLimitFeatureDescriptor } from "../feature";
import {
  ActiveCerts,
  AgentVaultIdentities,
  IdentitiesMeter,
  InternalCas,
  PamIdentities,
  SecretIdentities,
  UserIdentities,
  WildcardCerts
} from "../features";
import { TUsageCounterDALFactory } from "./usage-counter-dal";

export type TMeteredFeature = {
  feature: TLimitFeatureDescriptor;
  count: TFeatureCounterFn;
  // Where the count is reported. Absent means the triggering org, which is right for a dimension
  // counted per org. A dimension whose count spans the org tree must set this, or every sub-org
  // reports the same tree-wide number under its own identity and the family is counted repeatedly.
  resolveReportOrgId?: (orgId: string) => Promise<string>;
};

const METERED_FEATURES = [
  IdentitiesMeter,
  InternalCas,
  ActiveCerts,
  WildcardCerts,
  SecretIdentities,
  PamIdentities,
  AgentVaultIdentities,
  UserIdentities
] as const;

export type TMeteredDimensionKey = (typeof METERED_FEATURES)[number]["key"];

export const METERED_DIMENSION_KEYS: TMeteredDimensionKey[] = METERED_FEATURES.map((feature) => feature.key);

type TBuildMeteredFeaturesDep = {
  licenseDAL: Pick<TLicenseDALFactory, "countOrgUsersAndIdentities" | "countOfOrgMembers">;
  usageCounterDAL: Pick<
    TUsageCounterDALFactory,
    | "countInternalCas"
    | "resolveRootOrgId"
    | "countActiveCertificateQuotaKeysByOrg"
    | "countSecretManagementIdentities"
    | "countPamIdentities"
  >;
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
  // The PKI meters count the whole org tree, so each reports once at the root. On self-hosted they
  // count the whole instance instead: the report identity there is not an org id.
  {
    feature: InternalCas,
    count: (orgId) => usageCounterDAL.countInternalCas(isCloud ? orgId : undefined),
    resolveReportOrgId: (orgId) => usageCounterDAL.resolveRootOrgId(orgId)
  },
  {
    feature: ActiveCerts,
    count: (orgId) =>
      usageCounterDAL.countActiveCertificateQuotaKeysByOrg(isCloud ? orgId : undefined).then(({ total }) => total),
    resolveReportOrgId: (orgId) => usageCounterDAL.resolveRootOrgId(orgId)
  },
  {
    // The other half of the same query active_certs reads, so the two can never disagree about which
    // certificates are live. Wildcards also count toward active_certs; this is a priced subset of it.
    feature: WildcardCerts,
    count: (orgId) =>
      usageCounterDAL
        .countActiveCertificateQuotaKeysByOrg(isCloud ? orgId : undefined)
        .then(({ wildcard }) => wildcard),
    resolveReportOrgId: (orgId) => usageCounterDAL.resolveRootOrgId(orgId)
  },
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
