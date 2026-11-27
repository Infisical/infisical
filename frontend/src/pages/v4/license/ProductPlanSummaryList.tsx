import { Badge } from "@infisical/cipher/ui/badge";

import type { ProductPlanSummary } from "@app/components/license/product-plan-summary";

import styles from "./upgrade-dialog.module.css";

export const ProductPlanSummaryList = ({ plans }: { plans: ProductPlanSummary[] }) => (
  <ul className={styles.plans} aria-label="Product plans">
    {plans.map((plan) => (
      <li key={plan.productKey} className={styles.plan}>
        <span>{plan.productName}</span>
        <Badge tone="soft">
          {plan.planLabel}
          {plan.isTrialing && " trial"}
        </Badge>
      </li>
    ))}
  </ul>
);
