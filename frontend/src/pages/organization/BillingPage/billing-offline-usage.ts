import { BillingProduct } from "@app/components/license/UpgradeGate/upgrade-intents";
import {
  BillingBreakdownDimension,
  BillingCatalogProduct,
  BillingEntitlementDim,
  BillingOverview
} from "@app/hooks/api/billing/types";
import { SubscriptionPlan, SubscriptionPlanTypes } from "@app/hooks/api/subscriptions/types";

const LEGACY_SECRETS_PRODUCT = "legacy_secret_management";

type OfflineProductDef = {
  name: string;
  icon: string;
  color: string;
  displayOrder: number;
  deprecated?: boolean;
  dimensions: { key: BillingBreakdownDimension; label: string }[];
};

const OFFLINE_PRODUCTS: Record<string, OfflineProductDef> = {
  [LEGACY_SECRETS_PRODUCT]: {
    name: "Legacy Secret Management",
    icon: "key_round",
    color: "var(--color-neutral)",
    displayOrder: 0,
    deprecated: true,
    dimensions: [
      { key: BillingBreakdownDimension.Identities, label: "Identities" },
      { key: BillingBreakdownDimension.UserIdentities, label: "User Identities" }
    ]
  },
  [BillingProduct.SecretsManagement]: {
    name: "Secrets Management",
    icon: "key_round",
    color: "var(--color-product-sm)",
    displayOrder: 1,
    dimensions: [{ key: BillingBreakdownDimension.SecretIdentities, label: "Secret Identities" }]
  },
  [BillingProduct.CertificateManagement]: {
    name: "Certificate Management",
    icon: "file_badge",
    color: "var(--color-product-pki)",
    displayOrder: 2,
    dimensions: [
      { key: BillingBreakdownDimension.InternalCas, label: "Internal CAs" },
      { key: BillingBreakdownDimension.ActiveCerts, label: "Active Certificates" },
      { key: BillingBreakdownDimension.WildcardCerts, label: "Wildcard Certificates" }
    ]
  },
  [BillingProduct.Pam]: {
    name: "Privileged Access Management",
    icon: "users",
    color: "var(--color-product-pam)",
    displayOrder: 3,
    dimensions: [{ key: BillingBreakdownDimension.PamIdentities, label: "PAM Identities" }]
  }
};

export type OfflineUsagePlan = Pick<
  SubscriptionPlan,
  | "slug"
  | "identityLimit"
  | "enforceIdentityLimit"
  | "maxInternalCas"
  | "maxCertificates"
  | "maxWildcardCertificates"
  | "productPlans"
>;

const asCap = (value: number | null | undefined) => (typeof value === "number" ? value : null);

export const resolveOfflineLimit = (
  key: BillingBreakdownDimension,
  plan: OfflineUsagePlan
): number | null => {
  switch (key) {
    case BillingBreakdownDimension.Identities:
      if (plan.slug === SubscriptionPlanTypes.Enterprise && !plan.enforceIdentityLimit) return null;
      return plan.identityLimit || null;
    case BillingBreakdownDimension.InternalCas:
      return asCap(plan.maxInternalCas);
    case BillingBreakdownDimension.ActiveCerts:
      return asCap(plan.maxCertificates);
    case BillingBreakdownDimension.WildcardCerts:
      return asCap(plan.maxWildcardCertificates);
    default:
      return null;
  }
};

type ResolvedOfflineProduct = {
  id: string;
  def: OfflineProductDef;
  isLicensed: boolean;
  planTier: string;
};

export const resolveOfflineProducts = (plan: OfflineUsagePlan): ResolvedOfflineProduct[] => {
  const { productPlans } = plan;
  const v1Tier = plan.slug ?? SubscriptionPlanTypes.Enterprise;
  return Object.entries(OFFLINE_PRODUCTS).map(([id, def]) => {
    const entry = productPlans?.find(
      (product) => product.productKey === id && product.status !== "churned"
    );
    return {
      id,
      def,
      isLicensed: !productPlans || Boolean(entry),
      planTier: entry?.planKey ?? v1Tier
    };
  });
};

export const offlineQueryDimensions = (plan: OfflineUsagePlan) =>
  resolveOfflineProducts(plan)
    .filter((product) => product.isLicensed)
    .flatMap((product) => product.def.dimensions.map((dim) => dim.key));

export type OfflineDimensionUsage = { total: number; unit: string };

export const buildOfflineBilling = (
  plan: OfflineUsagePlan,
  usage: Partial<Record<BillingBreakdownDimension, OfflineDimensionUsage>>
): { overview: BillingOverview; catalog: BillingCatalogProduct[] } => {
  const catalog: BillingCatalogProduct[] = [];
  const entitlements: BillingOverview["entitlements"] = {};

  resolveOfflineProducts(plan).forEach((product) => {
    const dimensions: BillingEntitlementDim[] = product.def.dimensions.map((dim) => ({
      key: dim.key,
      label: dim.label,
      noun: usage[dim.key]?.unit ?? dim.label,
      unit: usage[dim.key]?.unit ?? dim.label,
      metered: false,
      cadence: null,
      used: usage[dim.key]?.total ?? 0,
      limit: resolveOfflineLimit(dim.key, plan),
      committed: null,
      commitAvailable: false,
      onDemandAmount: 0
    }));
    catalog.push({
      id: product.id,
      name: product.def.name,
      icon: product.def.icon,
      color: product.def.color,
      displayOrder: product.def.displayOrder,
      deprecated: product.def.deprecated,
      plans: []
    });
    if (product.isLicensed) {
      entitlements[product.id] = {
        entitled: true,
        status: "active",
        planTier: product.planTier,
        dimensions
      };
    }
  });

  return {
    catalog,
    overview: {
      isCloud: false,
      mode: "managed",
      subState: "active",
      planName: "Offline License",
      billing: {
        monthlyRecurring: 0,
        annualCommitted: 0,
        activeProductCount: Object.keys(entitlements).length,
        nextCharge: null
      },
      onDemandAmount: 0,
      payment: null,
      billingDetails: null,
      invoices: [],
      entitlements,
      trialedProductKeys: [],
      trials: [],
      trialPaymentDue: null,
      paymentAlert: null,
      checkoutFrozen: false,
      selfServe: false
    }
  };
};
