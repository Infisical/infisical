import { useEffect, useMemo, useState } from "react";
import { FieldError as ReactHookFormFieldError, UseFormRegisterReturn } from "react-hook-form";
import { Check, Eye, EyeOff, LoaderCircle, X } from "lucide-react";

import {
  checkPasswordBreachStatus,
  PasswordBreachStatus
} from "@app/components/utilities/checks/password/checkIsPasswordBreached";
import { getPasswordRequirements } from "@app/components/utilities/checks/password/passwordPolicy";
import {
  AnimatedCollapse,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  IconButton,
  InputGroup,
  InputGroupAddon,
  InputGroupInput
} from "@app/components/v3";

type PasswordFieldProps = {
  id: string;
  value: string;
  registration: UseFormRegisterReturn;
  placeholder?: string;
  error?: ReactHookFormFieldError;
  submitCount: number;
  onBreachStatusChange?: (status: PasswordBreachStatus | "idle" | "checking") => void;
};

export const PasswordField = ({
  id,
  value,
  registration,
  placeholder,
  error,
  submitCount,
  onBreachStatusChange
}: PasswordFieldProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [breachStatus, setBreachStatus] = useState<PasswordBreachStatus | "idle" | "checking">(
    "idle"
  );
  const requirements = useMemo(() => getPasswordRequirements(value), [value]);
  const visibleRequirements = requirements.filter(({ isMet, isPrimary }) => isPrimary || !isMet);
  const hasUnmetRequirements = requirements.some(({ isMet }) => !isMet);
  const showRequirements =
    value.length > 0 &&
    (isFocused || hasUnmetRequirements || breachStatus === "breached" || submitCount > 0);

  useEffect(() => {
    if (value.length < 14 || hasUnmetRequirements) {
      setBreachStatus("idle");
      return undefined;
    }

    setBreachStatus("checking");
    let isCancelled = false;
    const timeout = window.setTimeout(async () => {
      const status = await checkPasswordBreachStatus(value);
      if (isCancelled) return;
      setBreachStatus(status);
    }, 800);

    return () => {
      isCancelled = true;
      window.clearTimeout(timeout);
    };
  }, [hasUnmetRequirements, value]);

  useEffect(() => {
    onBreachStatusChange?.(breachStatus);
  }, [breachStatus, onBreachStatusChange]);

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
          <IconButton
            type="button"
            variant="ghost-muted"
            size="xs"
            onClick={() => setShowPassword((current) => !current)}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? <EyeOff /> : <Eye />}
          </IconButton>
        </InputGroupAddon>
      </InputGroup>
      <AnimatedCollapse isOpen={showRequirements}>
        <div
          id={requirementsId}
          className="flex flex-col gap-1 rounded-md border border-border bg-container px-3 py-2.5"
          aria-live="polite"
        >
          <p className="mb-0.5 text-xs font-medium text-accent">Password requirements</p>
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
