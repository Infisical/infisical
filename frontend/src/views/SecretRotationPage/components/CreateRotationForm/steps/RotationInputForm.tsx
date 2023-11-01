import { Controller, useForm } from "react-hook-form";
import { faQuestionCircle } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, FormLabel, SecretInput, Tooltip } from "@app/components/v2";

type Props = {
  onSubmit: (data: Record<string, string>) => void;
  onCancel: () => void;
  inputSchema: {
    properties: Record<string, { type: string; desc?: string; default?: string }>;
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
              key={`provider-input-${inputName}`}
              label={
                <div className="flex items-center space-x-2">
                  <FormLabel className="uppercase mb-0" label={inputName.replaceAll("_", " ")} />
                  {Boolean(inputSchema.properties[inputName]?.desc) && (
                    <Tooltip
                      className="max-w-xs"
                      content={inputSchema.properties[inputName]?.desc}
                      position="right"
                    >
                      <FontAwesomeIcon
                        icon={faQuestionCircle}
                        size="xs"
                        className="text-bunker-300"
                      />
                    </Tooltip>
                  )}
                </div>
              }
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
