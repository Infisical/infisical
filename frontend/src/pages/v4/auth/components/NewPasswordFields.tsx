import type { FieldErrors, UseFormRegister } from "react-hook-form";

import type { PasswordBreachCheckStatus } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import { AnimatedCollapse } from "@app/components/v4/ui/animated-collapse";
import { Field } from "@app/components/v4/ui/field";
import { StatusText } from "@app/components/v4/ui/text";
import type { TPasswordPolicy } from "@app/hooks/api/admin/types";

import { PasswordField } from "./PasswordField";
import { PasswordInput } from "./PasswordInput";

type Values = { password: string; confirmPassword: string };

type Props = {
  register: UseFormRegister<Values>;
  errors: FieldErrors<Values>;
  password: string;
  confirmPassword: string;
  policy: TPasswordPolicy;
  breachStatus: PasswordBreachCheckStatus;
  submitCount: number;
};

export const NewPasswordFields = ({
  register,
  errors,
  password,
  confirmPassword,
  policy,
  breachStatus,
  submitCount
}: Props) => {
  const showDangerState = submitCount > 0;
  const isPasswordValidated = breachStatus === "safe" || breachStatus === "unavailable";
  const doPasswordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  return (
    <>
      <PasswordField
        value={password}
        policy={policy}
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
          {confirmPassword.length > 0 && (
            <StatusText
              tone={doPasswordsMatch ? "ok" : "bad"}
              icon={doPasswordsMatch ? "check" : "x"}
            >
              {doPasswordsMatch ? "Passwords match" : "Passwords do not match"}
            </StatusText>
          )}
        </Field>
      </AnimatedCollapse>
    </>
  );
};
