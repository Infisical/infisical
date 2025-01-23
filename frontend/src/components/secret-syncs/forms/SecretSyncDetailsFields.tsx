import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input, TextArea } from "@app/components/v2";

import { TSecretSyncForm } from "./schemas";

export const SecretSyncDetailsFields = () => {
  const { control } = useFormContext<TSecretSyncForm>();

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Provide a name and description for this Secret Sync.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            helperText="Must be slug-friendly"
            isError={Boolean(error)}
            errorText={error?.message}
            label="Name"
          >
            <Input value={value} onChange={onChange} placeholder="my-secret-sync" />
          </FormControl>
        )}
        control={control}
        name="name"
      />
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            isError={Boolean(error)}
            isOptional
            errorText={error?.message}
            label="Description"
          >
            <TextArea
              value={value}
              onChange={onChange}
              placeholder="Describe the purpose of this sync..."
              className="!resize-none"
              rows={4}
            />
          </FormControl>
        )}
        control={control}
        name="description"
      />
    </>
  );
};
