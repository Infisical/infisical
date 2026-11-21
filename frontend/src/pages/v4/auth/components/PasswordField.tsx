import { useMemo } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { Field } from "@infisical/cipher/ui/field";
import { StatusText } from "@infisical/cipher/ui/text";

import { getPasswordRequirements } from "@app/components/utilities/checks/password/passwordPolicy";
import type { PasswordBreachCheckStatus } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import type { TPasswordPolicy } from "@app/hooks/api/admin/types";

import { PasswordInput } from "./PasswordInput";

import styles from "../auth.module.css";

type Props = {
  label?: string;
  value: string;
  policy: TPasswordPolicy;
  breachStatus: PasswordBreachCheckStatus;
  registration: UseFormRegisterReturn;
  error?: string;
  submitCount: number;
};

export const PasswordField = ({
  label = "Password",
  value,
  policy,
  breachStatus,
  registration,
  error,
  submitCount
}: Props) => {
  const requirements = useMemo(() => getPasswordRequirements(value, policy), [policy, value]);
  const visibleRequirements = requirements.filter(({ isMet, isPrimary }) => isPrimary || !isMet);
  const showRequirements = value.length > 0;

  return (
    <Field label={label} error={showRequirements ? undefined : error}>
      <PasswordInput {...registration} autoComplete="new-password" invalid={Boolean(error)} />
      {showRequirements && (
        <div className={styles.requirements} aria-live="polite">
          {visibleRequirements.map(({ code, isMet, message }) => {
            let tone: "ok" | "bad" | "neutral" = "neutral";
            if (isMet) tone = "ok";
            else if (submitCount > 0) tone = "bad";
            return (
              <StatusText key={code} tone={tone} icon={isMet ? "check" : "x"}>
                {message}
              </StatusText>
            );
          })}
          {breachStatus === "checking" && (
            <StatusText icon="clock">Checking known data breaches</StatusText>
          )}
          {breachStatus === "safe" && (
            <StatusText tone="ok" icon="check">
              No known data breach matches found
            </StatusText>
          )}
          {breachStatus === "breached" && (
            <StatusText tone="bad" icon="alert-c">
              This password was found in a known data breach.
            </StatusText>
          )}
          {breachStatus === "unavailable" && (
            <StatusText icon="info">
              Breach check unavailable. Other requirements still apply.
            </StatusText>
          )}
        </div>
      )}
    </Field>
  );
};
