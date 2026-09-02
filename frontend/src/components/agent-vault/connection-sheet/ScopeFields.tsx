import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  TextArea
} from "@app/components/v3";

import { TConnectionForm } from "./connectionSchema";

export const ScopeFields = () => {
  const { control } = useFormContext<TConnectionForm>();

  return (
    <Controller
      control={control}
      name="hostPattern"
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>Hosts</FieldLabel>
          <FieldContent>
            <TextArea {...field} rows={3} placeholder="api.datadoghq.com" />
            <FieldDescription>
              Comma separated. No scheme and no path. A portless host means port 443. A wildcard
              covers exactly one leftmost label, as in *.example.com.
            </FieldDescription>
            <FieldError>{fieldState.error?.message}</FieldError>
          </FieldContent>
        </Field>
      )}
    />
  );
};
