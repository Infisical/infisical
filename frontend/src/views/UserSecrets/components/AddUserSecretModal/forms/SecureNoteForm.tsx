import { Control, Controller } from "react-hook-form";

import { FormControl } from "@app/components/v2";
import { SecretField } from "@app/components/v2/SecretField";
import { SecureNoteFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<SecureNoteFormData>;
};

export const SecureNoteForm = ({ control }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="Content">
      <Controller
        control={control}
        name="data.data.content"
        rules={{ required: "Content is required" }}
        render={({ field, fieldState: { error } }) => (
          <SecretField
            {...field}
            placeholder="Enter your secure note content"
            isError={Boolean(error)}
          />
        )}
      />
    </FormControl>
  </>
); 