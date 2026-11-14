import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Card } from "@infisical/cipher/ui/card";
import { Inline } from "@infisical/cipher/ui/layout";
import { Heading } from "@infisical/cipher/ui/text";

import {
  getSelfHostedLicenseState,
  SELF_HOSTED_LICENSE_COPY
} from "@app/components/license/self-hosted-license";
import type { BillingCatalogProduct } from "@app/hooks/api/billing/types";

import { ProductIcon, useBillingSubscription } from "./shared";

import styles from "./billing.module.css";

export const InactiveProductCard = ({
  prod,
  readOnly,
  isManaged,
  selfServe,
  onManage,
  onContact
}: {
  prod: BillingCatalogProduct;
  readOnly: boolean;
  isManaged: boolean;
  selfServe: boolean;
  onManage: (productId: string) => void;
  onContact: (prod: BillingCatalogProduct) => void;
}) => {
  const subscription = useBillingSubscription();
  const trialPlan = prod.plans.find((plan) => plan.selfServe && plan.trialable);
  const hasSelfServePlan = prod.plans.some((plan) => plan.selfServe);
  const hasSalesLedPlan = prod.plans.some((plan) => plan.salesLed);
  const canActivate = !readOnly && selfServe && !prod.deprecated && hasSelfServePlan;
  const canContactSales =
    !readOnly &&
    !isManaged &&
    !prod.deprecated &&
    hasSalesLedPlan &&
    (!selfServe || !hasSelfServePlan);

  let note = "This product hasn't been activated for your organization.";
  if (isManaged) {
    note = SELF_HOSTED_LICENSE_COPY[getSelfHostedLicenseState(subscription)].inactiveProductNote;
  } else if (!selfServe && !canContactSales) {
    note = "Contact your account manager to enable this product.";
  }

  let action = null;
  if (canActivate) {
    action = (
      <Button variant="outline" size="sm" onClick={() => onManage(prod.id)}>
        {trialPlan && trialPlan.trialDays > 0
          ? `Try free for ${trialPlan.trialDays} days`
          : "View plans"}
      </Button>
    );
  } else if (canContactSales) {
    action = (
      <Button variant="outline" size="sm" iconRight="external" onClick={() => onContact(prod)}>
        Contact sales
      </Button>
    );
  }

  return (
    <Card>
      <div className={styles.productCard}>
        <Inline gap={8} wrap={false}>
          <ProductIcon product={prod} size={18} />
          <Heading level={3} size="subsection">
            {prod.name}
          </Heading>
          {prod.addon && <Badge size="sm">Add-on</Badge>}
        </Inline>
        <span className={styles.secondary}>
          {canActivate || canContactSales ? (prod.tagline ?? note) : note}
        </span>
        {action && <div>{action}</div>}
      </div>
    </Card>
  );
};
