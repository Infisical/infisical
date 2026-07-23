import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Check, Eye, EyeOff, X } from "lucide-react";

import { PasswordField } from "@app/components/auth/PasswordField";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  Alert,
  AlertDescription,
  AnimatedCollapse,
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { useServerConfig } from "@app/context";
import { useCreateAdminUser } from "@app/hooks/api";

import { AdminSignUpFormData, createAdminSignUpSchema } from "../adminSignUpSchema";

type AdminSignUpResult = {
  token: string;
  organization: { id: string };
};

type AdminSignUpFormProps = {
  onSuccess: (result: AdminSignUpResult) => Promise<void>;
};

export const AdminSignUpForm = ({ onSuccess }: AdminSignUpFormProps) => {
  const [formError, setFormError] = useState<string>();
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { config } = useServerConfig();
  const { mutateAsync: createAdminUser } = useCreateAdminUser();
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setError,
    watch
  } = useForm<AdminSignUpFormData>({
    resolver: zodResolver(createAdminSignUpSchema(config.passwordPolicy)),
    mode: "onChange",
    reValidateMode: "onChange",
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      password: "",
      confirmPassword: ""
    }
  });

  const password = watch("password");
  const { breachStatus: passwordBreachStatus, validatePassword } = usePasswordBreachCheck({
    password,
    policy: config.passwordPolicy
  });
  const confirmPassword = watch("confirmPassword");

  const onSubmit = async ({ confirmPassword: _, ...values }: AdminSignUpFormData) => {
    setFormError(undefined);
    const latestBreachStatus = await validatePassword(values.password);

    if (latestBreachStatus === "breached") {
      setError("password", {
        type: "validate",
        message: "This password was found in a known data breach."
      });
      return;
    }

    try {
      const result = await createAdminUser({
        ...values,
        lastName: values.lastName || undefined
      });
      await onSuccess(result);
    } catch (error) {
      const message = axios.isAxiosError<{ message?: string }>(error)
        ? error.response?.data?.message
        : undefined;
      setFormError(message || "Unable to create the administrator account. Please try again.");
    }
  };

  const showDangerState = submitCount > 0;
  const isPasswordValidated =
    passwordBreachStatus === "safe" || passwordBreachStatus === "unavailable";
  const doPasswordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  const canSubmit = isPasswordValidated && !isSubmitting;

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit(onSubmit)}>
      {formError && (
        <Alert variant="danger">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={showDangerState && Boolean(errors.firstName)}>
            <FieldLabel className="sr-only" htmlFor="admin-signup-first-name">
              First Name
            </FieldLabel>
            <Input
              {...register("firstName")}
              id="admin-signup-first-name"
              placeholder="First Name"
              autoComplete="given-name"
              isError={showDangerState && Boolean(errors.firstName)}
            />
            {showDangerState && errors.firstName ? (
              <FieldError>{errors.firstName.message}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={showDangerState && Boolean(errors.lastName)}>
            <FieldLabel className="sr-only" htmlFor="admin-signup-last-name">
              Last Name
            </FieldLabel>
            <Input
              {...register("lastName")}
              id="admin-signup-last-name"
              placeholder="Last Name"
              autoComplete="family-name"
              isError={showDangerState && Boolean(errors.lastName)}
            />
            {showDangerState && errors.lastName ? (
              <FieldError>{errors.lastName.message}</FieldError>
            ) : null}
          </Field>
        </div>
        <Field data-invalid={showDangerState && Boolean(errors.email)}>
          <FieldLabel className="sr-only" htmlFor="admin-signup-email">
            Email
          </FieldLabel>
          <Input
            {...register("email")}
            id="admin-signup-email"
            type="email"
            placeholder="Email"
            autoComplete="email"
            isError={showDangerState && Boolean(errors.email)}
          />
          {showDangerState && errors.email ? <FieldError>{errors.email.message}</FieldError> : null}
        </Field>
        <PasswordField
          id="admin-signup-password"
          value={password}
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
            <FieldLabel htmlFor="admin-signup-confirm-password">Confirm Password</FieldLabel>
            <InputGroup>
              <InputGroupInput
                {...register("confirmPassword")}
                id="admin-signup-confirm-password"
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
      </FieldGroup>
      <Button
        type="submit"
        variant="project"
        size="lg"
        isFullWidth
        isPending={isSubmitting}
        isDisabled={!canSubmit}
      >
        Create Super Admin
      </Button>
    </form>
  );
};
