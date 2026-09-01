import { ReactNode } from "react";
import { Control, Controller } from "react-hook-form";

import { Field, FieldDescription, FieldLabel, Input } from "@app/components/v3";

import { PolicyRowMessage } from "./PolicyRowMessage";

type Props = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  control: Control<any>;
  label: string;
  description?: ReactNode;
  className?: string;
  /** The policy's ceiling on validity, shown until something has to be corrected. */
  hint?: string[];
  /** How the entered duration breaks the policy. */
  policyError?: string;
  /** Policy findings stay hidden until the requester tries to leave the step. */
  revealPolicyError?: boolean;
};

/**
 * The validity field and the policy's ceiling on it. The schema's own error takes precedence, so a
 * missing value reads as missing rather than as a policy violation.
 */
export const ValidityField = ({
  control,
  label,
  description,
  className,
  hint,
  policyError,
  revealPolicyError
}: Props) => (
  <Controller
    control={control}
    name="ttl"
    render={({ field, fieldState: { error } }) => {
      const shownError = error?.message ?? (revealPolicyError ? policyError : undefined);

      return (
        <Field className={className}>
          <FieldLabel>
            {label} <span className="text-danger">*</span>
          </FieldLabel>
          <Input {...field} placeholder="30d, 1y, 8760h" isError={Boolean(shownError)} />
          {description && <FieldDescription>{description}</FieldDescription>}
          {shownError && <PolicyRowMessage isError lines={[shownError]} />}
          {!shownError && hint && <PolicyRowMessage lines={hint} />}
        </Field>
      );
    }}
  />
);
