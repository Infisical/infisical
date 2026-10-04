import { Badge } from "@app/components/v3";

import { ProductPlanSummary } from "./product-plan-summary";

export const ProductPlanSummaryList = ({ plans }: { plans: ProductPlanSummary[] }) => (
  <ul className="space-y-3" aria-label="Product plans">
    {plans.map((plan) => (
      <li key={plan.productKey} className="flex items-start justify-between gap-3 text-sm">
        <span>{plan.productName}</span>
        <div className="flex flex-wrap justify-end gap-1">
          <Badge variant="info">
            {plan.planLabel}
            {plan.isTrialing && " Trial"}
          </Badge>
          {plan.isGracePeriod && <Badge variant="warning">Grace Period</Badge>}
        </div>
      </li>
    ))}
  </ul>
);
