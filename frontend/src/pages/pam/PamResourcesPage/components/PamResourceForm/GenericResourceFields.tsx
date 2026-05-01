import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import { Field, FieldContent, FieldError, FieldLabel, Input } from "@app/components/v3";
import { GatewayPicker } from "@app/components/v3/platform/GatewayPicker";
import { slugSchema } from "@app/lib/schemas";

// Base schema is a ZodObject (no .refine()) so per-resource forms can .extend() it.
// The "gateway or pool is required" rule is enforced at two layers: the picker's
// isRequired prop hides the no-gateway choice, and the backend rejects rows with
// neither set. We deliberately don't refine here because the resulting ZodEffects
// can't be extended.
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
