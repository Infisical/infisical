import { Controller, DefaultValues, FieldValues, Path, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input } from "@app/components/v2";

type Props<T extends FieldValues> = {
  defaultValues: DefaultValues<T>;
  schema: z.Schema<T>;
  onSubmit: (data: T) => void;
  submitText: string;
};

const UserSecretForm = <T extends FieldValues>(props: Props<T>) => {
  const { defaultValues, schema, onSubmit, submitText } = props;

  type FormData = z.infer<typeof schema>;

  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues
  });

  const onFormSubmit = async (data: FormData) => {
    await onSubmit(data)
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      {Object.keys(defaultValues).map((key) => (
        <Controller
          key={key}
          control={control}
          name={key as Path<T>}
          render={({ field, fieldState: { error } }) => (
            <FormControl label={key} isError={Boolean(error)} errorText={error?.message}>
              <Input {...field} placeholder={key} type="text" />
            </FormControl>
          )}
        />
      ))}
      <Button
        className="mt-4"
        size="sm"
        type="submit"
        isLoading={isSubmitting}
        isDisabled={isSubmitting}
      >
        {submitText}
      </Button>
    </form>
  );
};

export default UserSecretForm