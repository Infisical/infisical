import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Select, SelectItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetProjectSecrets, useGetUserWsKey } from "@app/hooks/api";

const formSchema = z.record(z.string());

export type TFormSchema = z.infer<typeof formSchema>;
type Props = {
  environment: string;
  secretPath: string;
  outputSchema: Record<string, unknown>;
  onSubmit: (data: TFormSchema) => void;
  onCancel: () => void;
};

export const RotationOutputForm = ({
  onSubmit,
  onCancel,
  environment,
  secretPath,
  outputSchema = {}
}: Props) => {
  const { currentWorkspace } = useWorkspace();
  const workspaceId = currentWorkspace?._id || "";
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema)
  });

  const { data: userWsKey } = useGetUserWsKey(workspaceId);
  const { data: secrets } = useGetProjectSecrets({
    workspaceId,
    environment,
    secretPath,
    decryptFileKey: userWsKey!
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      {Object.keys(outputSchema).map((outputName) => (
        <Controller
          key={`provider-output-${outputName}`}
          control={control}
          name={outputName}
          render={({ field: { value, onChange } }) => (
            <FormControl className="uppercase" label={outputName.replaceAll("_", " ")} isRequired>
              <Select
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
              >
                {secrets?.map(({ key, _id }) => (
                  <SelectItem value={_id} key={_id}>
                    {key}
                  </SelectItem>
                ))}
              </Select>
            </FormControl>
          )}
        />
      ))}
      <div className="mt-8 flex items-center space-x-4">
        <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
          Submit
        </Button>
        <Button onClick={onCancel} colorSchema="secondary" variant="plain">
          Cancel
        </Button>
      </div>
    </form>
  );
};
