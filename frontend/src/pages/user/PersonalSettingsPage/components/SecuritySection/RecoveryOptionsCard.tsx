import { useState } from "react";
import { EyeIcon, KeyRoundIcon, RefreshCwIcon } from "lucide-react";

import { RecoveryCodesView } from "@app/components/mfa/setup";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle
} from "@app/components/v3";

import { useRecoveryCodesMfa } from "./useRecoveryCodesMfa";

export const RecoveryOptionsCard = () => {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  // Viewing and regenerating recovery codes both require a fresh MFA challenge,
  // which this hook drives before returning the codes.
  const { isBusy, codes, isSheetOpen, closeSheet, viewCodes, regenerateCodes } =
    useRecoveryCodesMfa();

  const handleRegenerate = () => {
    setIsConfirmOpen(false);
    regenerateCodes();
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-4 text-sm font-medium text-foreground">Recovery options</h3>
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <KeyRoundIcon className="mt-0.5 text-muted" />
          <div>
            <p className="text-sm text-foreground">Recovery codes</p>
            <p className="text-xs text-muted">
              Recovery codes let you sign in if you lose access to your other methods. Each code
              works once.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" size="sm" isDisabled={isBusy} onClick={viewCodes}>
            <EyeIcon /> View
          </Button>
          <Button
            variant="outline"
            size="sm"
            isDisabled={isBusy}
            onClick={() => setIsConfirmOpen(true)}
          >
            <RefreshCwIcon /> Regenerate
          </Button>
        </div>
      </div>

      <Sheet open={isSheetOpen} onOpenChange={(open) => !open && closeSheet()}>
        <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
          <SheetHeader className="border-b">
            <SheetTitle>Recovery codes</SheetTitle>
            <SheetDescription>
              Store these somewhere safe. Each code can only be used once.
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
            <RecoveryCodesView recoveryCodes={codes ?? []} />
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate recovery codes?</AlertDialogTitle>
            <AlertDialogDescription>
              This generates a new set of recovery codes and immediately invalidates all existing
              ones. You&apos;ll be asked to verify with MFA first. Make sure to save the new codes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="danger" isPending={isBusy} onClick={handleRegenerate}>
              Regenerate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
