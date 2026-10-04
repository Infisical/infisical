import { SubscriptionPlan } from "@app/hooks/api/subscriptions/types";

const PRODUCT_NAMES = new Map([
  ["secrets_management", "Secrets Management"],
  ["cert_management", "Certificate Management"],
  ["pam", "Privileged Access Management"],
  ["agent_vault", "Agent Vault"]
]);

const PLAN_LABELS = new Map([
  ["free", "Free"],
  ["pro", "Pro"],
  ["advanced", "Advanced"],
  ["enterprise", "Enterprise"],
  ["legacy_pro_annual", "Pro"],
  ["legacy_team", "Team"],
  ["legacy_team_annual", "Team"],
  ["legacy_enterprise", "Enterprise"]
]);

export type ProductPlanSummary = {
  productKey: string;
  productName: string;
  planLabel: string;
  isTrialing: boolean;
  isGracePeriod: boolean;
};

export const getProductPlanSummaries = (plans: SubscriptionPlan["productPlans"]) => {
  const summaries = new Map<string, ProductPlanSummary>();
  (plans ?? []).forEach((plan) => {
    if (!["active", "trialing", "grace"].includes(plan.status ?? "")) return;

    const isTrialing =
      Boolean(plan.trialPlanKey || plan.status === "trialing") &&
      (!plan.trialEndsAt || new Date(plan.trialEndsAt).getTime() > Date.now());
    if (plan.status === "trialing" && !isTrialing) return;

    const planKey = isTrialing ? (plan.trialPlanKey ?? plan.planKey) : plan.planKey;
    if (!planKey) return;

    const productKey =
      plan.productKey === "legacy_secret_management" ? "secrets_management" : plan.productKey;
    if (summaries.has(productKey) && plan.productKey !== productKey) return;

    summaries.set(productKey, {
      productKey,
      productName: PRODUCT_NAMES.get(productKey) ?? productKey.replace(/_/g, " "),
      planLabel: PLAN_LABELS.get(planKey) ?? planKey.replace(/_/g, " "),
      isTrialing,
      isGracePeriod: plan.status === "grace"
    });
  });
  return [...summaries.values()];
};
