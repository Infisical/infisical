import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useUser } from "@app/context";
import { useRequestEmailChangeOTP, useUpdateUserEmail } from "@app/hooks/api/users";
import { clearSession } from "@app/hooks/api/users/queries";

const emailSchema = z
  .object({
    newEmail: z.string().email("Please enter a valid email")
  })
  .required();

const otpSchema = z
  .object({
    otpCode: z.string().length(8, "OTP code must be exactly 8 digits")
  })
  .required();

export type EmailFormData = z.infer<typeof emailSchema>;
export type OTPFormData = z.infer<typeof otpSchema>;

export const ChangeEmailSection = () => {
  const navigate = useNavigate();
  const { user } = useUser();
  const [step, setStep] = useState<"email" | "otp">("email");
  const [pendingEmail, setPendingEmail] = useState("");

  const emailForm = useForm<EmailFormData>({
    defaultValues: { newEmail: "" },
    resolver: zodResolver(emailSchema)
  });

  const otpForm = useForm<OTPFormData>({
    defaultValues: { otpCode: "" },
    resolver: zodResolver(otpSchema)
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

    try {
      await requestEmailChangeOTP({ newEmail });
      setPendingEmail(newEmail);
      setStep("otp");

      createNotification({
        text: "Verification code sent to your new email address. Check your inbox!",
        type: "success"
      });
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.response?.data?.message || "Failed to send verification code";
      createNotification({
        text: errorMessage,
        type: "error"
      });
    }
  };

  const handleOTPSubmit = async ({ otpCode }: OTPFormData) => {
    try {
      await updateUserEmail({ newEmail: pendingEmail, otpCode });

      createNotification({
        text: "Email updated successfully. You will be redirected to login.",
        type: "success"
      });

      // Reset forms
      emailForm.reset();
      otpForm.reset();
      setStep("email");
      setPendingEmail("");

      // Clear frontend session/token to ensure proper logout
      clearSession(true);

      // Redirect to login after a short delay
      setTimeout(() => {
        navigate({ to: "/login" });
      }, 2000);
    } catch (err: any) {
      console.error(err);

      const errorMessage = err?.response?.data?.message || "Invalid verification code";
      if (errorMessage.includes("Invalid verification code")) {
        // Reset to email step so user must request new OTP
        setStep("email");
        setPendingEmail("");
        emailForm.reset();
        otpForm.reset();

        createNotification({
          text: "Invalid verification code. Please request a new one.",
          type: "error"
        });
      } else {
        createNotification({
          text: errorMessage,
          type: "error"
        });
      }
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4">
      <h2 className="mb-8 flex-1 text-xl font-semibold text-mineshaft-100">Change email</h2>

      {step === "email" ? (
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
            We&apos;ll send an 8-digit verification code to your new email address.
          </p>
        </form>
      ) : (
        <div>
          <div className="mb-4">
            <p className="text-sm text-mineshaft-300">
              Enter the 8-digit verification code sent to: <b>{pendingEmail}</b>
            </p>
          </div>

          <form onSubmit={otpForm.handleSubmit(handleOTPSubmit)}>
            <div className="max-w-md">
              <Controller
                control={otpForm.control}
                name="otpCode"
                render={({ field, fieldState: { error } }) => (
                  <FormControl
                    label="Verification code"
                    isError={Boolean(error)}
                    errorText={error?.message}
                  >
                    <Input
                      {...field}
                      placeholder="Enter 8-digit code"
                      maxLength={8}
                      className="bg-mineshaft-800 text-center font-mono"
                    />
                  </FormControl>
                )}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                type="button"
                variant="outline_bg"
                onClick={() => {
                  setStep("email");
                  setPendingEmail("");
                  otpForm.reset();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                colorSchema="primary"
                isLoading={isUpdatingEmail}
                isDisabled={isUpdatingEmail}
              >
                Confirm Email Change
              </Button>
            </div>
          </form>

          <p className="mt-2 font-inter text-sm text-mineshaft-400">
            After confirming, you&apos;ll be logged out and need to sign in again.
          </p>
        </div>
      )}
    </div>
  );
};
