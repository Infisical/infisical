import { useEffect } from "react";
import { Trash2Icon } from "lucide-react";

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
  usePreviewBillingV2Change,
  useRemoveBillingV2Product
} from "@app/hooks/api";

import { fmtMoney } from "../billing-v2-data";

type Props = {
  orgId: string;
  product: BillingV2CatalogProduct;
  onClose: () => void;
};

export const RemoveProductModal = ({ orgId, product, onClose }: Props) => {
  const preview = usePreviewBillingV2Change();
  const removeProduct = useRemoveBillingV2Product();

  // Preview the prorated credit once when the dialog opens, so the user confirms against real numbers.
  useEffect(() => {
    preview.mutate({ orgId, removeProductId: product.id });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, product.id]);

  const handleRemove = async () => {
    try {
      await removeProduct.mutateAsync({ orgId, productId: product.id });
      createNotification({
        type: "success",
        text: `${product.name} will be removed. It may take a moment to update here.`
      });
      onClose();
    } catch {
      createNotification({ type: "error", text: `Failed to remove ${product.name}.` });
    }
  };

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
            {product.name} is removed right away. The unused time you already paid for is credited to
            your next invoice, and your other products are unaffected.
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
