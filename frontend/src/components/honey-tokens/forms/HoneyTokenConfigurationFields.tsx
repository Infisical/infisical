import { Controller, useFormContext } from "react-hook-form";

import { Field, FieldContent, FieldError, FieldLabel, FilterableSelect } from "@app/components/v3";
import { ProjectEnv } from "@app/hooks/api/projects/types";

import { THoneyTokenForm } from "./schemas";

type Props = {
  environments?: ProjectEnv[];
};

export const HoneyTokenConfigurationFields = ({ environments }: Props) => {
  const { control } = useFormContext<THoneyTokenForm>();

  return (
    <>
      <p className="mb-4 text-sm text-bunker-300">Select where to plant the honey token secrets.</p>
      {environments && (
        <Controller
          control={control}
          name="environment"
          render={({ field: { value, onChange }, fieldState: { error } }) => (
            <Field>
              <FieldLabel>Environment</FieldLabel>
              <FieldContent>
                <FilterableSelect
                  value={value}
                  onChange={onChange}
                  options={environments}
                  placeholder="Select an environment..."
                  getOptionLabel={(option) => option?.name}
                  getOptionValue={(option) => option?.id}
                  isError={Boolean(error)}
                />
              </FieldContent>
              {error && <FieldError>{error.message}</FieldError>}
            </Field>
          )}
        />
      )}
    </>
  );
};
