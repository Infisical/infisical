import { Controller, useFormContext } from "react-hook-form";
import { twMerge } from "tailwind-merge";
import { z } from "zod";

import { FormControl, Select, SelectItem, Switch, Tooltip } from "@app/components/v2";

export const rotateAccountFieldsSchema = z.object({
  rotationEnabled: z.boolean().default(false),
  rotationIntervalSeconds: z.number().nullable().optional()
});

export const RotateAccountFields = ({
  rotationCredentialsConfigured
}: {
  rotationCredentialsConfigured: boolean;
}) => {
  const { control, watch } = useFormContext<{
    rotationEnabled: boolean;
    rotationIntervalSeconds?: number | null;
  }>();

  const rotationEnabled = watch("rotationEnabled");

  return (
    <Tooltip
      isDisabled={rotationCredentialsConfigured}
      content="The resource which owns this account does not have rotation credentials configured."
    >
      <div
        className={twMerge(
          "flex h-9 w-fit items-center gap-3",
          !rotationCredentialsConfigured && "opacity-50"
        )}
      >
        <Controller
          control={control}
          name="rotationEnabled"
          defaultValue={false}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl isError={Boolean(error)} errorText={error?.message} className="mb-0">
              <Switch
                className="ml-0 bg-mineshaft-400/80 shadow-inner data-[state=checked]:bg-green/80"
                id="rotation-enabled"
                thumbClassName="bg-mineshaft-800"
                onCheckedChange={onChange}
                isChecked={value}
                isDisabled={!rotationCredentialsConfigured}
              />
            </FormControl>
          )}
        />
        <span className="text-sm">Rotate Credentials Every</span>

        <Controller
          name="rotationIntervalSeconds"
          control={control}
          defaultValue={2592000}
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              className="mb-0"
            >
              <Select
                value={(value || 2592000).toString()}
                onValueChange={(val) => onChange(parseInt(val, 10))}
                className="w-full border border-mineshaft-500 capitalize"
                position="popper"
                placeholder="Select an interval..."
                dropdownContainerClassName="max-w-none"
                isDisabled={!rotationEnabled || !rotationCredentialsConfigured}
                dropdownContainerStyle={{
                  width: "130px"
                }}
              >
                <SelectItem value="2592000">30 Days</SelectItem>
                <SelectItem value="604800">7 Days</SelectItem>
                <SelectItem value="259200">3 Days</SelectItem>
                <SelectItem value="86400">1 Day</SelectItem>
              </Select>
            </FormControl>
          )}
        />
      </div>
    </Tooltip>
  );
};
