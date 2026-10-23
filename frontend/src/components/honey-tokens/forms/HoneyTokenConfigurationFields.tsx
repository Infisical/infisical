import { Controller, useFormContext } from "react-hook-form";

import { Combobox, Field, FieldContent, FieldError, FieldLabel } from "@app/components/v3";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { THoneyTokenForm } from "./schemas";

type Props = {
  environments?: ProjectEnv[];
};

export const HoneyTokenConfigurationFields = ({ environments }: Props) => {
  const { control, setValue } = useFormContext<THoneyTokenForm>();

  return (
    environments && (
      <Controller
        control={control}
        name="environment"
        render={({ field: { value }, fieldState: { error } }) => (
          <Field>
            <FieldLabel htmlFor="honey-token-environment">Environment</FieldLabel>
            <FieldContent>
              <Combobox
                id="honey-token-environment"
                value={value}
                isClearable={false}
                onValueChange={(environment) =>
                  setValue("environment", environment, {
                    shouldDirty: true,
                    shouldTouch: true,
                    shouldValidate: true
                  })
                }
                options={environments}
                placeholder="Select an environment..."
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id}
                getOptionKeywords={(option) => [option.id]}
                isError={Boolean(error)}
              />
            </FieldContent>
            {error && <FieldError>{error.message}</FieldError>}
          </Field>
        )}
      />
    )
  );
};
