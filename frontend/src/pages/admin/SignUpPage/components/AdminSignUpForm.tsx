import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";

import { PasswordField } from "@app/components/auth/PasswordField";
import {
  checkPasswordBreachStatus,
  PasswordBreachStatus
} from "@app/components/utilities/checks/password/checkIsPasswordBreached";
import {
  Alert,
  AlertDescription,
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input
} from "@app/components/v3";
import { useCreateAdminUser } from "@app/hooks/api";

import { AdminSignUpFormData, adminSignUpSchema } from "../adminSignUpSchema";

type AdminSignUpResult = {
  token: string;
  organization: { id: string };
};

type AdminSignUpFormProps = {
  onSuccess: (result: AdminSignUpResult) => Promise<void>;
};

export const AdminSignUpForm = ({ onSuccess }: AdminSignUpFormProps) => {
  const [formError, setFormError] = useState<string>();
  const [passwordBreachStatus, setPasswordBreachStatus] = useState<
    PasswordBreachStatus | "idle" | "checking"
  >("idle");
  const { mutateAsync: createAdminUser } = useCreateAdminUser();
  const {
    formState: { errors, isSubmitting, submitCount },
    handleSubmit,
    register,
    setError,
    watch
  } = useForm<AdminSignUpFormData>({
    resolver: zodResolver(adminSignUpSchema),
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

  const onSubmit = async ({ confirmPassword: _, ...values }: AdminSignUpFormData) => {
    if (passwordBreachStatus === "checking") return;

    setFormError(undefined);
    const latestBreachStatus = await checkPasswordBreachStatus(values.password);

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

  const password = watch("password");
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
        </Field>
        <PasswordField
          id="admin-signup-password"
          value={password}
          placeholder="••••••••"
          registration={register("password")}
          error={showDangerState ? errors.password : undefined}
          submitCount={submitCount}
          onBreachStatusChange={setPasswordBreachStatus}
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
