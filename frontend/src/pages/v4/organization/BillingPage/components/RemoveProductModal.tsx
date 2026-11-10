import { useEffect } from "react";

import { List, ListRow } from "@app/components/v4/ui/list";
import { SmallText } from "@app/components/v4/ui/text";
import type { BillingCatalogProduct } from "@app/hooks/api/billing/types";

import { saved } from "../../../access/toast";
import { useV4Adapter } from "../../../data/adapters";
import { dimCommitted, fmtMoney } from "../billing-format";
import { CancellationFeedbackDialog } from "./CancellationFeedbackDialog";

// Removing the last product cancels the whole subscription (handled by the remove endpoint). The
// unused-time wording depends on whether the plan carries a minimum (annual) commitment.
const COMMITMENT_MESSAGE =
  "This plan includes a minimum commitment, so any unused time isn't credited or refunded. Access ends when your commitment period closes.";
const CREDIT_MESSAGE =
  "Any remaining credits will be retained on your account and applied to future charges.";

type Props = {
  orgId: string;
  product: BillingCatalogProduct;
  // Dismissed without removing; keep the management sheet open behind it.
  onClose: () => void;
  // Removal (or cancel) succeeded; close the confirm and the management sheet it was opened from.
  onRemoved: () => void;
};

export const RemoveProductModal = ({ orgId, product, onClose, onRemoved }: Props) => {
  const billing = useV4Adapter("billing");
  // The page already caches the overview under the same key, so this reuses it. Every subscription
  // item counts as entitled, sales-led ones included, so a second one means this is not the last.
  // Offer the whole-subscription cancel only once the overview loads, so a multi-product customer
  // never flashes it.
  const {
    data: overview,
    isPending: overviewPending,
    isError: overviewError
  } = billing.useOverview(orgId);
  const overviewReady = !overviewPending && !overviewError && Boolean(overview);
  const entitledProductCount = Object.values(overview?.entitlements ?? {}).filter(
    (entitlement) => entitlement.entitled
  ).length;
  const isOnlyProduct = overviewReady && entitledProductCount === 1;
  const hasCommitment = (overview?.entitlements[product.id]?.dimensions ?? []).some(dimCommitted);

  const preview = billing.usePreviewChange();
  const removeProduct = billing.useRemoveProduct();

  // Preview the prorated credit once when the dialog opens. The last product can't be removed (it
  // cancels instead), and previewing it would 409, so skip the preview there.
  useEffect(() => {
    if (isOnlyProduct) {
      return;
    }
    preview.mutate({ orgId, removeProductId: product.id });
  }, [orgId, product.id, isOnlyProduct]);

  const handleRemove = () => removeProduct.mutateAsync({ orgId, productId: product.id });

  const handleRemoved = () => {
    saved(
      isOnlyProduct
        ? "Your subscription will be canceled. It may take a moment to update here."
        : `${product.name} will be removed. It may take a moment to update here.`
    );
    onRemoved();
  };

  if (isOnlyProduct) {
    return (
      <CancellationFeedbackDialog
        orgId={orgId}
        productId={product.id}
        action="cancel_subscription"
        icon="calendar"
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
  // Block while the credit preview is in flight; a failed preview keeps removal enabled because a
  // removal only ever credits the customer.
  const previewLoading = !preview.data && !preview.isError;

  return (
    <CancellationFeedbackDialog
      orgId={orgId}
      productId={product.id}
      action="remove_product"
      icon="trash"
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
      {preview.isError && (
        <SmallText muted>
          We couldn&apos;t calculate the credit, but you can still remove this product.
        </SmallText>
      )}
      {!preview.isError && (
        <List variant="plain" label="Removal summary" loading={!preview.data} loadingRows={2}>
          {preview.data && (
            <>
              <ListRow
                value="credit"
                label="Prorated credit to next invoice"
                title="Prorated credit to next invoice"
                meta={<span className="font-medium tabular-nums">{fmtMoney(credit, 2)}</span>}
              />
              <ListRow
                value="recurring"
                label="New recurring total"
                title="New recurring total"
                meta={
                  <span className="font-medium tabular-nums">
                    {fmtMoney(preview.data.nextRecurringTotal, 2)}
                  </span>
                }
              />
            </>
          )}
        </List>
      )}
    </CancellationFeedbackDialog>
  );
};
