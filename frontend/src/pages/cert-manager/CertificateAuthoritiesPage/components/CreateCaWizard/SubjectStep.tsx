import { Controller, UseFormReturn } from "react-hook-form";

import { Field, FieldContent, FieldError, FieldGroup, FieldLabel, Input } from "@app/components/v3";

import { CaWizardForm } from "./schemas";

type Props = {
  form: UseFormReturn<CaWizardForm>;
};

const SUBJECT_FIELDS: { name: keyof CaWizardForm; label: string; placeholder: string }[] = [
  { name: "commonName", label: "Common Name (CN)", placeholder: "Example CA" },
  { name: "organization", label: "Organization (O)", placeholder: "Acme Corp" },
  { name: "ou", label: "Organization Unit (OU)", placeholder: "Engineering" },
  { name: "country", label: "Country (C)", placeholder: "US" },
  { name: "province", label: "State or Province (ST)", placeholder: "California" },
  { name: "locality", label: "Locality (L)", placeholder: "San Francisco" }
];

export const SubjectStep = ({ form }: Props) => {
  return (
    <FieldGroup>
      {SUBJECT_FIELDS.map((subjectField) => (
        <Controller
          key={subjectField.name}
          name={subjectField.name}
          control={form.control}
          render={({ field, fieldState: { error } }) => (
            <Field>
              <FieldLabel>{subjectField.label}</FieldLabel>
              <FieldContent>
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  placeholder={subjectField.placeholder}
                  isError={Boolean(error)}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          )}
        />
      ))}
    </FieldGroup>
  );
};
