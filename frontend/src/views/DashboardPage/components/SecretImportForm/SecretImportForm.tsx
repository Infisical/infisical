import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { Button, FormControl, Input, ModalClose, Select, SelectItem } from "@app/components/v2";

type Props = {
  onCreate: (environment: string, secretPath: string) => Promise<void>;
  environments?: Array<{ slug: string; name: string }>;
};

const formSchema = yup.object({
  environment: yup.string().required().label("Environment").trim(),
  secretPath: yup
    .string()
    .required()
    .label("Secret Path")
    .trim()
    .transform((val) =>
      typeof val === "string" && val.at(-1) === "/" && val.length > 1 ? val.slice(0, -1) : val
    )
});

type TFormData = yup.InferType<typeof formSchema>;

export const SecretImportForm = ({ onCreate, environments = [] }: Props): JSX.Element => {
  const {
    control,
    reset,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TFormData>({
    resolver: yupResolver(formSchema)
  });

  const onSubmit = async ({ environment, secretPath }: TFormData) => {
    await onCreate(environment, secretPath);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="environment"
        defaultValue={environments?.[0]?.slug}
        render={({ field: { onChange, ...field }, fieldState: { error } }) => (
          <FormControl label="Environment" errorText={error?.message} isError={Boolean(error)}>
            <Select
              defaultValue={field.value}
              {...field}
              onValueChange={(e) => onChange(e)}
              className="w-full"
            >
              {environments.map(({ name, slug }) => (
                <SelectItem value={slug} key={slug}>
                  {name}
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
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Secret Path" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} />
          </FormControl>
        )}
      />
      <div className="mt-8 flex items-center">
        <Button className="mr-4" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
          Create
        </Button>
        <ModalClose asChild>
          <Button variant="plain" colorSchema="secondary">
            Cancel
          </Button>
        </ModalClose>
      </div>
    </form>
  );
};
