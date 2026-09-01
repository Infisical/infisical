import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { z } from "zod";

import { PasswordField } from "@app/components/auth/PasswordField";
import { createNotification } from "@app/components/notifications";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
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
        text: "Password changed.",
        type: "success"
      });

      reset();
      navigate({ to: "/login" });
    } catch {
      createNotification({
        text: "Failed to change password.",
        type: "error"
      });
    }
  };

  const onSetupPassword = async () => {
    try {
      await sendSetupPasswordEmail.mutateAsync();
      createNotification({
        title: "Password setup email sent",
        text: "Check your email to continue setting up a password.",
        type: "info"
      });
    } catch {
      createNotification({
        text: "Failed to send password setup email.",
        type: "error"
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Card className="gap-0 overflow-hidden p-0">
        <CardHeader className="p-6">
          <CardTitle className="font-alliance">Change Password</CardTitle>
          <CardDescription>
            Changing your password signs this session out after the update succeeds.
          </CardDescription>
        </CardHeader>
        <CardContent className="max-w-md px-6 pb-6">
          <FieldGroup>
            <Controller
              defaultValue=""
              render={({ field, fieldState: { error } }) => (
                <Field data-invalid={Boolean(error)}>
                  <FieldLabel htmlFor="change-password-current-password">
                    Current password
                  </FieldLabel>
                  <Input
                    id="change-password-current-password"
                    type="password"
                    autoComplete="current-password"
                    aria-invalid={Boolean(error)}
                    {...field}
                  />
                  <FieldError errors={[error]} />
                </Field>
              )}
              control={control}
              name="oldPassword"
            />
            <PasswordField
              id="change-password-new-password"
              label="New password"
              value={newPassword}
              policy={config.passwordPolicy}
              breachStatus={breachStatus}
              registration={register("newPassword")}
              error={errors.newPassword}
              submitCount={submitCount}
            />
          </FieldGroup>
        </CardContent>
        <CardFooter className="min-h-8 flex-wrap justify-end gap-2 border-t border-neutral/15 bg-neutral/5 p-4 pl-6">
          <Button
            type="submit"
            variant="neutral"
            size="sm"
            isPending={isSubmitting}
            isDisabled={breachStatus === "checking" || breachStatus === "breached"}
          >
            Change password
          </Button>
          <Button
            onClick={onSetupPassword}
            type="button"
            variant="outline"
            size="sm"
            isPending={sendSetupPasswordEmail.isPending}
          >
            Email setup link
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
};
