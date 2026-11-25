import type { FieldErrors, UseFormRegister } from "react-hook-form";
import { AnimatedCollapse } from "@infisical/cipher/ui/animated-collapse";
import { Field } from "@infisical/cipher/ui/field";
import { StatusText } from "@infisical/cipher/ui/text";

import { doesPasswordMeetPolicy } from "@app/components/utilities/checks/password/passwordPolicy";
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
  submitCount: number;
};

export const NewPasswordFields = ({
  register,
  errors,
  password,
  confirmPassword,
  policy,
  submitCount
}: Props) => {
  const showDangerState = submitCount > 0;
  const isPasswordValidated = doesPasswordMeetPolicy(password, policy);
  const doPasswordsMatch = confirmPassword.length > 0 && password === confirmPassword;
  return (
    <>
      <PasswordField
        value={password}
        policy={policy}
        serverError={errors.password?.type === "server" ? errors.password.message : undefined}
        registration={register("password")}
        error={
          showDangerState || errors.password?.type === "server"
            ? errors.password?.message
            : undefined
        }
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
