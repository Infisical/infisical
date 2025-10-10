import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input, TextArea } from "@app/components/v2";

import { TSecretRotationV2Form } from "./schemas";

export const SecretRotationV2DetailsFields = () => {
  const { control } = useFormContext<TSecretRotationV2Form>();

  return (
    <>
      <p className="text-bunker-300 mb-4 text-sm">
        Provide a name and description for this Secret Rotation.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            helperText="Must be slug-friendly"
            isError={Boolean(error)}
            errorText={error?.message}
            label="Name"
          >
            <Input autoFocus value={value} onChange={onChange} placeholder="my-secret-rotation" />
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
              value={value ?? ""}
              onChange={onChange}
              placeholder="Describe the purpose of this rotation..."
              className="resize-none!"
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
