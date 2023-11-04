import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, Select, SelectItem, Spinner } from "@app/components/v2";
import { useWorkspace } from "@app/context";
import { useGetProjectSecrets, useGetUserWsKey } from "@app/hooks/api";

const formSchema = z.object({
  environment: z.string().trim(),
  secretPath: z.string().trim().default("/"),
  interval: z.number().min(1),
  secrets: z.record(z.string())
});

export type TFormSchema = z.infer<typeof formSchema>;
type Props = {
  outputSchema: Record<string, unknown>;
  onSubmit: (data: TFormSchema) => void;
  onCancel: () => void;
};

export const RotationOutputForm = ({ onSubmit, onCancel, outputSchema = {} }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];
  const workspaceId = currentWorkspace?._id || "";
  const {
    control,
    handleSubmit,
    watch,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema)
  });

  const environment = watch("environment", environments?.[0]?.slug);
  const secretPath = watch("secretPath");
  const selectedSecrets = watch("secrets");

  const { data: userWsKey } = useGetUserWsKey(workspaceId);
  const { data: secrets, isLoading: isSecretsLoading } = useGetProjectSecrets({
    workspaceId,
    environment,
    secretPath,
    decryptFileKey: userWsKey!
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="environment"
        defaultValue={environments?.[0]?.slug}
        render={({ field: { value, onChange } }) => (
          <FormControl label="Environment">
            <Select
              value={value}
              onValueChange={(val) => onChange(val)}
              className="w-full border border-mineshaft-500"
              defaultValue={environments?.[0]?.slug}
              position="popper"
            >
              {environments.map((sourceEnvironment) => (
                <SelectItem
                  value={sourceEnvironment.slug}
                  key={`source-environment-${sourceEnvironment.slug}`}
                >
                  {sourceEnvironment.name}
                </SelectItem>
              ))}
            </Select>
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="secretPath"
        defaultValue="/"
        render={({ field }) => (
          <FormControl className="capitalize" label="Secret path">
            <Input {...field} />
          </FormControl>
        )}
      />
      <Controller
        control={control}
        name="interval"
        defaultValue={15}
        render={({ field }) => (
          <FormControl className="capitalize" label="Rotation Interval (Days)">
            <Input
              {...field}
              min={1}
              type="number"
              onChange={(evt) => field.onChange(parseInt(evt.target.value, 10))}
            />
          </FormControl>
        )}
      />
      <div className="flex flex-col mt-4 pt-4 mb-2 border-t border-bunker-300/30">
        <div>Mapping</div>
        <div className="text-bunker-300 text-sm">Select keys for rotated value to get saved</div>
      </div>
      {Object.keys(outputSchema).map((outputName) => (
        <Controller
          key={`provider-output-${outputName}`}
          control={control}
          name={`secrets.${outputName}`}
          render={({ field: { value, onChange } }) => (
            <FormControl className="uppercase" label={outputName.replaceAll("_", " ")} isRequired>
              <Select
                value={value}
                onValueChange={(val) => onChange(val)}
                className="w-full border border-mineshaft-500"
                position="popper"
              >
                {!isSecretsLoading &&
                  secrets
                    ?.filter(
                      ({ _id }) =>
                        value === _id || !Object.values(selectedSecrets || {}).includes(_id)
                    )
                    ?.map(({ key, _id }) => (
                      <SelectItem value={_id} key={_id}>
                        {key}
                      </SelectItem>
                    ))}
                {isSecretsLoading && (
                  <SelectItem value="Loading" isDisabled>
                    <Spinner size="xs" />
                  </SelectItem>
                )}
                {!isSecretsLoading && secrets?.length === 0 && (
                  <SelectItem value="Empty" isDisabled>
                    No secrets found
                  </SelectItem>
                )}
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
