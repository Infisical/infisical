import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Input } from "@app/components/v2";

export const SshResourceFields = () => {
  const { control } = useFormContext();

  return (
    <div className="mb-4 rounded-sm border border-mineshaft-600 bg-mineshaft-700/70 p-3">
      <div className="mt-[0.675rem] flex items-start gap-2">
        <Controller
          name="connectionDetails.host"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="flex-1"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Host"
            >
              <Input placeholder="example.com or 192.168.1.1" {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="connectionDetails.port"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              className="w-28"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Port"
            >
              <Input type="number" {...field} />
            </FormControl>
          )}
        />
      </div>
    </div>
  );
};
