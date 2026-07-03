import { Controller, useFieldArray, UseFormReturn } from "react-hook-form";
import { PlusIcon, Trash2Icon } from "lucide-react";

import {
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  IconButton,
  Input,
  Switch
} from "@app/components/v3";
import { MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS } from "@app/hooks/api/ca";

import { CaWizardForm } from "./schemas";

type Props = {
  form: UseFormReturn<CaWizardForm>;
};

export const DistributionStep = ({ form }: Props) => {
  const crlUrls = useFieldArray({ control: form.control, name: "crlDistributionPointUrls" });

  return (
    <FieldGroup>
      <Controller
        name="disableManagedCrlDistributionPointUrl"
        control={form.control}
        render={({ field: { value, onChange } }) => (
          <Field orientation="horizontal">
            <FieldContent>
              <FieldLabel>Disable managed CRL URL</FieldLabel>
              <FieldDescription>
                When enabled, the Infisical-managed CRL endpoint is not embedded in issued
                certificates. Only the custom URLs below are included.
              </FieldDescription>
            </FieldContent>
            <Switch variant="project" checked={value} onCheckedChange={onChange} />
          </Field>
        )}
      />

      <Field>
        <FieldLabel>CRL Distribution Points</FieldLabel>
        <FieldContent>
          <div className="flex flex-col gap-2">
            {crlUrls.fields.map((entry, index) => (
              <Controller
                key={entry.id}
                control={form.control}
                name={`crlDistributionPointUrls.${index}.value`}
                render={({ field, fieldState: { error } }) => (
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <Input
                        {...field}
                        placeholder="https://crl.example.com/internal-ca.crl"
                        isError={Boolean(error)}
                      />
                      <FieldError errors={[error]} />
                    </div>
                    <IconButton
                      aria-label="Remove URL"
                      variant="outline"
                      onClick={() => crlUrls.remove(index)}
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </IconButton>
                  </div>
                )}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              className="self-start"
              isDisabled={crlUrls.fields.length >= MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS}
              onClick={() => crlUrls.append({ value: "" })}
            >
              <PlusIcon className="h-4 w-4" />
              Add URL
            </Button>
          </div>
          <FieldDescription>
            Backup CRL URLs embedded in issued certificates. Up to{" "}
            {MAX_INTERNAL_CA_DISTRIBUTION_POINT_URLS}.
          </FieldDescription>
        </FieldContent>
      </Field>
    </FieldGroup>
  );
};
