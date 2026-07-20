import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";

import { PasswordField } from "@app/components/auth/PasswordField";
import { usePasswordBreachCheck } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input
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
  const canSubmit = isPasswordValidated && !isSubmitting;

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={handleSubmit(onSubmit)}>
      {formError && (
        <Alert variant="danger">
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field data-invalid={showDangerState && Boolean(errors.firstName)}>
            <FieldLabel htmlFor="admin-signup-first-name">First Name</FieldLabel>
            <Input
              {...register("firstName")}
              id="admin-signup-first-name"
              placeholder="Jane"
              autoComplete="given-name"
              isError={showDangerState && Boolean(errors.firstName)}
            />
            {showDangerState && errors.firstName ? (
              <FieldError>{errors.firstName.message}</FieldError>
            ) : null}
          </Field>
          <Field data-invalid={showDangerState && Boolean(errors.lastName)}>
            <FieldLabel htmlFor="admin-signup-last-name">Last Name</FieldLabel>
            <Input
              {...register("lastName")}
              id="admin-signup-last-name"
              placeholder="Doe"
              autoComplete="family-name"
              isError={showDangerState && Boolean(errors.lastName)}
            />
            {showDangerState && errors.lastName ? (
              <FieldError>{errors.lastName.message}</FieldError>
            ) : null}
          </Field>
        </div>
        <Field data-invalid={showDangerState && Boolean(errors.email)}>
          <FieldLabel htmlFor="admin-signup-email">Email</FieldLabel>
          <Input
            {...register("email")}
            id="admin-signup-email"
            type="email"
            placeholder="you@company.com"
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
        <Field data-invalid={showDangerState && Boolean(errors.confirmPassword)}>
          <FieldLabel htmlFor="admin-signup-confirm-password">Confirm Password</FieldLabel>
          <Input
            {...register("confirmPassword")}
            id="admin-signup-confirm-password"
            type="password"
            placeholder="••••••••"
            autoComplete="new-password"
            isError={showDangerState && Boolean(errors.confirmPassword)}
          />
          {showDangerState && errors.confirmPassword ? (
            <FieldError>{errors.confirmPassword.message}</FieldError>
          ) : null}
        </Field>
      </FieldGroup>
      <Button
        type="submit"
        variant="neutral"
        size="lg"
        isFullWidth
        isPending={isSubmitting}
        isDisabled={!canSubmit}
      >
        Create Super Admin Account
      </Button>
    </form>
  );
};
