import { Controller, useForm } from "react-hook-form";
import { yupResolver } from "@hookform/resolvers/yup";
import * as yup from "yup";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";

type Props = {
  onCreateTag: (tagName: string) => Promise<void>;
};

const createTagSchema = yup.object({
  name: yup.string().required().trim().label("Tag Name")
});
type FormData = yup.InferType<typeof createTagSchema>;

export const CreateTagModal = ({ onCreateTag }: Props): JSX.Element => {
  const {
    control,
    reset,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<FormData>({
    resolver: yupResolver(createTagSchema)
  });

  const onFormSubmit = async ({ name }: FormData) => {
    await onCreateTag(name);
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <Controller
        control={control}
        name="name"
        defaultValue=""
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Tag Name" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="Type your tag name" />
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
