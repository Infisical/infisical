import { Control, Controller } from "react-hook-form";

import { FormControl, TextArea } from "@app/components/v2";
import { UserSecretFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<UserSecretFormData>;
};

export const SecureNoteForm = ({ control }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="Content">
      <Controller
        control={control}
        name="data.content"
        rules={{ required: "Content is required" }}
        render={({ field, fieldState: { error } }) => (
          <TextArea
            {...field}
            rows={4}
            reSize="vertical"
            placeholder="Enter your secure note content"
            isError={Boolean(error)}
          />
        )}
      />
    </FormControl>
  </>
); 