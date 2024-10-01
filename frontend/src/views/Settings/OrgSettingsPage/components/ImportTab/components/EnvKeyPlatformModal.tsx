import { useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, Input } from "@app/components/v2";
import { useImportEnvKey } from "@app/hooks/api/migration/mutations";
import { GenericDropzone } from "@app/views/SecretMainPage/components/SecretDropzone/GenericDropzone";

type Props = {
  id?: string;
  onClose: () => void;
};

const formSchema = z.object({
  encryptionKey: z.string().min(1),
  encryptedJson: z.object({
    nonce: z.string().min(1),
    data: z.string().min(1)
  })
});

type TFormData = z.infer<typeof formSchema>;

export const EnvKeyPlatformModal = ({ onClose }: Props) => {
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
    if (!data.encryptedJson) {
      setError("encryptedJson", {
        type: "required",
        message: "File is required"
      });
      return;
    }

    try {
      await importEnvKey({
        encryptedJson: data.encryptedJson,
        decryptionKey: data.encryptionKey
      });
      createNotification({
        text: "Data imported successfully.",
        type: "success"
      });

      onClose();
      reset();

      if (fileUploadRef.current) {
        fileUploadRef.current.value = "";
      }
    } catch {
      reset();
    }
  };

  const onImportFileDrop = (file?: File) => {
    const reader = new FileReader();
    if (!file) {
      createNotification({
        text: "No file selected.",
        type: "error"
      });
      return;
    }
    reader.onload = (event) => {
      if (!event?.target?.result) return;

      const droppedFile = event.target.result.toString();
      const formattedData: Record<string, string> = JSON.parse(droppedFile);
      if (
        Object.keys(formattedData).includes("nonce") &&
        Object.keys(formattedData).includes("data")
      ) {
        const data = {
          nonce: formattedData.nonce,
          data: formattedData.data
        };
        setValue("encryptedJson", data, { shouldDirty: true, shouldValidate: true });
      } else {
        setValue(
          "encryptedJson",
          {
            nonce: "",
            data: ""
          },
          { shouldDirty: true, shouldValidate: true }
        );

        if (fileUploadRef.current) {
          fileUploadRef.current.value = "";
        }
        createNotification({
          text: "Improper file format, please upload the EnvKey export.",
          type: "error"
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} autoComplete="off">
      <Controller
        control={control}
        name="encryptionKey"
        render={({ field, fieldState: { error } }) => (
          <FormControl
            label="Encryption key"
            isRequired
            errorText={error?.message}
            isError={Boolean(error)}
          >
            <Input type="password" placeholder="" {...field} />
          </FormControl>
        )}
      />

      <GenericDropzone
        ref={fileUploadRef}
        text="Select Env Key export file"
        onData={onImportFileDrop}
        isSmaller
      />

      <div className="mt-6 flex items-center space-x-4">
        <Button
          type="submit"
          isLoading={isLoading}
          isDisabled={!isDirty || isSubmitting || isLoading || !isValid}
        >
          Import data
        </Button>
        <Button variant="outline_bg" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
};
