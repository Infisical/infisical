import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldError, FieldLabel, Switch } from "@app/components/v3";

export const RequireMfaField = () => {
  const { control } = useFormContext<{
    requireMfa?: boolean | null;
  }>();

  return (
    <Controller
      control={control}
      name="requireMfa"
      defaultValue={false}
      render={({ field, fieldState: { error } }) => (
        <Field orientation="horizontal">
          <FieldLabel>Require MFA for Access</FieldLabel>
          <Switch
            variant="project"
            checked={field.value || false}
            onCheckedChange={field.onChange}
          />
          <FieldError errors={[error]} />
        </Field>
      )}
    />
  );
};
