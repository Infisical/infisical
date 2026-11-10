import { Button } from "@app/components/v4/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v4/ui/dialog";
import type { BillingCatalogPlan, BillingCatalogProduct } from "@app/hooks/api/billing/types";

import { ProductIcon } from "./product-icon";
import { focusUpgradeContinuation } from "./UpgradeDialogLayout";

type Props = {
  product: BillingCatalogProduct;
  plan: BillingCatalogPlan;
  isTrialing: boolean;
  trialEndsAt?: string | null;
  onOpenChange: (isOpen: boolean) => void;
};

export const ProductUpgradeSuccessDialog = ({
  product,
  plan,
  isTrialing,
  trialEndsAt,
  onOpenChange
}: Props) => (
  <Dialog open onOpenChange={onOpenChange}>
    <DialogContent showCloseButton={false} onOpenAutoFocus={focusUpgradeContinuation}>
      <DialogHeader role="status">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="flex shrink-0">
            <ProductIcon product={product} size={32} />
          </span>
          <DialogTitle>
            {product.name} {plan.name}
            {!isTrialing && " plan activated"}
          </DialogTitle>
        </div>
        <DialogDescription>
          {isTrialing && trialEndsAt
            ? `Trial ends ${trialEndsAt}.`
            : `Your ${isTrialing ? "trial" : "plan"} is active.`}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button
          data-upgrade-cta
          variant="primary"
          className="w-full"
          onClick={() => onOpenChange(false)}
        >
          Continue
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
