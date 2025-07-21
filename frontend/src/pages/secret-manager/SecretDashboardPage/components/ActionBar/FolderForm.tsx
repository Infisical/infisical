import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { Button, FormControl, Input, ModalClose } from "@app/components/v2";
import { TextArea } from "@app/components/v2/TextArea/TextArea";

type Props = {
  onCreateFolder?: (folderName: string, description: string | null) => Promise<void>;
  onUpdateFolder?: (
    folderName: string,
    description: string | null,
    oldFolderName?: string,
    oldFolderDescription?: string
  ) => Promise<void>;
  isEdit?: boolean;
  defaultFolderName?: string;
  defaultDescription?: string;
  showDescriptionOverwriteWarning?: boolean;
};

const descriptionOverwriteWarningMessage =
  "Warning: Any changes made here will overwrite any custom edits in individual environment folders.";

const formSchema = z.object({
  name: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9-_]+$/,
      "Folder name can only contain letters, numbers, dashes, and underscores"
    ),
  description: z.string().optional()
});
type TFormData = z.infer<typeof formSchema>;

export const FolderForm = ({
  isEdit,
  defaultFolderName,
  defaultDescription,
  onCreateFolder,
  onUpdateFolder,
  showDescriptionOverwriteWarning = false
}: Props): JSX.Element => {
  const {
    control,
    reset,
    formState: { isSubmitting },
    handleSubmit
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: defaultFolderName,
      description: defaultDescription || ""
    }
  });

  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const handleInput = () => {
    const textarea = descriptionRef.current;
    if (textarea) {
      const lines = textarea.value.split("\n");
      const maxDescriptionLines = 10;

      if (lines.length > maxDescriptionLines) {
        textarea.value = lines.slice(0, maxDescriptionLines).join("\n");
      }
    }
  };

  const onSubmit = async ({ name, description }: TFormData) => {
    const descriptionShaped = description && description.trim() !== "" ? description : null;

    if (isEdit) {
      await onUpdateFolder?.(name, descriptionShaped, defaultFolderName, defaultDescription);
    } else {
      await onCreateFolder?.(name, descriptionShaped);
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
      <Controller
        control={control}
        name="description"
        defaultValue=""
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Folder Description"
            isError={Boolean(error)}
            tooltipText={
              showDescriptionOverwriteWarning ? descriptionOverwriteWarningMessage : undefined
            }
            isOptional
            errorText={error?.message}
            className="flex-1"
          >
            <TextArea
              placeholder="Folder description"
              {...field}
              rows={3}
              ref={descriptionRef}
              onInput={handleInput}
              className="thin-scrollbar w-full !resize-none bg-mineshaft-900"
              maxLength={255}
            />
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
