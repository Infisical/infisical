import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import {
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  TextArea,
  UnstableInput
} from "@app/components/v3";
import { slugSchema } from "@app/lib/schemas";

export const genericAccountFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(512).nullable().optional(),
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
  }>();

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
                  placeholder="my-discovery-source"
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
    </div>
  );
};
