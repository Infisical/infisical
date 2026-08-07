import { Controller, FieldValues, Path, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldTitle,
  Switch
} from "@app/components/v3";

type Props<TValues extends FieldValues> = {
  name?: Path<TValues>;
  id?: string;
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
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState: { error } }) => (
        <Field data-invalid={Boolean(error)} orientation="horizontal">
          {layout === "labeled" ? (
            <div className="flex flex-1 flex-col gap-0.5">
              <FieldLabel htmlFor={id}>SSL Reject Unauthorized</FieldLabel>
              <FieldDescription id={descriptionId}>
                Verify the server certificate against the supplied certificate authorities.
              </FieldDescription>
              {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
            </div>
          ) : (
            <FieldContent>
              <FieldTitle>SSL Reject Unauthorized</FieldTitle>
              <FieldDescription id={descriptionId}>
                Verify the server certificate against the supplied certificate authorities.
              </FieldDescription>
              {error?.message && <FieldError id={errorId}>{error.message}</FieldError>}
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
            aria-describedby={`${descriptionId}${error?.message ? ` ${errorId}` : ""}`}
          />
        </Field>
      )}
    />
  );
};
