import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import { FormControl, Input, TextArea } from "@app/components/v2";
import { slugSchema } from "@app/lib/schemas";

export const genericAccountFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(512).nullable().optional()
});

export const GenericAccountFields = () => {
  const {
    formState: { errors },
    control
  } = useFormContext<{ name: string; description: string }>();

  return (
    <>
      <Controller
        name="name"
        control={control}
        render={({ field }) => (
          <FormControl
            helperText="Name must be slug-friendly"
            errorText={errors.name?.message}
            isError={Boolean(errors.name?.message)}
            label="Name"
          >
            <Input autoFocus placeholder="my-account" {...field} />
          </FormControl>
        )}
      />
      <Controller
        name="description"
        control={control}
        render={({ field }) => (
          <FormControl
            errorText={errors.name?.message}
            isError={Boolean(errors.name?.message)}
            label="Description"
          >
            <TextArea {...field} />
          </FormControl>
        )}
      />
    </>
  );
};
