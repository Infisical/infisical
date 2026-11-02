import { useEffect } from "react";
import { CalendarX2Icon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  BillingV2CatalogProduct,
  useGetBillingV2Overview,
  usePreviewBillingV2Change,
  useRemoveBillingV2Product
} from "@app/hooks/api";

import { dimCommitted, fmtMoney } from "../billing-v2-format";
import { CancellationFeedbackDialog } from "./CancellationFeedbackDialog";

// Removing the last product cancels the whole subscription (handled by the remove endpoint). The
// unused-time wording depends on whether the plan carries a minimum (annual) commitment.
const COMMITMENT_MESSAGE =
  "This plan includes a minimum commitment, so any unused time isn't credited or refunded. Access ends when your commitment period closes.";
const CREDIT_MESSAGE =
  "Any remaining credits will be retained on your account and applied to future charges.";

type Props = {
  orgId: string;
  product: BillingV2CatalogProduct;
  // Dismissed without removing (cancel / escape / overlay); keep the management sheet open behind it.
  onClose: () => void;
  // Removal (or cancel) succeeded; close the confirm and the management sheet it was opened from.
  onRemoved: () => void;
};

export const RemoveProductModal = ({ orgId, product, onClose, onRemoved }: Props) => {
  // Overview is already cached by the page (same orgId key), so this reuses it without refetching.
  // Count every entitled product (the backend marks every subscription item entitled, including
  // sales-led ones), so a second item means removing this one is not the last. Only offer the
  // destructive whole-subscription cancel when this is the sole product, and only after the overview
  // loads so a multi-product customer never flashes it.
  const { data: overview, isSuccess: overviewReady } = useGetBillingV2Overview(orgId);
  const entitledProductCount = Object.values(overview?.entitlements ?? {}).filter(
    (entitlement) => entitlement.entitled
  ).length;
  const isOnlyProduct = overviewReady && entitledProductCount === 1;
  // A minimum (annual) commitment means unused time is not credited/refunded on removal.
  const hasCommitment = (overview?.entitlements[product.id]?.dimensions ?? []).some(dimCommitted);

  const preview = usePreviewBillingV2Change();
  const removeProduct = useRemoveBillingV2Product();

  // Preview the prorated credit once when the dialog opens, so the user confirms against real numbers.
  // The last-product case can't be removed (it cancels instead), and previewing it would also 409, so
  // skip the preview there.
  useEffect(() => {
    if (isOnlyProduct) {
      return;
    }
    preview.mutate({ orgId, removeProductId: product.id });
  }, [orgId, product.id, isOnlyProduct]);

  const handleRemove = () => removeProduct.mutateAsync({ orgId, productId: product.id });

  const handleRemoved = () => {
    createNotification({
      type: "success",
      text: isOnlyProduct
        ? "Your subscription will be canceled. It may take a moment to update here."
        : `${product.name} will be removed. It may take a moment to update here.`
    });
    onRemoved();
  };

  if (isOnlyProduct) {
    return (
      <CancellationFeedbackDialog
        orgId={orgId}
        productId={product.id}
        action="cancel_subscription"
        icon={<CalendarX2Icon />}
        title="Cancel your subscription?"
        description={`${product.name} is the only product on your subscription, so removing it ends your subscription. ${hasCommitment ? COMMITMENT_MESSAGE : CREDIT_MESSAGE}`}
        reasonLabel="Why are you canceling?"
        confirmLabel="Cancel subscription"
        dismissLabel="Keep subscription"
        onConfirm={handleRemove}
        onConfirmed={handleRemoved}
        onDismiss={onClose}
      />
    );
  }

  const credit = preview.data ? Math.abs(preview.data.prorationAmount) : 0;

  // Block while the credit preview is still in flight; a failed preview keeps the graceful
  // fallback enabled because a removal only ever credits the customer.
  const previewLoading = !preview.data && !preview.isError;

  return (
    <CancellationFeedbackDialog
      orgId={orgId}
      productId={product.id}
      action="remove_product"
      icon={<Trash2Icon />}
      title={`Remove ${product.name}?`}
      description={`${product.name} is removed right away. The unused time you already paid for is credited to your next invoice, and your other products are unaffected.`}
      reasonLabel={`Why are you removing ${product.name}?`}
      confirmLabel={`Remove ${product.name}`}
      dismissLabel="Keep product"
      isConfirmDisabled={previewLoading}
      onConfirm={handleRemove}
      onConfirmed={handleRemoved}
      onDismiss={onClose}
    >
      <div className="rounded-md border border-border bg-surface-hover/40 px-4 py-3 text-sm">
        {preview.isPending && (
          <span className="text-label">Calculating your prorated credit...</span>
        )}
        {preview.isError && (
          <span className="text-label">
            We couldn&apos;t calculate the credit, but you can still remove this product.
          </span>
        )}
        {preview.data && (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-label">Prorated credit to next invoice</span>
              <span className="font-semibold text-foreground tabular-nums">
                {fmtMoney(credit, 2)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-label">New recurring total</span>
              <span className="font-semibold text-foreground tabular-nums">
                {fmtMoney(preview.data.nextRecurringTotal, 2)}
              </span>
            </div>
          </div>
        )}
      </div>
    </CancellationFeedbackDialog>
  );
};
