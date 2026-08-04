import { Controller, FieldValues, Path, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldFeedback,
  FieldLabel,
  FieldTitle,
  Switch
} from "@app/components/v3";

type Props<TValues extends FieldValues> = {
  name?: Path<TValues>;
  id?: string;
  /** Fallback when the form value is undefined. */
  fallbackChecked?: boolean;
  layout?: "labeled" | "content";
};

export const SslRejectUnauthorizedField = <TValues extends FieldValues>({
  name = "inputs.sslRejectUnauthorized" as Path<TValues>,
  id = "dynamic-secret-ssl-reject-unauthorized",
  fallbackChecked = true,
  layout = "content"
}: Props<TValues>) => {
  const { control } = useFormContext<TValues>();

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)} orientation="horizontal">
          {layout === "labeled" ? (
            <div className="flex-1">
              <FieldLabel htmlFor={id}>SSL Reject Unauthorized</FieldLabel>
              <FieldFeedback
                id={`${id}-feedback`}
                description="Verify the server certificate against the supplied certificate authorities."
                error={error?.message}
              />
            </div>
          ) : (
            <FieldContent>
              <FieldTitle>SSL Reject Unauthorized</FieldTitle>
              <FieldFeedback
                id={`${id}-feedback`}
                description="Verify the server certificate against the supplied certificate authorities."
                error={error?.message}
              />
            </FieldContent>
          )}
          <Switch
            ref={field.ref}
            id={id}
            variant="project"
            checked={field.value ?? fallbackChecked}
            onBlur={field.onBlur}
            onCheckedChange={field.onChange}
            aria-invalid={Boolean(error)}
            aria-label="SSL Reject Unauthorized"
            aria-describedby={`${id}-feedback`}
          />
        </Field>
      )}
    />
  );
};
