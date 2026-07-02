import { useEffect } from "react";
import { PlusIcon } from "lucide-react";

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
  BillingV2Cadence,
  BillingV2CatalogProduct,
  useAddBillingV2Product,
  usePreviewBillingV2Change
} from "@app/hooks/api";

import { fmtMoney } from "../billing-v2-data";

type Props = {
  orgId: string;
  product: BillingV2CatalogProduct;
  plan: string;
  cadence: BillingV2Cadence;
  onClose: () => void;
};

export const AddProductModal = ({ orgId, product, plan, cadence, onClose }: Props) => {
  const preview = usePreviewBillingV2Change();
  const addProduct = useAddBillingV2Product();

  // Preview the prorated charge once when the dialog opens, so the user confirms against real numbers.
  useEffect(() => {
    preview.mutate({ orgId, addProductId: product.id, plan, cadence });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, product.id, plan, cadence]);

  const handleAdd = async (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    try {
      await addProduct.mutateAsync({ orgId, productId: product.id, plan, cadence });
      createNotification({
        type: "success",
        text: `${product.name} was added. It may take a moment to update here.`
      });
      onClose();
    } catch {
      createNotification({ type: "error", text: `Failed to add ${product.name}.` });
    }
  };

  const dueToday = preview.data ? Math.max(preview.data.prorationAmount, 0) : 0;

  // Only let the user commit a charge once the prorated cost has rendered; a still-loading or
  // failed preview keeps the confirm disabled so nobody pays without seeing the amount.
  const canConfirm = Boolean(preview.data);

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
            <PlusIcon />
          </AlertDialogMedia>
          <AlertDialogTitle>Add {product.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {product.name} is added to your subscription right away. You are charged an estimated
            prorated amount for the rest of this billing period, then the new recurring total going
            forward.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-md border border-border bg-mineshaft-700/40 px-4 py-3 text-sm">
          {preview.isPending && (
            <span className="text-mineshaft-300">Calculating your prorated charge...</span>
          )}
          {preview.isError && (
            <span className="text-mineshaft-300">
              We couldn&apos;t calculate the charge, but you can still add this product.
            </span>
          )}
          {preview.data && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-mineshaft-300">Estimated due today</span>
                <span className="font-semibold text-foreground tabular-nums">
                  {fmtMoney(dueToday, 2)}
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
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="org"
            isDisabled={addProduct.isPending || !canConfirm}
            onClick={handleAdd}
            isPending={addProduct.isPending}
          >
            Add {product.name}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
