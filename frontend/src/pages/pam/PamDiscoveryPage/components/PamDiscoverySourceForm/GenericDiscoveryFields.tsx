import { Controller, useFormContext } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  FilterableSelect,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { gatewaysQueryKeys } from "@app/hooks/api";

export const gatewayOptionSchema = z.object({
  id: z.string().min(1, "Gateway is required"),
  name: z.string()
});

export const genericDiscoveryFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  gateway: gatewayOptionSchema.nullable().refine((val) => val !== null, {
    message: "Gateway is required"
  }),
  schedule: z.string().default("manual")
});

type GenericFormValues = {
  name: string;
  gateway: { id: string; name: string } | null;
  schedule: string;
};

export const GenericDiscoveryFields = () => {
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
              <div className="relative">
                <Input
                  {...field}
                  autoFocus
                  isError={Boolean(error)}
                  placeholder="my-discovery-source"
                />
              </div>
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

      <Controller
        control={control}
        name="schedule"
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Schedule</FieldLabel>
            <FieldContent>
              <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                </SelectContent>
              </Select>
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
      />
    </div>
  );
};
