import { useEffect } from "react";
import { CalendarX2Icon, Trash2Icon } from "lucide-react";

import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle
} from "@app/components/v3";
import {
  BillingV2CatalogProduct,
  useCancelBillingV2Subscription,
  useGetBillingV2Catalog,
  useGetBillingV2Overview,
  usePreviewBillingV2Change,
  useRemoveBillingV2Product
} from "@app/hooks/api";

import { fmtMoney } from "../billing-v2-data";

type Props = {
  orgId: string;
  product: BillingV2CatalogProduct;
  // Dismissed without removing (cancel / escape / overlay); keep the management sheet open behind it.
  onClose: () => void;
  // Removal (or cancel) succeeded; close the confirm and the management sheet it was opened from.
  onRemoved: () => void;
};

const getServerMessage = (err: unknown): string | undefined =>
  (err as { response?: { data?: { message?: string } } })?.response?.data?.message;

export const RemoveProductModal = ({ orgId, product, onClose, onRemoved }: Props) => {
  // Both queries are already cached by the page (same orgId key), so this reuses that data rather
  // than refetching. Stripe can't hold a zero-item subscription, so removing the only self-serve
  // product is rejected by the license server; that case cancels the whole subscription instead.
  const { data: overview } = useGetBillingV2Overview(orgId);
  const { data: catalog = [] } = useGetBillingV2Catalog(orgId);
  const subscriptionProductCount = catalog.filter(
    (prod) => Boolean(prod.pro?.planKey) && Boolean(overview?.entitlements[prod.id]?.entitled)
  ).length;
  const isOnlyProduct = subscriptionProductCount <= 1;
  const periodEndDate = overview?.nextBillingDate ?? null;

  const preview = usePreviewBillingV2Change();
  const removeProduct = useRemoveBillingV2Product();
  const cancelSubscription = useCancelBillingV2Subscription();

  // Preview the prorated credit once when the dialog opens, so the user confirms against real numbers.
  // The last-product case can't be removed (it cancels instead), and previewing it would also 409, so
  // skip the preview there.
  useEffect(() => {
    if (isOnlyProduct) {
      return;
    }
    preview.mutate({ orgId, removeProductId: product.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, product.id, isOnlyProduct]);

  const handleRemove = async () => {
    try {
      await removeProduct.mutateAsync({ orgId, productId: product.id });
      createNotification({
        type: "success",
        text: `${product.name} will be removed. It may take a moment to update here.`
      });
      onRemoved();
    } catch (err) {
      createNotification({
        type: "error",
        text: getServerMessage(err) ?? `Failed to remove ${product.name}.`
      });
    }
  };

  const handleCancel = async () => {
    try {
      await cancelSubscription.mutateAsync({ orgId });
      createNotification({
        type: "success",
        text: "Your subscription will be canceled at the end of the current billing period."
      });
      onRemoved();
    } catch (err) {
      createNotification({
        type: "error",
        text: getServerMessage(err) ?? "Failed to cancel your subscription."
      });
    }
  };

  if (isOnlyProduct) {
    let periodClause = "at the end of your current billing period";
    if (periodEndDate) {
      periodClause = `on ${periodEndDate}`;
    }

    return (
      <AlertDialog
        open
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            onClose();
          }
        }}
      >
        <AlertDialogContent className="sm:max-w-xl!">
          <AlertDialogHeader>
            <AlertDialogMedia>
              <CalendarX2Icon />
            </AlertDialogMedia>
            <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
            <AlertDialogDescription>
              {product.name} is the only product on your subscription, so it cannot be removed on
              its own. Canceling ends your whole subscription {periodClause}. You keep access until
              then.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep subscription</AlertDialogCancel>
            <AlertDialogAction
              variant="danger"
              isDisabled={cancelSubscription.isPending}
              onClick={handleCancel}
            >
              Cancel subscription
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const credit = preview.data ? Math.abs(preview.data.prorationAmount) : 0;

  // Block while the credit preview is still in flight; a failed preview keeps the graceful
  // fallback enabled because a removal only ever credits the customer.
  const previewLoading = !preview.data && !preview.isError;

  return (
    <AlertDialog
      open
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          onClose();
        }
      }}
    >
      <AlertDialogContent className="sm:max-w-xl!">
        <AlertDialogHeader>
          <AlertDialogMedia>
            <Trash2Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>Remove {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {product.name} is removed right away. The unused time you already paid for is credited
            to your next invoice, and your other products are unaffected.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border border-border bg-mineshaft-700/40 px-4 py-3 text-sm">
          {preview.isPending && (
            <span className="text-mineshaft-300">Calculating your prorated credit...</span>
          )}
          {preview.isError && (
            <span className="text-mineshaft-300">
              We couldn&apos;t calculate the credit, but you can still remove this product.
            </span>
          )}
          {preview.data && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-mineshaft-300">Prorated credit to next invoice</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {fmtMoney(credit, 2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-mineshaft-300">New recurring total</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {fmtMoney(preview.data.nextRecurringTotal, 2)}
                </span>
              </div>
            </div>
          )}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep product</AlertDialogCancel>
          <AlertDialogAction
            variant="danger"
            isDisabled={removeProduct.isPending || previewLoading}
            onClick={handleRemove}
          >
            Remove {product.name}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
