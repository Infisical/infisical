import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input, TextArea } from "@app/components/v2";

import { TSecretScanningDataSourceForm } from "./schemas";

export const SecretScanningDataSourceDetailsFields = () => {
  const { control } = useFormContext<TSecretScanningDataSourceForm>();

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">
        Provide a name and description for this Data Source.
      </p>
      <Controller
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl
            helperText="Must be slug-friendly"
            isError={Boolean(error)}
            errorText={error?.message}
            label="Name"
          >
            <Input autoFocus value={value} onChange={onChange} placeholder="my-data-source" />
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
              placeholder="Provide a description for this data source..."
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
