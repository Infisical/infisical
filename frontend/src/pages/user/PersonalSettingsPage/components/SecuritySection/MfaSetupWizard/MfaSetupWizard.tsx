import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlertIcon } from "lucide-react";

import { MethodStep, RecoveryCodesView, VerifyStep, WIZARD_STEPS } from "@app/components/mfa/setup";
import { createNotification } from "@app/components/notifications";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { userKeys, useUpdateUserMfa } from "@app/hooks/api";
import { MfaMethod } from "@app/hooks/api/auth/types";

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
};

export const MfaSetupWizard = ({ isOpen, onOpenChange }: Props) => {
  const queryClient = useQueryClient();
  const { mutateAsync: updateUserMfa } = useUpdateUserMfa();

  const [step, setStep] = useState(0);
  const [selectedMethod, setSelectedMethod] = useState<MfaMethod>(MfaMethod.TOTP);
  const [hasSaved, setHasSaved] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);

  const hasRecoveryCodes = recoveryCodes.length > 0;

  useEffect(() => {
    if (!isOpen) {
      // Reset once the close animation is unlikely to be visible.
      setStep(0);
      setSelectedMethod(MfaMethod.TOTP);
      setHasSaved(false);
      setRecoveryCodes([]);
    }
  }, [isOpen]);

  const handleVerified = async () => {
    try {
      const { recoveryCodes: codes } = await updateUserMfa({
        isMfaEnabled: true,
        selectedMfaMethod: selectedMethod
      });
      setRecoveryCodes(codes ?? []);
    } catch (error: any) {
      createNotification({
        text: error?.response?.data?.message || "Failed to enable two-factor authentication",
        type: "error"
      });
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: userKeys.getUser }),
      queryClient.invalidateQueries({ queryKey: userKeys.totpConfiguration }),
      queryClient.invalidateQueries({ queryKey: userKeys.mfaRecoveryCodes })
    ]);
    setStep(2);
  };

  const handleDone = () => {
    createNotification({ text: "Two-factor authentication enabled", type: "success" });
    onOpenChange(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col gap-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle>Enable two-factor authentication</SheetTitle>
          <SheetDescription>Add a second factor to protect your account.</SheetDescription>
        </SheetHeader>

        <div className="border-b border-border px-4 py-4">
          <Stepper activeStep={step} orientation="horizontal">
            <StepperList>
              {WIZARD_STEPS.map((s, index) => (
                <StepperStep
                  key={s.key}
                  index={index}
                  title={s.title}
                  description={s.description}
                />
              ))}
            </StepperList>
          </Stepper>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
          {step === 0 && (
            <MethodStep selectedMethod={selectedMethod} onSelect={setSelectedMethod} />
          )}
          {step === 1 && <VerifyStep method={selectedMethod} onVerified={handleVerified} />}
          {step === 2 && (
            <div className="flex flex-col gap-4">
              {hasRecoveryCodes ? (
                <>
                  <Alert variant="warning">
                    <TriangleAlertIcon />
                    <AlertTitle>Save your recovery codes</AlertTitle>
                    <AlertDescription>
                      Store these somewhere safe. Each code works once and lets you sign in if you
                      lose access to your other methods.
                    </AlertDescription>
                  </Alert>
                  <RecoveryCodesView
                    recoveryCodes={recoveryCodes}
                    onSaved={() => setHasSaved(true)}
                  />
                </>
              ) : (
                <Alert variant="danger">
                  <TriangleAlertIcon />
                  <AlertTitle>Couldn&apos;t load recovery codes</AlertTitle>
                  <AlertDescription>
                    Two-factor authentication is enabled, but we couldn&apos;t display your recovery
                    codes. Regenerate them from the Recovery options section so you don&apos;t get
                    locked out.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <SheetFooter className="items-center justify-between border-t">
          <span className="text-xs text-muted">
            Step {step + 1} of {WIZARD_STEPS.length}
          </span>
          <div className="flex items-center gap-3">
            {step === 1 && (
              <Button variant="outline" onClick={() => setStep(0)}>
                Back
              </Button>
            )}
            {step === 0 && (
              <Button variant="org" onClick={() => setStep(1)}>
                Continue
              </Button>
            )}
            {step === 2 && (
              <Button
                variant="org"
                isDisabled={!hasRecoveryCodes || !hasSaved}
                onClick={handleDone}
              >
                Done
              </Button>
            )}
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
