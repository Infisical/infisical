import { Controller, FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose, TextArea } from "@app/components/v2";
import { TPamFolder } from "@app/hooks/api/pam";
import { slugSchema } from "@app/lib/schemas";

type Props = {
  folder?: TPamFolder;
  onSubmit: (formData: FormData) => Promise<void>;
};

const formSchema = z.object({
  name: slugSchema({ min: 1, max: 64, field: "Name" }),
  description: z.string().max(512).optional()
});

type FormData = z.infer<typeof formSchema>;

export const PamFolderForm = ({ folder, onSubmit }: Props) => {
  const isUpdate = Boolean(folder);

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: folder
      ? {
          name: folder.name,
          description: folder.description || ""
        }
      : undefined
  });

  const {
    control,
    handleSubmit,
    formState: { isSubmitting, isDirty }
  } = form;

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          handleSubmit(onSubmit)(e);
        }}
      >
        <Controller
          name="name"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              helperText="Name must be slug-friendly"
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Name"
            >
              <Input autoFocus placeholder="my-folder" {...field} />
            </FormControl>
          )}
        />
        <Controller
          name="description"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <FormControl
              errorText={error?.message}
              isError={Boolean(error?.message)}
              label="Description"
              isOptional
            >
              <TextArea {...field} />
            </FormControl>
          )}
        />
        <div className="mt-6 flex items-center">
          <Button
            className="mr-4"
            size="sm"
            type="submit"
            colorSchema="secondary"
            isLoading={isSubmitting}
            isDisabled={isSubmitting || !isDirty}
          >
            {isUpdate ? "Update Folder" : "Create Folder"}
          </Button>
          <ModalClose asChild>
            <Button colorSchema="secondary" variant="plain">
              Cancel
            </Button>
          </ModalClose>
        </div>
      </form>
    </FormProvider>
  );
};
