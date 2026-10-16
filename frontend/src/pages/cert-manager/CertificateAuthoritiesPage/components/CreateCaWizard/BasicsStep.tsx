import { Controller, UseFormReturn, useWatch } from "react-hook-form";
import slugify from "@sindresorhus/slugify";

import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { InternalCaType } from "@app/hooks/api/ca/enums";

import { CaWizardForm } from "./schemas";

type Props = {
  form: UseFormReturn<CaWizardForm>;
};

export const BasicsStep = ({ form }: Props) => {
  const [type, commonName] = useWatch({ control: form.control, name: ["type", "commonName"] });
  const commonNameSlug = slugify(commonName ?? "", { lowercase: true, decamelize: false });
  const suggestedName = (
    commonNameSlug.split("-").includes(type)
      ? commonNameSlug
      : [type, commonNameSlug || "ca"].join("-")
  )
    .slice(0, 64)
    .replace(/-+$/, "");

  return (
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
              <Input
                {...field}
                placeholder="my-internal-ca"
                suggestedValue={suggestedName}
                isError={Boolean(error)}
                autoComplete="off"
                name="certificate-authority-name"
              />
              <FieldDescription>A unique slug used to reference this CA.</FieldDescription>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="type"
        control={form.control}
        render={({ field }) => (
          <Field>
            <FieldLabel>
              CA Type <span className="text-danger">*</span>
            </FieldLabel>
            <FieldContent>
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value={InternalCaType.ROOT}>Root</SelectItem>
                  <SelectItem value={InternalCaType.INTERMEDIATE}>Intermediate</SelectItem>
                </SelectContent>
              </Select>
              <FieldDescription>
                {field.value === InternalCaType.ROOT
                  ? "Self-signed and active immediately."
                  : "Created pending a certificate; generate its CSR and have a parent CA sign it."}
              </FieldDescription>
            </FieldContent>
          </Field>
        )}
      />
    </FieldGroup>
  );
};
