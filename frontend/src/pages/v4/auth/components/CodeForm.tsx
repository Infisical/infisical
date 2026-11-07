import { type ReactNode, useEffect, useRef, useState } from "react";

import { Button } from "@app/components/v4/ui/button";
import { Field } from "@app/components/v4/ui/field";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@app/components/v4/ui/input-otp";
import { Stack } from "@app/components/v4/ui/layout";

type Props = {
  label: string;
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  isPending?: boolean;
  isDisabled?: boolean;
  error?: string;
  children?: ReactNode;
};

export const CodeForm = ({
  label,
  length = 6,
  value,
  onChange,
  onSubmit,
  isPending,
  isDisabled,
  error,
  children
}: Props) => {
  const isComplete = value.trim().length === length;
  const [hasAttempted, setHasAttempted] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [hasChangedSinceError, setHasChangedSinceError] = useState(false);
  const submitRef = useRef(onSubmit);
  const changeRef = useRef(onChange);

  useEffect(() => {
    submitRef.current = onSubmit;
    changeRef.current = onChange;
  }, [onChange, onSubmit]);

  useEffect(() => {
    if (error && !isPending) {
      setHasChangedSinceError(false);
      setHasFailed(true);
      changeRef.current("");
    }
  }, [error, isPending]);

  useEffect(() => {
    if (hasAttempted || !isComplete || isDisabled || isPending) return;
    setHasAttempted(true);
    submitRef.current();
  }, [hasAttempted, isComplete, isDisabled, isPending]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!isComplete || isDisabled || isPending) return;
        setHasAttempted(true);
        onSubmit();
      }}
    >
      <Stack gap={16}>
        <Field label={label} error={hasChangedSinceError ? undefined : error}>
          <InputOTP
            maxLength={length}
            value={value}
            autoFocus
            disabled={isDisabled}
            aria-invalid={Boolean(error && !hasChangedSinceError) || undefined}
            onChange={(next: string) => {
              if (error) setHasChangedSinceError(true);
              onChange(next);
            }}
          >
            <InputOTPGroup>
              {Array.from({ length }, (_, index) => (
                <InputOTPSlot key={index} index={index} />
              ))}
            </InputOTPGroup>
          </InputOTP>
        </Field>
        <Button
          type="submit"
          variant="accent"
          size="lg"
          className="w-full"
          loading={isPending}
          disabled={!isComplete || isDisabled}
        >
          {hasFailed ? "Try again" : "Continue"}
        </Button>
        {children}
      </Stack>
    </form>
  );
};
