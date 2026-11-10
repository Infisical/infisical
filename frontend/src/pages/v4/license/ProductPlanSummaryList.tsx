import type { ProductPlanSummary } from "@app/components/license/product-plan-summary";
import { Badge } from "@app/components/v4/ui/badge";
import { Item, ItemGroup } from "@app/components/v4/ui/item";

export const ProductPlanSummaryList = ({ plans }: { plans: ProductPlanSummary[] }) => (
  <ItemGroup aria-label="Product plans">
    {plans.map((plan) => (
      <Item
        key={plan.productKey}
        size="sm"
        title={plan.productName}
        badge={
          <Badge tone="soft">
            {plan.planLabel}
            {plan.isTrialing && " trial"}
          </Badge>
        }
      />
    ))}
  </ItemGroup>
);
