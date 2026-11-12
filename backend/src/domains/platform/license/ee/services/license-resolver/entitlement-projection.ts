import { TInstanceFeatures } from "../../../ce/models/instance-entitlements";
import { TPlanNotice } from "../../../ce/models/plan";
import {
  TEntitlementsResponse,
  trialPaymentFailedNoticeSchema
} from "../../../ce/services/helpers/license-server-types";
import { FEATURE_MAPPINGS } from "./feature-mapping";

// Unknown notice types are expected (the License Server adds them ahead of us), so they are dropped silently.
const projectNotices = (rawNotices: unknown[]): TPlanNotice[] =>
  rawNotices.flatMap((rawNotice) => {
    const parsed = trialPaymentFailedNoticeSchema.safeParse(rawNotice);
    if (!parsed.success) {
      return [];
    }
    return [
      {
        type: parsed.data.type,
        productKey: parsed.data.product_key,
        trialPlanKey: parsed.data.trial_plan_key ?? null,
        accessEndsAt: parsed.data.access_ends_at,
        nextAttemptAt: parsed.data.next_attempt_at ?? null,
        cause: parsed.data.cause ?? null
      }
    ];
  });

// Overlays the License Server's entitlements on the given base. A key v2 omits keeps the base value, while a null
// is written through because that is how v2 says "no limit" (eg unlimited audit log retention). The base is
// passed in because self-hosted and cloud start from different defaults.
export const projectV2ToFeatureSet = (
  base: TInstanceFeatures,
  entitlements: TEntitlementsResponse
): TInstanceFeatures => {
  const plan = JSON.parse(JSON.stringify(base)) as Record<string, unknown> & { rateLimits: Record<string, unknown> };
  plan.slug = entitlements?.slug;
  plan.productPlans = (entitlements.products ?? []).map((product) => ({
    productKey: product.product_key,
    planKey: product.plan_key ?? null,
    status: product.status ?? null,
    trialPlanKey: product.trial_plan_key ?? null,
    trialEndsAt: product.trial_ends_at ?? null
  }));
  plan.notices = projectNotices(entitlements.notices ?? []);

  FEATURE_MAPPINGS.forEach((mapping) => {
    if (mapping.v1Field === null) {
      return;
    }
    const isLegacyGranted = mapping.legacyV2Keys?.some((key) => entitlements.features[key]?.value === true);
    const value = isLegacyGranted ? true : entitlements.features[mapping.v2Key]?.value;
    if (value === undefined) {
      return;
    }

    if (mapping.v1Field.includes(".")) {
      const [parent, child] = mapping.v1Field.split(".");
      (plan[parent] as Record<string, unknown>)[child] = value;
    } else {
      plan[mapping.v1Field] = value;
    }
  });

  return plan as unknown as TInstanceFeatures;
};

// Every cloud plan includes default storage for session logs, free orgs included, unless the org's plan or an override
// turns it off. The License Server's default for the key is off, which is what self-hosted licenses get, so only a
// value a plan or override set is taken here. Without entitlements (the stand-in plan while the License Server can't
// be reached) it's on.
export const withCloudPlanDefaults = (
  plan: TInstanceFeatures,
  entitlements: TEntitlementsResponse | null
): TInstanceFeatures => {
  const source = entitlements?.features.agent_vault_managed_storage?.source;
  if (source && source !== "default") return plan;
  return { ...plan, agentVaultManagedStorage: true };
};

// A self-hosted license caps no CA count unless its entitlements say so.
export const withSelfHostedLicenseBase = (defaults: TInstanceFeatures): TInstanceFeatures => ({
  ...defaults,
  maxCas: null
});
