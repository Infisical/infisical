import { useEffect, useRef, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  VerificationCodeForm
} from "@app/components/v3";
import { useUser } from "@app/context";
import {
  useRequestEmailChangeOTP,
  useUpdateUserEmail,
  useVerifyCurrentEmailOTP
} from "@app/hooks/api/users";
import { clearSession } from "@app/hooks/api/users/queries";
import { AuthMethod } from "@app/hooks/api/users/types";

const emailSchema = z
  .object({
    newEmail: z.string().email("Please enter a valid email")
  })
  .required();

export type EmailFormData = z.infer<typeof emailSchema>;

type OtpStep = "currentEmail" | "newEmail";

export const ChangeEmailSection = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const hasEmailAuth = user?.authMethods?.includes(AuthMethod.EMAIL) ?? false;
  const [otpStep, setOtpStep] = useState<OtpStep | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [typedOTP, setTypedOTP] = useState("");
  const redirectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (redirectTimer.current) clearTimeout(redirectTimer.current);
    },
    []
  );

  const emailForm = useForm<EmailFormData>({
    defaultValues: { newEmail: "" },
    resolver: zodResolver(emailSchema)
  });

  const { mutateAsync: requestEmailChangeOTP, isPending: isRequestingOTP } =
    useRequestEmailChangeOTP();
  const { mutateAsync: verifyCurrentEmailOTP, isPending: isVerifyingCurrent } =
    useVerifyCurrentEmailOTP();
  const { mutateAsync: updateUserEmail, isPending: isUpdatingEmail } = useUpdateUserEmail();

  const watchedEmail = useWatch({
    control: emailForm.control,
    name: "newEmail",
    defaultValue: ""
  });

  const isEmailValid = (email: string): boolean => {
    try {
      emailSchema.parse({ newEmail: email });
      return true;
    } catch {
      return false;
    }
  };

  const closeOtpModal = () => {
    setOtpStep(null);
    setTypedOTP("");
  };

  const resetFlow = () => {
    closeOtpModal();
    setPendingEmail("");
    emailForm.reset();
  };

  const handleEmailSubmit = async ({ newEmail }: EmailFormData) => {
    if (newEmail.toLowerCase() === user?.email?.toLowerCase()) {
      createNotification({
        text: "New email must be different from current email",
        type: "error"
      });
      return;
    }

    try {
      await requestEmailChangeOTP({ newEmail });
    } catch {
      createNotification({
        text: "Failed to send an email-change verification code.",
        type: "error"
      });
      return;
    }

    setPendingEmail(newEmail);
    setTypedOTP("");
    setOtpStep("currentEmail");

    createNotification({
      text: "Verification code sent to your current email address.",
      type: "success"
    });
  };

  const handleCurrentOtpSubmit = async () => {
    if (typedOTP.length !== 6) {
      createNotification({
        text: "Please enter the complete 6-digit verification code",
        type: "error"
      });
      return;
    }

    try {
      await verifyCurrentEmailOTP({ otpCode: typedOTP });
    } catch {
      // The OTP token is single-use (triesLeft = 1) — any failure consumes it server-side,
      // so the user must restart the flow to request a fresh code.
      resetFlow();
      return;
    }

    setTypedOTP("");
    setOtpStep("newEmail");

    createNotification({
      text: "Confirmed. Check the inbox of your new email address to continue.",
      type: "success"
    });
  };

  const handleNewOtpSubmit = async () => {
    if (typedOTP.length !== 6) {
      createNotification({
        text: "Please enter the complete 6-digit verification code",
        type: "error"
      });
      return;
    }

    try {
      await updateUserEmail({ newEmail: pendingEmail, otpCode: typedOTP });
    } catch {
      resetFlow();
      return;
    }

    createNotification({
      text: "Email updated successfully. You will be redirected to login.",
      type: "success"
    });

    resetFlow();
    clearSession();

    redirectTimer.current = setTimeout(() => {
      navigate({ to: "/login" });
    }, 2000);
  };

  const isOtpModalOpen = otpStep !== null;
  const otpRecipient = otpStep === "currentEmail" ? (user?.email ?? "") : pendingEmail;
  const otpSubTitle =
    otpStep === "currentEmail"
      ? `Enter the 6-digit code sent to your current email: ${otpRecipient}`
      : `Enter the 6-digit code sent to your new email: ${otpRecipient}`;
  const otpTitle =
    otpStep === "currentEmail" ? "Confirm from current email" : "Confirm from new email";
  const otpButtonLabel = otpStep === "currentEmail" ? "Confirm" : "Confirm email change";
  const isOtpSubmitLoading = otpStep === "currentEmail" ? isVerifyingCurrent : isUpdatingEmail;
  const onOtpSubmit = otpStep === "currentEmail" ? handleCurrentOtpSubmit : handleNewOtpSubmit;

  return (
    <>
      <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)}>
        <Card>
          <CardHeader>
            <CardTitle>Change Email</CardTitle>
            <CardDescription>
              Verify both your current and new email addresses. A successful change signs you out.
            </CardDescription>
          </CardHeader>
          <CardContent className="max-w-md">
            <Controller
              control={emailForm.control}
              name="newEmail"
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="new-email-address">New email address</FieldLabel>
                  <Input
                    id="new-email-address"
                    {...field}
                    placeholder="Enter new email address"
                    type="email"
                    autoComplete="email"
                    aria-invalid={Boolean(error)}
                  />
                  <FieldDescription>
                    {hasEmailAuth
                      ? "Email authentication remains enabled after the change."
                      : "Email authentication will be enabled automatically. You can change it after signing in with your new email."}
                  </FieldDescription>
                  <FieldError errors={[error]} />
                </Field>
              )}
            />
          </CardContent>
          <CardFooter>
            <Button
              type="submit"
              variant="neutral"
              isPending={isRequestingOTP}
              isDisabled={!isEmailValid(watchedEmail) || isOtpModalOpen}
            >
              Send verification code
            </Button>
          </CardFooter>
        </Card>
      </form>

      <Dialog
        open={isOtpModalOpen}
        onOpenChange={(open) => {
          if (!open && !isOtpSubmitLoading) closeOtpModal();
        }}
      >
        <DialogContent
          className="sm:max-w-md"
          onEscapeKeyDown={(event) => isOtpSubmitLoading && event.preventDefault()}
          onInteractOutside={(event) => isOtpSubmitLoading && event.preventDefault()}
          showCloseButton={!isOtpSubmitLoading}
        >
          <DialogHeader>
            <DialogTitle>{otpTitle}</DialogTitle>
            <DialogDescription>{otpSubTitle}</DialogDescription>
          </DialogHeader>
          <VerificationCodeForm
            key={otpStep ?? "closed"}
            name="email-change-verification-code"
            value={typedOTP}
            onChange={setTypedOTP}
            onSubmit={onOtpSubmit}
            submitLabel={otpButtonLabel}
            submitVariant="neutral"
            isPending={isOtpSubmitLoading}
          >
            {otpStep === "newEmail" && (
              <p className="text-center text-xs text-muted">
                Didn&apos;t get a code? If the new address already belongs to another Infisical
                account, we&apos;ve sent it an email explaining why the change can&apos;t be
                completed.
              </p>
            )}
            <div className="flex justify-center">
              <Button
                type="button"
                variant="outline"
                onClick={closeOtpModal}
                isDisabled={isOtpSubmitLoading}
              >
                Cancel
              </Button>
            </div>
          </VerificationCodeForm>
        </DialogContent>
      </Dialog>
    </>
  );
};
