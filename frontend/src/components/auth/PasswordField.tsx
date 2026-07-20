import { useMemo, useState } from "react";
import { FieldError as ReactHookFormFieldError, UseFormRegisterReturn } from "react-hook-form";
import { Check, Eye, EyeOff, LoaderCircle, X } from "lucide-react";

import { getPasswordRequirements } from "@app/components/utilities/checks/password/passwordPolicy";
import { PasswordBreachCheckStatus } from "@app/components/utilities/checks/password/usePasswordBreachCheck";
import {
  AnimatedCollapse,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@app/components/v3";
import { TPasswordPolicy } from "@app/hooks/api/admin/types";

type PasswordFieldProps = {
  id: string;
  value: string;
  policy: TPasswordPolicy;
  breachStatus: PasswordBreachCheckStatus;
  registration: UseFormRegisterReturn;
  placeholder?: string;
  error?: ReactHookFormFieldError;
  submitCount: number;
};

export const PasswordField = ({
  id,
  value,
  policy,
  breachStatus,
  registration,
  placeholder,
  error,
  submitCount
}: PasswordFieldProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const requirements = useMemo(() => getPasswordRequirements(value, policy), [policy, value]);
  const visibleRequirements = requirements.filter(({ isMet, isPrimary }) => isPrimary || !isMet);
  const showRequirements = value.length > 0;

  const requirementsId = `${id}-requirements`;

  return (
    <Field data-invalid={Boolean(error)}>
      <FieldLabel htmlFor={id}>Password</FieldLabel>
      <InputGroup>
        <InputGroupInput
          {...registration}
          id={id}
          type={showPassword ? "text" : "password"}
          placeholder={placeholder}
          autoComplete="new-password"
          aria-invalid={Boolean(error)}
          aria-describedby={showRequirements ? requirementsId : undefined}
          onFocus={() => setIsFocused(true)}
          onBlur={(event) => {
            registration.onBlur(event);
            setIsFocused(false);
          }}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
      <AnimatedCollapse isOpen={showRequirements}>
        <div id={requirementsId} className="flex flex-col gap-1 pt-1" aria-live="polite">
          {visibleRequirements.map(({ code, isMet, message }) => (
            <div className="flex items-start gap-2 text-xs" key={code}>
              {isMet ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-success" />
              ) : (
                <X
                  className={`mt-0.5 size-3.5 shrink-0 ${
                    !isFocused && submitCount > 0 ? "text-danger" : "text-muted"
                  }`}
                />
              )}
              <span className={isMet ? "text-muted" : "text-accent"}>{message}</span>
            </div>
          ))}
          {breachStatus === "checking" && (
            <FieldDescription className="flex items-center gap-2">
              <LoaderCircle className="size-3.5 animate-spin" /> Checking known data breaches…
            </FieldDescription>
          )}
          {breachStatus === "safe" && (
            <FieldDescription className="flex items-center gap-2 text-success">
              <Check className="size-3.5" /> No known data breach matches found.
            </FieldDescription>
          )}
          {breachStatus === "breached" && (
            <FieldError>This password was found in a known data breach.</FieldError>
          )}
          {breachStatus === "unavailable" && (
            <FieldDescription>
              Breach check unavailable. Other requirements still apply.
            </FieldDescription>
          )}
        </div>
      </AnimatedCollapse>
    </Field>
  );
};
