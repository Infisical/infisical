import { useState } from "react";
import { SubmitErrorHandler, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { z } from "zod";

import { PasswordField } from "@app/components/auth/PasswordField";
import { createPasswordSchema } from "@app/components/utilities/checks/password/passwordPolicy";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AnimatedCollapse,
  Button,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  FieldError,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  TextArea
} from "@app/components/v3";
import { EXAMPLE_PROJECT_NAME } from "@app/const";
import { useServerConfig } from "@app/context";
import { isInfisicalCloud } from "@app/helpers/platform";
import { initProjectHelper } from "@app/helpers/project";
import { getHubSpotUtk } from "@app/helpers/utmTracking";
import { useCompleteAccountSignup } from "@app/hooks/api/auth/queries";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";
import { fetchOrganizations } from "@app/hooks/api/organization/queries";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import SecurityClient from "../utilities/SecurityClient";
import { AuthPagePanel } from "./AuthPagePanel";

const createUserInfoFormSchema = (isInvite: boolean, passwordPolicy: TPasswordPolicy) =>
  z
    .object({
      name: z.string().min(1, "Please, specify your name"),
      organizationName: isInvite ? z.string().optional() : GenericResourceNameSchema,
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "Please confirm your password"),
      attributionSource: z.string().optional()
    })
    .refine(({ password, confirmPassword }) => password === confirmPassword, {
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });

type UserInfoFormData = z.infer<ReturnType<typeof createUserInfoFormSchema>>;

interface UserInfoStepProps {
  onComplete: () => void;
  email: string;
  isInvite?: boolean;
}

export default function UserInfoStep({
  onComplete,
  email,
  isInvite = false
}: UserInfoStepProps): JSX.Element {
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isAttributionStep, setIsAttributionStep] = useState(false);

  const { config } = useServerConfig();
  const { mutateAsync: completeSignup, isPending: isLoading } = useCompleteAccountSignup();
  const { t } = useTranslation();

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
      name: "",
      organizationName: "",
      password: "",
      confirmPassword: "",
      attributionSource: ""
    }
  });

  const passwordValue = watch("password");
  const { breachStatus: passwordBreachStatus, validatePassword } = usePasswordBreachCheck({
    password: passwordValue,
    policy: config.passwordPolicy
  });
  const confirmPasswordValue = watch("confirmPassword");
  const showDangerState = submitCount > 0;
  const showOrganizationNameError =
    (showDangerState || Boolean(dirtyFields.organizationName)) && Boolean(errors.organizationName);
  const doPasswordsMatch =
    confirmPasswordValue.length > 0 && passwordValue === confirmPasswordValue;
  const isPasswordValidated =
    passwordBreachStatus === "safe" || passwordBreachStatus === "unavailable";
  const canSubmit = isPasswordValidated && !isLoading;
  const accountStepTitle = isInvite ? "Set up your account" : t("signup.step3-message");
  const stepTitle = isAttributionStep ? "One last thing" : accountStepTitle;

  const onSubmit = async (formData: UserInfoFormData) => {
    const latestBreachStatus = await validatePassword(formData.password);
    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }

    const response = await completeSignup({
      type: "email",
      email,
      password: formData.password,
      firstName: formData.name.split(" ")[0],
      lastName: formData.name.split(" ").slice(1).join(" "),
      organizationName: formData.organizationName || undefined,
      attributionSource: formData.attributionSource,
      hubspotUtk: getHubSpotUtk()
    });

    SecurityClient.setSignupToken("");
    SecurityClient.setToken(response.token);

    if (isInfisicalCloud()) {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({ event: "signup_completed" });
    }

    const userOrgs = await fetchOrganizations();
    const orgId = userOrgs[0]?.id;

    if (!isInvite) {
      await initProjectHelper({
        projectName: EXAMPLE_PROJECT_NAME
      });
    }

    if (orgId) {
      localStorage.setItem("orgData.id", orgId);
    }

    onComplete();
  };

  const onInvalidSubmit: SubmitErrorHandler<UserInfoFormData> = (formErrors) => {
    if (formErrors.organizationName) {
      setIsAttributionStep(false);
    }
  };

  return (
    <div className="mx-auto flex w-full flex-col items-center justify-center">
      <AuthPagePanel>
        <CardHeader className="mb-4 gap-2">
          <CardTitle className="bg-linear-to-b from-white to-bunker-200 bg-clip-text font-alliance text-2xl font-normal text-transparent">
            {stepTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!isAttributionStep && (
            <>
              <Field data-invalid={showDangerState && Boolean(errors.name)}>
                <FieldLabel className="sr-only" htmlFor="signup-name">
                  Your Name
                </FieldLabel>
                <Input
                  {...register("name")}
                  id="signup-name"
                  placeholder="Your Name"
                  autoComplete="name"
                  isError={showDangerState && Boolean(errors.name)}
                />
                {showDangerState && errors.name ? (
                  <FieldError>{errors.name.message}</FieldError>
                ) : null}
              </Field>
              {!isInvite && (
                <Field data-invalid={showOrganizationNameError}>
                  <FieldLabel className="sr-only" htmlFor="signup-organization-name">
                    Organization Name
                  </FieldLabel>
                  <Input
                    {...register("organizationName")}
                    id="signup-organization-name"
                    placeholder="Organization Name"
                    maxLength={64}
                    autoComplete="organization"
                    isError={showOrganizationNameError}
                  />
                  {showOrganizationNameError && errors.organizationName ? (
                    <FieldError>{errors.organizationName.message}</FieldError>
                  ) : null}
                </Field>
              )}
              <PasswordField
                id="new-password"
                value={passwordValue}
                policy={config.passwordPolicy}
                breachStatus={passwordBreachStatus}
                placeholder="••••••••"
                registration={register("password")}
                error={showDangerState ? errors.password : undefined}
                submitCount={submitCount}
              />
              <AnimatedCollapse
                isOpen={isPasswordValidated}
                contentClassName={isPasswordValidated ? "overflow-visible" : undefined}
              >
                <Field data-invalid={showDangerState && Boolean(errors.confirmPassword)}>
                  <FieldLabel htmlFor="confirm-password">Confirm Password</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...register("confirmPassword")}
                      id="confirm-password"
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
                  <AnimatedCollapse isOpen={confirmPasswordValue.length > 0}>
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
              {isInvite ? (
                <Button
                  type="submit"
                  onClick={handleSubmit(onSubmit)}
                  variant="project"
                  size="lg"
                  isFullWidth
                  isPending={isLoading}
                  isDisabled={!canSubmit}
                >
                  {String(t("signup.signup"))}
                </Button>
              ) : (
                <Button
                  variant="project"
                  size="lg"
                  isFullWidth
                  isDisabled={!canSubmit}
                  onClick={handleSubmit(() => setIsAttributionStep(true))}
                >
                  Continue
                </Button>
              )}
            </>
          )}
          {isAttributionStep && (
            <>
              <Field>
                <FieldLabel className="sr-only" htmlFor="signup-attribution-source">
                  Where did you hear about us? <span className="font-light">(optional)</span>
                </FieldLabel>
                <TextArea
                  {...register("attributionSource")}
                  id="signup-attribution-source"
                  placeholder="Where did you hear about us? (optional)"
                  rows={3}
                  autoFocus
                />
              </Field>
              <div className="flex flex-col gap-2">
                <Button
                  type="submit"
                  onClick={handleSubmit(onSubmit, onInvalidSubmit)}
                  variant="project"
                  size="lg"
                  isFullWidth
                  isPending={isLoading}
                  isDisabled={!canSubmit}
                >
                  {String(t("signup.signup"))}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isFullWidth
                  onClick={() => setIsAttributionStep(false)}
                >
                  Back
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </AuthPagePanel>
    </div>
  );
}
