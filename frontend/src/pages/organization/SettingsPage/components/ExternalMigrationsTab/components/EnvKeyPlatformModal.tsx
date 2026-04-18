import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  Field,
  FieldContent,
  FieldError,
  FieldLabel,
  UnstableInput
} from "@app/components/v3";
import { useImportEnvKey } from "@app/hooks/api/migration/mutations";

import { GenericDropzone } from "./GenericDropzone";

type Props = {
  id?: string;
  onClose: () => void;
};

export const EnvKeyPlatformModal = ({ onClose }: Props) => {
  const formSchema = z.object({
    encryptionKey: z.string().min(1),
    file: z.instanceof(File)
  });
  type TFormData = z.infer<typeof formSchema>;

  const fileUploadRef = useRef<HTMLInputElement>(null);

  const { mutateAsync: importEnvKey } = useImportEnvKey();

  const {
    control,
    handleSubmit,
    reset,
    setValue,
    setError,
    formState: { isLoading, isDirty, isSubmitting, isValid }
  } = useForm<TFormData>({
    resolver: zodResolver(formSchema)
  });

  const onSubmit = async (data: TFormData) => {
    if (!data.file) {
      setError("file", {
        type: "required",
        message: "File is required"
      });
      return;
    }

    await importEnvKey({
      file: data.file,
      decryptionKey: data.encryptionKey
    });
    createNotification({
      title: "Import started",
      text: "Your data is being imported. You will receive an email when the import is complete or if the import fails. This may take up to 10 minutes.",
      type: "info"
    });

    onClose();
    reset();

    if (fileUploadRef.current) {
      fileUploadRef.current.value = "";
    }
  };

  const onImportFileDrop = (file?: File) => {
    if (!file) {
      createNotification({
        text: "No file selected.",
        type: "error"
      });
      return;
    }

    setValue("file", file, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off" className="space-y-4">
      <Controller
        control={control}
        name="encryptionKey"
        render={({ field, fieldState: { error } }) => (
          <Field>
            <FieldLabel>Encryption key</FieldLabel>
            <FieldContent>
              <UnstableInput type="password" placeholder="" {...field} isError={Boolean(error)} />
            </FieldContent>
            <FieldError>{error?.message}</FieldError>
          </Field>
        )}
      />
      <GenericDropzone
        ref={fileUploadRef}
        text="Select Env Key export file"
        onData={onImportFileDrop}
        isSmaller
      />
      <div className="flex items-center gap-2 pt-2">
        <Button
          type="submit"
          variant="project"
          isPending={isLoading || isSubmitting}
          isDisabled={!isDirty || isSubmitting || isLoading || !isValid}
        >
          Import data
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
