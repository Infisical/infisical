import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  UnstableInput
} from "@app/components/v3";
import { gatewaysQueryKeys } from "@app/hooks/api";
import { slugSchema } from "@app/lib/schemas";

export const gatewayOptionSchema = z.object({
  id: z.string().min(1, "Gateway is required"),
  name: z.string()
});

export const genericResourceFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  gateway: gatewayOptionSchema.nullable().refine((val) => val !== null, {
    message: "Gateway is required"
  }),
  metadata: z
    .object({
      key: z.string().trim().min(1),
      value: z.string().trim().default("")
    })
    .array()
    .optional()
});

type GenericFormValues = {
  name: string;
  gateway: { id: string; name: string } | null;
};

export const GenericResourceFields = () => {
  const { data: gateways, isPending: isGatewaysLoading } = useQuery(gatewaysQueryKeys.list());

  const { control } = useFormContext<GenericFormValues>();

  return (
    <div className="flex flex-col gap-3">
      <Controller
        control={control}
        name="name"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Name</FieldLabel>
            <FieldContent>
              <UnstableInput
                {...field}
                autoFocus
                isError={Boolean(error)}
                placeholder="my-resource"
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="gateway"
        render={({ field: { value, onChange, onBlur }, fieldState: { error } }) => {
          const selectedOption =
            value && gateways ? (gateways.find((g) => g.id === value.id) ?? value) : value;

          return (
            <Field>
              <FieldLabel>Gateway</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={selectedOption}
                  onChange={onChange}
                  onBlur={onBlur}
                  options={gateways}
                  isError={Boolean(error)}
                  isLoading={isGatewaysLoading}
                  placeholder="Select a Gateway..."
                  getOptionLabel={(option) => option.name}
                  getOptionValue={(option) => option.id}
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
