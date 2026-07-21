import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PasswordField } from "@app/components/auth/PasswordField";
import { createNotification } from "@app/components/notifications";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import { Button, FormControl, Input } from "@app/components/v2";
import { useServerConfig, useUser } from "@app/context";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { useResetUserPasswordV2, useSendPasswordSetupEmail } from "@app/hooks/api/auth/queries";
import { UserEncryptionVersion } from "@app/hooks/api/auth/types";
import { clearSession } from "@app/hooks/api/users/queries";

const createSchema = (passwordPolicy: TPasswordPolicy) =>
  z.object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: createPasswordSchema(passwordPolicy)
  });

export type FormData = z.infer<ReturnType<typeof createSchema>>;

export const ChangePasswordSection = () => {
  const navigate = useNavigate();

  const { user } = useUser();
  const { config } = useServerConfig();
  const {
    reset,
    control,
    handleSubmit,
    register,
    setError,
    watch,
    formState: { errors, isSubmitting, submitCount }
  } = useForm<FormData>({
    defaultValues: {
      oldPassword: "",
      newPassword: ""
    },
    resolver: zodResolver(createSchema(config.passwordPolicy)),
    mode: "onChange"
  });
  const newPassword = watch("newPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password: newPassword,
    policy: config.passwordPolicy
  });
  const sendSetupPasswordEmail = useSendPasswordSetupEmail();
  const { mutateAsync: resetPasswordV2 } = useResetUserPasswordV2();

  const onFormSubmit = async ({ oldPassword, newPassword: submittedPassword }: FormData) => {
    try {
      const latestBreachStatus = await validatePassword(submittedPassword);
      if (latestBreachStatus === "breached") {
        setError("newPassword", {
          type: "validate",
          message: "This password was found in a known data breach."
        });
        return;
      }

      if (user.encryptionVersion !== UserEncryptionVersion.V2) {
        createNotification({
          text: "Legacy encryption scheme not supported for changing password. Please contact support.",
          type: "error"
        });

        return;
      }

      await resetPasswordV2({
        oldPassword,
        newPassword: submittedPassword
      });
      clearSession();

      createNotification({
        text: "Successfully changed password",
        type: "success"
      });

      reset();
      navigate({ to: "/login" });
    } catch (err) {
      console.error(err);
      createNotification({
        text: "Failed to change password",
        type: "error"
      });
    }
  };

  const onSetupPassword = async () => {
    await sendSetupPasswordEmail.mutateAsync();

    createNotification({
      title: "Password setup verification email sent",
      text: "Check your email to confirm password setup",
      type: "info"
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onFormSubmit)}
      className="mb-6 rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-4"
    >
      <h2 className="mb-8 flex-1 text-xl font-medium text-mineshaft-100">Change password</h2>
      <div className="max-w-md">
        <Controller
          defaultValue=""
          render={({ field, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message}>
              <Input
                placeholder="Old password"
                type="password"
                {...field}
                className="bg-mineshaft-800"
              />
            </FormControl>
          )}
          control={control}
          name="oldPassword"
        />
      </div>
      <div className="max-w-md">
        <PasswordField
          id="change-password-new-password"
          value={newPassword}
          policy={config.passwordPolicy}
          breachStatus={breachStatus}
          registration={register("newPassword")}
          error={errors.newPassword}
          submitCount={submitCount}
        />
      </div>
      <Button
        type="submit"
        colorSchema="secondary"
        isLoading={isSubmitting}
        isDisabled={isSubmitting || breachStatus === "checking" || breachStatus === "breached"}
      >
        Save
      </Button>
      <p className="mt-2 font-inter text-sm text-mineshaft-400">
        Need to setup a password?{" "}
        <button
          onClick={onSetupPassword}
          type="button"
          className="underline underline-offset-2 hover:text-mineshaft-200"
        >
          Click here
        </button>
      </p>
    </form>
  );
};
