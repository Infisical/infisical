import { useEffect, useRef } from "react";
import { Controller, useForm } from "react-hook-form";
import { faUpload } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { createNotification } from "@app/components/notifications";
import { Button, FormControl, IconButton } from "@app/components/v2";
import { useImportEnvKey } from "@app/hooks/api/migration/mutations";

const formSchema = z.object({
  decryptionKey: z.string().min(1),
  file: z.unknown(),
  encryptedJson: z.object({
    nonce: z.string().min(1),
    data: z.string().min(1)
  })
});

type TForm = z.infer<typeof formSchema>;

export const ImportTab = () => {
  const fileUploadRef = useRef<HTMLInputElement>(null);

const { mutateAsync: importEnvKey
} = useImportEnvKey();

  const {
    handleSubmit,
    control,
    watch,
    setError,
    setValue,
    reset,
    trigger,
    formState: { isSubmitting, isValid }
  } = useForm<TForm>({
    resolver: zodResolver(formSchema),
    values: {
      decryptionKey: "",
      encryptedJson: {
        nonce: "",
        data: ""
      },
      file: undefined
    }
  });
  
  const parseJson = (src: ArrayBuffer) => {
    console.log("here")
    const file = src.toString();
    const formatedData: Record<string, string> = JSON.parse(file);
    if (Object.keys(formatedData).includes("nonce") && Object.keys(formatedData).includes("data")) {
      const data = {
        nonce: formatedData.nonce,
        data: formatedData.data
      };
      setValue("encryptedJson", data);
      trigger("encryptedJson");
      console.log(data);
    } else {
      setValue("encryptedJson", {
        nonce: "",
        data: ""
      });
      if (fileUploadRef.current) {
        fileUploadRef.current.value = "";
      }
      createNotification({
        text: "Improper file format, please upload the EnvKey export.",
        type: "error"
      });
    }
  };

  const parseFile = (file?: File) => {
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
      // parse function's argument looks like to be ArrayBuffer
      parseJson(event.target.result as ArrayBuffer);
    }
    reader.readAsText(file);
  }

  const submitExport = async (data: TForm) => {
    if (!data.encryptedJson) {
      setError("encryptedJson", {
        type: "required",
        message: "File is required"
      });
      return;
    }
    
    const res = await importEnvKey({ encryptedJson: data.encryptedJson, decryptionKey: data.decryptionKey });
    if (res.success) {
      createNotification({
        text: "Data imported successfully.",
        type: "success"
      });
      reset();
      if (fileUploadRef.current) {
        fileUploadRef.current.value = "";
      }
    } else {
      createNotification({
        text: res.message,
        type: "error"
      });
    }
  }

  const watchEncryptedJsonFile: any = watch("file");
  useEffect(() => {
    if (watchEncryptedJsonFile) {
      parseFile(watchEncryptedJsonFile?.[0]);
    }
  }, [watchEncryptedJsonFile]);

  return (
    <div className="rounded-lg border border-mineshaft-600 bg-mineshaft-900 p-6">
      <h2 className="text-lg font-medium text-white mb-4">Import from external source</h2>
      <p className="text-sm text-mineshaft-400">
        Import data from another secret manager to Infisical.
      </p>
      <div className="border-b border-mineshaft-800 my-6" />
      <h3 className="text-lg font-medium text-white mb-4">Import from EnvKey</h3>
      <div className="mb-4">
        <form onSubmit={handleSubmit(submitExport)}>
          <Controller
            render={({ field: { onChange, ...field }, fieldState: { error } }) => (
              <FormControl errorText={error?.message} isError={Boolean(error)} label="Decryption Key">
                <input
                  {...field}
                  onChange={onChange}
                  type="password"
                  className="w-full bg-mineshaft-800 text-white rounded-lg py-2 px-4"
                  placeholder="Enter decryption key"
                />
              </FormControl>
            )}
            name="decryptionKey"
            control={control}
          />
          <div className="flex justify-left">
            <Controller
              name="file"
              control={control}
              defaultValue={null}
              rules={{ required: "File is required" }}
              render={({ field, fieldState: { error } }) => (
                <FormControl errorText={error?.message} isError={Boolean(error)} label="Export file from EnvKey">
                  <>
                    <input
                      id="fileSelect"
                      className="hidden"
                      type="file"
                      accept=".envkey-archive"
                      onChange={(e) => field.onChange(e.target.files)}
                      ref={fileUploadRef}
                    />
                    <IconButton
                      className="p-10"
                      ariaLabel="upload-export"
                      colorSchema="secondary"
                      onClick={() => {
                        fileUploadRef?.current?.click();
                      }}
                    >
                      <FontAwesomeIcon icon={faUpload} size="xs" />
                    </IconButton>
                  </>
                </FormControl>
              )} />

          </div>
          <div className="mt-6">
            <Button
              colorSchema="primary"
              type="submit"
              isDisabled={!isValid}
              isLoading={isSubmitting}
            >
              Import
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
