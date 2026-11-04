import { CSSProperties } from "react";
import { CircleCheck } from "lucide-react";

import {
  Button,
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
import { BillingV2CatalogProduct, BillingV2Plan } from "@app/hooks/api";
import { ProductIcon } from "@app/pages/organization/BillingV2Page/components/shared";

import { focusUpgradeContinuation } from "./UpgradeDialogLayout";

type Props = {
  product: BillingV2CatalogProduct;
  plan: BillingV2Plan;
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
    <DialogContent
      height="auto"
      showCloseButton={false}
      onOpenAutoFocus={focusUpgradeContinuation}
      className="max-w-sm gap-5"
    >
      <DialogBody role="status" className="flex flex-col items-center gap-4 text-center">
        <div aria-hidden="true" className="relative shrink-0">
          <ProductIcon product={product} size={48} />
          <CircleCheck className="absolute -right-1 -bottom-1 size-5 rounded-full bg-popover text-success" />
        </div>
        <DialogHeader className="w-full items-center gap-2 text-center">
          <DialogTitle className="leading-snug">
            {product.name} {plan.name}
            {!isTrialing && " Plan Activated"}
          </DialogTitle>
          <DialogDescription className={isTrialing && trialEndsAt ? undefined : "sr-only"}>
            {isTrialing && trialEndsAt
              ? `Trial ends ${trialEndsAt}.`
              : `Your ${isTrialing ? "trial" : "plan"} is active.`}
          </DialogDescription>
        </DialogHeader>
      </DialogBody>
      <DialogFooter className="gap-4">
        <Button
          data-upgrade-cta
          variant="product"
          className="w-full justify-center"
          style={{ "--product-color": product.color } as CSSProperties}
          onClick={() => onOpenChange(false)}
        >
          Continue
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
