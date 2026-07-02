import { useState } from "react";
import { EyeIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react";

import { RecoveryCodesView } from "@app/components/mfa/setup";
import { createNotification } from "@app/components/notifications";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";
import { useGetMfaRecoveryCodes, useRotateMfaRecoveryCodes } from "@app/hooks/api/users";

export const RecoveryOptionsCard = () => {
  const { data: recoveryCodes = [] } = useGetMfaRecoveryCodes(true);
  const { mutateAsync: rotate, isPending: isRotating } = useRotateMfaRecoveryCodes();

  const [isViewOpen, setIsViewOpen] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [hasViewed, setHasViewed] = useState(false);

  const handleRegenerate = async () => {
    try {
      await rotate();
      setIsConfirmOpen(false);
      setIsViewOpen(true);
      createNotification({
        text: "Generated new recovery codes. Your previous codes no longer work.",
        type: "success"
      });
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to regenerate recovery codes",
        type: "error"
      });
    }
  };

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <h3 className="mb-4 text-sm font-medium text-mineshaft-100">Recovery options</h3>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <KeyRoundIcon className="mt-0.5 text-muted" />
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm text-mineshaft-100">Recovery codes</p>
              {hasViewed && <Badge variant="neutral">Viewed</Badge>}
            </div>
            <p className="text-xs text-muted">
              Recovery codes let you sign in if you lose access to your other methods. Each code
              works once.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setHasViewed(true);
              setIsViewOpen(true);
            }}
          >
            <EyeIcon /> View
          </Button>
          <Button variant="outline" size="sm" onClick={() => setIsConfirmOpen(true)}>
            <RefreshCwIcon /> Regenerate
          </Button>
        </div>
      </div>

      <Sheet open={isViewOpen} onOpenChange={setIsViewOpen}>
        <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Recovery codes</SheetTitle>
            <SheetDescription>
              Store these somewhere safe. Each code can only be used once.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <RecoveryCodesView recoveryCodes={recoveryCodes} />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate recovery codes?</AlertDialogTitle>
            <AlertDialogDescription>
              This generates a new set of recovery codes and immediately invalidates all existing
              ones. Make sure to save the new codes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isRotating} onClick={handleRegenerate}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
