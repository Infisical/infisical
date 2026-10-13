import { getProductPlanSummaries } from "@app/components/license/product-plan-summary";
import { Badge } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { ProjectType } from "@app/hooks/api/projects/types";

const PRODUCT_KEYS: Partial<Record<ProjectType, string>> = {
  [ProjectType.SecretManager]: "secrets_manager",
  [ProjectType.CertificateManager]: "cert_management",
  [ProjectType.PAM]: "pam"
};

export const ProductPlanBadge = ({ type }: { type: ProjectType }) => {
  const { subscription } = useSubscription();
  const productKey = PRODUCT_KEYS[type];

  const product = getProductPlanSummaries(subscription.productPlans).find(
    (plan) => plan.productKey === productKey
  );
  if (!product || product.planLabel === "Free") return null;

  return (
    <Badge variant="info" className="shrink-0 max-sm:hidden">
      {product.planLabel}
    </Badge>
  );
};
