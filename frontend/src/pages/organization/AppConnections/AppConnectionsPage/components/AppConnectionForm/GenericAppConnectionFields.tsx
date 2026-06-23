import { useFormContext } from "react-hook-form";
import { z } from "zod";

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  Input,
  TextArea
} from "@app/components/v3";
import { slugSchema } from "@app/lib/schemas";

export const rotationSchema = z.object({
  rotationInterval: z
    .number()
    .min(1)
    .max(365 * 2.5),
  rotateAtUtc: z.object({
    hours: z.number().min(0).max(23),
    minutes: z.number().min(0).max(59)
  })
});

export const genericAppConnectionFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256, "Description cannot exceed 256 characters").nullish(),
  gatewayId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  gatewayPoolId: z
    .string()
    .nullish()
    .transform((v) => (v === "" ? null : v)),
  isAutoRotationEnabled: z.boolean().optional(),
  rotation: rotationSchema.optional()
});

export const GenericAppConnectionsFields = () => {
  const {
    register,
    formState: { errors }
  } = useFormContext<{ name: string; description?: string | null }>();

  return (
    <>
      <Field className="mb-4">
        <FieldLabel htmlFor="app-connection-name">Name</FieldLabel>
        <Input
          id="app-connection-name"
          autoFocus
          placeholder="my-app-connection"
          isError={Boolean(errors.name?.message)}
          {...register("name")}
        />
        {!errors.name?.message && <FieldDescription>Must be slug-friendly.</FieldDescription>}
        <FieldError errors={[errors.name]} />
      </Field>
      <Field className="mb-4">
        <FieldLabel htmlFor="app-connection-description">
          Description <span className="text-muted">(optional)</span>
        </FieldLabel>
        <TextArea
          id="app-connection-description"
          className="resize-none"
          rows={2}
          placeholder="Connection description..."
          isError={Boolean(errors.description?.message)}
          {...register("description")}
        />
        <FieldError errors={[errors.description]} />
      </Field>
    </>
  );
};
