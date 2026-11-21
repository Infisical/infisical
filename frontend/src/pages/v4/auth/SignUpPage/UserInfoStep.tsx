import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AnimatedCollapse } from "@infisical/cipher/ui/animated-collapse";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Stack } from "@infisical/cipher/ui/layout";
import { StatusText } from "@infisical/cipher/ui/text";
import { z } from "zod";

import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import SecurityClient from "@app/components/utilities/SecurityClient";
import Telemetry from "@app/components/utilities/telemetry/Telemetry";
import { useServerConfig } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { submitSignupOnboarding, useCompleteAccountSignup } from "@app/hooks/api/auth/queries";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AuthPage } from "../components/AuthPage";
import { PasswordField } from "../components/PasswordField";
import { PasswordInput } from "../components/PasswordInput";

import styles from "../auth.module.css";

const createUserInfoFormSchema = (isInvite: boolean, passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      firstName: z.string().trim().min(1, "First name is required"),
      lastName: z.string().trim().optional(),
      organizationName: isInvite ? z.string().optional() : GenericResourceNameSchema,
      attributionSource: z.string().trim().max(512).optional(),
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "Please confirm your password")
    })
    .refine(({ password, confirmPassword }) => password === confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });

type UserInfoFormData = z.infer<ReturnType<typeof createUserInfoFormSchema>>;

type Props = {
  onComplete: (orgId?: string) => void;
  email: string;
  isInvite?: boolean;
  inviteOrganizationName?: string;
  isPreview?: boolean;
};

export const UserInfoStep = ({
  onComplete,
  email,
  isInvite = false,
  inviteOrganizationName,
  isPreview
}: Props) => {
  const { config } = useServerConfig();
  const { mutateAsync: completeSignup, isPending: isLoading } = useCompleteAccountSignup();

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { dirtyFields, errors, submitCount }
  } = useForm<UserInfoFormData>({
    resolver: zodResolver(createUserInfoFormSchema(isInvite, config.passwordPolicy)),
    mode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      organizationName: "",
      attributionSource: "",
      password: "",
      confirmPassword: ""
    }
  });

  const passwordValue = watch("password");
  const confirmPasswordValue = watch("confirmPassword");
  const { breachStatus, validatePassword } = usePasswordBreachCheck({
    password: passwordValue,
    policy: config.passwordPolicy
  });
  const showDangerState = submitCount > 0;
  const showOrganizationNameError =
    (showDangerState || Boolean(dirtyFields.organizationName)) && Boolean(errors.organizationName);
  const doPasswordsMatch =
    confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue;
  const isPasswordValidated = breachStatus === "safe" || breachStatus === "unavailable";

  const onSubmit = async (formData: UserInfoFormData) => {
    if (isPreview) return;
    const telemetry = new Telemetry().getInstance();

    const latestBreachStatus = await validatePassword(formData.password);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }

    const attributionSource = isInvite ? undefined : formData.attributionSource || undefined;
    const response = await completeSignup({
      type: "email",
      email,
      password: formData.password,
      firstName: formData.firstName,
      lastName: formData.lastName ?? "",
      organizationName: formData.organizationName || undefined,
      attributionSource,
      hubspotUtk: getHubSpotUtk()
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(response.token);

    if (attributionSource) submitSignupOnboarding({ attributionSource }).catch(() => {});

    const signupEmail = email.toLowerCase();
    telemetry.identify(signupEmail, signupEmail);

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    const userOrgs = await fetchOrganizations();
    const orgId = userOrgs[0]?.id;
    if (orgId) localStorage.setItem("orgData.id", orgId);

    onComplete(orgId);
  };

  return (
    <AuthPage
      pageTitle="Sign Up"
      title={
        isInvite
          ? `Join ${inviteOrganizationName?.trim() || "an organization"}`
          : "Create your account"
      }
    >
      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <Stack gap={16}>
          <div className={styles.split}>
            <Field
              label="First name"
              error={showDangerState ? errors.firstName?.message : undefined}
            >
              <Input {...register("firstName")} size="lg" autoComplete="given-name" />
            </Field>
            <Field
              label="Last name"
              optional
              error={showDangerState ? errors.lastName?.message : undefined}
            >
              <Input {...register("lastName")} size="lg" autoComplete="family-name" />
            </Field>
          </div>
          {!isInvite && (
            <Field
              label="Organization name"
              error={showOrganizationNameError ? errors.organizationName?.message : undefined}
            >
              <Input
                {...register("organizationName")}
                size="lg"
                maxLength={64}
                autoComplete="organization"
              />
            </Field>
          )}
          {!isInvite && (
            <Field label="Where did you hear about us?" optional>
              <Input
                {...register("attributionSource")}
                size="lg"
                autoComplete="off"
                placeholder="Hacker News, a friend, GitHub"
                maxLength={512}
              />
            </Field>
          )}
          <input hidden readOnly type="email" name="email" autoComplete="username" value={email} />
          <PasswordField
            value={passwordValue}
            policy={config.passwordPolicy}
            breachStatus={breachStatus}
            registration={register("password")}
            error={showDangerState ? errors.password?.message : undefined}
            submitCount={submitCount}
          />
          <AnimatedCollapse open={isPasswordValidated}>
            <Field
              label="Confirm password"
              error={showDangerState ? errors.confirmPassword?.message : undefined}
            >
              <PasswordInput {...register("confirmPassword")} autoComplete="new-password" />
              {confirmPasswordValue.length > 0 && (
                <StatusText
                  tone={doPasswordsMatch ? "ok" : "bad"}
                  icon={doPasswordsMatch ? "check" : "x"}
                >
                  {doPasswordsMatch ? "Passwords match" : "Passwords do not match"}
                </StatusText>
              )}
            </Field>
          </AnimatedCollapse>
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            loading={isLoading}
            disabled={!isPasswordValidated}
          >
            {isInvite ? "Sign up" : "Create account"}
          </Button>
        </Stack>
      </form>
    </AuthPage>
  );
};
