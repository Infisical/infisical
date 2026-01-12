import { Controller, useFormContext } from "react-hook-form";

import { FormControl, Switch } from "@app/components/v2";

export const RequireMfaField = () => {
  const { control } = useFormContext<{
    requireMfa?: boolean | null;
  }>();

  return (
    <div className="flex h-9 w-fit items-center gap-3">
      <Controller
        control={control}
        name="requireMfa"
        defaultValue={false}
        render={({ field: { value, onChange }, fieldState: { error } }) => (
          <FormControl isError={Boolean(error)} errorText={error?.message} className="mb-0">
            <Switch
              className="ml-0 bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
              id="require-mfa"
              thumbClassName="bg-mineshaft-800"
              onCheckedChange={onChange}
              isChecked={value ?? false}
            />
          </FormControl>
        )}
      />
      <span className="text-sm">Require MFA for Access</span>
    </div>
  );
};
