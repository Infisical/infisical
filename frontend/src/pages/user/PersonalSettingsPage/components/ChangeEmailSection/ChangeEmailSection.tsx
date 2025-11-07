import { useState } from "react";
import ReactCodeInput from "react-code-input";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input, Modal, ModalContent } from "@app/components/v2";
import { useUser } from "@app/context";
import { useRequestEmailChangeOTP, useUpdateUserEmail } from "@app/hooks/api/users";
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

export const ChangeEmailSection = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const hasEmailAuth = user?.authMethods?.includes(AuthMethod.EMAIL) ?? false;
  const [isOTPModalOpen, setIsOTPModalOpen] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");

  const emailForm = useForm<EmailFormData>({
    defaultValues: { newEmail: "" },
    resolver: zodResolver(emailSchema)
  });

  const { mutateAsync: requestEmailChangeOTP, isPending: isRequestingOTP } =
    useRequestEmailChangeOTP();
  const { mutateAsync: updateUserEmail, isPending: isUpdatingEmail } = useUpdateUserEmail();

  // Watch the email field to enable/disable the button
  const watchedEmail = useWatch({
    control: emailForm.control,
    name: "newEmail",
    defaultValue: ""
  });

  // Helper function to check if email is valid
  const isEmailValid = (email: string): boolean => {
    try {
      emailSchema.parse({ newEmail: email });
      return true;
    } catch {
      return false;
    }
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
    setIsOTPModalOpen(true);

    createNotification({
      text: "Verification code sent to your new email address. Check your inbox!",
      type: "success"
    });
  };

  const [typedOTP, setTypedOTP] = useState("");

  const handleOTPSubmit = async () => {
    if (typedOTP.length !== 6) {
      createNotification({
        text: "Please enter the complete 6-digit verification code",
        type: "error"
      });
      return;
    }

    try {
      await updateUserEmail({ newEmail: pendingEmail, otpCode: typedOTP });

      createNotification({
        text: "Email updated successfully. You will be redirected to login.",
        type: "success"
      });

      // Reset forms and close modal
      emailForm.reset();
      setIsOTPModalOpen(false);
      setPendingEmail("");
      setTypedOTP("");

      // Clear frontend session/token to ensure proper logout
      clearSession(true);

      // Redirect to login after a short delay
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 2000);
    } catch (err: any) {
      const errorMessage = err?.response?.data?.message || "Invalid verification code";
      if (errorMessage.includes("Invalid verification code")) {
        // Reset to email step so user must request new OTP
        setIsOTPModalOpen(false);
        setPendingEmail("");
        setTypedOTP("");
        emailForm.reset();

        createNotification({
          text: "Invalid verification code. Please request a new one.",
          type: "error"
        });
      }
    }
  };

  const handleOTPModalClose = () => {
    setIsOTPModalOpen(false);
    setPendingEmail("");
    setTypedOTP("");
  };

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
            We&apos;ll send an 6-digit verification code to your new email address.
          </p>
        </form>
      </div>

      <Modal
        isOpen={isOTPModalOpen}
        onOpenChange={(isOpen) => {
          if (!isOpen) handleOTPModalClose();
        }}
      >
        <ModalContent
          title="Email Verification"
          subTitle={`Enter the 6-digit verification code sent to: ${pendingEmail}`}
        >
          <div className="flex flex-col items-center space-y-4">
            <div className="flex justify-center">
              <ReactCodeInput
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
              <Button colorSchema="secondary" variant="outline" onClick={handleOTPModalClose}>
                Cancel
              </Button>
              <Button
                onClick={handleOTPSubmit}
                isLoading={isUpdatingEmail}
                isDisabled={typedOTP.length !== 6}
              >
                Confirm Email Change
              </Button>
            </div>
          </div>
        </ModalContent>
      </Modal>
    </>
  );
};
