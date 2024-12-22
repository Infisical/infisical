import { Control, Controller } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";
import { UserSecretFormData } from "@app/hooks/api/userSecrets/types";

type Props = {
  control: Control<UserSecretFormData>;
};

export const NameInput = ({ control }: Props) => (
  <FormControl label="Name">
    <Controller
      control={control}
      name="name"
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