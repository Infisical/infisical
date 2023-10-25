import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, Select, SelectItem } from "@app/components/v2";
import { useWorkspace } from "@app/context";

const formSchema = z.object({
  environment: z.string().trim(),
  secretPath: z.string().trim().default("/"),
  interval: z.number()
});

export type TFormSchema = z.infer<typeof formSchema>;
type Props = {
  onSubmit: (data: TFormSchema) => void;
  onCancel: () => void;
};

export const GeneralDetailsForm = ({ onSubmit, onCancel }: Props) => {
  const { currentWorkspace } = useWorkspace();
  const environments = currentWorkspace?.environments || [];
  const {
    control,
    handleSubmit,
    formState: { isSubmitting }
  } = useForm<TFormSchema>({
    resolver: zodResolver(formSchema)
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
