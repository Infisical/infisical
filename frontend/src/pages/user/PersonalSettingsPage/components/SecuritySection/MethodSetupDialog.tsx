import { MFA_METHOD_LABELS, VerifyStep } from "@app/components/mfa/setup";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle
} from "@app/components/v3";
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
    <Dialog open={Boolean(method)} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {method ? `Set up ${MFA_METHOD_LABELS[method]}` : "Set up method"}
          </DialogTitle>
          <DialogDescription>Configure this method as a second factor.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto">
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
      </DialogContent>
    </Dialog>
  );
};
