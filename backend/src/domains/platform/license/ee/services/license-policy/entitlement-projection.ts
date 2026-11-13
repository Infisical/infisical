import { TInstanceFeatures } from "../../../ce/models/instance-entitlements";
import { TPlanNotice } from "../../../ce/models/plan";
import {
  TEntitlementsResponse,
  trialPaymentFailedNoticeSchema
} from "../../../ce/services/helpers/license-server-types";
// Keep this exact specifier: the e2e suite aliases "./default-features" to a permissive fake.
import { getDefaultOnPremFeatures } from "./default-features";
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

// Overlays v2 entitlements on a base (self-hosted and cloud start from different ones). An omitted key keeps the
// base value; a null is written through, since that's how v2 says "no limit".
export const applyEntitlements = (base: TInstanceFeatures, entitlements: TEntitlementsResponse): TInstanceFeatures => {
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

// Every cloud plan (free included) gets default session log storage unless a plan or override turns it off. The
// License Server defaults the key to off for self-hosted, so only a plan or override value counts (none: on).
const withCloudPlanDefaults = (
  plan: TInstanceFeatures,
  entitlements: TEntitlementsResponse | null
): TInstanceFeatures => {
  const source = entitlements?.features.agent_vault_managed_storage?.source;
  if (source && source !== "default") return plan;
  return { ...plan, agentVaultManagedStorage: true };
};

// A self-hosted license caps no CA count unless its entitlements say so.
const withSelfHostedLicenseBase = (defaults: TInstanceFeatures): TInstanceFeatures => ({
  ...defaults,
  maxCas: null
});

// What an unlicensed self-hosted instance gets.
export const communityFeatures = (): TInstanceFeatures => getDefaultOnPremFeatures();

// A cloud org's plan. Without entitlements (License Server unreadable) it's the free tier with cloud defaults.
export const cloudPlanFeatures = (entitlements: TEntitlementsResponse | null): TInstanceFeatures =>
  withCloudPlanDefaults(
    entitlements ? applyEntitlements(getDefaultOnPremFeatures(), entitlements) : getDefaultOnPremFeatures(),
    entitlements
  );

// A self-hosted license's features from v2 entitlements: an online license, or an offline v2 key.
export const selfHostedLicenseFeatures = (entitlements: TEntitlementsResponse): TInstanceFeatures =>
  applyEntitlements(withSelfHostedLicenseBase(getDefaultOnPremFeatures()), entitlements);

// A v1 offline key is a snapshot from when it was issued, so layer it over current defaults: otherwise every flag
// added since reads as undefined and withdraws a paid feature.
export const offlineV1LicenseFeatures = (features: TInstanceFeatures): TInstanceFeatures => ({
  ...withSelfHostedLicenseBase(getDefaultOnPremFeatures()),
  ...features
});
