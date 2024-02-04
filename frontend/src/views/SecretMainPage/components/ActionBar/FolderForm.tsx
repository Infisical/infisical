import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";

type Props = {
  onCreateFolder?: (folderName: string) => Promise<void>;
  onUpdateFolder?: (folderName: string) => Promise<void>;
  isEdit?: boolean;
  defaultFolderName?: string;
};

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(/^[a-zA-Z0-9-_]+$/, "Folder name cannot contain spaces. Only underscore and dashes")
});
type TFormData = z.infer<typeof formSchema>;

export const FolderForm = ({
  isEdit,
  defaultFolderName,
  onCreateFolder,
  onUpdateFolder
}: Props): JSX.Element => {
  const {
    control,
    reset,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: defaultFolderName
    }
  });

  const onSubmit = async ({ name }: TFormData) => {
    if (isEdit) {
      await onUpdateFolder?.(name);
    } else {
      await onCreateFolder?.(name);
    }
    reset();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Controller
        control={control}
        name="name"
        defaultValue=""
        render={({ field, fieldState: { error } }) => (
          <FormControl label="Folder Name" isError={Boolean(error)} errorText={error?.message}>
            <Input {...field} placeholder="Type your folder name" />
          </FormControl>
        )}
      />
      <div className="mt-8 flex items-center">
        <Button className="mr-4" type="submit" isDisabled={isSubmitting} isLoading={isSubmitting}>
          {isEdit ? "Save" : "Create"}
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
