import { Control, Controller } from "react-hook-form";

import { FormControl } from "@app/components/v2";
import { HideableField } from "@app/components/v2/HideableField";
import { WebLoginFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<WebLoginFormData>;
  isEditing?: boolean;
};

export const WebLoginForm = ({ control, isEditing = false }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="URL">
      <Controller
        control={control}
        name="data.data.url"
        render={({ field }) => (
          <HideableField 
            {...field} 
            placeholder="https://example.com"
            isSecret={false}
            value={field.value || ""}
          />
        )}
      />
    </FormControl>
    <FormControl label="Username">
      <Controller
        control={control}
        name="data.data.username"
        rules={{ required: "Username is required" }}
        render={({ field, fieldState: { error } }) => (
          <HideableField 
            {...field} 
            isError={Boolean(error)}
            isSecret={isEditing}
          />
        )}
      />
    </FormControl>
    <FormControl label="Password">
      <Controller
        control={control}
        name="data.data.password"
        rules={{ required: "Password is required" }}
        render={({ field, fieldState: { error } }) => (
          <HideableField 
            {...field} 
            isError={Boolean(error)}
            isSecret={isEditing}
          />
        )}
      />
    </FormControl>
  </>
); 