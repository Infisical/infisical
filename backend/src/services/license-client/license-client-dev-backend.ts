import {
  TBillingProfileResponse,
  TCatalogResponse,
  TCheckoutResult,
  TCloudPlanResponse,
  TEntitlementsResponse,
  TLicenseClientBackend,
  TSubscriptionResponse,
  TTrialsResponse
} from "./license-client-types";

export const licenseServerDevScenarios = [
  "cloud-trial-available",
  "cloud-trial-used",
  "cloud-managed",
  "self-hosted-licensed"
] as const;

export type TLicenseServerDevScenario = (typeof licenseServerDevScenarios)[number];

const PRODUCT_ID = "secrets_management";
const PLAN_ID = "advanced";

const emptyBillingProfile: TBillingProfileResponse = {
  payment: null,
  billingDetails: null,
  invoices: []
};

export const licenseServerDevBackend = (scenario: TLicenseServerDevScenario): TLicenseClientBackend => {
  let trialStarted = false;
  let productHeld = scenario === "self-hosted-licensed";

  const isManaged = scenario === "cloud-managed";
  const isSelfHosted = scenario === "self-hosted-licensed";
  const hasUsedTrial = scenario === "cloud-trial-used";

  const fetchEntitlements = async (): Promise<TEntitlementsResponse> => {
    const entitled = productHeld || trialStarted;
    return {
      slug: entitled ? PLAN_ID : null,
      features: {
        dynamic_secret: entitled
          ? { value: true, source: trialStarted ? "trial" : "plan", from_product: PRODUCT_ID }
          : { value: false, source: "default" }
      },
      products: entitled
        ? [
            {
              product_key: PRODUCT_ID,
              plan_key: PLAN_ID,
              status: trialStarted ? "trialing" : "active",
              trial_plan_key: trialStarted ? PLAN_ID : null,
              trial_ends_at: trialStarted ? new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString() : null,
              current_period_end: null
            }
          ]
        : []
    };
  };

  const fetchCatalog = async (): Promise<TCatalogResponse> => ({
    products: [
      {
        id: PRODUCT_ID,
        name: "Secrets Management",
        tagline: "Manage secrets across every environment.",
        icon: "key",
        color: "#DBF530",
        addon: false,
        deprecated: false,
        deprecationReason: null,
        deprecationNextSteps: null,
        deprecationDate: null,
        displayOrder: 1,
        dimensions: [],
        plans: [
          {
            tier: PLAN_ID,
            name: "Advanced",
            selfServe: !isManaged && !isSelfHosted,
            salesLed: isManaged || isSelfHosted,
            trialable: scenario === "cloud-trial-available" && !trialStarted && !productHeld,
            upgradeable: hasUsedTrial && !productHeld,
            trialDays: scenario === "cloud-trial-available" ? 14 : 0,
            deprecated: false,
            deprecationReason: null,
            deprecationNextSteps: null,
            deprecationDate: null,
            displayOrder: 1,
            feature: "Dynamic secrets, secret rotation, and advanced access controls",
            basePriceMonthlyCents: 2500,
            basePriceAnnualCents: 24000,
            prices: []
          }
        ],
        comparison: [],
        includes: ["Dynamic secrets", "Secret rotation", "Advanced access controls"]
      }
    ]
  });

  const fetchSubscription = async (): Promise<TSubscriptionResponse | null> => {
    if (!isManaged && !isSelfHosted && !trialStarted && !productHeld) {
      return null;
    }

    return {
      status: trialStarted ? "trialing" : "active",
      capabilities: { checkoutFrozen: false, selfServe: !isManaged && !isSelfHosted },
      cadence: null,
      currentPeriodEnd: null,
      recurringTotal: null,
      billing: {
        monthlyRecurringCents: 0,
        annualRecurringCents: 0,
        nextChargeAt: null,
        lines: []
      },
      tier: productHeld || trialStarted ? PLAN_ID : undefined,
      items:
        productHeld || trialStarted
          ? [
              {
                productId: PRODUCT_ID,
                plan: PLAN_ID,
                quantities: {},
                limits: {},
                status: trialStarted ? "trialing" : "active",
                isTrialing: trialStarted,
                trialEndsAt: trialStarted ? Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60 : null,
                trialPlan: trialStarted ? PLAN_ID : null,
                trialPlanEndsAt: trialStarted ? Math.floor(Date.now() / 1000) + 14 * 24 * 60 * 60 : null,
                deprecation: null,
                dimensions: []
              }
            ]
          : []
    };
  };

  const fetchTrials = async (): Promise<TTrialsResponse> => ({
    trials:
      hasUsedTrial || trialStarted
        ? [
            {
              product_key: PRODUCT_ID,
              plan_key: PLAN_ID,
              base_plan_key: null,
              outcome: trialStarted ? "trialing" : "completed",
              ended_detail: trialStarted ? null : "trial_completed",
              started_at: null,
              trial_ends_at: null,
              ended_at: trialStarted ? null : Math.floor(Date.now() / 1000) - 24 * 60 * 60
            }
          ]
        : []
  });

  const updated = (): TCheckoutResult => ({ outcome: "subscription_updated", subscriptionId: "dev-subscription" });

  return {
    fetchEntitlements,
    fetchCatalog,
    fetchSubscription,
    fetchCloudPlan: async (): Promise<TCloudPlanResponse> => ({
      currentPlan: { memberLimit: null, identityLimit: null }
    }),
    fetchBillingProfile: async () => emptyBillingProfile,
    createPortalSession: async () => ({ url: "http://localhost:8080" }),
    previewSubscriptionChange: async () => ({
      currency: "usd",
      prorationAmount: 0,
      additionalCharges: 0,
      totalDueNow: 0,
      nextInvoiceTotal: 2500,
      nextRecurringTotal: 2500,
      prorationDate: Math.floor(Date.now() / 1000),
      toPlanVersionId: "dev-plan-version",
      lines: []
    }),
    buyProduct: async () => {
      productHeld = true;
      trialStarted = false;
      return updated();
    },
    removeProduct: async () => {
      productHeld = false;
      trialStarted = false;
      return { outcome: "subscription_canceled", subscriptionId: "dev-subscription" };
    },
    upgradeProduct: async () => ({
      outcome: "upgraded",
      subscriptionId: "dev-subscription",
      fromPlanKey: "free",
      toPlanKey: PLAN_ID,
      toPlanVersionId: "dev-plan-version"
    }),
    changeCommitments: async () => updated(),
    startTrial: async () => {
      trialStarted = true;
      return { outcome: "trial_started" };
    },
    cancelTrial: async () => {
      trialStarted = false;
      return { outcome: "trial_completed" };
    },
    fetchTrials,
    cancelSubscription: async () => {
      productHeld = false;
      trialStarted = false;
      return { outcome: "subscription_canceled", subscriptionId: "dev-subscription" };
    },
    resumeSubscription: async () => updated()
  };
};
