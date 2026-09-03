import { Controller, useFormContext } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { TConnectionForm } from "./connectionSchema";

export const DetailsFields = () => {
  const { control } = useFormContext<TConnectionForm>();

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="datadog-us5" />
              <FieldDescription>Lowercase letters, numbers and hyphens.</FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />

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
    </div>
  );
};
