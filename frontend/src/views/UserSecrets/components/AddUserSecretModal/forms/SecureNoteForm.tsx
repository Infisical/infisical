import { Control, Controller } from "react-hook-form";

import { FormControl } from "@app/components/v2";
import { HideableField } from "@app/components/v2/HideableField";
import { SecureNoteFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<SecureNoteFormData>;
  isEditing?: boolean;
};

export const SecureNoteForm = ({ control, isEditing = false }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="Content">
      <Controller
        control={control}
        name="data.data.content"
        rules={{ required: "Content is required" }}
        render={({ field, fieldState: { error } }) => (
          <HideableField
            {...field}
            placeholder="Enter your secure note content"
            isError={Boolean(error)}
            isSecret={isEditing}
          />
        )}
      />
    </FormControl>
  </>
); 