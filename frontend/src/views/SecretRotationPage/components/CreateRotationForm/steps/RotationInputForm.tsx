import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, SecretInput } from "@app/components/v2";

type Props = {
  onSubmit: (data: Record<string, string>) => void;
  onCancel: () => void;
  inputSchema: {
    properties: Record<string, { type: string; helperText?: string; default?: string }>;
    required: string[];
  };
};

const formSchema = z.record(z.string().trim().optional());

export const RotationInputForm = ({ onSubmit, onCancel, inputSchema }: Props) => {
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<Record<string, string>>({
    resolver: zodResolver(formSchema)
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {Object.keys(inputSchema.properties || {}).map((inputName) => (
        <Controller
          control={control}
          name={inputName}
          key={`provider-input-${inputName}`}
          defaultValue={inputSchema.properties[inputName]?.default}
          render={({ field }) => (
            <FormControl
              className="capitalize"
              key={`provider-input-${inputName}`}
              label={inputName.replaceAll("_", " ")}
              helperText={inputSchema.properties[inputName]?.helperText}
            >
              <SecretInput
                {...field}
                containerClassName="normal-case text-bunker-300 hover:border-primary-400/50 border border-mineshaft-600 bg-bunker-800  px-2 py-1.5"
                required={inputSchema.required.includes(inputName)}
              />
            </FormControl>
          )}
        />
      ))}
      <div className="mt-8 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
          Next
        </Button>
        <Button onClick={onCancel} colorSchema="secondary" variant="plain">
          Cancel
        </Button>
      </div>
    </form>
  );
};
