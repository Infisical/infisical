import { Control, Controller, FieldValues, Path } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";

// Generic type that ensures the form data has a name field
type FormWithName = {
  name: string;
  [key: string]: any;
};

type Props<T extends FieldValues & FormWithName> = {
  control: Control<T>;
};

export const NameInput = <T extends FieldValues & FormWithName>({ control }: Props<T>) => (
  <FormControl label="Name">
    <Controller<T>
      control={control}
      name={"name" as Path<T>}
      rules={{ required: "Name is required" }}
      render={({ field, fieldState: { error } }) => (
        <Input
          {...field}
          placeholder="Enter a name for this secret"
          isError={Boolean(error)}
        />
      )}
    />
  </FormControl>
); 