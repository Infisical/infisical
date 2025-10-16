import { Controller, useFormContext } from "react-hook-form";
import { z } from "zod";

import { FormControl, Input, TextArea } from "@app/components/v2";
import { slugSchema } from "@app/lib/schemas";

export const genericAccountFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(512).nullable().optional()
});

export const GenericAccountFields = () => {
  const { control } = useFormContext<{ name: string; description: string }>();

  return (
    <>
      <Controller
        name="name"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            helperText="Name must be slug-friendly"
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Name"
          >
            <Input autoFocus placeholder="my-account" {...field} />
          </FormControl>
        )}
      />
      <Controller
        name="description"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <FormControl
            errorText={error?.message}
            isError={Boolean(error?.message)}
            label="Description"
          >
            <TextArea {...field} />
          </FormControl>
        )}
      />
    </>
  );
};
