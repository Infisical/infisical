import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  TextArea,
  UnstableInput
} from "@app/components/v3";
import { useProject } from "@app/context";
import { useListPamAccountPolicies } from "@app/hooks/api/pam";
import { slugSchema } from "@app/lib/schemas";

export const genericAccountFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(512).nullable().optional(),
  policyId: z.string().uuid().nullable().optional(),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().default("")
    })
    .array()
    .optional()
});

export const GenericAccountFields = () => {
  const { control } = useFormContext<{
    name: string;
    description: string;
    policyId?: string | null;
  }>();
  const { projectId } = useProject();
  const { data: policies, isPending: isPoliciesLoading } = useListPamAccountPolicies(projectId);

  const policyOptions = [
    { label: "None", value: "" },
    ...(policies?.map((p) => ({ label: p.name, value: p.id })) ?? [])
  ];

  return (
    <div className="flex flex-col gap-3">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <div className="relative">
                <UnstableInput
                  {...field}
                  autoFocus
                  isError={Boolean(error)}
                  placeholder="my-account-name"
                />
              </div>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="description"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Description</FieldLabel>
            <FieldContent>
              <TextArea {...field} className="max-h-32" />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        name="policyId"
        control={control}
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => {
          const selectedOption =
            policyOptions.find((o) => o.value === (value ?? "")) ?? policyOptions[0];

          return (
            <Field>
              <FieldLabel>Account Policy</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={selectedOption}
                  onChange={(opt) => {
                    const selected = opt as { value: string } | null;
                    onChange(selected?.value || null);
                  }}
                  onBlur={onBlur}
                  options={policyOptions}
                  isError={Boolean(error)}
                  isLoading={isPoliciesLoading}
                  placeholder="Select a policy..."
                  getOptionLabel={(option) => option.label}
                  getOptionValue={(option) => option.value}
                />
                <FieldError errors={[error]} />
              </FieldContent>
            </Field>
          );
        }}
      />
    </div>
  );
};
