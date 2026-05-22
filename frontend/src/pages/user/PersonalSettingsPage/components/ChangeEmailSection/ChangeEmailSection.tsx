import { useState } from "react";
import ReactCodeInput from "react-code-input";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
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

const otpInputProps = {
  inputStyle: {
    fontFamily: "monospace",
    margin: "4px",
    MozAppearance: "textfield" as const,
    width: "45px",
    borderRadius: "6px",
    fontSize: "18px",
    height: "45px",
    padding: "0",
    paddingLeft: "0",
    paddingRight: "0",
    backgroundColor: "#262626",
    color: "white",
    border: "1px solid #404040",
    textAlign: "center" as const,
    outlineColor: "#8ca542",
    borderColor: "#404040"
  }
};

type OtpStep = "currentEmail" | "newEmail";

export const ChangeEmailSection = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const hasEmailAuth = user?.authMethods?.includes(AuthMethod.EMAIL) ?? false;
  const [otpStep, setOtpStep] = useState<OtpStep | null>(null);
  const [pendingEmail, setPendingEmail] = useState("");
  const [typedOTP, setTypedOTP] = useState("");

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

    await requestEmailChangeOTP({ newEmail });

    setPendingEmail(newEmail);
    setTypedOTP("");
    setOtpStep("currentEmail");

    createNotification({
      text: "Verification code sent to your current email address. Check your inbox!",
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
      text: "Confirmed. A second verification code has been sent to your new email address.",
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

    setTimeout(() => {
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
  const otpButtonLabel = otpStep === "currentEmail" ? "Confirm" : "Confirm Email Change";
  const isOtpSubmitLoading = otpStep === "currentEmail" ? isVerifyingCurrent : isUpdatingEmail;
  const onOtpSubmit = otpStep === "currentEmail" ? handleCurrentOtpSubmit : handleNewOtpSubmit;

  return (
    <>
      <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
        <h2 className="mb-8 flex-1 text-xl font-medium text-mineshaft-100">Change email</h2>

        <form onSubmit={emailForm.handleSubmit(handleEmailSubmit)}>
          <div className="max-w-md">
            <Controller
              control={emailForm.control}
              name="newEmail"
              render={({ field, fieldState: { error } }) => (
                <FormControl
                  label="New email address"
                  isError={Boolean(error)}
                  errorText={error?.message}
                  tooltipText={
                    hasEmailAuth
                      ? "Your email authentication method is currently enabled and will remain active after changing your email."
                      : "Email authentication method will be automatically enabled after changing your email. You may disable email authentication after logging in with your new email if needed."
                  }
                >
                  <Input
                    {...field}
                    placeholder="Enter new email address"
                    type="email"
                    className="bg-mineshaft-800"
                  />
                </FormControl>
              )}
            />
          </div>
          <Button
            type="submit"
            colorSchema="secondary"
            isLoading={isRequestingOTP}
            isDisabled={isRequestingOTP || !isEmailValid(watchedEmail)}
          >
            Send Verification Code
          </Button>
          <p className="mt-2 font-inter text-sm text-mineshaft-400">
            We&apos;ll first send a 6-digit code to your current email to confirm the change. After
            you approve, a second code will be sent to your new email to finalize it.
          </p>
        </form>
      </div>

      <Modal
        isOpen={isOtpModalOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) closeOtpModal();
        }}
      >
        <ModalContent title={otpTitle} subTitle={otpSubTitle}>
          <div className="flex flex-col items-center space-y-4">
            <div className="flex justify-center">
              <ReactCodeInput
                key={otpStep ?? "closed"}
                name="otp-input"
                inputMode="tel"
                type="text"
                fields={6}
                onChange={setTypedOTP}
                value={typedOTP}
                {...otpInputProps}
                className="mb-4"
              />
            </div>
            <div className="flex gap-2">
              <Button colorSchema="secondary" variant="outline" onClick={closeOtpModal}>
                Cancel
              </Button>
              <Button
                onClick={onOtpSubmit}
                isLoading={isOtpSubmitLoading}
                isDisabled={typedOTP.length !== 6 || isOtpSubmitLoading}
              >
                {otpButtonLabel}
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
