import { useFormContext } from "react-hook-form";
import { z } from "zod";

import { FormControl, Input, TextArea } from "@app/components/v2";
import { slugSchema } from "@app/lib/schemas";

export const genericAppConnectionFieldsSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().trim().max(256, "Description cannot exceed 256 characters").nullish()
});

export const GenericAppConnectionsFields = () => {
  const {
    register,
    formState: { errors }
  } = useFormContext<{ name: string; description?: string | null }>();

  return (
    <>
      <FormControl
        helperText="Name must be slug-friendly"
        errorText={errors.name?.message}
        isError={Boolean(errors.name?.message)}
        label="Name"
      >
        <Input autoFocus placeholder="my-app-connection" {...register("name")} />
      </FormControl>
      <FormControl
        errorText={errors.description?.message}
        isError={Boolean(errors.description?.message)}
        label="Description"
        isOptional
      >
        <TextArea
          className="!resize-none"
          rows={1}
          placeholder="Connection description..."
          {...register("description")}
        />
      </FormControl>
    </>
  );
};
