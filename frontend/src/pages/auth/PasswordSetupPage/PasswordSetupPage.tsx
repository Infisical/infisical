import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";

import { AuthPageLayout } from "@app/components/auth/AuthPageLayout";
import { AuthPagePanel } from "@app/components/auth/AuthPagePanel";
import { PasswordField } from "@app/components/auth/PasswordField";
import { createNotification } from "@app/components/notifications";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AnimatedCollapse,
  Button,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { ROUTE_PATHS } from "@app/const/routes";
import { useServerConfig } from "@app/context";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { useSetupPassword } from "@app/hooks/api/auth/queries";

const createSchema = (passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "Please confirm your password")
    })
    .refine(({ confirmPassword, password }) => confirmPassword === password, {
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });

type FormData = z.infer<ReturnType<typeof createSchema>>;

export const PasswordSetupPage = () => {
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { config } = useServerConfig();
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setError,
    watch
  } = useForm<FormData>({
    resolver: zodResolver(createSchema(config.passwordPolicy)),
    mode: "onChange",
    defaultValues: { password: "", confirmPassword: "" }
  });

  const search = useSearch({ from: ROUTE_PATHS.Auth.PasswordSetupPage.id });
  const navigate = useNavigate();
  const setupPassword = useSetupPassword();
  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password,
    policy: config.passwordPolicy
  });

  const token = search.token as string;
  const email = (search.to as string)?.replace(" ", "+").trim();

  const handleSetPassword = async ({ password: nextPassword }: FormData) => {
    const latestBreachStatus = await validatePassword(nextPassword);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }

    try {
      await setupPassword.mutateAsync({ email, token, password: nextPassword });
      setIsRedirecting(true);
      createNotification({
        type: "success",
        title: "Password successfully set",
        text: "Redirecting to login..."
      });

      setTimeout(() => {
        window.location.href = "/login";
      }, 3000);
    } catch {
      navigate({ to: "/personal-settings" });
    }
  };

  const isLoading = isSubmitting || setupPassword.isPending || isRedirecting;
  const showDangerState = submitCount > 0;
  const isPasswordValidated = breachStatus === "safe" || breachStatus === "unavailable";
  const doPasswordsMatch = confirmPassword.length > 0 && password === confirmPassword;

  return (
    <AuthPageLayout>
      <form className="w-full" onSubmit={handleSubmit(handleSetPassword)}>
        <AuthPagePanel>
          <CardHeader className="mb-6 gap-2">
            <CardTitle>Set Password</CardTitle>
            <CardDescription>Make sure to store your password somewhere safe.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <PasswordField
              id="password-setup-password"
              value={password}
              policy={config.passwordPolicy}
              breachStatus={breachStatus}
              registration={register("password")}
              error={showDangerState ? errors.password : undefined}
              submitCount={submitCount}
            />
            <AnimatedCollapse
              isOpen={isPasswordValidated}
              contentClassName={isPasswordValidated ? "overflow-visible" : undefined}
            >
              <Field data-invalid={showDangerState && Boolean(errors.confirmPassword)}>
                <FieldLabel htmlFor="password-setup-confirm-password">Confirm Password</FieldLabel>
                <InputGroup>
                  <InputGroupInput
                    {...register("confirmPassword")}
                    id="password-setup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    aria-invalid={showDangerState && Boolean(errors.confirmPassword)}
                  />
                  <InputGroupAddon align="inline-end">
                    <InputGroupButton
                      onClick={() => setShowConfirmPassword((current) => !current)}
                      aria-label={
                        showConfirmPassword
                          ? "Hide password confirmation"
                          : "Show password confirmation"
                      }
                    >
                      {showConfirmPassword ? <EyeOff /> : <Eye />}
                    </InputGroupButton>
                  </InputGroupAddon>
                </InputGroup>
                <AnimatedCollapse isOpen={confirmPassword.length > 0}>
                  <div className="flex items-start gap-2 pt-1 text-xs" aria-live="polite">
                    {doPasswordsMatch ? (
                      <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
                    ) : (
                      <X className="mt-0.5 size-3.5 shrink-0 text-danger" />
                    )}
                    <span className={doPasswordsMatch ? "text-muted" : "text-danger"}>
                      {doPasswordsMatch ? "Passwords match" : "Passwords do not match"}
                    </span>
                  </div>
                </AnimatedCollapse>
                {showDangerState && errors.confirmPassword ? (
                  <FieldError>{errors.confirmPassword.message}</FieldError>
                ) : null}
              </Field>
            </AnimatedCollapse>
            <Button
              isDisabled={isLoading || breachStatus === "checking" || breachStatus === "breached"}
              variant="project"
              size="lg"
              type="submit"
              isFullWidth
              isPending={isLoading}
            >
              Submit
            </Button>
          </CardContent>
        </AuthPagePanel>
      </form>
    </AuthPageLayout>
  );
};
