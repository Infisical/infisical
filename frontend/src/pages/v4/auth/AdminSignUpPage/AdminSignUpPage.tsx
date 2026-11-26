import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Alert } from "@infisical/cipher/ui/alert";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { ProgressSteps } from "@infisical/cipher/ui/progress";
import { useNavigate, useRouter } from "@tanstack/react-router";
import axios from "axios";
import { z } from "zod";

import {
  createPasswordSchema,
  doesPasswordMeetPolicy
} from "@app/components/utilities/checks/password/passwordPolicy";
import SecurityClient from "@app/components/utilities/SecurityClient";
import { useServerConfig } from "@app/context";
import { useCreateAdminUser, useSelectOrganization } from "@app/hooks/api";
import { SuperAdminErrorCode, TPasswordPolicy } from "@app/hooks/api/admin/types";
import { getBreachedPasswordMessage } from "@app/hooks/api/auth/errors";
import { GenericResourceNameSchema } from "@app/lib/schemas";

import { AuthPage } from "../components/AuthPage";
import { NewPasswordFields } from "../components/NewPasswordFields";
import { useAuthPreview } from "../preview";

import styles from "../auth.module.css";

const STEPS = ["Account", "Organization", "Sign-up", "Email"];

const createAdminSignUpSchema = (passwordPolicy: TPasswordPolicy, isSetupTokenRequired: boolean) =>
  z
    .object({
      firstName: z.string().trim().min(1, "First name is required"),
      lastName: z.string().trim().optional(),
      email: z.string().trim().min(1, "Email is required").email("Enter a valid email address"),
      password: createPasswordSchema(passwordPolicy),
      confirmPassword: z.string().min(1, "Please confirm your password"),
      setupToken: isSetupTokenRequired
        ? z
            .string()
            .trim()
            .min(1, "Setup token is required")
            .max(32, "Setup token must be at most 32 characters")
        : z.string().trim().optional()
    })
    .refine(({ confirmPassword, password }) => confirmPassword === password, {
      message: "Passwords do not match",
      path: ["confirmPassword"]
    });

type AdminSignUpFormData = z.infer<ReturnType<typeof createAdminSignUpSchema>>;

const organizationSchema = z.object({ organizationName: GenericResourceNameSchema });

const AccountStep = ({
  defaultValues,
  onContinue,
  passwordError,
  setupTokenError,
  progress
}: {
  defaultValues?: AdminSignUpFormData;
  onContinue: (values: AdminSignUpFormData) => void;
  passwordError?: string;
  setupTokenError?: string;
  progress: React.ReactNode;
}) => {
  const { config } = useServerConfig();
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setError,
    watch
  } = useForm<AdminSignUpFormData>({
    resolver: zodResolver(
      createAdminSignUpSchema(config.passwordPolicy, Boolean(config.isInstanceSetupTokenRequired))
    ),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: defaultValues ?? {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: "",
      setupToken: ""
    }
  });
  const password = watch("password");
  const confirmPassword = watch("confirmPassword");
  const showDangerState = submitCount > 0;
  const isPasswordValidated = doesPasswordMeetPolicy(password, config.passwordPolicy);

  useEffect(() => {
    if (passwordError) setError("password", { type: "server", message: passwordError });
  }, [passwordError, setError]);

  useEffect(() => {
    if (setupTokenError) {
      setError("setupToken", { type: "server", message: setupTokenError }, { shouldFocus: true });
    }
  }, [setupTokenError, setError]);

  return (
    <AuthPage
      variant="focused"
      pageTitle="Set Up Your Instance"
      title="Create your Super Admin account"
      description="Use this account to manage your Infisical instance."
      progress={progress}
    >
      <form onSubmit={handleSubmit(onContinue)} noValidate>
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
          <Field label="Email" error={showDangerState ? errors.email?.message : undefined}>
            <Input {...register("email")} size="lg" type="email" autoComplete="email" />
          </Field>
          <NewPasswordFields
            register={register as never}
            errors={errors}
            password={password}
            confirmPassword={confirmPassword}
            policy={config.passwordPolicy}
            submitCount={submitCount}
          />
          {config.isInstanceSetupTokenRequired && (
            <Field
              label="Setup token"
              error={
                showDangerState || errors.setupToken?.type === "server"
                  ? errors.setupToken?.message
                  : undefined
              }
            >
              <Input {...register("setupToken")} size="lg" type="password" autoComplete="off" />
            </Field>
          )}
          <Button
            type="submit"
            variant="accent"
            size="lg"
            className="w-full"
            loading={isSubmitting}
            disabledReason={
              isPasswordValidated ? undefined : "Enter a password that meets the policy"
            }
          >
            Continue
          </Button>
        </Stack>
      </form>
    </AuthPage>
  );
};

export const AdminSignUpPage = () => {
  const navigate = useNavigate();
  const router = useRouter();
  const preview = useAuthPreview();
  const [activeStep, setActiveStep] = useState(preview === "organization" ? 1 : 0);
  const [accountData, setAccountData] = useState<AdminSignUpFormData>();
  const [formError, setFormError] = useState<string>();
  const [passwordError, setPasswordError] = useState<string>();
  const [setupTokenError, setSetupTokenError] = useState<string>();
  const { mutateAsync: createAdminUser, isPending } = useCreateAdminUser();
  const { mutateAsync: selectOrganization } = useSelectOrganization();
  const {
    formState: { errors },
    handleSubmit,
    register
  } = useForm<z.infer<typeof organizationSchema>>({
    resolver: zodResolver(organizationSchema),
    defaultValues: { organizationName: "" }
  });

  const progress = (
    <ProgressSteps label="Set up your instance" steps={STEPS} current={activeStep} />
  );

  const handleOrganizationSubmit = handleSubmit(async ({ organizationName }) => {
    if (preview) return;
    if (!accountData) {
      setActiveStep(0);
      return;
    }
    setFormError(undefined);
    try {
      const result = await createAdminUser({
        email: accountData.email,
        password: accountData.password,
        firstName: accountData.firstName,
        lastName: accountData.lastName || undefined,
        organizationName,
        setupToken: accountData.setupToken || undefined
      });
      SecurityClient.setToken(result.token);
      await selectOrganization({ organizationId: result.organization.id });
      localStorage.setItem("orgData.id", result.organization.id);
      await router.invalidate();
      await navigate({ to: "/admin/setup" });
    } catch (error) {
      const breachedPasswordMessage = getBreachedPasswordMessage(error);
      if (breachedPasswordMessage) {
        setPasswordError(breachedPasswordMessage);
        setActiveStep(0);
        return;
      }
      const responseData = axios.isAxiosError<{ message?: string; error?: string }>(error)
        ? error.response?.data
        : undefined;
      if (responseData?.error === SuperAdminErrorCode.InvalidSetupToken) {
        setSetupTokenError(responseData.message || "The setup token is missing or incorrect.");
        setActiveStep(0);
        return;
      }
      setFormError(responseData?.message || "Unable to create the instance. Please try again.");
    }
  });

  if (activeStep === 0) {
    return (
      <AccountStep
        defaultValues={accountData}
        progress={progress}
        passwordError={passwordError}
        setupTokenError={setupTokenError}
        onContinue={(values) => {
          setAccountData(values);
          setFormError(undefined);
          setPasswordError(undefined);
          setSetupTokenError(undefined);
          setActiveStep(1);
        }}
      />
    );
  }

  return (
    <AuthPage
      variant="focused"
      pageTitle="Set Up Your Instance"
      title="Create your organization"
      description="The first workspace for your projects, secrets and team."
      progress={progress}
    >
      <form onSubmit={handleOrganizationSubmit} noValidate>
        <Stack gap={16}>
          {formError && <Alert tone="bad" title={formError} />}
          <Field label="Organization name" error={errors.organizationName?.message}>
            <Input
              {...register("organizationName")}
              size="lg"
              autoComplete="organization"
              autoFocus
            />
          </Field>
          <Inline justify="between">
            <Button
              type="button"
              variant="outline"
              icon="chev-left"
              onClick={() => setActiveStep(0)}
            >
              Back
            </Button>
            <Button type="submit" variant="accent" loading={isPending}>
              Create organization
            </Button>
          </Inline>
        </Stack>
      </form>
    </AuthPage>
  );
};
