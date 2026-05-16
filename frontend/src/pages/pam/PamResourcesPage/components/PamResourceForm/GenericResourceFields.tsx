import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import { Field, FieldContent, FieldError, FieldLabel, Input } from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { slugSchema } from "@app/lib/schemas";

// No .refine() — would turn into ZodEffects and break .extend() in per-resource forms.
export const genericResourceFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  gatewayId: z.string().nullable().optional(),
  gatewayPoolId: z.string().nullable().optional(),
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
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
};

export const GenericResourceFields = () => {
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
              <Input {...field} autoFocus isError={Boolean(error)} placeholder="my-resource" />
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
    </div>
  );
};
