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

type Props = { form: ReturnType<typeof useForm<BasicsForm>> };

export const BasicsStep = ({ form }: Props) => (
  <FieldGroup>
    <Controller
      name="name"
      control={form.control}
      render={({ field, fieldState: { error } }) => (
        <Field>
          <FieldLabel>
            Name <span className="text-danger">*</span>
          </FieldLabel>
          <FieldContent>
            <Input {...field} placeholder="fortanix-prod" isError={Boolean(error)} />
            <FieldDescription>
              A descriptive name so you can identify this connector later. Lowercase letters,
              numbers, and dashes.
            </FieldDescription>
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
              placeholder="What this HSM is used for (e.g. production environment)."
              rows={3}
              isError={Boolean(error)}
            />
            <FieldDescription>Optional. Context for your team.</FieldDescription>
            <FieldError errors={[error]} />
          </FieldContent>
        </Field>
      )}
    />
  </FieldGroup>
);
