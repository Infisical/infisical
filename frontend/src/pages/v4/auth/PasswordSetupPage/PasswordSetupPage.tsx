import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import { Button } from "@app/components/v4/ui/button";
import { Stack } from "@app/components/v4/ui/layout";
import { Toaster, toast } from "@app/components/v4/ui/sonner";
import { useServerConfig } from "@app/context";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { useSetupPassword } from "@app/hooks/api/auth/queries";

import { AuthPage } from "../components/AuthPage";
import { NewPasswordFields } from "../components/NewPasswordFields";

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
  const search = useSearch({ from: "/v4/password-setup" });
  const navigate = useNavigate();
  const setupPassword = useSetupPassword();
  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password,
    policy: config.passwordPolicy
  });
  const email = search.to?.replace(" ", "+").trim();

  const handleSetPassword = async ({ password: nextPassword }: FormData) => {
    if (search.preview) return;
    const latestBreachStatus = await validatePassword(nextPassword);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }
    try {
      await setupPassword.mutateAsync({ email, token: search.token, password: nextPassword });
      setIsRedirecting(true);
      toast.success("Password successfully set", { description: "Redirecting to login..." });
      setTimeout(() => {
        window.location.href = "/v4/login";
      }, 3000);
    } catch {
      navigate({ to: "/personal-settings" });
    }
  };

  let disabledReason: string | undefined;
  if (breachStatus === "checking") disabledReason = "Checking known data breaches";
  else if (breachStatus === "breached") disabledReason = "Choose a password that isn't breached";

  return (
    <>
      <AuthPage
        variant="focused"
        pageTitle="Set Password"
        title="Set a password"
        description="Store it somewhere safe."
      >
        <form onSubmit={handleSubmit(handleSetPassword)} noValidate>
          <Stack gap={16}>
            <NewPasswordFields
              register={register}
              errors={errors}
              password={password}
              confirmPassword={confirmPassword}
              policy={config.passwordPolicy}
              breachStatus={breachStatus}
              submitCount={submitCount}
            />
            <Button
              type="submit"
              variant="accent"
              size="lg"
              className="w-full"
              loading={isSubmitting || setupPassword.isPending || isRedirecting}
              disabledReason={disabledReason}
            >
              Set password
            </Button>
          </Stack>
        </form>
      </AuthPage>
      <Toaster />
    </>
  );
};
