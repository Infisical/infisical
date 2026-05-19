import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";

// No .refine() — would turn into ZodEffects and break .extend() in per-type discovery forms.
export const genericDiscoveryFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(255),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional(),
  schedule: z.string().default("manual")
});

type GenericFormValues = {
  name: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  schedule: string;
};

export const GenericDiscoveryFields = () => {
  const { control, watch, setValue } = useFormContext<GenericFormValues>();
  const gatewayId = watch("gatewayId");
  const gatewayPoolId = watch("gatewayPoolId");

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
        name="gatewayId"
        render={({ fieldState: { error } }) => (
          <Field>
            <FieldLabel>Gateway</FieldLabel>
            <FieldContent>
              <GatewayPicker
                isRequired
                variant="v3"
                placeholder="Select a Gateway..."
                value={{ gatewayId: gatewayId ?? null, gatewayPoolId: gatewayPoolId ?? null }}
                onChange={({ gatewayId: newGwId, gatewayPoolId: newPoolId }) => {
                  setValue("gatewayId", newGwId, { shouldDirty: true, shouldValidate: true });
                  setValue("gatewayPoolId", newPoolId, {
                    shouldDirty: true,
                    shouldValidate: true
                  });
                }}
              />
              <FieldError errors={[error]} />
            </FieldContent>
          </Field>
        )}
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
