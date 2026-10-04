import { Badge } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

const PRODUCT_KEYS: Partial<Record<ProjectType, string>> = {
  [ProjectType.SecretManager]: "secrets_management",
  [ProjectType.CertificateManager]: "cert_management",
  [ProjectType.PAM]: "pam"
};

const PLAN_LABELS = new Map([
  ["pro", "Pro"],
  ["advanced", "Advanced"],
  ["enterprise", "Enterprise"],
  ["legacy_pro_annual", "Pro"],
  ["legacy_team", "Team"],
  ["legacy_team_annual", "Team"],
  ["legacy_enterprise", "Enterprise"]
]);

export const ProductPlanBadge = ({ type }: { type: ProjectType }) => {
  const { subscription } = useSubscription();
  const productKey = PRODUCT_KEYS[type];

  const plans = subscription.productPlans ?? [];
  const product =
    plans.find((plan) => plan.productKey === productKey) ??
    (type === ProjectType.SecretManager
      ? plans.find((plan) => plan.productKey === "legacy_secret_management")
      : undefined);
  const trialEndsAt = product?.trialEndsAt ? new Date(product.trialEndsAt).getTime() : null;

  if (!product || !["active", "trialing", "grace"].includes(product.status ?? "")) {
    return null;
  }

  const hasActiveTrial =
    Boolean(product.trialPlanKey || product.status === "trialing") &&
    (!product.trialEndsAt || (trialEndsAt !== null && trialEndsAt > Date.now()));
  if (product.status === "trialing" && !hasActiveTrial && !product.trialPlanKey) return null;

  const planKey = hasActiveTrial ? (product.trialPlanKey ?? product.planKey) : product.planKey;
  const label = planKey ? PLAN_LABELS.get(planKey) : undefined;
  if (!label) return null;

  return (
    <Badge variant="info" className="shrink-0 max-sm:hidden">
      {label}
    </Badge>
  );
};
