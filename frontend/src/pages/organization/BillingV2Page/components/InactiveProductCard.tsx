import { CSSProperties } from "react";

import {
  getSelfHostedLicenseState,
  SELF_HOSTED_LICENSE_COPY
} from "@app/components/license/self-hosted-license";
import { Badge, Button, Card, CardTitle } from "@app/components/v3";
import { useSubscription } from "@app/context";
import { BillingV2CatalogProduct } from "@app/hooks/api";

import { ProductIcon } from "./shared";

export const InactiveProductCard = ({
  prod,
  readOnly,
  isManaged,
  selfServe,
  onManage,
  onContact
}: {
  prod: BillingV2CatalogProduct;
  readOnly: boolean;
  isManaged: boolean;
  selfServe: boolean;
  onManage: (productId: string) => void;
  onContact: (prod: BillingV2CatalogProduct) => void;
}) => {
  const { subscription } = useSubscription();
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

  return (
    <Card
      className="product-color h-full gap-3"
      style={{ "--product-color": prod.color } as CSSProperties}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <ProductIcon product={prod} size={28} />
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <CardTitle>{prod.name}</CardTitle>
            {prod.addon && <Badge variant="neutral">Add-on</Badge>}
          </div>
        </div>
      </div>
      <span className="flex-1 text-xs text-muted">
        {canActivate || canContactSales ? (prod.tagline ?? note) : note}
      </span>
      {canActivate && (
        <Button
          variant="product"
          size="xs"
          className="self-start"
          style={{ "--product-color": prod.color } as CSSProperties}
          onClick={() => onManage(prod.id)}
        >
          {trialPlan && trialPlan.trialDays > 0
            ? `Try Free for ${trialPlan.trialDays} Days`
            : "View Plans"}
        </Button>
      )}
      {canContactSales && (
        <Button variant="outline" size="xs" className="self-start" onClick={() => onContact(prod)}>
          Contact Sales
        </Button>
      )}
    </Card>
  );
};
