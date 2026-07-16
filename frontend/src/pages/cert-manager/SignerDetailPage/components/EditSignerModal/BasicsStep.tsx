import { Controller, useForm } from "react-hook-form";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";

import { BasicsForm } from "./schemas";

export const BasicsStep = ({ form }: { form: ReturnType<typeof useForm<BasicsForm>> }) => (
  <FieldGroup>
    <Controller
      name="name"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>
            Signer name <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Input {...field} placeholder="e.g. mobile-app-prod" isError={Boolean(error)} />
            <FieldDescription>Lowercase, with dashes.</FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
    <Controller
      name="description"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>Description</FieldLabel>
          <FieldContent>
            <TextArea
              {...field}
              value={field.value ?? ""}
              placeholder="What this signer signs (e.g. iOS + Android production bundles)."
              rows={3}
              isError={Boolean(error)}
            />
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
  </FieldGroup>
);
