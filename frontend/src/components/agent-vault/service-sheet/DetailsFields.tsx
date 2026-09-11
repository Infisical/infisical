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

import { TServiceForm } from "./serviceSchema";

export const DetailsFields = () => {
  const { control } = useFormContext<TServiceForm>();

  return (
    <div className="flex flex-col gap-5">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <Input {...field} placeholder="datadog-us5" isError={Boolean(fieldState.error)} />
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
              <TextArea
                {...field}
                rows={3}
                placeholder="api.datadoghq.com"
                isError={Boolean(fieldState.error)}
              />
              <FieldDescription>
                Comma separated. Wildcards like *.example.com are allowed.
              </FieldDescription>
              <FieldError>{fieldState.error?.message}</FieldError>
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
