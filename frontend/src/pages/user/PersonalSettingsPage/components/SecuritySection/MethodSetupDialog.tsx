import { MFA_METHOD_LABELS, VerifyStep } from "@app/components/mfa/setup";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@app/components/v3";
import { MfaMethod } from "@app/hooks/api/auth/types";

type Props = {
  method: MfaMethod | null;
  onOpenChange: (isOpen: boolean) => void;
  onCompleted: () => void;
};

// Lightweight single-method setup used from the enabled view (MFA is already on
// and recovery codes already exist, so no enable/recovery steps are needed).
export const MethodSetupDialog = ({ method, onOpenChange, onCompleted }: Props) => {
  return (
    <Sheet open={Boolean(method)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>
            {method ? `Set up ${MFA_METHOD_LABELS[method]}` : "Set up method"}
          </SheetTitle>
          <SheetDescription>Configure this method as a second factor.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {method && (
            <VerifyStep
              method={method}
              onVerified={() => {
                onCompleted();
                onOpenChange(false);
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
