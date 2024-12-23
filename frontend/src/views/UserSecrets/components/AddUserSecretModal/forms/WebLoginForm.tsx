import { Control, Controller } from "react-hook-form";

import { FormControl } from "@app/components/v2";
import { SecretField } from "@app/components/v2/SecretField";
import { WebLoginFormData } from "@app/hooks/api/userSecrets/types";

import { NameInput } from "../NameInput";

type Props = {
  control: Control<WebLoginFormData>;
};

export const WebLoginForm = ({ control }: Props) => (
  <>
    <NameInput control={control} />
    <FormControl label="URL">
      <Controller
        control={control}
        name="data.data.url"
        render={({ field }) => (
          <SecretField {...field} placeholder="https://example.com" value={field.value || ""} />
        )}
      />
    </FormControl>
    <FormControl label="Username">
      <Controller
        control={control}
        name="data.data.username"
        rules={{ required: "Username is required" }}
        render={({ field, fieldState: { error } }) => (
          <SecretField {...field} isError={Boolean(error)} />
        )}
      />
    </FormControl>
    <FormControl label="Password">
      <Controller
        control={control}
        name="data.data.password"
        rules={{ required: "Password is required" }}
        render={({ field, fieldState: { error } }) => (
          <SecretField 
            {...field} 
            type="password"
            isError={Boolean(error)}
          />
        )}
      />
    </FormControl>
  </>
); 