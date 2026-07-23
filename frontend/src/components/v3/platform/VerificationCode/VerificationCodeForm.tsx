import { ReactNode } from "react";

import { AnimatedCollapse } from "../../generic/AnimatedCollapse";
import { Button } from "../../generic/Button";
import { CardDescription, CardHeader, CardTitle } from "../../generic/Card";
import { FieldError } from "../../generic/Field";
import { VerificationCodeInput } from "./VerificationCodeInput";

type VerificationCodeHeaderProps = {
  action?: ReactNode;
  description?: ReactNode;
  recipient?: string;
  title: ReactNode;
};

export const VerificationCodeHeader = ({
  action,
  description,
  recipient,
  title
}: VerificationCodeHeaderProps) => (
  <CardHeader className="mb-6 gap-2">
    {recipient ? (
      <>
        <CardDescription className="ml-0.5 text-base">{title}</CardDescription>
        <div className="flex min-w-0 items-baseline justify-between gap-3">
          <div
            aria-label={recipient}
            className="ml-0.5 min-w-0 flex-1 truncate font-alliance text-2xl font-normal text-foreground"
            title={recipient}
          >
            {recipient}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {description && <CardDescription className="ml-0.5">{description}</CardDescription>}
      </>
    ) : (
      <>
        <CardTitle className="font-alliance text-2xl font-normal">{title}</CardTitle>
        {description && <CardDescription className="text-base">{description}</CardDescription>}
      </>
    )}
  </CardHeader>
);

type VerificationCodeFormProps = {
  children?: ReactNode;
  error?: ReactNode;
  fields?: number;
  isDisabled?: boolean;
  isPending?: boolean;
  name: string;
  onChange: (value: string) => void;
  onSubmit: () => void | Promise<void>;
  submitLabel?: ReactNode;
  value: string;
};

export const VerificationCodeForm = ({
  children,
  error,
  fields = 6,
  isDisabled,
  isPending,
  name,
  onChange,
  onSubmit,
  submitLabel = "Verify",
  value
}: VerificationCodeFormProps) => {
  const isComplete = value.trim().length === fields;

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(event) => {
        event.preventDefault();
        if (!isComplete || isDisabled || isPending) return;
        onSubmit();
      }}
    >
      <div className="flex flex-col gap-2">
        <VerificationCodeInput
          key={`${name}-${fields}`}
          name={name}
          fields={fields}
          onChange={onChange}
          value={value}
          isError={Boolean(error)}
        />
        {error && <FieldError>{error}</FieldError>}
      </div>
      <AnimatedCollapse isOpen={isComplete || Boolean(isPending)} contentClassName="px-1">
        <Button
          type="submit"
          variant="project"
          size="lg"
          isFullWidth
          isPending={isPending}
          isDisabled={!isComplete || isDisabled || isPending}
        >
          {submitLabel}
        </Button>
      </AnimatedCollapse>
      {children}
    </form>
  );
};
